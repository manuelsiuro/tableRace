---
name: game-save-system
description: Persisting game state to localStorage and IndexedDB with schema versioning, migrations, and quota error handling. Covers JSON save shape, version field, lazy migration chain, idb-keyval for larger saves, autosave debouncing, multi-slot saves, cloud-save handoff. Triggers on save, load, localStorage, IndexedDB, persist, schema migration, idb-keyval, autosave, save slot, QuotaExceededError.
---

# game-save-system

Persist game state across reloads without breaking when the schema changes. Three patterns by save size; rules for migrations, slots, and quota.

## Pick a backend by save size

| Backend | Capacity (per-origin, typical) | Sync? | Use for |
|---|---|---|---|
| `localStorage` | ~5 MB | Sync | Settings, progress flags, JSON saves under ~100 KB |
| `IndexedDB` (via `idb-keyval`) | Hundreds of MB to GB | Async | Larger saves, binary data, multi-slot |
| Remote API | unlimited | Async | Multi-device, leaderboards, anti-cheat |

Default to `localStorage` for a single save slot of pure JSON. Move to IndexedDB the day you store anything bigger than a settings object — the sync API of `localStorage` blocks the main thread, and Safari has thrown `QuotaExceededError` at less than the spec'd 5 MB in private-browsing mode.

## Save shape: always version your saves

The single rule that prevents the most pain:

```ts
// src/save/schema.ts
export const CURRENT_VERSION = 3 as const;

export type SaveV3 = {
  version: 3;
  slotName: string;
  savedAt: number;        // Date.now()
  player: { x: number; y: number; hp: number; maxHp: number };
  progress: { level: number; coins: number; unlocks: string[] };
  settings: { masterVolume: number; sfxVolume: number; musicVolume: number };
};

export type AnySave = SaveV1 | SaveV2 | SaveV3;
```

Without a `version` field, the next time you add or rename a field, every existing player's save corrupts on load. With it, you write a one-shot migration and ship.

## Migration chain

Write migrations one-step-at-a-time, then chain them. Don't write `migrateV1ToV3` directly — you'll re-do that work the next time the schema changes.

```ts
// src/save/migrate.ts
import type { AnySave, SaveV3 } from "./schema";
import { CURRENT_VERSION } from "./schema";

function v1_to_v2(s: SaveV1): SaveV2 {
  return { ...s, version: 2, progress: { ...s.progress, unlocks: [] } };
}

function v2_to_v3(s: SaveV2): SaveV3 {
  return {
    ...s,
    version: 3,
    settings: s.settings ?? { masterVolume: 1, sfxVolume: 1, musicVolume: 1 },
  };
}

export function migrate(raw: AnySave): SaveV3 {
  let s: AnySave = raw;
  if (s.version === 1) s = v1_to_v2(s);
  if (s.version === 2) s = v2_to_v3(s);
  if (s.version !== CURRENT_VERSION) {
    throw new Error(`Save version ${s.version} > current ${CURRENT_VERSION}. Refusing to load.`);
  }
  return s;
}
```

The "refuse to load future versions" guard catches a player who downgraded the game (or web app cached old JS while the save came from a newer build).

## Implementation: localStorage

```ts
// src/save/localSave.ts
import { migrate } from "./migrate";
import type { SaveV3, AnySave } from "./schema";
import { CURRENT_VERSION } from "./schema";

const KEY = "game-save-v0"; // keep stable; versioning lives inside the JSON

export function save(state: SaveV3): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (err) {
    if (err instanceof DOMException && err.name === "QuotaExceededError") {
      console.warn("Save failed: storage quota exceeded.");
      // Optional: trim by writing only the diff vs. last successful save, or
      // surface a UI prompt asking the player to delete other slots.
      return;
    }
    throw err;
  }
}

export function load(): SaveV3 | null {
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AnySave;
    if (typeof parsed?.version !== "number") return null; // corrupt
    return migrate(parsed);
  } catch (err) {
    console.error("Save corrupt or unreadable; ignoring.", err);
    return null;
  }
}

export function clear(): void {
  localStorage.removeItem(KEY);
}
```

