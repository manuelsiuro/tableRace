// Default key bindings. Maps KeyboardEvent.code values to the abstract actions
// the InputManager folds into an InputAction. Kept as data so a settings screen
// can rebind later.

export interface KeyBindings {
  throttle: string[];
  brake: string[];
  left: string[];
  right: string[];
  handbrake: string[];
  usePowerup: string[];
}

export const DEFAULT_BINDINGS: KeyBindings = {
  throttle: ["ArrowUp", "KeyW"],
  brake: ["ArrowDown", "KeyS"],
  left: ["ArrowLeft", "KeyA"],
  right: ["ArrowRight", "KeyD"],
  handbrake: ["Space"],
  usePowerup: ["ShiftLeft", "ShiftRight", "KeyE"],
};
