/**
 * Server functions (RPC tipado entre cliente e servidor).
 * Os módulos de servidor são importados dinamicamente dentro dos handlers
 * para nunca vazarem para o bundle do navegador.
 */
import { createServerFn } from "@tanstack/react-start";
import type { LineupOverride } from "../engine/types";

export const fetchAnalysis = createServerFn({ method: "GET" }).handler(async () => {
  const { loadAnalysis } = await import("./season");
  return loadAnalysis();
});

export const fetchBacktest = createServerFn({ method: "GET" }).handler(async () => {
  const { loadBacktest } = await import("./season");
  return loadBacktest();
});

export const fetchLive = createServerFn({ method: "GET" }).handler(async () => {
  const { loadAnalysis } = await import("./season");
  const { loadLive } = await import("./live");
  const { analysis, meta } = await loadAnalysis();
  return loadLive(analysis, meta.mercadoStatus);
});

export const fetchNews = createServerFn({ method: "GET" })
  .validator((d: { force?: boolean } | undefined) => ({ force: Boolean(d?.force) }))
  .handler(async ({ data }) => {
    const { loadSeason } = await import("./season");
    const { loadNews, demoNews } = await import("./news");
    const { data: season } = await loadSeason();
    try {
      const res = await loadNews(season.athletes, season.clubs, data.force);
      return { ...res, source: "rss" as const, atualizadoEm: new Date().toISOString() };
    } catch (err) {
      return {
        items: demoNews(season.athletes, season.clubs),
        fontes: 0,
        source: "demo" as const,
        erro: err instanceof Error ? err.message : "Feeds indisponíveis",
        atualizadoEm: new Date().toISOString(),
      };
    }
  });

export const saveLineupOverride = createServerFn({ method: "POST" })
  .validator((d: { atletaId: number; status: LineupOverride | null; adminToken?: string; accessToken?: string }) => {
    if (!Number.isInteger(d.atletaId)) throw new Error("atletaId inválido");
    if (d.status != null && !["titular", "reserva", "duvida", "fora"].includes(d.status)) throw new Error("status inválido");
    return d;
  })
  .handler(async ({ data }) => {
    const { loadSeason } = await import("./season");
    const { saveOverride } = await import("./store");
    const { invalidate } = await import("./cache");
    const { cloudEnabled } = await import("../lib/supabase");
    if (!cloudEnabled) {
      // sem Lovable Cloud: exige ADMIN_TOKEN (ou ambiente de desenvolvimento)
      const expected = process.env.ADMIN_TOKEN;
      if (expected ? data.adminToken !== expected : !import.meta.env.DEV) throw new Error("Acesso restrito ao administrador.");
    } else if (!data.accessToken) {
      throw new Error("Faça login como administrador.");
    }
    const { meta } = await loadSeason();
    await saveOverride(meta.temporada, meta.rodada, data.atletaId, data.status, data.accessToken);
    invalidate("analysis:");
    return { ok: true };
  });
