/**
 * Backtest walk-forward: para cada rodada r, o modelo só enxerga o que
 * aconteceu ANTES de r, projeta, e comparamos com o que realmente aconteceu.
 *
 * Métricas (atletas que entraram em campo):
 * - MAE / RMSE do xP-jogando vs. pontuação real;
 * - correlação de postos (Spearman) dentro de cada posição — o que importa
 *   para escolher QUEM escalar;
 * - calibração do intervalo [piso P15, teto P85] (alvo: 70% dentro);
 * - comparação com os baselines "média da temporada" e "média das últimas 5".
 *
 * E o teste definitivo: montar a tropa ótima com o modelo e com a média
 * (mesmas regras, mesmo orçamento, sem saber quem jogou) e somar os pontos
 * REAIS de cada uma.
 */
import { buildRoundAnalysis } from "./analysis";
import { lineupAccuracy, probableXI, type LineupAccuracy } from "./lineup";
import { mean, spearman } from "./math";
import { optimizeLineup } from "./optimizer";
import { CAPTAIN_MULTIPLIER, STATUS, type PositionId } from "./rules";
import type { ModelConfig, PlayerProjection, PlayerRound, RoundAnalysis, SeasonData } from "./types";

export interface BacktestRound {
  rodada: number;
  n: number;
  maeModelo: number;
  maeMedia: number;
  maeUlt5: number;
  rmseModelo: number;
  rmseMedia: number;
  spearmanModelo: number;
  spearmanMedia: number;
  dentroIntervalo: number;
  abaixoPiso: number;
  acimaTeto: number;
  tropaModelo?: number;
  tropaMedia?: number;
}

export interface BacktestSummary {
  rodadas: number;
  amostras: number;
  maeModelo: number;
  maeMedia: number;
  maeUlt5: number;
  rmseModelo: number;
  rmseMedia: number;
  spearmanModelo: number;
  spearmanMedia: number;
  ganhoMaePct: number;
  dentroIntervalo: number;
  abaixoPiso: number;
  acimaTeto: number;
  tropaModelo: number | null;
  tropaMedia: number | null;
}

export interface BacktestResult {
  config: Partial<ModelConfig>;
  rounds: BacktestRound[];
  resumo: BacktestSummary;
}

/** Recorta a temporada como ela era no início da rodada r (sem vazar o futuro). */
export function sliceSeason(data: SeasonData, r: number): SeasonData {
  const history = data.history.filter((h) => h.rodada < r);
  const recent = new Map<number, number>();
  for (const h of history) recent.set(h.atletaId, Math.max(recent.get(h.atletaId) ?? 0, h.rodada));
  const stats = new Map<number, { s: number; n: number; last: PlayerRound | null }>();
  for (const h of history) {
    const st = stats.get(h.atletaId) ?? { s: 0, n: 0, last: null };
    st.s += h.pontos;
    st.n += 1;
    if (!st.last || h.rodada > st.last.rodada) st.last = h;
    stats.set(h.atletaId, st);
  }
  // status daquela rodada, se o histórico de snapshots tiver (era conhecido antes do jogo)
  const known = data.statusHistory?.[r];
  const athletes = data.athletes.map((a) => {
    const st = stats.get(a.id);
    const last = recent.get(a.id) ?? 0;
    // status "honesto": provável se jogou em alguma das 3 últimas rodadas
    const statusId = known?.[a.id] ?? (a.posicaoId === 6 ? STATUS.PROVAVEL : last >= r - 3 ? STATUS.PROVAVEL : STATUS.NULO);
    const lastRow = st?.last;
    const preco = lastRow?.preco != null ? Math.max(1, lastRow.preco + (lastRow.variacao ?? 0)) : a.preco;
    return {
      ...a,
      statusId,
      preco,
      variacao: lastRow?.rodada === r - 1 ? lastRow.variacao ?? 0 : 0,
      media: st ? st.s / st.n : 0,
      jogos: st?.n ?? 0,
      pontosUltima: lastRow?.rodada === r - 1 ? lastRow.pontos : 0,
      gatoMestre: undefined,
    };
  });
  return {
    ...data,
    rodadaAtual: r,
    athletes,
    history,
    matches: data.matches.map((m) => (m.rodada >= r ? { ...m, golsCasa: null, golsFora: null } : m)),
    ownership: undefined,
    overrides: {},
    semStatus: !known,
    statusHistory: data.statusHistory ? Object.fromEntries(Object.entries(data.statusHistory).filter(([k]) => Number(k) <= r)) : undefined,
  };
}

