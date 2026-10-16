// Servidor Node de produção sem dependências: arquivos estáticos de dist/client
// e todo o resto (SSR, server functions, /api) pelo handler fetch do TanStack Start.
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../dist/client/", import.meta.url));
const { default: app } = await import(new URL("../dist/server/server.js", import.meta.url).href);
const port = Number(process.env.PORT ?? 3000);

const TYPES = {
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
  ".json": "application/json",
  ".woff2": "font/woff2",
};

function staticFile(pathname) {
  const safe = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  const file = join(root, safe);
  if (!file.startsWith(root) || !existsSync(file)) return null;
  const st = statSync(file);
  return st.isFile() ? { file, size: st.size } : null;
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    if (req.method === "GET" || req.method === "HEAD") {
      const f = url.pathname !== "/" && staticFile(url.pathname);
      if (f) {
        res.writeHead(200, {
          "Content-Type": TYPES[extname(f.file)] ?? "application/octet-stream",
          "Content-Length": f.size,
          "Cache-Control": url.pathname.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "public, max-age=3600",
        });
        if (req.method === "HEAD") return res.end();
        return createReadStream(f.file).pipe(res);
      }
    }
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (v != null) headers.set(k, Array.isArray(v) ? v.join(", ") : v);
    const body = req.method === "GET" || req.method === "HEAD" ? undefined : Readable.toWeb(req);
    const response = await app.fetch(new Request(url, { method: req.method, headers, body, duplex: "half" }));
    res.writeHead(response.status, Object.fromEntries(response.headers));
    if (!response.body) return res.end();
    Readable.fromWeb(response.body).pipe(res);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Erro interno");
  }
}).listen(port, () => console.log(`Comandante FC em http://localhost:${port}`));
