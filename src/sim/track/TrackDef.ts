// Track data model + the GLB naming convention parser. Pure data, no three —
// so the sim builds colliders, spawns, surfaces, checkpoints and AI waypoints
// from it directly, and the GLB loader (render-side) produces the same shape.
//
// Authoring convention (Blender object names → roles):
//   COL_*        static collision mesh   → trimesh collider
//   VIS_*        visual only             → rendered, no collider
//   RAMP_*       ramp collision          → collider (kept as collision)
//   SPAWN_##     grid spawn point        → ordered spawn
//   SURF_<t>_*   surface zone (t=grass|ice|sand|oil) → grip/accel modifier
//   CP_##        checkpoint              → ordered progress gate
//   WP_##        AI waypoint             → spline control point
//   PU_##        power-up spawn anchor

import type { Quat, Vec3 } from "../../shared/math";

export type SurfaceId = "tarmac" | "grass" | "ice" | "sand" | "oil";

const SURFACE_IDS: readonly SurfaceId[] = [
  "tarmac",
  "grass",
  "ice",
  "sand",
  "oil",
];

export function isSurfaceId(value: string): value is SurfaceId {
  return (SURFACE_IDS as readonly string[]).includes(value);
}

/** Axis-aligned box in the ground plane (XZ). */
export interface AABB2 {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface Spawn {
  x: number;
  z: number;
  yaw: number;
}

export interface SurfaceZone {
  area: AABB2;
  surface: SurfaceId;
}

export interface Checkpoint {
  index: number;
  x: number;
  z: number;
  radius: number;
}

export type StaticCollider =
  | { kind: "box"; position: Vec3; halfExtents: Vec3; rotation?: Quat }
  | { kind: "trimesh"; vertices: number[]; indices: number[] };

export interface TrackDef {
  id: string;
  spawns: Spawn[];
  colliders: StaticCollider[];
  surfaceZones: SurfaceZone[];
  checkpoints: Checkpoint[];
  waypoints: Vec3[];
  /** Power-up box spawn anchors. */
  powerupSpawns: Vec3[];
  /** Outer extent — used as a fallback kill volume and camera clamp. */
  bounds: AABB2;
}

// ---------------------------------------------------------------------------
// GLB name → role classifier (pure; the brain of TrackLoader)
// ---------------------------------------------------------------------------

export type NodeRole =
  | "collision"
  | "visual"
  | "spawn"
  | "surface"
  | "checkpoint"
  | "waypoint"
  | "powerup"
  | "none";

export interface ClassifiedNode {
  role: NodeRole;
  /** Trailing number for SPAWN_/CP_/WP_/PU_, else null. */
  index: number | null;
  /** Surface type for SURF_<t>_*, else null. */
  surface: SurfaceId | null;
}

function trailingIndex(name: string): number | null {
  const m = name.match(/(\d+)$/);
  return m ? parseInt(m[1], 10) : null;
}

export function classifyNode(name: string): ClassifiedNode {
  const none: ClassifiedNode = { role: "none", index: null, surface: null };

  if (name.startsWith("COL_") || name.startsWith("RAMP_")) {
    return { role: "collision", index: null, surface: null };
  }
  if (name.startsWith("VIS_"))
    return { role: "visual", index: null, surface: null };
  if (name.startsWith("SPAWN_"))
    return { role: "spawn", index: trailingIndex(name), surface: null };
  if (name.startsWith("CP_"))
    return { role: "checkpoint", index: trailingIndex(name), surface: null };
  if (name.startsWith("WP_"))
    return { role: "waypoint", index: trailingIndex(name), surface: null };
  if (name.startsWith("PU_"))
    return { role: "powerup", index: trailingIndex(name), surface: null };
  if (name.startsWith("SURF_")) {
    const token = name.slice("SURF_".length).split("_")[0]?.toLowerCase() ?? "";
    return {
      role: "surface",
      index: null,
      surface: isSurfaceId(token) ? token : "tarmac",
    };
  }
  return none;
}

// ---------------------------------------------------------------------------
// Surface lookup
// ---------------------------------------------------------------------------

function contains(area: AABB2, x: number, z: number): boolean {
  return x >= area.minX && x <= area.maxX && z >= area.minZ && z <= area.maxZ;
}

/** Surface under a world XZ point; later zones win, default tarmac. */
export function surfaceAt(track: TrackDef, x: number, z: number): SurfaceId {
  let result: SurfaceId = "tarmac";
  for (const zone of track.surfaceZones) {
    if (contains(zone.area, x, z)) result = zone.surface;
  }
  return result;
}