type BacktestOpts = { fromRound?: number; toRound?: number; config?: Partial<ModelConfig>; lineups?: boolean; budget?: number };

/** Roda até o fim, de uma vez (scripts e testes). */
function drain<T>(g: Generator<void, T, void>): T {
  let r = g.next();
  while (!r.done) r = g.next();
  return r.value;
}

/** Versão para o servidor: devolve a vez ao Node entre as rodadas, para o site não travar enquanto calcula. */
async function drainAsync<T>(g: Generator<void, T, void>): Promise<T> {
  let r = g.next();
  while (!r.done) {
    await new Promise((res) => setImmediate(res));
    r = g.next();
  }
  return r.value;
}

export const runBacktest = (data: SeasonData, opts: BacktestOpts = {}) => drain(backtestSteps(data, opts));
export const runBacktestAsync = (data: SeasonData, opts: BacktestOpts = {}) => drainAsync(backtestSteps(data, opts));

function* backtestSteps(data: SeasonData, opts: BacktestOpts = {}): Generator<void, BacktestResult, void> {
  const last = data.rodadaAtual - 1;
  const from = Math.max(4, opts.fromRound ?? Math.max(4, last - 9));
  const to = Math.min(last, opts.toRound ?? last);
  const config = { simulations: 600, ...opts.config };
  const rounds: BacktestRound[] = [];
  const all = { m: [] as number[], b: [] as number[], u: [] as number[], y: [] as number[] };
  let inside = 0;
  let below = 0;
  let above = 0;
  const tropaM: number[] = [];
  const tropaB: number[] = [];

  for (let r = from; r <= to; r++) {
    const sliced = sliceSeason(data, r);
    const analysis = buildRoundAnalysis(sliced, config);
    const actual = new Map<number, PlayerRound>();
    for (const h of data.history) if (h.rodada === r) actual.set(h.atletaId, h);
    const prevBy = new Map<number, number[]>();
    for (const h of sliced.history) {
      if (!prevBy.has(h.atletaId)) prevBy.set(h.atletaId, []);
      prevBy.get(h.atletaId)!.push(h.pontos);
    }
    const posMean = new Map<PositionId, number>();
    for (const pos of [1, 2, 3, 4, 5, 6] as PositionId[]) {
      posMean.set(pos, mean(sliced.history.filter((h) => h.posicaoId === pos).map((h) => h.pontos)));
    }

    const m: number[] = [];
    const b: number[] = [];
    const u: number[] = [];
    const y: number[] = [];
    const byPos = new Map<PositionId, { m: number[]; b: number[]; y: number[] }>();
    let rin = 0;
    let rbelow = 0;
    let rabove = 0;
    for (const p of analysis.players) {
      const act = actual.get(p.atletaId);
      if (!act || p.matchId == null) continue;
      const prev = prevBy.get(p.atletaId) ?? [];
      const base = prev.length ? mean(prev) : posMean.get(p.posicaoId) ?? 0;
      const ult5 = prev.length ? mean(prev.slice(-5)) : base;
      m.push(p.xPJogando);
      b.push(base);
      u.push(ult5);
      y.push(act.pontos);
      if (act.pontos < p.piso) rbelow++;
      else if (act.pontos > p.teto) rabove++;
      else rin++;
      if (!byPos.has(p.posicaoId)) byPos.set(p.posicaoId, { m: [], b: [], y: [] });
      const bp = byPos.get(p.posicaoId)!;
      bp.m.push(p.xPJogando);
      bp.b.push(base);
      bp.y.push(act.pontos);
    }
    const n = y.length;
    if (!n) continue;
    const mae = (xs: number[]) => mean(xs.map((x, i) => Math.abs(x - y[i])));
    const rmse = (xs: number[]) => Math.sqrt(mean(xs.map((x, i) => (x - y[i]) ** 2)));
    const sp = (key: "m" | "b") => {
      const vals = [...byPos.values()].filter((v) => v.y.length >= 8);
      return vals.length ? mean(vals.map((v) => spearman(v[key], v.y))) : 0;
    };

    const round: BacktestRound = {
      rodada: r,
      n,
      maeModelo: mae(m),
      maeMedia: mae(b),
      maeUlt5: mae(u),
      rmseModelo: rmse(m),
      rmseMedia: rmse(b),
      spearmanModelo: sp("m"),
      spearmanMedia: sp("b"),
      dentroIntervalo: rin / n,
      abaixoPiso: rbelow / n,
      acimaTeto: rabove / n,
    };

    if (opts.lineups !== false) {
      const budget = opts.budget ?? 120;
      const modelLineup = optimizeLineup(analysis, { formation: "auto", budget, profile: "equilibrada" }).lineup;
      // baseline: mesma otimização, mas valor = média histórica (o que a maioria faz)
      const baselineAnalysis: RoundAnalysis = {
        ...analysis,
        players: analysis.players.map((p): PlayerProjection => {
          const prev = prevBy.get(p.atletaId) ?? [];
          const base = prev.length ? mean(prev) : 0;
          return { ...p, xP: base * (p.pJogar > 0.5 ? 1 : 0.3), xPJogando: base, piso: base, teto: base };
        }),
      };
      const baseLineup = optimizeLineup(baselineAnalysis, { formation: "auto", budget, profile: "equilibrada" }).lineup;
      const score = (l: typeof modelLineup) =>
        l
          ? l.slots.reduce((s, sl) => s + (actual.get(sl.atletaId)?.pontos ?? 0) * (sl.atletaId === l.captainId ? CAPTAIN_MULTIPLIER : 1), 0)
          : 0;
      round.tropaModelo = score(modelLineup);
      round.tropaMedia = score(baseLineup);
      tropaM.push(round.tropaModelo);
      tropaB.push(round.tropaMedia);
    }
    rounds.push(round);
    all.m.push(...m);
    all.b.push(...b);
    all.u.push(...u);
    all.y.push(...y);
    inside += rin;
    below += rbelow;
    above += rabove;
    yield;
  }

  const N = all.y.length || 1;
  const maeA = (xs: number[]) => mean(xs.map((x, i) => Math.abs(x - all.y[i])));
  const rmseA = (xs: number[]) => Math.sqrt(mean(xs.map((x, i) => (x - all.y[i]) ** 2)));
  const maeModelo = maeA(all.m);
  const maeMedia = maeA(all.b);
  return {
    config,
    rounds,
    resumo: {
      rodadas: rounds.length,
      amostras: all.y.length,
      maeModelo,
      maeMedia,
      maeUlt5: maeA(all.u),
      rmseModelo: rmseA(all.m),
      rmseMedia: rmseA(all.b),
      spearmanModelo: mean(rounds.map((r) => r.spearmanModelo)),
      spearmanMedia: mean(rounds.map((r) => r.spearmanMedia)),
      ganhoMaePct: maeMedia > 0 ? ((maeMedia - maeModelo) / maeMedia) * 100 : 0,
      dentroIntervalo: inside / N,
      abaixoPiso: below / N,
      acimaTeto: above / N,
      tropaModelo: tropaM.length ? mean(tropaM) : null,
      tropaMedia: tropaB.length ? mean(tropaB) : null,
    },
  };
}

