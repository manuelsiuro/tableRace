// Folds the active input devices into a single InputAction for the LOCAL player,
// sampled once per sim tick. Gamepad/touch are added in later milestones; they
// write into the same struct so the simulation stays source-agnostic.

import { Keyboard } from "./devices/Keyboard";
import { Touch, isTouchDevice } from "./devices/Touch";
import { DEFAULT_BINDINGS, type KeyBindings } from "./Bindings";
import type { InputAction } from "../shared/inputAction";

export class InputManager {
  private readonly keyboard = new Keyboard();
  private readonly touch: Touch | null;
  private readonly bindings: KeyBindings;

  constructor(bindings: KeyBindings = DEFAULT_BINDINGS) {
    this.bindings = bindings;
    // Show on-screen controls on touch devices (also merges with keyboard).
    this.touch = isTouchDevice() ? new Touch() : null;
  }

  /** Current input for the local player. */
  sample(): InputAction {
    const kb = this.keyboard;
    const b = this.bindings;
    const steer = (kb.any(b.right) ? 1 : 0) - (kb.any(b.left) ? 1 : 0);
    const action: InputAction = {
      steer,
      throttle: kb.any(b.throttle) ? 1 : 0,
      brake: kb.any(b.brake) ? 1 : 0,
      handbrake: kb.any(b.handbrake),
      usePowerup: kb.any(b.usePowerup),
    };
    return this.touch ? this.touch.apply(action) : action;
  }

  dispose(): void {
    this.keyboard.dispose();
    this.touch?.dispose();
  }
}
