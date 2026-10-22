import { describe, expect, it } from 'vitest';
import type { FusionResult } from '../rppg/fusion.ts';
import type { PulseUpdate, RegionReport } from '../rppg/pulseEstimator.ts';
import { PULSE_COPY, PULSE_FLAG_TEXT } from './copy.ts';
import { combinedRow, labSummary, mainFlagText, pulseCard, regionRow } from './pulseDisplay.ts';

const fusion = (over: Partial<FusionResult> = {}): FusionResult => ({
  bpm: 71.6,
  level: 'good',
  kept: ['forehead', 'leftCheek'],
  agreementBpm: 2,
  singleRegion: false,
  regionsDisagree: false,
  reason: null,
  ...over,
});

const update = (over: Partial<PulseUpdate> = {}): PulseUpdate => ({
  tMs: 12_000,
  status: 'ok',
  regions: [],
  fusion: fusion(),
  globalFlags: [],
  displayBpm: 71.6,
  level: 'good',
  rawBpm: 71.6,
  fps: 30,
  ...over,
});

describe('pulseCard', () => {
  it('shows the smoothed BPM with its quality when at least Fair', () => {
    expect(pulseCard(update(), true, 'ok')).toEqual({ value: '72', status: '', level: 'good' });
  });

  it('never shows a number before the first window, when not live, or below Fair', () => {
    expect(pulseCard(null, false, 'ok').value).toBe('-');
    expect(pulseCard(update({ status: 'warmingUp' }), true, 'ok')).toMatchObject({
      value: '-',
      status: PULSE_COPY.warmingUp,
    });
    const poor = pulseCard(
      update({
        status: 'notEnoughSignal',
        displayBpm: null,
        level: 'poor',
        globalFlags: ['motion'],
      }),
      true,
      'ok',
    );
    expect(poor).toEqual({ value: '-', status: PULSE_FLAG_TEXT.motion, level: 'poor' });
  });

  it('gives the reason: face lost, slow camera, generic', () => {
    expect(
      pulseCard(update({ status: 'gap', displayBpm: null, level: 'poor' }), true, 'noFace'),
    ).toEqual({ value: '-', status: PULSE_COPY.noFace, level: null });
    expect(pulseCard(update({ status: 'fpsTooLow', displayBpm: null }), true, 'ok').status).toBe(
      PULSE_COPY.fpsTooLow,
    );
    expect(
      pulseCard(update({ status: 'notEnoughSignal', displayBpm: null }), true, 'ok').status,
    ).toBe(PULSE_COPY.notEnoughSignal);
  });

  it('notes a single region and disagreement', () => {
    const v = pulseCard(
      update({ level: 'fair', fusion: fusion({ singleRegion: true, regionsDisagree: true }) }),
      true,
      'ok',
    );
    expect(v.status).toBe(`${PULSE_COPY.singleRegion} ${PULSE_COPY.regionsDisagree}`);
  });
});

describe('region rows and flag text', () => {
  const report = (over: Partial<RegionReport>): RegionReport => ({
    id: 'forehead',
    bpm: 70.2,
    timeBpm: 71,
    sqi: 0.8,
    level: 'good',
    flags: [],
    failure: null,
    estimate: null,
    ...over,
  });

  it('shows "-" for poor regions and the main flag as the note', () => {
    expect(regionRow(report({}), true)).toEqual({
      label: 'Forehead',
      bpm: '70',
      quality: 'Quality: Good',
      reason: 'Used',
      kept: true,
    });
    expect(regionRow(report({ level: 'poor', flags: ['lowFps', 'dark'] }), false)).toMatchObject({
      bpm: '-',
      reason: PULSE_FLAG_TEXT.dark,
    });
    expect(regionRow(report({ bpm: null, level: null, failure: 'gap' }), false).reason).toBe(
      'Interrupted in the last 10 s',
    );
  });

  it('Signal Lab summary: a rate only at Fair or better, no stray dashes', () => {
    expect(labSummary(null, false)).toBe('No estimate yet: start the camera and wait 10 seconds.');
    expect(labSummary(report({}), true)).toBe('Forehead: 70 BPM. Quality: Good. Used.');
    const poor = labSummary(report({ level: 'poor', flags: ['dark'] }), false);
    expect(poor).toBe(
      `Forehead: no pulse rate shown. Quality: Poor. ${PULSE_FLAG_TEXT.dark}.`.replace('..', '.'),
    );
    expect(poor).not.toContain('70');
    expect(labSummary(report({ bpm: null, level: null, failure: 'gap' }), false)).toBe(
      'Forehead: no pulse rate shown. Interrupted in the last 10 s.',
    );
  });

  it('flag priority: motion first', () => {
    expect(mainFlagText(['crossCheck', 'motion'])).toBe(PULSE_FLAG_TEXT.motion);
    expect(mainFlagText([])).toBeNull();
  });
});

describe('combinedRow', () => {
  it('shows the fused value at Fair or better', () => {
    expect(combinedRow(fusion())).toEqual({ bpm: '72', note: 'Regions agree within 2.0 BPM.' });
    expect(combinedRow(fusion({ agreementBpm: null, singleRegion: true, level: 'fair' }))).toEqual({
      bpm: '72',
      note: 'One region used.',
    });
  });

  it('hides the fused value when disagreement lowers it to Poor', () => {
    const r = combinedRow(fusion({ level: 'poor', agreementBpm: 11, regionsDisagree: true }));
    expect(r.bpm).toBe('-');
    expect(r.note).toBe('Regions differ by 11.0 BPM. Quality: Poor.');
  });
});