## Implementation: IndexedDB via `idb-keyval`

For larger saves, multi-slot, or anything binary. `idb-keyval` is ~600 bytes gzipped; bare IDB is verbose enough that hand-rolling is wasted effort.

```sh
npm i idb-keyval
```

```ts
// src/save/idbSave.ts
import { get, set, del, keys } from "idb-keyval";
import { migrate } from "./migrate";
import type { SaveV3, AnySave } from "./schema";

const slotKey = (slot: string) => `save:${slot}`;

export async function saveSlot(slot: string, state: SaveV3): Promise<void> {
  await set(slotKey(slot), state);
}

export async function loadSlot(slot: string): Promise<SaveV3 | null> {
  const raw = await get<AnySave>(slotKey(slot));
  if (!raw) return null;
  return migrate(raw);
}

export async function listSlots(): Promise<string[]> {
  const all = await keys();
  return all
    .filter((k): k is string => typeof k === "string" && k.startsWith("save:"))
    .map((k) => k.slice("save:".length));
}

export const deleteSlot = (slot: string) => del(slotKey(slot));
```

## Autosave: debounce, don't write every frame

```ts
// src/save/autosave.ts
import { save } from "./localSave";
import type { SaveV3 } from "./schema";

let pending: ReturnType<typeof setTimeout> | null = null;

export function autosave(state: SaveV3, debounceMs = 1000) {
  if (pending) clearTimeout(pending);
  pending = setTimeout(() => save(state), debounceMs);
}

// Flush on tab close. Use 'pagehide', NOT 'beforeunload' — iOS Safari ignores beforeunload.
window.addEventListener("pagehide", () => {
  if (pending) {
    clearTimeout(pending);
    pending = null;
    // Synchronous final write happens via the latest state held elsewhere.
  }
});
```

Writing every game tick will pin a CPU core and eventually trip storage-engine throttling. 1 second is a good default; checkpoint-based saves (on level transition, on door, on combat end) feel better than time-based ones.

## Multi-slot UI

If you support multiple saves, return a list of summaries — load the full state only on slot select.

```ts
type SaveSummary = { slot: string; savedAt: number; level: number; hp: number };

export async function listSlotSummaries(): Promise<SaveSummary[]> {
  const names = await listSlots();
  const slots = await Promise.all(names.map((s) => loadSlot(s).then((d) => ({ slot: s, d }))));
  return slots
    .filter((x): x is { slot: string; d: SaveV3 } => x.d !== null)
    .map(({ slot, d }) => ({ slot, savedAt: d.savedAt, level: d.progress.level, hp: d.player.hp }))
    .sort((a, b) => b.savedAt - a.savedAt);
}
```

## Gotchas

- **Don't `JSON.stringify` Three.js / PixiJS objects.** They contain circular refs and giant matrices. Serialize a plain data shape (`{ x, y, hp, ... }`) and rebuild engine objects on load.
- **Beware Safari private mode.** `localStorage.setItem` may throw `QuotaExceededError` immediately. Wrap every write in try/catch and degrade gracefully.
- **iOS Safari ignores `beforeunload`.** Use `pagehide` and `visibilitychange` for last-chance saves.
- **Don't store secrets in saves.** Anything in `localStorage`/IndexedDB is reachable from `document.cookie`-equivalent XSS. For anti-cheat / progression-critical state, sign on the server or duplicate to a backend.
- **Schema migrations are one-way.** Don't accept downgrades; the "refuse future versions" guard above is intentional.
- **`structuredClone` is not the same as JSON-clone.** It copies `Date`, `Map`, `Set`, typed arrays — which `JSON.stringify` then drops. Pick one serialization shape and stick to it.

## See also

- `game-state-machine` — persist the FSM state itself by including its `current` field in the save shape.
- `battery-optimization` and `mobile-performance` — autosave hooks tie naturally to `pagehide` and `visibilitychange`, which are also the right places to pause rendering and free GPU resources.
