/**
 * Fotos dos atletas (Cartola e API-Football). O navegador pede pelo nosso
 * servidor (/api/foto), que só aceita hosts conhecidos, reduz para o tamanho
 * exato em WebP e guarda em memória, em disco e no CDN por 30 dias.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { dataDir } from "./db";

const ALLOWED = /(^|\.)(globo\.com|glbimg\.com|api-sports\.io)$/i;

/** Normaliza a URL da API: tamanho 220x220 e sempre https. */
export function normalizeFoto(url?: string | null): string | undefined {
  if (!url || typeof url !== "string") return undefined;
  const u = url.trim().replace("FORMATO", "220x220").replace(/^http:\/\//i, "https://");
  // o Cartola manda uma silhueta genérica do clube quando não tem o rosto: não é foto
  if (/\/silhuetas?\//i.test(u)) return undefined;
  return /^https:\/\//i.test(u) ? u : undefined;
}

export function isAllowedFoto(raw: string): URL | null {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && ALLOWED.test(u.hostname) ? u : null;
  } catch {
    return null;
  }
}

const cache = new Map<string, { body: ArrayBuffer | Uint8Array; type: string; at: number }>();
const TTL = 24 * 3600_000;
const MAX_ITEMS = 2500;
/** endereços que falharam: não tenta de novo por 1 h (evita esperar o mesmo erro) */
const falhas = new Map<string, number>();
/** tamanhos servidos (px): o navegador pede o mais próximo de 2× o tamanho na tela */
export const SIZES = [64, 128, 192] as const;

const diskDir = () => join(dataDir(), "fotos-cache");
const diskKey = (url: string, size: number) => join(diskDir(), `${createHash("sha1").update(`${url}|${size}`).digest("hex")}.webp`);

type Sharp = (input: Uint8Array) => { resize: (w: number, h: number, o: object) => { webp: (o: object) => { toBuffer: () => Promise<Uint8Array> } } };
let sharpMod: Sharp | null | undefined;
async function loadSharp(): Promise<Sharp | null> {
  if (sharpMod !== undefined) return sharpMod;
  try {
    const m = (await import("sharp")) as unknown as { default: Sharp };
    sharpMod = m.default;
  } catch {
    sharpMod = null; // hospedagem sem suporte: entrega a original
  }
  return sharpMod;
}

const headers = (type: string) => ({
  "Content-Type": type,
  // navegador e CDN guardam por 30 dias
  "Cache-Control": "public, max-age=2592000, s-maxage=2592000, immutable",
});

/**
 * Busca a foto (só hosts permitidos), reduz para o tamanho pedido em WebP e
 * guarda em memória e em disco. Uma foto de 220×220 PNG (~40 KB) vira ~4 KB.
 */
export async function proxyFoto(raw: string | null, sizeParam?: string | null): Promise<Response> {
  const u = raw ? isAllowedFoto(raw) : null;
  if (!u) return new Response("URL não permitida", { status: 400 });
  const url = u.toString();
  const want = Number(sizeParam);
  const size = SIZES.find((x) => x >= want) ?? (want > 0 ? SIZES[SIZES.length - 1] : 0);
  const key = `${url}|${size}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return new Response(hit.body as BodyInit, { headers: headers(hit.type) });
  const fail = falhas.get(url);
  if (fail && Date.now() - fail < 3600_000) return new Response("Foto indisponível", { status: 404, headers: { "Cache-Control": "public, max-age=600" } });

  if (size) {
    try {
      const buf = readFileSync(diskKey(url, size));
      remember(key, buf, "image/webp");
      return new Response(buf as BodyInit, { headers: headers("image/webp") });
    } catch {
      /* ainda não está em disco */
    }
  }

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "Mozilla/5.0 TropaFC/1.0", Accept: "image/*" } });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !type.startsWith("image/")) {
      falhas.set(url, Date.now());
      return new Response("Foto indisponível", { status: 404 });
    }
    const body = new Uint8Array(await res.arrayBuffer());
    if (body.byteLength > 2_000_000) return new Response("Foto grande demais", { status: 413 });
    const sharp = size ? await loadSharp() : null;
    if (sharp) {
      try {
        const out = await sharp(body).resize(size, size, { fit: "cover", position: "top" }).webp({ quality: 78 }).toBuffer();
        remember(key, out, "image/webp");
        try {
          mkdirSync(diskDir(), { recursive: true });
          writeFileSync(diskKey(url, size), out);
        } catch {
          /* disco somente leitura */
        }
        return new Response(out as BodyInit, { headers: headers("image/webp") });
      } catch {
        /* imagem que o sharp não entende: segue com a original */
      }
    }
    remember(key, body, type);
    return new Response(body as BodyInit, { headers: headers(type) });
  } catch {
    falhas.set(url, Date.now());
    return new Response("Foto indisponível", { status: 404 });
  } finally {
    clearTimeout(t);
  }
}

function remember(key: string, body: ArrayBuffer | Uint8Array, type: string) {
  if (cache.size >= MAX_ITEMS) cache.delete(cache.keys().next().value!);
  cache.set(key, { body, type, at: Date.now() });
}