/** Busca em grade dos hiperparâmetros que minimizam o erro quadrático no backtest. */
export function tuneModel(
  data: SeasonData,
  grid: { halfLife: number[]; shrinkScale: number[]; contextStrength: number[] } = {
    halfLife: [4, 6, 10, 20],
    shrinkScale: [0.5, 1, 2],
    contextStrength: [0.5, 1],
  },
  rounds = 6,
): Array<{ config: Partial<ModelConfig>; mae: number; rmse: number; spearman: number }> {
  const out: Array<{ config: Partial<ModelConfig>; mae: number; rmse: number; spearman: number }> = [];
  const last = data.rodadaAtual - 1;
  for (const halfLife of grid.halfLife)
    for (const shrinkScale of grid.shrinkScale)
      for (const contextStrength of grid.contextStrength) {
        const config = { halfLife, shrinkScale, contextStrength, simulations: 0 };
        const res = runBacktest(data, { fromRound: last - rounds + 1, toRound: last, config, lineups: false });
        out.push({
          config: { halfLife, shrinkScale, contextStrength },
          mae: res.resumo.maeModelo,
          rmse: res.resumo.rmseModelo,
          spearman: res.resumo.spearmanModelo,
        });
      }
  // RMSE é a regra de pontuação própria para valor esperado (MAE premia quem subestima gols)
  return out.sort((a, b) => a.rmse - b.rmse);
}

