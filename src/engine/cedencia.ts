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
import { CEDENCIA_JANELAS, LATERAL_DIR, LATERAL_ESQ, type CedenciaCell, type CedenciaJanela, type CedenciaRecorte, type CedenciaRow, type CedenciaScouts, type CedPos, type LadoLateral, type Match, type PlayerRound, type TimeScouts } from "./types";

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
  sc: CedenciaScouts;
}

/** posições da cedência: as do Cartola + lateral esquerdo e direito */
export const CED_POS: CedPos[] = [...ALL_POSITIONS, LATERAL_ESQ, LATERAL_DIR];

const zeroScouts = (): CedenciaScouts => ({ DS: 0, FIN: 0, GA: 0, FS: 0, DE: 0 });
function emptyCells(): Record<CedPos, Acc> {
  const out = {} as Record<CedPos, Acc>;
  for (const p of CED_POS) out[p] = { pts: 0, w: 0, n: 0, sc: zeroScouts() };
  return out;
}

export interface CedenciaResult {
  rows: CedenciaRow[];
  ligaMedias: Record<CedPos, number>;
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
  lados: Record<number, LadoLateral> = {},
  /** lado em que o lateral jogou em cada jogo ("rodada:atletaId"); vale mais que o lado do atleta */
  ladosJogo: Record<string, LadoLateral> = {},
): CedenciaResult {
  const ctx = buildContextIndex(matches);
  const geral = new Map<number, Record<CedPos, Acc>>();
  const casa = new Map<number, Record<CedPos, Acc>>();
  const fora = new Map<number, Record<CedPos, Acc>>();
  const last5 = new Map<number, Record<CedPos, Acc>>();
  type Rec = "geral" | "casa" | "fora";
  const janelas = new Map<number, Record<CedenciaJanela, Record<Rec, Record<CedPos, Acc>>>>();
  // desarmes/finalizações por clube e rodada: feitos pelo time e feitos contra ele
  const timePro = new Map<number, { ds: number; fin: number }>();
  const timeContra = new Map<number, { ds: number; fin: number }>();
  for (const c of clubIds) {
    geral.set(c, emptyCells());
    casa.set(c, emptyCells());
    fora.set(c, emptyCells());
    last5.set(c, emptyCells());
    const j = {} as Record<CedenciaJanela, Record<Rec, Record<CedPos, Acc>>>;
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
    const ds = pr.scout.DS ?? 0;
    const fin = (pr.scout.FD ?? 0) + (pr.scout.FF ?? 0) + (pr.scout.FT ?? 0);
    const sc: CedenciaScouts = { DS: ds, FIN: fin, GA: (pr.scout.G ?? 0) + (pr.scout.A ?? 0), FS: pr.scout.FS ?? 0, DE: pr.scout.DE ?? 0 };
    // lateral com lado conhecido também entra na coluna do lado (esquerdo/direito):
    // o lado em que jogou naquele jogo; sem ele, o lado de costume do atleta
    const lado = p === 2 ? (ladosJogo[`${pr.rodada}:${pr.atletaId}`] ?? lados[pr.atletaId]) : undefined;
    const alvos: CedPos[] = lado === "E" ? [p, LATERAL_ESQ] : lado === "D" ? [p, LATERAL_DIR] : [p];
    const add = (acc: Record<CedPos, Acc>, weight: number) => {
      for (const k of alvos) {
        const c = acc[k];
        c.pts += pr.pontos * weight;
        c.w += weight;
        c.n += 1;
        c.sc.DS += sc.DS * weight;
        c.sc.FIN += sc.FIN * weight;
        c.sc.GA += sc.GA * weight;
        c.sc.FS += sc.FS * weight;
        c.sc.DE += sc.DE * weight;
      }
    };
    if (p !== 6) {
      const pro = timePro.get(pr.clubeId) ?? { ds: 0, fin: 0 };
      pro.ds += ds;
      pro.fin += fin;
      timePro.set(pr.clubeId, pro);
      const contra = timeContra.get(opp) ?? { ds: 0, fin: 0 };
      contra.ds += ds;
      contra.fin += fin;
      timeContra.set(opp, contra);
    }
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

  const ligaMedias = {} as Record<CedPos, number>;
  for (const p of CED_POS) ligaMedias[p] = league[p].w > 0 ? league[p].pts / league[p].w : 0;
  // sem laterais marcados por lado, a referência do lado é a dos laterais em geral
  for (const p of [LATERAL_ESQ, LATERAL_DIR] as const) if (!ligaMedias[p]) ligaMedias[p] = ligaMedias[2];

  const r2 = (v: number) => Math.round(v * 100) / 100;
  const toCells = (acc: Record<CedPos, Acc>, weighted: boolean): Record<CedPos, CedenciaCell> => {
    const out = {} as Record<CedPos, CedenciaCell>;
    for (const p of CED_POS) {
      const a = acc[p];
      const base = ligaMedias[p] || 1;
      const denom = weighted ? a.w : a.n;
      const raw = denom > 0 ? a.pts / denom : base;
      // shrinkage por "jogos de atleta" observados
      const m = shrinkGames;
      const shrunk = (raw * denom + base * m) / (denom + m);
      const media = (v: number) => (denom > 0 ? r2(v / denom) : 0);
      out[p] = {
        pontos: r2(raw),
        fator: Math.round((shrunk / base) * 1000) / 1000,
        jogos: a.n,
        scouts: { DS: media(a.sc.DS), FIN: media(a.sc.FIN), GA: media(a.sc.GA), FS: media(a.sc.FS), DE: media(a.sc.DE) },
      };
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
    const jogos = roundsByClub.get(c)?.geral.length ?? 0;
    const pro = timePro.get(c) ?? { ds: 0, fin: 0 };
    const contra = timeContra.get(c) ?? { ds: 0, fin: 0 };
    const time: TimeScouts = {
      jogos,
      dsConquistados: jogos ? r2(pro.ds / jogos) : 0,
      dsCedidos: jogos ? r2(contra.ds / jogos) : 0,
      finFeitas: jogos ? r2(pro.fin / jogos) : 0,
      finCedidas: jogos ? r2(contra.fin / jogos) : 0,
    };
    return {
      clubeId: c,
      time,
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
