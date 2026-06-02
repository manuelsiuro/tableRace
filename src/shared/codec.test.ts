import { describe, it, expect } from "vitest";
import { encode, decode } from "./codec";
import type { ClientMessage, ServerMessage } from "./protocol";
import { NEUTRAL_INPUT } from "./inputAction";

describe("codec round-trip", () => {
  const messages: (ClientMessage | ServerMessage)[] = [
    { type: "hello", version: 1, joinCode: "ABCD", name: "p1" },
    { type: "selectCar", carId: "speedster" },
    { type: "ready", ready: true },
    { type: "input", tick: 120, seq: 7, action: NEUTRAL_INPUT },
    { type: "ping", t0: 1000 },
    { type: "requestRematch" },
    { type: "welcome", playerId: 0, maxPlayers: 4, tickHz: 30, snapshotHz: 30 },
    { type: "eliminated", playerId: 2, place: 3 },
    { type: "pong", t0: 1000, t1: 1005 },
    { type: "playerLeft", playerId: 1, replacedByBot: true },
  ];

  it("preserves every message type through encode → decode", () => {
    for (const msg of messages) {
      expect(decode(encode(msg))).toEqual(msg);
    }
  });
});

describe("codec validation", () => {
  it("returns null on invalid JSON", () => {
    expect(decode("not json{")).toBeNull();
  });

  it("returns null on non-object JSON", () => {
    expect(decode("42")).toBeNull();
    expect(decode("null")).toBeNull();
    expect(decode('"hello"')).toBeNull();
  });

  it("returns null when `type` is missing or empty", () => {
    expect(decode(JSON.stringify({ foo: 1 }))).toBeNull();
    expect(decode(JSON.stringify({ type: "" }))).toBeNull();
    expect(decode(JSON.stringify({ type: 5 }))).toBeNull();
  });

  it("accepts a well-formed tagged message", () => {
    const decoded = decode(JSON.stringify({ type: "ready", ready: false }));
    expect(decoded).toEqual({ type: "ready", ready: false });
  });
});
