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
