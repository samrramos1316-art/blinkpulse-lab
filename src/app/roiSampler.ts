/**
 * Reads ROI pixels from the current video frame (PROJECT_SPEC 5.4). Browser-only.
 *
 * For each region, only its bounding box is drawn into a small offscreen canvas
 * (`willReadFrequently: true`) and read back with getImageData; the polygon mask is
 * applied in code (rppg/roi.ts). Pixels live only for the duration of the call.
 */

import type { Point } from '../blink/ear.ts';
import { boundingBox, roiStats, type RegionId, type RoiStats } from '../rppg/roi.ts';

export class RoiSampler {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;

  sample(
    video: HTMLVideoElement,
    polygons: Record<RegionId, Point[] | null>,
  ): Record<RegionId, RoiStats | null> {
    const w = video.videoWidth;
    const h = video.videoHeight;
    const out = { forehead: null, leftCheek: null, rightCheek: null } as Record<
      RegionId,
      RoiStats | null
    >;
    const ctx = this.context();
    if (!ctx || w === 0) return out;
    for (const id of Object.keys(polygons) as RegionId[]) {
      const poly = polygons[id];
      const box = poly ? boundingBox(poly, w, h) : null;
      if (!poly || !box) continue;
      if (ctx.canvas.width < box.w || ctx.canvas.height < box.h) {
        ctx.canvas.width = Math.max(ctx.canvas.width, box.w);
        ctx.canvas.height = Math.max(ctx.canvas.height, box.h);
      }
      ctx.drawImage(video, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
      out[id] = roiStats(ctx.getImageData(0, 0, box.w, box.h).data, box, poly);
    }
    return out;
  }

  close(): void {
    if (this.canvas) {
      this.canvas.width = 0;
      this.canvas.height = 0;
    }
    this.canvas = null;
    this.ctx = null;
  }

  private context(): CanvasRenderingContext2D | null {
    if (!this.ctx) {
      this.canvas = document.createElement('canvas');
      this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    }
    return this.ctx;
  }
}
