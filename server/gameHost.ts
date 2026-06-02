// The authoritative game loop, run on the host (Node). It owns the same Rapier
// Simulation the browser uses for single-player, fills empty slots with AI bots,
// applies each player's latest input, and broadcasts snapshots at the tick rate.
// Model A: clients never run physics, so there is no cross-client determinism
// concern — they just render what the host sends.

import { initRapier } from "../src/sim/physics/RapierInit";
import { Simulation, type CarConfig } from "../src/sim/Simulation";
import { createProceduralTrack } from "../src/sim/track/proceduralTrack";
import { profileById, SPEEDSTER, GRIPPER, HEAVY } from "../src/sim/car/CarStats";
import { EliminationMode } from "../src/sim/rules/EliminationMode";
import { clampInputAction, NEUTRAL_INPUT, type InputAction } from "../src/shared/inputAction";
import { STEP_MS } from "../src/shared/protocol";
import type { ServerMessage } from "../src/shared/protocol";
import { HOST_TICK_HZ, POINTS_TO_WIN, SERVER_MAX_PLAYERS } from "./config";

const BOT_STATS = [SPEEDSTER, GRIPPER, HEAVY, SPEEDSTER];

export class GameHost {
  private sim: Simulation | null = null;
  private mode: EliminationMode | null = null;
  private readonly inputs: InputAction[] = new Array(SERVER_MAX_PLAYERS).fill({ ...NEUTRAL_INPUT });
  private timer: ReturnType<typeof setInterval> | null = null;
  private matchEnded = false;

  constructor(private readonly broadcast: (msg: ServerMessage) => void) {}

  get running(): boolean {
    return this.sim != null;
  }

  /**
   * Build the world. `humanSlots` lists which car ids are humans (the rest are
   * bots); `carIds[i]` is the chosen car profile for human slot i.
   */
  async start(humanSlots: number[], carIds: (string | null)[]): Promise<void> {
    const rapier = await initRapier();
    const track = createProceduralTrack();
    const isHuman = (i: number) => humanSlots.includes(i);

    const cars: CarConfig[] = Array.from({ length: SERVER_MAX_PLAYERS }, (_, i) =>
      isHuman(i)
        ? { stats: profileById(carIds[i] ?? "balanced").stats }
        : { stats: BOT_STATS[i % BOT_STATS.length], ai: true },
    );

    this.mode = new EliminationMode(SERVER_MAX_PLAYERS, { pointsToWin: POINTS_TO_WIN });
    this.sim = new Simulation(rapier, { track, mode: this.mode, cars, powerups: true, seed: 1 });
    this.matchEnded = false;

    this.broadcast({ type: "start", trackId: track.id, countdownMs: 2100, startTick: 0 });
    this.timer = setInterval(() => this.tick(), STEP_MS);
  }

  private tick(): void {
    if (!this.sim || !this.mode) return;
    const snap = this.sim.step(this.inputs);
    this.broadcast({ type: "snapshot", snapshot: snap });
    if (!this.matchEnded && this.mode.isFinished()) {
      this.matchEnded = true;
      this.broadcast({
        type: "matchEnd",
        winner: this.mode.race.leaderId,
        scores: this.mode.race.scores.map((points, playerId) => ({ playerId, points })),
      });
    }
  }

  setInput(playerId: number, action: InputAction): void {
    if (playerId >= 0 && playerId < this.inputs.length) {
      this.inputs[playerId] = clampInputAction(action);
    }
  }

  /** A player dropped — hand their car to the AI so the race continues. */
  dropToBot(playerId: number): void {
    this.sim?.setCarAi(playerId, true);
    this.inputs[playerId] = { ...NEUTRAL_INPUT };
  }

  /** A player reconnected to their slot — return control to them. */
  reconnect(playerId: number): void {
    this.sim?.setCarAi(playerId, false);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.sim?.dispose();
    this.sim = null;
    this.mode = null;
  }
}

export { HOST_TICK_HZ };
