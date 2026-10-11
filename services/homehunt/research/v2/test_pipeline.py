"""Counterexamples for time leakage and identities, independent of real prices."""
import unittest

import numpy as np
import pandas as pd

from pipeline import (backtest_artifact, build_catalog_index, build_panel, current_probability_gate, deployment_gate,
                      direction, eligible_observation, fit_pair, match_catalog,
                      market_prices, normalize_record, purged_training, select_targets,
                      temperature_scale, validation_split, window_stats)


class TimingAndIdentityTests(unittest.TestCase):
    def setUp(self):
        self.catalog = [{"catalogId": "complex-a", "regionCode": "41117", "name": "아파트", "dong": "망포동", "address": "경기도 망포동 12", "builtYear": 2005, "households": 500}]
        self.index = build_catalog_index(self.catalog)
        self.record = {"id": "official1", "regionCode": "41117", "apartmentName": "아파트", "dong": "망포동", "month": "2020-01", "areaM2": 59.91, "amountManWon": 50000, "dealType": "매매"}

    def test_exact_areas_are_not_buckets(self):
        first, _ = normalize_record(self.record, "2026-10-11", self.index)
        second, _ = normalize_record({**self.record, "areaM2": 59.92}, "2026-10-11", self.index)
        self.assertNotEqual(first["seriesId"], second["seriesId"])

    def test_snapshot_collection_is_not_historical_publication(self):
        value, reason = normalize_record(self.record, "2026-10-11", self.index, strict=True)
        self.assertIsNone(value)
        self.assertEqual(reason, "historical_publication_not_proven")

    def test_later_cancellation_is_excluded_and_explained(self):
        value, reason = normalize_record({**self.record, "cancelledAt": "2026-09-01"}, "2026-10-11", self.index)
        self.assertIsNone(value)
        self.assertEqual(reason, "cancelled_latest_snapshot")

    def test_n_cancel_flag_is_not_cancellation(self):
        value, reason = normalize_record({**self.record, "cdealType": "N"}, "2026-10-11", self.index)
        self.assertIsNone(reason)
        self.assertEqual(value["price"], 50000)

    def test_same_name_different_dong_does_not_match(self):
        self.assertIsNone(match_catalog({**self.record, "dong": "영통동"}, self.index))

    def test_address_required_for_ambiguous_catalog(self):
        index = build_catalog_index(self.catalog + [{**self.catalog[0], "catalogId": "b", "address": "경기도 망포동 99"}])
        self.assertIsNone(match_catalog(self.record, index))
        self.assertEqual(match_catalog({**self.record, "jibun": "99"}, index)["catalogId"], "b")

    def test_future_features_are_ineligible(self):
        observations = [{"feature": "baseRate", "value": 1, "observedMonth": pd.Period("2022-01"), "publishedAt": "2022-02-01", "sourceUrl": "https://ecos.bok.or.kr/"}]
        self.assertTrue(np.isnan(eligible_observation(observations, "baseRate", pd.Period("2022-01"), "41117", "complex-a")))
        self.assertEqual(eligible_observation(observations, "baseRate", pd.Period("2022-02"), "41117", "complex-a"), 1)

    def test_invalid_or_pre_observation_publication_is_rejected(self):
        for publication in ("2020-13-99", "2019-12-01", "2020-01"):
            value, why = normalize_record({**self.record, "publishedAt": publication, "vintageVerified": True}, "2026-10-11", self.index, strict=True)
            self.assertIsNone(value)
            self.assertEqual(why, "invalid_publication_date")

    def test_partial_region_months_are_not_complete_prices(self):
        records = [normalize_record({**self.record, "id": f"sample-{i}", "month": "2022-10"}, "2026-10-11", self.index)[0] for i in range(3)]
        observed = market_prices(records, [{"regionCode": "41117", "type": "sale", "month": "2022-10"}], self.catalog, "2023-01")
        self.assertEqual(observed[0]["status"], "partial")
        self.assertEqual(observed[0]["missingMonths"], ["2022-09", "2022-11"])
        self.assertFalse(observed[0]["listedForSale"])
        self.assertIsNone(observed[0]["priceAttractivenessScore"])

    def test_hwaseong_new_code_still_requires_matching_dong(self):
        index = build_catalog_index([{**self.catalog[0], "regionCode": "41590", "dong": "청계동"}])
        self.assertIsNone(match_catalog({**self.record, "regionCode": "41597"}, index))
        self.assertEqual(match_catalog({**self.record, "regionCode": "41597", "dong": "청계동"}, index)["catalogId"], "complex-a")

    def test_not_yet_open_line_is_ineligible(self):
        observations = [{"feature": "lineCount", "value": 2, "observedMonth": pd.Period("2022-01"), "publishedAt": "2022-01-01", "validFrom": "2025-01-01"}]
        self.assertTrue(np.isnan(eligible_observation(observations, "lineCount", pd.Period("2022-01"), "41117", "complex-a")))

    def test_training_uses_only_matured_labels_and_other_regions(self):
        panel = pd.DataFrame([
            {"origin": pd.Period("2021-01"), "labelAvailableMonth": pd.Period("2021-09"), "targetChange": 3, "regionCode": "41117", "catalogId": "a"},
            {"origin": pd.Period("2021-04"), "labelAvailableMonth": pd.Period("2021-12"), "targetChange": -3, "regionCode": "41117", "catalogId": "b"},
            {"origin": pd.Period("2021-01"), "labelAvailableMonth": pd.Period("2021-09"), "targetChange": 4, "regionCode": "41463", "catalogId": "c"},
        ])
        self.assertEqual(list(purged_training(panel, pd.Period("2021-10"))["catalogId"]), ["a", "c"])
        self.assertEqual(list(purged_training(panel, pd.Period("2021-10"), excluded_region="41117")["catalogId"]), ["c"])

    def test_model_selection_targets_mature_before_first_holdout(self):
        panel = pd.DataFrame([{"origin": origin, "labelAvailableMonth": origin + 8, "targetChange": 5}
                              for origin in pd.period_range("2022-01", "2026-09", freq="M")])
        _, holdout, development, cutoff, dev_panel, audit = validation_split(panel, "2026-09")
        self.assertEqual(holdout[0], pd.Period("2024-02"))
        self.assertEqual(cutoff, pd.Period("2024-01"))
        self.assertEqual(development[-1], pd.Period("2023-05"))
        self.assertTrue((dev_panel["labelAvailableMonth"] <= cutoff).all())
        self.assertEqual(audit["lastDevelopmentLabelAvailableMonth"], "2024-01")
        # 2023-10..2024-01 outcomes are unknowable at the first held-out origin.
        self.assertNotIn(pd.Period("2023-10"), development)

    def test_sparse_prices_are_missing_never_zero(self):
        data = pd.DataFrame([{"month": pd.Period("2021-01"), "price": 50000}, {"month": pd.Period("2021-02"), "price": 51000}])
        result, count = window_stats(data, pd.Period("2021-02"))
        self.assertTrue(np.isnan(result))
        self.assertEqual(count, 2)

    def test_six_month_target_is_origin_not_old_reference(self):
        records = []
        for observation in pd.period_range("2020-01", "2024-01", freq="M"):
            for day in range(3):
                row, _ = normalize_record({**self.record, "id": f"{observation}-{day}", "month": str(observation), "amountManWon": 50000 + observation.ordinal}, "2026-10-11", self.index)
                records.append(row)
        panel, _ = build_panel(records, self.catalog, "2023-01")
        row = panel[panel["origin"] == pd.Period("2023-01")].iloc[0]
        self.assertEqual(row["referenceMonth"], pd.Period("2022-11"))
        self.assertEqual(row["targetMonth"], pd.Period("2023-07"))
        self.assertEqual(row["labelAvailableMonth"], pd.Period("2023-09"))

    def test_strict_households_require_dated_verified_observation(self):
        records = []
        for observation in pd.period_range("2020-01", "2024-01", freq="M"):
            for day in range(3):
                row, _ = normalize_record({**self.record, "id": f"{observation}-{day}", "month": str(observation)}, "2026-10-11", self.index)
                records.append(row)
        missing, _ = build_panel(records, self.catalog, "2023-01", strict=True)
        self.assertTrue(missing["households"].isna().all())
        obs = [{"feature": "households", "value": 450, "observedMonth": pd.Period("2020-01"), "publishedAt": "2020-02-01", "catalogId": "complex-a", "verificationLevel": "strict"}]
        verified, _ = build_panel(records, self.catalog, "2023-01", obs, strict=True)
        self.assertEqual(verified["households"].iloc[-1], 450)

    def test_class_boundaries_are_fixed(self):
        self.assertEqual(direction(3), "flat")
        self.assertEqual(direction(-3), "flat")
        self.assertEqual(direction(3.01), "up")
        self.assertEqual(direction(-3.01), "down")

    def test_unverified_metrics_do_not_publish_forecasts(self):
        passed, reasons = deployment_gate({"models": [], "selectedModel": None})
        self.assertFalse(passed)
        self.assertTrue(reasons)

    def test_latest_backtest_contains_own_failed_gate_not_retained_manifest_gate(self):
        common = {"modelVersion": "same-program-version", "asOfMonth": "2026-09"}
        experiment = {"models": [], "selectedModel": None, "predictions": {"private": []}}
        reasons = ["Macro F1 did not beat the strongest simple baseline by 0.02"]
        current = backtest_artifact(common, "tested_withheld", experiment, {"status":"unavailable"}, reasons)
        self.assertEqual(current["deploymentGate"], {"passed": False, "reasons": reasons})
        self.assertNotIn("predictions", current)
        self.assertEqual(current["asOfMonth"], "2026-09")
        # An older successful month with the same code version cannot approve it.
        retained = {"modelVersion":"same-program-version", "asOfMonth":"2026-08", "deploymentGate":{"passed":True}}
        self.assertNotEqual(current["deploymentGate"]["passed"], retained["deploymentGate"]["passed"])

    def test_calibrated_past_does_not_approve_uncalibrated_current_fit(self):
        passed, reasons = current_probability_gate(True, [], {"calibration": "unavailable"})
        self.assertFalse(passed)
        self.assertIn("Current probabilities lack temporal calibration", reasons)
        self.assertEqual(current_probability_gate(True, [], {"calibration": "past_matured_temporal_holdout_temperature"}), (True, []))

    def test_missing_current_fit_is_withheld(self):
        passed, reasons = current_probability_gate(True, [], None)
        self.assertFalse(passed)
        self.assertTrue(reasons)

    def test_missing_feature_does_not_become_invented_zero(self):
        train = pd.DataFrame({"origin": [pd.Period("2020-01")] * 80, "targetChange": [3] * 80, "futureMoveIn": [np.nan] * 80})
        self.assertIsNone(fit_pair(train, ["futureMoveIn"]))

    def test_temperature_probabilities_remain_normalized(self):
        value = temperature_scale(np.array([[.2, .5, .3]]), 2)
        self.assertAlmostEqual(value.sum(), 1)
        self.assertTrue(np.all(value > 0))


if __name__ == "__main__":
    unittest.main()
