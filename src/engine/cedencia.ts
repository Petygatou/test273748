/**
 * Matriz de cedência posicional.
 *
 * Para cada clube (como ADVERSÁRIO), mede quantos pontos os atletas de cada
 * posição fazem contra ele, separando mando e janela recente. Os fatores são
 * "encolhidos" (shrinkage) em direção à média da liga para não superestimar
 * amostras pequenas — 3 jogos ruins não fazem uma defesa ruim.
 *
 * Além dos pontos, calcula a cedência POR SCOUT como resíduo de participação:
 * "dos desarmes que os adversários deste time fazem, quantos ficam com os
 * laterais vs. o normal da liga". Isso é independente do volume total (que
 * vem do modelo de times), evitando dupla contagem.
 */
import { decayWeight } from "./math";
import { ALL_POSITIONS, PLAYER_POSITIONS, type PositionId, type ScoutKey } from "./rules";
import { CEDENCIA_JANELAS, type CedenciaCell, type CedenciaJanela, type CedenciaRecorte, type CedenciaRow, type Match, type PlayerRound } from "./types";

export interface GameContext {
  opp: number;
  home: boolean;
}

/** Índice (rodada:clube) → adversário e mando. */
export function buildContextIndex(matches: Match[]): Map<string, GameContext> {
  const idx = new Map<string, GameContext>();
  for (const m of matches) {
    idx.set(`${m.rodada}:${m.casaId}`, { opp: m.foraId, home: true });
    idx.set(`${m.rodada}:${m.foraId}`, { opp: m.casaId, home: false });
  }
  return idx;
}

export const CEDENCIA_SCOUTS: ScoutKey[] = ["G", "A", "FT", "FD", "FF", "FS", "DS", "FC", "CA", "I", "DE", "SG"];

interface Acc {
  pts: number;
  w: number;
  n: number;
}

function emptyCells(): Record<PositionId, Acc> {
  return { 1: { pts: 0, w: 0, n: 0 }, 2: { pts: 0, w: 0, n: 0 }, 3: { pts: 0, w: 0, n: 0 }, 4: { pts: 0, w: 0, n: 0 }, 5: { pts: 0, w: 0, n: 0 }, 6: { pts: 0, w: 0, n: 0 } };
}

export interface CedenciaResult {
  rows: CedenciaRow[];
  ligaMedias: Record<PositionId, number>;
  /** Resíduos de participação por scout: [opp][pos][scout]. */
  shareResidual: Map<number, Partial<Record<PositionId, Partial<Record<ScoutKey, number>>>>>;
}

