import json
import tempfile
import unittest
from pathlib import Path

from publish import promote, verify_forecasts


def artifact(origin, status, passed):
    manifest = {"schemaVersion": 1, "asOfMonth": origin, "modelVersion": "test", "status": status,
                "deploymentGate": {"passed": passed, "reasons": [] if passed else ["Baseline not beaten"]}}
    forecasts = {"schemaVersion": 1, "asOfMonth": origin, "modelVersion": "test", "forecasts": []}
    if passed:
        forecasts["forecasts"] = [{"targetMonth": "2026-09" if origin == "2026-03" else "2026-10",
                                   "probabilities": {"up": .3, "flat": .4, "down": .3}}]
    return manifest, forecasts


class PromotionTests(unittest.TestCase):
    def setUp(self):
        self.temp_parent = Path(__file__).resolve().parents[2] / ".local/research/v2/test-temp"
        self.temp_parent.mkdir(parents=True, exist_ok=True)

    def write_pair(self, folder, manifest, forecasts):
        folder.mkdir(parents=True, exist_ok=True)
        (folder / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
        (folder / "forecasts.json").write_text(json.dumps(forecasts), encoding="utf-8")

    def test_failed_new_model_keeps_last_validated_forecast(self):
        with tempfile.TemporaryDirectory(dir=self.temp_parent) as temporary:
            destination, staging = Path(temporary) / "public", Path(temporary) / "staging"
            previous = artifact("2026-03", "validated_reconstruction", True)
            self.write_pair(destination, *previous)
            self.write_pair(staging, *artifact("2026-04", "tested_withheld", False))
            (staging / "backtest.json").write_text('{"schemaVersion":1,"status":"tested_withheld"}', encoding="utf-8")
            result = promote(staging, destination)
            self.assertTrue(result["previousValidatedRetained"])
            self.assertEqual(json.loads((destination / "forecasts.json").read_text())["asOfMonth"], "2026-03")
            self.assertEqual(json.loads((destination / "backtest.json").read_text())["status"], "tested_withheld")

    def test_new_validation_replaces_previous(self):
        with tempfile.TemporaryDirectory(dir=self.temp_parent) as temporary:
            destination, staging = Path(temporary) / "public", Path(temporary) / "staging"
            self.write_pair(destination, *artifact("2026-03", "validated_reconstruction", True))
            self.write_pair(staging, *artifact("2026-04", "validated_reconstruction", True))
            result = promote(staging, destination)
            self.assertFalse(result["previousValidatedRetained"])
            self.assertEqual(json.loads((destination / "manifest.json").read_text())["asOfMonth"], "2026-04")

    def test_fake_probability_cannot_be_published_by_failed_model(self):
        manifest, forecasts = artifact("2026-03", "tested_withheld", True)
        with self.assertRaises(ValueError):
            verify_forecasts(manifest, forecasts)

    def test_invalid_auxiliary_json_cannot_partially_replace_existing_forecast(self):
        with tempfile.TemporaryDirectory(dir=self.temp_parent) as temporary:
            destination, staging = Path(temporary) / "public", Path(temporary) / "staging"
            self.write_pair(destination, *artifact("2026-03", "validated_reconstruction", True))
            self.write_pair(staging, *artifact("2026-04", "validated_reconstruction", True))
            (staging / "backtest.json").write_text('{"value":NaN}', encoding="utf-8")
            with self.assertRaises(ValueError):
                promote(staging, destination)
            self.assertEqual(json.loads((destination / "forecasts.json").read_text())["asOfMonth"], "2026-03")

    def test_non_six_month_target_or_non_normalized_probabilities_fail(self):
        manifest, forecasts = artifact("2026-03", "validated_reconstruction", True)
        forecasts["forecasts"][0]["targetMonth"] = "2026-10"
        with self.assertRaises(ValueError):
            verify_forecasts(manifest, forecasts)
        forecasts["forecasts"][0]["targetMonth"] = "2026-09"
        forecasts["forecasts"][0]["probabilities"]["up"] = .8
        with self.assertRaises(ValueError):
            verify_forecasts(manifest, forecasts)


if __name__ == "__main__":
    unittest.main()
