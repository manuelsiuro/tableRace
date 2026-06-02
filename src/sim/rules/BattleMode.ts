// Battle / last-man-standing: every car has lives; getting spun out (hit by a
// power-up) costs a life. Out of lives → eliminated. Last car standing wins.
// Camera frames the centroid of the survivors. Pure rules.

import type { RaceSnapshot } from "../../shared/snapshot";
import type { CameraState, RaceContext, RaceMode } from "./RaceMode";

export interface BattleConfig {
  lives: number;
  zoom: number;
}

export const DEFAULT_BATTLE: BattleConfig = { lives: 3, zoom: 22 };

export class BattleMode implements RaceMode {
  camera: CameraState;
  private readonly cfg: BattleConfig;
  private readonly lives: number[];
  /** Rising-edge guard so one spin-out costs exactly one life. */
  private readonly wasStunned: boolean[];
  private leaderId = 0;
  private finished = false;

  constructor(carCount: number, cfg: Partial<BattleConfig> = {}) {
    this.cfg = { ...DEFAULT_BATTLE, ...cfg };
    this.lives = new Array(carCount).fill(this.cfg.lives);
    this.wasStunned = new Array(carCount).fill(false);
    this.camera = { x: 0, z: 0, zoom: this.cfg.zoom };
  }

  step(ctx: RaceContext, _dt: number): void {
    if (this.finished) return;

    for (const car of ctx.cars) {
      const stunned = car.stunned ?? false;
      if (stunned && !this.wasStunned[car.id] && car.alive) {
        this.lives[car.id] -= 1;
        if (this.lives[car.id] <= 0) ctx.setAlive(car.id, false);
      }
      this.wasStunned[car.id] = stunned;
    }

    const alive = ctx.cars.filter((c) => c.alive);
    // Camera on the survivors' centroid.
    if (alive.length > 0) {
      const cx = alive.reduce((s, c) => s + c.x, 0) / alive.length;
      const cz = alive.reduce((s, c) => s + c.z, 0) / alive.length;
      this.camera = { x: cx, z: cz, zoom: this.cfg.zoom };
      this.leaderId = alive[0].id;
    }

    if (alive.length <= 1) {
      this.finished = true;
      if (alive[0]) this.leaderId = alive[0].id;
    }
  }

  get race(): RaceSnapshot {
    return {
      mode: "battle",
      round: 0,
      phase: this.finished ? "finished" : "racing",
      scores: [...this.lives],
      leaderId: this.leaderId,
      lives: [...this.lives],
    };
  }

  isFinished(): boolean {
    return this.finished;
  }
}
