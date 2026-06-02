import { describe, it, expect } from "vitest";
import {
  classifyNode,
  surfaceAt,
  isSurfaceId,
  type TrackDef,
} from "./TrackDef";
import { SURFACE_TABLE } from "./SurfaceTable";
import { createProceduralTrack } from "./proceduralTrack";

describe("classifyNode", () => {
  it("classifies collision and ramp meshes", () => {
    expect(classifyNode("COL_track").role).toBe("collision");
    expect(classifyNode("RAMP_jump01").role).toBe("collision");
  });

  it("classifies visuals", () => {
    expect(classifyNode("VIS_scenery").role).toBe("visual");
  });

  it("parses ordered indices for spawn/checkpoint/waypoint/powerup", () => {
    expect(classifyNode("SPAWN_03")).toMatchObject({ role: "spawn", index: 3 });
    expect(classifyNode("CP_12")).toMatchObject({
      role: "checkpoint",
      index: 12,
    });
    expect(classifyNode("WP_007")).toMatchObject({
      role: "waypoint",
      index: 7,
    });
    expect(classifyNode("PU_1")).toMatchObject({ role: "powerup", index: 1 });
  });

  it("parses surface type from SURF_<t>_*", () => {
    expect(classifyNode("SURF_ice_patch")).toMatchObject({
      role: "surface",
      surface: "ice",
    });
    expect(classifyNode("SURF_grass")).toMatchObject({
      role: "surface",
      surface: "grass",
    });
    // Unknown surface token falls back to tarmac rather than breaking.
    expect(classifyNode("SURF_lava")).toMatchObject({
      role: "surface",
      surface: "tarmac",
    });
  });

  it("returns none for unrecognized names", () => {
    expect(classifyNode("RandomThing").role).toBe("none");
  });
});

describe("isSurfaceId", () => {
  it("validates surface ids", () => {
    expect(isSurfaceId("ice")).toBe(true);
    expect(isSurfaceId("lava")).toBe(false);
  });
});

describe("surfaceAt", () => {
  const track: TrackDef = {
    id: "t",
    spawns: [],
    colliders: [],
    surfaceZones: [
      { area: { minX: 0, maxX: 10, minZ: 0, maxZ: 10 }, surface: "grass" },
      { area: { minX: 5, maxX: 8, minZ: 5, maxZ: 8 }, surface: "ice" }, // overlaps; later wins
    ],
    checkpoints: [],
    waypoints: [],
    bounds: { minX: -10, maxX: 20, minZ: -10, maxZ: 20 },
  };

  it("returns tarmac outside any zone", () => {
    expect(surfaceAt(track, -5, -5)).toBe("tarmac");
  });

  it("returns the zone surface inside it", () => {
    expect(surfaceAt(track, 1, 1)).toBe("grass");
  });

  it("lets a later overlapping zone win", () => {
    expect(surfaceAt(track, 6, 6)).toBe("ice");
  });
});

describe("SURFACE_TABLE", () => {
  it("keeps tarmac as the 1.0 baseline", () => {
    expect(SURFACE_TABLE.tarmac).toEqual({
      gripMul: 1,
      accelMul: 1,
      maxSpeedMul: 1,
    });
  });

  it("makes ice low-grip but full-speed", () => {
    expect(SURFACE_TABLE.ice.gripMul).toBeLessThan(0.5);
    expect(SURFACE_TABLE.ice.maxSpeedMul).toBe(1);
  });
});

describe("createProceduralTrack", () => {
  it("produces spawns, colliders, surfaces, waypoints, and a trimesh ramp", () => {
    const track = createProceduralTrack();
    expect(track.spawns.length).toBeGreaterThanOrEqual(4);
    expect(track.colliders.some((c) => c.kind === "trimesh")).toBe(true);
    expect(track.colliders.some((c) => c.kind === "box")).toBe(true);
    expect(track.surfaceZones.length).toBeGreaterThan(0);
    expect(track.waypoints.length).toBe(track.checkpoints.length);
  });
});
