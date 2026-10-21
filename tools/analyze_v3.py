"""V3 analysis: does the eye-closure indicator track self-rated sleepiness?

Implements docs/STUDY_PROTOCOL.md Sections 7-9 on the study-mode CSV exports
(format blinkpulse-study-1, src/study/studyCsv.ts). Dev-only Python (PROJECT_SPEC 4).

    .venv/Scripts/python tools/analyze_v3.py DATA_DIR_OR_FILES... [--dev P01] [--out report.md]
    .venv/Scripts/python tools/analyze_v3.py DATA_DIR_OR_FILES... --bands --dev P01

Participants named with --dev form the development subset (Section 7): they are used
for the band rule only and never appear in the held-out results. The report says which
rating wording the sessions used; a placeholder wording means the ratings are not KSS.

Every random step uses SEED, so the same files give the same report.
"""

from __future__ import annotations

import argparse
import csv
import io
import math
import sys
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
from scipy import stats

SEED = 20261017
N_BOOT = 10_000
FORMAT = "blinkpulse-study-1"

# Section 8 exclusion rules.
MIN_WORK_MS = 15 * 60_000
MIN_USABLE_RATINGS = 5
MIN_DISTINCT_RATINGS = 2

# Section 5 (must match src/blink/sleepiness.ts FLOOR and RATIO_CAP).
FLOOR = {"closed_fraction": 0.01, "long_per_min": 0.2, "mean_blink_ms": 100.0}
RATIO_CAP = 5.0
FACTORS = ("closed_fraction", "long_per_min", "mean_blink_ms")

# Section 7 band rule.
BAND_QUANTILE = 95
BAND_MAX_KSS = 4
BAND_MIN_WINDOWS = 20

# Exploratory AUC split (Section 9.4).
AUC_KSS = 7
# Trend points are every 10 s (EVAL_HOP_MS), so the 60 s window nearest a prompt
# ends at most this long before it.
TREND_HOP_MS = 10_000


# ---------------------------------------------------------------------------
# Reading the export


def parse_study_csv(text: str) -> tuple[dict[str, str], dict[str, list[dict[str, str]]]]:
    """`# key=value` lines and `#section=name` tables (same rules as parseStudyCsv)."""
    meta: dict[str, str] = {}
    sections: dict[str, list[dict[str, str]]] = {}
    current: list[dict[str, str]] | None = None
    header: list[str] | None = None
    for line in text.splitlines():
        if not line:
            continue
        if line.startswith("#section="):
            current = []
            sections[line[len("#section=") :]] = current
            header = None
            continue
        if line.startswith("# ") and "=" in line:
            key, _, value = line[2:].partition("=")
            if key.replace("_", "").isalpha() and key.islower():
                meta[key] = value
            continue
        if line.startswith("#") or current is None:
            continue
        cells = next(csv.reader(io.StringIO(line)))
        if header is None:
            header = cells
        else:
            current.append(dict(zip(header, cells)))
    return meta, sections


def fnum(s: str | None) -> float | None:
    return None if s is None or s == "" else float(s)


@dataclass
class Rating:
    participant: str
    session: int
    index: int
    shown_ms: float
    rating: int | None
    time_on_task_min: float
    window: dict[str, str] | None
    eci60: float | None = None

    @property
    def window_ok(self) -> bool:
        return self.window is not None and self.window.get("ok") == "1"


@dataclass
class Session:
    path: Path
    participant: str
    number: int
    meta: dict[str, str]
    baseline: dict[str, str] | None
    baseline_rating: int | None
    not_alert: bool
    ratings: list[Rating]
    pvt_windows: dict[int, dict[str, str]]
    pvt_summary: dict[int, dict[str, str]]
    exclusion: str | None = None

    @property
    def sid(self) -> str:
        return f"{self.participant}-S{self.number}"


