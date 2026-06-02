// The signature Micro Machines mode. The shared camera follows the LEADER; any
// car that falls too far behind (off the back of the visible screen) is
// eliminated from the round. When one car remains it scores a point, everyone
// re-enters, and a new round begins. First to `pointsToWin` wins the match.
//
// The off-screen test is radial distance from the leader vs `eliminationRadius`,
// and `zoom` is derived from the same radius so what-you-see is what-kills-you.
// Pure (no Rapier): fully unit-testable via a faked RaceContext.

import type { RacePhase, RaceSnapshot } from "../../shared/snapshot";
import { pathLength, progressAlong } from "./progress";
import type { CameraState, RaceContext, RaceCar, RaceMode } from "./RaceMode";

export interface EliminationConfig {
  pointsToWin: number;
  /** World-units behind the leader before a car is off-screen. */
  eliminationRadius: number;
  /** Steps a car must stay off-screen before elimination (grace period). */
  graceSteps: number;
  /** Ortho half-height of the shared view. */
  zoom: number;
  /** Seconds the round-end banner holds before respawning. */
  roundEndDelay: number;
}

export const DEFAULT_ELIMINATION: EliminationConfig = {
  pointsToWin: 3,
  eliminationRadius: 20,
  graceSteps: 30,
  zoom: 15,
  roundEndDelay: 1.5,
};

export class EliminationMode implements RaceMode {
  camera: CameraState;
  private readonly cfg: EliminationConfig;
  private readonly scores: number[];
  private readonly grace: number[];
  // Lap-aware "distance travelled" per car (NOT raw progress, which wraps at the
  // lap line and would crown a car idling just before the finish as the leader).
  private readonly travelled: number[];
  private readonly lastRaw: number[];
  private progressInit = false;
  private round = 0;
  private phase: RacePhase = "racing";
  private leaderId = 0;
  private phaseTimer = 0;
  private finished = false;

  constructor(carCount: number, cfg: Partial<EliminationConfig> = {}) {
    this.cfg = { ...DEFAULT_ELIMINATION, ...cfg };
    this.scores = new Array(carCount).fill(0);
    this.grace = new Array(carCount).fill(0);
    this.travelled = new Array(carCount).fill(0);
    this.lastRaw = new Array(carCount).fill(0);
    this.camera = { x: 0, z: 0, zoom: this.cfg.zoom };
  }

  step(ctx: RaceContext, dt: number): void {
    if (this.phase === "finished") return;

    if (this.phase === "roundEnd") {
      this.phaseTimer -= dt;
      if (this.phaseTimer <= 0) {
        ctx.respawnAll();
        this.round++;
        this.grace.fill(0);
        this.resetProgress(ctx);
        this.phase = "racing";
      }
      this.updateCamera(ctx);
      return;
    }

    // --- racing ---
    if (!this.progressInit) {
      this.resetProgress(ctx);
      this.progressInit = true;
    }
    this.updateProgress(ctx);
    this.leaderId = this.computeLeader(ctx);
    const leader = ctx.cars[this.leaderId];

    if (leader) {
      for (const car of ctx.cars) {
        if (!car.alive || car.id === this.leaderId) {
          this.grace[car.id] = 0;
          continue;
        }
        const d = Math.hypot(car.x - leader.x, car.z - leader.z);
        if (d > this.cfg.eliminationRadius) {
          this.grace[car.id] += 1;
          if (this.grace[car.id] >= this.cfg.graceSteps)
            ctx.setAlive(car.id, false);
        } else {
          this.grace[car.id] = 0;
        }
      }
    }

    const alive = ctx.cars.filter((c) => c.alive);
    if (alive.length <= 1) {
      const survivor = alive[0]?.id ?? this.leaderId;
      this.scores[survivor] += 1;
      this.leaderId = survivor;
      if (this.scores[survivor] >= this.cfg.pointsToWin) {
        this.phase = "finished";
        this.finished = true;
      } else {
        this.phase = "roundEnd";
        this.phaseTimer = this.cfg.roundEndDelay;
      }
    }

    this.updateCamera(ctx);
  }

  get race(): RaceSnapshot {
    return {
      round: this.round,
      phase: this.phase,
      scores: [...this.scores],
      leaderId: this.leaderId,
    };
  }

  isFinished(): boolean {
    return this.finished;
  }

  private updateCamera(ctx: RaceContext): void {
    const leader = ctx.cars[this.leaderId] ?? ctx.cars[0];
    if (leader) this.camera = { x: leader.x, z: leader.z, zoom: this.cfg.zoom };
  }

  /** Raw progress along the path, or +Z when there is no track (tests). */
  private rawProgress(ctx: RaceContext, car: RaceCar): number {
    const wps = ctx.track?.waypoints;
    return wps && wps.length >= 2 ? progressAlong(wps, car.x, car.z) : car.z;
  }

  /** Baseline the per-car distance-travelled accumulators to current positions. */
  private resetProgress(ctx: RaceContext): void {
    for (const car of ctx.cars) {
      this.lastRaw[car.id] = this.rawProgress(ctx, car);
      this.travelled[car.id] = 0;
    }
  }

  /** Accumulate forward distance, unwrapping the lap-line discontinuity. */
  private updateProgress(ctx: RaceContext): void {
    const wps = ctx.track?.waypoints;
    if (!wps || wps.length < 2) {
      // No track: use absolute +Z directly as the standing.
      for (const car of ctx.cars) this.travelled[car.id] = car.z;
      return;
    }
    const total = pathLength(wps);
    for (const car of ctx.cars) {
      const raw = this.rawProgress(ctx, car);
      let delta = raw - this.lastRaw[car.id];
      if (delta > total / 2)
        delta -= total; // wrapped backward
      else if (delta < -total / 2) delta += total; // crossed the lap line
      this.travelled[car.id] += delta;
      this.lastRaw[car.id] = raw;
    }
  }

  /** Leader = alive car that has travelled the furthest (lap-aware). */
  private computeLeader(ctx: RaceContext): number {
    let bestId = this.leaderId;
    let best = -Infinity;
    for (const car of ctx.cars) {
      if (!car.alive) continue;
      if (this.travelled[car.id] > best) {
        best = this.travelled[car.id];
        bestId = car.id;
      }
    }
    return bestId;
  }
}

export type { RaceCar };
