// Power-up system: pickups → single-slot inventory → activation → effects.
// Pure (no Rapier/DOM): it operates on a plain-data context of car positions and
// mutates its own state, so it is fully unit-testable. Simulation queries the
// getters each step to apply stun/boost/oil to the cars and to build snapshots.
//
// Effects:
//   boost   instant   temporary accel + top-speed multiplier for the user
//   shield  held      absorbs one incoming hit
//   missile projectile homes the next car ahead; spins it out unless shielded
//   mine    deployable dropped behind; spins out the next car to touch it
//   oil     deployable dropped behind; a slick that guts grip for a while

import { createRng, type Rng } from "../../shared/math";
import type {
  PickupSnapshot,
  PowerupId,
  ProjectileSnapshot,
} from "../../shared/snapshot";
import type { SurfaceModifier } from "../track/SurfaceTable";
import { rollPowerup } from "./PowerupDefs";

export interface PuCar {
  id: number;
  x: number;
  z: number;
  yaw: number;
  alive: boolean;
  usePowerup: boolean;
  /** 0 = leader … 1 = last (drives the spawn weighting). */
  rankFactor: number;
  /** Track progress, for missile target selection (who is ahead). */
  progress: number;
}

export interface PuContext {
  cars: PuCar[];
}

export interface PuConfig {
  pickupRadius: number;
  respawnSteps: number;
  boostSteps: number;
  boostAccelMul: number;
  boostSpeedMul: number;
  stunSteps: number;
  oilGripSteps: number;
  oilGripMul: number;
  missileSpeed: number;
  missileLifeSteps: number;
  missileHitRadius: number;
  mineArmSteps: number;
  mineRadius: number;
  oilRadius: number;
  oilTtlSteps: number;
}

export const DEFAULT_PU: PuConfig = {
  pickupRadius: 2.6,
  respawnSteps: 90,
  boostSteps: 60,
  boostAccelMul: 1.8,
  boostSpeedMul: 1.4,
  stunSteps: 45,
  oilGripSteps: 45,
  oilGripMul: 0.12,
  missileSpeed: 40,
  missileLifeSteps: 150,
  missileHitRadius: 2.0,
  mineArmSteps: 30,
  mineRadius: 2.0,
  oilRadius: 2.6,
  oilTtlSteps: 600,
};

interface Missile {
  id: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  owner: number;
  life: number;
}
interface Mine {
  id: number;
  x: number;
  z: number;
  owner: number;
  arm: number;
}
interface OilPatch {
  id: number;
  x: number;
  z: number;
  ttl: number;
}
interface Spawn {
  x: number;
  z: number;
  cooldown: number;
}

export class PowerupSystem {
  private readonly cfg: PuConfig;
  private readonly rng: Rng;
  private readonly spawns: Spawn[];
  private readonly held: (PowerupId | null)[];
  private readonly boost: number[];
  private readonly shield: boolean[];
  private readonly stun: number[];
  private readonly oilTimer: number[];
  private missiles: Missile[] = [];
  private mines: Mine[] = [];
  private oil: OilPatch[] = [];
  private nextId = 1;

  constructor(
    carCount: number,
    spawnPositions: { x: number; z: number }[],
    seed = 1,
    cfg: Partial<PuConfig> = {},
  ) {
    this.cfg = { ...DEFAULT_PU, ...cfg };
    this.rng = createRng(seed);
    this.spawns = spawnPositions.map((p) => ({ x: p.x, z: p.z, cooldown: 0 }));
    this.held = new Array(carCount).fill(null);
    this.boost = new Array(carCount).fill(0);
    this.shield = new Array(carCount).fill(false);
    this.stun = new Array(carCount).fill(0);
    this.oilTimer = new Array(carCount).fill(0);
  }

  step(ctx: PuContext): void {
    this.tickTimers(ctx);
    this.handlePickups(ctx);
    this.handleActivation(ctx);
    this.advanceMissiles(ctx);
    this.advanceMines(ctx);
    this.advanceOil(ctx);
  }

  // --- timers -------------------------------------------------------------
  private tickTimers(ctx: PuContext): void {
    for (const car of ctx.cars) {
      if (this.boost[car.id] > 0) this.boost[car.id]--;
      if (this.stun[car.id] > 0) this.stun[car.id]--;
      if (this.oilTimer[car.id] > 0) this.oilTimer[car.id]--;
    }
    for (const s of this.spawns) if (s.cooldown > 0) s.cooldown--;
  }

  // --- pickups ------------------------------------------------------------
  private handlePickups(ctx: PuContext): void {
    for (const s of this.spawns) {
      if (s.cooldown > 0) continue;
      for (const car of ctx.cars) {
        if (!car.alive || this.held[car.id]) continue;
        if (Math.hypot(car.x - s.x, car.z - s.z) <= this.cfg.pickupRadius) {
          this.held[car.id] = rollPowerup(car.rankFactor, this.rng);
          s.cooldown = this.cfg.respawnSteps;
          break;
        }
      }
    }
  }

  // --- activation ---------------------------------------------------------
  private handleActivation(ctx: PuContext): void {
    for (const car of ctx.cars) {
      if (!car.alive || !car.usePowerup) continue;
      const item = this.held[car.id];
      if (!item) continue;
      this.held[car.id] = null;
      this.activate(car, item);
    }
  }

