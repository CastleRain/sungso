"""Reproducible public-data experiments; no personal finance or commute data.

Run: python services/homehunt/research/v2/pipeline.py --help
Every historical cache experiment is explicitly reconstructed, never a vintage
backtest. Published forecasts are withheld unless out-of-time gates pass.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.metrics import (accuracy_score, balanced_accuracy_score,
                             confusion_matrix, f1_score, mean_absolute_error,
                             mean_squared_error, precision_recall_fscore_support)
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from publish import promote

ROOT = Path(__file__).resolve().parents[4]
SERVICE = ROOT / "services/homehunt"
V2 = ROOT / "apps/homehunt-v2"
RESEARCH_LOCAL = SERVICE / ".local/research/v2"
MODEL_VERSION = "direction-6m-1.1.0"
CLASSES = ["down", "flat", "up"]
SOURCE_URLS = {
    "molit": "https://www.data.go.kr/data/15126469/openapi.do",
    "bok": "https://ecos.bok.or.kr/",
    "catalog": "https://www.reb.or.kr/",
    "reb": "https://www.reb.or.kr/r-one/portal/openapi/openApiDevPage.do",
    "supply": "https://stat.molit.go.kr/portal/cate/statMetaView.do?hRsId=32",
    "kosis": "https://kosis.kr/openapi/",
    "auction": "https://www.courtauction.go.kr/",
}
FOCUS = {
    "영통·망포": ("41117", ["영통동", "망포동"]),
    "구성·마북": ("41463", ["마북동", "언남동", "청덕동"]),
    "태전·고산": ("41610", ["태전동", "고산동"]),
    "동탄2": ("41590", ["청계동", "목동", "산척동", "영천동", "장지동", "신동", "오산동"]),
    "세교": ("41370", ["금암동", "수청동", "세교동", "가수동", "궐동"]),
    "분당": ("41135", []),
    "수지": ("41465", []),
}
FEATURES = {
    "A": ["momentum3", "momentum6", "momentum12", "volatility12"],
    "B": ["volume3", "volumeChange6", "activeMonthRatio12", "priceSpread12", "baseRate", "mortgageRate", "listingCount", "listingChange6", "askDealGap", "dsrLimit", "ltvLimit"],
    "C": ["age", "households", "areaM2", "stationWalkMinutes", "transferStation", "lineCount", "businessAccessMinutes"],
    "D": ["rentRatio", "rentMomentum6", "rentVolume3", "futureMoveIn", "unsold", "completedUnsold"],
    "E": ["auctionNew", "auctionOngoing", "auctionSaleRatio", "auctionPriceRatio", "auctionFailed", "auctionBidders"],
}


def month(value):
    return pd.Period(str(value)[:7], freq="M")


def month_end(value):
    return month(value).end_time.date().isoformat()


def valid_publication(value):
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}(?:T.*)?", value):
        return False
    try:
        datetime.fromisoformat(value[:10])
        return True
    except ValueError:
        return False


def normalize_name(value):
    return re.sub(r"[\s\W_]", "", str(value or "")).replace("레미안", "래미안").casefold()


def write_json(path, value):
    """Deterministic, atomic artifact output; never serialize provider secrets."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    content = json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n"
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(content, encoding="utf-8")
    temporary.replace(path)


