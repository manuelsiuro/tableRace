// Plain-data world state produced by Simulation.step() and broadcast to clients.
// Everything here must be JSON-serializable: render/ and net/ consume it by
// value and never write back. No three/pixi types leak in (that is the seam).

export type PowerupId = "boost" | "shield" | "missile" | "mine" | "oil";

/** High-level phase of the current race, mirrored to every client. */
export type RacePhase = "countdown" | "racing" | "roundEnd" | "finished";

export interface CarSnapshot {
  id: number;
  // World transform.
  x: number;
  y: number;
  z: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
  // Horizontal velocity (for skid/particle/audio cues on the client).
  vx: number;
  vz: number;
  alive: boolean;
  /** Held power-up, or null. */
  item: PowerupId | null;
  /** Render cues. */
  shield?: boolean;
  boosting?: boolean;
  stunned?: boolean;
}

/** A live missile / dropped mine / oil patch — `kind` selects which. */
export interface ProjectileSnapshot {
  id: number;
  kind: PowerupId;
  x: number;
  y: number;
  z: number;
}

/** An un-collected power-up box on the track. */
export interface PickupSnapshot {
  id: number;
  x: number;
  z: number;
}

/** Authoritative shared camera — computed in sim so what-you-see is what-kills-you. */
export interface CameraSnapshot {
  x: number;
  y: number;
  z: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
  /** Orthographic half-height of the view in world units. */
  zoom: number;
}

export type RaceModeId = "elimination" | "circuit" | "timetrial" | "battle";

export interface RaceSnapshot {
  mode: RaceModeId;
  round: number;
  phase: RacePhase;
  /** Points per car, indexed by car id. */
  scores: number[];
  leaderId: number;
  // --- optional, mode-specific HUD data (indexed by car id where applicable) ---
  totalLaps?: number;
  laps?: number[];
  /** 1-based finishing/running place per car. */
  positions?: number[];
  lives?: number[];
  /** Current-lap elapsed time (ms) per car. */
  lapMs?: number[];
  /** Best lap time (ms) per car, or 0 if none yet. */
  bestLapMs?: number[];
}

export interface Snapshot {
  tick: number;
  /** Authoritative clock (ms) used by clients for interpolation timing. */
  serverTimeMs: number;
  cars: CarSnapshot[];
  camera: CameraSnapshot;
  race: RaceSnapshot;
  projectiles: ProjectileSnapshot[];
  pickups: PickupSnapshot[];
}
