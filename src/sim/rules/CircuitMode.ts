// Lap race: complete N laps around the checkpoint loop; first to finish wins.
// Shared camera follows the leader (no off-screen elimination). Pure rules.

import type { RaceSnapshot } from "../../shared/snapshot";
import type { Checkpoint } from "../track/TrackDef";
import { LapTracker } from "./LapTracker";
import type { CameraState, RaceContext, RaceMode } from "./RaceMode";

export interface CircuitConfig {
  totalLaps: number;
  zoom: number;
}

export const DEFAULT_CIRCUIT: CircuitConfig = { totalLaps: 3, zoom: 24 };

export class CircuitMode implements RaceMode {
  camera: CameraState;
  private readonly cfg: CircuitConfig;
  private readonly tracker: LapTracker;
  private readonly carCount: number;
  private leaderId = 0;
  private finished = false;

  constructor(
    carCount: number,
    checkpoints: Checkpoint[],
    cfg: Partial<CircuitConfig> = {},
  ) {
    this.cfg = { ...DEFAULT_CIRCUIT, ...cfg };
    this.carCount = carCount;
    this.tracker = new LapTracker(carCount, checkpoints, this.cfg.totalLaps);
    this.camera = { x: 0, z: 0, zoom: this.cfg.zoom };
  }

  step(ctx: RaceContext, _dt: number): void {
    if (this.finished) return;
    this.tracker.update(ctx.cars);

    // Leader = furthest along.
    let best = -Infinity;
    for (const car of ctx.cars) {
      const p = this.tracker.progress(car.id);
      if (p > best) {
        best = p;
        this.leaderId = car.id;
      }
    }

    const leader = ctx.cars[this.leaderId];
    if (leader) this.camera = { x: leader.x, z: leader.z, zoom: this.cfg.zoom };

    if (this.tracker.isFinished(this.leaderId)) this.finished = true;
  }

  get race(): RaceSnapshot {
    const ids = Array.from({ length: this.carCount }, (_, i) => i);
    const places = this.tracker.positions(ids);
    return {
      mode: "circuit",
      round: 0,
      phase: this.finished ? "finished" : "racing",
      scores: ids.map((i) => this.tracker.lap(i)),
      leaderId: this.leaderId,
      totalLaps: this.cfg.totalLaps,
      laps: ids.map((i) => this.tracker.lap(i)),
      positions: ids.map((i) => places.get(i) ?? i + 1),
    };
  }

  isFinished(): boolean {
    return this.finished;
  }
}
