"""Budgeted official MOLIT collector. Secrets are read, never echoed or saved.

Raw XML and exact request-independent digests stay in service .local/research/v2. This is
the latest historical snapshot, not proof of its past public availability.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import unquote, urlencode
from urllib.request import Request, urlopen
from xml.etree import ElementTree

ROOT = Path(__file__).resolve().parents[4]
SERVICE = ROOT / "services/homehunt"
RESEARCH_LOCAL = SERVICE / ".local/research/v2"
ENDPOINTS = {
    "sale": "https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade",
    "rent": "https://apis.data.go.kr/1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent",
}


def write_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def service_key(env_file=None):
    value = os.environ.get("MOLIT_SERVICE_KEY")
    if not value:
        env = Path(env_file) if env_file is not None else SERVICE / ".env"
        if env.exists():
            for line in env.read_text(encoding="utf-8-sig").splitlines():
                match = re.match(r"\s*(?:export\s+)?MOLIT_SERVICE_KEY\s*=\s*(.+)", line)
                if match:
                    value = match.group(1).strip().strip("\"'")
                    break
    if not value:
        raise ValueError("MOLIT_SERVICE_KEY is not configured")
    return unquote(value)


def month_range(end, count):
    year, number = map(int, end.split("-"))
    ordinal = year * 12 + number - 1
    return [f"{(ordinal - offset) // 12:04d}{(ordinal - offset) % 12 + 1:02d}" for offset in range(count)]


def number(item, name):
    return float(item.get(name, "0").replace(",", "").strip() or "0")


def normalize_item(item, region, kind, ordinal):
    amount = number(item, "dealAmount" if kind == "sale" else "deposit")
    monthly = number(item, "monthlyRent")
    payload = {
        "id": item.get("dealAmountSn") or hashlib.sha256((json.dumps(item, ensure_ascii=False, sort_keys=True) + f"|{ordinal}").encode()).hexdigest(),
        "aptSeq": item.get("aptSeq", ""), "regionCode": item.get("sggCd", region),
        "apartmentName": item.get("aptNm", ""), "dong": item.get("umdNm", ""),
        "jibun": item.get("jibun", ""), "roadName": item.get("roadNm", ""),
        "month": f"{item.get('dealYear', '')}-{item.get('dealMonth', '').zfill(2)}",
        "day": int(number(item, "dealDay")), "areaM2": number(item, "excluUseAr"),
        "floor": int(number(item, "floor")), "builtYear": int(number(item, "buildYear")),
        "amountManWon": amount, "depositManWon": amount if kind == "rent" else 0,
        "monthlyRentManWon": monthly,
        "dealType": "매매" if kind == "sale" else "월세" if monthly else "전세",
        "cancelledAt": item.get("cdealDay", ""), "cdealType": item.get("cdealType", ""),
        "vintageVerified": False, "publishedAt": None,
    }
    return payload


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--regions", default="41117,41463,41610,41597,41370,41135,41465")
    parser.add_argument("--months", type=int, default=120)
    parser.add_argument("--end-month", default=datetime.now(timezone.utc).strftime("%Y-%m"))
    parser.add_argument("--types", default="sale,rent")
    parser.add_argument("--request-budget", "--max-calls", "--maxcalls", dest="request_budget", type=int, default=24)
    parser.add_argument("--gap-seconds", type=float, default=.6)
    parser.add_argument("--output", type=Path, default=RESEARCH_LOCAL / "raw")
    parser.add_argument("--cache-dir", type=Path, default=SERVICE / ".local/market-cache/months", help="Existing official month cache; explicit path avoids copying legacy raw data")
    parser.add_argument("--env-file", type=Path, default=SERVICE / ".env", help="Only MOLIT_SERVICE_KEY is read; process environment takes precedence")
    parser.add_argument("--audit-dir", type=Path, help="Optional separate private checkpoint/snapshot location when reusing legacy raw input")
    parser.add_argument("--prefer-existing-cache", action="store_true")
    parser.add_argument("--cache-only", action="store_true", help="Check requested coverage without any provider requests or secret reads")
    parser.add_argument("--refresh-recent-months", type=int, default=0, help="Explicitly refresh this many newest requested months, including report/revision changes")
    args = parser.parse_args()
    if not 1 <= args.months <= 120 or not 1 <= args.request_budget <= 2000 or args.gap_seconds < .3 or not 0 <= args.refresh_recent_months <= args.months:
        parser.error("months 1..120, request budget 1..2000, gap >= 0.3 seconds required")
    regions, kinds = args.regions.split(","), args.types.split(",")
    if any(not re.fullmatch(r"\d{5}", region) for region in regions) or any(kind not in ENDPOINTS for kind in kinds):
        parser.error("Only five-digit official region codes and sale/rent types supported")
    key = None if args.cache_only else service_key(args.env_file)
    months = month_range(args.end_month, args.months)
    calls, cache_hits, succeeded, failures, pending = 0, 0, 0, [], 0
    interrupted, budget_reached = False, False
    audit_dir = args.audit_dir or args.output.parent
    snapshots = audit_dir / "snapshots"
    snapshots.mkdir(parents=True, exist_ok=True)
    checkpoint = audit_dir / "collection-checkpoint.json"
    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    run_ledger = audit_dir / "collection-runs" / f"{run_id}.json"
    def save_checkpoint():
        state = {"schemaVersion": 1, "runId": run_id, "regions": regions, "types": kinds,
                 "requestBudget": args.request_budget, "usedRequests": calls,
                 "cacheHits": cache_hits, "completeMonths": succeeded, "failures": failures, "pendingMonths": pending,
                 "interrupted": interrupted, "budgetReached": budget_reached,
                 "periodRequested": {"start": months[-1], "end": months[0]},
                 "updatedAt": datetime.now(timezone.utc).isoformat()}
        write_json(checkpoint, state)
        write_json(run_ledger, state)
    # Recent-to-old requests. Region order rotates by month to keep coverage broad.
    try:
        for deal_month in months:
            for region in regions:
                for kind in kinds:
                    filename = f"{region}_{deal_month}_{kind}.json"
                    target = args.output / filename
                    existing = args.cache_dir / filename
                    should_refresh = deal_month in months[:args.refresh_recent_months]
                    if not should_refresh and (target.exists() or (args.prefer_existing_cache and existing.exists())):
                        cache_hits += 1
                        continue
                    if args.cache_only:
                        pending += 1
                        continue
                    if calls >= args.request_budget:
                        budget_reached = True
                        break
                    records, page, total, xml_hashes = [], 1, None, []
                    failed = None
                    while total is None or (page - 1) * 1000 < total:
                        if calls >= args.request_budget:
                            failed = "request_budget_partial_month"
                            budget_reached = True
                            break
                        params = {"serviceKey": key, "LAWD_CD": region, "DEAL_YMD": deal_month, "numOfRows": 1000, "pageNo": page}
                        url = ENDPOINTS[kind] + "?" + urlencode(params)
                        calls += 1
                        save_checkpoint()
                        try:
                            with urlopen(Request(url, headers={"Accept": "application/xml"}), timeout=28) as response:
                                xml = response.read()
                            parsed = ElementTree.fromstring(xml)
                            code = parsed.findtext(".//resultCode")
                            if code not in ("00", "000"):
                                failed = "provider_code_" + re.sub(r"[^A-Za-z0-9]", "", code or "missing")[:16]
                                break
                            total = int(parsed.findtext(".//totalCount") or 0)
                            if total > 200000:
                                failed = "pagination_safety_limit"
                                break
                            digest = hashlib.sha256(xml).hexdigest()
                            raw_target = snapshots / f"{region}_{deal_month}_{kind}_{page}_{digest}.xml"
                            if not raw_target.exists():
                                raw_target.write_bytes(xml)
                            xml_hashes.append(digest)
                            for i, node in enumerate(parsed.findall(".//item")):
                                item = {child.tag: (child.text or "").strip() for child in node}
                                records.append(normalize_item(item, region, kind, (page - 1) * 1000 + i))
                            page += 1
                        except HTTPError as error:
                            failed = f"http_{error.code}"
                            break
                        except (URLError, TimeoutError, OSError):
                            failed = "network_unavailable"
                            break
                        except (ValueError, ElementTree.ParseError):
                            failed = "invalid_response"
                            break
                        finally:
                            time.sleep(args.gap_seconds)
                    if failed:
                        failures.append({"regionCode": region, "month": deal_month, "type": kind, "reason": failed})
                        if failed.startswith(("http_401", "http_403", "provider_code_")) or failed == "network_unavailable":
                            interrupted = True
                    else:
                        write_json(target, {"schemaVersion": 1, "lawdCd": region, "dealYmd": deal_month, "type": kind, "records": records, "totalCount": total, "complete": True, "updatedAt": datetime.now(timezone.utc).isoformat(), "rawXmlHashes": xml_hashes, "verificationLevel": "reconstructed", "sourceUrl": ENDPOINTS[kind].split("/get")[0]})
                        succeeded += 1
                    save_checkpoint()
                    print(json.dumps({"region": region, "month": deal_month, "type": kind, "requests": calls, "records": len(records) if not failed else None, "status": failed or "complete"}, ensure_ascii=False), flush=True)
                    if interrupted or budget_reached:
                        break
                if interrupted or budget_reached:
                    break
            if interrupted or budget_reached:
                break
    except KeyboardInterrupt:
        interrupted = True
    save_checkpoint()
    print(json.dumps({"usedRequests": calls, "cacheHits": cache_hits, "completeMonths": succeeded, "pendingMonths": pending, "failureCount": len(failures), "budgetReached": budget_reached, "interrupted": interrupted}), flush=True)


if __name__ == "__main__":
    main()
