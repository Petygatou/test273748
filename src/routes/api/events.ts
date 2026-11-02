import { createFileRoute } from "@tanstack/react-router";

/** GET /api/events — tempo real via Server-Sent Events (tópicos: community, alerts, overrides). */
export const Route = createFileRoute("/api/events")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // Na Vercel cada conexão aberta deixa uma função rodando o tempo todo e esgota o limite do
        // plano: lá não há tempo real (204 = o navegador não reconecta) e o site atualiza por consulta.
        if (process.env.VERCEL && process.env.TEMPO_REAL !== "1") return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
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
