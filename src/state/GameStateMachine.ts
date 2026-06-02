// Game-flow finite state machine. A single source of truth for "what screen are
// we on and is the sim running". Transitions are restricted to an explicit edge
// table so illegal jumps (e.g. menu → race without a track) are impossible by
// construction. The host runs a parallel match FSM; this one drives the client.

export type GameStateName =
  | "boot"
  | "mainMenu"
  | "lobby"
  | "carSelect"
  | "trackSelect"
  | "countdown"
  | "race"
  | "paused"
  | "results";

/** Allowed transitions: from → set of reachable states. */
const TRANSITIONS: Record<GameStateName, readonly GameStateName[]> = {
  boot: ["mainMenu"],
  mainMenu: ["lobby"],
  lobby: ["carSelect", "mainMenu"],
  carSelect: ["trackSelect", "lobby"],
  trackSelect: ["countdown", "carSelect"],
  countdown: ["race"],
  race: ["paused", "results"],
  paused: ["race", "mainMenu"],
  results: ["countdown", "mainMenu"], // countdown = rematch
};

/** True while the fixed-timestep simulation should be advancing. */
export function isSimActive(state: GameStateName): boolean {
  return state === "race";
}

export type StateChangeListener = (
  to: GameStateName,
  from: GameStateName,
) => void;

export class GameStateMachine {
  private current: GameStateName;
  private listeners = new Set<StateChangeListener>();

  constructor(initial: GameStateName = "boot") {
    this.current = initial;
  }

  get state(): GameStateName {
    return this.current;
  }

  canTransition(to: GameStateName): boolean {
    return TRANSITIONS[this.current].includes(to);
  }

  /**
   * Attempt a transition. Returns false (and does nothing) if the edge is not
   * allowed, so callers can guard UI without throwing.
   */
  transition(to: GameStateName): boolean {
    if (!this.canTransition(to)) return false;
    const from = this.current;
    this.current = to;
    this.listeners.forEach((l) => l(to, from));
    return true;
  }

  onChange(listener: StateChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
