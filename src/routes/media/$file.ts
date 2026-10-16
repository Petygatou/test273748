import { createFileRoute } from "@tanstack/react-router";

/** GET /media/:arquivo — fotos e vídeos enviados pelos usuários. */
export const Route = createFileRoute("/media/$file")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { serveMedia } = await import("../../server/media");
        return serveMedia(params.file, request.headers.get("range"));
      },
    },
  },
});
