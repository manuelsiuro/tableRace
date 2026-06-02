import { describe, it, expect } from "vitest";
import { driftStep, type DriftInput } from "./DriftModel";
import { BALANCED } from "./CarStats";
import { NEUTRAL_INPUT, type InputAction } from "../../shared/inputAction";

const DT = 1 / 30;

function step(
  partial: Omit<Partial<DriftInput>, "input"> & {
    input?: Partial<InputAction>;
  },
) {
  return driftStep({
    vx: 0,
    vz: 0,
    yaw: 0,
    grounded: true,
    dt: DT,
    stats: BALANCED,
    ...partial,
    input: { ...NEUTRAL_INPUT, ...partial.input },
  });
}

describe("DriftModel longitudinal", () => {
  it("throttle accelerates forward (+Z at yaw 0)", () => {
    const out = step({ input: { throttle: 1 } });
    expect(out.vz).toBeGreaterThan(0);
    expect(Math.abs(out.vx)).toBeLessThan(1e-6);
  });

  it("drag slows a coasting car", () => {
    const out = step({ vz: 10 });
    expect(out.vz).toBeLessThan(10);
    expect(out.vz).toBeGreaterThan(0);
  });

  it("brake from rest engages reverse", () => {
    const out = step({ input: { brake: 1 } });
    expect(out.vz).toBeLessThan(0);
  });

  it("clamps forward speed to maxSpeed", () => {
    let s = { vx: 0, vz: BALANCED.maxSpeed - 0.1, yaw: 0 };
    for (let i = 0; i < 60; i++) {
      const out = step({ ...s, input: { throttle: 1 } });
      s = { vx: out.vx, vz: out.vz, yaw: out.yaw };
    }
    expect(s.vz).toBeLessThanOrEqual(BALANCED.maxSpeed + 1e-6);
  });
});

describe("DriftModel steering", () => {
  it("steering changes heading while moving", () => {
    const out = step({ vz: 15, input: { steer: 1 } });
    expect(out.yaw).not.toBe(0);
  });

  it("has negligible steering authority at a standstill", () => {
    const out = step({ vz: 0, input: { steer: 1 } });
    expect(Math.abs(out.yaw)).toBeLessThan(1e-6);
  });

  it("high grip realigns travel toward the new heading", () => {
    // Moving straight +Z, steer right for several steps; velocity should rotate
    // to follow the heading (vx grows), not keep pointing pure +Z.
    let s = { vx: 0, vz: 15, yaw: 0 };
    for (let i = 0; i < 10; i++) {
      const out = step({ ...s, input: { throttle: 1, steer: 0.3 } });
      s = { vx: out.vx, vz: out.vz, yaw: out.yaw };
    }
    expect(s.yaw).toBeGreaterThan(0);
    expect(s.vx).toBeGreaterThan(0.5);
  });
});

describe("DriftModel drift", () => {
  it("retains more lateral velocity when drifting than when gripping", () => {
    // Pure sideways motion (lateral) at yaw 0; one step grip vs handbrake-drift.
    const base = { vx: 10, vz: 0, yaw: 0 };
    const grip = step({ ...base, input: {} });
    const drift = step({ ...base, input: { handbrake: true } });
    expect(drift.drifting).toBe(true);
    expect(grip.drifting).toBe(false);
    expect(Math.abs(drift.vx)).toBeGreaterThan(Math.abs(grip.vx));
  });

  it("does not drift below the speed threshold", () => {
    const out = step({ vx: 1, vz: 0, input: { handbrake: true } });
    expect(out.drifting).toBe(false);
  });
});

describe("DriftModel surfaces", () => {
  it("ice retains far more lateral slip than tarmac", () => {
    const base = { vx: 10, vz: 0, yaw: 0 };
    const tarmac = step({ ...base });
    const ice = step({
      ...base,
      surface: { gripMul: 0.15, accelMul: 1, maxSpeedMul: 1 },
    });
    expect(Math.abs(ice.vx)).toBeGreaterThan(Math.abs(tarmac.vx));
  });

  it("grass reduces acceleration", () => {
    const tarmac = step({ input: { throttle: 1 } });
    const grass = step({
      input: { throttle: 1 },
      surface: { gripMul: 0.5, accelMul: 0.7, maxSpeedMul: 0.7 },
    });
    expect(grass.vz).toBeLessThan(tarmac.vz);
  });
});

describe("DriftModel airborne", () => {
  it("reduces throttle effect while airborne", () => {
    const grounded = step({ input: { throttle: 1 }, grounded: true });
    const airborne = step({ input: { throttle: 1 }, grounded: false });
    expect(airborne.vz).toBeLessThan(grounded.vz);
  });

  it("never drifts while airborne", () => {
    const out = step({
      vx: 10,
      vz: 0,
      grounded: false,
      input: { handbrake: true },
    });
    expect(out.drifting).toBe(false);
  });
});
