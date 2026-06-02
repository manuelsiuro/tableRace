// Rapier ships as WASM and must be initialized once, asynchronously, before any
// world/collider is constructed. This module owns that single init and hands the
// ready module handle to everything sim-side. Awaited during the `boot` state
// behind a loading screen (see Game.start). Works in both browser and Node, so
// the host server and the determinism tests share the exact same path.

import RAPIER from "@dimforge/rapier3d-compat";

export type Rapier = typeof RAPIER;

let readyPromise: Promise<Rapier> | null = null;

/** Initialize Rapier (idempotent) and resolve with the ready module handle. */
export function initRapier(): Promise<Rapier> {
  if (!readyPromise) {
    readyPromise = RAPIER.init().then(() => RAPIER);
  }
  return readyPromise;
}
