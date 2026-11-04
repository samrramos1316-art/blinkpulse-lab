/**
 * Bland-Altman plot for validation V2 (PROJECT_SPEC 7.3), written as a standalone SVG
 * by `npm run eval -- ... --plot out.svg`. Hand-written: no charting library.
 *
 * Each point is one paired value: x is the mean of estimate and reference, y is
 * estimate minus reference. The statistics come from `agreement`, so the plot always
 * matches the numbers `npm run eval` prints.
 */

import { agreement } from '../src/rppg/agreement.ts';

const WIDTH = 720;
const HEIGHT = 480;
const LEFT = 64;
const RIGHT = 150;
const TOP = 56;
const BOTTOM = 56;

const round = (v: number): string => String(Math.round(v * 100) / 100);

const signed = (v: number): string => `${v >= 0 ? '+' : ''}${v.toFixed(2)}`;

function escapeXml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** Evenly spaced round numbers covering lo to hi, about `count` of them. */
export function niceTicks(lo: number, hi: number, count = 6): number[] {
  const span = hi - lo;
  if (!(span > 0)) return [lo];
  const rough = span / count;
  const power = 10 ** Math.floor(Math.log10(rough));
  const fraction = rough / power;
  const step = (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * power;
  const ticks: number[] = [];
  for (let i = Math.ceil(lo / step); i * step <= hi + step * 1e-9; i++) {
    ticks.push(Math.round(i * step * 1e6) / 1e6);
  }
  return ticks;
}

/** Widen a range by 5% each side, or by 1 each side when it has no width. */
function padded(values: readonly number[]): [number, number] {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = hi > lo ? (hi - lo) * 0.05 : 1;
  return [lo - pad, hi + pad];
}

function text(
  x: number,
  y: number,
  content: string,
  anchor: 'start' | 'middle' | 'end' = 'start',
  extra = '',
): string {
  return `<text x="${round(x)}" y="${round(y)}" text-anchor="${anchor}"${extra}>${escapeXml(content)}</text>`;
}

/** The plot as an SVG document. With no pairs it says so instead of drawing axes. */
export function blandAltmanSvg(
  estimates: readonly number[],
  references: readonly number[],
  title: string,
): string {
  const a = agreement(estimates, references);
  const head =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${String(WIDTH)} ${String(HEIGHT)}" ` +
    `width="${String(WIDTH)}" height="${String(HEIGHT)}" role="img" aria-labelledby="t d" ` +
    `font-family="sans-serif" font-size="13" fill="black">`;
  const description =
    a.n === 0
      ? 'No values were paired with the reference.'
      : `Difference against mean of estimate and reference, n = ${String(a.n)}. ` +
        `Bias ${a.bias.toFixed(2)} BPM` +
        (Number.isFinite(a.loaLow)
          ? `, 95% limits of agreement ${a.loaLow.toFixed(2)} to ${a.loaHigh.toFixed(2)} BPM.`
          : '; limits need at least 2 values.');
  const open = [
    head,
    `<title id="t">${escapeXml(title)}</title>`,
    `<desc id="d">${escapeXml(description)}</desc>`,
    `<rect width="${String(WIDTH)}" height="${String(HEIGHT)}" fill="white"/>`,
    text(LEFT, 26, title, 'start', ' font-size="16"'),
  ];
  if (a.n === 0) {
    return [...open, text(LEFT, 60, description), '</svg>\n'].join('\n');
  }

  const means: number[] = [];
  const diffs: number[] = [];
  for (let i = 0; i < a.n; i++) {
    const e = estimates[i] as number;
    const r = references[i] as number;
    means.push((e + r) / 2);
    diffs.push(e - r);
  }
  const hasLimits = Number.isFinite(a.loaLow) && Number.isFinite(a.loaHigh);
  const [xLo, xHi] = padded(means);
  const [yLo, yHi] = padded([...diffs, 0, a.bias, ...(hasLimits ? [a.loaLow, a.loaHigh] : [])]);
  const plotW = WIDTH - LEFT - RIGHT;
  const plotH = HEIGHT - TOP - BOTTOM;
  const px = (v: number) => LEFT + ((v - xLo) / (xHi - xLo)) * plotW;
  const py = (v: number) => TOP + plotH - ((v - yLo) / (yHi - yLo)) * plotH;
  const right = LEFT + plotW;
  const bottom = TOP + plotH;

  const hLine = (v: number, extra: string) =>
    `<line x1="${String(LEFT)}" x2="${String(right)}" y1="${round(py(v))}" y2="${round(py(v))}" stroke="black"${extra}/>`;

  const parts = [
    ...open,
    text(LEFT, 44, `n = ${String(a.n)} paired values`),
    `<rect x="${String(LEFT)}" y="${String(TOP)}" width="${String(plotW)}" height="${String(plotH)}" fill="none" stroke="black"/>`,
  ];
  for (const t of niceTicks(xLo, xHi)) {
    parts.push(
      `<line x1="${round(px(t))}" x2="${round(px(t))}" y1="${String(bottom)}" y2="${String(bottom + 5)}" stroke="black"/>`,
      text(px(t), bottom + 20, String(t), 'middle'),
    );
  }
  for (const t of niceTicks(yLo, yHi)) {
    parts.push(
      `<line x1="${String(LEFT - 5)}" x2="${String(LEFT)}" y1="${round(py(t))}" y2="${round(py(t))}" stroke="black"/>`,
      text(LEFT - 9, py(t) + 4, String(t), 'end'),
    );
  }
  parts.push(
    text(LEFT + plotW / 2, HEIGHT - 12, 'Mean of estimate and reference (BPM)', 'middle'),
    text(
      18,
      TOP + plotH / 2,
      'Estimate minus reference (BPM)',
      'middle',
      ` transform="rotate(-90 18 ${round(TOP + plotH / 2)})"`,
    ),
    // Line styles, not colour, tell the lines apart.
    hLine(0, ' stroke-opacity="0.35"'),
    hLine(a.bias, ' stroke-width="2"'),
    text(right + 8, py(a.bias) + 4, `Bias ${signed(a.bias)}`),
  );
  if (hasLimits) {
    parts.push(
      hLine(a.loaHigh, ' stroke-dasharray="6 4"'),
      hLine(a.loaLow, ' stroke-dasharray="6 4"'),
      text(right + 8, py(a.loaHigh) + 4, `Upper ${signed(a.loaHigh)}`),
      text(right + 8, py(a.loaLow) + 4, `Lower ${signed(a.loaLow)}`),
    );
  }
  for (let i = 0; i < a.n; i++) {
    parts.push(
      `<circle cx="${round(px(means[i] as number))}" cy="${round(py(diffs[i] as number))}" r="3" fill="none" stroke="black"/>`,
    );
  }
  parts.push('</svg>\n');
  return parts.join('\n');
}
