// Servidor Node de produção sem dependências: arquivos estáticos de dist/client
// e todo o resto (SSR, server functions, /api) pelo handler fetch do TanStack Start.
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, constants, createBrotliCompress, createGzip, gzipSync } from "node:zlib";

process.env.NODE_ENV ??= "production";
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

// Compressão: texto (HTML, JSON, JS, CSS) vai em brotli/gzip; SSE, imagens e Range passam direto.
const COMPRIMIVEL = /^(text\/(html|css|javascript|plain)|application\/(json|javascript|manifest\+json)|image\/svg)/;
function encodingFor(req, type) {
  if (!type || !COMPRIMIVEL.test(type) || req.headers.range) return null;
  const ae = String(req.headers["accept-encoding"] ?? "");
  return /\bbr\b/.test(ae) ? "br" : /\bgzip\b/.test(ae) ? "gzip" : null;
}
// flush a cada pedaço para o HTML em streaming do SSR não ficar preso no compressor
const BR_RAPIDO = { flush: constants.BROTLI_OPERATION_FLUSH, params: { [constants.BROTLI_PARAM_QUALITY]: 5 } };
// arquivos estáticos comprimidos uma vez só (qualidade máxima) e guardados em memória
const estaticos = new Map();
function comprimidoEstatico(file, enc) {
  const key = `${enc}:${file}`;
  let buf = estaticos.get(key);
  if (!buf) {
    const raw = readFileSync(file);
    buf = enc === "br" ? brotliCompressSync(raw, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }) : gzipSync(raw, { level: 9 });
    estaticos.set(key, buf);
  }
  return buf;
}

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
        const type = TYPES[extname(f.file)] ?? "application/octet-stream";
        const cache = url.pathname.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "public, max-age=3600";
        const enc = f.size > 1024 ? encodingFor(req, type) : null;
        if (enc) {
          const buf = comprimidoEstatico(f.file, enc);
          res.writeHead(200, { "Content-Type": type, "Content-Encoding": enc, "Content-Length": buf.length, "Cache-Control": cache, Vary: "Accept-Encoding" });
          return res.end(req.method === "HEAD" ? undefined : buf);
        }
        res.writeHead(200, { "Content-Type": type, "Content-Length": f.size, "Cache-Control": cache, Vary: "Accept-Encoding" });
        if (req.method === "HEAD") return res.end();
        return createReadStream(f.file).pipe(res);
      }
    }
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (v != null) headers.set(k, Array.isArray(v) ? v.join(", ") : v);
    const body = req.method === "GET" || req.method === "HEAD" ? undefined : Readable.toWeb(req);
    const response = await app.fetch(new Request(url, { method: req.method, headers, body, duplex: "half" }));
    const out = Object.fromEntries(response.headers);
    const cookies = response.headers.getSetCookie?.() ?? [];
    if (cookies.length) out["set-cookie"] = cookies;
    const type = response.headers.get("content-type") ?? "";
    const enc = response.body && !response.headers.has("content-encoding") && !type.startsWith("text/event-stream") ? encodingFor(req, type) : null;
    if (enc) {
      delete out["content-length"];
      out["content-encoding"] = enc;
      out.vary = out.vary ? `${out.vary}, Accept-Encoding` : "Accept-Encoding";
    }
    res.writeHead(response.status, out);
    if (!response.body) return res.end();
    const stream = Readable.fromWeb(response.body);
    if (!enc) return stream.pipe(res);
    stream.pipe(enc === "br" ? createBrotliCompress(BR_RAPIDO) : createGzip({ level: 6, flush: constants.Z_SYNC_FLUSH })).pipe(res);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Erro interno");
  }
}).listen(port, () => {
  console.log(`Tropa em http://localhost:${port}`);
  // liga o vigia dos dados mesmo sem nenhum visitante
  setTimeout(() => fetch(`http://127.0.0.1:${port}/api/saude`).catch(() => {}), 500);
});
