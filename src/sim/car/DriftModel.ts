// The heart of the car "feel" — a PURE arcade drift model (no Rapier, no DOM),
// so it is fully unit-testable and deterministic. CarController applies its
// output to a Rapier body each step.
//
// Method: decompose horizontal velocity into forward/lateral against the car's
// heading, apply engine/brake/drag to forward and friction to lateral, then
// RECOMPOSE against the NEW heading. With high grip, killing lateral velocity
// realigns travel to where the car points (it "goes where it points"); when
// drifting, lateral friction drops so the car keeps sliding while it rotates.
//
// Convention: yaw measured so forward = (sin yaw, cos yaw) in XZ (yaw 0 → +Z),
// right = (cos yaw, -sin yaw). Matches quatFromYaw (rotation about +Y).

import { clamp, lerp, moveTowards } from "../../shared/math";
import type { InputAction } from "../../shared/inputAction";
import type { CarStats } from "./CarStats";
import { NEUTRAL_SURFACE, type SurfaceModifier } from "../track/SurfaceTable";

export interface DriftInput {
  /** Horizontal world velocity. */
  vx: number;
  vz: number;
  /** Current heading (radians). */
  yaw: number;
  input: InputAction;
  stats: CarStats;
  grounded: boolean;
  dt: number;
  /** Surface handling multipliers (grass/ice/…); defaults to tarmac. */
  surface?: SurfaceModifier;
}

export interface DriftOutput {
  vx: number;
  vz: number;
  yaw: number;
  /** Horizontal speed after the step. */
  speed: number;
  drifting: boolean;
}

export function driftStep({
  vx,
  vz,
  yaw,
  input,
  stats,
  grounded,
  dt,
  surface = NEUTRAL_SURFACE,
}: DriftInput): DriftOutput {
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);

  // Decompose against current heading.
  let vForward = vx * sin + vz * cos;
  let vLateral = vx * cos - vz * sin;

  const ctrl = grounded ? 1 : stats.airControlFactor;

  // Surface-adjusted effective stats (grass slows, ice removes grip, …).
  const accel = stats.accel * surface.accelMul;
  const maxSpeed = stats.maxSpeed * surface.maxSpeedMul;
  const gripLateral = stats.gripLateral * surface.gripMul;
  const driftLateral = stats.driftLateral * surface.gripMul;

  // --- Longitudinal: throttle / brake / drag -------------------------------
  if (input.throttle > 0) {
    vForward += accel * input.throttle * ctrl * dt;
  }
  if (input.brake > 0) {
    if (vForward > 0) {
      vForward = Math.max(0, vForward - stats.brakeDecel * input.brake * dt);
    } else {
      // Already stopped or reversing — brake becomes reverse throttle.
      vForward -= accel * input.brake * ctrl * dt;
    }
  }
  if (input.throttle === 0 && input.brake === 0) {
    vForward = moveTowards(vForward, 0, stats.dragDecel * dt);
  }
  vForward = clamp(vForward, -stats.reverseMaxSpeed, maxSpeed);

  // --- Lateral: grip vs drift ----------------------------------------------
  const preSpeed = Math.hypot(vForward, vLateral);
  const wantDrift =
    Math.abs(input.steer) > stats.steerDriftThresh || input.handbrake;
  const drifting = grounded && preSpeed > stats.driftSpeedThresh && wantDrift;
  let lateralFriction = drifting ? driftLateral : gripLateral;
  if (!grounded) lateralFriction *= stats.airControlFactor;
  vLateral = moveTowards(vLateral, 0, lateralFriction * dt);

  // --- Steering ------------------------------------------------------------
  // Less twitchy at speed; little authority at a crawl; reversed in reverse.
  const speedFactor = lerp(
    1,
    stats.highSpeedSteerFactor,
    clamp(Math.abs(vForward) / maxSpeed, 0, 1),
  );
  const authority = clamp(Math.abs(vForward) / stats.turnFullSpeed, 0, 1);
  const dir = vForward >= 0 ? 1 : -1;
  const newYaw =
    yaw +
    input.steer * stats.steerRate * speedFactor * authority * dir * ctrl * dt;

  // --- Recompose against the NEW heading -----------------------------------
  const nsin = Math.sin(newYaw);
  const ncos = Math.cos(newYaw);
  const outVx = vForward * nsin + vLateral * ncos;
  const outVz = vForward * ncos - vLateral * nsin;

  return {
    vx: outVx,
    vz: outVz,
    yaw: newYaw,
    speed: Math.hypot(outVx, outVz),
    drifting,
  };
}
