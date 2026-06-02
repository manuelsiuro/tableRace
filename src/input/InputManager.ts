// Folds the active input devices into a single InputAction for the LOCAL player,
// sampled once per sim tick. Gamepad/touch are added in later milestones; they
// write into the same struct so the simulation stays source-agnostic.

import { Keyboard } from "./devices/Keyboard";
import { DEFAULT_BINDINGS, type KeyBindings } from "./Bindings";
import type { InputAction } from "../shared/inputAction";

export class InputManager {
  private readonly keyboard = new Keyboard();
  private readonly bindings: KeyBindings;

  constructor(bindings: KeyBindings = DEFAULT_BINDINGS) {
    this.bindings = bindings;
  }

  /** Current input for the local player. */
  sample(): InputAction {
    const kb = this.keyboard;
    const b = this.bindings;
    const steer = (kb.any(b.right) ? 1 : 0) - (kb.any(b.left) ? 1 : 0);
    return {
      steer,
      throttle: kb.any(b.throttle) ? 1 : 0,
      brake: kb.any(b.brake) ? 1 : 0,
      handbrake: kb.any(b.handbrake),
      usePowerup: kb.any(b.usePowerup),
    };
  }

  dispose(): void {
    this.keyboard.dispose();
  }
}
