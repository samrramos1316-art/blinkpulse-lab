/**
 * Twice-a-second brightness hint for the first-run positioning step.
 * Draws the current frame into a 32x24 canvas, computes mean luma, and drops the
 * pixels immediately. Nothing is stored.
 */

import { useEffect, useState } from 'react';
import { brightnessHint, meanLuma, type BrightnessHint } from '../capture/brightness.ts';

const SAMPLE_W = 32;
const SAMPLE_H = 24;
const INTERVAL_MS = 500;

export function useBrightness(
  getVideo: () => HTMLVideoElement | null,
  active: boolean,
): BrightnessHint {
  const [hint, setHint] = useState<BrightnessHint>('unknown');

  useEffect(() => {
    if (!active) return;
    const canvas = document.createElement('canvas');
    canvas.width = SAMPLE_W;
    canvas.height = SAMPLE_H;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const id = window.setInterval(() => {
      const video = getVideo();
      if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
      ctx.drawImage(video, 0, 0, SAMPLE_W, SAMPLE_H);
      const luma = meanLuma(ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H).data);
      ctx.clearRect(0, 0, SAMPLE_W, SAMPLE_H);
      setHint(brightnessHint(luma));
    }, INTERVAL_MS);
    return () => {
      window.clearInterval(id);
      setHint('unknown');
    };
  }, [getVideo, active]);

  return hint;
}
