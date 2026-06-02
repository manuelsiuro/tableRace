import { describe, it, expect } from "vitest";
import { PowerupSystem, type PuCar } from "./PowerupSystem";
import type { PowerupId } from "../../shared/snapshot";

function car(partial: Partial<PuCar> & { id: number }): PuCar {
  return {
    x: 0,
    z: 0,
    yaw: 0,
    alive: true,
    usePowerup: false,
    rankFactor: 0,
    progress: 0,
    ...partial,
  };
}

/**
 * Build a system where car i starts on spawn i and, after one step, holds
 * `want[i]`. Spawns are spaced apart so each only feeds its own car. Searches
 * seeds so tests don't depend on the exact weighting distribution.
 */
function rig(
  want: PowerupId[],
  positions: { x: number; z: number }[],
): PowerupSystem {
  for (let seed = 1; seed < 4000; seed++) {
    const sys = new PowerupSystem(want.length, positions, seed);
    const cars = positions.map((p, i) =>
      car({ id: i, x: p.x, z: p.z, rankFactor: i === 0 ? 1 : 0 }),
    );
    sys.step({ cars });
    if (want.every((w, i) => sys.heldItem(i) === w)) return sys;
  }
  throw new Error(`no seed produced ${want.join(",")}`);
}

describe("pickups + inventory", () => {
  it("a car on a spawn picks up an item, then the spawn goes on cooldown", () => {
    const sys = new PowerupSystem(1, [{ x: 0, z: 0 }], 1);
    sys.step({ cars: [car({ id: 0 })] });
    expect(sys.heldItem(0)).not.toBeNull();
    expect(sys.pickupsSnapshot()).toHaveLength(0); // collected → on cooldown
  });

  it("does not pick up a second item while holding one", () => {
    const sys = new PowerupSystem(1, [{ x: 0, z: 0 }], 1);
    sys.step({ cars: [car({ id: 0 })] });
    const first = sys.heldItem(0);
    sys.step({ cars: [car({ id: 0 })] });
    expect(sys.heldItem(0)).toBe(first);
  });
});

describe("activation", () => {
  it("using a held item clears the slot", () => {
    const sys = new PowerupSystem(1, [{ x: 0, z: 0 }], 1);
    sys.step({ cars: [car({ id: 0 })] }); // pick up
    sys.step({ cars: [car({ id: 0, usePowerup: true })] }); // use
    expect(sys.heldItem(0)).toBeNull();
  });
});

describe("missile", () => {
  it("homes the car ahead and spins it out", () => {
    const sys = rig(["missile"], [{ x: 0, z: 0 }]);
    sys.step({
      cars: [
        car({ id: 0, usePowerup: true, progress: 0 }),
        car({ id: 1, x: 0, z: 6, progress: 6 }),
      ],
    });
    for (let i = 0; i < 30 && !sys.isStunned(1); i++) {
      sys.step({
        cars: [
          car({ id: 0, progress: 0 }),
          car({ id: 1, x: 0, z: 6, progress: 6 }),
        ],
      });
    }
    expect(sys.isStunned(1)).toBe(true);
  });

  it("a shielded target absorbs the hit instead of being stunned", () => {
    const sys = rig(
      ["missile", "shield"],
      [
        { x: 0, z: 0 },
        { x: 0, z: 6 },
      ],
    );
    // Same step: shooter fires, victim raises shield.
    sys.step({
      cars: [
        car({ id: 0, usePowerup: true, progress: 0 }),
        car({ id: 1, x: 0, z: 6, progress: 6, usePowerup: true }),
      ],
    });
    expect(sys.hasShield(1)).toBe(true);
    for (let i = 0; i < 30; i++) {
      sys.step({
        cars: [
          car({ id: 0, progress: 0 }),
          car({ id: 1, x: 0, z: 6, progress: 6 }),
        ],
      });
    }
    expect(sys.isStunned(1)).toBe(false);
    expect(sys.hasShield(1)).toBe(false); // shield consumed by the hit
  });
});

describe("boost + oil effects", () => {
  it("boost raises the speed/accel multiplier", () => {
    const sys = rig(["boost"], [{ x: 0, z: 0 }]);
    sys.step({ cars: [car({ id: 0, usePowerup: true })] });
    const mod = sys.effectModifier(0);
    expect(mod.accelMul).toBeGreaterThan(1);
    expect(mod.maxSpeedMul).toBeGreaterThan(1);
    expect(sys.isBoosting(0)).toBe(true);
  });

  it("driving over an oil patch guts grip", () => {
    const sys = rig(["oil"], [{ x: 0, z: 0 }]);
    // Car 0 drops oil behind itself (z ≈ -2 at yaw 0).
    sys.step({ cars: [car({ id: 0, usePowerup: true })] });
    sys.step({
      cars: [car({ id: 0, x: 99, z: 99 }), car({ id: 1, x: 0, z: -2 })],
    });
    expect(sys.effectModifier(1).gripMul).toBeLessThan(1);
  });
});
