// Fixed-timestep accumulator. The simulation advances in discrete STEP_S steps
// regardless of render frame rate; rendering interpolates between the last two
// snapshots using `alpha`. Node-safe (no DOM): the host drives it from a timer,
// the client from requestAnimationFrame. See CLAUDE.md game-loop guidance.

import { STEP_S } from "../../shared/protocol";

/** Largest frame delta we honor; longer gaps (tab-away) are clamped to avoid a
 *  spiral of death where the sim tries to catch up over thousands of steps. */
export const MAX_FRAME_DT = 0.25;

/** Hard cap on steps per frame; if exceeded we drop time and accept slowdown. */
export const MAX_STEPS = 5;

export class FixedClock {
  readonly step: number;
  private accumulator = 0;

  constructor(step = STEP_S) {
    this.step = step;
  }

  /**
   * Feed the wall-clock delta (seconds) since the last frame. Returns how many
   * fixed simulation steps to run now. Read `alpha` afterwards for render
   * interpolation.
   */
  advance(frameDt: number): number {
    const clamped = Math.min(Math.max(frameDt, 0), MAX_FRAME_DT);
    this.accumulator += clamped;

    let steps = 0;
    while (this.accumulator >= this.step && steps < MAX_STEPS) {
      this.accumulator -= this.step;
      steps++;
    }

    // Ran out of budget but still behind — drop the backlog rather than freeze.
    if (this.accumulator >= this.step) {
      this.accumulator = this.accumulator % this.step;
    }
    return steps;
  }

  /** Fractional progress toward the next step, in [0, 1) — the render blend. */
  get alpha(): number {
    return this.accumulator / this.step;
  }

  reset(): void {
    this.accumulator = 0;
  }
}
