// Drives the fixed-timestep simulation from requestAnimationFrame and renders
// with interpolation. Client-side glue: it may use the DOM/rAF (game/ is not
// render-restricted). The sim advances in whole STEP_S steps via FixedClock;
// leftover time becomes the render `alpha`. See CLAUDE.md game-loop guidance.

import { FixedClock } from "../core/time/FixedClock";
import type { Simulation } from "../sim/Simulation";
import type { WorldRenderer } from "../render/WorldRenderer";
import type { InputAction } from "../shared/inputAction";
import type { Snapshot } from "../shared/snapshot";

export type InputProvider = () => InputAction[];

export class GameLoop {
  private readonly clock = new FixedClock();
  private rafId = 0;
  private lastMs = 0;
  private running = false;
  private prev: Snapshot;
  private cur: Snapshot;

  constructor(
    private readonly sim: Simulation,
    private readonly renderer: WorldRenderer,
    private readonly inputs: InputProvider = () => [],
  ) {
    this.cur = sim.snapshot();
    this.prev = this.cur;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastMs = 0;
    this.rafId = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  private readonly frame = (nowMs: number): void => {
    if (!this.running) return;
    if (this.lastMs === 0) this.lastMs = nowMs; // first frame: no delta
    const dt = (nowMs - this.lastMs) / 1000;
    this.lastMs = nowMs;

    const steps = this.clock.advance(dt);
    for (let i = 0; i < steps; i++) {
      this.prev = this.cur;
      this.cur = this.sim.step(this.inputs());
    }

    this.renderer.render(this.prev, this.cur, this.clock.alpha);
    this.rafId = requestAnimationFrame(this.frame);
  };
}
