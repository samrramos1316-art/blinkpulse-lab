/**
 * Turns a hand-written reference log (`time,bpm`, clock times read from a video of the
 * reference device) into the `wall_time_ms,bpm` file `npm run eval` reads (V2b,
 * PROJECT_SPEC 7.3). Times are local to this computer, whose clock also stamps traces.
 */

import { MAX_REFERENCE_SPAN_MS } from '../src/rppg/agreement.ts';

const TWELVE_HOURS_MS = 12 * 3_600_000;
/** Excel and Notepad can start a CSV with this character. */
const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);

export interface ClockLogResult {
  /** The `wall_time_ms,bpm` file. */
  csv: string;
  readings: number;
  /** Gaps too long for `npm run eval` to compare values inside them, as `from-to`. */
  longGaps: string[];
}

function parseDate(date: string): [number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new Error(`Date must look like 2026-11-03, got "${date}"`);
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const check = new Date(y, mo - 1, d);
  if (check.getMonth() !== mo - 1 || check.getDate() !== d) {
    throw new Error(`Not a real date: "${date}"`);
  }
  return [y, mo, d];
}

function parseTime(time: string, line: number): [number, number, number] {
  const m = /^(\d{1,2}):(\d{2}):(\d{2})$/.exec(time);
  const [h, mi, s] = m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [NaN, NaN, NaN];
  if (!(h < 24 && mi < 60 && s < 60)) {
    throw new Error(`Line ${String(line)}: time must look like 16:05:10, got "${time}"`);
  }
  return [h, mi, s];
}

export function clockLogToReference(text: string, date: string): ClockLogResult {
  const [y, mo, d] = parseDate(date);
  const lines = text
    .replace(BYTE_ORDER_MARK, '')
    .split(/\r?\n/)
    .map((l, i) => ({ number: i + 1, cells: l.split(',').map((c) => c.trim()) }))
    .filter((l) => l.cells.join('') !== '');
  const header = lines.shift()?.cells;
  const timeCol = header?.indexOf('time') ?? -1;
  const bpmCol = header?.indexOf('bpm') ?? -1;
  if (timeCol < 0 || bpmCol < 0) throw new Error('The log needs the columns "time,bpm"');

  const rows = ['wall_time_ms,bpm'];
  const longGaps: string[] = [];
  let previousMs: number | null = null;
  let previousTime = '';
  let dayOffset = 0;
  for (const { number, cells } of lines) {
    const time = cells[timeCol] ?? '';
    const [h, mi, s] = parseTime(time, number);
    const bpm = Number(cells[bpmCol]);
    if (cells[bpmCol] === '' || !(bpm > 0)) {
      throw new Error(`Line ${String(number)}: bpm must be a positive number`);
    }
    let ms = new Date(y, mo - 1, d + dayOffset, h, mi, s).getTime();
    // A large step back means the log crossed midnight; a small one is a typing slip.
    if (previousMs !== null && ms < previousMs - TWELVE_HOURS_MS) {
      dayOffset++;
      ms = new Date(y, mo - 1, d + dayOffset, h, mi, s).getTime();
    }
    if (previousMs !== null && ms <= previousMs) {
      throw new Error(`Line ${String(number)}: ${time} is not after ${previousTime}`);
    }
    if (previousMs !== null && ms - previousMs > MAX_REFERENCE_SPAN_MS) {
      longGaps.push(`${previousTime}-${time}`);
    }
    rows.push(`${String(ms)},${String(bpm)}`);
    previousMs = ms;
    previousTime = time;
  }
  if (lines.length === 0) throw new Error('The log has no readings');
  return { csv: `${rows.join('\n')}\n`, readings: lines.length, longGaps };
}
