import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { runScenario } from '../../rppg/simulate.ts';
import { PULSE_COPY, PULSE_FLAG_TEXT } from '../copy.ts';
import { DISCLAIMER } from '../strings.ts';
import { BreakItLab } from './BreakItLab.tsx';
import {
  applyPreset,
  BASE_SCENARIO,
  describeResult,
  matchingPreset,
  PRESETS,
  resultChart,
  resultLines,
  shownQuality,
  warningsRaised,
  withheldReasons,
} from './breakItModel.ts';

const preset = (id: string) => {
  const p = PRESETS.find((x) => x.id === id);
  if (!p) throw new Error(`No preset ${id}`);
  return p;
};
const run = (id: string) => runScenario(applyPreset(preset(id), 1));

describe('presets', () => {
  it('good conditions need no change from the starting scenario', () => {
    expect(applyPreset(preset('clean'), 1)).toEqual(BASE_SCENARIO);
    expect(matchingPreset(BASE_SCENARIO)?.id).toBe('clean');
  });

  it('are matched whatever the seed, and not once a control has moved', () => {
    expect(matchingPreset(applyPreset(preset('dim'), 7))?.id).toBe('dim');
    expect(matchingPreset({ ...BASE_SCENARIO, noiseSd: 2.9 })).toBeNull();
  });
});

describe('withheldReasons', () => {
  it('uses the wording of the Pulse tab, most frequent first', () => {
    const dark = withheldReasons(run('dim'));
    expect(dark[0]?.reason).toBe(PULSE_FLAG_TEXT.dark);
    expect(dark[0]?.seconds).toBe(50);
    expect(withheldReasons(run('lowFps'))[0]?.reason).toBe(PULSE_COPY.fpsTooLow);
  });

  it('has nothing to report when a value was always shown', () => {
    const r = run('clean');
    const total = withheldReasons(r).reduce((s, x) => s + x.seconds, 0);
    expect(total).toBe(r.hops.length - r.shown);
  });
});

describe('warningsRaised', () => {
  it('reports the flicker warning even though values are still shown', () => {
    const r = run('lamp');
    expect(r.shown).toBeGreaterThan(40);
    const flicker = warningsRaised(r).find((w) => w.reason === PULSE_FLAG_TEXT.flicker);
    expect(flicker?.seconds).toBeGreaterThan(40);
  });

  it('is empty with no noise', () => {
    expect(warningsRaised(runScenario({ ...BASE_SCENARIO, noiseSd: 0 }))).toEqual([]);
  });

  it('shows the cross-check warning at the default noise instead of hiding it', () => {
    const crossCheck = warningsRaised(run('clean')).find(
      (w) => w.reason === PULSE_FLAG_TEXT.crossCheck,
    );
    expect(crossCheck?.seconds).toBeGreaterThan(0);
  });
});

describe('shownQuality', () => {
  it('adds up to the shown values, and flicker lowers Good to Fair', () => {
    const quiet = runScenario({ ...BASE_SCENARIO, noiseSd: 0 });
    const q = shownQuality(quiet);
    expect(q.good + q.fair).toBe(quiet.shown);
    expect(q.good).toBe(quiet.shown);
    const lamp = runScenario({ ...BASE_SCENARIO, noiseSd: 0, flickerPercent: 1, flickerBpm: 72 });
    expect(shownQuality(lamp).good).toBeLessThan(5);
  });
});

describe('resultLines', () => {
  it('reports the shown share and the errors', () => {
    const lines = resultLines(run('clean'));
    expect(lines[0]).toMatch(/^A value was shown for \d+ of 50 seconds/);
    expect(lines[1]).toMatch(/^Quality of those values: Good \d+, Fair \d+\.$/);
    expect(lines[2]).toMatch(/typically \(median\)/);
    expect(lines[3]).toMatch(/^Off by more than 5 BPM: 0 of \d+\.$/);
  });

  it('with no pulse, calls every shown value wrong and reports no error figures', () => {
    const none = { ...run('noPulse'), shown: 0, wrong: 0 };
    expect(resultLines(none).join(' ')).toContain('has no pulse, and the app showed no value');
    const some = { ...run('noPulse'), shown: 2, wrong: 2 };
    expect(resultLines(some).join(' ')).toContain('all 2 of those values are wrong');
    expect(resultLines(some).join(' ')).not.toContain('median');
  });
});

describe('resultChart', () => {
  it('draws one point per shown value, and the truth only when there is a pulse', () => {
    const r = run('clean');
    expect(resultChart(r).markers).toHaveLength(r.shown);
    expect(resultChart(r).lines).toHaveLength(1);
    expect(resultChart(run('noPulse')).lines).toHaveLength(0);
  });

  it('shades the first 10 s and each second with no value', () => {
    const r = run('dim');
    expect(resultChart(r).bands).toHaveLength(1 + r.hops.length);
    expect(resultChart(r).bands[0]).toEqual({ x0: 0, x1: 10 });
  });

  it('has a text alternative with the truth and the result', () => {
    expect(describeResult(run('clean'))).toContain('The true rate is 72 BPM.');
    expect(describeResult(run('noPulse'))).toContain('The signal has no pulse.');
  });
});

describe('BreakItLab page', () => {
  const html = renderToString(<BreakItLab />);

  it('says the signal is simulated and shows the disclaimer', () => {
    expect(html).toContain('Simulated');
    expect(html).toContain(DISCLAIMER);
    expect(html).toContain('not how accurate the app is on real people');
  });

  it('has every preset and control, all reachable as native inputs', () => {
    for (const p of PRESETS) expect(html).toContain(p.label);
    expect(html.match(/type="range"/g)).toHaveLength(8);
    expect(html).toContain('type="checkbox"');
  });

  it('asks for no camera', () => {
    expect(html).not.toContain('<video');
  });
});
