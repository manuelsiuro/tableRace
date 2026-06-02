// AI driver. Emits the EXACT InputAction a human produces, so the simulation
// can't tell a bot from a player from a remote peer — the same seam AI, replay,
// and netcode all ride on. Pure (no Rapier/DOM): pure-pursuit waypoint follow,
// cornering slowdown, car-avoidance, and rank-based rubber-banding.

import { clamp, lerp, type Vec3 } from "../../shared/math";
import { pointAtProgress, progressAlong } from "../rules/progress";
import { NEUTRAL_INPUT, type InputAction } from "../../shared/inputAction";

/** What the AI knows about a car (XZ ground plane; yaw 0 → +Z forward). */
export interface AiView {
  id: number;
  x: number;
  z: number;
  yaw: number;
  speed: number;
}

export interface AiContext {
  self: AiView;
  waypoints: Vec3[];
  /** Other cars to avoid. */
  others: AiView[];
  /** 0 = leader … 1 = last place. Drives the catch-up rubber-band. */
  rankFactor: number;
}

export interface AiDifficulty {
  /** How far along the path to aim (metres). */
  lookahead: number;
  /** Steering responsiveness. */
  steerGain: number;
  /** Throttle multiplier in the tightest corners (0..1). */
  corneringSlowdown: number;
  /** Distance at which a car ahead triggers avoidance. */
  avoidDist: number;
  /** Throttle when leading (last place always gets full throttle). */
  baseThrottle: number;
}

export const NORMAL_AI: AiDifficulty = {
  lookahead: 9,
  steerGain: 1.6,
  corneringSlowdown: 0.55,
  avoidDist: 4.5,
  baseThrottle: 0.9,
};

/** Signed smallest angle a→b in (-π, π]. */
function angleDiff(a: number, b: number): number {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

export function aiInput(
  ctx: AiContext,
  diff: AiDifficulty = NORMAL_AI,
): InputAction {
  const { self, waypoints } = ctx;
  if (waypoints.length < 2) return { ...NEUTRAL_INPUT, throttle: 1 };

  // Pure pursuit: aim at a point further along the path.
  const progress = progressAlong(waypoints, self.x, self.z);
  const target = pointAtProgress(waypoints, progress + diff.lookahead);
  const desiredYaw = Math.atan2(target.x - self.x, target.z - self.z);
  const turn = angleDiff(desiredYaw, self.yaw);

  let steer = clamp(turn * diff.steerGain, -1, 1);

  // Rubber-band: trailing cars get full throttle, the leader eases off.
  let throttle = lerp(diff.baseThrottle, 1, ctx.rankFactor);
  // Cornering: ease off the throttle the sharper the required turn.
  throttle *= lerp(
    1,
    diff.corneringSlowdown,
    clamp(Math.abs(turn) / 1.0, 0, 1),
  );

  // Avoidance: a car close ahead nudges steering to the open side + eases off.
  const sin = Math.sin(self.yaw);
  const cos = Math.cos(self.yaw);
  for (const o of ctx.others) {
    const rx = o.x - self.x;
    const rz = o.z - self.z;
    const forward = rx * sin + rz * cos;
    const side = rx * cos - rz * sin;
    const dist = Math.hypot(rx, rz);
    if (forward > 0 && dist < diff.avoidDist && Math.abs(side) < 1.5) {
      steer = clamp(steer + (side >= 0 ? -0.6 : 0.6), -1, 1);
      throttle *= 0.7;
    }
  }

  return {
    steer,
    throttle: clamp(throttle, 0, 1),
    brake: 0,
    handbrake: false,
    usePowerup: false,
  };
}

export class AiDriver {
  constructor(private readonly difficulty: AiDifficulty = NORMAL_AI) {}

  update(ctx: AiContext): InputAction {
    return aiInput(ctx, this.difficulty);
  }
}
