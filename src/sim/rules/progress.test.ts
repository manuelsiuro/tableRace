import { describe, it, expect } from "vitest";
import { progressAlong, pointAtProgress, pathLength } from "./progress";
import type { Vec3 } from "../../shared/math";

const square: Vec3[] = [
  { x: 0, y: 0, z: 0 },
  { x: 10, y: 0, z: 0 },
  { x: 10, y: 0, z: 10 },
  { x: 0, y: 0, z: 10 },
];

describe("progressAlong", () => {
  it("is zero at the first waypoint", () => {
    expect(progressAlong(square, 0, 0)).toBeCloseTo(0);
  });

  it("increases along the path", () => {
    const a = progressAlong(square, 3, 0);
    const b = progressAlong(square, 8, 0);
    expect(b).toBeGreaterThan(a);
    expect(a).toBeCloseTo(3);
  });

  it("accumulates length across segments", () => {
    // Start of the second segment (x=10) is 10 units in.
    expect(progressAlong(square, 10, 5)).toBeCloseTo(15);
  });

  it("snaps off-path points to the nearest segment", () => {
    // Near the first segment but offset in z — progress tracks the x position.
    expect(progressAlong(square, 4, 2)).toBeCloseTo(4);
  });

  it("returns 0 for degenerate paths", () => {
    expect(progressAlong([{ x: 0, y: 0, z: 0 }], 5, 5)).toBe(0);
  });
});

describe("pathLength / pointAtProgress", () => {
  it("measures the closed-loop perimeter", () => {
    expect(pathLength(square)).toBeCloseTo(40); // 4 sides of 10
  });

  it("samples the start at progress 0", () => {
    const p = pointAtProgress(square, 0);
    expect(p.x).toBeCloseTo(0);
    expect(p.z).toBeCloseTo(0);
  });

  it("samples a point partway along a segment", () => {
    const p = pointAtProgress(square, 4);
    expect(p.x).toBeCloseTo(4);
    expect(p.z).toBeCloseTo(0);
  });

  it("wraps around the loop", () => {
    const once = pointAtProgress(square, 4);
    const wrapped = pointAtProgress(square, 44); // 40 + 4
    expect(wrapped.x).toBeCloseTo(once.x);
    expect(wrapped.z).toBeCloseTo(once.z);
  });

  it("round-trips with progressAlong", () => {
    const p = pointAtProgress(square, 15);
    expect(progressAlong(square, p.x, p.z)).toBeCloseTo(15, 4);
  });
});
