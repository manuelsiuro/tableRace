// Thin wrapper around a Rapier world. Keeps the fixed timestep pinned (so the
// integrator is deterministic at our tick rate) and provides the few body
// factories the simulation needs. Lives in sim/ — Rapier is allowed here, but
// never three/pixi/DOM.

import type RAPIER from "@dimforge/rapier3d-compat";
import type { Rapier } from "./RapierInit";
import type { Vec3 } from "../../shared/math";
import { STEP_S } from "../../shared/protocol";

export class PhysicsWorld {
  readonly world: RAPIER.World;
  private readonly rapier: Rapier;

  constructor(rapier: Rapier, gravityY: number) {
    this.rapier = rapier;
    this.world = new rapier.World({ x: 0, y: gravityY, z: 0 });
    // Pin the integrator step to our authoritative tick for determinism.
    this.world.timestep = STEP_S;
  }

  /** A large static floor whose top surface sits at y = 0. */
  createGround(halfSize = 50, thickness = 0.5): RAPIER.Collider {
    const body = this.world.createRigidBody(
      this.rapier.RigidBodyDesc.fixed().setTranslation(0, -thickness, 0),
    );
    return this.world.createCollider(
      this.rapier.ColliderDesc.cuboid(halfSize, thickness, halfSize),
      body,
    );
  }

  /** A dynamic box; returns the rigid body so the sim can track + read it. */
  createDynamicBox(position: Vec3, halfExtents: Vec3): RAPIER.RigidBody {
    const body = this.world.createRigidBody(
      this.rapier.RigidBodyDesc.dynamic().setTranslation(
        position.x,
        position.y,
        position.z,
      ),
    );
    this.world.createCollider(
      this.rapier.ColliderDesc.cuboid(
        halfExtents.x,
        halfExtents.y,
        halfExtents.z,
      ).setRestitution(0.3),
      body,
    );
    return body;
  }

  /**
   * A car chassis: a dynamic box with rotations LOCKED — the arcade controller
   * owns heading by setting the body's yaw directly, so the physics solver never
   * tumbles the car. Translation + collision response stay fully physical.
   */
  createCarBody(position: Vec3, halfExtents: Vec3): RAPIER.RigidBody {
    const body = this.world.createRigidBody(
      this.rapier.RigidBodyDesc.dynamic()
        .setTranslation(position.x, position.y, position.z)
        .lockRotations()
        .setLinearDamping(0.05),
    );
    this.world.createCollider(
      this.rapier.ColliderDesc.cuboid(
        halfExtents.x,
        halfExtents.y,
        halfExtents.z,
      )
        .setRestitution(0.2)
        .setFriction(0.7),
      body,
    );
    return body;
  }

  /** Down-ray ground probe, excluding the body itself. */
  isGrounded(body: RAPIER.RigidBody, rayLength: number): boolean {
    const t = body.translation();
    const ray = new this.rapier.Ray(
      { x: t.x, y: t.y, z: t.z },
      { x: 0, y: -1, z: 0 },
    );
    const hit = this.world.castRay(
      ray,
      rayLength,
      true,
      undefined,
      undefined,
      undefined,
      body,
    );
    return hit !== null;
  }

  step(): void {
    this.world.step();
  }

  dispose(): void {
    this.world.free();
  }
}
