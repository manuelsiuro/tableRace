// Track progress along the waypoint loop — how far a car is around the circuit.
// Used to pick the race leader (camera target) and to rank standings. Pure +
// deterministic; also reused by AI (M5) and circuit/lap modes (M7).

import type { Vec3 } from "../../shared/math";

/** Total length of the closed waypoint loop. */
export function pathLength(waypoints: Vec3[]): number {
  let total = 0;
  for (let i = 0; i < waypoints.length; i++) {
    const a = waypoints[i];
    const b = waypoints[(i + 1) % waypoints.length];
    total += Math.hypot(b.x - a.x, b.z - a.z);
  }
  return total;
}

/** Point on the loop a given arc-length in (wraps around). Inverse of progressAlong. */
export function pointAtProgress(waypoints: Vec3[], dist: number): Vec3 {
  if (waypoints.length < 2) return waypoints[0] ?? { x: 0, y: 0, z: 0 };
  const total = pathLength(waypoints) || 1e-6;
  let d = ((dist % total) + total) % total;
  for (let i = 0; i < waypoints.length; i++) {
    const a = waypoints[i];
    const b = waypoints[(i + 1) % waypoints.length];
    const segLen = Math.hypot(b.x - a.x, b.z - a.z) || 1e-6;
    if (d <= segLen) {
      const t = d / segLen;
      return { x: a.x + (b.x - a.x) * t, y: 0, z: a.z + (b.z - a.z) * t };
    }
    d -= segLen;
  }
  return waypoints[0];
}

/**
 * Distance travelled along the closed waypoint polyline for the point nearest
 * the path. Monotonic around the loop, so the car with the greatest value is
 * "ahead".
 */
export function progressAlong(waypoints: Vec3[], x: number, z: number): number {
  if (waypoints.length < 2) return 0;

  let bestDist = Infinity;
  let bestProgress = 0;
  let cumulative = 0;

  for (let i = 0; i < waypoints.length; i++) {
    const a = waypoints[i];
    const b = waypoints[(i + 1) % waypoints.length];
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const segLenSq = abx * abx + abz * abz || 1e-6;

    let t = ((x - a.x) * abx + (z - a.z) * abz) / segLenSq;
    t = Math.max(0, Math.min(1, t));

    const px = a.x + abx * t;
    const pz = a.z + abz * t;
    const d = Math.hypot(x - px, z - pz);
    const segLen = Math.sqrt(segLenSq);

    if (d < bestDist) {
      bestDist = d;
      bestProgress = cumulative + t * segLen;
    }
    cumulative += segLen;
  }

  return bestProgress;
}
