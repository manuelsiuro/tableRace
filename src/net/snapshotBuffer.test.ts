import { describe, it, expect } from "vitest";
import { SnapshotBuffer } from "./snapshotBuffer";
import type { Snapshot } from "../shared/snapshot";

function snap(t: number, x: number): Snapshot {
  return {
    tick: t,
    serverTimeMs: t,
    cars: [
      {
        id: 0,
        x,
        y: 0,
        z: 0,
        qx: 0,
        qy: 0,
        qz: 0,
        qw: 1,
        vx: 0,
        vz: 0,
        alive: true,
        item: null,
      },
    ],
    camera: { x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1, zoom: 10 },
    race: {
      mode: "elimination",
      round: 0,
      phase: "racing",
      scores: [0],
      leaderId: 0,
    },
    projectiles: [],
    pickups: [],
  };
}

describe("SnapshotBuffer", () => {
  it("returns null when empty", () => {
    expect(new SnapshotBuffer().sample(0)).toBeNull();
  });

  it("returns the single snapshot with alpha 0", () => {
    const b = new SnapshotBuffer();
    b.push(snap(0, 5));
    expect(b.sample(100)).toMatchObject({ alpha: 0 });
  });

  it("brackets the render time and computes alpha", () => {
    const b = new SnapshotBuffer();
    b.push(snap(0, 0));
    b.push(snap(33, 10));
    b.push(snap(66, 20));
    const s = b.sample(49.5);
    expect(s?.prev.serverTimeMs).toBe(33);
    expect(s?.cur.serverTimeMs).toBe(66);
    expect(s?.alpha).toBeCloseTo(0.5);
  });

  it("clamps before the first and after the last snapshot", () => {
    const b = new SnapshotBuffer();
    b.push(snap(10, 0));
    b.push(snap(20, 1));
    // Before the buffer: shows the first snapshot.
    expect(b.sample(0)?.prev.serverTimeMs).toBe(10);
    // After the buffer: holds on the latest snapshot.
    const after = b.sample(999);
    expect(after?.cur.serverTimeMs).toBe(20);
    expect(after?.alpha).toBe(0);
  });

  it("drops stale entries past the cap", () => {
    const b = new SnapshotBuffer(3);
    for (let i = 0; i < 10; i++) b.push(snap(i, i));
    expect(b.size).toBe(3);
    expect(b.latest()?.serverTimeMs).toBe(9);
  });

  it("re-orders an out-of-order insert", () => {
    const b = new SnapshotBuffer();
    b.push(snap(0, 0));
    b.push(snap(20, 2));
    b.push(snap(10, 1)); // arrived late
    const s = b.sample(15);
    expect(s?.prev.serverTimeMs).toBe(10);
    expect(s?.cur.serverTimeMs).toBe(20);
  });
});