def digest_file(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def direction(change, threshold=3):
    return "up" if change > threshold else "down" if change < -threshold else "flat"


def build_catalog_index(catalog):
    index = defaultdict(list)
    for item in catalog:
        for name in {item.get("name"), *(item.get("aliases") or [])}:
            if name:
                index[(str(item["regionCode"]), normalize_name(item.get("dong")), normalize_name(name))].append(item)
    return index


def match_catalog(record, index):
    region = str(record.get("regionCode"))
    # Hwaseong introduced four districts on 2026-02-01. The existing REB
    # catalog uses the former city code; address/name still must match exactly.
    if region in {"41591", "41593", "41595", "41597"}:
        region = "41590"
    matches = index.get((region, normalize_name(record.get("dong")), normalize_name(record.get("apartmentName"))), [])
    unique = {item["catalogId"]: item for item in matches}
    if len(unique) == 1:
        return next(iter(unique.values()))
    # Name alone never joins identically named developments across addresses.
    if len(unique) > 1 and record.get("jibun"):
        selected = [item for item in unique.values() if str(item.get("address", "")).endswith(" " + str(record["jibun"]))]
        if len(selected) == 1:
            return selected[0]
    return None


def normalize_record(raw, collected_at, catalog_index, strict=False):
    cancellation = str(raw.get("cdealDay") or raw.get("cancelledAt") or "").strip()
    flag = str(raw.get("cdealType") or "").strip().upper()
    if raw.get("cancelled") or cancellation or flag not in ("", "N", "0", "FALSE"):
        return None, "cancelled_latest_snapshot"
    try:
        price = float(str(raw.get("amountManWon", raw.get("dealAmount", 0))).replace(",", ""))
        area = float(raw.get("areaM2", raw.get("excluUseAr", 0)))
        observed = month(raw.get("month"))
    except (TypeError, ValueError):
        return None, "invalid"
    if price <= 0 or area <= 0 or not math.isfinite(price + area):
        return None, "invalid"
    deal = raw.get("dealType", "매매")
    if deal not in ("매매", "전세"):
        return None, "monthly_rent_not_deposit_series"
    found = match_catalog(raw, catalog_index)
    if not found:
        return None, "catalog_ambiguous_or_unmatched"
    # Exact decimal area is preserved. No 59/60/85 area buckets in training.
    area_key = format(area, ".8f").rstrip("0").rstrip(".")
    available = raw.get("publishedAt") or raw.get("availableAt")
    if strict and (not available or not raw.get("vintageVerified")):
        return None, "historical_publication_not_proven"
    if available and (not valid_publication(available) or str(available)[:10] < observed.start_time.date().isoformat()):
        return None, "invalid_publication_date"
    assumed = month_end(observed + 2)
    available = str(available)[:10] if available else assumed
    return {
        "id": raw.get("id"), "catalogId": found["catalogId"],
        "seriesId": f"{found['catalogId']}|{area_key}", "aptName": found["name"],
        "regionCode": str(found["regionCode"]), "regionName": found.get("regionName", ""),
        "dong": found.get("dong", ""), "areaM2": area, "month": observed,
        "price": price, "dealType": deal, "floor": raw.get("floor"),
        "builtYear": found.get("builtYear"), "households": found.get("households"),
        "availableAt": available, "collectedAt": str(collected_at),
        "verificationLevel": "strict" if strict else "reconstructed",
    }, None


def select_targets(catalog, covered_regions, target_count=60):
    """Stratify catalog only, not later prices or model performance."""
    groups = {}
    for label, (region, dongs) in FOCUS.items():
        groups[label] = [item for item in catalog if str(item["regionCode"]) == region and (not dongs or item.get("dong") in dongs)]
    for region in sorted(covered_regions):
        if region not in {value[0] for value in FOCUS.values()}:
            groups[region] = [item for item in catalog if str(item["regionCode"]) == region]
    chosen, selected = [], set()
    per_group = max(3, target_count // max(1, len(groups)))
    for label, items in groups.items():
        eligible = [item for item in items if item.get("households", 0) >= 300 and item.get("builtYear")]
        # Round-robin year and size strata, deterministic hash breaks ties.
        bins = defaultdict(list)
        for item in eligible:
            strata = ("old" if item["builtYear"] < 2006 else "mid" if item["builtYear"] < 2016 else "new", "large" if item["households"] >= 1000 else "medium")
            bins[strata].append(item)
        for items_in_bin in bins.values():
            items_in_bin.sort(key=lambda item: hashlib.sha256(item["catalogId"].encode()).hexdigest())
        count = 0
        while count < per_group and bins:
            for key in sorted(list(bins)):
                if count >= per_group:
                    break
                item = bins[key].pop(0)
                if item["catalogId"] not in selected:
                    chosen.append({**item, "analysisGroup": label})
                    selected.add(item["catalogId"])
                    count += 1
                if not bins[key]:
                    del bins[key]
    remaining = [item for items in groups.values() for item in items
                 if item["catalogId"] not in selected and item.get("households", 0) >= 300
                 and item.get("builtYear")]
    remaining.sort(key=lambda item: hashlib.sha256(item["catalogId"].encode()).hexdigest())
    for item in remaining:
        if len(chosen) >= target_count:
            break
        if item["catalogId"] not in selected:
            chosen.append({**item, "analysisGroup": next(label for label, values in groups.items() if any(value["catalogId"] == item["catalogId"] for value in values))})
            selected.add(item["catalogId"])
    # At most 60 chosen prospectively; lack of trades stays an exclusion.
    return chosen[:target_count]


def load_data(cache_dir, research_raw, catalog, strict=False):
    index = build_catalog_index(catalog)
    files = list(Path(cache_dir).glob("*.json")) + list(Path(research_raw).glob("*.json"))
    rows, exclusions, sources, covered_regions = [], defaultdict(int), [], set()
    # Own research snapshots replace old cache files for a given region-month-type.
    by_request = {}
    for path in files:
        try:
            body = json.loads(path.read_text(encoding="utf-8"))
            key = (str(body.get("lawdCd", "")), str(body.get("dealYmd", "")), body.get("type"))
            if len(key[0]) != 5 or len(key[1]) != 6:
                continue
            by_request[key] = (path, body)
        except (ValueError, OSError):
            exclusions["unreadable_file"] += 1
    seen = set()
    for key, (path, body) in by_request.items():
        if body.get("partial") or body.get("complete") is False:
            exclusions["incomplete_month"] += 1
            continue
        covered_regions.add(key[0])
        updated = body.get("updatedAt", body.get("collectedAt", ""))
        sources.append({"regionCode": key[0], "month": key[1][:4] + "-" + key[1][4:], "type": key[2], "collectedAt": updated, "sha256": digest_file(path)})
        for raw in body.get("records", []):
            row, why = normalize_record(raw, updated, index, strict)
            if why:
                exclusions[why] += 1
                continue
            # Identical repeated caches are removed only by provider/record id.
            signature = (row["regionCode"], str(row["month"]), row["dealType"], row["id"])
            if row["id"] and signature in seen:
                exclusions["duplicate_id"] += 1
                continue
            seen.add(signature)
            rows.append(row)
    return rows, dict(exclusions), sources, covered_regions


def feature_observations(path, strict=False):
    if not Path(path).exists():
        return []
    frame = pd.read_csv(path, dtype={"regionCode": str, "catalogId": str})
    required = {"feature", "value", "observedMonth", "publishedAt", "sourceUrl"}
    if not required.issubset(frame.columns):
        raise ValueError("Official feature CSV requires feature,value,observedMonth,publishedAt,sourceUrl")
    rows = []
    for item in frame.to_dict("records"):
        if not valid_publication(item.get("publishedAt")):
            continue
        if strict and item.get("verificationLevel") != "strict":
            continue
        item["publishedAt"] = str(item["publishedAt"])[:10]
        item["observedMonth"] = month(item["observedMonth"])
        if month(item["publishedAt"]) < item["observedMonth"]:
            continue
        rows.append(item)
    return rows


def eligible_observation(observations, feature, origin, region, catalog_id):
    cutoff = month_end(origin)
    matches = [item for item in observations if item["feature"] == feature
               and valid_publication(item["publishedAt"])
               and item["publishedAt"] <= cutoff and item["observedMonth"] <= origin
               and (not item.get("regionCode") or pd.isna(item["regionCode"]) or str(item["regionCode"]) == region)
               and (not item.get("catalogId") or pd.isna(item["catalogId"]) or str(item["catalogId"]) == catalog_id)
               and (not item.get("validFrom") or pd.isna(item["validFrom"]) or str(item["validFrom"])[:10] <= cutoff)
               and (not item.get("validTo") or pd.isna(item["validTo"]) or cutoff <= str(item["validTo"])[:10])]
    if not matches:
        return np.nan
    return float(max(matches, key=lambda item: (item["observedMonth"], item["publishedAt"]))["value"])


def window_stats(frame, end, months=3, minimum=3, cutoff=None):
    chosen = frame[(frame["month"] >= end - months + 1) & (frame["month"] <= end)]
    if cutoff:
        chosen = chosen[chosen["availableAt"] <= cutoff]
    return (float(chosen["price"].mean()) if len(chosen) >= minimum else np.nan, len(chosen))


def build_panel(records, targets, as_of, observations=(), strict=False):
    if not records:
        return pd.DataFrame(), {"no_records": len(targets)}
    frame = pd.DataFrame(records)
    selected = {item["catalogId"] for item in targets}
    frame = frame[frame["catalogId"].isin(selected)]
    as_of = month(as_of)
    rows, exclusions = [], defaultdict(int)
    sales = frame[frame["dealType"] == "매매"]
    rents = {key: value for key, value in frame[frame["dealType"] == "전세"].groupby("seriesId")}
    for series_id, all_sale in sales.groupby("seriesId"):
        metadata = all_sale.iloc[0].to_dict()
        first = all_sale["month"].min()
        for origin in pd.period_range(first + 14, as_of, freq="M"):
            cutoff = month_end(origin)
            reference_end = origin - 2
            history = all_sale[(all_sale["month"] <= reference_end) & (all_sale["availableAt"] <= cutoff)]
            reference_price, n_reference = window_stats(history, reference_end)
            if not np.isfinite(reference_price):
                exclusions["reference_under_3_trades"] += 1
                continue
            last12 = history[history["month"] >= reference_end - 11]
            if last12["month"].nunique() < 6:
                exclusions["under_6_active_months"] += 1
                continue
            prices = {}
            for lag in (3, 6, 12):
                prices[lag], _ = window_stats(history, reference_end - lag)
            if not np.isfinite(prices[12]):
                exclusions["insufficient_trend_history"] += 1
                continue
            monthly = last12.groupby("month")["price"].mean()
            returns = monthly.pct_change(fill_method=None).dropna()
            _, volume6 = window_stats(history, reference_end - 6)
            latest_rent = rents.get(series_id, pd.DataFrame(columns=frame.columns))
            rent_price, rent_n = window_stats(latest_rent, reference_end, cutoff=cutoff)
            previous_rent, _ = window_stats(latest_rent, reference_end - 6, cutoff=cutoff)
            label_end = origin + 6
            label_available = month_end(label_end + 2)
            future_price, future_count = window_stats(all_sale, label_end, cutoff=label_available)
            if strict and label_available > month_end(as_of):
                future_price = np.nan
            row = {
                "seriesId": series_id, "catalogId": metadata["catalogId"],
                "aptName": metadata["aptName"], "regionCode": metadata["regionCode"],
                "regionName": metadata["regionName"], "areaM2": metadata["areaM2"],
                "origin": origin, "targetMonth": label_end, "labelAvailableMonth": label_end + 2,
                "referenceMonth": reference_end, "referencePrice": reference_price,
                "sampleCount": n_reference, "historyMonths": history["month"].nunique(),
                "dataCheckedAt": min((str(value) for value in history[history["month"] >= reference_end - 2]["collectedAt"] if str(value)), default=None),
                "targetPrice": future_price, "targetCount": future_count,
                "targetChange": (future_price / reference_price - 1) * 100 if np.isfinite(future_price) else np.nan,
                **{f"momentum{lag}": (reference_price / value - 1) * 100 if np.isfinite(value) else np.nan for lag, value in prices.items()},
                "volatility12": float(returns.std()) * 100 if len(returns) > 1 else np.nan,
                "volume3": n_reference, "volumeChange6": (n_reference / volume6 - 1) * 100 if volume6 else np.nan,
                "activeMonthRatio12": last12["month"].nunique() / 12,
                "priceSpread12": float(last12["price"].std() / last12["price"].mean()),
                "age": origin.year - metadata["builtYear"] if metadata.get("builtYear") else np.nan,
                "households": eligible_observation([item for item in observations if item.get("verificationLevel") == "strict"], "households", origin, metadata["regionCode"], metadata["catalogId"]) if strict else metadata.get("households") or np.nan,
                "rentRatio": rent_price / reference_price if np.isfinite(rent_price) else np.nan,
                "rentMomentum6": (rent_price / previous_rent - 1) * 100 if np.isfinite(rent_price) and np.isfinite(previous_rent) else np.nan,
                "rentVolume3": rent_n if np.isfinite(rent_price) else np.nan,
            }
            for feature in [value for features in FEATURES.values() for value in features]:
                if feature not in row:
                    row[feature] = eligible_observation(observations, feature, origin, row["regionCode"], row["catalogId"])
            rows.append(row)
    return pd.DataFrame(rows), dict(exclusions)


def purged_training(panel, origin, excluded_region=None, excluded_catalog=None):
    train = panel[(panel["origin"] < origin) & (panel["labelAvailableMonth"] <= origin) & panel["targetChange"].notna()].copy()
    if excluded_region:
        train = train[train["regionCode"] != excluded_region]
    if excluded_catalog:
        train = train[train["catalogId"] != excluded_catalog]
    return train


def usable_features(train, requested):
    return [feature for feature in requested if feature in train and train[feature].notna().sum() >= 30]


def fit_pair(train, features, kind="linear", threshold=3):
    if len(train) < 80 or train["origin"].nunique() < 4:
        return None
    features = usable_features(train, features)
    if not features:
        return None
    labels = train["targetChange"].map(lambda value: direction(value, threshold))
    if labels.nunique() < 2:
        return None
    # Temporal calibration uses labels already mature at the forecast origin.
    calibration_months = sorted(train["origin"].unique())[-3:]
    split_origin = min(calibration_months)
    base_train = train[train["labelAvailableMonth"] <= split_origin]
    calibration = train[train["origin"].isin(calibration_months)]
    can_calibrate = len(base_train) >= 80 and base_train["targetChange"].map(lambda value: direction(value, threshold)).nunique() >= 2 and len(calibration) >= 30
    fit_train = base_train if can_calibrate else train
    if kind == "tree":
        classifier = RandomForestClassifier(n_estimators=36, max_depth=5, min_samples_leaf=12, random_state=41, n_jobs=1, class_weight="balanced")
        regressor = RandomForestRegressor(n_estimators=36, max_depth=5, min_samples_leaf=12, random_state=41, n_jobs=1)
    else:
        classifier = LogisticRegression(C=0.3, max_iter=600, class_weight="balanced", random_state=41)
        regressor = Ridge(alpha=10)
    clf = make_pipeline(SimpleImputer(strategy="median"), StandardScaler(), classifier)
    reg = make_pipeline(SimpleImputer(strategy="median"), StandardScaler(), regressor)
    clf.fit(fit_train[features], fit_train["targetChange"].map(lambda value: direction(value, threshold)))
    reg.fit(fit_train[features], fit_train["targetChange"])
    fitted = {"clf": clf, "reg": reg, "features": features, "temperature": 1.0, "calibration": "unavailable", "trainSamples": len(fit_train)}
    if can_calibrate:
        raw = aligned_probabilities(clf, calibration[features])
        actual = calibration["targetChange"].map(lambda value: CLASSES.index(direction(value, threshold))).to_numpy()
        truth = np.eye(3)[actual]
        scores = [(float(np.mean(np.sum((temperature_scale(raw, temperature) - truth) ** 2, axis=1))), temperature) for temperature in (0.75, 1, 1.5, 2, 3)]
        fitted["temperature"] = min(scores)[1]
        fitted["calibration"] = "past_matured_temporal_holdout_temperature"
    return fitted


def aligned_probabilities(classifier, x):
    raw = classifier.predict_proba(x)
    output = np.full((len(x), 3), 1e-9)
    for i, value in enumerate(classifier.classes_):
        output[:, CLASSES.index(value)] = raw[:, i]
    return output / output.sum(axis=1, keepdims=True)


def temperature_scale(probabilities, temperature):
    result = np.power(np.clip(probabilities, 1e-9, 1), 1 / temperature)
    return result / result.sum(axis=1, keepdims=True)


def metrics(predictions, threshold=3):
    if not predictions:
        return None
    actual = [direction(row["actualChangePct"], threshold) for row in predictions]
    predicted = [row["predictedDirection"] for row in predictions]
    p, r, f, support = precision_recall_fscore_support(actual, predicted, labels=CLASSES, zero_division=0)
    truth = np.eye(3)[[CLASSES.index(value) for value in actual]]
    probability = np.array([row["probabilities"] for row in predictions])
    return {
        "accuracy": float(accuracy_score(actual, predicted)),
        "balancedAccuracy": float(np.mean(r[np.asarray(support) > 0])),
        "macroF1": float(f1_score(actual, predicted, labels=CLASSES, average="macro", zero_division=0)),
        "maePct": float(mean_absolute_error([row["actualChangePct"] for row in predictions], [row["predictedChangePct"] for row in predictions])),
        "rmsePct": float(np.sqrt(mean_squared_error([row["actualChangePct"] for row in predictions], [row["predictedChangePct"] for row in predictions]))),
        "brier": float(np.mean(np.sum((probability - truth) ** 2, axis=1))),
        "classMetrics": {label: {"precision": float(p[i]), "recall": float(r[i]), "f1": float(f[i]), "support": int(support[i])} for i, label in enumerate(CLASSES)},
        "confusionMatrix": confusion_matrix(actual, predicted, labels=CLASSES).tolist(),
        "classOrder": CLASSES,
        "downWarnings": {"true": sum(a == "down" and p == "down" for a, p in zip(actual, predicted)), "false": sum(a != "down" and p == "down" for a, p in zip(actual, predicted)), "horizonMonths": 6,
                         "firstRegimeWarningLeadMonths": None,
                         "leadTimeStatus": "not_established_from_sparse_panel; horizon is not observed warning lead"},
    }


def prediction_rows(test, predicted, probabilities, threshold=3):
    return [{"seriesId": row.seriesId, "catalogId": row.catalogId, "regionCode": row.regionCode,
             "origin": str(row.origin), "targetMonth": str(row.targetMonth),
             "actualChangePct": float(row.targetChange), "predictedChangePct": float(predicted[i]),
             "predictedDirection": CLASSES[int(np.argmax(probabilities[i]))], "probabilities": probabilities[i].tolist()}
            for i, row in enumerate(test.itertuples())]


def evaluate_fold(panel, origin, features, kind="linear", threshold=3, region=None, catalog_id=None):
    train = purged_training(panel, origin, region, catalog_id)
    test = panel[(panel["origin"] == origin) & panel["targetChange"].notna()]
    if region:
        test = test[test["regionCode"] == region]
    if catalog_id:
        test = test[test["catalogId"] == catalog_id]
    model = fit_pair(train, features, kind, threshold)
    if model is None or test.empty:
        return [], model
    probabilities = temperature_scale(aligned_probabilities(model["clf"], test[model["features"]]), model["temperature"])
    return prediction_rows(test, model["reg"].predict(test[model["features"]]), probabilities, threshold), model


def baseline_predictions(panel, origins, threshold=3):
    output = {key: [] for key in ("price_hold", "trend", "always_up", "past_majority")}
    for origin in origins:
        train = purged_training(panel, origin)
        test = panel[(panel["origin"] == origin) & panel["targetChange"].notna()]
        if test.empty:
            continue
        counts = train["targetChange"].map(lambda value: direction(value, threshold)).value_counts()
        majority = counts.index[0] if len(counts) else "flat"
        mean = float(train["targetChange"].mean()) if len(train) else 0
        for key in output:
            if key == "trend":
                expected = test["momentum6"].fillna(0).to_numpy()
                labels = [direction(value, threshold) for value in expected]
            else:
                label = "up" if key == "always_up" else majority if key == "past_majority" else "flat"
                expected = np.full(len(test), threshold + 0.01 if key == "always_up" else mean if key == "past_majority" else 0)
                labels = [label] * len(test)
            prob = np.eye(3)[[CLASSES.index(label) for label in labels]]
            output[key].extend(prediction_rows(test, expected, prob, threshold))
    return output


def block_interval(rows, seed=41):
    """Month block uncertainty; overlapping labels are not independent rows."""
    if not rows:
        return None
    by_month = defaultdict(list)
    for row in rows:
        by_month[row["origin"]].append(row)
    months = sorted(by_month)
    regions = sorted({row["regionCode"] for row in rows})
    if len(months) < 6:
        return None
    rng = np.random.default_rng(seed)
    scores = []
    # Six-month moving blocks preserve serially dependent target windows.
    for _ in range(120):
        sampled = []
        while len(sampled) < len(months):
            start = int(rng.integers(0, max(1, len(months) - 5)))
            sampled.extend(months[start:start + 6])
        sampled_regions = rng.choice(regions, size=len(regions), replace=True)
        sample = [row for value in sampled[:len(months)] for region in sampled_regions for row in by_month[value] if row["regionCode"] == region]
        if not sample:
            continue
        actual = [direction(row["actualChangePct"]) for row in sample]
        guessed = [row["predictedDirection"] for row in sample]
        scores.append(f1_score(actual, guessed, labels=CLASSES, average="macro", zero_division=0))
    return {"method": "region_clusters_and_shared_six_month_moving_blocks", "macroF1Low": float(np.quantile(scores, .025)), "macroF1High": float(np.quantile(scores, .975)), "replications": len(scores)}


def paired_block_skill(rows, baseline_rows):
    baseline = {(row["seriesId"], row["origin"]): row for row in baseline_rows}
    joined = [row for row in rows if (row["seriesId"], row["origin"]) in baseline]
    months = sorted({row["origin"] for row in joined})
    regions = sorted({row["regionCode"] for row in joined})
    if len(months) < 6:
        return None
    grouped = {value: [row for row in joined if row["origin"] == value] for value in months}
    rng, deltas = np.random.default_rng(41), []
    for _ in range(120):
        sampled = []
        while len(sampled) < len(months):
            start = int(rng.integers(0, max(1, len(months) - 5)))
            sampled.extend(months[start:start + 6])
        sampled_regions = rng.choice(regions, size=len(regions), replace=True)
        sample = [row for value in sampled[:len(months)] for region in sampled_regions for row in grouped[value] if row["regionCode"] == region]
        if not sample:
            continue
        actual = [direction(row["actualChangePct"]) for row in sample]
        guessed = [row["predictedDirection"] for row in sample]
        base = [baseline[(row["seriesId"], row["origin"])]["predictedDirection"] for row in sample]
        deltas.append(f1_score(actual, guessed, labels=CLASSES, average="macro", zero_division=0) - f1_score(actual, base, labels=CLASSES, average="macro", zero_division=0))
    return {"method": "paired_region_clusters_shared_six_month_blocks", "macroF1DeltaLow": float(np.quantile(deltas, .025)), "macroF1DeltaHigh": float(np.quantile(deltas, .975)), "replications": len(deltas)}


def validation_split(panel, as_of, holdout_count=24, development_count=4):
    """Model-selection outcomes must have matured before the first test origin."""
    as_of = month(as_of)
    matured = panel[(panel["labelAvailableMonth"] <= as_of) & panel["targetChange"].notna()]
    origins = sorted(matured["origin"].unique())
    holdout = origins[-holdout_count:]
    selection_cutoff = min(holdout) - 1 if holdout else as_of
    development_panel = panel[(panel["labelAvailableMonth"] <= selection_cutoff) & panel["targetChange"].notna()].copy()
    development = sorted(development_panel.loc[development_panel["origin"] < selection_cutoff, "origin"].unique())[-development_count:]
    selected_rows = development_panel[development_panel["origin"].isin(development)]
    selection_audit = {
        "selectionAsOfMonth": str(selection_cutoff),
        "firstHoldoutOrigin": str(min(holdout)) if holdout else None,
        "lastDevelopmentLabelAvailableMonth": str(selected_rows["labelAvailableMonth"].max()) if len(selected_rows) else None,
        "developmentSamples": len(selected_rows),
        "rule": "estimator and feature-stage selection uses only outcomes labelAvailableMonth<=first holdout origin minus one month; fold calibration uses only matured past labels",
    }
    return matured, holdout, development, selection_cutoff, development_panel, selection_audit


def run_experiments(panel, as_of, thresholds=(3, 2, 5)):
    if panel.empty:
        return {"models": [], "baselines": [], "holdoutOrigins": [], "predictions": {}, "selectedModel": None}
    matured, holdout, development, selection_cutoff, development_panel, selection_audit = validation_split(panel, as_of)
    selection_train = purged_training(panel, selection_cutoff)
    stages, requested, predictions = [], [], {}
    for model_id, additions in FEATURES.items():
        print(f"Evaluating Model {model_id}: {len(holdout)} held-out origins", flush=True)
        requested += additions
        available = usable_features(selection_train, requested)
        new_available = [feature for feature in additions if feature in available]
        missing = [feature for feature in additions if feature not in new_available]
        if model_id != "A" and not new_available:
            stages.append({"id": model_id, "status": "unavailable", "features": available, "missingFeatures": missing, "metrics": None, "samples": 0, "reason": "No additional historically usable features"})
            continue
        selected_kind = "linear"
        development_scores = {}
        if development:
            for kind in ("linear", "tree"):
                dev_rows = []
                for origin in development:
                    rows, _ = evaluate_fold(development_panel, origin, available, kind)
                    dev_rows += rows
                metric = metrics(dev_rows)
                development_scores[kind] = metric
            if development_scores.get("tree") and development_scores.get("linear"):
                selected_kind = max(development_scores, key=lambda key: development_scores[key]["macroF1"])
        rows, calibration_counts = [], defaultdict(int)
        for origin in holdout:
            fold, fitted = evaluate_fold(panel, origin, available, selected_kind)
            rows += fold
            if fitted:
                calibration_counts[fitted["calibration"]] += 1
        predictions[model_id] = rows
        metric = metrics(rows)
        sensitivity = {}
        for threshold in thresholds:
            if threshold == 3:
                continue
            alternate = []
            for origin in holdout:
                fold, _ = evaluate_fold(panel, origin, available, selected_kind, threshold)
                alternate += fold
            sensitivity[str(threshold)] = metrics(alternate, threshold)
        per_region = {region: metrics([row for row in rows if row["regionCode"] == region]) for region in sorted({row["regionCode"] for row in rows})}
        per_complex = {catalog_id: metrics([row for row in rows if row["catalogId"] == catalog_id]) for catalog_id in sorted({row["catalogId"] for row in rows})}
        stages.append({"id": model_id, "status": "tested" if metric else "insufficient_data", "estimator": selected_kind,
                       "features": available, "missingFeatures": missing, "metrics": metric, "samples": len(rows),
                       "origins": len({row["origin"] for row in rows}), "calibration": dict(calibration_counts),
                       "development": development_scores, "sensitivity": sensitivity,
                       "byRegion": per_region, "byComplex": per_complex, "uncertainty": block_interval(rows),
                       "featureSelectionAsOf": str(selection_cutoff), "selectionAudit": selection_audit,
                       "featureCoverage": {feature: {"observedTrainingRows": int(selection_train[feature].notna().sum()), "totalTrainingRows": len(selection_train)} for feature in available}})
    base_rows = baseline_predictions(panel, holdout)
    baselines = [{"id": key, "metrics": metrics(rows), "samples": len(rows)} for key, rows in base_rows.items()]
    for stage in stages:
        if not stage["metrics"]:
            continue
        keys = {(row["seriesId"], row["origin"]) for row in predictions[stage["id"]]}
        stage["baselineComparisons"] = []
        for key, rows in base_rows.items():
            common_baseline = [row for row in rows if (row["seriesId"], row["origin"]) in keys]
            base_metric = metrics(common_baseline)
            stage["baselineComparisons"].append({"id": key, "samples": len(common_baseline), "metrics": base_metric,
                "macroF1Improvement": stage["metrics"]["macroF1"] - base_metric["macroF1"] if base_metric else None,
                "maeImprovementPct": (1 - stage["metrics"]["maePct"] / base_metric["maePct"]) * 100 if base_metric and base_metric["maePct"] else None,
                "uncertainty": paired_block_skill(predictions[stage["id"]], common_baseline)})
    # Final holdout is evaluation only: select deployment stage on development.
    eligible = [stage for stage in stages if stage.get("development", {}).get(stage.get("estimator"))]
    selected = max(eligible, key=lambda stage: stage["development"][stage["estimator"]]["macroF1"]) if eligible else None
    for i, stage in enumerate(stages):
        if not stage["metrics"]:
            continue
        previous = next((prev for prev in reversed(stages[:i]) if prev["metrics"]), None)
        if previous:
            common = {(row["seriesId"], row["origin"]) for row in predictions[stage["id"]]} & {(row["seriesId"], row["origin"]) for row in predictions[previous["id"]]}
            current_metric = metrics([row for row in predictions[stage["id"]] if (row["seriesId"], row["origin"]) in common])
            previous_metric = metrics([row for row in predictions[previous["id"]] if (row["seriesId"], row["origin"]) in common])
            stage["incrementalEffect"] = {"vs": previous["id"], "commonSamples": len(common), "macroF1Delta": current_metric["macroF1"] - previous_metric["macroF1"] if current_metric and previous_metric else None, "maeDeltaPct": current_metric["maePct"] - previous_metric["maePct"] if current_metric and previous_metric else None}
    leave_region, leave_complex = {}, {}
    if selected:
        # Unseen-region/complex checks use the fixed model, never tune on them.
        for region in sorted(matured["regionCode"].unique()):
            held_rows = []
            for origin in holdout:
                fold, _ = evaluate_fold(panel, origin, selected["features"], selected["estimator"], region=region)
                held_rows += fold
            leave_region[region] = {"samples": len(held_rows), "metrics": metrics(held_rows)}
        for catalog_id in sorted(matured["catalogId"].unique()):
            held_rows = []
            # Latest 6 test origins: transparent reduced computational scope.
            for origin in holdout[-6:]:
                fold, _ = evaluate_fold(panel, origin, selected["features"], selected["estimator"], catalog_id=catalog_id)
                held_rows += fold
            leave_complex[catalog_id] = {"samples": len(held_rows), "originsRequested": 6, "metrics": metrics(held_rows)}
    return {"models": stages, "baselines": baselines, "holdoutOrigins": [str(value) for value in holdout],
            "developmentOrigins": [str(value) for value in development], "selectionAudit": selection_audit, "predictions": predictions,
            "selectedModel": selected["id"] if selected else None,
            "leaveRegionOut": leave_region, "leaveComplexOut": leave_complex}


def deployment_gate(experiment):
    reasons = []
    selected = next((stage for stage in experiment["models"] if stage["id"] == experiment["selectedModel"]), None)
    if not selected or not selected["metrics"]:
        return False, ["No model selected on pre-holdout development data"]
    if len(experiment["holdoutOrigins"]) < 24 or selected["origins"] < 24:
        reasons.append("24 complete out-of-time origins unavailable")
    if selected["samples"] < 200:
        reasons.append("Under 200 held-out samples")
    comparisons = selected.get("baselineComparisons", [])
    base = [item["metrics"] for item in comparisons if item["metrics"]]
    if base and selected["metrics"]["macroF1"] < max(item["macroF1"] for item in base) + .02:
        reasons.append("Macro F1 did not beat the strongest simple baseline by 0.02")
    if base and selected["metrics"]["maePct"] >= min(item["maePct"] for item in base):
        reasons.append("Change error did not improve on the strongest simple baseline")
    if comparisons:
        strongest = max((item for item in comparisons if item["metrics"]), key=lambda item: item["metrics"]["macroF1"], default=None)
        if not strongest or not strongest.get("uncertainty") or strongest["uncertainty"]["macroF1DeltaLow"] <= 0:
            reasons.append("Paired month-block improvement uncertainty includes zero")
    if selected["metrics"]["maePct"] > 20:
        reasons.append("Absolute price-change error above 20 percentage points")
    if any(value["support"] < 30 for value in selected["metrics"]["classMetrics"].values()):
        reasons.append("Under 30 true cases in one direction class")
    if selected.get("calibration", {}).get("past_matured_temporal_holdout_temperature", 0) < 12:
        reasons.append("Insufficient temporal probability calibration folds")
    if not experiment.get("leaveRegionOut") or any(value["samples"] >= 30 and value["metrics"]["balancedAccuracy"] < 1 / 3 for value in experiment["leaveRegionOut"].values()):
        reasons.append("Unseen-region verification missing or below chance")
    return not reasons, reasons


def market_prices(records, sources, catalog, as_of):
    """Public price observations for every known complex, outside model cohort."""
    if not records:
        return []
    frame = pd.DataFrame(records)
    end = month(as_of) - 2
    start = end - 2
    chosen = frame[(frame["dealType"] == "매매") & (frame["month"] >= start)
                   & (frame["month"] <= end) & (frame["availableAt"] <= month_end(as_of))]
    metadata = {item["catalogId"]: item for item in catalog}
    prices = []
    for (catalog_id, area), trades in chosen.groupby(["catalogId", "areaM2"]):
        if len(trades) < 3:
            continue
        item = metadata[catalog_id]
        region = str(item["regionCode"])
        covered = {source["month"] for source in sources if source["type"] == "sale" and source["regionCode"] == region}
        if region == "41590":
            # Do not mistake old-code zero responses for complete new districts.
            covered = {source["month"] for source in sources if source["type"] == "sale" and source["regionCode"] in {"41591", "41593", "41595", "41597"}}
        missing = [str(value) for value in pd.period_range(start, end, freq="M") if str(value) not in covered]
        prices.append({"catalogId": catalog_id, "aptName": item["name"], "regionCode": region,
                       "areaM2": float(area), "referencePriceManWon": round(float(trades["price"].mean())),
                       "referenceMonth": str(end), "sampleCount": len(trades), "dealType": "매매",
                       "missingMonths": missing, "status": "partial" if missing else "complete",
                       "builtYear": item.get("builtYear"), "households": item.get("households"),
                       "firstTradeMonth": str(trades["month"].min()), "lastTradeMonth": str(trades["month"].max()),
                       "dataCheckedAt": min((str(value) for value in trades["collectedAt"] if str(value)), default=None),
                       "listedForSale": False, "source": "국토부 공식 실거래 · 최근3개월"})
    price_frame = pd.DataFrame(prices)
    if price_frame.empty:
        return prices
    for item in prices:
        peers = price_frame[(price_frame["regionCode"] == item["regionCode"])
                            & (price_frame["catalogId"] != item["catalogId"])
                            & (price_frame["areaM2"] >= item["areaM2"] * .9)
                            & (price_frame["areaM2"] <= item["areaM2"] * 1.1)
                            & (price_frame["builtYear"] >= (item["builtYear"] or 0) - 5)
                            & (price_frame["builtYear"] <= (item["builtYear"] or 0) + 5)
                            & (price_frame["status"] == "complete")]
        grouped = peers.assign(unitPrice=peers["referencePriceManWon"] / peers["areaM2"]).groupby("catalogId")["unitPrice"].mean()
        score = round(float((grouped > item["referencePriceManWon"] / item["areaM2"]).mean()) * 100) if len(grouped) >= 5 and item["status"] == "complete" else None
        item.update({"priceAttractivenessScore": score, "peerComplexes": len(grouped), "priceAttractivenessBasis": "같은시군구·면적±10%·준공±5년 비교단지의 현재㎡당실거래 분포. 위치·층 보정 없음"})
    return prices


def current_probability_gate(passed, reasons, fitted):
    reasons = list(reasons)
    if not fitted:
        reasons.append("Current model cannot be fitted on matured historical labels")
    elif fitted.get("calibration") != "past_matured_temporal_holdout_temperature":
        reasons.append("Current probabilities lack temporal calibration")
    return passed and not reasons, reasons


def public_forecasts(panel, targets, as_of, experiment, observed_prices=()):
    passed, reasons = deployment_gate(experiment)
    selected = next((stage for stage in experiment["models"] if stage["id"] == experiment["selectedModel"]), None)
    origin = month(as_of)
    fitted = fit_pair(purged_training(panel, origin), selected["features"], selected["estimator"]) if selected and not panel.empty else None
    passed, reasons = current_probability_gate(passed, reasons, fitted)
    forecasts = []
    if panel.empty:
        return forecasts, reasons
    current = panel[panel["origin"] == origin]
    price_lookup = {(item["catalogId"], item["areaM2"]): item for item in observed_prices}
    for row in current.itertuples():
        frame = current[current["seriesId"] == row.seriesId]
        probabilities = None
        expected = None
        checked = getattr(row, "dataCheckedAt", None)
        source_age = (datetime.now(timezone(timedelta(hours=9))).date() - datetime.fromisoformat(str(checked)[:10]).date()).days if checked and valid_publication(checked) else None
        fresh = source_age is not None and 0 <= source_age <= 30
        row_reasons = list(reasons)
        if not fresh:
            row_reasons.append("Recent benchmark source has not been checked within 30 days")
        if passed and fitted and fresh:
            prob = temperature_scale(aligned_probabilities(fitted["clf"], frame[fitted["features"]]), fitted["temperature"])[0]
            probabilities = dict(zip(CLASSES, [float(value) for value in prob]))
            expected = float(fitted["reg"].predict(frame[fitted["features"]])[0])
        feature_coverage = sum(np.isfinite(float(getattr(row, feature, np.nan))) for feature in FEATURES["A"]) / 4
        # Quality score is a disclosed data rubric, not hit rate or suitability.
        quality = round(100 * (.35 * min(1, row.sampleCount / 10) + .35 * min(1, row.historyMonths / 60) + .30 * feature_coverage))
        comparable = current[(current["regionCode"] == row.regionCode)
                             & (current["areaM2"] >= row.areaM2 * .9)
                             & (current["areaM2"] <= row.areaM2 * 1.1)
                             & (current["age"] >= row.age - 5) & (current["age"] <= row.age + 5)
                             & (current["catalogId"] != row.catalogId)]
        peers = comparable.assign(unitPrice=comparable["referencePrice"] / comparable["areaM2"]).groupby("catalogId")["unitPrice"].mean()
        unit_price = row.referencePrice / row.areaM2
        attractiveness = round(100 * float((peers > unit_price).mean())) if len(peers) >= 5 else None
        forecasts.append({"catalogId": row.catalogId, "aptName": row.aptName, "regionCode": row.regionCode,
                          "regionName": row.regionName, "areaM2": row.areaM2,
                          "referencePriceManWon": round(row.referencePrice), "referenceMonth": str(row.referenceMonth),
                          "targetMonth": str(row.targetMonth), "status": "validated_reconstruction" if probabilities else "withheld",
                          "probabilities": probabilities, "expectedChangePct": expected, "qualityScore": quality,
                          "verificationLevel": "reconstructed", "reasons": [] if probabilities else row_reasons,
                          "sampleCount": int(row.sampleCount), "historyMonths": int(row.historyMonths),
                          "modelId": selected["id"] if selected else None,
                          "dataCheckedAt": checked, "sourceAgeDays": source_age,
                          "freshnessStatus": "current" if fresh else "stale_or_unverified"})
        forecasts[-1].update({"priceAttractivenessScore": attractiveness,
                              "priceAttractivenessBasis": {"method": "same-region area within10pct, age within5years, current per-m2 price percentile", "peerComplexes": len(peers), "minimumPeers": 5}})
        observed = price_lookup.get((row.catalogId, row.areaM2))
        if observed:
            forecasts[-1]["priceAttractivenessScore"] = observed["priceAttractivenessScore"]
            forecasts[-1]["priceAttractivenessBasis"]["peerComplexes"] = observed["peerComplexes"]
    return forecasts, reasons


def backtest_artifact(common, status, experiment, strict, gate_reasons):
    """Latest experiment approval never inherits a retained operating manifest."""
    return {**common, "status": status,
            **{key: value for key, value in experiment.items() if key != "predictions"},
            "strictValidation": strict,
            "deploymentGate": {"passed": not gate_reasons, "reasons": list(gate_reasons)}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache-dir", type=Path, default=SERVICE / ".local/market-cache/months")
    parser.add_argument("--raw-dir", type=Path, default=RESEARCH_LOCAL / "raw")
    parser.add_argument("--feature-csv", type=Path, default=RESEARCH_LOCAL / "official-features.csv")
    parser.add_argument("--local-dir", type=Path, default=RESEARCH_LOCAL, help="Private staging and audit location, never a public artifact directory")
    parser.add_argument("--catalog-file", type=Path, default=SERVICE / "data/source/apartment-catalog.json")
    parser.add_argument("--finance-file", type=Path, default=ROOT / "apps/homehunt/data/finance-dashboard.json")
    parser.add_argument("--output", type=Path, default=V2 / "data")
    local_today = datetime.now(timezone(timedelta(hours=9))).date()
    parser.add_argument("--as-of", default=str(month(local_today) - 1))
    parser.add_argument("--target-count", type=int, default=60)
    parser.add_argument("--skip-sensitivity", action="store_true", help="Quick diagnostic only; final release runs all thresholds")
    args = parser.parse_args()
    if month(args.as_of).end_time.date() > local_today:
        parser.error("Monthly forecast origin must be a completed month; choose the preceding month")
    public_output = args.output
    args.output = args.local_dir / "staging" / f"{args.as_of}-{MODEL_VERSION}"
    # Keep the same Seoul/Gyeonggi universe when reading the national source.
    catalog = [row for row in json.loads(args.catalog_file.read_text(encoding="utf-8"))["apartments"]
               if str(row.get("regionCode", ""))[:2] in {"11", "41"}]
    records, excluded, sources, regions = load_data(args.cache_dir, args.raw_dir, catalog)
    long_regions = {region for region in regions if len({source["month"] for source in sources if source["regionCode"] == region and source["type"] == "sale"}) >= 36}
    targets = select_targets(catalog, long_regions, args.target_count)
    observations = feature_observations(args.feature_csv)
    # The only time-series finance inputs here are official cached observations.
    finance = json.loads(args.finance_file.read_text(encoding="utf-8"))
    for series in finance.get("series", []):
        feature = {"bok_base_rate": "baseRate", "mortgage_new": "mortgageRate"}.get(series["id"])
        if not feature:
            continue
        for item in series.get("history", []):
            observed = month(item["date"])
            # Decision dates can be known dates; monthly average release is lagged.
            published = str(item["date"]) if len(str(item["date"])) == 10 else month_end(observed + 2)
            observations.append({"feature": feature, "value": item["value"], "observedMonth": observed, "publishedAt": published, "sourceUrl": series["sourceUrl"], "verificationLevel": "reconstructed"})
    print(f"Public records: {len(records):,}; catalog-stratified targets: {len(targets)}; source files: {len(sources)}", flush=True)
    panel, panel_excluded = build_panel(records, targets, args.as_of, observations)
    print(f"Usable series rows: {len(panel):,}; running walk-forward A-E", flush=True)
    experiment = run_experiments(panel, args.as_of, (3,) if args.skip_sensitivity else (3, 2, 5))
    observed_prices = market_prices(records, sources, catalog, args.as_of)
    forecasts, gate_reasons = public_forecasts(panel, targets, args.as_of, experiment, observed_prices)
    period_start = min((source["month"] for source in sources), default=None)
    period_end = max((source["month"] for source in sources), default=None)
    status = "tested_withheld" if experiment["models"] else "insufficient_data"
    if any(forecast["probabilities"] for forecast in forecasts):
        status = "validated_reconstruction"
    common = {"schemaVersion": 1, "modelVersion": MODEL_VERSION, "asOfMonth": args.as_of, "verificationLevel": "reconstructed", "checkedAt": datetime.now(timezone.utc).isoformat(),
              "featureAssumptions": [{"feature": "households", "verificationLevel": "reconstructed",
                  "message": "현재 세대수를 과거에도 같다고 가정한 정적 대리변수입니다. 세대수 변동 이력을 확보하지 못했습니다. strict 실험에서는 당시 공표가 검증된 값만 사용합니다."}]}
    availability = [
        {"id": "molit", "label": "국토부 매매·전월세", "status": "partial", "periodStart": period_start, "periodEnd": period_end, "missingReason": "Latest normalized snapshots lack historical report/cancellation vintages; focal-region history may be sparse", "sourceUrl": SOURCE_URLS["molit"]},
        {"id": "bok", "label": "한국은행 금리", "status": "partial", "periodStart": "2015-06", "periodEnd": "2026-09", "missingReason": "Base-rate decision history available; mortgage-rate history only 8 months, older publication vintages not proven", "sourceUrl": SOURCE_URLS["bok"]},
        {"id": "catalog", "label": "공식 단지 특성", "status": "partial", "periodStart": None, "periodEnd": None, "missingReason": "Construction year/area are usable in reconstruction; historical households changes not known", "sourceUrl": SOURCE_URLS["catalog"]},
        {"id": "rail", "label": "역·노선·업무지역 접근", "status": "unavailable", "periodStart": None, "periodEnd": None, "missingReason": "Current station references lack historical opening/transfer vintages and actual walking paths; excluded from historic model", "sourceUrl": "https://data.kric.go.kr/"},
        *[{"id": key, "label": label, "status": "unavailable", "periodStart": None, "periodEnd": None, "missingReason": "No compatible historical observations acquired; official dated CSV import supported", "sourceUrl": SOURCE_URLS[key]} for key, label in [("reb", "지역 가격지수"), ("supply", "입주·미분양"), ("kosis", "인구·가구·일자리"), ("auction", "법원 경매")]],
        {"id": "listings", "label": "매물 수·호가", "status": "unavailable", "periodStart": None, "periodEnd": None, "missingReason": "No permitted free historical listing archive; not generated", "sourceUrl": None},
    ]
    strict = {"status": "unavailable", "reason": "Historical publication-time and cancellation/revision vintages are not proven. Forward raw snapshots are preserved from first acquisition."}
    write_json(args.output / "manifest.json", {**common, "status": status, "models": experiment["models"], "sources": availability, "strictValidation": strict, "selectedModel": experiment["selectedModel"], "deploymentGate": {"passed": not gate_reasons, "reasons": gate_reasons}, "parameters": {"horizonMonths": 6, "reportLagMonths": 2, "thresholdPct": 3, "priceWindowMonths": 3, "minimumTrades": 3, "minimumActiveMonths": 6, "holdoutOrigins": 24, "qualityRubric": {"recentSample": .35, "historyLength": .35, "coreFeatureCoverage": .30}}, "sourceFileCount": len(sources), "recordCount": len(records), "sampleCount": len(panel)})
    write_json(args.output / "forecasts.json", {**common, "status": status, "forecasts": forecasts, "strictValidation": strict})
    write_json(args.output / "market-prices.json", {"schemaVersion": 1, "asOfMonth": args.as_of,
               "window": {"start": str(month(args.as_of) - 4), "end": str(month(args.as_of) - 2), "minimumTrades": 3},
               "prices": observed_prices, "verificationLevel": "latest_snapshot_observations",
               "sourceUrl": SOURCE_URLS["molit"], "listedForSale": False})
    write_json(args.output / "backtest.json", backtest_artifact(common, status, experiment, strict, gate_reasons))
    regional_coverage = []
    for region in sorted(regions):
        monthly_sources = [source for source in sources if source["regionCode"] == region]
        dates = sorted({source["month"] for source in monthly_sources})
        regional_coverage.append({"regionCode": region, "periodStart": dates[0] if dates else None, "periodEnd": dates[-1] if dates else None,
                                  "saleMonths": len({source["month"] for source in monthly_sources if source["type"] == "sale"}),
                                  "rentMonths": len({source["month"] for source in monthly_sources if source["type"] == "rent"})})
    write_json(args.output / "availability.json", {**common, "sources": availability, "exclusions": excluded, "seriesExclusions": panel_excluded, "strictValidation": strict, "regionalCoverage": regional_coverage})
    eligible_ids = set(panel["catalogId"]) if not panel.empty else set()
    write_json(args.output / "analysis-targets.json", {**common, "selectionMethod": "prospective catalog year/household strata, deterministic hash, no price/performance selection", "targets": [{**target, "status": "included" if target["catalogId"] in eligible_ids else "insufficient_history"} for target in targets]})
    # Auditable detailed predictions/raw-file digests stay local, not in Git.
    audit = args.local_dir / "runs" / f"{args.as_of}-{MODEL_VERSION}"
    write_json(audit / "source-manifest.json", {"sources": sources})
    write_json(audit / "predictions.json", experiment["predictions"])
    identity = {"sources": sources, "asOf": args.as_of, "codeSha256": digest_file(__file__), "thresholds": [3] if args.skip_sensitivity else [3, 2, 5], "targetCount": args.target_count}
    snapshot_hash = hashlib.sha256(json.dumps(identity, sort_keys=True).encode()).hexdigest()
    snapshot_path = audit / f"snapshot-{snapshot_hash}.json"
    if not snapshot_path.exists():
        write_json(snapshot_path, {"immutableId": snapshot_hash, "asOfMonth": args.as_of, "modelVersion": MODEL_VERSION, "codeSha256": identity["codeSha256"], "artifactHashes": {path.name: digest_file(path) for path in args.output.glob("*.json")}})
    publication = promote(args.output, public_output)
    print(json.dumps({"publicationStatus": publication["status"], "previousValidatedRetained": publication["previousValidatedRetained"]}, ensure_ascii=False), flush=True)
    print(json.dumps({"status": status, "forecasts": len(forecasts), "publishedProbabilities": sum(bool(row["probabilities"]) for row in forecasts), "selectedModel": experiment["selectedModel"], "gateReasons": gate_reasons}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
