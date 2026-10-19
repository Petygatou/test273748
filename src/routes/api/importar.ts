import { createFileRoute } from "@tanstack/react-router";

/**
 * POST /api/importar — recebe a temporada real baixada em outro computador.
 * Autorização: cabeçalho x-import-key igual à variável IMPORT_KEY do servidor.
 */
export const Route = createFileRoute("/api/importar")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env.IMPORT_KEY;
        if (!key) return Response.json({ error: "IMPORT_KEY não configurada no servidor." }, { status: 503 });
        if (request.headers.get("x-import-key") !== key) return Response.json({ error: "Chave inválida." }, { status: 401 });
        const len = Number(request.headers.get("content-length") ?? 0);
        if (len > 80_000_000) return Response.json({ error: "Arquivo grande demais." }, { status: 413 });
        try {
          const { validateSeason, saveImported } = await import("../../server/importada");
          const data = validateSeason(await request.json());
          const { invalidateSeason } = await import("../../server/season");
          const r = await saveImported(data);
          invalidateSeason();
          return Response.json({ ok: true, rodada: data.rodadaAtual, atletas: data.athletes.length, importadoEm: r.importadoEm });
        } catch (e) {
          return Response.json({ error: e instanceof Error ? e.message : "Falha" }, { status: 400 });
        }
      },
    },
  },
});
