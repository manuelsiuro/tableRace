// Binds the pure DriftModel to a Rapier body. Each step: probe ground, read the
// body's horizontal velocity, run the arcade model, then write the new velocity
// and heading back. Vertical velocity is left to Rapier (gravity / ramps / jumps
// stay physical). Heading is set directly because the body has locked rotations.

import type RAPIER from "@dimforge/rapier3d-compat";
import type { PhysicsWorld } from "../physics/PhysicsWorld";
import { driftStep } from "./DriftModel";
import type { CarStats } from "./CarStats";
import type { InputAction } from "../../shared/inputAction";
import { quatFromYaw } from "../../shared/math";
import { NEUTRAL_SURFACE, type SurfaceModifier } from "../track/SurfaceTable";

export interface CarSpawn {
  x: number;
  z: number;
  yaw: number;
}

export class CarController {
  readonly id: number;
  readonly body: RAPIER.RigidBody;
  readonly stats: CarStats;
  yaw: number;
  drifting = false;

  private readonly physics: PhysicsWorld;
  private readonly groundRayLength: number;
  private readonly spawnY: number;

  constructor(
    physics: PhysicsWorld,
    id: number,
    stats: CarStats,
    spawn: CarSpawn,
  ) {
    this.physics = physics;
    this.id = id;
    this.stats = stats;
    this.yaw = spawn.yaw;

    this.spawnY = stats.halfExtents.y + 0.1;
    this.body = physics.createCarBody(
      { x: spawn.x, y: this.spawnY, z: spawn.z },
      stats.halfExtents,
    );
    this.body.setRotation(quatFromYaw(spawn.yaw), false);

    // Probe just past the chassis bottom.
    this.groundRayLength = stats.halfExtents.y + 0.25;
  }

  /** Teleport back to a spawn, fully stopped — used on round reset / fall-out. */
  respawn(spawn: CarSpawn): void {
    this.body.setTranslation({ x: spawn.x, y: this.spawnY, z: spawn.z }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.yaw = spawn.yaw;
    this.body.setRotation(quatFromYaw(spawn.yaw), true);
    this.drifting = false;
  }

  update(
    input: InputAction,
    dt: number,
    surface: SurfaceModifier = NEUTRAL_SURFACE,
  ): void {
    const probe = this.physics.groundProbe(this.body, this.groundRayLength);
    const grounded = probe !== null;
    const lin = this.body.linvel();

    const out = driftStep({
      vx: lin.x,
      vz: lin.z,
      yaw: this.yaw,
      input,
      stats: this.stats,
      grounded,
      dt,
      surface,
    });

    if (probe) {
      // Project the desired horizontal velocity onto the ground plane so the
      // car climbs ramps (gaining a vertical component) instead of ramming the
      // slope. At the ramp's edge the ground vanishes and this upward velocity
      // becomes the jump.
      const n = probe.normal;
      const dot = out.vx * n.x + out.vz * n.z; // desired horizontal has y = 0
      this.body.setLinvel(
        { x: out.vx - dot * n.x, y: -dot * n.y, z: out.vz - dot * n.z },
        true,
      );
    } else {
      // Airborne: keep gravity-driven vertical velocity, steer/throttle muted.
      this.body.setLinvel({ x: out.vx, y: lin.y, z: out.vz }, true);
    }

    this.yaw = out.yaw;
    this.body.setRotation(quatFromYaw(out.yaw), true);
    this.drifting = out.drifting;
  }
}
