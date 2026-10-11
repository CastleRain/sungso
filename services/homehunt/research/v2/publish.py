"""Promote staged public artifacts, retaining the last validated forecast.

This is a file-only publisher. It does not deploy, upload, or read secrets.
"""
from __future__ import annotations

import argparse
import json
import math
from datetime import datetime, timezone
from pathlib import Path

VALIDATED = {"validated_reconstruction", "validated_strict"}
FILES = ("manifest.json", "forecasts.json", "backtest.json", "availability.json", "analysis-targets.json", "market-prices.json")


def read_json(path):
    def reject_nonfinite(value):
        raise ValueError("Non-finite public JSON value")
    return json.loads(Path(path).read_text(encoding="utf-8"), parse_constant=reject_nonfinite)


def write_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    temporary.replace(path)


def month_number(value):
    year, month = map(int, str(value).split("-"))
    return year * 12 + month - 1


def verify_forecasts(manifest, forecasts):
    if manifest.get("schemaVersion") != 1 or forecasts.get("schemaVersion") != 1:
        raise ValueError("Unsupported public forecast schema")
    if manifest.get("asOfMonth") != forecasts.get("asOfMonth") or manifest.get("modelVersion") != forecasts.get("modelVersion"):
        raise ValueError("Manifest and forecasts must share model and origin")
    has_probability = False
    for row in forecasts.get("forecasts", []):
        probability = row.get("probabilities")
        if probability is None:
            continue
        if set(probability) != {"up", "flat", "down"} or any(type(value) not in (int, float) or not math.isfinite(value) or not 0 <= value <= 1 for value in probability.values()):
            raise ValueError("Invalid direction probabilities")
        if abs(sum(probability.values()) - 1) > 1e-6:
            raise ValueError("Direction probabilities must total one")
        if month_number(row["targetMonth"]) - month_number(manifest["asOfMonth"]) != 6:
            raise ValueError("Target must be six months after forecast origin")
        has_probability = True
    if manifest.get("status") in VALIDATED:
        if not manifest.get("deploymentGate", {}).get("passed") or not has_probability:
            raise ValueError("Validated publication requires passed gates and calibrated forecasts")
    elif has_probability:
        raise ValueError("Failed experiments cannot publish probability values")
    return has_probability


def promote(staging, destination):
    staging, destination = Path(staging), Path(destination)
    manifest = read_json(staging / "manifest.json")
    forecasts = read_json(staging / "forecasts.json")
    verify_forecasts(manifest, forecasts)
    old_manifest = read_json(destination / "manifest.json") if (destination / "manifest.json").exists() else None
    old_forecasts = read_json(destination / "forecasts.json") if (destination / "forecasts.json").exists() else None
    previous_valid = False
    if old_manifest and old_forecasts and old_manifest.get("status") in VALIDATED:
        try:
            previous_valid = verify_forecasts(old_manifest, old_forecasts)
        except ValueError:
            previous_valid = False
    retained = bool(previous_valid and manifest.get("status") not in VALIDATED)
    destination.mkdir(parents=True, exist_ok=True)
    # All staged documents are parsed before touching the public destination.
    documents = {name: read_json(staging / name) for name in FILES if (staging / name).exists()}
    for name, value in documents.items():
        if retained and name in {"manifest.json", "forecasts.json"}:
            continue
        write_json(destination / name, value)
    latest = old_manifest if retained else manifest
    update = {"schemaVersion": 1, "status": "last_validated_kept" if retained else "published",
              "attemptAsOfMonth": manifest["asOfMonth"], "publishedForecastAsOfMonth": latest["asOfMonth"],
              "modelVersion": latest["modelVersion"], "lastAttemptAt": datetime.now(timezone.utc).isoformat(),
              "previousValidatedRetained": retained,
              "lastValidatedAsOfMonth": latest["asOfMonth"] if latest.get("status") in VALIDATED else None,
              "latestExperimentStatus": manifest["status"],
              "reasons": manifest.get("deploymentGate", {}).get("reasons", []),
              "message": "새 실험은 기준을 통과하지 않아 마지막 검증 전망을 유지합니다. 기존 전망의 기준월·목표월을 확인하세요." if retained else "최신 실험 결과와 실제 자료 현황을 반영했습니다."}
    write_json(destination / "update-status.json", update)
    return update


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--staging", required=True, type=Path)
    parser.add_argument("--destination", required=True, type=Path)
    args = parser.parse_args()
    print(json.dumps(promote(args.staging, args.destination), ensure_ascii=False))


if __name__ == "__main__":
    main()
