import { describe, it, expect } from "vitest";
import { SaveStore, type StorageLike } from "./SaveStore";

function memStorage(seed: Record<string, string> = {}): StorageLike {
  const m = new Map(Object.entries(seed));
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
  };
}

describe("SaveStore", () => {
  it("starts from defaults with no data", () => {
    const s = new SaveStore(memStorage());
    expect(s.bestLap("arena")).toBe(0);
    expect(s.lastCarId).toBe("balanced");
  });

  it("records a first lap as a new best", () => {
    const s = new SaveStore(memStorage());
    expect(s.recordLap("arena", 12000)).toBe(true);
    expect(s.bestLap("arena")).toBe(12000);
  });

  it("only updates when the new lap is faster", () => {
    const s = new SaveStore(memStorage());
    s.recordLap("arena", 12000);
    expect(s.recordLap("arena", 13000)).toBe(false); // slower
    expect(s.recordLap("arena", 11000)).toBe(true); // faster
    expect(s.bestLap("arena")).toBe(11000);
  });

  it("ignores non-positive times", () => {
    const s = new SaveStore(memStorage());
    expect(s.recordLap("arena", 0)).toBe(false);
  });

  it("persists across instances sharing storage", () => {
    const storage = memStorage();
    new SaveStore(storage).recordLap("arena", 9000);
    const reloaded = new SaveStore(storage);
    expect(reloaded.bestLap("arena")).toBe(9000);
  });

  it("survives corrupt stored JSON", () => {
    const s = new SaveStore(memStorage({ "tablerace.save.v1": "{not json" }));
    expect(s.bestLap("arena")).toBe(0);
  });

  it("migrates a partial save, filling missing fields", () => {
    const s = new SaveStore(
      memStorage({
        "tablerace.save.v1": JSON.stringify({ bestLapMs: { arena: 8000 } }),
      }),
    );
    expect(s.bestLap("arena")).toBe(8000);
    expect(s.lastCarId).toBe("balanced"); // filled by migration
    expect(s.settings.masterVolume).toBe(1);
  });
});
