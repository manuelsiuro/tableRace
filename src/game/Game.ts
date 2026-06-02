// Top-level orchestrator: owns the game-flow FSM, the per-race session (sim +
// renderer + Pixi HUD + input + loop), and the menu/countdown/results screens.
// Client-side; may touch the DOM (sim/shared/core may not).

import {
  GameStateMachine,
  type GameStateName,
} from "../state/GameStateMachine";
import { initRapier, type Rapier } from "../sim/physics/RapierInit";
import { Simulation, type CarConfig } from "../sim/Simulation";
import { createProceduralTrack } from "../sim/track/proceduralTrack";
import { profileById, SPEEDSTER, GRIPPER, HEAVY } from "../sim/car/CarStats";
import { EliminationMode } from "../sim/rules/EliminationMode";
import { CircuitMode } from "../sim/rules/CircuitMode";
import { TimeTrialMode } from "../sim/rules/TimeTrialMode";
import { BattleMode } from "../sim/rules/BattleMode";
import type { RaceMode } from "../sim/rules/RaceMode";
import { WorldRenderer, type CameraMode } from "../render/WorldRenderer";
import { InputManager } from "../input/InputManager";
import { Hud } from "../ui/Hud";
import { GameLoop } from "./GameLoop";
import type { RaceModeId, Snapshot } from "../shared/snapshot";

type ModeChoice = RaceModeId | "freedrive";

const MODE_LABELS: { id: ModeChoice; label: string }[] = [
  { id: "elimination", label: "Elimination" },
  { id: "circuit", label: "Circuit (3 laps)" },
  { id: "timetrial", label: "Time Trial" },
  { id: "battle", label: "Battle" },
  { id: "freedrive", label: "Free Drive" },
];

const CARS = profileRoster();

export class Game {
  private readonly mount: HTMLElement;
  private readonly fsm = new GameStateMachine();
  private rapier: Rapier | null = null;
  private hud: Hud | null = null;

  // Active session.
  private loop: GameLoop | null = null;
  private renderer: WorldRenderer | null = null;
  private sim: Simulation | null = null;
  private input: InputManager | null = null;

  private selectedMode: ModeChoice = "elimination";
  private selectedCar = "balanced";
  private resultsShown = false;
  private lastSnap: Snapshot | null = null;
  private overlays: HTMLElement[] = [];
  private timers: number[] = [];

  constructor(mount: HTMLElement) {
    this.mount = mount;
    this.fsm.onChange((to) => this.onState(to));
  }

  async start(): Promise<void> {
    this.renderLoading();
    this.rapier = await initRapier();
    this.hud = new Hud();
    await this.hud.init();
    this.hud.hide();
    this.fsm.transition("mainMenu");
  }

  // ---- State entry --------------------------------------------------------

  private onState(to: GameStateName): void {
    switch (to) {
      case "mainMenu":
        this.teardownSession();
        this.renderMainMenu();
        break;
      case "carSelect":
        this.teardownSession();
        this.renderCarSelect();
        break;
      case "countdown":
        this.startSession();
        this.runCountdown();
        break;
      case "race":
        this.clearOverlays();
        this.hud?.show();
        break;
      case "results":
        this.renderResults();
        break;
      default:
        break;
    }
  }

  // ---- Screens ------------------------------------------------------------

  private renderLoading(): void {
    this.resetMount();
    const screen = this.screen("TableRace");
    screen.appendChild(this.note("loading physics…"));
    this.mount.appendChild(screen);
  }

  private renderMainMenu(): void {
    this.resetMount();
    const screen = this.screen("TableRace");
    screen.appendChild(this.note("choose a mode"));
    for (const m of MODE_LABELS) {
      screen.appendChild(this.button(m.label, () => this.chooseMode(m.id)));
    }
    this.mount.appendChild(screen);
  }

  private renderCarSelect(): void {
    this.resetMount();
    const screen = this.screen("Choose your car");
    screen.appendChild(this.note(`mode: ${this.selectedMode}`));
    for (const c of CARS) {
      screen.appendChild(
        this.button(`${c.name} — spd ${c.spd} · grip ${c.grip}`, () =>
          this.chooseCar(c.id),
        ),
      );
    }
    screen.appendChild(
      this.button("← Back", () => this.fsm.transition("mainMenu")),
    );
    this.mount.appendChild(screen);
  }

  private renderResults(): void {
    this.loop?.pause();
    const snap = this.lastSnap;
    const screen = this.overlayScreen();
    const won = snap?.race.leaderId === 0;
    const title = document.createElement("h1");
    title.textContent = won ? "🏆 You win!" : "Race over";
    screen.appendChild(title);
    if (snap) screen.appendChild(this.note(this.resultsSummary(snap)));
    screen.appendChild(
      this.button("Rematch", () => this.fsm.transition("countdown")),
    );
    screen.appendChild(
      this.button("Main menu", () => this.fsm.transition("mainMenu")),
    );
    this.mount.appendChild(screen);
    this.overlays.push(screen);
  }

  private resultsSummary(snap: Snapshot): string {
    const r = snap.race;
    switch (r.mode) {
      case "elimination":
        return `your points: ${r.scores[0] ?? 0}`;
      case "circuit":
        return `you finished P${r.positions?.[0] ?? "?"} of ${snap.cars.length}`;
      case "timetrial":
        return `best lap: ${((r.bestLapMs?.[0] ?? 0) / 1000).toFixed(2)}s`;
      case "battle":
        return r.leaderId === 0 ? "last car standing!" : "you were knocked out";
    }
  }

  // ---- Actions ------------------------------------------------------------

