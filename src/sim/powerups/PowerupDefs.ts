// Data-driven power-up table + position-weighted spawn roll. The roll is biased
// by race position (rankFactor 0 = leader … 1 = last) so trailing players get
// catch-up firepower and leaders get defensive items — the kart-racer staple.
// Pure + deterministic (seeded RNG), so it is fully unit-testable.

import type { Rng } from "../../shared/math";
import type { PowerupId } from "../../shared/snapshot";

export type PowerupKind = "instant" | "shield" | "projectile" | "deployable";

export interface PowerupDef {
  id: PowerupId;
  name: string;
  kind: PowerupKind;
  /** Render tint. */
  color: number;
}

export const POWERUP_DEFS: Record<PowerupId, PowerupDef> = {
  boost: { id: "boost", name: "Boost", kind: "instant", color: 0xfacc15 },
  shield: { id: "shield", name: "Shield", kind: "shield", color: 0x38bdf8 },
  missile: {
    id: "missile",
    name: "Missile",
    kind: "projectile",
    color: 0xef4444,
  },
  mine: { id: "mine", name: "Mine", kind: "deployable", color: 0x94a3b8 },
  oil: { id: "oil", name: "Oil", kind: "deployable", color: 0x1e1b1b },
};

export const ALL_POWERUPS: readonly PowerupId[] = [
  "boost",
  "shield",
  "missile",
  "mine",
  "oil",
];

/**
 * Weight for each power-up given the picker's rank (0 = leader … 1 = last).
 * Leaders skew defensive (shield); trailing cars skew offensive (missile/boost).
 */
export function spawnWeight(id: PowerupId, rankFactor: number): number {
  const back = rankFactor; // 1 when last
  const front = 1 - rankFactor; // 1 when leading
  switch (id) {
    case "shield":
      return 0.5 + front * 2.5;
    case "boost":
      return 0.5 + back * 2.0;
    case "missile":
      return 0.2 + back * 3.0;
    case "mine":
      return 1.2;
    case "oil":
      return 1.2;
  }
}

/** Weighted-random power-up for a picker at the given rank. */
export function rollPowerup(rankFactor: number, rng: Rng): PowerupId {
  const weights = ALL_POWERUPS.map((id) => spawnWeight(id, rankFactor));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng.next() * total;
  for (let i = 0; i < ALL_POWERUPS.length; i++) {
    r -= weights[i];
    if (r <= 0) return ALL_POWERUPS[i];
  }
  return ALL_POWERUPS[ALL_POWERUPS.length - 1];
}
