import { describe, it, expect } from "vitest";
import { rollPowerup, spawnWeight, ALL_POWERUPS } from "./PowerupDefs";
import { createRng } from "../../shared/math";

describe("spawnWeight", () => {
  it("favours shields for the leader", () => {
    expect(spawnWeight("shield", 0)).toBeGreaterThan(spawnWeight("shield", 1));
  });

  it("favours missiles and boosts for last place", () => {
    expect(spawnWeight("missile", 1)).toBeGreaterThan(
      spawnWeight("missile", 0),
    );
    expect(spawnWeight("boost", 1)).toBeGreaterThan(spawnWeight("boost", 0));
  });
});

describe("rollPowerup", () => {
  it("only returns known power-ups", () => {
    const rng = createRng(123);
    for (let i = 0; i < 200; i++) {
      expect(ALL_POWERUPS).toContain(rollPowerup(rng.next(), rng));
    }
  });

  it("is deterministic for a given seed", () => {
    const a = createRng(7);
    const b = createRng(7);
    const rollsA = Array.from({ length: 20 }, () => rollPowerup(0.5, a));
    const rollsB = Array.from({ length: 20 }, () => rollPowerup(0.5, b));
    expect(rollsA).toEqual(rollsB);
  });

  it("last place draws missiles more often than the leader", () => {
    const count = (rank: number) => {
      const rng = createRng(999);
      let missiles = 0;
      for (let i = 0; i < 2000; i++)
        if (rollPowerup(rank, rng) === "missile") missiles++;
      return missiles;
    };
    expect(count(1)).toBeGreaterThan(count(0));
  });
});
