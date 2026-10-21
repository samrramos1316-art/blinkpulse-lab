"""Tests for tools/analyze_v3.py.

    .venv/Scripts/python -m unittest tools/test_analyze_v3.py

Synthetic sessions are written in the export format with known answers; the committed
fixture test/fixtures/study/blinkpulse-study-P90-S1.csv comes from the app's own
export code (test/studyFixture.test.ts), so the parser is checked against the real format.
"""

from __future__ import annotations

import math
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
from scipy import stats

sys.path.insert(0, str(Path(__file__).resolve().parent))
import analyze_v3 as a  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
FIXTURE = ROOT / "test" / "fixtures" / "study" / "blinkpulse-study-P90-S1.csv"

ECI_COLS = (
    "ok,eci,reason,coverage,closed_fraction,long_per_min,mean_blink_ms,blinks_per_min,"
    "ratio_closed,ratio_long,ratio_duration,ratio_blink_rate,lost_no_face_ms,"
    "lost_head_turned_ms,lost_gap_ms,median_fps"
)
BASE = {"closed_fraction": 0.03, "long_per_min": 0.0, "mean_blink_ms": 140.0}
WORK0 = 400_000


def window(kind: str, ref: int, end: float, k: float | None, blink_rate: float = 15) -> str:
    """A window whose ECI is (k + 2) / 3: closed fraction k times the baseline."""
    start = end - 300_000
    if k is None:
        return f"{kind},{ref},{start},{end},0,,noFace,0.5,,,,,,,,,9000,0,0,30"
    c = BASE["closed_fraction"] * k
    eci = (k + 2) / 3
    return (
        f"{kind},{ref},{start},{end},1,{eci:.4f},,0.95,{c:.5f},0,140,{blink_rate},"
        f"{k:.4f},1,1,{blink_rate / 15:.4f},0,0,0,30"
    )


def session_csv(
    pid: str,
    number: int,
    ratings: list[int | None],
    ks: list[float | None],
    *,
    blink_rates: list[float] | None = None,
    baseline_rating: int = 3,
    work_ms: float = 25 * 60_000,
    calibration: bool = True,
    baseline: bool = True,
    pvt_ks: tuple[float, float] = (1.0, 2.0),
    trend: list[tuple[float, float | None]] | None = None,
) -> str:
    shown = [WORK0 + 300_000 * (i + 1) for i in range(len(ratings))]
    pvt2 = WORK0 + work_ms
    lines = [
        "# BlinkPulse Lab study session. Numbers only: no video, images, landmarks, or names.",
        "# format=blinkpulse-study-1",
        "# app_commit=test",
        f"# participant={pid}",
        f"# session={number}",
        f"# session_id={pid}-S{number}",
        "# rating_wording=placeholder",
        "# end_reason=completed",
        "#section=steps",
        "step,start_ms",
        "calibration,0",
        "baselineRating,15000",
        "baseline,18000",
        "pvt1,200000",
        f"work,{WORK0}",
        f"pvt2,{pvt2}",
        f"finished,{pvt2 + 180_000}",
        "#section=calibration",
        "ear_baseline,close_ear,reopen_ear",
    ]
    if calibration:
        lines.append("0.3,0.2,0.22")
    lines += [
        "#section=baseline",
        "closed_fraction,long_per_min,mean_blink_ms,blinks_per_min,valid_ms,blink_count,rating,not_alert",
    ]
    if baseline:
        na = 1 if baseline_rating >= 6 else 0
        lines.append(f"0.03,0,140,15,180000,45,{baseline_rating},{na}")
    lines += ["#section=ratings", "kind,index,shown_ms,answered_ms,rating", f"baseline,0,15000,18000,{baseline_rating}"]
    for i, r in enumerate(ratings):
        lines.append(f"work,{i + 1},{shown[i]},{'' if r is None else shown[i] + 2000},{'' if r is None else r}")
    lines += ["#section=windows", f"kind,ref,start_ms,end_ms,{ECI_COLS}"]
    lines.append(window("pvt", 1, WORK0 - 10_000, pvt_ks[0]))
    for i, k in enumerate(ks):
        br = blink_rates[i] if blink_rates else 15
        lines.append(window("rating", i + 1, shown[i], k, br))
    lines.append(window("pvt", 2, pvt2 + 180_000, pvt_ks[1]))
    lines += ["#section=trend", f"t_ms,window_ms,{ECI_COLS}"]
    for t, e in trend or []:
        ok = "1" if e is not None else "0"
        lines.append(f"{t},60000,{ok},{'' if e is None else e},{'' if e is not None else 'noFace'},0.9,,,,,,,,,0,0,0,30")
    lines += [
        "#section=events",
        "start_ms,duration_ms,kind,low_confidence",
        "#section=pvt_trials",
        "run,trial,stimulus_ms,response_ms,rt_ms,lapse,false_start,timeout",
        "#section=pvt_summary",
        "run,start_ms,end_ms,stimuli,lapses,false_starts,median_rt_ms,mean_reciprocal_rt",
        f"1,200000,380000,50,1,0,250,3.9",
        f"2,{pvt2},{pvt2 + 180_000},48,6,1,290,3.3",
    ]
    return "\n".join(lines) + "\n"


