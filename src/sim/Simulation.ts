// THE seam. The authoritative simulation advances purely from InputAction[] (one
// per car, indexed by car id) plus its own prior state, and returns a plain-data
// Snapshot. No rendering, no DOM, no wall-clock — so the identical instance runs
// in the browser (single-player) and on the Node host (multiplayer), and a
// recorded input script replays bit-for-bit (Simulation.determinism.test.ts).
//
// M4 scope: shared leader camera + elimination race rules.

import type { Rapier } from "./physics/RapierInit";
import { PhysicsWorld } from "./physics/PhysicsWorld";
import { CarController, type CarSpawn } from "./car/CarController";
import { BALANCED, type CarStats } from "./car/CarStats";
import { surfaceAt, type TrackDef } from "./track/TrackDef";
import { SURFACE_TABLE } from "./track/SurfaceTable";
import type { RaceContext, RaceMode } from "./rules/RaceMode";
import { progressAlong } from "./rules/progress";
import { AiDriver, type AiDifficulty, type AiView } from "./ai/AiDriver";
import { NEUTRAL_INPUT, type InputAction } from "../shared/inputAction";
import type {
  CameraSnapshot,
  CarSnapshot,
  RaceSnapshot,
  Snapshot,
} from "../shared/snapshot";
import { STEP_MS, STEP_S } from "../shared/protocol";

export interface CarConfig {
  stats: CarStats;
  /** Explicit spawn; if omitted, the track's spawn (by index) or a fallback. */
  spawn?: CarSpawn;
  /** Controlled by an AI driver instead of an external InputAction. */
  ai?: boolean;
  /** Optional AI tuning when `ai` is true. */
  difficulty?: AiDifficulty;
}

export interface SimulationOptions {
  gravityY?: number;
  cars?: CarConfig[];
  track?: TrackDef;
  /** Optional race mode (elimination/circuit/…). Free-drive if omitted. */
  mode?: RaceMode;
}

export class Simulation {
  private readonly physics: PhysicsWorld;
  private readonly cars: CarController[] = [];
  private readonly track: TrackDef | null;
  private readonly mode: RaceMode | null;
  private readonly alive: boolean[] = [];
  /** One slot per car; non-null entries are AI-controlled. */
  private readonly aiDrivers: (AiDriver | null)[] = [];
  private currentTick = 0;

  constructor(rapier: Rapier, options: SimulationOptions = {}) {
    this.physics = new PhysicsWorld(rapier, options.gravityY ?? -22);
    this.physics.createGround();

    this.track = options.track ?? null;
    this.mode = options.mode ?? null;
    if (this.track) this.buildTrack(this.track);

    const configs = options.cars ?? [{ stats: BALANCED }];
    configs.forEach((cfg, i) => {
      this.cars.push(
        new CarController(
          this.physics,
          i,
          cfg.stats,
          this.spawnFor(i, cfg.spawn),
        ),
      );
      this.alive.push(true);
      this.aiDrivers.push(cfg.ai ? new AiDriver(cfg.difficulty) : null);
    });
  }

  /** Compute InputActions for AI-controlled cars (indexed by car id). */
  private computeAiInputs(): (InputAction | null)[] {
    const inputs: (InputAction | null)[] = this.cars.map(() => null);
    if (!this.aiDrivers.some((d) => d)) return inputs;

    const wps = this.track?.waypoints ?? [];
    const views: AiView[] = this.cars.map((c) => {
      const t = c.body.translation();
      const v = c.body.linvel();
      return {
        id: c.id,
        x: t.x,
        z: t.z,
        yaw: c.yaw,
        speed: Math.hypot(v.x, v.z),
      };
    });

    // Rank alive cars by track progress (leader = rank 0) for rubber-banding.
    const aliveIds = this.cars.map((_, i) => i).filter((i) => this.alive[i]);
    const progressOf = (i: number) =>
      wps.length >= 2 ? progressAlong(wps, views[i].x, views[i].z) : views[i].z;
    const ordered = [...aliveIds].sort((a, b) => progressOf(b) - progressOf(a));
    const rankOf = new Map<number, number>();
    ordered.forEach((id, idx) => rankOf.set(id, idx));
    const denom = Math.max(1, aliveIds.length - 1);

    for (let i = 0; i < this.cars.length; i++) {
      const driver = this.aiDrivers[i];
      if (!driver || !this.alive[i]) continue;
      const others = views.filter((_, j) => j !== i && this.alive[j]);
      inputs[i] = driver.update({
        self: views[i],
        waypoints: wps,
        others,
        rankFactor: (rankOf.get(i) ?? 0) / denom,
      });
    }
    return inputs;
  }

