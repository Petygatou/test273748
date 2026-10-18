/**
 * Fonte única de dados da temporada para o servidor:
 * API oficial do Cartola quando disponível, senão Modo Demonstração.
 */
import type { LineupAccuracy } from "../engine/lineup";
import { generateDemoSeason } from "../data/demoSeason";
import { buildRoundAnalysis } from "../engine/analysis";
import { runBacktest, runLineupBacktest, type BacktestResult } from "../engine/backtest";
import type { LineupOverride, RoundAnalysis, SeasonData } from "../engine/types";
import { cached } from "./cache";
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
}

async function loadRawSeason(): Promise<{ data: SeasonData; motivo?: string }> {
  const mode = env("DATA_MODE") ?? "auto";
  if (mode === "demo") return { data: demo(), motivo: "DATA_MODE=demo" };
  try {
    const data = await cached("season:cartola", 5 * 60_000, fetchCartolaSeason);
    if (data.athletes.length < 50) throw new Error("mercado vazio (pré-temporada?)");
    if (data.rodadaAtual > 2 && data.history.length === 0) throw new Error("histórico indisponível");
    return { data };
  } catch (err) {
    if (mode === "live") throw err;
    return { data: demo(), motivo: err instanceof Error ? err.message : "API do Cartola indisponível" };
  }
}

export async function loadSeason(): Promise<{ data: SeasonData; meta: SeasonMeta }> {
  const { data, motivo } = await loadRawSeason();
  const overrides = await loadOverrides(data.temporada, data.rodadaAtual);
  const merged: SeasonData = { ...data, overrides: { ...(data.overrides ?? {}), ...overrides } };
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
  const key = `analysis:${data.source}:${data.temporada}:${data.rodadaAtual}:${data.updatedAt}:${overridesKey(data.overrides)}`;
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
