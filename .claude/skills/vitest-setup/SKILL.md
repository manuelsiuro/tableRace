---
name: vitest-setup
description: Add Vitest 3 to a Vite + TypeScript project. Covers install, vitest.config, DOM environment choice (jsdom vs happy-dom), mocking three.js and pixi.js, stubbing WebGL/Canvas contexts, snapshot do/don't, coverage. Triggers on vitest, unit test, test runner, jsdom, happy-dom, vi.mock, vi.fn, mock module, test environment, coverage, c8, istanbul, getContext mock.
---

# vitest-setup

Vitest reuses your Vite config and TypeScript pipeline, so adding it to this project is short. The interesting choices are the DOM environment, mocking three/pixi, and what *not* to put in tests.

This project (`package.json`) has Vite 6, TypeScript 5.6, `three` 0.171, `pixi.js` 8.6 and **no test runner**. The instructions below assume you start from that state.

## Install

```sh
npm i -D vitest @vitest/coverage-v8 jsdom @types/node
```

- `vitest` is the runner.
- `@vitest/coverage-v8` uses Node's built-in coverage — faster and lighter than istanbul.
- `jsdom` for DOM emulation. (Alternative: `happy-dom` — faster but less complete; see "Environment choice" below.)
- `@types/node` because the Vitest globals types pull in Node types transitively.

Don't install `@types/jest`; Vitest's globals are typed by `vitest/globals` (or via `tsconfig` `types` — shown below).

## Minimum config

Vitest reads `vite.config.ts` by default. Add a `test` block — no separate `vitest.config.ts` needed unless you want different builds per command.

```ts
// vite.config.ts
import { defineConfig } from "vite";

export default defineConfig({
  server: { port: 5173, open: true },
  build: { sourcemap: true, target: "es2022" },
  test: {
    environment: "jsdom",
    globals: true,                          // describe/it/expect without imports
    setupFiles: ["./test/setup.ts"],
    coverage: { provider: "v8", reporter: ["text", "html"] },
    include: ["src/**/*.{test,spec}.ts"],
  },
});
```

Vitest will warn about the missing `vitest` types reference. Fix it in `tsconfig.json`:

```jsonc
{
  "compilerOptions": {
    "types": ["vitest/globals"]            // adds describe/it/expect/vi globals
  }
}
```

Add an npm script:

```jsonc
// package.json
{
  "scripts": {
    "test": "vitest",
    "test:run": "vitest run",
    "test:coverage": "vitest run --coverage"
  }
}
```

## Setup file

`test/setup.ts` runs once before every test file. Use it to stub browser APIs that jsdom doesn't implement — most importantly the WebGL context, which both three.js and pixi.js try to obtain on construction.

```ts
// test/setup.ts
import { vi, afterEach } from "vitest";

// jsdom has no WebGL. Return null so three.js/pixi.js fall into their
// "no GL available" branches instead of crashing. For tests that need
// a real GL, run them under playwright or @vitest/browser instead.
HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never;

// rAF is missing under jsdom in old versions; current jsdom ships it.
// If you see "requestAnimationFrame is not defined", uncomment:
// globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16) as never;

// Reset all mocks between tests so module state can't leak.
afterEach(() => {
  vi.restoreAllMocks();
});
```

## Environment choice: jsdom vs happy-dom

| Concern | `jsdom` | `happy-dom` |
|---|---|---|
| Startup speed | slower (~150 ms) | faster (~50 ms) |
| Spec compliance | very high | partial — newer or obscure APIs may be missing |
| Canvas | stub-only (`getContext` returns null) | stub-only |
| Workers | partial | partial |

Default to `jsdom` for game code. The startup penalty is worth the fewer "this works in the browser but not in tests" surprises. Switch to `happy-dom` only if your suite is large enough that the wall-clock difference matters.

## What *not* to unit-test

