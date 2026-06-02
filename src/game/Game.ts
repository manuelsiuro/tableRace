// Top-level orchestrator. Owns the game-flow FSM and, in later milestones, the
// fixed-timestep loop, the Three.js world renderer, and the Pixi HUD. For now it
// boots to a placeholder main menu so the skeleton runs end to end. This file is
// client-side and may touch the DOM (sim/shared/core may not).

import {
  GameStateMachine,
  type GameStateName,
} from "../state/GameStateMachine";

export class Game {
  private readonly mount: HTMLElement;
  private readonly fsm = new GameStateMachine();

  constructor(mount: HTMLElement) {
    this.mount = mount;
    this.fsm.onChange((to) => this.renderState(to));
  }

  start(): void {
    // boot → mainMenu. Real boot will await Rapier WASM + asset preload here.
    this.fsm.transition("mainMenu");
  }

  private renderState(state: GameStateName): void {
    this.mount.innerHTML = "";
    const screen = document.createElement("div");
    screen.className = "screen";

    const title = document.createElement("h1");
    title.textContent = "TableRace";
    screen.appendChild(title);

    const subtitle = document.createElement("p");
    subtitle.className = "screen-state";
    subtitle.textContent = `state: ${state}`;
    screen.appendChild(subtitle);

    // Placeholder navigation to exercise the FSM until real screens land.
    if (state === "mainMenu") {
      screen.appendChild(
        this.button("Play (Lobby)", () => this.fsm.transition("lobby")),
      );
    } else {
      screen.appendChild(
        this.button("Back to Menu", () => this.fsm.transition("mainMenu")),
      );
    }

    this.mount.appendChild(screen);
  }

  private button(label: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.className = "menu-button";
    btn.textContent = label;
    btn.addEventListener("click", onClick);
    return btn;
  }
}
