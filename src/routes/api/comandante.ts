import { createFileRoute } from "@tanstack/react-router";

/**
 * POST /api/comandante — conversa com o Comandante em streaming (NDJSON).
 * Cada linha é um evento: {type:"text"|"tool"|"done"|"error", ...}.
 */
export const Route = createFileRoute("/api/comandante")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { runComandante, allowRequest } = await import("../../server/comandante");
        const { loadAnalysis, loadBacktest } = await import("../../server/season");
        const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
        if (!allowRequest(ip)) {
          return Response.json({ error: "Limite de consultas atingido. Aguarde um pouco." }, { status: 429 });
        }
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "JSON inválido" }, { status: 400 });
        }
        const b = body as { messages?: unknown; contexto?: unknown; prefs?: unknown };
        if (!Array.isArray(b.messages) || b.messages.length === 0 || b.messages.length > 40) {
          return Response.json({ error: "Mensagens inválidas" }, { status: 400 });
        }
        const messages = b.messages
          .filter((m): m is { role: "user" | "assistant"; content: string } => {
            const x = m as { role?: unknown; content?: unknown };
            return (x.role === "user" || x.role === "assistant") && typeof x.content === "string";
          })
          .map((m) => ({ role: m.role, content: m.content.slice(0, 8000) }));
        const prefs = (b.prefs && typeof b.prefs === "object" ? b.prefs : {}) as Record<string, string>;
        const { analysis } = await loadAnalysis();
        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            try {
              for await (const ev of runComandante(
                {
                  messages,
                  contexto: b.contexto,
                  prefs: {
                    tom: prefs.tom === "agressivo" ? "agressivo" : "conservador",
                    foco: prefs.foco === "cartoletas" ? "cartoletas" : "pontos",
                    nome: typeof prefs.nome === "string" ? prefs.nome.slice(0, 40) : undefined,
                  },
                },
                { analysis, loadBacktest: async () => (await loadBacktest()).resumo },
              )) {
                controller.enqueue(encoder.encode(JSON.stringify(ev) + "\n"));
              }
            } catch (err) {
              controller.enqueue(encoder.encode(JSON.stringify({ type: "error", message: err instanceof Error ? err.message : "erro" }) + "\n"));
            } finally {
              controller.close();
            }
          },
        });
        return new Response(stream, {
          headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
        });
      },
    },
  },
});
