// Client-side jitter buffer. The host broadcasts authoritative snapshots at
// 30 Hz; the client renders at display rate by interpolating between the two
// snapshots that bracket a slightly-delayed render time. Returns {prev, cur,
// alpha} so it plugs straight into WorldRenderer.render. Pure + unit-testable.

import { clamp } from "../shared/math";
import type { Snapshot } from "../shared/snapshot";

export class SnapshotBuffer {
  private buf: Snapshot[] = [];
  private readonly maxEntries: number;

  constructor(maxEntries = 30) {
    this.maxEntries = maxEntries;
  }

  /** Insert a snapshot (kept ordered by serverTimeMs; stale entries dropped). */
  push(snap: Snapshot): void {
    this.buf.push(snap);
    // Snapshots usually arrive in order; guard against the occasional reorder.
    if (
      this.buf.length >= 2 &&
      snap.serverTimeMs < this.buf[this.buf.length - 2].serverTimeMs
    ) {
      this.buf.sort((a, b) => a.serverTimeMs - b.serverTimeMs);
    }
    while (this.buf.length > this.maxEntries) this.buf.shift();
  }

  latest(): Snapshot | null {
    return this.buf[this.buf.length - 1] ?? null;
  }

  get size(): number {
    return this.buf.length;
  }

  /**
   * Find the pair of snapshots bracketing `renderTimeMs` (a server-clock time)
   * and the blend factor between them. Clamps at the ends of the buffer.
   */
  sample(
    renderTimeMs: number,
  ): { prev: Snapshot; cur: Snapshot; alpha: number } | null {
    if (this.buf.length === 0) return null;
    if (this.buf.length === 1)
      return { prev: this.buf[0], cur: this.buf[0], alpha: 0 };

    let i = this.buf.length - 1;
    while (i > 0 && this.buf[i].serverTimeMs > renderTimeMs) i--;

    const prev = this.buf[i];
    const cur = this.buf[Math.min(i + 1, this.buf.length - 1)];
    const span = cur.serverTimeMs - prev.serverTimeMs;
    const alpha =
      span > 0 ? clamp((renderTimeMs - prev.serverTimeMs) / span, 0, 1) : 0;
    return { prev, cur, alpha };
  }
}
