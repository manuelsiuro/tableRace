import { describe, it, expect, vi } from "vitest";
import { GameStateMachine, isSimActive } from "./GameStateMachine";

describe("GameStateMachine", () => {
  it("starts in boot", () => {
    expect(new GameStateMachine().state).toBe("boot");
  });

  it("allows legal transitions and rejects illegal ones", () => {
    const fsm = new GameStateMachine();
    expect(fsm.transition("mainMenu")).toBe(true);
    expect(fsm.state).toBe("mainMenu");
    // Cannot jump straight to race.
    expect(fsm.transition("race")).toBe(false);
    expect(fsm.state).toBe("mainMenu");
  });

  it("walks the full happy path into a race", () => {
    const fsm = new GameStateMachine();
    for (const step of [
      "mainMenu",
      "lobby",
      "carSelect",
      "trackSelect",
      "countdown",
      "race",
    ] as const) {
      expect(fsm.transition(step)).toBe(true);
    }
    expect(fsm.state).toBe("race");
  });

  it("notifies listeners with to/from and supports unsubscribe", () => {
    const fsm = new GameStateMachine();
    const seen: string[] = [];
    const off = fsm.onChange((to, from) => seen.push(`${from}->${to}`));
    fsm.transition("mainMenu");
    off();
    fsm.transition("lobby");
    expect(seen).toEqual(["boot->mainMenu"]);
  });

  it("does not fire listeners on a rejected transition", () => {
    const fsm = new GameStateMachine();
    const spy = vi.fn();
    fsm.onChange(spy);
    fsm.transition("results"); // illegal from boot
    expect(spy).not.toHaveBeenCalled();
  });

  it("marks only the race state as sim-active", () => {
    expect(isSimActive("race")).toBe(true);
    expect(isSimActive("paused")).toBe(false);
    expect(isSimActive("mainMenu")).toBe(false);
  });
});
