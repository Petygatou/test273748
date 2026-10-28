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
  .validator((d: { atletaId: number; status: LineupOverride | null }) => {
    if (!Number.isInteger(d.atletaId)) throw new Error("atletaId inválido");
    if (d.status != null && !["titular", "reserva", "duvida", "fora"].includes(d.status)) throw new Error("status inválido");
    return d;
  })
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./auth");
    const { loadSeason } = await import("./season");
    const { saveOverride } = await import("./store");
    const { invalidate } = await import("./cache");
    const admin = requireAdmin();
    const { meta } = await loadSeason();
    await saveOverride(meta.temporada, meta.rodada, data.atletaId, data.status, admin.id);
    invalidate("analysis:");
    return { ok: true };
  });

/** Admin confirma o time inteiro: 11 titulares, e o resto do elenco como reserva (ou limpa). */
export const saveLineupBatch = createServerFn({ method: "POST" })
  .validator((d: { titulares: number[]; reservas: number[]; limpar?: boolean }) => {
    const ids = (a: unknown) => (Array.isArray(a) ? a.filter((x): x is number => Number.isInteger(x)).slice(0, 40) : []);
    return { titulares: ids(d.titulares), reservas: ids(d.reservas), limpar: Boolean(d.limpar) };
  })
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./auth");
    const { loadSeason } = await import("./season");
    const { saveOverride } = await import("./store");
    const { invalidate } = await import("./cache");
    const admin = requireAdmin();
    if (!data.limpar && data.titulares.length !== 11) throw new Error("Confirme exatamente 11 titulares.");
    const { meta } = await loadSeason();
    for (const id of data.titulares) await saveOverride(meta.temporada, meta.rodada, id, data.limpar ? null : "titular", admin.id);
    for (const id of data.reservas) await saveOverride(meta.temporada, meta.rodada, id, data.limpar ? null : "reserva", admin.id);
    invalidate("analysis:");
    return { ok: true };
  });

/** Últimas mudanças detectadas pelo vigia (status de atletas, mercado, notícias). */
export const fetchMudancas = createServerFn({ method: "GET" }).handler(async () => {
  const { ensureWatcher, medicaoOficial, recentChanges, watcherStatus } = await import("./watcher");
  ensureWatcher();
  return { mudancas: recentChanges(30), status: watcherStatus(), medicao: medicaoOficial() };
});

/** Quem da mesma posição já enfrentou um time, jogo a jogo (histórico real da temporada). */
export const fetchVsAdversario = createServerFn({ method: "GET" })
  .validator((d: { clube?: unknown; pos?: unknown } | undefined) => {
    const clube = Number(d?.clube);
    const pos = Number(d?.pos);
    if (!Number.isInteger(clube) || clube <= 0 || !Number.isInteger(pos) || pos < 1 || pos > 6) throw new Error("Parâmetros inválidos.");
    return { clube, pos: pos as 1 | 2 | 3 | 4 | 5 | 6 };
  })
  .handler(async ({ data }) => {
    const { loadSeason } = await import("./season");
    const { vsAdversario } = await import("./vsAdversario");
    const { data: season } = await loadSeason();
    return vsAdversario(season, data.clube, data.pos);
  });

/** Painel ADM: marca o lado de um lateral (E/D) ou limpa (null). A análise é refeita com o lado. */
export const saveLadoLateral = createServerFn({ method: "POST" })
  .validator((d: { atletaId?: unknown; lado?: unknown } | undefined) => {
    const atletaId = Number(d?.atletaId);
    if (!Number.isInteger(atletaId) || atletaId <= 0) throw new Error("Atleta inválido.");
    const lado: "E" | "D" | null = d?.lado === "E" ? "E" : d?.lado === "D" ? "D" : null;
    return { atletaId, lado };
  })
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./auth");
    const admin = requireAdmin();
    const { db } = await import("./db");
    const { invalidate } = await import("./cache");
    if (data.lado) db.lados.put({ id: String(data.atletaId), atletaId: data.atletaId, lado: data.lado, em: new Date().toISOString(), por: admin.id });
    else db.lados.remove(String(data.atletaId));
    invalidate("analysis:");
    avisarLadosDepois();
    return { ok: true };
  });

// marcar vários laterais seguidos gera um recálculo só (alguns segundos depois do último clique)
let timerLados: ReturnType<typeof setTimeout> | null = null;
function avisarLadosDepois() {
  if (timerLados) clearTimeout(timerLados);
  timerLados = setTimeout(() => {
    timerLados = null;
    void import("./db").then(({ emit }) => emit("dados"));
  }, 6000);
}
