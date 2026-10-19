/**
 * Fonte única de dados da temporada para o servidor:
 * API oficial do Cartola quando disponível, senão Modo Demonstração.
 */
import type { LineupAccuracy } from "../engine/lineup";
import { generateDemoSeason } from "../data/demoSeason";
import { buildRoundAnalysis } from "../engine/analysis";
import { runBacktest, runLineupBacktest, type BacktestResult } from "../engine/backtest";
import type { LineupOverride, RoundAnalysis, SeasonData } from "../engine/types";
import { cached, invalidate } from "./cache";
import { fotosMap, loadFotos, withFotos } from "./fotosApiFootball";
import { loadImported } from "./importada";
import { ensureWatcher, fingerprint, newsSignals, officialOverrides } from "./watcher";
import { fetchCartolaSeason } from "./cartolaApi";
import { loadOverrides } from "./store";

const env = (k: string) => (typeof process !== "undefined" ? process.env[k] : undefined);

let demoCache: SeasonData | null = null;
function demo(): SeasonData {
  if (!demoCache) {
    const { latent: _latent, ...d } = generateDemoSeason();
    void _latent;
    demoCache = d;
  }
  return demoCache;
}

export interface SeasonMeta {
  source: SeasonData["source"];
  temporada: number;
  rodada: number;
  mercadoStatus: number;
  fechamento?: string;
  timesEscalados?: number;
  updatedAt: string;
  motivoDemo?: string;
  /** dados reais enviados de outro computador (quando o servidor não alcança a API) */
  importadoEm?: string;
}

/**
 * Ordem: API oficial → temporada real importada (fresca) → demonstração.
 * Em produção o padrão é DATA_MODE=live: nunca inventa dados; se não houver
 * dado real, a tela explica o problema em vez de mostrar números fictícios.
 */
function dataMode() {
  return env("DATA_MODE") ?? (env("NODE_ENV") === "production" ? "live" : "auto");
}

export function invalidateSeason() {
  invalidate("season:");
}

/** Relê o mercado agora, ignorando o cache (usado pelo vigia a cada minuto). */
export async function refreshSeason() {
  invalidate("season:");
  invalidate("cartola:status");
  invalidate("cartola:mercado");
  return loadRawSeason();
}

async function loadRawSeason(): Promise<{ data: SeasonData; motivo?: string; importadoEm?: string }> {
  const mode = dataMode();
  if (mode === "demo") return { data: demo(), motivo: "DATA_MODE=demo" };
  let erroApi = "API do Cartola indisponível";
  try {
    const data = await cached("season:cartola", 50_000, fetchCartolaSeason, { staleOnError: true });
    if (data.athletes.length < 50) throw new Error("mercado vazio (pré-temporada?)");
    if (data.rodadaAtual > 2 && data.history.length === 0) throw new Error("histórico indisponível");
    return { data };
  } catch (err) {
    erroApi = err instanceof Error ? err.message : erroApi;
  }
  const imp = await loadImported();
  if (imp) return { data: imp.data, importadoEm: imp.importadoEm };
  if (mode === "live") {
    throw new Error(`Dados reais do Cartola indisponíveis: ${erroApi}. O servidor não alcançou a API da Globo e não há temporada importada recente. Veja docs/CARTOLA.md.`);
  }
  return { data: demo(), motivo: erroApi };
}

export async function loadSeason(): Promise<{ data: SeasonData; meta: SeasonMeta }> {
  ensureWatcher();
  const { data, motivo, importadoEm } = await loadRawSeason();
  loadFotos(data.temporada);
  const overrides = await loadOverrides(data.temporada, data.rodadaAtual);
  const merged: SeasonData = { ...data, athletes: data.source === "cartola" ? withFotos(data.athletes) : data.athletes, overrides: { ...(data.overrides ?? {}), ...(data.source === "cartola" ? officialOverrides() : {}), ...overrides }, sinais: data.source === "cartola" ? newsSignals() : undefined };
  return {
    data: merged,
    meta: {
      source: data.source,
      temporada: data.temporada,
      rodada: data.rodadaAtual,
      mercadoStatus: data.mercadoStatus,
      fechamento: data.fechamento,
      timesEscalados: data.timesEscalados,
      updatedAt: data.updatedAt,
      motivoDemo: data.source === "demo" ? motivo : undefined,
      importadoEm,
    },
  };
}

function overridesKey(o: Record<number, LineupOverride> | undefined) {
  if (!o) return "0";
  const entries = Object.entries(o).sort();
  let h = 0;
  for (const [k, v] of entries) for (const ch of `${k}${v}`) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return `${entries.length}:${h}`;
}

export async function loadAnalysis(): Promise<{ analysis: RoundAnalysis; meta: SeasonMeta }> {
  const { data, meta } = await loadSeason();
  // chave pelo CONTEÚDO (status, preço, rodada, ajustes, notícias), não pelo horário da leitura
  const key = `analysis:${data.source}:${data.temporada}:${fingerprint(data, data.sinais)}:f${Object.keys(fotosMap()).length}:${overridesKey(data.overrides)}`;
  const analysis = await cached(key, 10 * 60_000, async () => buildRoundAnalysis(data, { simulations: Number(env("SIMULATIONS") ?? 3000) }));
  return { analysis, meta };
}

export async function loadBacktest(): Promise<BacktestResult & { meta: SeasonMeta; provaveis: LineupAccuracy | null }> {
  const { data, meta } = await loadSeason();
  const key = `backtest:${data.source}:${data.temporada}:${data.rodadaAtual}`;
  const res = await cached(key, 12 * 3600_000, async () =>
    runBacktest(data, { fromRound: Math.max(5, data.rodadaAtual - 10), config: { simulations: 400 } }),
  );
  const provaveis = await cached(`provaveis-acerto:${data.source}:${data.temporada}:${data.rodadaAtual}`, 12 * 3600_000, async () =>
    data.rodadaAtual >= 8 ? runLineupBacktest(data) : null,
  );
  return { ...res, meta, provaveis };
}
