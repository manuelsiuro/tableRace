import { describe, it, expect } from "vitest";
import { FixedClock, MAX_FRAME_DT, MAX_STEPS } from "./FixedClock";

describe("FixedClock", () => {
  it("runs one step per step-sized frame", () => {
    const clock = new FixedClock(1 / 30);
    expect(clock.advance(1 / 30)).toBe(1);
  });

  it("accumulates fractional frames into whole steps", () => {
    const clock = new FixedClock(1 / 30);
    expect(clock.advance(1 / 60)).toBe(0); // half a step, not yet
    expect(clock.advance(1 / 60)).toBe(1); // second half completes one step
  });

  it("exposes interpolation alpha for the leftover remainder", () => {
    const clock = new FixedClock(1 / 30);
    clock.advance(1 / 60); // half a step buffered
    expect(clock.alpha).toBeCloseTo(0.5);
  });

  it("clamps huge frame deltas to avoid a spiral of death", () => {
    const clock = new FixedClock(1 / 30);
    // A 10-second stall would be 300 steps; clamp caps the honored time.
    const steps = clock.advance(10);
    expect(steps).toBeLessThanOrEqual(MAX_STEPS);
    // After clamping to MAX_FRAME_DT and capping steps, no backlog remains.
    expect(clock.advance(0)).toBe(0);
  });

  it("never exceeds MAX_STEPS in a single frame", () => {
    const clock = new FixedClock(1 / 1000);
    expect(clock.advance(MAX_FRAME_DT)).toBeLessThanOrEqual(MAX_STEPS);
  });
});