export function computeCedencia(
  history: PlayerRound[],
  matches: Match[],
  clubIds: number[],
  currentRound: number,
  halfLife: number,
  shrinkGames = 10,
): CedenciaResult {
  const ctx = buildContextIndex(matches);
  const geral = new Map<number, Record<PositionId, Acc>>();
  const casa = new Map<number, Record<PositionId, Acc>>();
  const fora = new Map<number, Record<PositionId, Acc>>();
  const last5 = new Map<number, Record<PositionId, Acc>>();
  type Rec = "geral" | "casa" | "fora";
  const janelas = new Map<number, Record<CedenciaJanela, Record<Rec, Record<PositionId, Acc>>>>();
  for (const c of clubIds) {
    geral.set(c, emptyCells());
    casa.set(c, emptyCells());
    fora.set(c, emptyCells());
    last5.set(c, emptyCells());
    const j = {} as Record<CedenciaJanela, Record<Rec, Record<PositionId, Acc>>>;
    for (const n of CEDENCIA_JANELAS) j[n] = { geral: emptyCells(), casa: emptyCells(), fora: emptyCells() };
    janelas.set(c, j);
  }

  // rodadas disputadas por clube: todas, só em casa e só fora (mais recentes primeiro)
  const roundsByClub = new Map<number, Record<Rec, number[]>>();
  for (const m of matches) {
    if (m.rodada >= currentRound || m.golsCasa == null) continue;
    for (const [c, rec] of [
      [m.casaId, "casa"],
      [m.foraId, "fora"],
    ] as const) {
      if (!roundsByClub.has(c)) roundsByClub.set(c, { geral: [], casa: [], fora: [] });
      const r = roundsByClub.get(c)!;
      r.geral.push(m.rodada);
      r[rec].push(m.rodada);
    }
  }
  for (const r of roundsByClub.values()) for (const k of ["geral", "casa", "fora"] as const) r[k].sort((a, b) => b - a);
  /** rodada está entre os últimos N jogos do clube naquele recorte? */
  const recente = (c: number, rec: Rec, n: number, rodada: number) => {
    const rs = roundsByClub.get(c)?.[rec];
    if (!rs) return false;
    const i = rs.indexOf(rodada);
    return i >= 0 && i < n;
  };
  const last5Set = new Map<number, Set<number>>();
  for (const [c, rs] of roundsByClub) last5Set.set(c, new Set(rs.geral.slice(0, 5)));

  const league = emptyCells();
  // contagem de scouts cedidos: opp → pos → scout
  const scoutCount = new Map<number, Record<number, Partial<Record<ScoutKey, number>>>>();
  const scoutTotal = new Map<number, Partial<Record<ScoutKey, number>>>();
  const leagueCount: Record<number, Partial<Record<ScoutKey, number>>> = {};
  const leagueTotal: Partial<Record<ScoutKey, number>> = {};

  for (const pr of history) {
    if (pr.rodada >= currentRound) continue;
    const g = ctx.get(`${pr.rodada}:${pr.clubeId}`);
    if (!g) continue;
    const opp = g.opp;
    if (!geral.has(opp)) continue;
    const w = decayWeight(currentRound - 1 - pr.rodada, halfLife);
    const p = pr.posicaoId;
    const add = (acc: Record<PositionId, Acc>, weight: number) => {
      acc[p].pts += pr.pontos * weight;
      acc[p].w += weight;
      acc[p].n += 1;
    };
    add(geral.get(opp)!, w);
    // mando do ADVERSÁRIO: se o atleta jogou fora, o adversário cedeu em casa
    add(g.home ? fora.get(opp)! : casa.get(opp)!, w);
    if (last5Set.get(opp)?.has(pr.rodada)) add(last5.get(opp)!, 1);
    // janelas recentes: sem peso de recência (cada um dos N jogos vale igual)
    const recMando: Rec = g.home ? "fora" : "casa";
    const jan = janelas.get(opp)!;
    for (const n of CEDENCIA_JANELAS) {
      if (recente(opp, "geral", n, pr.rodada)) add(jan[n].geral, 1);
      if (recente(opp, recMando, n, pr.rodada)) add(jan[n][recMando], 1);
    }
    add(league, w);

    if (p !== 6) {
      if (!scoutCount.has(opp)) scoutCount.set(opp, {});
      const sc = scoutCount.get(opp)!;
      if (!sc[p]) sc[p] = {};
      if (!scoutTotal.has(opp)) scoutTotal.set(opp, {});
      const st = scoutTotal.get(opp)!;
      if (!leagueCount[p]) leagueCount[p] = {};
      for (const k of CEDENCIA_SCOUTS) {
        const v = (pr.scout[k] ?? 0) * w;
        if (!v) continue;
        sc[p][k] = (sc[p][k] ?? 0) + v;
        st[k] = (st[k] ?? 0) + v;
        leagueCount[p][k] = (leagueCount[p][k] ?? 0) + v;
        leagueTotal[k] = (leagueTotal[k] ?? 0) + v;
      }
    }
  }

  const ligaMedias = {} as Record<PositionId, number>;
  for (const p of ALL_POSITIONS) ligaMedias[p] = league[p].w > 0 ? league[p].pts / league[p].w : 0;

  const toCells = (acc: Record<PositionId, Acc>, weighted: boolean): Record<PositionId, CedenciaCell> => {
    const out = {} as Record<PositionId, CedenciaCell>;
    for (const p of ALL_POSITIONS) {
      const a = acc[p];
      const base = ligaMedias[p] || 1;
      const denom = weighted ? a.w : a.n;
      const raw = denom > 0 ? a.pts / denom : base;
      // shrinkage por "jogos de atleta" observados
      const m = shrinkGames;
      const shrunk = (raw * denom + base * m) / (denom + m);
      out[p] = { pontos: Math.round(raw * 100) / 100, fator: Math.round((shrunk / base) * 1000) / 1000, jogos: a.n };
    }
    return out;
  };

  const shareResidual = new Map<number, Partial<Record<PositionId, Partial<Record<ScoutKey, number>>>>>();
  const SHARE_PRIOR = 25;
  for (const c of clubIds) {
    const sc = scoutCount.get(c) ?? {};
    const st = scoutTotal.get(c) ?? {};
    const res: Partial<Record<PositionId, Partial<Record<ScoutKey, number>>>> = {};
    for (const p of PLAYER_POSITIONS) {
      res[p] = {};
      for (const k of CEDENCIA_SCOUTS) {
        const lt = leagueTotal[k] ?? 0;
        if (lt <= 0) continue;
        const ls = (leagueCount[p]?.[k] ?? 0) / lt;
        if (ls <= 0) continue;
        const cnt = sc[p]?.[k] ?? 0;
        const tot = st[k] ?? 0;
        const share = (cnt + SHARE_PRIOR * ls) / (tot + SHARE_PRIOR);
        res[p]![k] = Math.round((share / ls) * 1000) / 1000;
      }
    }
    shareResidual.set(c, res);
  }

  const rows: CedenciaRow[] = clubIds.map((c) => {
    const jan = {} as Record<CedenciaJanela, CedenciaRecorte>;
    for (const n of CEDENCIA_JANELAS) {
      const j = janelas.get(c)![n];
      jan[n] = { geral: toCells(j.geral, false), casa: toCells(j.casa, false), fora: toCells(j.fora, false) };
    }
    return {
      clubeId: c,
      geral: toCells(geral.get(c)!, true),
      casa: toCells(casa.get(c)!, true),
      fora: toCells(fora.get(c)!, true),
      ultimos5: toCells(last5.get(c)!, false),
      janelas: jan,
      scouts: shareResidual.get(c) ?? {},
    };
  });

  return { rows, ligaMedias, shareResidual };
}
