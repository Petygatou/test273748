/**
 * Atalhos "Perguntar ao Comandante": levam o contexto exato da tela para o chat.
 * O contexto é dado estruturado (números do motor); a IA só interpreta.
 */
export interface AskPayload {
  titulo: string;
  pergunta: string;
  contexto?: unknown;
}

const KEY = "cfc:ask";

export function queueAsk(p: AskPayload) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* sem storage: o chat abre vazio */
  }
}

export function takeAsk(): AskPayload | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    return JSON.parse(raw) as AskPayload;
  } catch {
    return null;
  }
}
