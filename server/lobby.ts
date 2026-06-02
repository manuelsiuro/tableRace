// Pure lobby state machine — who's connected, which car they picked, and whether
// everyone is ready. No ws/IO here so it is unit-testable; wsServer drives it.
// A player's id is also their car slot (0 … MAX-1). The first to join is host.

import type { LobbyPlayer, LobbyState } from "../src/shared/protocol";
import { SERVER_MAX_PLAYERS } from "./config";

export interface LobbySlot extends LobbyPlayer {
  /** Currently connected? A dropped mid-race player stays as a bot-controlled slot. */
  connected: boolean;
}

export class Lobby {
  private readonly slots: (LobbySlot | null)[] = new Array(SERVER_MAX_PLAYERS).fill(null);
  private trackId = "arena";
  private mode = "elimination";
  private pointsToWin = 3;

  /** Claim the lowest free slot. Returns the playerId, or null if full. */
  join(name: string): number | null {
    const id = this.slots.findIndex((s) => s === null);
    if (id === -1) return null;
    this.slots[id] = {
      playerId: id,
      name,
      carId: null,
      ready: false,
      isHost: this.humanCount() === 0,
      isBot: false,
      connected: true,
    };
    return id;
  }

  leave(playerId: number): void {
    this.slots[playerId] = null;
    this.reassignHost();
  }

  /** Mark a slot disconnected but keep it (becomes a bot mid-race). */
  disconnect(playerId: number): void {
    const s = this.slots[playerId];
    if (s) {
      s.connected = false;
      s.ready = false;
    }
    this.reassignHost();
  }

  selectCar(playerId: number, carId: string): void {
    const s = this.slots[playerId];
    if (s) s.carId = carId;
  }

  setReady(playerId: number, ready: boolean): void {
    const s = this.slots[playerId];
    if (s) s.ready = ready;
  }

  isHost(playerId: number): boolean {
    return this.slots[playerId]?.isHost ?? false;
  }

  has(playerId: number): boolean {
    return this.slots[playerId] != null;
  }

  humanCount(): number {
    return this.slots.filter((s) => s && s.connected && !s.isBot).length;
  }

  /** Every connected human has readied up, and there is at least one. */
  allReady(): boolean {
    const humans = this.slots.filter((s): s is LobbySlot => s != null && s.connected);
    return humans.length > 0 && humans.every((s) => s.ready && s.carId != null);
  }

  /** Slots occupied by a (currently connected) human — the rest are bots. */
  humanSlots(): number[] {
    return this.slots
      .map((s, i) => (s && s.connected ? i : -1))
      .filter((i) => i >= 0);
  }

  carIdFor(playerId: number): string | null {
    return this.slots[playerId]?.carId ?? null;
  }

  state(): LobbyState {
    return {
      players: this.slots.filter((s): s is LobbySlot => s != null),
      trackId: this.trackId,
      pointsToWin: this.pointsToWin,
      mode: this.mode,
    };
  }

  private reassignHost(): void {
    const connected = this.slots.filter((s): s is LobbySlot => s != null && s.connected);
    if (connected.length > 0 && !connected.some((s) => s.isHost)) {
      connected[0].isHost = true;
    }
  }
}
