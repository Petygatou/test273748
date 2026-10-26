/**
 * Colunas do Mercado (Estatísticas): cada métrica com rótulo curto, explicação,
 * como exibir e como ordenar. A pessoa escolhe quais aparecem.
 */
import type { ReactNode } from "react";
import { RangeBar } from "../components/ui";
import type { ScoutKey } from "../engine/rules";
import type { FixtureOdds, PlayerProjection, RoundAnalysis } from "../engine/types";
import { golsTime } from "./derive";
import { fmt1, fmt2, pct, signed } from "./format";

export interface TimeNoJogo {
  vitoria: number;
  sg: number;
  xg: number;
  xgContra: number;
  marca2: number;
}

export interface Ctx {
  a: RoundAnalysis;
  times: Map<number, TimeNoJogo>;
}

export type Grupo = "Previsão" | "Probabilidades" | "Histórico" | "Confronto" | "Scouts esperados" | "Mercado";

export interface Coluna {
  id: string;
  rotulo: string;
  titulo: string;
  grupo: Grupo;
  /** valor para ordenar (maior primeiro, a menos que `asc`) */
  valor: (p: PlayerProjection, c: Ctx) => number | null;
  asc?: boolean;
  render: (p: PlayerProjection, c: Ctx) => ReactNode;
  className?: string;
  padrao?: boolean;
}

const esp = (p: PlayerProjection, k: ScoutKey) => p.scouts.find((s) => s.key === k)?.esperado ?? 0;
const jogados = (p: PlayerProjection) => p.ultimas.filter((u) => u.pontos != null).map((u) => u.pontos as number);
const mediaUlt = (p: PlayerProjection, n: number) => {
  const j = jogados(p).slice(-n);
  return j.length ? j.reduce((s, v) => s + v, 0) / j.length : null;
};
const fator = (v: number) => <span className={v >= 1.05 ? "text-[var(--color-good-ink)]" : v <= 0.95 ? "text-[var(--color-critical-ink)]" : ""}>{signed((v - 1) * 100, 0)}%</span>;
const num = (v: number | null, f = fmt2) => (v == null ? <span className="text-[var(--color-ink-3)]">—</span> : f(v));

export function timesNoJogo(fixtures: FixtureOdds[]): Map<number, TimeNoJogo> {
  const m = new Map<number, TimeNoJogo>();
  for (const f of fixtures) {
    const gc = golsTime(f, true);
    const gf = golsTime(f, false);
    m.set(f.casaId, { vitoria: f.pCasa, sg: f.sgCasa, xg: f.lambdaCasa, xgContra: f.lambdaFora, marca2: gc.marca2 });
    m.set(f.foraId, { vitoria: f.pFora, sg: f.sgFora, xg: f.lambdaFora, xgContra: f.lambdaCasa, marca2: gf.marca2 });
  }
  return m;
}