class Files:
    """Writes CSVs to a temporary folder."""

    def __init__(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)

    def add(self, text: str, name: str) -> Path:
        p = self.dir / name
        p.write_text(text, encoding="utf-8")
        return p

    def close(self) -> None:
        self.tmp.cleanup()


# Six participants, two sessions each. The rating rises with the ECI, but the ratings are
# not in time order, so time on task is a weaker predictor.
ORDER = [[3, 5, 4, 6, 7], [4, 3, 6, 5, 7]]


def perfect_study(files: Files) -> None:
    for p in range(1, 7):
        for n, ratings in enumerate(ORDER, start=1):
            ks = [1 + (r - 3) * 0.5 for r in ratings]
            files.add(session_csv(f"P0{p}", n, list(ratings), list(ks)), f"P0{p}-S{n}.csv")


class ParseFixture(unittest.TestCase):
    """The file written by the app's TypeScript export (test/studyFixture.test.ts)."""

    def test_reads_the_app_export(self) -> None:
        s = a.load_session(FIXTURE)
        self.assertEqual((s.participant, s.number, s.exclusion), ("P90", 1, None))
        self.assertEqual([r.rating for r in s.ratings], [4, 5, None, 6, 7])
        self.assertEqual([r.window_ok for r in s.ratings], [True, True, False, True, True])
        self.assertAlmostEqual(s.ratings[0].time_on_task_min, 5.0)
        self.assertEqual(s.baseline_rating, 3)
        self.assertFalse(s.not_alert)
        self.assertEqual(s.pvt_summary[2]["lapses"], s.pvt_summary[2]["stimuli"])

    def test_formula_matches_the_app(self) -> None:
        s = a.load_session(FIXTURE)
        for r in a.usable(s.ratings):
            self.assertAlmostEqual(a.eci_from(r.window, s.baseline), float(r.window["eci"]), places=3)
        self.assertAlmostEqual(a.eci_from(s.pvt_windows[2], s.baseline), float(s.pvt_windows[2]["eci"]), places=3)


class Formula(unittest.TestCase):
    def test_floors_and_cap(self) -> None:
        base = {"closed_fraction": "0", "long_per_min": "0", "mean_blink_ms": "50"}
        same = {"closed_fraction": "0.005", "long_per_min": "0", "mean_blink_ms": "80"}
        self.assertAlmostEqual(a.eci_from(same, base), 1.0)  # everything below the floors
        high = {"closed_fraction": "0.5", "long_per_min": "3", "mean_blink_ms": "100"}
        self.assertAlmostEqual(a.eci_from(high, base), (5 + 5 + 1) / 3)


