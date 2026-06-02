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

    const y = stats.halfExtents.y + 0.1;
    this.body = physics.createCarBody(
      { x: spawn.x, y, z: spawn.z },
      stats.halfExtents,
    );
    this.body.setRotation(quatFromYaw(spawn.yaw), false);

    // Probe just past the chassis bottom.
    this.groundRayLength = stats.halfExtents.y + 0.25;
  }

  update(input: InputAction, dt: number): void {
    const grounded = this.physics.isGrounded(this.body, this.groundRayLength);
    const lin = this.body.linvel();

    const out = driftStep({
      vx: lin.x,
      vz: lin.z,
      yaw: this.yaw,
      input,
      stats: this.stats,
      grounded,
      dt,
    });

    this.body.setLinvel({ x: out.vx, y: lin.y, z: out.vz }, true);
    this.yaw = out.yaw;
    this.body.setRotation(quatFromYaw(out.yaw), true);
    this.drifting = out.drifting;
  }
}
