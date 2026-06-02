import { describe, it, expect } from "vitest";
import {
  clamp,
  lerp,
  moveTowards,
  normalizeV,
  dotV,
  slerp,
  quatFromYaw,
  quatIdentity,
  createRng,
} from "./math";

describe("scalars", () => {
  it("clamps", () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-5, 0, 1)).toBe(0);
    expect(clamp(0.5, 0, 1)).toBe(0.5);
  });

  it("lerps", () => {
    expect(lerp(0, 10, 0.5)).toBe(5);
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerp(0, 10, 1)).toBe(10);
  });

  it("moveTowards never overshoots", () => {
    expect(moveTowards(0, 10, 3)).toBe(3);
    expect(moveTowards(0, 10, 100)).toBe(10);
    expect(moveTowards(10, 0, 3)).toBe(7);
    expect(moveTowards(10, 0, 100)).toBe(0);
  });
});

describe("vectors", () => {
  it("normalizes to unit length", () => {
    const n = normalizeV({ x: 3, y: 0, z: 4 });
    expect(n.x).toBeCloseTo(0.6);
    expect(n.z).toBeCloseTo(0.8);
  });

  it("normalizing a zero vector is safe", () => {
    expect(normalizeV({ x: 0, y: 0, z: 0 })).toEqual({ x: 0, y: 0, z: 0 });
  });

  it("dot of perpendicular vectors is zero", () => {
    expect(dotV({ x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 })).toBe(0);
  });
});

describe("quaternions", () => {
  it("slerp endpoints return the inputs", () => {
    const a = quatIdentity();
    const b = quatFromYaw(Math.PI / 2);
    expect(slerp(a, b, 0)).toEqual(a);
    const end = slerp(a, b, 1);
    expect(end.y).toBeCloseTo(b.y);
    expect(end.w).toBeCloseTo(b.w);
  });

  it("slerp midpoint stays unit length", () => {
    const mid = slerp(quatIdentity(), quatFromYaw(Math.PI), 0.5);
    const len = Math.sqrt(mid.x ** 2 + mid.y ** 2 + mid.z ** 2 + mid.w ** 2);
    expect(len).toBeCloseTo(1);
  });
});

describe("seeded rng", () => {
  it("is deterministic: same seed → identical sequence", () => {
    const a = createRng(12345);
    const b = createRng(12345);
    const seqA = [a.next(), a.next(), a.next()];
    const seqB = [b.next(), b.next(), b.next()];
    expect(seqA).toEqual(seqB);
  });

  it("different seeds diverge", () => {
    const a = createRng(1);
    const b = createRng(2);
    expect(a.next()).not.toBe(b.next());
  });

  it("produces values in [0, 1)", () => {
    const r = createRng(99);
    for (let i = 0; i < 1000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("int() stays within the inclusive range", () => {
    const r = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = r.int(1, 6);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it("state can be captured and restored to resume the stream", () => {
    const r = createRng(42);
    r.next();
    const saved = r.state;
    const expected = [r.next(), r.next()];
    r.state = saved;
    expect([r.next(), r.next()]).toEqual(expected);
  });
});
