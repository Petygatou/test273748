import { createFileRoute } from "@tanstack/react-router";

/**
 * GET /api/vitrine — o "spoiler" público da rodada para a landing page: capitão sugerido,
 * quem mais deve valorizar, fechamento do mercado e o acerto das prováveis. Só dados reais:
 * em modo demonstração responde { ok: false } e a landing esconde o bloco.
 */
export const Route = createFileRoute("/api/vitrine")({
  server: {
    handlers: {
      GET: async () => {
        const cabecalhos = { "Cache-Control": "public, max-age=300" };
        try {
          const { loadAnalysis, loadBacktest } = await import("../../server/season");
          const { analysis: a, meta } = await loadAnalysis();
          if (a.source === "demo") return Response.json({ ok: false }, { headers: cabecalhos });
          const jogam = a.players.filter((p) => p.matchId != null && p.posicaoId !== 6);
          const clube = (id: number) => a.clubs[id]?.abreviacao ?? "";
          const cap = [...jogam].sort((x, y) => y.xP - x.xP)[0];
          const valorizam = jogam
            .filter((p) => p.pJogar > 0.6)
            .sort((x, y) => y.valorizacaoEsperada - x.valorizacaoEsperada)
            .slice(0, 3)
            .map((p) => ({ apelido: p.apelido, clube: clube(p.clubeId), delta: Math.round(p.valorizacaoEsperada * 100) / 100 }));
          const bt = await loadBacktest().catch(() => null);
          return Response.json(
            {
              ok: true,
              rodada: meta.rodada,
              mercadoAberto: meta.mercadoStatus === 1,
              fechamento: meta.fechamento ?? null,
              capitao: cap ? { apelido: cap.apelido, clube: clube(cap.clubeId), xP: Math.round(cap.xP * 10) / 10, pJogar: Math.round(cap.pJogar * 100) } : null,
              valorizam,
              acertoProvaveis: bt?.provaveis?.acerto != null ? Math.round(bt.provaveis.acerto * 1000) / 10 : null,
            },
            { headers: cabecalhos },
          );
        } catch {
          return Response.json({ ok: false }, { headers: cabecalhos });
        }
      },
    },
  },
});
