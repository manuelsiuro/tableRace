// Per-surface handling modifiers, multiplied into the car stats by DriftModel.
// Tarmac is the 1.0 baseline. Grass/sand slow you and reduce grip (risky
// shortcuts); ice/oil keep speed but gut grip (long slides).

import type { SurfaceId } from "./TrackDef";

export interface SurfaceModifier {
  gripMul: number;
  accelMul: number;
  maxSpeedMul: number;
}

export const NEUTRAL_SURFACE: SurfaceModifier = {
  gripMul: 1,
  accelMul: 1,
  maxSpeedMul: 1,
};

export const SURFACE_TABLE: Record<SurfaceId, SurfaceModifier> = {
  tarmac: { gripMul: 1, accelMul: 1, maxSpeedMul: 1 },
  grass: { gripMul: 0.5, accelMul: 0.7, maxSpeedMul: 0.7 },
  ice: { gripMul: 0.15, accelMul: 1, maxSpeedMul: 1 },
  sand: { gripMul: 0.5, accelMul: 0.4, maxSpeedMul: 0.5 },
  oil: { gripMul: 0.1, accelMul: 1, maxSpeedMul: 1 },
};
