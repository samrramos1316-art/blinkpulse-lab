"""Generate reference fixtures for the hand-written DSP core (PROJECT_SPEC 6.1).

Dev-only. The TypeScript tests compare against the JSON written here; the
fixtures are committed, so this script only needs to run when they change.

    python -m venv .venv
    .venv/Scripts/python -m pip install -r tools/requirements.txt   (Windows)
    .venv/Scripts/python tools/gen_fixtures.py

Every random input uses a fixed seed, and the inputs are stored in the
fixtures so the TypeScript side never has to reproduce NumPy's RNG.
"""

from __future__ import annotations

import json
import platform
from pathlib import Path

import numpy as np
import scipy
from scipy import signal

OUT_DIR = Path(__file__).resolve().parent.parent / "test" / "fixtures"
SEED = 20261016


def meta() -> dict:
    return {
        "generator": "tools/gen_fixtures.py",
        "python": platform.python_version(),
        "numpy": np.__version__,
        "scipy": scipy.__version__,
        "seed": SEED,
    }


def as_list(a: np.ndarray) -> list:
    return [float(v) for v in np.asarray(a, dtype=np.float64).ravel()]


def write(name: str, payload: dict) -> None:
    payload = {"meta": meta(), **payload}
    path = OUT_DIR / f"{name}.json"
    # json uses repr() for floats: shortest string that round-trips float64 exactly.
    path.write_text(json.dumps(payload, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"wrote {path.relative_to(OUT_DIR.parent.parent)} ({path.stat().st_size // 1024} KiB)")


def fft_fixtures(rng: np.random.Generator) -> None:
    cases = []
    for n in (1, 2, 8, 64, 1024):
        re = rng.standard_normal(n)
        im = rng.standard_normal(n)
        out = np.fft.fft(re + 1j * im)
        cases.append({"n": n, "re": as_list(re), "im": as_list(im),
                      "outRe": as_list(out.real), "outIm": as_list(out.imag)})
    # Real input, zero-padded rfft (the spectrum path): 300 samples -> 4096 bins.
    x = rng.standard_normal(300)
    r = np.fft.rfft(x, n=4096)
    write("fft", {
        "complex": cases,
        "rfft": {"x": as_list(x), "n": 4096, "outRe": as_list(r.real), "outIm": as_list(r.imag)},
    })


def window_fixtures() -> None:
    write("window", {
        "hann": [
            {"n": n, "sym": sym, "w": as_list(signal.windows.hann(n, sym=sym))}
            for n in (1, 2, 5, 16, 300) for sym in (True, False)
        ],
    })


def butter_sos(order: int, wn, btype: str, fs: float) -> np.ndarray:
    return signal.butter(order, wn, btype=btype, fs=fs, output="sos")


def filter_fixtures(rng: np.random.Generator) -> None:
    fs = 30.0
    t = np.arange(600) / fs  # 20 s at 30 Hz
    # Slow drift + in-band "pulse" + out-of-band components + noise.
    x = (5.0 + 0.8 * t / t[-1] + 0.5 * np.sin(2 * np.pi * 1.2 * t)
         + 0.3 * np.sin(2 * np.pi * 0.15 * t) + 0.2 * np.sin(2 * np.pi * 6.0 * t)
         + 0.1 * rng.standard_normal(t.size))

    designs = []
    for order in (2, 4):
        for fc, f_s in ((3.0, 30.0), (0.7, 30.0), (10.0, 60.0), (1.0, 7.5)):
            for btype in ("lowpass", "highpass"):
                designs.append({"order": order, "btype": btype, "cutoff": fc, "fs": f_s,
                                "sos": as_list(butter_sos(order, fc, btype, f_s))})

    # Band-pass = high-pass cascade followed by low-pass cascade (PROJECT_SPEC Phase 1).
    bp_sos = np.vstack([butter_sos(4, 0.7, "highpass", fs), butter_sos(4, 3.0, "lowpass", fs)])
    lp_sos = butter_sos(4, 3.0, "lowpass", fs)
    hp_sos = butter_sos(2, 0.7, "highpass", fs)

    freqs = np.array([0.0, 0.1, 0.35, 0.7, 1.0, 1.5, 2.0, 3.0, 5.0, 8.0, 14.9])
    _, h_bp = signal.sosfreqz(bp_sos, worN=freqs, fs=fs)

    filtered = {}
    for name, sos in (("bandpass", bp_sos), ("lowpass4", lp_sos), ("highpass2", hp_sos)):
        filtered[name] = {
            "sos": as_list(sos),
            "zi": as_list(signal.sosfilt_zi(sos)),
            "sosfilt": as_list(signal.sosfilt(sos, x)),
            "sosfiltfilt": as_list(signal.sosfiltfilt(sos, x)),
        }

    write("filters", {
        "fs": fs,
        "x": as_list(x),
        "designs": designs,
        "filtered": filtered,
        "bandpassResponse": {"freqs": as_list(freqs), "re": as_list(h_bp.real),
                             "im": as_list(h_bp.imag)},
    })


def stats_fixtures(rng: np.random.Generator) -> None:
    x = rng.standard_normal(101) * 3.0 + np.linspace(0, 4, 101)
    even = rng.standard_normal(10)
    qs = [0, 1, 5, 25, 50, 75, 95, 99, 100]
    write("stats", {
        "x": as_list(x),
        "even": as_list(even),
        "mean": float(np.mean(x)),
        "std0": float(np.std(x)),
        "std1": float(np.std(x, ddof=1)),
        "median": float(np.median(x)),
        "medianEven": float(np.median(even)),
        "percentiles": {"q": qs, "values": as_list(np.percentile(x, qs))},
        "detrendLinear": as_list(signal.detrend(x, type="linear")),
    })


def peaks_fixtures(rng: np.random.Generator) -> None:
    fs = 30.0
    t = np.arange(450) / fs
    x = (np.sin(2 * np.pi * 1.3 * t) + 0.35 * np.sin(2 * np.pi * 4.1 * t + 0.4)
         + 0.08 * rng.standard_normal(t.size))
    # A plateau, to pin down SciPy's flat-peak (midpoint) rule.
    x[200:204] = x[200:204].max() + 1.0

    def run(**kwargs):
        peaks, props = signal.find_peaks(x, **kwargs)
        prom = signal.peak_prominences(x, peaks)[0]
        return {"kwargs": kwargs, "peaks": [int(p) for p in peaks], "prominences": as_list(prom)}

    write("peaks", {
        "x": as_list(x),
        "cases": [
            run(),
            run(distance=10),
            run(prominence=0.5),
            run(distance=10, prominence=0.5),
            run(height=0.5, distance=7),
        ],
    })


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(SEED)
    fft_fixtures(rng)
    window_fixtures()
    filter_fixtures(rng)
    stats_fixtures(rng)
    peaks_fixtures(rng)


if __name__ == "__main__":
    main()