def load_session(path: Path) -> Session:
    meta, sec = parse_study_csv(path.read_text(encoding="utf-8"))
    if meta.get("format") != FORMAT:
        raise ValueError(f"{path}: format is {meta.get('format')!r}, expected {FORMAT!r}")
    steps = [(r["step"], float(r["start_ms"])) for r in sec.get("steps", [])]
    names = [name for (name, _) in steps]
    work_start = work_end = None
    if "work" in names:
        i = names.index("work")
        work_start = steps[i][1]
        # The work block ends when the next step starts (PVT-B 2, or a stop).
        work_end = steps[i + 1][1] if i + 1 < len(steps) else None

    baseline_rows = sec.get("baseline", [])
    baseline = baseline_rows[0] if baseline_rows else None
    baseline_rating = None
    not_alert = False
    if baseline is not None and baseline.get("rating"):
        baseline_rating = int(float(baseline["rating"]))
        not_alert = baseline.get("not_alert") == "1"

    windows = sec.get("windows", [])
    rating_windows = {int(w["ref"]): w for w in windows if w["kind"] == "rating"}
    pvt_windows = {int(w["ref"]): w for w in windows if w["kind"] == "pvt"}

    short_trend = [
        (float(t["t_ms"]), fnum(t["eci"]) if t["ok"] == "1" else None)
        for t in sec.get("trend", [])
        if t["window_ms"] == "60000"
    ]
    ratings: list[Rating] = []
    for r in sec.get("ratings", []):
        if r["kind"] != "work":
            continue
        shown = float(r["shown_ms"])
        idx = int(r["index"])
        eci60 = None
        near = [e for (t, e) in short_trend if shown - TREND_HOP_MS < t <= shown]
        if near:
            eci60 = near[-1]
        ratings.append(
            Rating(
                participant=meta.get("participant", "?"),
                session=int(meta.get("session", "0")),
                index=idx,
                shown_ms=shown,
                rating=int(float(r["rating"])) if r["rating"] else None,
                time_on_task_min=(shown - work_start) / 60_000 if work_start is not None else math.nan,
                window=rating_windows.get(idx),
                eci60=eci60,
            )
        )

    s = Session(
        path=path,
        participant=meta.get("participant", "?"),
        number=int(meta.get("session", "0")),
        meta=meta,
        baseline=baseline,
        baseline_rating=baseline_rating,
        not_alert=not_alert,
        ratings=ratings,
        pvt_windows=pvt_windows,
        pvt_summary={int(p["run"]): p for p in sec.get("pvt_summary", [])},
    )
    # Section 8 session exclusions, in this order.
    if not sec.get("calibration"):
        s.exclusion = "blink calibration failed"
    elif baseline is None:
        s.exclusion = f"alert baseline failed ({meta.get('end_reason', '?')})"
    elif work_start is None or work_end is None or work_end - work_start < MIN_WORK_MS:
        s.exclusion = "work block ended before 15 minutes"
    return s


def load_all(inputs: list[str]) -> list[Session]:
    paths: list[Path] = []
    for item in inputs:
        p = Path(item)
        paths.extend(sorted(p.glob("*.csv")) if p.is_dir() else [p])
    sessions = [load_session(p) for p in paths]
    seen: dict[str, Path] = {}
    for s in sessions:
        if s.sid in seen:
            raise ValueError(f"{s.sid} appears twice: {seen[s.sid]} and {s.path}")
        seen[s.sid] = s.path
    return sorted(sessions, key=lambda s: (s.participant, s.number))


# ---------------------------------------------------------------------------
# Statistics


def eci_from(window: dict[str, str], base: dict[str, str]) -> float:
    """Section 5: the ECI from window factors and a baseline (as eciFromFactors)."""
    total = 0.0
    for f in FACTORS:
        floor = FLOOR[f]
        x = float(window[f])
        x0 = float(base[f])
        total += min(max(x, floor) / max(x0, floor), RATIO_CAP)
    return total / 3


def spearman(x: np.ndarray, y: np.ndarray) -> float:
    """Spearman rho with average ranks for ties; NaN if either side is constant."""
    if len(x) < 2 or np.all(x == x[0]) or np.all(y == y[0]):
        return math.nan
    return float(stats.spearmanr(x, y).statistic)


def _rowwise_spearman(x: np.ndarray, y: np.ndarray) -> np.ndarray:
    """Spearman for each row of two (B, n) arrays; NaN where a row is constant."""
    rx = stats.rankdata(x, axis=1)
    ry = stats.rankdata(y, axis=1)
    rx = rx - rx.mean(axis=1, keepdims=True)
    ry = ry - ry.mean(axis=1, keepdims=True)
    den = np.sqrt((rx * rx).sum(axis=1) * (ry * ry).sum(axis=1))
    with np.errstate(invalid="ignore", divide="ignore"):
        return np.where(den > 0, (rx * ry).sum(axis=1) / den, np.nan)


