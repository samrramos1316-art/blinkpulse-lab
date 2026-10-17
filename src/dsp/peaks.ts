/**
 * Peak finding with minimum height, minimum distance, and minimum prominence.
 * Semantics follow scipy.signal.find_peaks (filters applied in the order
 * height -> distance -> prominence) and scipy.signal.peak_prominences (wlen=None).
 */

export interface FindPeaksOptions {
  /** Minimum peak value. */
  minHeight?: number;
  /** Minimum distance between peaks, in samples (>= 1). Higher peaks win. */
  minDistance?: number;
  /** Minimum prominence. */
  minProminence?: number;
}

export interface PeaksResult {
  /** Sample indices of the peaks, ascending. */
  indices: number[];
  /** Prominence of each returned peak. */
  prominences: number[];
}

/**
 * Local maxima. A flat-topped peak (plateau) is reported at its middle sample,
 * rounded down, as SciPy does. End samples are never peaks.
 */
export function localMaxima(x: ArrayLike<number>): number[] {
  const peaks: number[] = [];
  const last = x.length - 1;
  let i = 1;
  while (i < last) {
    if ((x[i - 1] as number) < (x[i] as number)) {
      let ahead = i + 1;
      while (ahead < last && x[ahead] === x[i]) ahead++;
      if ((x[ahead] as number) < (x[i] as number)) {
        peaks.push(Math.floor((i + ahead - 1) / 2));
        i = ahead;
      }
    }
    i++;
  }
  return peaks;
}

/**
 * Prominence of each peak: height above the higher of the two lowest points
 * reached before meeting a higher sample (or the signal end) on each side.
 */
export function peakProminences(x: ArrayLike<number>, peaks: readonly number[]): number[] {
  return peaks.map((peak) => {
    const height = x[peak] as number;
    let leftMin = height;
    for (let i = peak; i >= 0 && (x[i] as number) <= height; i--) {
      if ((x[i] as number) < leftMin) leftMin = x[i] as number;
    }
    let rightMin = height;
    for (let i = peak; i < x.length && (x[i] as number) <= height; i++) {
      if ((x[i] as number) < rightMin) rightMin = x[i] as number;
    }
    return height - Math.max(leftMin, rightMin);
  });
}

/** Keeps the highest peaks, removing any lower peak closer than `distance` samples. */
function selectByDistance(
  x: ArrayLike<number>,
  peaks: readonly number[],
  distance: number,
): number[] {
  const minGap = Math.ceil(distance);
  const keep = new Array<boolean>(peaks.length).fill(true);
  // Highest first; ties broken by position (stable sort) for determinism.
  const order = peaks
    .map((_, j) => j)
    .sort((a, b) => (x[peaks[b] as number] as number) - (x[peaks[a] as number] as number));
  for (const j of order) {
    if (!keep[j]) continue;
    const pj = peaks[j] as number;
    for (let k = j - 1; k >= 0 && pj - (peaks[k] as number) < minGap; k--) keep[k] = false;
    for (let k = j + 1; k < peaks.length && (peaks[k] as number) - pj < minGap; k++)
      keep[k] = false;
  }
  return peaks.filter((_, j) => keep[j]);
}

export function findPeaks(x: ArrayLike<number>, options: FindPeaksOptions = {}): PeaksResult {
  const { minHeight, minDistance, minProminence } = options;
  if (minDistance !== undefined && !(minDistance >= 1)) {
    throw new RangeError(`minDistance must be >= 1 sample, got ${minDistance}`);
  }
  let peaks = localMaxima(x);
  if (minHeight !== undefined) peaks = peaks.filter((p) => (x[p] as number) >= minHeight);
  if (minDistance !== undefined) peaks = selectByDistance(x, peaks, minDistance);
  let prominences = peakProminences(x, peaks);
  if (minProminence !== undefined) {
    const kept = peaks.map((_, j) => j).filter((j) => (prominences[j] as number) >= minProminence);
    peaks = kept.map((j) => peaks[j] as number);
    prominences = kept.map((j) => prominences[j] as number);
  }
  return { indices: peaks, prominences };
}

/** Converts a minimum spacing in milliseconds to samples at a uniform rate `fs` (Hz). */
export function msToSamples(ms: number, fs: number): number {
  return Math.max(1, Math.round((ms / 1000) * fs));
}
