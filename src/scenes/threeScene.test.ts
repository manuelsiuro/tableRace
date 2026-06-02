import { describe, expect, it, vi } from "vitest";

// Replace only the GPU-bound renderer; Scene/Camera/Mesh are pure enough to run
// under jsdom. See the vitest-setup skill for the mocking rationale.
vi.mock("three", async () => {
  const actual = await vi.importActual<typeof import("three")>("three");
  return {
    ...actual,
    WebGLRenderer: vi.fn().mockImplementation(() => ({
      setSize: vi.fn(),
      setPixelRatio: vi.fn(),
      setAnimationLoop: vi.fn(),
      render: vi.fn(),
      dispose: vi.fn(),
      domElement: document.createElement("canvas"),
    })),
  };
});

import { startThreeScene } from "./threeScene";

describe("startThreeScene", () => {
  it("mounts a canvas without throwing", () => {
    const mount = document.createElement("div");
    expect(() => startThreeScene(mount)).not.toThrow();
    expect(mount.querySelector("canvas")).not.toBeNull();
  });
});
