---
name: game-state-machine
description: Finite state machine patterns for game flow (menu/play/pause/gameover) in TypeScript. Tagged-union states, transition guards, hierarchical/nested states, integration with the Three.js + PixiJS scene switcher. Triggers on state machine, FSM, statechart, GameState, transition, scene flow, menu, pause, gameover, hierarchical state.
---

# game-state-machine

Run a typed finite state machine for top-level game flow. The boilerplate's `src/main.ts` currently picks an engine once at boot — a real game needs Menu → Loading → Play → Pause → GameOver transitions that persist across the chosen engine. This skill gives you three escalating patterns and rules for picking one.

## When to use which pattern

| Pattern | Use when | Lines |
|---|---|---|
| Tagged-union switch | <5 states, no nested behaviour, no async transitions | ~30 |
| Hand-rolled FSM class | 5–15 states, guards, enter/exit hooks, async loads | ~80 |
| XState / a library | Hierarchical/parallel states, history, statechart visualization | install |

Default to the hand-rolled class until you actually hit hierarchical needs. XState's runtime is ~15 kB gzipped — a real cost for a web game's first paint.

## Pattern 1: Tagged-union switch

For prototypes. No transitions tracked; you just render whatever the current state holds.

```ts
// src/state/gameState.ts
export type GameState =
  | { kind: "menu" }
  | { kind: "loading"; progress: number }
  | { kind: "play"; score: number; lives: number }
  | { kind: "paused"; resumeAt: number }
  | { kind: "gameover"; finalScore: number };

export const initial: GameState = { kind: "menu" };
```

```ts
// src/main.ts (pseudo)
let state: GameState = initial;

function render() {
  switch (state.kind) {
    case "menu":     return renderMenu();
    case "loading":  return renderLoadingBar(state.progress);
    case "play":     return renderHud(state.score, state.lives);
    case "paused":   return renderPauseOverlay();
    case "gameover": return renderGameOver(state.finalScore);
  }
}
```

TypeScript's exhaustiveness check (with `strict: true`, which this project has) catches missing cases at compile time. Add a `default: const _: never = state;` line in the switch to make the error explicit.

## Pattern 2: Hand-rolled FSM class

When you need transition guards, enter/exit hooks, or async work on transition.

```ts
// src/state/fsm.ts
type Transition<S extends string, E extends string> = {
  from: S;
  on: E;
  to: S;
  guard?: () => boolean;
  effect?: () => void | Promise<void>;
};

export class FSM<S extends string, E extends string> {
  private current: S;
  private transitions: Transition<S, E>[];
  private listeners = new Set<(s: S) => void>();

  constructor(initial: S, transitions: Transition<S, E>[]) {
    this.current = initial;
    this.transitions = transitions;
  }

  get state() { return this.current; }

  async send(event: E): Promise<boolean> {
    const t = this.transitions.find(
      (t) => t.from === this.current && t.on === event && (!t.guard || t.guard())
    );
    if (!t) return false;
    this.current = t.to;
    await t.effect?.();
    this.listeners.forEach((fn) => fn(this.current));
    return true;
  }

  subscribe(fn: (s: S) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}
```

Wire it to game events:

```ts
// src/state/gameFsm.ts
import { FSM } from "./fsm";

type S = "menu" | "loading" | "play" | "paused" | "gameover";
type E = "START" | "LOADED" | "PAUSE" | "RESUME" | "DIE" | "RESTART";

let livesRemaining = 3;

export const fsm = new FSM<S, E>("menu", [
  { from: "menu",     on: "START",   to: "loading", effect: loadAssets },
  { from: "loading",  on: "LOADED",  to: "play" },
  { from: "play",     on: "PAUSE",   to: "paused" },
  { from: "paused",   on: "RESUME",  to: "play" },
  { from: "play",     on: "DIE",     to: "gameover", guard: () => --livesRemaining <= 0 },
  { from: "play",     on: "DIE",     to: "play",     guard: () => livesRemaining > 0,
                                                     effect: respawn },
  { from: "gameover", on: "RESTART", to: "menu",     effect: () => { livesRemaining = 3; } },
]);

async function loadAssets() { /* preload textures, audio, etc. */ }
function respawn()         { /* reset player pos */ }
```

