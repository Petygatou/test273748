import { createFileRoute } from "@tanstack/react-router";

/** GET /api/foto?u=<url> — foto oficial do atleta via servidor (só hosts da Globo). */
export const Route = createFileRoute("/api/foto")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { proxyFoto } = await import("../../server/foto");
        return proxyFoto(new URL(request.url).searchParams.get("u"));
      },
    },
  },
});