  private chooseMode(mode: ModeChoice): void {
    this.selectedMode = mode;
    this.fsm.transition("carSelect");
  }

  private chooseCar(id: string): void {
    this.selectedCar = id;
    this.fsm.transition("countdown");
  }

  private startSession(): void {
    if (!this.rapier) return;
    this.resetMount();

    const track = createProceduralTrack();
    const { mode, cars, powerups } = this.buildRace(track.checkpoints);
    const cameraMode: CameraMode =
      this.selectedMode === "freedrive" ? "follow" : "shared";

    this.sim = new Simulation(this.rapier, {
      track,
      mode: mode ?? undefined,
      cars,
      powerups,
      seed: 1,
    });
    this.renderer = new WorldRenderer(this.mount, { cameraMode });
    this.renderer.setTrack(track);
    this.input = new InputManager();
    const input = this.input;
    this.resultsShown = false;

    this.loop = new GameLoop(
      this.sim,
      this.renderer,
      () => [input.sample()],
      (snap) => this.onFrame(snap),
    );
    this.loop.pause(); // released when the countdown hits GO
    this.loop.start();

    this.addBackButton();
  }

  private buildRace(
    checkpoints: ReturnType<typeof createProceduralTrack>["checkpoints"],
  ): {
    mode: RaceMode | null;
    cars: CarConfig[];
    powerups: boolean;
  } {
    const player: CarConfig = { stats: profileById(this.selectedCar).stats };
    const bots: CarConfig[] = [
      { stats: SPEEDSTER, ai: true },
      { stats: GRIPPER, ai: true },
      { stats: HEAVY, ai: true },
    ];
    switch (this.selectedMode) {
      case "elimination":
        return {
          mode: new EliminationMode(4, { pointsToWin: 3 }),
          cars: [player, ...bots],
          powerups: true,
        };
      case "circuit":
        return {
          mode: new CircuitMode(4, checkpoints, { totalLaps: 3 }),
          cars: [player, ...bots],
          powerups: true,
        };
      case "battle":
        return {
          mode: new BattleMode(4),
          cars: [player, ...bots],
          powerups: true,
        };
      case "timetrial":
        return {
          mode: new TimeTrialMode(checkpoints, { totalLaps: 3 }),
          cars: [player],
          powerups: false,
        };
      case "freedrive":
        return { mode: null, cars: [player], powerups: false };
    }
  }

  private runCountdown(): void {
    const overlay = this.overlayScreen();
    const num = document.createElement("h1");
    num.style.fontSize = "clamp(4rem, 20vw, 12rem)";
    overlay.appendChild(num);
    this.mount.appendChild(overlay);
    this.overlays.push(overlay);

    const steps = ["3", "2", "1", "GO!"];
    steps.forEach((s, i) => {
      this.timers.push(window.setTimeout(() => (num.textContent = s), i * 700));
    });
    this.timers.push(
      window.setTimeout(() => {
        this.loop?.resume();
        this.fsm.transition("race");
      }, steps.length * 700),
    );
  }

  private onFrame(snap: Snapshot): void {
    this.lastSnap = snap;
    this.hud?.update(snap);
    if (
      snap.race.phase === "finished" &&
      !this.resultsShown &&
      this.fsm.state === "race"
    ) {
      this.resultsShown = true;
      this.fsm.transition("results");
    }
  }

  private teardownSession(): void {
    this.timers.forEach((t) => clearTimeout(t));
    this.timers = [];
    this.loop?.stop();
    this.renderer?.dispose();
    this.sim?.dispose();
    this.input?.dispose();
    this.loop = null;
    this.renderer = null;
    this.sim = null;
    this.input = null;
    this.lastSnap = null;
    this.hud?.hide();
    this.clearOverlays();
  }

  // ---- DOM helpers --------------------------------------------------------

  private resetMount(): void {
    this.clearOverlays();
    this.mount.innerHTML = "";
  }

  private clearOverlays(): void {
    this.overlays.forEach((o) => o.remove());
    this.overlays = [];
  }

  private addBackButton(): void {
    const back = this.button("← Back", () => this.fsm.transition("mainMenu"));
    back.style.position = "fixed";
    back.style.top = "12px";
    back.style.left = "12px";
    back.style.zIndex = "10";
    this.mount.appendChild(back);
    this.overlays.push(back);
  }

  private screen(titleText: string): HTMLDivElement {
    const screen = document.createElement("div");
    screen.className = "screen";
    const title = document.createElement("h1");
    title.textContent = titleText;
    screen.appendChild(title);
    return screen;
  }

  /** Like screen() but a translucent overlay on top of the running scene. */
  private overlayScreen(): HTMLDivElement {
    const screen = document.createElement("div");
    screen.className = "screen overlay";
    return screen;
  }

  private note(text: string): HTMLParagraphElement {
    const p = document.createElement("p");
    p.className = "screen-state";
    p.textContent = text;
    return p;
  }

  private button(label: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.className = "menu-button";
    btn.textContent = label;
    btn.addEventListener("click", onClick);
    return btn;
  }
}

// Compact car roster for the select screen (name + a couple of stat hints).
function profileRoster(): {
  id: string;
  name: string;
  spd: number;
  grip: number;
}[] {
  return [
    { id: "balanced", name: "Runner", spd: 3, grip: 3 },
    { id: "speedster", name: "Bolt", spd: 5, grip: 2 },
    { id: "gripper", name: "Hugger", spd: 2, grip: 5 },
    { id: "heavy", name: "Tank", spd: 2, grip: 3 },
  ];
}
