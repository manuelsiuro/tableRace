// WebSocket session: glues the lobby, the authoritative GameHost, and connected
// clients. Decodes/validates every frame through the shared codec, drives lobby
// state, auto-starts the match when everyone is ready, and handles drops
// (→ bot) and reconnects. Trusted LAN, so validation is light but present.

import type { Server as HttpServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { decode, encode } from "../src/shared/codec";
import { PROTOCOL_VERSION } from "../src/shared/protocol";
import type { ClientMessage, ServerMessage } from "../src/shared/protocol";
import { Lobby } from "./lobby";
import { GameHost } from "./gameHost";
import { NET_LAG_MS, SERVER_MAX_PLAYERS } from "./config";

export function attachWsServer(http: HttpServer): void {
  const wss = new WebSocketServer({ server: http });
  const lobby = new Lobby();
  const host = new GameHost((msg) => broadcast(msg));
  const conns = new Map<WebSocket, number>(); // ws → playerId
  const sockets = new Map<number, WebSocket>(); // playerId → ws

  function send(ws: WebSocket, msg: ServerMessage): void {
    if (ws.readyState !== WebSocket.OPEN) return;
    const data = encode(msg);
    if (NET_LAG_MS > 0) setTimeout(() => ws.readyState === WebSocket.OPEN && ws.send(data), NET_LAG_MS);
    else ws.send(data);
  }

  function broadcast(msg: ServerMessage): void {
    for (const ws of conns.keys()) send(ws, msg);
  }

  function broadcastLobby(): void {
    broadcast({ type: "lobby", state: lobby.state() });
  }

  function maybeStart(): void {
    if (!host.running && lobby.allReady()) {
      const humans = lobby.humanSlots();
      const carIds = Array.from({ length: SERVER_MAX_PLAYERS }, (_, i) => lobby.carIdFor(i));
      void host.start(humans, carIds);
    }
  }

  wss.on("connection", (ws) => {
    ws.on("message", (raw) => {
      const msg = decode(raw.toString());
      if (!msg) return; // drop malformed frames
      handle(ws, msg as ClientMessage);
    });

    ws.on("close", () => {
      const playerId = conns.get(ws);
      if (playerId === undefined) return;
      conns.delete(ws);
      sockets.delete(playerId);
      if (host.running) {
        lobby.disconnect(playerId);
        host.dropToBot(playerId);
        broadcast({ type: "playerLeft", playerId, replacedByBot: true });
      } else {
        lobby.leave(playerId);
        broadcast({ type: "playerLeft", playerId, replacedByBot: false });
      }
      broadcastLobby();
    });
  });

  function handle(ws: WebSocket, msg: ClientMessage): void {
    switch (msg.type) {
      case "hello": {
        if (msg.version !== PROTOCOL_VERSION) {
          send(ws, { type: "rejected", reason: "version mismatch" });
          ws.close();
          return;
        }
        // Reconnect to an existing slot mid-match?
        if (host.running && msg.playerId !== undefined && lobby.has(msg.playerId)) {
          const id = msg.playerId;
          conns.set(ws, id);
          sockets.set(id, ws);
          host.reconnect(id);
          send(ws, welcome(id));
          broadcastLobby();
          return;
        }
        if (host.running) {
          send(ws, { type: "rejected", reason: "match in progress" });
          ws.close();
          return;
        }
        const id = lobby.join(msg.name || "player");
        if (id === null) {
          send(ws, { type: "rejected", reason: "lobby full" });
          ws.close();
          return;
        }
        conns.set(ws, id);
        sockets.set(id, ws);
        send(ws, welcome(id));
        broadcastLobby();
        break;
      }
      case "selectCar": {
        const id = conns.get(ws);
        if (id !== undefined) {
          lobby.selectCar(id, msg.carId);
          broadcastLobby();
        }
        break;
      }
      case "ready": {
        const id = conns.get(ws);
        if (id !== undefined) {
          lobby.setReady(id, msg.ready);
          broadcastLobby();
          maybeStart();
        }
        break;
      }
      case "input": {
        const id = conns.get(ws);
        if (id !== undefined && host.running) host.setInput(id, msg.action);
        break;
      }
      case "ping":
        send(ws, { type: "pong", t0: msg.t0, t1: Date.now() });
        break;
      case "requestRematch":
        // Out of scope for v1: clients return to menu and re-join.
        break;
    }
  }

  function welcome(playerId: number): ServerMessage {
    return { type: "welcome", playerId, maxPlayers: SERVER_MAX_PLAYERS, tickHz: 30, snapshotHz: 30 };
  }
}
