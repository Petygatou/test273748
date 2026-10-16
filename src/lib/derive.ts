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
