#!/usr/bin/env node
// Serve the repository for working on the viewer without building.
//
//   node tools/serve.ts [port]       default $PORT, or else 4719; npm run serve
//
// Then open viewer/index.html?src=../examples/rate-limit/graph.json, where / leads. Browsers cannot run
// TypeScript, so .ts files are served with their types stripped, the same way tools/bundle.ts
// strips them for a built page. Everything else is served as it is. Only files inside the
// repository are served, and only to this machine.

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { stripTypes } from "./bundle.ts";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const port = Number(process.argv[2] ?? process.env.PORT ?? 4719);
// Where / leads: the unbuilt viewer, showing the worked example.
const VIEWER = "/viewer/index.html?src=../examples/rate-limit/graph.json";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".ts": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
  if (path === "/") {
    res.writeHead(302, { location: VIEWER });
    return res.end();
  }
  let file = resolve(join(root, path));
  if (file !== root && !file.startsWith(root + sep)) return send(403, "forbidden");
  try {
    if ((await stat(file)).isDirectory()) file = join(file, "index.html");
    const body = await readFile(file);
    const ext = extname(file);
    res.writeHead(200, { "content-type": TYPES[ext] ?? "application/octet-stream", "cache-control": "no-store" });
    res.end(ext === ".ts" ? stripTypes(body.toString("utf8")) : body);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") send(404, "not found");
    else send(500, `could not serve ${path}: ${(err as Error).message}`);
  }

  function send(status: number, text: string) {
    res.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
    res.end(text + "\n");
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`Serving ${root} at http://localhost:${port}/`);
  console.log(`  viewer: http://localhost:${port}${VIEWER}`);
});