These belong in browser-driven tests (Playwright, `@vitest/browser`, or the project's `visual-feedback-loop` skill), not Vitest:

- Anything that needs a real GPU: shader output, geometry rendering, `EffectComposer` passes.
- Pointer/touch event integration (jsdom doesn't dispatch synthesized pointer events like a real browser).
- AudioContext playback timing.
- IntersectionObserver, ResizeObserver layout effects.

What *does* unit-test well:
- Pure game logic: damage formulas, collision math, FSM transitions, save/load serialization.
- Module wiring: assert a function calls another with given args.
- Snapshot of pure data outputs (level JSON, save shape).

## Mocking three.js / pixi.js

When code under test imports `three` purely to construct objects (e.g. `new Vector3(...)`), let it use the real module — `Vector3` is just math, no GPU needed. Mock only the renderer.

```ts
// Mock only the part you must
vi.mock("three", async () => {
  const actual = await vi.importActual<typeof import("three")>("three");
  return {
    ...actual,
    WebGLRenderer: vi.fn().mockImplementation(() => ({
      setSize: vi.fn(),
      setPixelRatio: vi.fn(),
      render: vi.fn(),
      dispose: vi.fn(),
      domElement: document.createElement("canvas"),
    })),
  };
});
```

PixiJS v8 has a similar pattern — replace `Application` while leaving `Container`, `Sprite`, `Color`, `Point` as the real classes:

```ts
vi.mock("pixi.js", async () => {
  const actual = await vi.importActual<typeof import("pixi.js")>("pixi.js");
  return {
    ...actual,
    Application: vi.fn().mockImplementation(() => ({
      init: vi.fn().mockResolvedValue(undefined),
      stage: new actual.Container(),
      ticker: { add: vi.fn(), remove: vi.fn() },
      destroy: vi.fn(),
      canvas: document.createElement("canvas"),
    })),
  };
});
```

Both mocks are top-level — `vi.mock` is hoisted, so don't put it inside a `beforeAll`.

## Writing tests

```ts
// src/save/migrate.test.ts
import { describe, expect, it } from "vitest";
import { migrate } from "./migrate";

describe("migrate", () => {
  it("upgrades v1 saves to current version", () => {
    const v1 = { version: 1, slotName: "a", savedAt: 0, player: { x: 0, y: 0, hp: 10, maxHp: 10 },
                 progress: { level: 1, coins: 0 }, settings: undefined };
    const v3 = migrate(v1 as never);
    expect(v3.version).toBe(3);
    expect(v3.progress.unlocks).toEqual([]);
    expect(v3.settings.masterVolume).toBe(1);
  });

  it("refuses to load future versions", () => {
    expect(() => migrate({ version: 99 } as never)).toThrow(/Refusing to load/);
  });
});
```

```ts
// src/state/fsm.test.ts
import { describe, expect, it, vi } from "vitest";
import { FSM } from "./fsm";

describe("FSM", () => {
  it("runs guards and effects in order", async () => {
    const effect = vi.fn();
    const fsm = new FSM<"a" | "b", "GO">("a", [
      { from: "a", on: "GO", to: "b", guard: () => true, effect },
    ]);
    await fsm.send("GO");
    expect(fsm.state).toBe("b");
    expect(effect).toHaveBeenCalledOnce();
  });

  it("ignores events with no matching transition", async () => {
    const fsm = new FSM<"a", "GO">("a", []);
    expect(await fsm.send("GO")).toBe(false);
    expect(fsm.state).toBe("a");
  });
});
```

## Snapshot rules

Use `expect(x).toMatchSnapshot()` for stable JSON shapes (save files, level data exports, FSM transition logs). Don't snapshot rendered HTML or scene-graph trees containing object IDs — they churn and reviewers stop reading the diff.

## CI

```sh
npm run test:run -- --reporter=junit --outputFile=test-results.xml
```

Use `vitest run` (not `vitest`) in CI — the default is watch mode, which hangs.

## Gotchas

- **`vi.mock` is hoisted.** Top-level only. Module factory must not capture variables from the test body — they're undefined at hoist time.
- **`vi.restoreAllMocks()` only undoes spies/mocks created with `vi.fn()` / `vi.spyOn()`.** Module mocks set by `vi.mock` persist for the whole file; use `vi.doMock` inside a test for per-test mocking.
- **jsdom canvas returns null from `getContext`.** Code that does `if (!ctx) throw` will fail. Stub with `vi.fn(() => null)` and assert that the *fallback* branch runs.
- **Vite's `import.meta.env` works** in tests; `import.meta.glob` does not, by default. Use `--mode test` and ship a `.env.test` if you need different env values.
- **Coverage of TS files measures emitted JS, not source TS lines.** Branch coverage on TS type-narrowing can mis-report. Trust the line numbers in the HTML report over the raw numbers.
- **Don't import from `'vitest'` AND set `globals: true`.** Pick one — mixing causes type clashes.

## See also

- `game-state-machine`, `game-save-system` — both are designed to be testable; their examples in this skill are real tests.
- `visual-feedback-loop` — for the rendering side of the test pyramid that Vitest deliberately skips.
- `mastering-typescript` — covers Vitest 3 + ESLint 9 in more depth from the language side.
