// On-screen touch controls: a left-thumb steering stick and right-side GAS /
// BRAKE / DRIFT / ITEM pedals. Writes into the same InputAction the keyboard
// produces, so the simulation is unaware of the source. Pointer events cover
// touch + mouse; multi-touch is tracked per pointerId. Client-only (DOM).

import type { InputAction } from "../../shared/inputAction";

export function isTouchDevice(): boolean {
  return typeof navigator !== "undefined" && navigator.maxTouchPoints > 0;
}

export class Touch {
  private readonly root: HTMLDivElement;
  private steer = 0;
  private throttle = 0;
  private brake = 0;
  private handbrake = false;
  private usePowerup = false;

  private stickPointer: number | null = null;
  private stickCx = 0;
  private readonly stickRadius = 60;

  constructor(parent: HTMLElement = document.body) {
    this.root = document.createElement("div");
    this.root.style.cssText =
      "position:fixed;inset:0;z-index:8;pointer-events:none;touch-action:none;";

    const stick = this.makeStick();
    this.root.appendChild(stick.base);

    this.root.appendChild(
      this.makeButton(
        "GAS",
        "right:24px;bottom:120px",
        () => (this.throttle = 1),
        () => (this.throttle = 0),
      ),
    );
    this.root.appendChild(
      this.makeButton(
        "BRK",
        "right:140px;bottom:64px",
        () => (this.brake = 1),
        () => (this.brake = 0),
      ),
    );
    this.root.appendChild(
      this.makeButton(
        "DRIFT",
        "right:140px;bottom:160px",
        () => (this.handbrake = true),
        () => (this.handbrake = false),
      ),
    );
    this.root.appendChild(
      this.makeButton(
        "ITEM",
        "right:24px;bottom:24px",
        () => (this.usePowerup = true),
        () => (this.usePowerup = false),
      ),
    );

    parent.appendChild(this.root);
  }

  /** Merge touch state onto a base action (keyboard takes priority if non-zero). */
  apply(base: InputAction): InputAction {
    return {
      steer: base.steer !== 0 ? base.steer : this.steer,
      throttle: Math.max(base.throttle, this.throttle),
      brake: Math.max(base.brake, this.brake),
      handbrake: base.handbrake || this.handbrake,
      usePowerup: base.usePowerup || this.usePowerup,
    };
  }

  private makeStick(): { base: HTMLDivElement } {
    const base = document.createElement("div");
    base.style.cssText =
      "position:absolute;left:24px;bottom:24px;width:140px;height:140px;border-radius:50%;background:rgba(255,255,255,0.08);border:2px solid rgba(255,255,255,0.25);pointer-events:auto;touch-action:none;";
    const knob = document.createElement("div");
    knob.style.cssText =
      "position:absolute;left:50%;top:50%;width:56px;height:56px;margin:-28px 0 0 -28px;border-radius:50%;background:rgba(156,216,239,0.6);";
    base.appendChild(knob);

    base.addEventListener("pointerdown", (e) => {
      this.stickPointer = e.pointerId;
      this.stickCx = base.getBoundingClientRect().left + base.clientWidth / 2;
      base.setPointerCapture(e.pointerId);
      this.updateStick(e.clientX, knob);
    });
    base.addEventListener("pointermove", (e) => {
      if (e.pointerId === this.stickPointer) this.updateStick(e.clientX, knob);
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId === this.stickPointer) {
        this.stickPointer = null;
        this.steer = 0;
        knob.style.transform = "translate(0,0)";
      }
    };
    base.addEventListener("pointerup", end);
    base.addEventListener("pointercancel", end);
    return { base };
  }

  private updateStick(clientX: number, knob: HTMLDivElement): void {
    const dx = clientX - this.stickCx;
    this.steer = Math.max(-1, Math.min(1, dx / this.stickRadius));
    knob.style.transform = `translate(${this.steer * 40}px,0)`;
  }

  private makeButton(
    label: string,
    pos: string,
    onDown: () => void,
    onUp: () => void,
  ): HTMLDivElement {
    const b = document.createElement("div");
    b.textContent = label;
    b.style.cssText =
      `position:absolute;${pos};width:96px;height:96px;border-radius:50%;display:flex;align-items:center;justify-content:center;` +
      "background:rgba(255,255,255,0.1);border:2px solid rgba(255,255,255,0.25);color:#fff;font:600 14px ui-monospace,monospace;pointer-events:auto;touch-action:none;user-select:none;";
    const down = (e: PointerEvent) => {
      e.preventDefault();
      b.setPointerCapture(e.pointerId);
      onDown();
    };
    const up = () => onUp();
    b.addEventListener("pointerdown", down);
    b.addEventListener("pointerup", up);
    b.addEventListener("pointercancel", up);
    return b;
  }

  dispose(): void {
    this.root.remove();
  }
}
