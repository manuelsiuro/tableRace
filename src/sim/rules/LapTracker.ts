// Lap + checkpoint progress for circuit-style modes. Checkpoints must be crossed
// in order (anti-shortcut); crossing the last one and returning to #0 completes a
// lap. Pure + deterministic, so circuit/time-trial rules are unit-testable.

import type { Checkpoint } from "../track/TrackDef";

export interface LapState {
  /** Index of the next checkpoint the car must reach. */
  nextCp: number;
  lap: number;
  finished: boolean;
}

export class LapTracker {
  readonly states: LapState[];

  constructor(
    carCount: number,
    private readonly checkpoints: Checkpoint[],
    private readonly totalLaps: number,
  ) {
    this.states = Array.from({ length: carCount }, () => ({
      nextCp: 0,
      lap: 0,
      finished: false,
    }));
  }

  /** Advance checkpoint/lap state from current car positions. */
  update(cars: { id: number; x: number; z: number }[]): void {
    if (this.checkpoints.length === 0) return;
    for (const car of cars) {
      const st = this.states[car.id];
      if (st.finished) continue;
      const cp = this.checkpoints[st.nextCp];
      if (Math.hypot(car.x - cp.x, car.z - cp.z) <= cp.radius) {
        st.nextCp = (st.nextCp + 1) % this.checkpoints.length;
        if (st.nextCp === 0) {
          st.lap += 1;
          if (st.lap >= this.totalLaps) st.finished = true;
        }
      }
    }
  }

  /** Monotonic ranking key — higher is further along the race. */
  progress(id: number): number {
    const st = this.states[id];
    return st.lap * this.checkpoints.length + st.nextCp;
  }

  lap(id: number): number {
    return this.states[id].lap;
  }

  isFinished(id: number): boolean {
    return this.states[id].finished;
  }

  /** 1-based places for the given car ids, ranked by progress (desc). */
  positions(ids: number[]): Map<number, number> {
    const ordered = [...ids].sort(
      (a, b) => this.progress(b) - this.progress(a),
    );
    const places = new Map<number, number>();
    ordered.forEach((id, idx) => places.set(id, idx + 1));
    return places;
  }
}
