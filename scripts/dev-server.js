// Lokale ontwikkelserver zonder extra packages: `npm run dev` → http://localhost:3000
// Serveert /public en voert /api/*.js uit met een minimale Vercel-achtige req/res.
// Omgevingsvariabelen kun je meegeven, bijv.: APP_PASSWORD=test SESSION_SECRET=x npm run dev
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname, normalize } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json", ".png": "image/png" };

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname.startsWith("/api/")) {
    const name = url.pathname.slice(5).replace(/[^a-z0-9-]/gi, "");
    let mod;
    try {
      mod = await import(pathToFileURL(join(root, "api", `${name}.js`)).href);
    } catch {
      res.writeHead(404).end("Not found");
      return;
    }
    let raw = "";
    for await (const chunk of req) raw += chunk;
    req.body = raw;
    res.status = (c) => ((res.statusCode = c), res);
    res.json = (o) => (res.setHeader("Content-Type", "application/json"), res.end(JSON.stringify(o)));
    return mod.default(req, res);
  }
  let file = normalize(join(root, "public", url.pathname === "/" ? "index.html" : url.pathname));
  if (!file.startsWith(join(root, "public"))) return res.writeHead(403).end();
  try {
    if ((await stat(file)).isDirectory()) file = join(file, "index.html");
    res.writeHead(200, { "Content-Type": TYPES[extname(file)] || "application/octet-stream" });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404).end("Not found");
  }
}).listen(PORT, () => console.log(`Endurance Intelligence on http://localhost:${PORT}`));
