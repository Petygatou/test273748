/**
 * Fonte única de dados da temporada para o servidor:
 * API oficial do Cartola quando disponível, senão Modo Demonstração.
 */
import type { LineupAccuracy } from "../engine/lineup";
import { generateDemoSeason } from "../data/demoSeason";
import { buildRoundAnalysis } from "../engine/analysis";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runBacktestAsync, runLineupBacktestAsync, type BacktestResult } from "../engine/backtest";
import { dataDir, emit } from "./db";
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

/** Última análise pronta: servida na hora enquanto a nova é calculada (ninguém espera o recálculo). */
let lastAnalysis: { key: string; source: string; analysis: RoundAnalysis } | null = null;

export async function loadAnalysis(): Promise<{ analysis: RoundAnalysis; meta: SeasonMeta; versao: string }> {
  const { data, meta } = await loadSeason();
  // chave pelo CONTEÚDO (status, preço, rodada, ajustes, notícias), não pelo horário da leitura
  const key = `analysis:${data.source}:${data.temporada}:${fingerprint(data, data.sinais)}:f${Object.keys(fotosMap()).length}:${overridesKey(data.overrides)}`;
  const compute = cached(key, 10 * 60_000, async () => {
    // devolve a vez ao Node antes de começar, para responder quem já está esperando
    await new Promise((r) => setImmediate(r));
    const analysis = buildRoundAnalysis(data, { simulations: Number(env("SIMULATIONS") ?? 3000) });
    const servidaVelha = lastAnalysis && lastAnalysis.key !== key;
    lastAnalysis = { key, source: data.source, analysis };
    // quem recebeu a versão anterior é avisado para buscar a nova
    if (servidaVelha) emit("dados");
    return analysis;
  });
  if (lastAnalysis && lastAnalysis.key !== key && lastAnalysis.source === data.source) {
    void compute.catch(() => {});
    return { analysis: lastAnalysis.analysis, meta, versao: lastAnalysis.key };
  }
  const analysis = await compute;
  return { analysis, meta, versao: key };
}

/* ---------- precisão do modelo: pesada, calculada em segundo plano e guardada em disco ---------- */

type BacktestPayload = BacktestResult & { provaveis: LineupAccuracy | null };
const bgJobs = new Map<string, Promise<void>>();
const memo = new Map<string, BacktestPayload>();
const cacheFile = (key: string) => join(dataDir(), "cache", `${key.replace(/[^a-z0-9-]+/gi, "_")}.json`);

function readDisk(key: string): BacktestPayload | null {
  try {
    return JSON.parse(readFileSync(cacheFile(key), "utf8")) as BacktestPayload;
  } catch {
    return null;
  }
}

function writeDisk(key: string, v: BacktestPayload) {
  try {
    mkdirSync(join(dataDir(), "cache"), { recursive: true });
    writeFileSync(cacheFile(key) + ".tmp", JSON.stringify(v));
    renameSync(cacheFile(key) + ".tmp", cacheFile(key));
  } catch {
    /* disco somente leitura */
  }
}

/**
 * O teste de precisão muda só uma vez por rodada. Fica em memória e em disco;
 * se ainda não existe, é calculado em segundo plano (sem travar o site) e os
 * navegadores são avisados quando fica pronto.
 */
export async function loadBacktest(): Promise<Partial<BacktestResult> & { meta: SeasonMeta; provaveis: LineupAccuracy | null; calculando: boolean }> {
  const { data, meta } = await loadSeason();
  const key = `backtest-v2-${data.source}-${data.temporada}-${data.rodadaAtual}`;
  const hit = memo.get(key) ?? readDisk(key);
  if (hit) {
    memo.set(key, hit);
    return { ...hit, meta, calculando: false };
  }
  if (!bgJobs.has(key)) {
    bgJobs.set(
      key,
      (async () => {
        try {
          const res = await runBacktestAsync(data, { fromRound: Math.max(5, data.rodadaAtual - 10), config: { simulations: 300 } });
          const provaveis = data.rodadaAtual >= 8 ? await runLineupBacktestAsync(data) : null;
          const v = { ...res, provaveis };
          memo.set(key, v);
          writeDisk(key, v);
          emit("dados");
        } finally {
          bgJobs.delete(key);
        }
      })().catch(() => {}),
    );
  }
  return { meta, provaveis: null, calculando: true };
}
