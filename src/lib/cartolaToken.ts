/**
 * Acha o token do Cartola em qualquer coisa que a pessoa colar: o "Copy as cURL" inteiro,
 * o "Copy as fetch", a linha do cabeçalho, "Bearer xxx" ou só o token.
 */
const TOKEN = "([A-Za-z0-9._~+/=-]{20,})";

export function extrairTokenCartola(texto: string): string | null {
  const t = texto.trim();
  if (!t) return null;
  const padroes = [
    new RegExp(`authorization["']?\\s*[:=]\\s*["']?\\s*bearer\\s+${TOKEN}`, "i"),
    new RegExp(`x-glb-token["']?\\s*[:=]\\s*["']?\\s*${TOKEN}`, "i"),
    new RegExp(`^bearer\\s+${TOKEN}$`, "i"),
  ];
  for (const p of padroes) {
    const m = t.match(p);
    if (m) return m[1];
  }
  // só o token: uma "palavra" longa, sem espaços
  return /^[A-Za-z0-9._~+/=-]{20,}$/.test(t) ? t : null;
}

/**
 * Quando o token do login novo (OIDC/JWT) expira, em ms — lido do próprio token, sem enviá-lo
 * a lugar nenhum. O Cartola libera esse acesso por cerca de 1 hora. Token antigo: null.
 */
export function tokenExpiraEm(token: string): number | null {
  const partes = token.replace(/^Bearer\s+/i, "").split(".");
  if (partes.length !== 3) return null;
  try {
    const b64 = partes[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4))) as { exp?: unknown };
    return typeof json.exp === "number" ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

/** Já expirou (ou expira no próximo meio minuto)? */
export function tokenExpirado(token: string, agora = Date.now()): boolean {
  const e = tokenExpiraEm(token);
  return e != null && e <= agora + 30_000;
}
