// Thin multiplayer client (Model A): sends local input to the host and renders
// the authoritative snapshots it broadcasts, interpolated through SnapshotBuffer.
// It runs NO physics — the host is the single source of truth. The static track
// is rebuilt locally from its (deterministic, procedural) id for visuals.

import { ClientNet, hostWsUrl } from "./clientNet";
import { SnapshotBuffer } from "./snapshotBuffer";
import { WorldRenderer } from "../render/WorldRenderer";
import { createProceduralTrack } from "../sim/track/proceduralTrack";
import { InputManager } from "../input/InputManager";
import type { Hud } from "../ui/Hud";
import { PROTOCOL_VERSION, STEP_MS } from "../shared/protocol";
import type { LobbyState, ServerMessage } from "../shared/protocol";

export interface SessionClientHandlers {
  onWelcome: (playerId: number) => void;
  onLobby: (state: LobbyState, youId: number) => void;
  onStart: () => void;
  onMatchEnd: (winner: number) => void;
  onRejected: (reason: string) => void;
  onClose: () => void;
}

export class SessionClient {
  private readonly net: ClientNet;
  private readonly buffer = new SnapshotBuffer();
  private renderer: WorldRenderer | null = null;
  private readonly input = new InputManager();
  private playerId = 0;
  private racing = false;
  private rafId = 0;
  private inputTimer: ReturnType<typeof setInterval> | null = null;
  private seq = 0;
  private latestServerMs = 0;
  private latestLocalMs = 0;
  private readonly interpDelay = 2 * STEP_MS; // ~66ms jitter buffer

  constructor(
    private readonly mount: HTMLElement,
    private readonly hud: Hud,
    private readonly handlers: SessionClientHandlers,
    private readonly name = "player",
  ) {
    this.net = new ClientNet(hostWsUrl(), {
      onOpen: () =>
        this.net.send({
          type: "hello",
          version: PROTOCOL_VERSION,
          joinCode: "",
          name: this.name,
        }),
      onMessage: (m) => this.onMessage(m),
      onClose: () => handlers.onClose(),
    });
  }

  selectCar(carId: string): void {
    this.net.send({ type: "selectCar", carId });
  }

  setReady(ready: boolean): void {
    this.net.send({ type: "ready", ready });
  }

  private onMessage(m: ServerMessage): void {
    switch (m.type) {
      case "welcome":
        this.playerId = m.playerId;
        this.handlers.onWelcome(m.playerId);
        break;
      case "rejected":
        this.handlers.onRejected(m.reason);
        break;
      case "lobby":
        this.handlers.onLobby(m.state, this.playerId);
        break;
      case "start":
        this.beginRace();
        this.handlers.onStart();
        break;
      case "snapshot":
        this.latestServerMs = m.snapshot.serverTimeMs;
        this.latestLocalMs = performance.now();
        this.buffer.push(m.snapshot);
        break;
      case "matchEnd":
        this.handlers.onMatchEnd(m.winner);
        break;
      default:
        break;
    }
  }

  private beginRace(): void {
    if (this.racing) return;
    this.racing = true;
    this.mount.innerHTML = "";
    this.renderer = new WorldRenderer(this.mount, { cameraMode: "shared" });
    this.renderer.setTrack(createProceduralTrack());
    this.hud.show();

    const tick = () => {
      this.net.send({
        type: "input",
        tick: 0,
        seq: this.seq++,
        action: this.input.sample(),
      });
    };
    this.inputTimer = setInterval(tick, STEP_MS);
    this.rafId = requestAnimationFrame(this.frame);
  }

  private readonly frame = (): void => {
    if (!this.racing || !this.renderer) return;
    // Map local time → server time, then render slightly in the past.
    const serverNow =
      this.latestServerMs + (performance.now() - this.latestLocalMs);
    const sample = this.buffer.sample(serverNow - this.interpDelay);
    if (sample) {
      this.renderer.render(sample.prev, sample.cur, sample.alpha);
      const latest = this.buffer.latest();
      if (latest) this.hud.update(latest, this.playerId);
    }
    this.rafId = requestAnimationFrame(this.frame);
  };

  dispose(): void {
    this.racing = false;
    cancelAnimationFrame(this.rafId);
    if (this.inputTimer) clearInterval(this.inputTimer);
    this.input.dispose();
    this.renderer?.dispose();
    this.hud.hide();
    this.net.close();
  }
}
