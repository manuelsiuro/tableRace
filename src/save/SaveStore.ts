// Persistent save: best lap times, settings, and last car, in localStorage with
// a versioned schema + lazy migration. Accepts any Storage-like backend so it is
// unit-testable without a real browser. Tolerates quota/parse errors.

export interface SaveData {
  version: number;
  /** Best lap time (ms) per track id. */
  bestLapMs: Record<string, number>;
  lastCarId: string;
  settings: {
    masterVolume: number;
  };
}

const CURRENT_VERSION = 1;
const KEY = "tablerace.save.v1";

function defaults(): SaveData {
  return {
    version: CURRENT_VERSION,
    bestLapMs: {},
    lastCarId: "balanced",
    settings: { masterVolume: 1 },
  };
}

/** Minimal subset of the Web Storage API we depend on. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export class SaveStore {
  private data: SaveData;

  constructor(
    private readonly storage: StorageLike,
    private readonly key = KEY,
  ) {
    this.data = this.read();
  }

  private read(): SaveData {
    try {
      const raw = this.storage.getItem(this.key);
      if (!raw) return defaults();
      const parsed = JSON.parse(raw) as Partial<SaveData>;
      return migrate(parsed);
    } catch {
      return defaults();
    }
  }

  private flush(): void {
    try {
      this.storage.setItem(this.key, JSON.stringify(this.data));
    } catch {
      // Quota or private-mode write failure — keep the in-memory copy.
    }
  }

  bestLap(trackId: string): number {
    return this.data.bestLapMs[trackId] ?? 0;
  }

  /** Record a lap time; returns true if it's a new best. */
  recordLap(trackId: string, ms: number): boolean {
    if (ms <= 0) return false;
    const prev = this.data.bestLapMs[trackId] ?? 0;
    if (prev === 0 || ms < prev) {
      this.data.bestLapMs[trackId] = ms;
      this.flush();
      return true;
    }
    return false;
  }

  get lastCarId(): string {
    return this.data.lastCarId;
  }

  set lastCarId(id: string) {
    this.data.lastCarId = id;
    this.flush();
  }

  get settings(): SaveData["settings"] {
    return { ...this.data.settings };
  }

  setSettings(patch: Partial<SaveData["settings"]>): void {
    this.data.settings = { ...this.data.settings, ...patch };
    this.flush();
  }
}

/** Lazy migration chain — fill missing fields, bump version. */
function migrate(input: Partial<SaveData>): SaveData {
  const base = defaults();
  return {
    version: CURRENT_VERSION,
    bestLapMs: input.bestLapMs ?? base.bestLapMs,
    lastCarId: input.lastCarId ?? base.lastCarId,
    settings: { ...base.settings, ...(input.settings ?? {}) },
  };
}

/** Convenience factory using the browser's localStorage (falls back to memory). */
export function createSaveStore(): SaveStore {
  const mem = new Map<string, string>();
  const fallback: StorageLike = {
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => void mem.set(k, v),
  };
  const storage = typeof localStorage !== "undefined" ? localStorage : fallback;
  return new SaveStore(storage);
}
