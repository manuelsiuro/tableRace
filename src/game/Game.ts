// Top-level orchestrator. Owns the game-flow FSM and, in later milestones, the
// full race session, world renderer, and Pixi HUD. M1: boot awaits Rapier WASM,
// then a menu launches a physics demo (a box falling onto the ground) driven by
// the real fixed-timestep loop + interpolating renderer. Client-side; may touch
// the DOM (sim/shared/core may not).

import {
  GameStateMachine,
  type GameStateName,
} from "../state/GameStateMachine";
import { initRapier, type Rapier } from "../sim/physics/RapierInit";
import { Simulation } from "../sim/Simulation";
import { WorldRenderer } from "../render/WorldRenderer";
import { InputManager } from "../input/InputManager";
import { GameLoop } from "./GameLoop";

export class Game {
  private readonly mount: HTMLElement;
  private readonly fsm = new GameStateMachine();
  private rapier: Rapier | null = null;

  // Active session (M2: free-drive). Replaced by a real RaceSession later.
  private loop: GameLoop | null = null;
  private renderer: WorldRenderer | null = null;
  private sim: Simulation | null = null;
  private input: InputManager | null = null;

  constructor(mount: HTMLElement) {
    this.mount = mount;
    this.fsm.onChange((to) => this.renderState(to));
  }

  async start(): Promise<void> {
    this.renderLoading();
    // Real boot work: initialize the physics WASM before any world is built.
    this.rapier = await initRapier();
    this.fsm.transition("mainMenu");
  }

  // ---- Screens -----------------------------------------------------------

  private renderLoading(): void {
    this.mount.innerHTML = "";
    const screen = this.screen("TableRace");
    const p = document.createElement("p");
    p.className = "screen-state";
    p.textContent = "loading physics…";
    screen.appendChild(p);
    this.mount.appendChild(screen);
  }

  private renderState(state: GameStateName): void {
    if (state !== "mainMenu") return; // M1 only drives the menu screen here
    this.teardownSession();
    this.mount.innerHTML = "";
    const screen = this.screen("TableRace");

    const sub = document.createElement("p");
    sub.className = "screen-state";
    sub.textContent = "M2 — free drive";
    screen.appendChild(sub);

    screen.appendChild(this.button("Drive (M2)", () => this.startDrive()));
    this.mount.appendChild(screen);
  }

  // ---- M2 free-drive session ---------------------------------------------

  private startDrive(): void {
    if (!this.rapier) return;
    this.mount.innerHTML = "";

    this.sim = new Simulation(this.rapier);
    this.renderer = new WorldRenderer(this.mount);
    this.input = new InputManager();
    const input = this.input;
    this.loop = new GameLoop(this.sim, this.renderer, () => [input.sample()]);
    this.loop.start();

    const back = this.button("← Back", () => this.fsm.transition("mainMenu"));
    back.style.position = "fixed";
    back.style.top = "12px";
    back.style.left = "12px";
    back.style.zIndex = "10";
    this.mount.appendChild(back);

    const hint = document.createElement("p");
    hint.className = "screen-state";
    hint.textContent = "WASD / Arrows to drive · Space to drift";
    hint.style.position = "fixed";
    hint.style.bottom = "12px";
    hint.style.left = "50%";
    hint.style.transform = "translateX(-50%)";
    hint.style.zIndex = "10";
    this.mount.appendChild(hint);
  }

  private teardownSession(): void {
    this.loop?.stop();
    this.renderer?.dispose();
    this.sim?.dispose();
    this.input?.dispose();
    this.loop = null;
    this.renderer = null;
    this.sim = null;
    this.input = null;
  }

  // ---- DOM helpers -------------------------------------------------------

  private screen(titleText: string): HTMLDivElement {
    const screen = document.createElement("div");
    screen.className = "screen";
    const title = document.createElement("h1");
    title.textContent = titleText;
    screen.appendChild(title);
    return screen;
  }

  private button(label: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.className = "menu-button";
    btn.textContent = label;
    btn.addEventListener("click", onClick);
    return btn;
  }
}
