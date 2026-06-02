import { describe, it, expect } from "vitest";
import { Lobby } from "./lobby";

describe("Lobby", () => {
  it("assigns sequential slots and makes the first player host", () => {
    const lobby = new Lobby();
    expect(lobby.join("a")).toBe(0);
    expect(lobby.join("b")).toBe(1);
    expect(lobby.isHost(0)).toBe(true);
    expect(lobby.isHost(1)).toBe(false);
  });

  it("rejects joins past the max", () => {
    const lobby = new Lobby();
    for (let i = 0; i < 4; i++) lobby.join(`p${i}`);
    expect(lobby.join("overflow")).toBeNull();
  });

  it("reuses a freed slot after leave", () => {
    const lobby = new Lobby();
    lobby.join("a");
    lobby.join("b");
    lobby.leave(0);
    expect(lobby.join("c")).toBe(0);
  });

  it("promotes a new host when the host leaves", () => {
    const lobby = new Lobby();
    lobby.join("a");
    lobby.join("b");
    lobby.leave(0);
    expect(lobby.isHost(1)).toBe(true);
  });

  it("is allReady only when every connected human has readied + picked a car", () => {
    const lobby = new Lobby();
    lobby.join("a");
    lobby.join("b");
    lobby.selectCar(0, "balanced");
    lobby.setReady(0, true);
    expect(lobby.allReady()).toBe(false); // b not ready
    lobby.selectCar(1, "speedster");
    lobby.setReady(1, true);
    expect(lobby.allReady()).toBe(true);
  });

  it("keeps a disconnected slot but excludes it from human slots", () => {
    const lobby = new Lobby();
    lobby.join("a");
    lobby.join("b");
    lobby.disconnect(1);
    expect(lobby.humanSlots()).toEqual([0]);
    expect(lobby.has(1)).toBe(true); // slot retained (becomes a bot mid-race)
  });
});
