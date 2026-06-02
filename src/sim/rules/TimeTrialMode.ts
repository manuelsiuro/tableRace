// Solo time trial: one car, N laps, against the clock. Tracks current-lap and
// best-lap times (in fixed steps → ms). Camera follows the car. Pure rules.

import type { RaceSnapshot } from "../../shared/snapshot";
import { STEP_MS } from "../../shared/protocol";
import type { Checkpoint } from "../track/TrackDef";
import { LapTracker } from "./LapTracker";
import type { CameraState, RaceContext, RaceMode } from "./RaceMode";

export interface TimeTrialConfig {
  totalLaps: number;
  zoom: number;
}

export const DEFAULT_TIMETRIAL: TimeTrialConfig = { totalLaps: 3, zoom: 22 };

export class TimeTrialMode implements RaceMode {
  camera: CameraState;
  private readonly cfg: TimeTrialConfig;
  private readonly tracker: LapTracker;
  private lapSteps = 0;
  private bestLapSteps = 0;
  private prevLap = 0;
  private finished = false;

  constructor(checkpoints: Checkpoint[], cfg: Partial<TimeTrialConfig> = {}) {
    this.cfg = { ...DEFAULT_TIMETRIAL, ...cfg };
    this.tracker = new LapTracker(1, checkpoints, this.cfg.totalLaps);
    this.camera = { x: 0, z: 0, zoom: this.cfg.zoom };
  }

  step(ctx: RaceContext, _dt: number): void {
    if (this.finished) return;
    const car = ctx.cars[0];
    if (!car) return;

    this.lapSteps += 1;
    this.tracker.update([car]);

    const lap = this.tracker.lap(0);
    if (lap > this.prevLap) {
      // Completed a lap — record its time and reset the lap clock.
      if (this.bestLapSteps === 0 || this.lapSteps < this.bestLapSteps) {
        this.bestLapSteps = this.lapSteps;
      }
      this.lapSteps = 0;
      this.prevLap = lap;
    }

    this.camera = { x: car.x, z: car.z, zoom: this.cfg.zoom };
    if (this.tracker.isFinished(0)) this.finished = true;
  }

  get race(): RaceSnapshot {
    return {
      mode: "timetrial",
      round: 0,
      phase: this.finished ? "finished" : "racing",
      scores: [this.tracker.lap(0)],
      leaderId: 0,
      totalLaps: this.cfg.totalLaps,
      laps: [this.tracker.lap(0)],
      positions: [1],
      lapMs: [this.lapSteps * STEP_MS],
      bestLapMs: [this.bestLapSteps * STEP_MS],
    };
  }

  isFinished(): boolean {
    return this.finished;
  }
}
