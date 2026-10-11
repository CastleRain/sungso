"""Bounded local monthly refresh. Default is a read-only plan, never execution.

Only explicit --execute can collect official data or train. Child output is
captured, not forwarded: credentials and provider URLs never enter this log.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from publish import promote

ROOT = Path(__file__).resolve().parents[4]
SERVICE = ROOT / "services/homehunt"
RESEARCH_LOCAL = SERVICE / ".local/research/v2"
SCRIPTS = Path(__file__).resolve().parent
REGIONS = ("41117", "41463", "41610", "41597", "41370")
ARTIFACTS = ("manifest.json", "forecasts.json", "backtest.json", "availability.json",
             "analysis-targets.json", "market-prices.json", "update-status.json")
KST = timezone(timedelta(hours=9))


def previous_month(today):
    year, number = today.year, today.month - 1
    return f"{year if number else year - 1:04d}-{number or 12:02d}"


def month_number(value):
    if not re.fullmatch(r"\d{4}-(?:0[1-9]|1[0-2])", str(value)):
        raise ValueError("as-of must be YYYY-MM")
    year, number = map(int, value.split("-"))
    return year * 12 + number - 1


def month_text(value):
    return f"{value // 12:04d}-{value % 12 + 1:02d}"


def parser():
    command = argparse.ArgumentParser(description=__doc__)
    command.add_argument("--execute", action="store_true", help="Explicitly allow bounded collection, local training and publication")
    command.add_argument("--as-of", help="Completed month; default is previous KST month")
    command.add_argument("--recent-months", type=int, choices=(2, 3), default=2)
    command.add_argument("--request-budget", type=int, default=24, help="Maximum actual MOLIT HTTP requests, 1..120; pagination also counts")
    command.add_argument("--local-dir", type=Path, default=RESEARCH_LOCAL)
    command.add_argument("--raw-dir", type=Path, help="Existing raw months, reused without copying; default local-dir/raw")
    command.add_argument("--cache-dir", type=Path, default=SERVICE / ".local/market-cache/months")
    command.add_argument("--env-file", type=Path, default=SERVICE / ".env")
    command.add_argument("--feature-csv", type=Path)
    command.add_argument("--catalog-file", type=Path, default=SERVICE / "data/source/apartment-catalog.json")
    command.add_argument("--finance-file", type=Path, default=ROOT / "apps/homehunt/data/finance-dashboard.json")
    command.add_argument("--output", type=Path, default=ROOT / "apps/homehunt-v2/data")
    return command


def inventory(*directories):
    """Filename coverage is preflight evidence, not proof of transaction count."""
    requests = set()
    for directory in directories:
        for path in Path(directory).glob("*.json"):
            found = re.fullmatch(r"(\d{5})_(\d{4})(0[1-9]|1[0-2])_(sale|rent)\.json", path.name)
            if found:
                requests.add((found[1], f"{found[2]}-{found[3]}", found[4]))
    sales = {}
    for region, observed, kind in requests:
        if kind == "sale":
            sales.setdefault(region, set()).add(observed)
    return {"cachedRequests": len(requests),
            "regionsWith36SaleMonths": sorted(region for region, months in sales.items() if len(months) >= 36),
            "note": "File coverage only; pipeline checks complete months, identities and real trades"}


def make_plan(args, now=None):
    now = now or datetime.now(KST)
    as_of = args.as_of or previous_month(now)
    if month_number(as_of) > month_number(previous_month(now)):
        raise ValueError("Forecast origin must be a completed month")
    if not 1 <= args.request_budget <= 120:
        raise ValueError("request-budget must be 1..120")
    raw = args.raw_dir or args.local_dir / "raw"
    for private in (raw, args.local_dir):
        resolved = private.resolve()
        if resolved.is_relative_to((ROOT / "apps").resolve()) or resolved.is_relative_to((ROOT / "dist").resolve()):
            raise ValueError("Raw data and local audit must remain outside public app/dist directories")
    end = month_number(as_of)
    months = [month_text(end - offset) for offset in range(args.recent_months)]
    coverage = inventory(args.cache_dir, raw)
    return {"schemaVersion": 1, "mode": "execute" if args.execute else "dry_run",
            "asOfMonth": as_of, "targetMonth": month_text(end + 6),
            "regions": list(REGIONS), "types": ["sale", "rent"], "refreshMonths": months,
            "requestBudget": args.request_budget, "minimumRequestsIfOnePageEach": len(REGIONS) * 2 * len(months),
            "paginationConsumesBudget": True, "partialCollectionPossible": True,
            "paths": {"rawDir": str(raw), "cacheDir": str(args.cache_dir),
                      "localDir": str(args.local_dir), "output": str(args.output)},
            "preflight": {**coverage, "catalogExists": args.catalog_file.is_file(),
                          "financeExists": args.finance_file.is_file()},
            "effects": {"providerCalls": "bounded only with --execute" if args.execute else 0,
                        "training": bool(args.execute), "publicWrites": bool(args.execute),
                        "personalDataWrites": 0, "commuteCalls": 0},
            "warnings": ["Latest historical files are reconstructed, not proven past publication vintages",
                         "Default plan does not read secrets, train, write files, deploy or schedule anything",
                         "This monthly command does not bootstrap 5–10 years of missing history"]}


def artifact_hashes(folder):
    return {name: hashlib.sha256((folder / name).read_bytes()).hexdigest()
            for name in ARTIFACTS if (folder / name).is_file()}


def safe_collection(checkpoint, budget, expected):
    body = json.loads(checkpoint.read_text(encoding="utf-8"))
    used = body.get("usedRequests")
    complete = body.get("completeMonths")
    if type(used) is not int or not 0 <= used <= budget or type(complete) is not int or not 0 <= complete <= expected:
        raise ValueError("Invalid collection receipt")
    failures = body.get("failures", [])
    if not isinstance(failures, list):
        raise ValueError("Invalid collection failures")
    # Do not echo arbitrary messages from upstream receipts, exceptions or URLs.
    def reason_code(item):
        reason = str(item.get("reason", ""))
        return reason if re.fullmatch(r"http_\d{3}|provider_code_\d{1,4}|request_budget_partial_month|network_unavailable|invalid_response|pagination_safety_limit", reason) else "unknown_failure"
    failed = [{"regionCode": item.get("regionCode") if item.get("regionCode") in REGIONS else None,
               "type": item.get("type") if item.get("type") in {"sale", "rent"} else None,
               "reason": reason_code(item)}
              for item in failures if isinstance(item, dict)]
    return {"usedRequests": used, "completeMonths": complete, "requestedMonths": expected,
            "pendingOrFailedMonths": expected - complete, "failureCount": len(failures),
            "failures": failed, "budgetReached": bool(body.get("budgetReached")),
            "interrupted": bool(body.get("interrupted")),
            "partial": complete < expected or bool(failures) or bool(body.get("interrupted"))}


def write_private(path, value):
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    temporary.replace(path)


def run_refresh(args, runner=subprocess.run, promoter=promote, now=None, on_progress=None):
    plan = make_plan(args, now)
    if not args.execute:
        return {**plan, "status": "planned", "executed": False}
    preflight = plan["preflight"]
    if not preflight["catalogExists"] or not preflight["financeExists"] or not preflight["regionsWith36SaleMonths"]:
        return {**plan, "status": "blocked_before_collection", "executed": False,
                "reason": "Official catalog/finance inputs and existing long-history cache are required; public results preserved"}
    args.local_dir.mkdir(parents=True, exist_ok=True)
    lock = args.local_dir / "refresh.lock"
    try:
        lock_descriptor = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    except FileExistsError:
        return {**plan, "status": "already_running", "executed": False,
                "reason": "Existing local refresh lock; no requests sent"}
    os.close(lock_descriptor)
    run_id = (now or datetime.now(KST)).astimezone(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    run_dir = args.local_dir / "refresh-runs" / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    result = {**plan, "runId": run_id, "executed": True, "status": "started",
              "publicArtifactsBefore": artifact_hashes(args.output)}
    progress = on_progress or (lambda event: None)
    raw = args.raw_dir or args.local_dir / "raw"
    features = args.feature_csv or args.local_dir / "official-features.csv"
    child_options = {"cwd": str(ROOT), "capture_output": True, "text": True, "encoding": "utf-8",
                     "env": {**os.environ, "PYTHONDONTWRITEBYTECODE": "1"}, "check": False}
    try:
        progress({"phase": "collect", "asOfMonth": plan["asOfMonth"], "requestBudget": args.request_budget})
        collection = runner([sys.executable, "-X", "utf8", str(SCRIPTS / "collect.py"),
            "--regions", ",".join(REGIONS), "--types", "sale,rent", "--months", str(args.recent_months),
            "--end-month", plan["asOfMonth"], "--refresh-recent-months", str(args.recent_months),
            "--request-budget", str(args.request_budget), "--cache-dir", str(args.cache_dir),
            "--output", str(raw), "--env-file", str(args.env_file), "--audit-dir", str(run_dir / "collection"),
            "--prefer-existing-cache"], **child_options)
        if collection.returncode != 0:
            result.update(status="collection_failed", phase="collect", reason="Collection child failed; raw child logs are suppressed and public results preserved")
            return result
        result["collection"] = safe_collection(run_dir / "collection/collection-checkpoint.json",
                                                args.request_budget, len(REGIONS) * 2 * args.recent_months)
        progress({"phase": "collection_complete", **result["collection"]})
        if result["collection"]["partial"]:
            result["warnings"].append("Collection is partial; successful months and existing history are reused, missing months are not zero trades")
        candidate = run_dir / "candidate-results"
        progress({"phase": "train", "asOfMonth": plan["asOfMonth"], "publicResultsUnchanged": True})
        analysis = runner([sys.executable, "-X", "utf8", str(SCRIPTS / "pipeline.py"),
            "--as-of", plan["asOfMonth"], "--cache-dir", str(args.cache_dir), "--raw-dir", str(raw),
            "--local-dir", str(run_dir / "analysis"), "--feature-csv", str(features),
            "--catalog-file", str(args.catalog_file), "--finance-file", str(args.finance_file),
            "--output", str(candidate)], **child_options)
        if analysis.returncode != 0:
            result.update(status="training_failed", phase="train", reason="Analysis failed in private staging; existing public results were not touched")
            return result
        candidate_manifest = json.loads((candidate / "manifest.json").read_text(encoding="utf-8"))
        if candidate_manifest.get("asOfMonth") != plan["asOfMonth"] or not candidate_manifest.get("recordCount") or not candidate_manifest.get("sampleCount"):
            result.update(status="insufficient_analysis_data", phase="train", reason="No usable actual research panel; existing public results preserved")
            return result
        publication = promoter(candidate, args.output)
        result.update(status="completed_partial_collection" if result["collection"]["partial"] else "completed",
                      publication={key: publication.get(key) for key in ("status", "previousValidatedRetained", "publishedForecastAsOfMonth", "latestExperimentStatus")})
        return result
    except (OSError, ValueError, KeyError):
        result.update(status="refresh_failed", reason="Refresh failed; see private phase receipt. Raw exception text is suppressed")
        return result
    finally:
        result["publicArtifactsAfter"] = artifact_hashes(args.output)
        result["publicResultsUnchanged"] = result["publicArtifactsBefore"] == result["publicArtifactsAfter"]
        try:
            write_private(run_dir / "refresh-run.json", result)
        except OSError:
            result["auditStatus"] = "private_receipt_write_failed"
        finally:
            lock.unlink(missing_ok=True)


def main():
    command = parser()
    args = command.parse_args()
    try:
        result = run_refresh(args, on_progress=lambda event: print(json.dumps(event, ensure_ascii=False), flush=True))
    except ValueError as error:
        command.error(str(error))
    print(json.dumps(result, ensure_ascii=False), flush=True)
    return 0 if result["status"] in {"planned", "completed", "completed_partial_collection"} else 1


if __name__ == "__main__":
    raise SystemExit(main())
