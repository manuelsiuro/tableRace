import { describe, it, expect } from "vitest";
import { aiInput, type AiContext, NORMAL_AI } from "./AiDriver";
import type { Vec3 } from "../../shared/math";

// A long straight along +Z, with a closed return leg far away so the loop is
// valid but the car near the origin pursues a point straight ahead.
const straight: Vec3[] = [
  { x: 0, y: 0, z: 0 },
  { x: 0, y: 0, z: 200 },
];

function ctx(partial: Partial<AiContext>): AiContext {
  return {
    self: { id: 0, x: 0, z: 0, yaw: 0, speed: 10 },
    waypoints: straight,
    others: [],
    rankFactor: 0,
    ...partial,
  };
}

describe("aiInput pure pursuit", () => {
  it("drives nearly straight when the path is ahead", () => {
    const out = aiInput(ctx({}));
    expect(Math.abs(out.steer)).toBeLessThan(0.1);
    expect(out.throttle).toBeGreaterThan(0.5);
  });

  it("turns toward a target bending world +X (negative steer)", () => {
    // steer +1 = right = world -X, so heading toward +X needs negative steer.
    const bend: Vec3[] = [
      { x: 0, y: 0, z: 0 },
      { x: 30, y: 0, z: 10 },
      { x: 30, y: 0, z: 60 },
    ];
    const out = aiInput(ctx({ waypoints: bend }));
    expect(out.steer).toBeLessThan(0);
  });

  it("turns toward a target bending world -X (positive steer)", () => {
    const bend: Vec3[] = [
      { x: 0, y: 0, z: 0 },
      { x: -30, y: 0, z: 10 },
      { x: -30, y: 0, z: 60 },
    ];
    const out = aiInput(ctx({ waypoints: bend }));
    expect(out.steer).toBeGreaterThan(0);
  });

  it("gives full throttle straight when in last place (rubber-band)", () => {
    const leader = aiInput(ctx({ rankFactor: 0 }));
    const last = aiInput(ctx({ rankFactor: 1 }));
    expect(last.throttle).toBeGreaterThanOrEqual(leader.throttle);
    expect(last.throttle).toBeCloseTo(1, 5);
  });

  it("eases the throttle in a sharp corner vs a straight", () => {
    const sharp: Vec3[] = [
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 2 },
      { x: -40, y: 0, z: 4 }, // hard left just ahead
    ];
    const straightOut = aiInput(ctx({}));
    const cornerOut = aiInput(ctx({ waypoints: sharp }));
    expect(cornerOut.throttle).toBeLessThan(straightOut.throttle);
  });

  it("avoids a car directly ahead by easing off and steering aside", () => {
    const clear = aiInput(ctx({}));
    const blocked = aiInput(
      ctx({ others: [{ id: 1, x: 0, z: 3, yaw: 0, speed: 0 }] }),
    );
    expect(blocked.throttle).toBeLessThan(clear.throttle);
    expect(Math.abs(blocked.steer)).toBeGreaterThan(Math.abs(clear.steer));
  });

  it("coasts straight when given no usable path", () => {
    const out = aiInput(ctx({ waypoints: [{ x: 0, y: 0, z: 0 }] }), NORMAL_AI);
    expect(out.throttle).toBe(1);
    expect(out.steer).toBe(0);
  });
});
