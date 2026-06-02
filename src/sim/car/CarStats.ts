// Tunable car parameters. All "feel" lives here as DATA so it can be balanced
// without touching logic (DriftModel is pure and stat-driven). "Multiple cars
// with different skills" = different rows in this table. Distances in metres,
// speeds m/s, accels m/s², angles rad.

import type { Vec3 } from "../../shared/math";

export interface CarStats {
  /** Top forward speed. */
  maxSpeed: number;
  /** Forward acceleration from throttle. */
  accel: number;
  /** Deceleration from the brake while moving forward. */
  brakeDecel: number;
  /** Top reverse speed. */
  reverseMaxSpeed: number;
  /** Engine braking when neither throttle nor brake is held. */
  dragDecel: number;
  /** Yaw rate at low speed (rad/s). */
  steerRate: number;
  /** Steering multiplier as speed approaches maxSpeed (twitch-guard). */
  highSpeedSteerFactor: number;
  /** Speed at which full steering authority is available. */
  turnFullSpeed: number;
  /** Lateral friction with grip — how fast sideways slip is killed (m/s²). */
  gripLateral: number;
  /** Lateral friction while drifting — much lower, so the car slides. */
  driftLateral: number;
  /** Minimum speed before a drift can start. */
  driftSpeedThresh: number;
  /** |steer| above this (or handbrake) requests a drift. */
  steerDriftThresh: number;
  /** Control authority while airborne (fraction of grounded). */
  airControlFactor: number;
  /** Collider half-extents (visual + physics box). */
  halfExtents: Vec3;
}

export const BALANCED: CarStats = {
  maxSpeed: 26,
  accel: 30,
  brakeDecel: 45,
  reverseMaxSpeed: 8,
  dragDecel: 12,
  steerRate: 2.8,
  highSpeedSteerFactor: 0.5,
  turnFullSpeed: 6,
  gripLateral: 60,
  driftLateral: 6,
  driftSpeedThresh: 8,
  steerDriftThresh: 0.5,
  airControlFactor: 0.15,
  halfExtents: { x: 0.6, y: 0.4, z: 1.0 },
};

export const SPEEDSTER: CarStats = {
  ...BALANCED,
  maxSpeed: 32,
  accel: 34,
  gripLateral: 46,
  driftSpeedThresh: 7,
};

export const GRIPPER: CarStats = {
  ...BALANCED,
  maxSpeed: 23,
  accel: 28,
  gripLateral: 80,
  steerRate: 3.1,
  driftSpeedThresh: 10,
};

export const HEAVY: CarStats = {
  ...BALANCED,
  maxSpeed: 24,
  accel: 22,
  brakeDecel: 38,
  gripLateral: 55,
  halfExtents: { x: 0.7, y: 0.45, z: 1.15 },
};

export interface CarProfile {
  id: string;
  name: string;
  stats: CarStats;
}

/** The roster used by car-select; ids are stable wire identifiers. */
export const CAR_PROFILES: readonly CarProfile[] = [
  { id: "balanced", name: "Runner", stats: BALANCED },
  { id: "speedster", name: "Bolt", stats: SPEEDSTER },
  { id: "gripper", name: "Hugger", stats: GRIPPER },
  { id: "heavy", name: "Tank", stats: HEAVY },
];

export function profileById(id: string): CarProfile {
  return CAR_PROFILES.find((p) => p.id === id) ?? CAR_PROFILES[0];
}
