/**
 * Fotos oficiais dos atletas (CDN da Globo). O app tenta a foto direto do
 * CDN e, se o navegador não conseguir, passa por /api/foto, que só aceita
 * hosts da Globo e guarda a imagem em cache.
 */
const ALLOWED = /(^|\.)(globo\.com|glbimg\.com)$/i;

/** Normaliza a URL da API: tamanho 220x220 e sempre https. */
export function normalizeFoto(url?: string | null): string | undefined {
  if (!url || typeof url !== "string") return undefined;
  const u = url.trim().replace("FORMATO", "220x220").replace(/^http:\/\//i, "https://");
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

const cache = new Map<string, { body: ArrayBuffer; type: string; at: number }>();
const TTL = 24 * 3600_000;
const MAX_ITEMS = 1500;

export async function proxyFoto(raw: string | null): Promise<Response> {
  const u = raw ? isAllowedFoto(raw) : null;
  if (!u) return new Response("URL não permitida", { status: 400 });
  const key = u.toString();
  const hit = cache.get(key);
  const headers = (type: string) => ({ "Content-Type": type, "Cache-Control": "public, max-age=604800, immutable" });
  if (hit && Date.now() - hit.at < TTL) return new Response(hit.body, { headers: headers(hit.type) });
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(key, { signal: ctrl.signal, headers: { "User-Agent": "Mozilla/5.0 TropaFC/1.0", Accept: "image/*" } });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !type.startsWith("image/")) return new Response("Foto indisponível", { status: 404 });
    const body = await res.arrayBuffer();
    if (body.byteLength > 2_000_000) return new Response("Foto grande demais", { status: 413 });
    if (cache.size >= MAX_ITEMS) cache.delete(cache.keys().next().value!);
    cache.set(key, { body, type, at: Date.now() });
    return new Response(body, { headers: headers(type) });
  } catch {
    return new Response("Foto indisponível", { status: 404 });
  } finally {
    clearTimeout(t);
  }
}
