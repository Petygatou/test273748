import { createFileRoute } from "@tanstack/react-router";

/** GET /api/foto?u=<url> — foto do atleta via servidor, reduzida para o tamanho pedido (s=px) em WebP. */
export const Route = createFileRoute("/api/foto")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { proxyFoto } = await import("../../server/foto");
        const q = new URL(request.url).searchParams;
        return proxyFoto(q.get("u"), q.get("s"));
      },
    },
  },
});
