// Host entry point. Serves the built client from dist/ (production) and attaches
// the WebSocket game server on the same port. In dev, Vite serves the client on
// :5173 and the browser connects to this ws server on :3000 directly.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { attachWsServer } from "./wsServer";
import { printJoinInfo } from "./discovery";
import { PORT } from "./config";

const DIST = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");

const MIME: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".glb": "model/gltf-binary",
};

const http = createServer(async (req, res) => {
  if (!existsSync(DIST)) {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("TableRace host running (dev: open the Vite client on :5173)");
    return;
  }
  // Serve static files, falling back to index.html (SPA).
  const urlPath = (req.url ?? "/").split("?")[0];
  let filePath = normalize(join(DIST, urlPath === "/" ? "index.html" : urlPath));
  if (!filePath.startsWith(DIST)) filePath = join(DIST, "index.html"); // path-traversal guard
  if (!existsSync(filePath)) filePath = join(DIST, "index.html");
  try {
    const body = await readFile(filePath);
    res.writeHead(200, { "content-type": MIME[extname(filePath)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end("not found");
  }
});

attachWsServer(http);

http.listen(PORT, () => {
  void printJoinInfo(PORT);
});
