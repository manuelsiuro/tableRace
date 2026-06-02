// THE seam. The authoritative simulation advances purely from InputAction[] (one
// per car) plus its own prior state, and returns a plain-data Snapshot. No
// rendering, no DOM, no wall-clock — so the identical instance runs in the
// browser (single-player) and on the Node host (multiplayer), and a recorded
// input script replays bit-for-bit (see Simulation.determinism.test.ts).
//
// M1 scope: a single dynamic box falling onto a static floor, exposed as "car 0"
// so the renderer can draw it through the same generic path real cars will use.

import type RAPIER from "@dimforge/rapier3d-compat";
import type { Rapier } from "./physics/RapierInit";
import { PhysicsWorld } from "./physics/PhysicsWorld";
import type { InputAction } from "../shared/inputAction";
import type { CarSnapshot, Snapshot } from "../shared/snapshot";
import { STEP_MS } from "../shared/protocol";

export interface SimulationOptions {
  gravityY?: number;
}

interface TrackedBody {
  id: number;
  body: RAPIER.RigidBody;
}

export class Simulation {
  private readonly physics: PhysicsWorld;
  private readonly bodies: TrackedBody[] = [];
  private currentTick = 0;

  constructor(rapier: Rapier, options: SimulationOptions = {}) {
    this.physics = new PhysicsWorld(rapier, options.gravityY ?? -22);
    this.physics.createGround();
    // M1 demo: a box dropped from height with a slight initial spin source
    // (offset center of mass via spawn height only — kept fully deterministic).
    const box = this.physics.createDynamicBox(
      { x: 0, y: 8, z: 0 },
      { x: 0.6, y: 0.6, z: 1.0 },
    );
    box.setAngvel({ x: 0.5, y: 0, z: 0.8 }, true);
    this.bodies.push({ id: 0, body: box });
  }

  get tick(): number {
    return this.currentTick;
  }

  /** Advance one fixed step. `_inputs` is unused in M1 (no car control yet). */
  step(_inputs: InputAction[]): Snapshot {
    this.physics.step();
    this.currentTick++;
    return this.snapshot();
  }

  /** Current world state without advancing — used to seed the render loop. */
  snapshot(): Snapshot {
    const cars: CarSnapshot[] = this.bodies.map(({ id, body }) => {
      const t = body.translation();
      const r = body.rotation();
      const v = body.linvel();
      return {
        id,
        x: t.x,
        y: t.y,
        z: t.z,
        qx: r.x,
        qy: r.y,
        qz: r.z,
        qw: r.w,
        vx: v.x,
        vz: v.z,
        alive: true,
        item: null,
      };
    });

    return {
      tick: this.currentTick,
      // Deterministic timeline derived from the tick — never Date.now().
      serverTimeMs: this.currentTick * STEP_MS,
      cars,
      camera: { x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1, zoom: 10 },
      race: { round: 0, phase: "racing", scores: [0], leaderId: 0 },
      projectiles: [],
    };
  }

  dispose(): void {
    this.physics.dispose();
  }
}