  private activate(car: PuCar, item: PowerupId): void {
    const sin = Math.sin(car.yaw);
    const cos = Math.cos(car.yaw);
    switch (item) {
      case "boost":
        this.boost[car.id] = this.cfg.boostSteps;
        break;
      case "shield":
        this.shield[car.id] = true;
        break;
      case "missile":
        this.missiles.push({
          id: this.nextId++,
          x: car.x + sin * 2,
          z: car.z + cos * 2,
          vx: sin * this.cfg.missileSpeed,
          vz: cos * this.cfg.missileSpeed,
          owner: car.id,
          life: this.cfg.missileLifeSteps,
        });
        break;
      case "mine":
        this.mines.push({
          id: this.nextId++,
          x: car.x - sin * 2,
          z: car.z - cos * 2,
          owner: car.id,
          arm: this.cfg.mineArmSteps,
        });
        break;
      case "oil":
        this.oil.push({
          id: this.nextId++,
          x: car.x - sin * 2,
          z: car.z - cos * 2,
          ttl: this.cfg.oilTtlSteps,
        });
        break;
    }
  }

  /** Apply a hit unless the target is shielded (which consumes the shield). */
  private hit(targetId: number): void {
    if (this.shield[targetId]) {
      this.shield[targetId] = false;
      return;
    }
    this.stun[targetId] = this.cfg.stunSteps;
  }

  // --- missiles -----------------------------------------------------------
  private advanceMissiles(ctx: PuContext): void {
    const dt = 1 / 30;
    const next: Missile[] = [];
    for (const m of this.missiles) {
      m.life--;
      if (m.life <= 0) continue;

      // Home toward the nearest car ahead of the owner.
      const target = this.missileTarget(ctx, m.owner);
      if (target) {
        const desiredX = target.x - m.x;
        const desiredZ = target.z - m.z;
        const len = Math.hypot(desiredX, desiredZ) || 1;
        const speed = this.cfg.missileSpeed;
        // Blend current heading toward the target (turn rate).
        m.vx = m.vx * 0.85 + (desiredX / len) * speed * 0.15;
        m.vz = m.vz * 0.85 + (desiredZ / len) * speed * 0.15;
        const vlen = Math.hypot(m.vx, m.vz) || 1;
        m.vx = (m.vx / vlen) * speed;
        m.vz = (m.vz / vlen) * speed;
      }
      m.x += m.vx * dt;
      m.z += m.vz * dt;

      let consumed = false;
      for (const car of ctx.cars) {
        if (!car.alive || car.id === m.owner) continue;
        if (Math.hypot(car.x - m.x, car.z - m.z) <= this.cfg.missileHitRadius) {
          this.hit(car.id);
          consumed = true;
          break;
        }
      }
      if (!consumed) next.push(m);
    }
    this.missiles = next;
  }

  private missileTarget(ctx: PuContext, owner: number): PuCar | null {
    const me = ctx.cars[owner];
    if (!me) return null;
    let best: PuCar | null = null;
    let bestGap = Infinity;
    for (const car of ctx.cars) {
      if (!car.alive || car.id === owner) continue;
      const gap = car.progress - me.progress;
      if (gap > 0 && gap < bestGap) {
        bestGap = gap;
        best = car;
      }
    }
    return best;
  }

  // --- mines --------------------------------------------------------------
  private advanceMines(ctx: PuContext): void {
    const next: Mine[] = [];
    for (const mine of this.mines) {
      if (mine.arm > 0) mine.arm--;
      let triggered = false;
      if (mine.arm <= 0) {
        for (const car of ctx.cars) {
          if (!car.alive) continue;
          if (
            Math.hypot(car.x - mine.x, car.z - mine.z) <= this.cfg.mineRadius
          ) {
            this.hit(car.id);
            triggered = true;
            break;
          }
        }
      }
      if (!triggered) next.push(mine);
    }
    this.mines = next;
  }

  // --- oil ----------------------------------------------------------------
  private advanceOil(ctx: PuContext): void {
    const next: OilPatch[] = [];
    for (const patch of this.oil) {
      patch.ttl--;
      for (const car of ctx.cars) {
        if (!car.alive) continue;
        if (
          Math.hypot(car.x - patch.x, car.z - patch.z) <= this.cfg.oilRadius
        ) {
          this.oilTimer[car.id] = this.cfg.oilGripSteps;
        }
      }
      if (patch.ttl > 0) next.push(patch);
    }
    this.oil = next;
  }

  // --- queries (read by Simulation) ---------------------------------------
  heldItem(id: number): PowerupId | null {
    return this.held[id];
  }
  isStunned(id: number): boolean {
    return this.stun[id] > 0;
  }
  hasShield(id: number): boolean {
    return this.shield[id];
  }
  isBoosting(id: number): boolean {
    return this.boost[id] > 0;
  }

  /** Combined grip/accel/top-speed multiplier from boost + oil for a car. */
  effectModifier(id: number): SurfaceModifier {
    const boosting = this.boost[id] > 0;
    const oiled = this.oilTimer[id] > 0;
    return {
      gripMul: oiled ? this.cfg.oilGripMul : 1,
      accelMul: boosting ? this.cfg.boostAccelMul : 1,
      maxSpeedMul: boosting ? this.cfg.boostSpeedMul : 1,
    };
  }

  projectilesSnapshot(): ProjectileSnapshot[] {
    const out: ProjectileSnapshot[] = [];
    for (const m of this.missiles)
      out.push({ id: m.id, kind: "missile", x: m.x, y: 0.6, z: m.z });
    for (const m of this.mines)
      out.push({ id: m.id, kind: "mine", x: m.x, y: 0.2, z: m.z });
    for (const p of this.oil)
      out.push({ id: p.id, kind: "oil", x: p.x, y: 0.02, z: p.z });
    return out;
  }

  pickupsSnapshot(): PickupSnapshot[] {
    const out: PickupSnapshot[] = [];
    for (let i = 0; i < this.spawns.length; i++) {
      const s = this.spawns[i];
      if (s.cooldown <= 0) out.push({ id: i, x: s.x, z: s.z });
    }
    return out;
  }
}