Both `DIE` transitions are evaluated in order — the first whose guard passes wins. Put the "game over" guard *first* if `livesRemaining` is already 0; otherwise the respawn rule fires.

## Wiring into the boilerplate

The current `src/main.ts` does:

```ts
const engine = (params.get("engine") as Engine) ?? "three";
if (engine === "pixi") await startPixiScene(mount); else startThreeScene(mount);
```

Lift the engine choice into the FSM as side-effect state, not flow state. The flow is `menu → play → ...` regardless of renderer. Keep the engine as a render-context parameter:

```ts
// src/main.ts (after)
import { fsm } from "./state/gameFsm";
import { startThreeScene } from "./scenes/threeScene";
import { startPixiScene } from "./scenes/pixiScene";

const engine = (new URLSearchParams(location.search).get("engine") ?? "three") as "three" | "pixi";
const mount = document.getElementById("app")!;

// Boot the renderer once. It renders whatever scene the FSM declares.
const ctx = engine === "pixi" ? await startPixiScene(mount) : startThreeScene(mount);

fsm.subscribe((state) => ctx.showScene(state)); // each scene file exposes a router
fsm.send("START"); // dev: jump straight in
```

This keeps engine choice out of the FSM and out of game logic.

## Pattern 3: Hierarchical / XState

When `play` needs sub-states (`play.exploring`, `play.combat.melee`, `play.combat.ranged`) you want history (restore the last sub-state on resume), parallel regions (UI state independent from game state), and statechart visualization, reach for [XState v5](https://stately.ai/docs). Don't roll your own hierarchy — the bookkeeping for entry/exit chains and history is painful and well-solved.

```ts
import { setup, createActor } from "xstate";

const machine = setup({/* types */}).createMachine({
  initial: "menu",
  states: {
    menu:   { on: { START: "play" } },
    play: {
      initial: "exploring",
      states: {
        exploring: { on: { ENCOUNTER: "combat" } },
        combat:    { on: { WIN: "exploring", LOSE: "#root.gameover" },
                     initial: "melee",
                     states: { melee: {}, ranged: {} } },
      },
      on: { PAUSE: "paused" },
    },
    paused:   { on: { RESUME: "play.hist" } }, // history pseudostate
    gameover: { id: "gameover", on: { RESTART: "menu" } },
  },
});
```

## Gotchas

- **Don't await inside `send()` callers**. Long-running transition effects (`loadAssets`) block input. Either fire-and-forget and dispatch `LOADED` from the effect's `.then()`, or model loading as its own state so the UI shows progress.
- **Strict mode is on in this project's `tsconfig.json`**. Use the `never` exhaustiveness trick — the compiler will catch a forgotten state when you add a new one.
- **Don't store DOM/renderer references in state.** Keep state pure JSON-shaped so saves and time-travel debugging stay trivial. The renderer reads state; it isn't part of it.
- **Pause must stop the simulation loop, not just hide the canvas.** In the boilerplate, that means cancelling `requestAnimationFrame` or stopping `pixi.app.ticker`. Wire it from the FSM `subscribe()` callback.
- **Window blur ≠ pause.** Use the Page Visibility API for autopause (`document.visibilityState === "hidden"`); blur fires for benign focus changes.

## See also

- `game-save-system` — persist FSM state across reloads (just `JSON.stringify(state)`, restore on boot).
- `audio-system`, `camera-system`, `input-system` — wire their lifecycle to FSM transitions (mute on pause, change camera on combat, swap input map per state).
- `.claude/agents/game-architect.md` — the architect agent delegates here when a request involves scene flow.
