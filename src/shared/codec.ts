// Serialization seam. JSON today (~0.5 Mbps total for 4 players at 30 Hz — well
// within LAN capacity); swap to binary later by editing ONLY this file. decode()
// validates the frame is a well-formed tagged-union message before it reaches
// game logic, so malformed input degrades gracefully instead of throwing deep.

import type { NetMessage } from "./protocol";

export function encode(message: NetMessage): string {
  return JSON.stringify(message);
}

/**
 * Parse and shallow-validate a wire frame. Returns null on anything malformed
 * (bad JSON, not an object, missing/empty `type`) so callers can drop the frame
 * without crashing the connection.
 */
export function decode(raw: string): NetMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const type = (parsed as { type?: unknown }).type;
  if (typeof type !== "string" || type.length === 0) return null;
  return parsed as NetMessage;
}