def bootstrap_spearman(
    x: np.ndarray, y: np.ndarray, rng: np.random.Generator, n_boot: int = N_BOOT
) -> tuple[float, float]:
    """95% percentile interval from resampling the pairs. A resample with a constant
    rating (protocol 9.1) or a constant predictor (rho undefined) is redrawn."""
    n = len(x)
    if math.isnan(spearman(x, y)):
        return (math.nan, math.nan)  # constant on the full sample: no resample can vary
    out = np.empty(0)
    for _ in range(100):
        idx = rng.integers(0, n, size=(n_boot, n))
        rho = _rowwise_spearman(x[idx], y[idx])
        out = np.concatenate([out, rho[~np.isnan(rho)]])
        if len(out) >= n_boot:
            break
    if len(out) < n_boot:
        return (math.nan, math.nan)
    lo, hi = np.percentile(out[:n_boot], [2.5, 97.5])
    return (float(lo), float(hi))


def bootstrap_median(d: np.ndarray, rng: np.random.Generator, n_boot: int = N_BOOT) -> tuple[float, float]:
    """95% percentile interval for the median, resampling participants."""
    if len(d) < 2:
        return (math.nan, math.nan)
    idx = rng.integers(0, len(d), size=(n_boot, len(d)))
    lo, hi = np.percentile(np.median(d[idx], axis=1), [2.5, 97.5])
    return (float(lo), float(hi))


def wilcoxon(values: np.ndarray, alternative: str) -> float:
    """Wilcoxon signed-rank p value (exact when scipy can), NaN if not computable."""
    v = values[~np.isnan(values)]
    if len(v) == 0 or np.all(v == 0):
        return math.nan
    return float(stats.wilcoxon(v, alternative=alternative).pvalue)


def auc(scores: np.ndarray, positive: np.ndarray) -> float:
    """Area under the ROC curve (Mann-Whitney U / n1 n0); ties count half."""
    pos, neg = scores[positive], scores[~positive]
    if len(pos) == 0 or len(neg) == 0:
        return math.nan
    return float(stats.mannwhitneyu(pos, neg).statistic / (len(pos) * len(neg)))


# ---------------------------------------------------------------------------
# Analysis


@dataclass
class ParticipantResult:
    participant: str
    n: int
    sessions: int
    rho: dict[str, float] = field(default_factory=dict)
    ci: dict[str, tuple[float, float]] = field(default_factory=dict)


@dataclass
class H1Result:
    label: str
    analysed: list[ParticipantResult]
    excluded: list[tuple[str, str]]
    p_value: float


def usable(ratings: list[Rating]) -> list[Rating]:
    return [r for r in ratings if r.rating is not None and r.window_ok]


PREDICTORS = {
    "eci": lambda r: float(r.window["eci"]),  # type: ignore[index]
    "time_on_task": lambda r: r.time_on_task_min,
    "blink_rate": lambda r: float(r.window["blinks_per_min"]),  # type: ignore[index]
}


def run_h1(
    label: str,
    sessions: list[Session],
    rng: np.random.Generator,
    predictors: dict,
    eci_of=None,
) -> H1Result:
    """Per-participant Spearman with the KSS (pooled over sessions), bootstrap CIs, and
    the one-sided Wilcoxon on the ECI rhos. `eci_of` overrides the ECI per rating."""
    by_p: dict[str, list[Session]] = {}
    for s in sessions:
        by_p.setdefault(s.participant, []).append(s)
    analysed: list[ParticipantResult] = []
    excluded: list[tuple[str, str]] = []
    for pid in sorted(by_p):
        rs = [r for s in by_p[pid] for r in usable(s.ratings)]
        if eci_of is not None:
            rs = [r for r in rs if eci_of(r) is not None]
        kss = np.array([r.rating for r in rs], dtype=float)
        if len(rs) < MIN_USABLE_RATINGS:
            excluded.append((pid, f"{len(rs)} usable ratings (needs {MIN_USABLE_RATINGS})"))
            continue
        if len(np.unique(kss)) < MIN_DISTINCT_RATINGS:
            excluded.append((pid, "the same rating every time (Spearman undefined)"))
            continue
        res = ParticipantResult(pid, len(rs), len({r.session for r in rs}))
        for name, get in predictors.items():
            fn = eci_of if (name == "eci" and eci_of is not None) else get
            x = np.array([fn(r) for r in rs], dtype=float)
            res.rho[name] = spearman(x, kss)
            res.ci[name] = bootstrap_spearman(x, kss, rng)
        analysed.append(res)
    rhos = np.array([p.rho["eci"] for p in analysed], dtype=float)
    return H1Result(label, analysed, excluded, wilcoxon(rhos, "greater"))