class Statistics(unittest.TestCase):
    def test_rowwise_spearman_matches_scipy(self) -> None:
        rng = np.random.default_rng(1)
        x = rng.integers(0, 5, size=(50, 8)).astype(float)
        y = rng.normal(size=(50, 8))
        got = a._rowwise_spearman(x, y)
        for i in range(50):
            want = a.spearman(x[i], y[i])
            if math.isnan(want):
                self.assertTrue(math.isnan(got[i]))
            else:
                self.assertAlmostEqual(got[i], want, places=10)

    def test_bootstrap_redraws_constant_resamples(self) -> None:
        rng = np.random.default_rng(2)
        x = np.array([1.0, 2, 3, 4, 5])
        y = np.array([1.0, 1, 1, 1, 2])  # many resamples are constant
        lo, hi = a.bootstrap_spearman(x, y, rng, n_boot=2000)
        self.assertTrue(-1 <= lo <= hi <= 1)

    def test_auc(self) -> None:
        self.assertEqual(a.auc(np.array([1.0, 2, 3, 4]), np.array([False, False, True, True])), 1.0)
        self.assertEqual(a.auc(np.array([1.0, 1, 1, 1]), np.array([False, False, True, True])), 0.5)
        self.assertTrue(math.isnan(a.auc(np.array([1.0, 2]), np.array([False, False]))))


