import { createFileRoute } from "@tanstack/react-router";

/**
 * GET /api/analise — a análise da rodada em JSON puro (bem menor que o formato
 * das server functions), com ETag: se nada mudou, o navegador recebe 304 e
 * reaproveita o que já tem.
 */
export const Route = createFileRoute("/api/analise")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { loadAnalysis } = await import("../../server/season");
        const { createHash } = await import("node:crypto");
        try {
          const { analysis, meta, versao } = await loadAnalysis();
          const etag = `"${createHash("sha1").update(`${versao}|${meta.mercadoStatus}|${meta.updatedAt}`).digest("base64url").slice(0, 20)}"`;
          const headers = { ETag: etag, "Cache-Control": "no-cache", "Content-Type": "application/json; charset=utf-8" };
          if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
          return new Response(JSON.stringify({ analysis, meta }), { headers });
        } catch (e) {
          return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 503 });
        }
      },
    },
  },
});
