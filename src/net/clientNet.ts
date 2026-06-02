// Thin browser WebSocket wrapper around the shared codec/protocol. Connects to
// the host on :3000 (works in dev — Vite is on :5173 — and in prod where the
// host serves the client on :3000 too).

import { decode, encode } from "../shared/codec";
import type { ClientMessage, ServerMessage } from "../shared/protocol";

export interface ClientNetHandlers {
  onOpen: () => void;
  onMessage: (msg: ServerMessage) => void;
  onClose: () => void;
}

export function hostWsUrl(): string {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.hostname}:3000`;
}

export class ClientNet {
  private readonly ws: WebSocket;

  constructor(url: string, handlers: ClientNetHandlers) {
    this.ws = new WebSocket(url);
    this.ws.onopen = () => handlers.onOpen();
    this.ws.onclose = () => handlers.onClose();
    this.ws.onmessage = (e) => {
      const msg = decode(typeof e.data === "string" ? e.data : "");
      if (msg) handlers.onMessage(msg as ServerMessage);
    };
  }

  send(msg: ClientMessage): void {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(encode(msg));
  }

  close(): void {
    this.ws.onclose = null;
    this.ws.close();
  }
}
