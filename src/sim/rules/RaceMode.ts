// Race-mode contract. A mode runs once per fixed step AFTER physics, reading car
// positions and updating race state (scores/phase/leader), the shared camera,
// and which cars are alive. The mode owns the rules; Simulation owns the bodies.
// Pure data in/out (no Rapier) so modes are fully unit-testable.

import type { RaceSnapshot } from "../../shared/snapshot";
import type { TrackDef } from "../track/TrackDef";

/** Minimal per-car view the rules need (positions are XZ ground-plane). */
export interface RaceCar {
  id: number;
  x: number;
  z: number;
  alive: boolean;
  /** Currently spun out (e.g. hit by a power-up) — used by Battle mode. */
  stunned?: boolean;
}

export interface RaceContext {
  cars: RaceCar[];
  track: TrackDef | null;
  /** Toggle a car's participation in the current round. */
  setAlive(id: number, alive: boolean): void;
  /** Teleport every car back to its spawn and mark all alive (round reset). */
  respawnAll(): void;
}

/** Shared camera framing computed by the mode (focus on the ground + ortho zoom). */
export interface CameraState {
  x: number;
  z: number;
  /** Orthographic half-height of the view in world units. */
  zoom: number;
}

export interface RaceMode {
  step(ctx: RaceContext, dt: number): void;
  readonly camera: CameraState;
  readonly race: RaceSnapshot;
  isFinished(): boolean;
}
