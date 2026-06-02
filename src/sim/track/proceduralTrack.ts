// A code-built test track so M3 is drivable before any Blender art exists. It
// produces the SAME TrackDef shape the GLB loader will, so the sim/renderer code
// paths are identical — only the source of geometry differs. Real .glb tracks
// arrive in M9 via tracks/TrackLoader.

import type { Vec3 } from "../../shared/math";
import type { StaticCollider, TrackDef } from "./TrackDef";

/**
 * Triangular-prism ramp rising in +Z from y=0 to y=height, then a vertical drop
 * (the launch edge). Returns a trimesh collider in world space.
 */
function wedgeRamp(
  center: Vec3,
  width: number,
  length: number,
  height: number,
): StaticCollider {
  const hw = width / 2;
  const z0 = center.z - length / 2;
  const z1 = center.z + length / 2;
  const x0 = center.x - hw;
  const x1 = center.x + hw;
  const y0 = center.y;
  const y1 = center.y + height;

  // 6 vertices: [A0,B0,C0, A1,B1,C1] on the two side planes (x0, x1).
  // A=(z0,y0) low front, B=(z1,y0) far bottom, C=(z1,y1) far top.
  const vertices = [
    x0,
    y0,
    z0, // 0 A0
    x0,
    y0,
    z1, // 1 B0
    x0,
    y1,
    z1, // 2 C0
    x1,
    y0,
    z0, // 3 A1
    x1,
    y0,
    z1, // 4 B1
    x1,
    y1,
    z1, // 5 C1
  ];
  const indices = [
    0,
    1,
    2, // left cap
    3,
    5,
    4, // right cap
    0,
    3,
    4,
    0,
    4,
    1, // bottom
    1,
    4,
    5,
    1,
    5,
    2, // back (vertical launch face)
    0,
    2,
    5,
    0,
    5,
    3, // slope
  ];
  return { kind: "trimesh", vertices, indices };
}

function wall(position: Vec3, halfExtents: Vec3): StaticCollider {
  return { kind: "box", position, halfExtents };
}

/** A square arena with perimeter walls, a ramp, and ice/grass patches. */
export function createProceduralTrack(half = 30): TrackDef {
  const wallH = 1.5;
  const wallT = 0.5;
  const colliders: StaticCollider[] = [
    wall({ x: 0, y: wallH, z: half }, { x: half, y: wallH, z: wallT }),
    wall({ x: 0, y: wallH, z: -half }, { x: half, y: wallH, z: wallT }),
    wall({ x: half, y: wallH, z: 0 }, { x: wallT, y: wallH, z: half }),
    wall({ x: -half, y: wallH, z: 0 }, { x: wallT, y: wallH, z: half }),
    // Ramp ahead of the spawn (drive +Z up it and launch).
    wedgeRamp({ x: 0, y: 0, z: 4 }, 6, 8, 2.2),
    // A center obstacle pillar to bump into.
    wall({ x: 12, y: 1, z: 14 }, { x: 1, y: 1, z: 1 }),
  ];

  const waypoints: Vec3[] = [
    { x: 0, y: 0, z: -20 },
    { x: 18, y: 0, z: -18 },
    { x: 20, y: 0, z: 18 },
    { x: 0, y: 0, z: 22 },
    { x: -20, y: 0, z: 18 },
    { x: -18, y: 0, z: -18 },
  ];

  return {
    id: "arena",
    spawns: [
      { x: -1.5, z: -22, yaw: 0 },
      { x: 1.5, z: -22, yaw: 0 },
      { x: -1.5, z: -25, yaw: 0 },
      { x: 1.5, z: -25, yaw: 0 },
    ],
    colliders,
    surfaceZones: [
      { area: { minX: 6, maxX: 18, minZ: -16, maxZ: -4 }, surface: "ice" },
      { area: { minX: -18, maxX: -6, minZ: -16, maxZ: -4 }, surface: "grass" },
    ],
    checkpoints: waypoints.map((w, i) => ({
      index: i,
      x: w.x,
      z: w.z,
      radius: 6,
    })),
    waypoints,
    bounds: { minX: -half, maxX: half, minZ: -half, maxZ: half },
  };
}
