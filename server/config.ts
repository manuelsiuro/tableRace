// Host server configuration. Plain constants shared by the ws server, the
// authoritative loop, and discovery.

import { MAX_PLAYERS, TICK_HZ } from "../src/shared/protocol";

export const PORT = Number(process.env.PORT ?? 3000);
export const HOST_TICK_HZ = TICK_HZ;
export const SERVER_MAX_PLAYERS = MAX_PLAYERS;

/** Optional artificial latency (ms) added to outbound frames for testing. */
export const NET_LAG_MS = Number(process.env.NET_LAG_MS ?? 0);

/** Points needed to win the LAN elimination match. */
export const POINTS_TO_WIN = 3;
