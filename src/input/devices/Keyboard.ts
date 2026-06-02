// Tracks which keys are currently held. Client-side only (window events); the
// InputManager polls it at the sim tick rate. Not in sim/ so DOM is allowed.

export class Keyboard {
  private readonly pressed = new Set<string>();

  private readonly onDown = (e: KeyboardEvent) => {
    this.pressed.add(e.code);
    // Stop the page from scrolling on arrows/space while driving.
    if (DRIVE_KEYS.has(e.code)) e.preventDefault();
  };
  private readonly onUp = (e: KeyboardEvent) => {
    this.pressed.delete(e.code);
  };

  constructor() {
    window.addEventListener("keydown", this.onDown);
    window.addEventListener("keyup", this.onUp);
  }

  /** True if any of the given key codes is held. */
  any(codes: string[]): boolean {
    for (const c of codes) if (this.pressed.has(c)) return true;
    return false;
  }

  dispose(): void {
    window.removeEventListener("keydown", this.onDown);
    window.removeEventListener("keyup", this.onUp);
    this.pressed.clear();
  }
}

const DRIVE_KEYS = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Space",
]);
