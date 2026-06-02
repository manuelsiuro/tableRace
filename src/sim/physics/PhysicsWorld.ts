// Thin wrapper around a Rapier world. Keeps the fixed timestep pinned (so the
// integrator is deterministic at our tick rate) and provides the few body
// factories the simulation needs. Lives in sim/ — Rapier is allowed here, but
// never three/pixi/DOM.

import type RAPIER from "@dimforge/rapier3d-compat";
import type { Rapier } from "./RapierInit";
import type { Quat, Vec3 } from "../../shared/math";
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
    // Rounded cuboid: the radius lets the chassis ride over ramp/wall edges
    // instead of snagging a flat corner on a slope (the car is rotation-locked).
    const r = 0.15;
    this.world.createCollider(
      this.rapier.ColliderDesc.roundCuboid(
        Math.max(0.05, halfExtents.x - r),
        Math.max(0.05, halfExtents.y - r),
        Math.max(0.05, halfExtents.z - r),
        r,
      )
        .setRestitution(0.1)
        .setFriction(0.6),
      body,
    );
    return body;
  }

  /** Static box collider (walls, pillars, ramps-as-box). Optional rotation. */
  createStaticBox(
    position: Vec3,
    halfExtents: Vec3,
    rotation?: Quat,
  ): RAPIER.Collider {
    const desc = this.rapier.RigidBodyDesc.fixed().setTranslation(
      position.x,
      position.y,
      position.z,
    );
    if (rotation) desc.setRotation(rotation);
    const body = this.world.createRigidBody(desc);
    return this.world.createCollider(
      this.rapier.ColliderDesc.cuboid(
        halfExtents.x,
        halfExtents.y,
        halfExtents.z,
      ).setFriction(0.8),
      body,
    );
  }

  /** Static trimesh collider — the right shape for complex track geometry. */
  createTrimesh(vertices: Float32Array, indices: Uint32Array): RAPIER.Collider {
    const body = this.world.createRigidBody(this.rapier.RigidBodyDesc.fixed());
    return this.world.createCollider(
      this.rapier.ColliderDesc.trimesh(vertices, indices),
      body,
    );
  }

  /**
   * Down-ray ground probe (excluding the body itself). Returns the contact
   * surface normal when grounded, or null when airborne. The normal lets the
   * car controller follow ramps instead of ramming into them.
   */
  groundProbe(
    body: RAPIER.RigidBody,
    rayLength: number,
  ): { normal: Vec3 } | null {
    const t = body.translation();
    const ray = new this.rapier.Ray(
      { x: t.x, y: t.y, z: t.z },
      { x: 0, y: -1, z: 0 },
    );
    const hit = this.world.castRayAndGetNormal(
      ray,
      rayLength,
      true,
      undefined,
      undefined,
      undefined,
      body,
    );
    if (!hit) return null;
    const n = hit.normal;
    return { normal: { x: n.x, y: n.y, z: n.z } };
  }

  step(): void {
    this.world.step();
  }

  dispose(): void {
    this.world.free();
  }
}
