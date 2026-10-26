/** Derivações para a interface (puras, a partir da análise do motor). */
import type { FixtureOdds, PlayerProjection, RoundAnalysis } from "../engine/types";

export type Confronto = "Fácil" | "Neutro" | "Alto risco";

export function confrontoFor(f: FixtureOdds, home: boolean): { label: Confronto; pVitoria: number; xgPro: number; xgContra: number; sg: number } {
  const pVitoria = home ? f.pCasa : f.pFora;
  const xgPro = home ? f.lambdaCasa : f.lambdaFora;
  const xgContra = home ? f.lambdaFora : f.lambdaCasa;
  const sg = home ? f.sgCasa : f.sgFora;
  const label: Confronto = pVitoria >= 0.5 && xgContra <= 1.15 ? "Fácil" : pVitoria < 0.25 || xgContra >= 1.6 ? "Alto risco" : "Neutro";
  return { label, pVitoria, xgPro, xgContra, sg };
}

/** Probabilidades de gols de um time no jogo, tiradas da matriz de placares do modelo. */
export interface GolsTime {
  /** marcar pelo menos 1, 2 e 3 gols */
  marca1: number;
  marca2: number;
  marca3: number;
  /** sofrer 2 ou mais */
  sofre2: number;
  /** vencer por 2+ gols de diferença */
  venceDe2: number;
  /** ambos marcam (do jogo) */
  ambos: number;
  /** jogo com 3+ gols (mais de 2,5) */
  over25: number;
  /** jogo com 2+ gols (mais de 1,5) */
  over15: number;
}

export function golsTime(f: FixtureOdds, home: boolean): GolsTime {
  const m = f.scoreMatrix;
  let total = 0;
  const acc = { marca1: 0, marca2: 0, marca3: 0, sofre2: 0, venceDe2: 0, ambos: 0, over25: 0, over15: 0 };
  for (let i = 0; i < m.length; i++) {
    for (let j = 0; j < (m[i]?.length ?? 0); j++) {
      const p = m[i][j];
      total += p;
      const pro = home ? i : j;
      const contra = home ? j : i;
      if (pro >= 1) acc.marca1 += p;
      if (pro >= 2) acc.marca2 += p;
      if (pro >= 3) acc.marca3 += p;
      if (contra >= 2) acc.sofre2 += p;
      if (pro - contra >= 2) acc.venceDe2 += p;
      if (i >= 1 && j >= 1) acc.ambos += p;
      if (i + j >= 3) acc.over25 += p;
      if (i + j >= 2) acc.over15 += p;
    }
  }
  // a matriz é truncada em poucos gols: normaliza pelo que ela cobre
  const k = total > 0 ? 1 / total : 0;
  return Object.fromEntries(Object.entries(acc).map(([key, v]) => [key, v * k])) as unknown as GolsTime;
}

export function topBy(players: PlayerProjection[], key: (p: PlayerProjection) => number, n: number, filter?: (p: PlayerProjection) => boolean) {
  return players
    .filter((p) => p.matchId != null && (filter ? filter(p) : true))
    .sort((a, b) => key(b) - key(a))
    .slice(0, n);
}

export function playerIndex(a: RoundAnalysis) {
  return new Map(a.players.map((p) => [p.atletaId, p] as const));
}

/** Resumo compacto da rodada para o Comandante (só números do motor). */
export function roundBrief(a: RoundAnalysis) {
  const clubs = a.clubs;
  const name = (id: number | null) => (id != null ? clubs[id]?.nome ?? String(id) : "—");
  return {
    rodada: a.rodada,
    fonte: a.source,
    jogos: a.fixtures.map((f) => ({
      jogo: `${name(f.casaId)} x ${name(f.foraId)}`,
      golsEsperados: [Number(f.lambdaCasa.toFixed(2)), Number(f.lambdaFora.toFixed(2))],
      probabilidades: { casa: Number(f.pCasa.toFixed(2)), empate: Number(f.pEmpate.toFixed(2)), fora: Number(f.pFora.toFixed(2)) },
      chanceSG: { casa: Number(f.sgCasa.toFixed(2)), fora: Number(f.sgFora.toFixed(2)) },
    })),
    capitaes: topBy(a.players, (p) => p.xP, 6, (p) => p.posicaoId !== 6).map(compactPlayer(a)),
    valorizacao: topBy(a.players, (p) => p.valorizacaoEsperada, 5).map(compactPlayer(a)),
  };
}

export const compactPlayer = (a: RoundAnalysis) => (p: PlayerProjection) => ({
  atleta: p.apelido,
  id: p.atletaId,
  clube: a.clubs[p.clubeId]?.nome,
  posicao: p.posicaoId,
  preco: p.preco,
  xP: p.xP,
  xPJogando: p.xPJogando,
  pJogar: p.pJogar,
  piso: p.piso,
  teto: p.teto,
  pAcima12: p.pAcima12,
  mpv: p.mpv,
  valorizacaoEsperada: p.valorizacaoEsperada,
  adversario: p.adversarioId != null ? a.clubs[p.adversarioId]?.nome : null,
  mando: p.mando,
  fatores: p.fatores,
  principaisScouts: p.scouts.slice(0, 5),
  alertas: p.alertas,
  posse: p.posse,
});