class Analysis(unittest.TestCase):
    def setUp(self) -> None:
        self.files = Files()

    def tearDown(self) -> None:
        self.files.close()

    def test_perfect_association(self) -> None:
        perfect_study(self.files)
        sessions = a.load_all([str(self.files.dir)])
        h = a.run_h1("t", sessions, np.random.default_rng(0), a.PREDICTORS)
        self.assertEqual(len(h.analysed), 6)
        for p in h.analysed:
            self.assertEqual((p.n, p.sessions), (10, 2))
            self.assertAlmostEqual(p.rho["eci"], 1.0)
            self.assertLess(p.rho["time_on_task"], 1.0)
            self.assertTrue(math.isnan(p.rho["blink_rate"]))  # constant in these files
        # Exact one-sided Wilcoxon with 6 positive values: 1 / 2^6.
        self.assertAlmostEqual(h.p_value, 1 / 64)

    def test_report_is_deterministic_and_reports_controls(self) -> None:
        perfect_study(self.files)
        sessions = a.load_all([str(self.files.dir)])
        r1 = a.report(sessions, set())
        r2 = a.report(a.load_all([str(self.files.dir)]), set())
        self.assertEqual(r1, r2)
        self.assertIn("p = 0.0156. H1 supported", r1)
        self.assertIn("rho(ECI) - rho(time_on_task): n = 6", r1)
        self.assertIn("interval excludes 0", r1)
        self.assertIn("rho(ECI) - rho(blink_rate): n = 0", r1)
        self.assertIn("0 differ by more than 0.001", r1)
        self.assertIn("Sessions with both PVT-B windows usable: 12 of 12", r1)

    def test_null_result_is_reported(self) -> None:
        # The ECI moves against the rating for every participant.
        for p in range(1, 7):
            for n, ratings in enumerate(ORDER, start=1):
                ks = [1 + (7 - r) * 0.5 for r in ratings]
                self.files.add(session_csv(f"P0{p}", n, list(ratings), ks), f"P0{p}-S{n}.csv")
        text = a.report(a.load_all([str(self.files.dir)]), set())
        self.assertIn("H1 not supported at alpha 0.05", text)

    def test_session_exclusions(self) -> None:
        r, k = [3, 4, 5, 6, 7], [1.0, 1.5, 2, 2.5, 3]
        self.files.add(session_csv("P01", 1, r, k, calibration=False), "a.csv")
        self.files.add(session_csv("P01", 2, r, k, baseline=False), "b.csv")
        self.files.add(session_csv("P01", 3, r[:2], k[:2], work_ms=14 * 60_000), "c.csv")
        self.files.add(session_csv("P01", 4, r, k), "d.csv")
        got = {s.number: s.exclusion for s in a.load_all([str(self.files.dir)])}
        self.assertEqual(got[1], "blink calibration failed")
        self.assertTrue(got[2].startswith("alert baseline failed"))
        self.assertEqual(got[3], "work block ended before 15 minutes")
        self.assertIsNone(got[4])

    def test_participant_exclusions(self) -> None:
        # P01: one missing rating and one gated window leave 3 usable.
        self.files.add(session_csv("P01", 1, [3, None, 5, 6, 7], [1, 1, None, 2, 3]), "a.csv")
        # P02: the same rating every time.
        self.files.add(session_csv("P02", 1, [4] * 5, [1, 1.5, 2, 2.5, 3]), "b.csv")
        h = a.run_h1("t", a.load_all([str(self.files.dir)]), np.random.default_rng(0), a.PREDICTORS)
        self.assertEqual(h.analysed, [])
        self.assertEqual(dict(h.excluded)["P01"], "3 usable ratings (needs 5)")
        self.assertIn("same rating", dict(h.excluded)["P02"])
        self.assertTrue(math.isnan(h.p_value))

    def test_dev_participants_are_left_out(self) -> None:
        perfect_study(self.files)
        text = a.report(a.load_all([str(self.files.dir)]), {"P01"})
        self.assertNotIn("| P01 |", text)
        self.assertIn("| P02 |", text)

    def test_duplicate_session_is_an_error(self) -> None:
        self.files.add(session_csv("P01", 1, [3], [1]), "a.csv")
        self.files.add(session_csv("P01", 1, [3], [1]), "b.csv")
        with self.assertRaises(ValueError):
            a.load_all([str(self.files.dir)])

    def test_participant_level_baseline(self) -> None:
        r, k = [3, 4, 5, 6, 7], [1.0, 1.5, 2, 2.5, 3]
        self.files.add(session_csv("P01", 1, r, k, baseline_rating=4), "a.csv")
        self.files.add(session_csv("P01", 2, r, k, baseline_rating=2), "b.csv")
        self.files.add(session_csv("P01", 3, r, k, baseline_rating=2), "c.csv")
        bases = a.participant_baselines(a.load_all([str(self.files.dir)]))
        self.assertEqual(bases["P01"].number, 2)

    def test_sixty_second_window_from_trend(self) -> None:
        shown1 = WORK0 + 300_000
        trend = [(shown1 - 20_000, 9.0), (shown1 - 5_000, 1.25), (shown1 + 5_000, 7.0)]
        s_path = self.files.add(session_csv("P01", 1, [3, 4], [1, 2], trend=trend), "a.csv")
        s = a.load_session(s_path)
        self.assertEqual(s.ratings[0].eci60, 1.25)
        self.assertIsNone(s.ratings[1].eci60)

    def test_band_rule(self) -> None:
        few = [session_csv("P01", 1, [3, 4, 3, 4, 3], [1, 1, 1, 1, 1])]
        self.assertTrue(a.choose_bands([self._load(t, i) for i, t in enumerate(few)])["provisional"])
        # 20 windows with KSS <= 4: ECIs (k + 2) / 3 for k = 1.0 .. 2.9.
        texts = [
            session_csv("P01", n + 1, [3] * 5, [1 + 0.1 * (5 * n + i) for i in range(5)]) for n in range(4)
        ]
        b = a.choose_bands([self._load(t, i) for i, t in enumerate(texts)])
        eci = [(1 + 0.1 * j + 2) / 3 for j in range(20)]
        p = float(np.percentile(eci, 95))
        self.assertFalse(b["provisional"])
        self.assertAlmostEqual(b["c1"], p, places=3)
        self.assertAlmostEqual(b["c2"], 1 + 2 * (p - 1), places=3)

    def _load(self, text: str, i: int) -> a.Session:
        return a.load_session(self.files.add(text, f"s{i}.csv"))


class ScipyBehaviour(unittest.TestCase):
    def test_spearman_uses_average_ranks(self) -> None:
        x = np.array([1.0, 2, 2, 3])
        y = np.array([1.0, 2, 3, 4])
        self.assertAlmostEqual(a.spearman(x, y), stats.pearsonr(stats.rankdata(x), stats.rankdata(y)).statistic)


if __name__ == "__main__":
    unittest.main()
