"""Monthly execution tests use injected subprocesses: no HTTP or real training."""
import json
import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

from refresh import KST, make_plan, parser, previous_month, run_refresh


class MonthlyRefreshTests(unittest.TestCase):
    def setUp(self):
        temp_parent = Path(__file__).resolve().parents[2] / ".local/research/v2/test-temp"
        temp_parent.mkdir(parents=True, exist_ok=True)
        self.temporary = tempfile.TemporaryDirectory(dir=temp_parent)
        self.root = Path(self.temporary.name)
        self.now = datetime(2026, 10, 11, 12, tzinfo=KST)
        self.args = parser().parse_args(["--local-dir", str(self.root / "local"),
            "--cache-dir", str(self.root / "cache"), "--output", str(self.root / "public"),
            "--catalog-file", str(self.root / "catalog.json"), "--finance-file", str(self.root / "finance.json"),
            "--env-file", str(self.root / "never-read.env")])

    def tearDown(self):
        self.temporary.cleanup()

    def ready(self):
        self.args.catalog_file.write_text('{}', encoding="utf-8")
        self.args.finance_file.write_text('{}', encoding="utf-8")
        self.args.cache_dir.mkdir()
        for year in (2020, 2021, 2022):
            for number in range(1, 13):
                (self.args.cache_dir / f"41117_{year}{number:02d}_sale.json").write_text('{}', encoding="utf-8")
        self.args.output.mkdir()
        (self.args.output / "manifest.json").write_text('{"known":"unchanged-test-marker"}', encoding="utf-8")
        self.args.execute = True

    def subprocess(self, returncodes=(0, 0), complete=20, failures=(), used=24, samples=1194):
        calls = []
        def run(command, **options):
            calls.append(command)
            if len(calls) == 1:
                audit = Path(command[command.index("--audit-dir") + 1])
                audit.mkdir(parents=True)
                (audit / "collection-checkpoint.json").write_text(json.dumps({
                    "usedRequests": used, "completeMonths": complete, "failures": list(failures),
                    "budgetReached": complete < 20, "interrupted": False}), encoding="utf-8")
            else:
                candidate = Path(command[command.index("--output") + 1])
                candidate.mkdir(parents=True)
                (candidate / "manifest.json").write_text(json.dumps({"asOfMonth":"2026-09", "recordCount":441867, "sampleCount":samples}), encoding="utf-8")
            return SimpleNamespace(returncode=returncodes[len(calls) - 1], stdout="secret-value https://provider.invalid/?serviceKey=secret-value", stderr="secret-value")
        return run, calls

    def test_default_is_readonly_plan_without_secret_or_subprocess(self):
        runner, promoter = Mock(), Mock()
        result = run_refresh(self.args, runner, promoter, self.now)
        self.assertEqual(result["status"], "planned")
        self.assertEqual(result["asOfMonth"], "2026-09")
        self.assertEqual(result["targetMonth"], "2027-03")
        self.assertEqual(result["effects"]["providerCalls"], 0)
        self.assertFalse(self.args.local_dir.exists())
        runner.assert_not_called()
        promoter.assert_not_called()

    def test_plan_limits_regions_types_and_recent_reporting_window(self):
        plan = make_plan(self.args, self.now)
        self.assertEqual(len(plan["regions"]), 5)
        self.assertEqual(plan["types"], ["sale", "rent"])
        self.assertEqual(plan["refreshMonths"], ["2026-09", "2026-08"])
        self.assertEqual(plan["requestBudget"], 24)
        self.assertEqual(previous_month(datetime(2027, 1, 1, tzinfo=KST)), "2026-12")

    def test_future_or_invalid_origin_and_unbounded_budget_rejected(self):
        for invalid in ("2026-10", "2026-13", "tomorrow"):
            self.args.as_of = invalid
            with self.assertRaises(ValueError):
                make_plan(self.args, self.now)
        self.args.as_of = "2026-09"
        for budget in (0, 121):
            self.args.request_budget = budget
            with self.assertRaises(ValueError):
                make_plan(self.args, self.now)

    def test_cold_cache_blocks_before_provider_calls(self):
        self.args.execute = True
        runner = Mock()
        result = run_refresh(self.args, runner=runner, now=self.now)
        self.assertEqual(result["status"], "blocked_before_collection")
        runner.assert_not_called()

    def test_collection_failure_preserves_public_and_suppresses_raw_logs(self):
        self.ready()
        runner, calls = self.subprocess(returncodes=(1, 0))
        promoter = Mock()
        result = run_refresh(self.args, runner, promoter, self.now)
        self.assertEqual(result["status"], "collection_failed")
        self.assertTrue(result["publicResultsUnchanged"])
        self.assertEqual(len(calls), 1)
        self.assertNotIn("secret-value", json.dumps(result))
        self.assertNotIn("https://provider", json.dumps(result))
        promoter.assert_not_called()

    def test_training_failure_never_runs_publication(self):
        self.ready()
        runner, calls = self.subprocess(returncodes=(0, 1))
        promoter = Mock()
        result = run_refresh(self.args, runner, promoter, self.now)
        self.assertEqual(result["status"], "training_failed")
        self.assertTrue(result["publicResultsUnchanged"])
        self.assertEqual(len(calls), 2)
        candidate = Path(calls[1][calls[1].index("--output") + 1])
        self.assertNotEqual(candidate, self.args.output)
        self.assertTrue(candidate.is_relative_to(self.args.local_dir))
        promoter.assert_not_called()

    def test_partial_collection_is_disclosed_then_last_validated_can_be_kept(self):
        self.ready()
        runner, calls = self.subprocess(complete=12, failures=[{"regionCode":"41117","type":"rent","reason":"request_budget_partial_month"}])
        promoter = Mock(return_value={"status":"last_validated_kept", "previousValidatedRetained":True})
        result = run_refresh(self.args, runner, promoter, self.now)
        self.assertEqual(result["status"], "completed_partial_collection")
        self.assertEqual(result["collection"]["pendingOrFailedMonths"], 8)
        self.assertTrue(result["publication"]["previousValidatedRetained"])
        self.assertEqual(calls[0][calls[0].index("--months") + 1], "2")
        self.assertEqual(calls[0][calls[0].index("--request-budget") + 1], "24")
        self.assertNotIn("secret-value", json.dumps(result))
        self.assertFalse((self.args.local_dir / "refresh.lock").exists())
        promoter.assert_called_once()

    def test_successful_monthly_run_receipt_is_private(self):
        self.ready()
        runner, _ = self.subprocess()
        promoter = Mock(return_value={"status":"published", "previousValidatedRetained":False})
        result = run_refresh(self.args, runner, promoter, self.now)
        self.assertEqual(result["status"], "completed")
        receipt = self.args.local_dir / "refresh-runs" / result["runId"] / "refresh-run.json"
        self.assertEqual(json.loads(receipt.read_text(encoding="utf-8"))["asOfMonth"], "2026-09")

    def test_invalid_budget_receipt_stops_before_training(self):
        self.ready()
        runner, calls = self.subprocess(used=25)
        promoter = Mock()
        result = run_refresh(self.args, runner, promoter, self.now)
        self.assertEqual(result["status"], "refresh_failed")
        self.assertEqual(len(calls), 1)
        promoter.assert_not_called()

    def test_missing_panel_preserves_all_public_results(self):
        self.ready()
        runner, _ = self.subprocess(samples=0)
        promoter = Mock()
        result = run_refresh(self.args, runner, promoter, self.now)
        self.assertEqual(result["status"], "insufficient_analysis_data")
        self.assertTrue(result["publicResultsUnchanged"])
        promoter.assert_not_called()

    def test_untrusted_failure_reason_cannot_echo_a_secret(self):
        self.ready()
        runner, _ = self.subprocess(complete=12, failures=[{"regionCode":"41117", "type":"sale", "reason":"https://provider.invalid/serviceKey=secret-value"}])
        promoter = Mock(return_value={"status":"last_validated_kept"})
        result = run_refresh(self.args, runner, promoter, self.now)
        self.assertEqual(result["collection"]["failures"][0]["reason"], "unknown_failure")
        self.assertNotIn("secret-value", json.dumps(result))

    def test_concurrent_lock_does_not_double_collect(self):
        self.ready()
        self.args.local_dir.mkdir()
        (self.args.local_dir / "refresh.lock").write_text("existing", encoding="utf-8")
        runner = Mock()
        result = run_refresh(self.args, runner=runner, now=self.now)
        self.assertEqual(result["status"], "already_running")
        runner.assert_not_called()
        self.assertTrue((self.args.local_dir / "refresh.lock").exists())


if __name__ == "__main__":
    unittest.main()
