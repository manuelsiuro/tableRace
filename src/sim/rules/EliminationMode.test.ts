import { describe, it, expect } from "vitest";
import { EliminationMode } from "./EliminationMode";
import type { RaceContext, RaceCar } from "./RaceMode";

// A faked RaceContext driven by an in-memory car list — no physics needed.
function makeCtx(positions: { x: number; z: number }[]): {
  ctx: RaceContext;
  cars: RaceCar[];
  respawned: () => number;
} {
  const cars: RaceCar[] = positions.map((p, id) => ({
    id,
    x: p.x,
    z: p.z,
    alive: true,
  }));
  let respawnCount = 0;
  const ctx: RaceContext = {
    cars,
    track: null, // no track → leader is furthest +Z
    setAlive: (id, alive) => {
      cars[id].alive = alive;
    },
    respawnAll: () => {
      respawnCount++;
      cars.forEach((c) => (c.alive = true));
    },
  };
  return { ctx, cars, respawned: () => respawnCount };
}

const DT = 1 / 30;
const cfg = {
  eliminationRadius: 20,
  graceSteps: 5,
  roundEndDelay: 1,
  pointsToWin: 2,
};

describe("EliminationMode", () => {
  it("does not eliminate cars within the screen", () => {
    const mode = new EliminationMode(2, cfg);
    const { ctx, cars } = makeCtx([
      { x: 0, z: 10 }, // leader (furthest +Z)
      { x: 0, z: 0 }, // 10 units back — within radius
    ]);
    for (let i = 0; i < 20; i++) mode.step(ctx, DT);
    expect(cars[1].alive).toBe(true);
  });

  it("eliminates a car that stays off-screen past the grace period", () => {
    const mode = new EliminationMode(2, cfg);
    const { ctx, cars } = makeCtx([
      { x: 0, z: 50 }, // leader
      { x: 0, z: 0 }, // 50 units back — beyond radius
    ]);
    // First few steps within grace, then eliminated.
    mode.step(ctx, DT);
    expect(cars[1].alive).toBe(true);
    for (let i = 0; i < cfg.graceSteps; i++) mode.step(ctx, DT);
    expect(cars[1].alive).toBe(false);
  });

  it("never eliminates the leader", () => {
    const mode = new EliminationMode(2, cfg);
    const { ctx, cars } = makeCtx([
      { x: 0, z: 100 }, // leader is far ahead but is the reference, never off-screen
      { x: 0, z: 90 },
    ]);
    for (let i = 0; i < 30; i++) mode.step(ctx, DT);
    expect(cars[0].alive).toBe(true);
  });

  it("awards a point to the survivor and enters roundEnd, then respawns", () => {
    const mode = new EliminationMode(2, cfg);
    const { ctx, respawned } = makeCtx([
      { x: 0, z: 50 },
      { x: 0, z: 0 },
    ]);
    for (let i = 0; i <= cfg.graceSteps; i++) mode.step(ctx, DT);
    expect(mode.race.scores[0]).toBe(1);
    expect(mode.race.phase).toBe("roundEnd");
    // After the round-end delay it respawns and resumes racing.
    for (let i = 0; i < Math.ceil(cfg.roundEndDelay / DT) + 1; i++)
      mode.step(ctx, DT);
    expect(respawned()).toBeGreaterThanOrEqual(1);
    expect(mode.race.round).toBe(1);
    expect(mode.race.phase).toBe("racing");
  });

  it("finishes the match when a car reaches pointsToWin", () => {
    const mode = new EliminationMode(2, cfg);
    // Win two rounds: keep car 1 off-screen each round.
    for (let round = 0; round < cfg.pointsToWin; round++) {
      const { ctx } = makeCtx([
        { x: 0, z: 50 },
        { x: 0, z: 0 },
      ]);
      // Re-point the mode at a fresh ctx each round to simulate respawn positions.
      for (let i = 0; i <= cfg.graceSteps; i++) mode.step(ctx, DT);
      // Advance past round-end delay if not finished.
      if (!mode.isFinished()) {
        for (let i = 0; i < Math.ceil(cfg.roundEndDelay / DT) + 1; i++)
          mode.step(ctx, DT);
      }
    }
    expect(mode.isFinished()).toBe(true);
    expect(mode.race.scores[0]).toBeGreaterThanOrEqual(cfg.pointsToWin);
  });

  it("keeps the camera focused on the leader", () => {
    const mode = new EliminationMode(2, cfg);
    const { ctx } = makeCtx([
      { x: 7, z: 50 },
      { x: 0, z: 0 },
    ]);
    mode.step(ctx, DT);
    expect(mode.camera.x).toBeCloseTo(7);
    expect(mode.camera.z).toBeCloseTo(50);
    expect(mode.camera.zoom).toBeGreaterThan(0);
  });
});
