import { createFileRoute } from "@tanstack/react-router";

/**
 * Envio direto para o Vercel Blob. O arquivo vai do navegador para o Blob sem passar pelo
 * servidor — a Vercel recusa corpos acima de 4,5 MB nas funções (HTTP 413), o que barrava vídeos.
 * Aqui só autorizamos o envio (administrador, tipo e tamanho) e devolvemos um token temporário.
 *
 * GET  /api/upload → { enabled } (o Blob está configurado nesta hospedagem?)
 * POST /api/upload → protocolo do @vercel/blob/client (gera o token do envio)
 */
export const Route = createFileRoute("/api/upload")({
  server: {
    handlers: {
      GET: () => Response.json({ enabled: Boolean(process.env.BLOB_READ_WRITE_TOKEN) }, { headers: { "Cache-Control": "no-store" } }),
      POST: async ({ request }) => {
        if (!process.env.BLOB_READ_WRITE_TOKEN) return Response.json({ error: "Armazenamento de arquivos (Vercel Blob) não configurado." }, { status: 501 });
        const { userFromRequest, isAdmin } = await import("../../server/auth");
        const { MEDIA_TYPES, MAX_MEDIA_BYTES } = await import("../../server/media");
        const u = userFromRequest(request);
        if (!u) return Response.json({ error: "Entre na sua conta para enviar mídia." }, { status: 401 });
        if (!isAdmin(u)) return Response.json({ error: "Só administradores podem enviar mídia." }, { status: 403 });
        try {
          const { handleUpload } = await import("@vercel/blob/client");
          const body = await request.json();
          const r = await handleUpload({
            body,
            request,
            onBeforeGenerateToken: async () => ({
              allowedContentTypes: Object.keys(MEDIA_TYPES),
              maximumSizeInBytes: MAX_MEDIA_BYTES,
              addRandomSuffix: true,
              cacheControlMaxAge: 31_536_000,
            }),
          });
          return Response.json(r);
        } catch (e) {
          return Response.json({ error: e instanceof Error ? e.message : "Falha ao autorizar o envio." }, { status: 400 });
        }
      },
    },
  },
});
