import { createFileRoute } from "@tanstack/react-router";

/** GET /api/events — tempo real via Server-Sent Events (tópicos: community, alerts, overrides). */
export const Route = createFileRoute("/api/events")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { events } = await import("../../server/db");
        const enc = new TextEncoder();
        let cleanup = () => {};
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            const send = (topic: string) => {
              try {
                controller.enqueue(enc.encode(`event: change\ndata: ${topic}\n\n`));
              } catch {
                cleanup();
              }
            };
            const ping = setInterval(() => send("ping"), 25_000);
            events.on("change", send);
            cleanup = () => {
              clearInterval(ping);
              events.off("change", send);
            };
            request.signal.addEventListener("abort", () => {
              cleanup();
              try {
                controller.close();
              } catch {
                /* já fechado */
              }
            });
            controller.enqueue(enc.encode("retry: 5000\n\n"));
          },
          cancel() {
            cleanup();
          },
        });
        return new Response(stream, {
          headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive", "X-Accel-Buffering": "no" },
        });
      },
    },
  },
});
