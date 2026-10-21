/**
 * Camada HTTP da API do Cartola FC (somente servidor).
 *
 * A Globo mantém dois hosts com a mesma API: api.cartolafc.globo.com (histórico)
 * e api.cartola.globo.com. Tentamos o preferido e, se falhar por rede/5xx/404,
 * o outro — e lembramos qual respondeu por último.
 *
 * Endpoints autenticados (/auth/...) recebem o token do próprio cartoleiro
 * (cabeçalho X-GLB-Token, ou Authorization: Bearer). O token nunca é gravado
 * no servidor: viaja só na requisição.
 */

const env = (k: string) => (typeof process !== "undefined" ? process.env[k] : undefined);

export const CARTOLA_HOSTS: string[] = (env("CARTOLA_API_HOSTS") ?? env("CARTOLA_API_BASE") ?? "https://api.cartolafc.globo.com,https://api.cartola.globo.com")
  .split(",")
  .map((s) => s.trim().replace(/\/+$/, ""))
  .filter(Boolean);

let preferred = 0;

export class CartolaError extends Error {
  constructor(
    message: string,
    public status: number,
    public body?: unknown,
  ) {
    super(message);
  }
}

export interface CartolaRequest {
  method?: "GET" | "POST";
  body?: unknown;
  token?: string;
  timeoutMs?: number;
}

/** Token do login novo da Globo (OIDC): um JWT "xxx.yyy.zzz" que começa com "eyJ". */
export const isOidcToken = (token: string) => /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(token.replace(/^Bearer\s+/i, ""));

function headersFor(token?: string): Record<string, string> {
  const h: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (compatible; TropaFC/1.0)",
    Accept: "application/json, text/plain, */*",
  };
  // chave opcional do relay (Cloudflare Worker) que fica na frente da API
  const relayKey = env("CARTOLA_RELAY_KEY");
  if (relayKey) h["x-relay-key"] = relayKey;
  if (token) {
    const t = token.replace(/^Bearer\s+/i, "");
    // o site do Cartola manda estes cabeçalhos em toda chamada autenticada
    h.Origin = "https://cartola.globo.com";
    h.Referer = "https://cartola.globo.com/";
    h["x-glb-app"] = "cartola_web";
    if (isOidcToken(t)) {
      // login novo: Bearer + x-glb-auth: oidc (sem o cabeçalho antigo, que confunde a API)
      h.Authorization = `Bearer ${t}`;
      h["x-glb-auth"] = "oidc";
    } else {
      // token antigo (GLBID)
      h["X-GLB-Token"] = t;
    }
  }
  return h;
}

/** Hosts na ordem certa: com token do login novo, primeiro o host novo (o antigo recusa esse token). */
function hostsPara(req: CartolaRequest): number[] {
  const n = CARTOLA_HOSTS.length;
  const ordem = Array.from({ length: n }, (_, i) => (preferred + i) % n);
  if (req.token && isOidcToken(req.token)) {
    const novo = CARTOLA_HOSTS.findIndex((h) => /api\.cartola\.globo\.com/.test(h));
    if (novo >= 0) return [novo, ...ordem.filter((i) => i !== novo)];
  }
  return ordem;
}

async function once<T>(host: string, path: string, req: CartolaRequest): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), req.timeoutMs ?? 10_000);
  try {
    const headers = headersFor(req.token);
    if (req.body !== undefined) headers["Content-Type"] = "application/json";
    const res = await fetch(`${host}${path}`, {
      method: req.method ?? "GET",
      headers,
      body: req.body !== undefined ? JSON.stringify(req.body) : undefined,
      signal: ctrl.signal,
    });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = text;
    }
    if (!res.ok) {
      const msg = (json && typeof json === "object" && "mensagem" in json && String((json as { mensagem: unknown }).mensagem)) || `HTTP ${res.status}`;
      throw new CartolaError(`Cartola ${path}: ${msg}`, res.status, json);
    }
    return json as T;
  } finally {
    clearTimeout(timer);
  }
}

/** Chama a API tentando os hosts em ordem (a partir do que respondeu por último). */
export async function cartola<T>(path: string, req: CartolaRequest = {}): Promise<T> {
  let lastErr: unknown;
  for (const idx of hostsPara(req)) {
    for (let attempt = 0; attempt < (req.method === "POST" ? 1 : 2); attempt++) {
      try {
        const out = await once<T>(CARTOLA_HOSTS[idx], path, req);
        // o host preferido vale para as chamadas públicas; as autenticadas escolhem pelo token
        if (!req.token) preferred = idx;
        return out;
      } catch (err) {
        lastErr = err;
        if (err instanceof CartolaError && err.status >= 400 && err.status < 500 && err.status !== 404 && err.status !== 429) {
          // 401/403 com token: o outro host pode aceitar esse tipo de token — tenta o próximo host
          if (req.token && (err.status === 401 || err.status === 403)) break;
          // demais erros do cliente (corpo errado etc.) não melhoram trocando de host
          throw err;
        }
      }
    }
  }
  throw lastErr;
}

export function activeHost() {
  return CARTOLA_HOSTS[preferred];
}
