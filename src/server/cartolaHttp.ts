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

function headersFor(token?: string): Record<string, string> {
  const h: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (compatible; TropaFC/1.0)",
    Accept: "application/json",
  };
  if (token) {
    // tokens novos (OAuth) vão como Bearer; os antigos GLB como X-GLB-Token. Mandamos os dois.
    h["X-GLB-Token"] = token;
    h.Authorization = token.startsWith("Bearer ") ? token : `Bearer ${token}`;
  }
  return h;
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
  const n = CARTOLA_HOSTS.length;
  for (let i = 0; i < n; i++) {
    const idx = (preferred + i) % n;
    for (let attempt = 0; attempt < (req.method === "POST" ? 1 : 2); attempt++) {
      try {
        const out = await once<T>(CARTOLA_HOSTS[idx], path, req);
        preferred = idx;
        return out;
      } catch (err) {
        lastErr = err;
        // erros do cliente (token inválido, corpo errado) não melhoram trocando de host
        if (err instanceof CartolaError && err.status >= 400 && err.status < 500 && err.status !== 404 && err.status !== 429) throw err;
      }
    }
  }
  throw lastErr;
}

export function activeHost() {
  return CARTOLA_HOSTS[preferred];
}
