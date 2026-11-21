import { createFileRoute } from "@tanstack/react-router";

/**
 * POST /api/cakto — avisos (webhooks) da Cakto: compra aprovada, renovação, cancelamento,
 * reembolso e chargeback. Só vale com o segredo certo: o "secret" que a Cakto manda no corpo
 * (ou ?secret= no endereço) precisa bater com a chave colada no Painel ADM (ou CAKTO_WEBHOOK_SECRET).
 */
export const Route = createFileRoute("/api/cakto")({
  server: {
    handlers: {
      GET: async () => {
        const { segredoDefinido } = await import("../../server/assinaturas");
        return Response.json({ ok: true, pronto: segredoDefinido() });
      },
      POST: async ({ request }) => {
        const { lerAviso, aplicarAviso, registrarRecusa, segredoConfere, segredoDefinido } = await import("../../server/assinaturas");
        if (!segredoDefinido()) return Response.json({ ok: false, erro: "chave do webhook não configurada (Painel ADM → Assinaturas)" }, { status: 503 });
        const bruto = await request.text();
        if (bruto.length > 200_000) return Response.json({ ok: false, erro: "aviso grande demais" }, { status: 413 });
        const corpo = lerCorpo(bruto);
        if (corpo === null) {
          registrarRecusa(lerAviso({}), `formato não reconhecido (${(request.headers.get("content-type") ?? "sem content-type").slice(0, 60)})`);
          return Response.json({ ok: false, erro: "corpo não é JSON nem formulário" }, { status: 400 });
        }
        const aviso = lerAviso(corpo);
        const url = new URL(request.url);
        const recebido = aviso.segredo || url.searchParams.get("secret") || request.headers.get("x-cakto-secret") || request.headers.get("x-webhook-secret") || "";
        if (!segredoConfere(recebido)) {
          registrarRecusa(aviso, recebido ? "segredo errado" : "aviso sem segredo");
          return Response.json({ ok: false, erro: "segredo inválido" }, { status: 401 });
        }
        const resultado = aplicarAviso(aviso);
        return Response.json({ ok: true, resultado });
      },
    },
  },
});

/** JSON (o normal da Cakto) ou formulário (a=1&b=2, com "data" podendo vir como texto JSON). */
export function lerCorpo(bruto: string): unknown {
  try {
    return JSON.parse(bruto);
  } catch {
    /* tenta formulário */
  }
  if (!bruto.includes("=")) return null;
  const o: Record<string, unknown> = {};
  for (const [k, v] of new URLSearchParams(bruto)) {
    try {
      o[k] = v.trim().startsWith("{") ? JSON.parse(v) : v;
    } catch {
      o[k] = v;
    }
  }
  return Object.keys(o).length ? o : null;
}
