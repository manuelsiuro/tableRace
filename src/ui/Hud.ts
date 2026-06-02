// In-race HUD as a PixiJS overlay (per the library rule: 2D UI overlay → Pixi).
// A transparent, pointer-events-none canvas layered over the Three.js world.
// Reads the Snapshot each frame and formats mode-appropriate text. Client-only.

import { Application, Text, TextStyle } from "pixi.js";
import type { RaceSnapshot, Snapshot } from "../shared/snapshot";

function fmtTime(ms: number): string {
  if (ms <= 0) return "--:--";
  const total = Math.floor(ms);
  const s = Math.floor(total / 1000);
  const cs = Math.floor((total % 1000) / 10);
  return `${s}.${cs.toString().padStart(2, "0")}s`;
}

export class Hud {
  readonly app = new Application();
  private top!: Text;
  private sub!: Text;
  private readonly onResize = () => this.layout();

  async init(): Promise<void> {
    await this.app.init({
      resizeTo: window,
      backgroundAlpha: 0,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio, 2),
      autoDensity: true,
    });
    const c = this.app.canvas;
    c.style.position = "fixed";
    c.style.inset = "0";
    c.style.pointerEvents = "none";
    c.style.zIndex = "5";
    document.body.appendChild(c);

    const base = {
      fill: "#ffffff",
      fontFamily: "ui-monospace, SFMono-Regular, monospace",
      align: "center" as const,
    };
    this.top = new Text({
      text: "",
      style: new TextStyle({ ...base, fontSize: 22, letterSpacing: 2 }),
    });
    this.sub = new Text({
      text: "",
      style: new TextStyle({
        ...base,
        fontSize: 16,
        fill: "#9fd8ef",
        letterSpacing: 1,
      }),
    });
    this.top.anchor.set(0.5, 0);
    this.sub.anchor.set(0.5, 0);
    this.app.stage.addChild(this.top, this.sub);
    this.layout();
    window.addEventListener("resize", this.onResize);
  }

  private layout(): void {
    const w = this.app.screen.width;
    this.top.position.set(w / 2, 14);
    this.sub.position.set(w / 2, 44);
  }

  /** `youId` is the local player's car id (0 in single-player). */
  update(snap: Snapshot, youId = 0): void {
    if (!this.top) return;
    const race = snap.race;
    const aliveCount = snap.cars.filter((c) => c.alive).length;
    const item = snap.cars[youId]?.item;
    this.top.text = this.topLine(race, youId, snap.cars.length, aliveCount);
    this.sub.text = item
      ? `ITEM: ${item.toUpperCase()}  ·  press E`
      : this.subLine(race, youId);
  }

  private topLine(
    race: RaceSnapshot,
    you: number,
    carCount: number,
    aliveCount: number,
  ): string {
    if (race.phase === "finished") {
      return race.leaderId === you
        ? "🏆  YOU WIN"
        : `WINNER: CAR ${race.leaderId + 1}`;
    }
    switch (race.mode) {
      case "elimination":
        return `ROUND ${race.round + 1}  ·  PTS ${race.scores[you] ?? 0}  ·  ${aliveCount} RACING`;
      case "circuit": {
        const lap = (race.laps?.[you] ?? 0) + 1;
        const pos = race.positions?.[you] ?? 1;
        return `LAP ${Math.min(lap, race.totalLaps ?? lap)}/${race.totalLaps ?? "?"}  ·  P${pos}/${carCount}`;
      }
      case "timetrial": {
        const lap = (race.laps?.[you] ?? 0) + 1;
        return `LAP ${Math.min(lap, race.totalLaps ?? lap)}/${race.totalLaps ?? "?"}  ·  ${fmtTime(race.lapMs?.[you] ?? 0)}`;
      }
      case "battle":
        return `LIVES ${race.lives?.[you] ?? 0}  ·  ${aliveCount} LEFT`;
    }
  }

  private subLine(race: RaceSnapshot, you: number): string {
    if (race.mode === "timetrial")
      return `BEST ${fmtTime(race.bestLapMs?.[you] ?? 0)}`;
    if (race.phase === "roundEnd") return "round over";
    return "";
  }

  show(): void {
    this.app.canvas.style.display = "block";
  }
  hide(): void {
    this.app.canvas.style.display = "none";
  }

  destroy(): void {
    window.removeEventListener("resize", this.onResize);
    this.app.canvas.remove();
    this.app.destroy();
  }
}