  private spawnFor(i: number, explicit?: CarSpawn): CarSpawn {
    return explicit ?? this.track?.spawns[i] ?? { x: 0, z: i * 3, yaw: 0 };
  }

  private raceContext(): RaceContext {
    return {
      cars: this.cars.map((c, i) => {
        const t = c.body.translation();
        return { id: c.id, x: t.x, z: t.z, alive: this.alive[i] };
      }),
      track: this.track,
      setAlive: (id, alive) => {
        this.alive[id] = alive;
      },
      respawnAll: () => {
        this.cars.forEach((c, i) => {
          c.respawn(this.spawnFor(i));
          this.alive[i] = true;
        });
      },
    };
  }

  private buildTrack(track: TrackDef): void {
    for (const c of track.colliders) {
      if (c.kind === "box") {
        this.physics.createStaticBox(c.position, c.halfExtents, c.rotation);
      } else {
        this.physics.createTrimesh(
          new Float32Array(c.vertices),
          new Uint32Array(c.indices),
        );
      }
    }
  }

  get tick(): number {
    return this.currentTick;
  }

  get carCount(): number {
    return this.cars.length;
  }

  /** Advance one fixed step. Inputs are indexed by car id; missing = neutral. */
  step(inputs: InputAction[]): Snapshot {
    const aiInputs = this.computeAiInputs();
    for (let i = 0; i < this.cars.length; i++) {
      if (!this.alive[i]) continue; // eliminated cars sit out the round
      const car = this.cars[i];
      const input = aiInputs[i] ?? inputs[i] ?? NEUTRAL_INPUT;
      const pos = car.body.translation();
      const surface = this.track
        ? SURFACE_TABLE[surfaceAt(this.track, pos.x, pos.z)]
        : SURFACE_TABLE.tarmac;
      car.update(input, STEP_S, surface);
    }
    this.physics.step();
    if (this.mode) this.mode.step(this.raceContext(), STEP_S);
    this.currentTick++;
    return this.snapshot();
  }

  /** Current world state without advancing — used to seed the render loop. */
  snapshot(): Snapshot {
    const cars: CarSnapshot[] = this.cars.map((car, i) => {
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
        alive: this.alive[i],
        item: null,
      };
    });

    return {
      tick: this.currentTick,
      // Deterministic timeline derived from the tick — never Date.now().
      serverTimeMs: this.currentTick * STEP_MS,
      cars,
      camera: this.cameraSnapshot(),
      race: this.raceSnapshot(),
      projectiles: [],
    };
  }

  private cameraSnapshot(): CameraSnapshot {
    if (this.mode) {
      const c = this.mode.camera;
      // Focus on the ground at (x,z); the renderer applies the angled ortho rig.
      return { x: c.x, y: 0, z: c.z, qx: 0, qy: 0, qz: 0, qw: 1, zoom: c.zoom };
    }
    return { x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1, zoom: 10 };
  }

  private raceSnapshot(): RaceSnapshot {
    if (this.mode) return this.mode.race;
    return {
      round: 0,
      phase: "racing",
      scores: this.cars.map(() => 0),
      leaderId: 0,
    };
  }

  dispose(): void {
    this.physics.dispose();
  }
}
