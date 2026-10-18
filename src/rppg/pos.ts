/**
 * POS (Plane-Orthogonal-to-Skin) pulse extraction, Wang et al. 2017, as written in
 * PROJECT_SPEC 5.4. Pure.
 *
 * Within each sliding window of l = round(1.6 fs) samples, every channel is divided
 * by its window mean (temporal normalisation), projected onto the plane orthogonal
 * to [1, 1, 1] with S1 = G - B and S2 = G + B - 2R, combined as h = S1 + alpha S2
 * with alpha = std(S1) / std(S2), and overlap-added after removing its mean.
 * A change in intensity that scales all channels equally gives Cn = [c, c, c],
 * so S1 = S2 = 0: it cancels.
 */

export function posWindowLength(fs: number): number {
  return Math.round(1.6 * fs);
}

function std(x: Float64Array): number {
  let m = 0;
  for (const v of x) m += v;
  m /= x.length;
  let s = 0;
  for (const v of x) s += (v - m) ** 2;
  return Math.sqrt(s / x.length);
}

/** Channels R, G, B: uniform samples at `fs`, equal lengths. Returns H (same length). */
export function pos(
  r: ArrayLike<number>,
  g: ArrayLike<number>,
  b: ArrayLike<number>,
  fs: number,
): Float64Array {
  const n = r.length;
  if (g.length !== n || b.length !== n) throw new RangeError('pos: channels differ in length');
  const l = posWindowLength(fs);
  const H = new Float64Array(n);
  if (l < 2 || n < l) return H;
  const s1 = new Float64Array(l);
  const s2 = new Float64Array(l);
  const h = new Float64Array(l);
  for (let end = l - 1; end < n; end++) {
    const m = end - l + 1;
    let mr = 0;
    let mg = 0;
    let mb = 0;
    for (let i = m; i <= end; i++) {
      mr += r[i] as number;
      mg += g[i] as number;
      mb += b[i] as number;
    }
    mr /= l;
    mg /= l;
    mb /= l;
    if (!(mr > 0 && mg > 0 && mb > 0)) continue;
    for (let j = 0; j < l; j++) {
      const cr = (r[m + j] as number) / mr;
      const cg = (g[m + j] as number) / mg;
      const cb = (b[m + j] as number) / mb;
      s1[j] = cg - cb;
      s2[j] = cg + cb - 2 * cr;
    }
    const sd2 = std(s2);
    if (sd2 === 0) continue;
    const alpha = std(s1) / sd2;
    let hm = 0;
    for (let j = 0; j < l; j++) {
      h[j] = (s1[j] as number) + alpha * (s2[j] as number);
      hm += h[j] as number;
    }
    hm /= l;
    for (let j = 0; j < l; j++) H[m + j] = (H[m + j] as number) + (h[j] as number) - hm;
  }
  return H;
}
