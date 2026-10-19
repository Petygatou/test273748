import { createFileRoute } from "@tanstack/react-router";

/** GET /api/saude — liga o vigia e informa o estado dele (também serve de health check). */
export const Route = createFileRoute("/api/saude")({
  server: {
    handlers: {
      GET: async () => {
        const { ensureWatcher, watcherStatus } = await import("../../server/watcher");
        ensureWatcher();
        const { adminStatus } = await import("../../server/auth");
        return Response.json({ ok: true, vigia: watcherStatus(), admin: adminStatus() });
      },
    },
  },
});
