/**
 * Redis compartilhado (Upstash, pela API REST — sem dependências). Na Vercel cada instância
 * tem seu próprio disco temporário, então posts, usuários e comentários precisam morar num
 * lugar comum a todas. Ligado quando a integração Upstash/KV da Vercel cria as variáveis
 * KV_REST_API_URL/KV_REST_API_TOKEN (ou UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN).
 */

function credenciais() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

export const remoteEnabled = () => credenciais() != null;

export type Cmd = Array<string | number>;

/** Executa vários comandos numa ida só. Lança erro se algum falhar. */
export async function pipeline(cmds: Cmd[]): Promise<unknown[]> {
  const c = credenciais();
  if (!c) throw new Error("Redis não configurado.");
  if (!cmds.length) return [];
  const res = await fetch(`${c.url}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${c.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmds),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Redis HTTP ${res.status}`);
  const out = (await res.json()) as Array<{ result?: unknown; error?: string }>;
  const erro = out.find((r) => r.error);
  if (erro) throw new Error(`Redis: ${erro.error}`);
  return out.map((r) => r.result);
}
