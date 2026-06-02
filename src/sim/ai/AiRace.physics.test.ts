// Integration: AI bots actually drive the track and an elimination match
// resolves to a winner. Uses real Rapier (WASM), so it lives in a .physics
// test group. Proves the M5 seam end to end: AiDriver → InputAction → sim →
// elimination rules → winner.

import { describe, it, expect, beforeAll } from "vitest";
import { initRapier, type Rapier } from "../physics/RapierInit";
import { Simulation } from "../Simulation";
import { createProceduralTrack } from "../track/proceduralTrack";
import { EliminationMode } from "../rules/EliminationMode";
import { BALANCED, SPEEDSTER, GRIPPER, HEAVY } from "../car/CarStats";
import { NEUTRAL_INPUT } from "../../shared/inputAction";

let rapier: Rapier;
beforeAll(async () => {
  rapier = await initRapier();
});

describe("AI elimination race", () => {
  it("four bots race and the match resolves to a winner", () => {
    const track = createProceduralTrack();
    // pointsToWin: 1 → the first round that resolves ends the match (fast + robust).
    const mode = new EliminationMode(4, {
      pointsToWin: 1,
      eliminationRadius: 16,
      graceSteps: 20,
      roundEndDelay: 0.5,
    });
    const sim = new Simulation(rapier, {
      track,
      mode,
      cars: [
        { stats: SPEEDSTER, ai: true },
        { stats: BALANCED, ai: true },
        { stats: GRIPPER, ai: true },
        { stats: HEAVY, ai: true },
      ],
    });

    let finished = false;
    for (let i = 0; i < 6000 && !finished; i++) {
      sim.step([NEUTRAL_INPUT, NEUTRAL_INPUT, NEUTRAL_INPUT, NEUTRAL_INPUT]);
      finished = mode.isFinished();
    }

    expect(finished).toBe(true);
    const winner = mode.race.leaderId;
    expect(winner).toBeGreaterThanOrEqual(0);
    expect(winner).toBeLessThan(4);
    expect(mode.race.scores[winner]).toBeGreaterThanOrEqual(1);
    sim.dispose();
  });

  it("bots make forward progress around the loop", () => {
    const track = createProceduralTrack();
    const sim = new Simulation(rapier, {
      track,
      cars: [{ stats: BALANCED, ai: true }],
    });
    const start = sim.snapshot().cars[0];
    for (let i = 0; i < 120; i++) sim.step([]);
    const end = sim.snapshot().cars[0];
    const moved = Math.hypot(end.x - start.x, end.z - start.z);
    expect(moved).toBeGreaterThan(3);
    sim.dispose();
  });
});