def participant_baselines(sessions: list[Session]) -> dict[str, Session]:
    """Section 9.4 (D1): the session with the lowest baseline KSS, first session on a tie."""
    out: dict[str, Session] = {}
    for s in sessions:
        if s.baseline is None or s.baseline_rating is None:
            continue
        cur = out.get(s.participant)
        if cur is None or (s.baseline_rating, s.number) < (cur.baseline_rating, cur.number):  # type: ignore[operator]
            out[s.participant] = s
    return out


def choose_bands(dev: list[Session]) -> dict:
    """Section 7 band rule on the development subset."""
    values = [
        float(r.window["eci"])  # type: ignore[index]
        for s in dev
        for r in usable(s.ratings)
        if r.rating is not None and r.rating <= BAND_MAX_KSS
    ]
    out: dict = {"n_windows": len(values), "provisional": True}
    if len(values) < BAND_MIN_WINDOWS:
        out["why"] = f"{len(values)} development windows with KSS <= {BAND_MAX_KSS} (needs {BAND_MIN_WINDOWS})"
        return out
    p = float(np.percentile(values, BAND_QUANTILE, method="linear"))
    out["p95"] = p
    if p <= 1:
        out["why"] = f"P = {p:.3f} is not above 1"
        return out
    out.update(provisional=False, c1=p, c2=1 + 2 * (p - 1))
    return out


# ---------------------------------------------------------------------------
# Report


def fmt(x: float, dp: int = 2) -> str:
    return "n/a" if x is None or (isinstance(x, float) and math.isnan(x)) else f"{x:.{dp}f}"


def fmt_ci(ci: tuple[float, float]) -> str:
    return f"[{fmt(ci[0])}, {fmt(ci[1])}]"


def h1_table(h: H1Result, predictors: list[str]) -> list[str]:
    head = "| Participant | n ratings | sessions | " + " | ".join(
        f"rho {p} [95% CI]" for p in predictors
    )
    lines = [head + " |", "|" + "---|" * (3 + len(predictors))]
    for p in h.analysed:
        cells = [f"{fmt(p.rho[k])} {fmt_ci(p.ci[k])}" for k in predictors]
        lines.append(f"| {p.participant} | {p.n} | {p.sessions} | " + " | ".join(cells) + " |")
    if h.analysed:
        meds = []
        for k in predictors:
            v = np.array([p.rho[k] for p in h.analysed], dtype=float)
            v = v[~np.isnan(v)]
            meds.append(
                f"median {fmt(float(np.median(v)))} (range {fmt(float(v.min()))} to {fmt(float(v.max()))})"
                if len(v)
                else "n/a"
            )
        lines.append(f"| **All ({len(h.analysed)})** | | | " + " | ".join(meds) + " |")
    return lines