/* ------------------------------------------------------------------------- */
/*                Acerto das prováveis escalações (walk-forward)             */
/* ------------------------------------------------------------------------- */

/** Mede o acerto das prováveis nas últimas rodadas encerradas, sem vazar o futuro. */
type LineupOpts = { fromRound?: number; toRound?: number; config?: Partial<ModelConfig> };
export const runLineupBacktest = (data: SeasonData, opts: LineupOpts = {}) => drain(lineupSteps(data, opts));
export const runLineupBacktestAsync = (data: SeasonData, opts: LineupOpts = {}) => drainAsync(lineupSteps(data, opts));

function* lineupSteps(data: SeasonData, opts: LineupOpts = {}): Generator<void, LineupAccuracy, void> {
  const last = data.rodadaAtual - 1;
  const from = Math.max(6, opts.fromRound ?? last - 9);
  const to = Math.min(last, opts.toRound ?? last);
  const rounds: Parameters<typeof lineupAccuracy>[0] = [];
  for (let r = from; r <= to; r++) {
    const sliced = sliceSeason(data, r);
    const a = buildRoundAnalysis(sliced, { simulations: 60, ...opts.config });
    const rows = data.history.filter((h) => h.rodada === r);
    const entered = new Set(rows.map((h) => h.atletaId));
    const clubsPlayed = new Set(rows.map((h) => h.clubeId));
    // baseline: repetir a escalação mais recente (participação no último jogo, depois nos últimos 5)
    const prev = sliced.history;
    const lastRound = new Map<number, number>();
    for (const h of prev) lastRound.set(h.clubeId, Math.max(lastRound.get(h.clubeId) ?? 0, h.rodada));
    const score = new Map<number, number>();
    for (const h of prev) {
      const lr = lastRound.get(h.clubeId)!;
      if (h.rodada === lr) score.set(h.atletaId, (score.get(h.atletaId) ?? 0) + 10);
      else if (h.rodada >= lr - 5) score.set(h.atletaId, (score.get(h.atletaId) ?? 0) + 1);
    }
    const pseudo = a.players.map((p) => ({ ...p, pJogar: (score.get(p.atletaId) ?? 0) / 16 }));
    const lastEntered = new Map<number, number[]>();
    for (const c of clubsPlayed) {
      const xi = probableXI(pseudo, c);
      lastEntered.set(c, [...xi.lines.gol, ...xi.lines.def, ...xi.lines.mei, ...xi.lines.ata].map((p) => p.atletaId));
    }
    rounds.push({ rodada: r, players: a.players, entered, clubsPlayed, lastEntered });
    yield;
  }
  const out = lineupAccuracy(rounds);
  const comStatus = rounds.filter((r) => data.statusHistory?.[r.rodada]).length;
  return { ...out, coberturaStatus: rounds.length ? comStatus / rounds.length : 0 };
}
