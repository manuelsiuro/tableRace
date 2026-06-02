import { vi, afterEach } from "vitest";

// jsdom has no WebGL/2D canvas backend. Return null so three.js / pixi.js fall
// into their "no GL available" branches instead of crashing on construction.
// Tests that need a real context belong in browser-driven tests, not Vitest.
HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never;

afterEach(() => {
  vi.restoreAllMocks();
});