def report(sessions: list[Session], dev_ids: set[str]) -> str:
    rng = np.random.default_rng(SEED)
    out: list[str] = ["# V3 analysis report", ""]
    out.append(f"Script: `tools/analyze_v3.py`, seed {SEED}, {N_BOOT} bootstrap resamples.")
    wordings = sorted({s.meta.get("rating_wording", "?") for s in sessions})
    out.append(f"Rating wording in the files: {', '.join(wordings)}.")
    if "placeholder" in wordings:
        out.append(
            "**Warning:** some sessions used the placeholder rating wording, so those ratings are"
            " not KSS ratings (protocol D2)."
        )
    commits = sorted({s.meta.get("app_commit", "?") for s in sessions})
    out.append(f"App commits: {', '.join(commits)}.")
    out.append("")

    # Eligibility
    dev = [s for s in sessions if s.participant in dev_ids]
    held = [s for s in sessions if s.participant not in dev_ids]
    out += ["## Sessions and exclusions (Section 8)", ""]
    out.append(
        f"Files: {len(sessions)} sessions from {len({s.participant for s in sessions})} participants."
        f" Development subset (not in the results below): {len(dev)} sessions"
        f" ({', '.join(sorted(dev_ids)) or 'none'})."
    )
    out.append("")
    excluded = [s for s in held if s.exclusion]
    included = [s for s in held if not s.exclusion]
    out.append(f"Held-out sessions: {len(held)}; excluded: {len(excluded)}; included: {len(included)}.")
    for s in excluded:
        out.append(f"- {s.sid} excluded: {s.exclusion}.")
    prompts = [r for s in included for r in s.ratings]
    missing = [r for r in prompts if r.rating is None]
    gated = [r for r in prompts if r.rating is not None and not r.window_ok]
    reasons: dict[str, int] = {}
    for r in gated:
        why = (r.window or {}).get("reason") or "not evaluated"
        reasons[why] = reasons.get(why, 0) + 1
    out.append(
        f"Work-block prompts in included sessions: {len(prompts)}; missing: {len(missing)};"
        f" window failed gating: {len(gated)}"
        + (f" ({', '.join(f'{k} {v}' for k, v in sorted(reasons.items()))})" if reasons else "")
        + f"; usable: {len(prompts) - len(missing) - len(gated)}."
    )
    out.append("")

    # Consistency check: the exported ECI equals the formula on the exported factors.
    mismatch = 0
    checked = 0
    for s in included:
        for r in usable(s.ratings):
            checked += 1
            if abs(eci_from(r.window, s.baseline) - float(r.window["eci"])) > 1e-3:  # type: ignore[arg-type]
                mismatch += 1
    out.append(
        f"Formula check: ECI recomputed from the exported factors and baseline for {checked}"
        f" windows; {mismatch} differ by more than 0.001."
    )
    out.append("")

    # H1 + controls
    preds = ["eci", "time_on_task", "blink_rate"]
    h1 = run_h1("primary", included, rng, PREDICTORS)
    out += ["## H1: ECI vs rating, within participants (Section 9.1)", ""]
    out += h1_table(h1, preds)
    out.append("")
    for pid, why in h1.excluded:
        out.append(f"- {pid} not analysed: {why}.")
    out.append(
        f"One-sided Wilcoxon signed-rank test that the per-participant ECI rhos are above 0:"
        f" n = {len(h1.analysed)}, p = {fmt(h1.p_value, 4)}."
        + (
            " Not computable."
            if math.isnan(h1.p_value)
            else " H1 supported at alpha 0.05." if h1.p_value < 0.05 else " H1 not supported at alpha 0.05."
        )
        + " With this few participants the test has little power."
    )
    out.append("")

    out += ["## Controls: does the ECI add anything? (Section 9.2)", ""]
    for ctl in ("time_on_task", "blink_rate"):
        d = np.array([p.rho["eci"] - p.rho[ctl] for p in h1.analysed], dtype=float)
        d = d[~np.isnan(d)]
        ci = bootstrap_median(d, rng)
        verdict = (
            "not computable"
            if math.isnan(ci[0])
            else ("the ECI adds nothing beyond this control (interval includes 0)" if ci[0] <= 0 <= ci[1] else "interval excludes 0")
        )
        med = fmt(float(np.median(d))) if len(d) else "n/a"
        out.append(f"- rho(ECI) - rho({ctl}): n = {len(d)}, median {med}, 95% CI {fmt_ci(ci)}: {verdict}.")
    out.append("")

    # H2
    out += ["## H2: start vs end PVT-B (Section 9.3)", ""]
    pairs = [
        s for s in included
        if s.pvt_windows.get(1, {}).get("ok") == "1" and s.pvt_windows.get(2, {}).get("ok") == "1"
    ]
    out.append(f"Sessions with both PVT-B windows usable: {len(pairs)} of {len(included)}.")
    out.append("")
    out.append("| Measure | median change (end - start) | per-session changes | two-sided Wilcoxon p |")
    out.append("|---|---|---|---|")
    for m in ("eci", *FACTORS):
        d = np.array([float(s.pvt_windows[2][m]) - float(s.pvt_windows[1][m]) for s in pairs])
        med = fmt(float(np.median(d)), 3) if len(d) else "n/a"
        each = ", ".join(f"{s.sid} {v:+.3f}" for s, v in zip(pairs, d)) or "none"
        out.append(f"| {m} | {med} | {each} | {fmt(wilcoxon(d, 'two-sided'), 4)} |")
    out.append("")
    runs = [
        (s, k) for s in included for k in (1, 2)
        if s.pvt_windows.get(k, {}).get("ok") == "1" and k in s.pvt_summary
    ]
    out.append(f"ECI over each PVT-B run vs its outcomes (descriptive; {len(runs)} runs pooled):")
    out.append("")
    for col in ("lapses", "median_rt_ms", "mean_reciprocal_rt"):
        ok_runs = [(s, k) for s, k in runs if s.pvt_summary[k].get(col)]
        x = np.array([float(s.pvt_windows[k]["eci"]) for s, k in ok_runs])
        y = np.array([float(s.pvt_summary[k][col]) for s, k in ok_runs])
        rho = spearman(x, y)
        ci = bootstrap_spearman(x, y, rng) if not math.isnan(rho) else (math.nan, math.nan)
        out.append(f"- ECI vs {col}: n = {len(x)} runs, rho = {fmt(rho)}, 95% CI {fmt_ci(ci)}.")
    out.append("")

    # Sensitivity
    out += ["## Sensitivity analyses (Section 9.4)", ""]
    bases = participant_baselines(included)

    def eci_participant_baseline(r: Rating) -> float | None:
        b = bases.get(r.participant)
        return None if b is None or b.baseline is None else eci_from(r.window, b.baseline)  # type: ignore[arg-type]

    sens = [
        (
            "Participant-level baseline (D1): ratios against the session with the lowest baseline rating",
            run_h1("participant baseline", included, rng, {"eci": PREDICTORS["eci"]}, eci_participant_baseline),
        ),
        (
            "Without 'baseline not alert' sessions",
            run_h1("alert only", [s for s in included if not s.not_alert], rng, {"eci": PREDICTORS["eci"]}),
        ),
        (
            "60 s window before each prompt (nearest 10 s trend point at or before the prompt)",
            run_h1("60 s", included, rng, {"eci": PREDICTORS["eci"]}, lambda r: r.eci60),
        ),
    ]
    na = sum(1 for s in included if s.not_alert)
    out.append(f"Sessions marked 'baseline not alert': {na}.")
    out.append("")
    for title, h in sens:
        out.append(f"### {title}")
        out.append("")
        out += h1_table(h, ["eci"])
        out.append("")
        for pid, why in h.excluded:
            out.append(f"- {pid} not analysed: {why}.")
        out.append(f"One-sided Wilcoxon: n = {len(h.analysed)}, p = {fmt(h.p_value, 4)}.")
        out.append("")

    pooled = [r for s in included for r in usable(s.ratings)]
    scores = np.array([float(r.window["eci"]) for r in pooled])  # type: ignore[index]
    pos = np.array([r.rating >= AUC_KSS for r in pooled], dtype=bool)  # type: ignore[operator]
    out.append(
        f"**Exploratory only (small sample):** AUC of the ECI for rating >= {AUC_KSS} vs < {AUC_KSS},"
        f" pooled over {len(pooled)} usable ratings ({int(pos.sum())} at {AUC_KSS} or more):"
        f" {fmt(auc(scores, pos), 3)}."
    )
    out.append("")
    return "\n".join(out)


