/**
 * Try to lock auto-exposure and auto-white-balance (PROJECT_SPEC 5.1: "If
 * getCapabilities() exposes exposure/white-balance controls, try to lock them, but
 * never require it"). Browser-only.
 *
 * W3C MediaStream Image Capture (read 2026-10-17): capabilities `exposureMode` /
 * `whiteBalanceMode` list MeteringMode values; in "manual" mode the parameters are
 * fixed. The spec does not say that switching to manual keeps the current values,
 * so the current `exposureTime` / `colorTemperature` from getSettings() are set
 * explicitly. These constraints must be optional/advanced ("Chrome requires
 * advanced constraints").
 *
 * Call after auto-exposure has settled; locking a bad exposure would keep it.
 */

/** Image Capture extensions; not in TypeScript's DOM lib. */
interface ImageCaptureCapabilities {
  exposureMode?: string[];
  whiteBalanceMode?: string[];
  exposureTime?: { min: number; max: number };
  colorTemperature?: { min: number; max: number };
}
interface ImageCaptureSettings {
  exposureMode?: string;
  whiteBalanceMode?: string;
  exposureTime?: number;
  colorTemperature?: number;
}

export type LockState = 'locked' | 'unsupported' | 'failed';

export interface CameraLockResult {
  exposure: LockState;
  whiteBalance: LockState;
}

async function lockOne(
  track: MediaStreamTrack,
  modeKey: 'exposureMode' | 'whiteBalanceMode',
  valueKey: 'exposureTime' | 'colorTemperature',
): Promise<LockState> {
  // getCapabilities is missing in some browsers (feature-detect).
  const caps = (
    'getCapabilities' in track ? track.getCapabilities() : {}
  ) as ImageCaptureCapabilities;
  const settings = track.getSettings() as ImageCaptureSettings;
  const value = settings[valueKey];
  if (!caps[modeKey]?.includes('manual') || caps[valueKey] === undefined || value === undefined) {
    return 'unsupported';
  }
  try {
    // The constraint names are Image Capture extensions (not in the DOM lib types).
    await track.applyConstraints({
      advanced: [{ [modeKey]: 'manual', [valueKey]: value }],
    });
    return (track.getSettings() as ImageCaptureSettings)[modeKey] === 'manual'
      ? 'locked'
      : 'failed';
  } catch {
    return 'failed';
  }
}

export async function lockCameraAuto(track: MediaStreamTrack): Promise<CameraLockResult> {
  const exposure = await lockOne(track, 'exposureMode', 'exposureTime');
  const whiteBalance = await lockOne(track, 'whiteBalanceMode', 'colorTemperature');
  return { exposure, whiteBalance };
}
