import { describe, expect, it } from 'vitest';
import { BlinkPipeline, type BlinkSnapshot } from '../app/blinkPipeline.ts';
import { EYE_A, EYE_B } from '../vision/landmarks.ts';
import { positionHint } from './setupHints.ts';

const base: BlinkSnapshot = new BlinkPipeline(EYE_A, EYE_B).snapshot();
const face = (eyeSpanFraction: number): BlinkSnapshot => ({
  ...base,
  faceStatus: 'ok',
  eyeSpanFraction,
});

describe('positionHint', () => {
  it('waits for face tracking first', () => {
    expect(positionHint(face(0.2), 'ok', 'loading')).toBe('loading');
    expect(positionHint(face(0.2), 'ok', 'error')).toBe('trackingError');
  });

  it('asks for light when no face is found in a dark frame', () => {
    expect(positionHint(base, 'tooDark', 'ready')).toBe('tooDark');
    expect(positionHint(base, 'ok', 'ready')).toBe('noFace');
  });

  it('puts distance before lighting once a face is found', () => {
    expect(positionHint(face(0.08), 'tooDark', 'ready')).toBe('tooFar');
    expect(positionHint(face(0.5), 'ok', 'ready')).toBe('tooClose');
    expect(positionHint(face(0.2), 'tooDark', 'ready')).toBe('tooDark');
    expect(positionHint(face(0.2), 'ok', 'ready')).toBe('ok');
  });
});