def bands_report(dev: list[Session]) -> str:
    b = choose_bands([s for s in dev if not s.exclusion])
    lines = ["# Band rule (Section 7)", "", f"Development windows with KSS <= {BAND_MAX_KSS}: {b['n_windows']}."]
    if "p95" in b:
        lines.append(f"P (95th percentile, linear interpolation): {b['p95']:.4f}.")
    if b["provisional"]:
        lines.append(f"Provisional bands stay: {b['why']}.")
    else:
        lines.append(f"Final bands: c1 = {b['c1']:.4f}, c2 = {b['c2']:.4f}.")
    return "\n".join(lines) + "\n"


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("inputs", nargs="+", help="study CSV files or folders of them")
    ap.add_argument("--dev", action="append", default=[], help="development-subset participant (repeatable)")
    ap.add_argument("--bands", action="store_true", help="apply the band rule to the --dev participants")
    ap.add_argument("--out", help="write the report here instead of printing it")
    args = ap.parse_args(argv)
    sessions = load_all(args.inputs)
    dev_ids = set(args.dev)
    if args.bands:
        if not dev_ids:
            ap.error("--bands needs at least one --dev participant")
        text = bands_report([s for s in sessions if s.participant in dev_ids])
    else:
        text = report(sessions, dev_ids)
    if args.out:
        Path(args.out).write_text(text, encoding="utf-8")
    else:
        sys.stdout.write(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
