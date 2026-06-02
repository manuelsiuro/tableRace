// THE seam. The authoritative simulation advances purely from InputAction[] (one
// per car, indexed by car id) plus its own prior state, and returns a plain-data
// Snapshot. No rendering, no DOM, no wall-clock — so the identical instance runs
// in the browser (single-player) and on the Node host (multiplayer), and a
// recorded input script replays bit-for-bit (Simulation.determinism.test.ts).
//
// M2 scope: drivable cars (arcade drift) on a flat ground plane.

import type { Rapier } from "./physics/RapierInit";
import { PhysicsWorld } from "./physics/PhysicsWorld";
import { CarController, type CarSpawn } from "./car/CarController";
import { BALANCED, type CarStats } from "./car/CarStats";
import { NEUTRAL_INPUT, type InputAction } from "../shared/inputAction";
import type { CarSnapshot, Snapshot } from "../shared/snapshot";
import { STEP_MS, STEP_S } from "../shared/protocol";

export interface CarConfig extends CarSpawn {
  stats: CarStats;
}

export interface SimulationOptions {
  gravityY?: number;
  cars?: CarConfig[];
}

export class Simulation {
  private readonly physics: PhysicsWorld;
  private readonly cars: CarController[] = [];
  private currentTick = 0;

  constructor(rapier: Rapier, options: SimulationOptions = {}) {
    this.physics = new PhysicsWorld(rapier, options.gravityY ?? -22);
    this.physics.createGround();

    const configs = options.cars ?? [{ x: 0, z: 0, yaw: 0, stats: BALANCED }];
    configs.forEach((cfg, i) =>
      this.cars.push(new CarController(this.physics, i, cfg.stats, cfg)),
    );
  }

  get tick(): number {
    return this.currentTick;
  }

  get carCount(): number {
    return this.cars.length;
  }

  /** Advance one fixed step. Inputs are indexed by car id; missing = neutral. */
  step(inputs: InputAction[]): Snapshot {
    for (let i = 0; i < this.cars.length; i++) {
      this.cars[i].update(inputs[i] ?? NEUTRAL_INPUT, STEP_S);
    }
    this.physics.step();
    this.currentTick++;
    return this.snapshot();
  }

  /** Current world state without advancing — used to seed the render loop. */
  snapshot(): Snapshot {
    const cars: CarSnapshot[] = this.cars.map((car) => {
      const t = car.body.translation();
      const r = car.body.rotation();
      const v = car.body.linvel();
      return {
        id: car.id,
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
      race: {
        round: 0,
        phase: "racing",
        scores: cars.map(() => 0),
        leaderId: 0,
      },
      projectiles: [],
    };
  }

  dispose(): void {
    this.physics.dispose();
  }
}
