// The wire contract between client and host. Shared verbatim by browser and
// Node so both sides encode/decode the same tagged unions. Bump PROTOCOL_VERSION
// on any breaking change so mismatched clients are rejected at `hello`.

import type { InputAction } from "./inputAction";
import type { Snapshot, PowerupId } from "./snapshot";

export const PROTOCOL_VERSION = 1;

/** Authoritative simulation + snapshot rate. */
export const TICK_HZ = 30;
export const STEP_S = 1 / TICK_HZ;
export const STEP_MS = 1000 / TICK_HZ;
export const SNAPSHOT_HZ = TICK_HZ;

export const MAX_PLAYERS = 4;

// ---------------------------------------------------------------------------
// Lobby state (broadcast on every change)
// ---------------------------------------------------------------------------

export interface LobbyPlayer {
  playerId: number;
  name: string;
  carId: string | null;
  ready: boolean;
  isHost: boolean;
  isBot: boolean;
}

export interface LobbyState {
  players: LobbyPlayer[];
  trackId: string;
  pointsToWin: number;
  mode: string;
}

// ---------------------------------------------------------------------------
// Client → Server
// ---------------------------------------------------------------------------

export type ClientMessage =
  | {
      type: "hello";
      version: number;
      joinCode: string;
      name: string;
      playerId?: number;
    }
  | { type: "selectCar"; carId: string }
  | { type: "ready"; ready: boolean }
  | { type: "input"; tick: number; seq: number; action: InputAction }
  | { type: "ping"; t0: number }
  | { type: "requestRematch" };

// ---------------------------------------------------------------------------
// Server → Client
// ---------------------------------------------------------------------------

export interface RaceScore {
  playerId: number;
  points: number;
}

export type ServerMessage =
  | {
      type: "welcome";
      playerId: number;
      maxPlayers: number;
      tickHz: number;
      snapshotHz: number;
    }
  | { type: "rejected"; reason: string }
  | { type: "lobby"; state: LobbyState }
  | { type: "start"; trackId: string; countdownMs: number; startTick: number }
  | { type: "snapshot"; snapshot: Snapshot }
  | {
      type: "event";
      kind: "powerup" | "hit" | "sfx";
      data: Record<string, number | string>;
    }
  | { type: "eliminated"; playerId: number; place: number }
  | { type: "roundEnd"; scores: RaceScore[]; lastSurvivor: number }
  | { type: "matchEnd"; winner: number; scores: RaceScore[] }
  | { type: "pong"; t0: number; t1: number }
  | { type: "playerLeft"; playerId: number; replacedByBot: boolean };

export type NetMessage = ClientMessage | ServerMessage;

/** Power-up ids re-exported for convenience on both sides of the wire. */
export type { PowerupId };
