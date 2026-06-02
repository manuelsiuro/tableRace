// The contract that makes Model-A netcode and replay safe: the same inputs from
// the same start must produce identical snapshots. Rapier is WASM, so this test
// initializes it once (works in Node) and is grouped by the `.determinism`
// infix to keep physics-dependent tests easy to spot.

import { describe, it, expect, beforeAll } from "vitest";
import { initRapier, type Rapier } from "./physics/RapierInit";
import { Simulation } from "./Simulation";
import { NEUTRAL_INPUT } from "../shared/inputAction";

let rapier: Rapier;

beforeAll(async () => {
  rapier = await initRapier();
});

describe("Simulation determinism", () => {
  it("produces identical snapshots from identical inputs", () => {
    const a = new Simulation(rapier);
    const b = new Simulation(rapier);
    const inputs = [NEUTRAL_INPUT];

    let lastA = a.snapshot();
    let lastB = b.snapshot();
    for (let i = 0; i < 120; i++) {
      lastA = a.step(inputs);
      lastB = b.step(inputs);
    }

    // Exact equality — determinism means bit-identical, not merely close.
    expect(lastA).toEqual(lastB);
    a.dispose();
    b.dispose();
  });

  it("advances the falling box downward under gravity", () => {
    const sim = new Simulation(rapier);
    const startY = sim.snapshot().cars[0].y;
    for (let i = 0; i < 30; i++) sim.step([NEUTRAL_INPUT]);
    const endY = sim.snapshot().cars[0].y;
    expect(endY).toBeLessThan(startY);
    sim.dispose();
  });

  it("derives a deterministic timeline from the tick, not the wall clock", () => {
    const sim = new Simulation(rapier);
    sim.step([NEUTRAL_INPUT]);
    sim.step([NEUTRAL_INPUT]);
    const snap = sim.snapshot();
    expect(snap.tick).toBe(2);
    expect(snap.serverTimeMs).toBeCloseTo((2 * 1000) / 30);
    sim.dispose();
  });
});
