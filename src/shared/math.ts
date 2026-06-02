// Pure math shared by the simulation (sim/), the host server, and client-side
// interpolation. NO three/pixi/DOM/node — must run identically in browser and Node.
// Determinism rule: nothing here may call Math.random() or Date.now().

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

export const EPSILON = 1e-6;

// ---------------------------------------------------------------------------
// Scalars
// ---------------------------------------------------------------------------

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Move `current` toward `target` by at most `maxDelta` (never overshoots). */
export function moveTowards(
  current: number,
  target: number,
  maxDelta: number,
): number {
  const diff = target - current;
  if (Math.abs(diff) <= maxDelta) return target;
  return current + Math.sign(diff) * maxDelta;
}

// ---------------------------------------------------------------------------
// Vec3
// ---------------------------------------------------------------------------

export function vec3(x = 0, y = 0, z = 0): Vec3 {
  return { x, y, z };
}

export function addV(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function subV(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function scaleV(a: Vec3, s: number): Vec3 {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}

export function dotV(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function crossV(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function lengthV(a: Vec3): number {
  return Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
}

export function normalizeV(a: Vec3): Vec3 {
  const len = lengthV(a);
  if (len < EPSILON) return { x: 0, y: 0, z: 0 };
  return { x: a.x / len, y: a.y / len, z: a.z / len };
}

export function lerpV(a: Vec3, b: Vec3, t: number): Vec3 {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t) };
}

// ---------------------------------------------------------------------------
// Quaternion
// ---------------------------------------------------------------------------

export function quatIdentity(): Quat {
  return { x: 0, y: 0, z: 0, w: 1 };
}

/** Quaternion for a rotation of `angle` radians about the world Y (yaw) axis. */
export function quatFromYaw(angle: number): Quat {
  const half = angle * 0.5;
  return { x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) };
}

/** Spherical linear interpolation. Inputs are assumed unit quaternions. */
export function slerp(a: Quat, b: Quat, t: number): Quat {
  let cos = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;

  // Take the shorter arc.
  let bx = b.x;
  let by = b.y;
  let bz = b.z;
  let bw = b.w;
  if (cos < 0) {
    cos = -cos;
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
  }

  // Nearly parallel — fall back to normalized linear interpolation.
  if (cos > 1 - EPSILON) {
    return normalizeQuat({
      x: lerp(a.x, bx, t),
      y: lerp(a.y, by, t),
      z: lerp(a.z, bz, t),
      w: lerp(a.w, bw, t),
    });
  }

  const theta = Math.acos(cos);
  const sin = Math.sin(theta);
  const wa = Math.sin((1 - t) * theta) / sin;
  const wb = Math.sin(t * theta) / sin;
  return {
    x: a.x * wa + bx * wb,
    y: a.y * wa + by * wb,
    z: a.z * wa + bz * wb,
    w: a.w * wa + bw * wb,
  };
}

export function normalizeQuat(q: Quat): Quat {
  const len = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w);
  if (len < EPSILON) return quatIdentity();
  return { x: q.x / len, y: q.y / len, z: q.z / len, w: q.w / len };
}

// ---------------------------------------------------------------------------
// Seeded PRNG (mulberry32) — the ONLY source of randomness allowed in sim/.
// Deterministic and serializable: same seed → same sequence on every machine.
// ---------------------------------------------------------------------------

export interface Rng {
  /** Returns a float in [0, 1). */
  next(): number;
  /** Returns an integer in [min, max]. */
  int(min: number, max: number): number;
  /** Current internal state — capture to serialize / restore the stream. */
  state: number;
}

export function createRng(seed: number): Rng {
  let s = seed >>> 0;
  const rng: Rng = {
    next() {
      s |= 0;
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    int(min: number, max: number) {
      return min + Math.floor(rng.next() * (max - min + 1));
    },
    get state() {
      return s >>> 0;
    },
    set state(value: number) {
      s = value >>> 0;
    },
  };
  return rng;
}
