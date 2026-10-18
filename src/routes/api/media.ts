import { createFileRoute } from "@tanstack/react-router";

/** POST /api/media — upload de foto/vídeo (corpo binário, Content-Type do arquivo). Só administradores (publicações e stories são exclusivos deles). */
export const Route = createFileRoute("/api/media")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { userFromRequest, isAdmin } = await import("../../server/auth");
        const { saveMedia, MAX_MEDIA_BYTES } = await import("../../server/media");
        const u = userFromRequest(request);
        if (!u) return Response.json({ error: "Entre na sua conta para enviar mídia." }, { status: 401 });
        if (!isAdmin(u)) return Response.json({ error: "Só administradores podem enviar mídia." }, { status: 403 });
        const len = Number(request.headers.get("content-length") ?? 0);
        if (len > MAX_MEDIA_BYTES) return Response.json({ error: "Arquivo acima de 60 MB." }, { status: 413 });
        try {
          const bytes = new Uint8Array(await request.arrayBuffer());
          return Response.json(await saveMedia(bytes, request.headers.get("content-type") ?? ""));
        } catch (e) {
          return Response.json({ error: e instanceof Error ? e.message : "Falha no upload" }, { status: 400 });
        }
      },
    },
  },
});
