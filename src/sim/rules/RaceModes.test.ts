import { describe, it, expect } from "vitest";
import { LapTracker } from "./LapTracker";
import { CircuitMode } from "./CircuitMode";
import { TimeTrialMode } from "./TimeTrialMode";
import { BattleMode } from "./BattleMode";
import type { Checkpoint } from "../track/TrackDef";
import type { RaceContext, RaceCar } from "./RaceMode";

// A 4-point square loop of checkpoints.
const CPS: Checkpoint[] = [
  { index: 0, x: 0, z: 0, radius: 2 },
  { index: 1, x: 10, z: 0, radius: 2 },
  { index: 2, x: 10, z: 10, radius: 2 },
  { index: 3, x: 0, z: 10, radius: 2 },
];

function ctxOf(cars: RaceCar[]): { ctx: RaceContext; cars: RaceCar[] } {
  const ctx: RaceContext = {
    cars,
    track: null,
    setAlive: (id, alive) => {
      cars[id].alive = alive;
    },
    respawnAll: () => cars.forEach((c) => (c.alive = true)),
  };
  return { ctx, cars };
}

/** Drive a car through one full lap of CPS by teleporting onto each checkpoint. */
function driveLap(car: RaceCar, tick: (cars: RaceCar[]) => void) {
  for (const cp of CPS) {
    car.x = cp.x;
    car.z = cp.z;
    tick([car]);
  }
  car.x = CPS[0].x;
  car.z = CPS[0].z;
  tick([car]);
}

describe("LapTracker", () => {
  it("counts a lap only when checkpoints are crossed in order", () => {
    const t = new LapTracker(1, CPS, 3);
    const car = { id: 0, x: 0, z: 0, alive: true } as RaceCar;
    expect(t.lap(0)).toBe(0);
    driveLap(car, (cars) => t.update(cars));
    expect(t.lap(0)).toBe(1);
  });

  it("ignores out-of-order checkpoints (no shortcut)", () => {
    const t = new LapTracker(1, CPS, 3);
    // Jump straight to checkpoint 2 without 0/1.
    t.update([{ id: 0, x: 10, z: 10 }]);
    expect(t.progress(0)).toBe(0); // still waiting on cp0
  });

  it("ranks by progress", () => {
    const t = new LapTracker(2, CPS, 3);
    t.update([{ id: 0, x: 0, z: 0 }]); // car 0 reaches cp0
    const places = t.positions([0, 1]);
    expect(places.get(0)).toBe(1);
    expect(places.get(1)).toBe(2);
  });
});

describe("CircuitMode", () => {
  it("finishes when the leader completes all laps", () => {
    const mode = new CircuitMode(1, CPS, { totalLaps: 2 });
    const { ctx, cars } = ctxOf([{ id: 0, x: 0, z: 0, alive: true }]);
    const tick = (cs: RaceCar[]) => {
      cars[0].x = cs[0].x;
      cars[0].z = cs[0].z;
      mode.step(ctx, 1 / 30);
    };
    driveLap(cars[0], tick);
    expect(mode.isFinished()).toBe(false);
    driveLap(cars[0], tick);
    expect(mode.isFinished()).toBe(true);
    expect(mode.race.totalLaps).toBe(2);
  });
});

describe("TimeTrialMode", () => {
  it("records a best lap time and finishes after the lap count", () => {
    const mode = new TimeTrialMode(CPS, { totalLaps: 1 });
    const car = { id: 0, x: 0, z: 0, alive: true } as RaceCar;
    const { ctx } = ctxOf([car]);
    driveLap(car, () => mode.step(ctx, 1 / 30));
    expect(mode.isFinished()).toBe(true);
    expect(mode.race.bestLapMs?.[0]).toBeGreaterThan(0);
  });
});

describe("BattleMode", () => {
  it("docks a life on each fresh spin-out and eliminates at zero", () => {
    const mode = new BattleMode(2, { lives: 2 });
    const cars: RaceCar[] = [
      { id: 0, x: 0, z: 0, alive: true },
      { id: 1, x: 5, z: 0, alive: true },
    ];
    const { ctx } = ctxOf(cars);

    const stun = (id: number, on: boolean) => (cars[id].stunned = on);
    // Two separate spin-outs of car 1 → 2 lives lost → eliminated.
    stun(1, true);
    mode.step(ctx, 1 / 30);
    stun(1, false);
    mode.step(ctx, 1 / 30);
    stun(1, true);
    mode.step(ctx, 1 / 30);
    expect(cars[1].alive).toBe(false);
    expect(mode.isFinished()).toBe(true);
    expect(mode.race.leaderId).toBe(0);
  });

  it("a held stun only costs one life (rising edge)", () => {
    const mode = new BattleMode(1, { lives: 3 });
    const cars: RaceCar[] = [{ id: 0, x: 0, z: 0, alive: true, stunned: true }];
    const { ctx } = ctxOf(cars);
    mode.step(ctx, 1 / 30);
    mode.step(ctx, 1 / 30);
    mode.step(ctx, 1 / 30);
    expect(mode.race.lives?.[0]).toBe(2);
  });
});
