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

  step(): void {
    this.world.step();
  }

  dispose(): void {
    this.world.free();
  }
}
