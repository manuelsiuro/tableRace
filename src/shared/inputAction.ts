// The single input seam. Humans (keyboard/gamepad/touch), AI bots, and remote
// players ALL produce this exact struct, so the simulation cannot tell them
// apart. This is what makes AI, netcode, and replay/testing fall out cleanly.

import { clamp } from "./math";

export interface InputAction {
  /** Steering: -1 (full left) .. 1 (full right). */
  steer: number;
  /** Throttle: 0 .. 1. */
  throttle: number;
  /** Brake / reverse: 0 .. 1. */
  brake: number;
  /** Handbrake — forces a drift regardless of speed/steer thresholds. */
  handbrake: boolean;
  /** Activate the currently held power-up. */
  usePowerup: boolean;
}

export const NEUTRAL_INPUT: InputAction = {
  steer: 0,
  throttle: 0,
  brake: 0,
  handbrake: false,
  usePowerup: false,
};

/**
 * Sanitize an input that arrived over the network. The host must never trust
 * client-supplied numbers — clamp ranges and coerce types before feeding the
 * simulation.
 */
export function clampInputAction(
  raw: Partial<InputAction> | undefined,
): InputAction {
  if (!raw) return { ...NEUTRAL_INPUT };
  return {
    steer: clamp(Number(raw.steer) || 0, -1, 1),
    throttle: clamp(Number(raw.throttle) || 0, 0, 1),
    brake: clamp(Number(raw.brake) || 0, 0, 1),
    handbrake: Boolean(raw.handbrake),
    usePowerup: Boolean(raw.usePowerup),
  };
}
