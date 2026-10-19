import { createFileRoute } from "@tanstack/react-router";

/** GET /api/diagnostico — o que a Globo responde ao servidor do site. Só administradores. */
export const Route = createFileRoute("/api/diagnostico")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { userFromRequest, isAdmin } = await import("../../server/auth");
        const u = userFromRequest(request);
        if (!u || !isAdmin(u)) return Response.json({ error: "Só administradores." }, { status: 403 });
        const { probeCartola } = await import("../../server/diagnostico");
        return Response.json(await probeCartola());
      },
    },
  },
});
