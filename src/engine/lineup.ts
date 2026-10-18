/**
 * Prováveis escalações por clube a partir do motor: chance de jogar (status
 * oficial do Cartola + ajustes do Painel ADM + histórico de minutos). O
 * esquema é o que melhor acomoda os 11 mais prováveis.
 */
import { FORMATIONS, FORMATION_KEYS, type FormationKey, type PositionId } from "./rules";
import type { PlayerProjection } from "./types";

export interface ProbableXI {
  clubeId: number;
  formation: FormationKey;
  /** titulares por linha, do gol ao ataque */
  lines: { gol: PlayerProjection[]; def: PlayerProjection[]; mei: PlayerProjection[]; ata: PlayerProjection[] };
  tecnico?: PlayerProjection;
  banco: PlayerProjection[];
  /** soma da chance de jogar dos 11 (confiança na escalação) */
  confianca: number;
}

export type ProbTag = "provavel" | "duvida" | "improvavel";

export function probTag(p: PlayerProjection): ProbTag {
  if (p.override === "duvida" || p.statusId === 2) return "duvida";
  if (p.pJogar >= 0.7) return "provavel";
  if (p.pJogar >= 0.45) return "duvida";
  return "improvavel";
}

export function probableXI(players: PlayerProjection[], clubeId: number): ProbableXI {
  const squad = players.filter((p) => p.clubeId === clubeId);
  const byPos = (pos: PositionId) => squad.filter((p) => p.posicaoId === pos).sort((x, y) => y.pJogar - x.pJogar || y.xP - x.xP);
  const pools = { 1: byPos(1), 2: byPos(2), 3: byPos(3), 4: byPos(4), 5: byPos(5) } as Record<1 | 2 | 3 | 4 | 5, PlayerProjection[]>;

  let best: { f: FormationKey; score: number } = { f: "4-3-3", score: -Infinity };
  for (const f of FORMATION_KEYS) {
    const need = FORMATIONS[f];
    let score = 0;
    for (const pos of [1, 2, 3, 4, 5] as const) {
      const take = pools[pos].slice(0, need[pos]);
      score += take.reduce((s, p) => s + p.pJogar, 0) - (need[pos] - take.length) * 1.5;
    }
    if (f === "4-3-3") score += 0.05; // desempate: esquema mais comum
    if (score > best.score) best = { f, score };
  }
  const need = FORMATIONS[best.f];
  const pick = (pos: 1 | 2 | 3 | 4 | 5) => pools[pos].slice(0, need[pos]);
  const lats = pick(2);
  const zags = pick(3);
  // laterais nas pontas da linha de defesa
  const def = lats.length === 2 ? [lats[0], ...zags, lats[1]] : [...lats, ...zags];
  const xi = [...pick(1), ...def, ...pick(4), ...pick(5)];
  const inXI = new Set(xi.map((p) => p.atletaId));
  const banco = squad
    .filter((p) => p.posicaoId !== 6 && !inXI.has(p.atletaId) && p.pJogar >= 0.08 && p.statusId !== 5 && p.statusId !== 3 && p.override !== "fora")
    .sort((x, y) => y.pJogar - x.pJogar)
    .slice(0, 7);
  return {
    clubeId,
    formation: best.f,
    lines: { gol: pick(1), def, mei: pick(4), ata: pick(5) },
    tecnico: byPos(6)[0] ?? squad.find((p) => p.posicaoId === 6),
    banco,
    confianca: xi.reduce((s, p) => s + p.pJogar, 0) / 11,
  };
}

/* ------------------------------------------------------------------------- */
/*                   Acerto das prováveis (walk-forward)                     */
/* ------------------------------------------------------------------------- */

export interface LineupAccuracyRound {
  rodada: number;
  times: number;
  /** dos 11 apontados, fração que entrou em campo */
  acerto: number;
  /** times com 10 ou 11 acertos */
  timesQuaseCertos: number;
}

export interface LineupAccuracy {
  rodadas: LineupAccuracyRound[];
  acerto: number;
  /** baseline ingênuo: repetir quem entrou no último jogo (os 11 com mais participação recente) */
  acertoBaseline: number;
  timesAvaliados: number;
  /** calibração da chance de jogar: [faixa, previsto médio, observado, n] */
  calibracao: Array<{ faixa: string; previsto: number; observado: number; n: number }>;
  brier: number;
}

/**
 * Para cada rodada r: recorta a temporada antes de r, gera as prováveis de
 * cada clube e confere quem de fato entrou em campo. O status do Cartola
 * daquela rodada não é conhecido no histórico, então a medição usa só o que o
 * modelo sabe sem a informação editorial (é um piso do acerto real).
 */
export function lineupAccuracy(
  rounds: Array<{ rodada: number; players: PlayerProjection[]; entered: Set<number>; clubsPlayed: Set<number>; lastEntered: Map<number, number[]> }>,
): LineupAccuracy {
  const out: LineupAccuracyRound[] = [];
  let hits = 0;
  let total = 0;
  let hitsB = 0;
  let totalB = 0;
  const bins = Array.from({ length: 5 }, () => ({ p: 0, o: 0, n: 0 }));
  let brier = 0;
  let nb = 0;
  for (const rd of rounds) {
    let h = 0;
    let t = 0;
    let quase = 0;
    let times = 0;
    for (const clube of rd.clubsPlayed) {
      const xi = probableXI(rd.players, clube);
      const ids = [...xi.lines.gol, ...xi.lines.def, ...xi.lines.mei, ...xi.lines.ata].map((p) => p.atletaId);
      if (ids.length < 11) continue;
      const k = ids.filter((id) => rd.entered.has(id)).length;
      h += k;
      t += ids.length;
      times++;
      if (k >= 10) quase++;
      const base = rd.lastEntered.get(clube) ?? [];
      if (base.length) {
        hitsB += base.filter((id) => rd.entered.has(id)).length;
        totalB += base.length;
      }
    }
    for (const p of rd.players) {
      if (p.posicaoId === 6 || !rd.clubsPlayed.has(p.clubeId)) continue;
      const y = rd.entered.has(p.atletaId) ? 1 : 0;
      const b = Math.min(4, Math.floor(p.pJogar * 5));
      bins[b].p += p.pJogar;
      bins[b].o += y;
      bins[b].n++;
      brier += (p.pJogar - y) ** 2;
      nb++;
    }
    hits += h;
    total += t;
    out.push({ rodada: rd.rodada, times, acerto: t ? h / t : 0, timesQuaseCertos: quase });
  }
  return {
    rodadas: out,
    acerto: total ? hits / total : 0,
    acertoBaseline: totalB ? hitsB / totalB : 0,
    timesAvaliados: out.reduce((s, r) => s + r.times, 0),
    calibracao: bins.map((b, i) => ({ faixa: `${i * 20}–${(i + 1) * 20}%`, previsto: b.n ? b.p / b.n : 0, observado: b.n ? b.o / b.n : 0, n: b.n })),
    brier: nb ? brier / nb : 0,
  };
}
