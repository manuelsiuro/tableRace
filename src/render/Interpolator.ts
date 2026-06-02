// Render-side interpolation. The sim ticks at 30 Hz; the display refreshes at
// 60–120 Hz. We blend the previous and current snapshot by `alpha` (the
// fractional progress toward the next tick) so motion is smooth and decoupled
// from the simulation rate. render/ may use shared/math freely.

import { lerp, slerp, type Quat, type Vec3 } from "../shared/math";
import type { CarSnapshot } from "../shared/snapshot";

export interface InterpolatedTransform {
  position: Vec3;
  rotation: Quat;
}

export function interpolateCar(
  prev: CarSnapshot | undefined,
  cur: CarSnapshot,
  alpha: number,
): InterpolatedTransform {
  // No prior sample (entity just appeared) — snap to current.
  if (!prev) {
    return {
      position: { x: cur.x, y: cur.y, z: cur.z },
      rotation: { x: cur.qx, y: cur.qy, z: cur.qz, w: cur.qw },
    };
  }
  return {
    position: {
      x: lerp(prev.x, cur.x, alpha),
      y: lerp(prev.y, cur.y, alpha),
      z: lerp(prev.z, cur.z, alpha),
    },
    rotation: slerp(
      { x: prev.qx, y: prev.qy, z: prev.qz, w: prev.qw },
      { x: cur.qx, y: cur.qy, z: cur.qz, w: cur.qw },
      alpha,
    ),
  };
}