export const COLUNAS: Coluna[] = [
  // ---------------- previsão ----------------
  { id: "xP", rotulo: "Pts", titulo: "Pontos previstos (já descontada a chance de não jogar)", grupo: "Previsão", padrao: true, valor: (p) => p.xP, render: (p) => fmt1(p.xP), className: "font-display font-bold text-[var(--color-gold)]" },
  { id: "jogo", rotulo: "Jogo", titulo: "Adversário da rodada (vs = em casa, @ = fora)", grupo: "Confronto", padrao: true, valor: () => null, render: (p, c) => { const o = p.adversarioId != null ? c.a.clubs[p.adversarioId] : undefined; return o ? `${p.mando === "casa" ? "vs" : "@"} ${o.abreviacao}` : "—"; }, className: "text-xs text-[var(--color-ink-2)] text-left" },
  { id: "preco", rotulo: "C$", titulo: "Preço", grupo: "Mercado", padrao: true, valor: (p) => p.preco, render: (p) => fmt2(p.preco) },
  { id: "pJogar", rotulo: "Joga", titulo: "Chance de entrar em campo", grupo: "Previsão", padrao: true, valor: (p) => p.pJogar, render: (p) => pct(p.pJogar), className: "text-[var(--color-ink-2)]" },
  { id: "faixa", rotulo: "Piso · Média · Teto", titulo: "Faixa provável da simulação (P15, mediana, P85)", grupo: "Previsão", padrao: true, valor: (p) => p.teto, render: (p) => <RangeBar p={p} showLabels={false} />, className: "min-w-[150px] text-left" },
  { id: "xPJogando", rotulo: "Se jogar", titulo: "Pontos previstos se entrar em campo", grupo: "Previsão", valor: (p) => p.xPJogando, render: (p) => fmt1(p.xPJogando) },
  { id: "cb", rotulo: "Pts/C$", titulo: "Custo-benefício: pontos previstos por cartoleta", grupo: "Previsão", valor: (p) => (p.preco > 0 ? p.xP / p.preco : 0), render: (p) => fmt2(p.preco > 0 ? p.xP / p.preco : 0) },
  { id: "piso", rotulo: "Piso", titulo: "P15: só 15% dos cenários ficam abaixo", grupo: "Previsão", valor: (p) => p.piso, render: (p) => fmt1(p.piso) },
  { id: "teto", rotulo: "Teto", titulo: "P85: só 15% dos cenários ficam acima", grupo: "Previsão", valor: (p) => p.teto, render: (p) => fmt1(p.teto) },
  { id: "p95", rotulo: "P95", titulo: "Pontuação de cenário excepcional (5% melhores)", grupo: "Previsão", valor: (p) => p.p95, render: (p) => fmt1(p.p95) },
  { id: "sd", rotulo: "Desvio", titulo: "Desvio padrão: quanto a pontuação costuma variar", grupo: "Previsão", valor: (p) => p.sd, asc: true, render: (p) => fmt1(p.sd) },

  // ---------------- probabilidades ----------------
  { id: "pAcima12", rotulo: "12+", titulo: "Chance de 12 pontos ou mais (se jogar)", grupo: "Probabilidades", padrao: true, valor: (p) => p.pAcima12, render: (p) => pct(p.pAcima12) },
  { id: "pAcima8", rotulo: "8+", titulo: "Chance de 8 pontos ou mais (se jogar)", grupo: "Probabilidades", valor: (p) => p.pAcima8, render: (p) => pct(p.pAcima8) },
  { id: "pAcima5", rotulo: "5+", titulo: "Chance de 5 pontos ou mais (se jogar)", grupo: "Probabilidades", valor: (p) => p.pAcima5, render: (p) => pct(p.pAcima5) },
  { id: "pNegativo", rotulo: "Neg.", titulo: "Chance de pontuar negativo (se jogar)", grupo: "Probabilidades", valor: (p) => p.pNegativo, asc: true, render: (p) => pct(p.pNegativo) },
  { id: "pValorizar", rotulo: "Valoriza", titulo: "Chance de bater o mínimo para valorizar (se jogar)", grupo: "Probabilidades", valor: (p) => p.pValorizar, render: (p) => pct(p.pValorizar) },

  // ---------------- histórico ----------------
  { id: "media", rotulo: "Média", titulo: "Média no Cartola na temporada", grupo: "Histórico", padrao: true, valor: (p) => p.media, render: (p) => fmt2(p.media), className: "text-[var(--color-ink-2)]" },
  { id: "regularidade", rotulo: "Reg.", titulo: "Regularidade: % de jogos com 3+ pontos", grupo: "Histórico", padrao: true, valor: (p) => p.regularidade, render: (p) => `${p.regularidade}%`, className: "text-[var(--color-ink-2)]" },
  { id: "mediaCasa", rotulo: "MC", titulo: "Média jogando em casa", grupo: "Histórico", valor: (p) => p.mediaCasa, render: (p) => num(p.mediaCasa) },
  { id: "mediaFora", rotulo: "MF", titulo: "Média jogando fora", grupo: "Histórico", valor: (p) => p.mediaFora, render: (p) => num(p.mediaFora) },
  { id: "ult3", rotulo: "Últ. 3", titulo: "Média dos últimos 3 jogos disputados", grupo: "Histórico", valor: (p) => mediaUlt(p, 3), render: (p) => num(mediaUlt(p, 3), fmt1) },
  { id: "ult5", rotulo: "Últ. 5", titulo: "Média dos últimos 5 jogos disputados", grupo: "Histórico", valor: (p) => mediaUlt(p, 5), render: (p) => num(mediaUlt(p, 5), fmt1) },
  { id: "ultima", rotulo: "Última", titulo: "Pontos na última rodada do clube (— = não jogou)", grupo: "Histórico", valor: (p) => p.ultimas.at(-1)?.pontos ?? null, render: (p) => num(p.ultimas.at(-1)?.pontos ?? null, fmt1) },
  { id: "jogos", rotulo: "Jogos", titulo: "Jogos disputados na temporada", grupo: "Histórico", valor: (p) => p.jogos, render: (p) => p.jogos },

  // ---------------- confronto ----------------
  { id: "ced", rotulo: "CED", titulo: "Quanto o adversário cede para a posição (vs média da liga)", grupo: "Confronto", valor: (p) => p.fatores.cedencia, render: (p) => fator(p.fatores.cedencia) },
  { id: "atq", rotulo: "Ataque", titulo: "Força do ataque do time neste jogo (gols esperados vs normal)", grupo: "Confronto", valor: (p) => p.fatores.ataque, render: (p) => fator(p.fatores.ataque) },
  { id: "mandoF", rotulo: "Mando", titulo: "Efeito de jogar em casa ou fora", grupo: "Confronto", valor: (p) => p.fatores.mando, render: (p) => fator(p.fatores.mando) },
  { id: "forma", rotulo: "Forma", titulo: "Forma recente (pontos recentes vs temporada)", grupo: "Confronto", valor: (p) => p.fatores.forma, render: (p) => fator(p.fatores.forma) },
  { id: "vitoria", rotulo: "Vitória", titulo: "Chance de o time vencer", grupo: "Confronto", valor: (p, c) => c.times.get(p.clubeId)?.vitoria ?? null, render: (p, c) => num(c.times.get(p.clubeId)?.vitoria ?? null, pct) },
  { id: "sgTime", rotulo: "SG", titulo: "Chance de o time não sofrer gol", grupo: "Confronto", valor: (p, c) => c.times.get(p.clubeId)?.sg ?? null, render: (p, c) => num(c.times.get(p.clubeId)?.sg ?? null, pct) },
  { id: "marca2", rotulo: "Time 2+", titulo: "Chance de o time marcar 2 ou mais gols", grupo: "Confronto", valor: (p, c) => c.times.get(p.clubeId)?.marca2 ?? null, render: (p, c) => num(c.times.get(p.clubeId)?.marca2 ?? null, pct) },
  { id: "xgTime", rotulo: "xG time", titulo: "Gols esperados do time no jogo", grupo: "Confronto", valor: (p, c) => c.times.get(p.clubeId)?.xg ?? null, render: (p, c) => num(c.times.get(p.clubeId)?.xg ?? null) },

  // ---------------- scouts esperados (se jogar) ----------------
  { id: "eG", rotulo: "G esp.", titulo: "Gols esperados do atleta (se jogar)", grupo: "Scouts esperados", valor: (p) => esp(p, "G"), render: (p) => fmt2(esp(p, "G")) },
  { id: "eA", rotulo: "A esp.", titulo: "Assistências esperadas (se jogar)", grupo: "Scouts esperados", valor: (p) => esp(p, "A"), render: (p) => fmt2(esp(p, "A")) },
  { id: "eGA", rotulo: "G+A", titulo: "Participações em gol esperadas (se jogar)", grupo: "Scouts esperados", valor: (p) => esp(p, "G") + esp(p, "A"), render: (p) => fmt2(esp(p, "G") + esp(p, "A")) },
  { id: "eFin", rotulo: "Finaliz.", titulo: "Finalizações esperadas: no gol, para fora e na trave (se jogar)", grupo: "Scouts esperados", valor: (p) => esp(p, "FD") + esp(p, "FF") + esp(p, "FT"), render: (p) => fmt1(esp(p, "FD") + esp(p, "FF") + esp(p, "FT")) },
  { id: "eDS", rotulo: "DS", titulo: "Desarmes esperados (se jogar)", grupo: "Scouts esperados", valor: (p) => esp(p, "DS"), render: (p) => fmt1(esp(p, "DS")) },
  { id: "eFS", rotulo: "FS", titulo: "Faltas sofridas esperadas (se jogar)", grupo: "Scouts esperados", valor: (p) => esp(p, "FS"), render: (p) => fmt1(esp(p, "FS")) },
  { id: "eDE", rotulo: "DE", titulo: "Defesas esperadas — goleiros (se jogar)", grupo: "Scouts esperados", valor: (p) => esp(p, "DE"), render: (p) => fmt1(esp(p, "DE")) },
  { id: "base", rotulo: "Básica", titulo: "Pontos de scouts básicos esperados (sem G, A, SG): o piso de quem joga", grupo: "Scouts esperados", valor: (p) => p.base, render: (p) => fmt1(p.base) },

  // ---------------- mercado ----------------
  { id: "mpv", rotulo: "MPV", titulo: "Mínimo para valorizar", grupo: "Mercado", padrao: true, valor: (p) => p.mpv, asc: true, render: (p) => fmt1(p.mpv) },
  { id: "valorizacaoEsperada", rotulo: "Val.", titulo: "Variação esperada de preço (C$)", grupo: "Mercado", padrao: true, valor: (p) => p.valorizacaoEsperada, render: (p) => <span className={p.valorizacaoEsperada >= 0 ? "text-[var(--color-good-ink)]" : "text-[var(--color-critical-ink)]"}>{signed(p.valorizacaoEsperada)}</span> },
  { id: "posse", rotulo: "% escal.", titulo: "% dos times que escalam o atleta", grupo: "Mercado", valor: (p) => p.posse ?? null, render: (p) => num(p.posse ?? null, (v) => `${fmt1(v)}%`) },
];

export const COLUNAS_PADRAO = COLUNAS.filter((c) => c.padrao).map((c) => c.id);
export const GRUPOS: Grupo[] = ["Previsão", "Probabilidades", "Histórico", "Confronto", "Scouts esperados", "Mercado"];
