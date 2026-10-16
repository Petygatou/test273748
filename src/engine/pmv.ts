/**
 * Mínimo para Valorizar (MPV/PMV).
 *
 * Desde 2024 a valorização segue a forma  V = CPP × (pontos − MPV),  em que o
 * MPV depende do preço e do histórico recente do atleta (atletas caros
 * precisam pontuar mais). A Globo não publica a fórmula, então:
 *
 * 1. Se a API trouxer o MPV oficial (Gato Mestre), usamos o oficial.
 * 2. Senão, CALIBRAMOS a fórmula a cada rodada por regressão sobre o mercado:
 *    variação_observada ~ CPP·pontos + b₁·preço_antes + b₂·média_antes + b₀
 *    e resolvemos o MPV da próxima rodada: pontos tal que variação = 0.
 *
 * O R² da calibração fica exposto para auditoria.
 */
import { clamp, ridgeRegression } from "./math";
import type { Athlete, PlayerRound, PmvModel } from "./types";

const FALLBACK: PmvModel = { cpp: 0.24, coefPreco: -0.6 * 0.24, coefMedia: 0, intercepto: 0, r2: 0, amostras: 0 };

export function calibratePmv(athletes: Athlete[], history: PlayerRound[], currentRound: number): PmvModel {
  const X: number[][] = [];
  const y: number[] = [];

  // 1) amostras do mercado atual: última rodada
  const playedLast = new Map<number, PlayerRound>();
  for (const h of history) if (h.rodada === currentRound - 1) playedLast.set(h.atletaId, h);
  for (const a of athletes) {
    if (a.posicaoId === 6) continue;
    const pr = playedLast.get(a.id);
    if (!pr || a.jogos < 2) continue;
    const precoAntes = a.preco - a.variacao;
    if (precoAntes <= 0) continue;
    const mediaAntes = (a.media * a.jogos - pr.pontos) / (a.jogos - 1);
    X.push([pr.pontos, precoAntes, mediaAntes, 1]);
    y.push(a.variacao);
  }

  // 2) snapshots históricos (quando a fonte guardou preço/variação por rodada)
  const byAthlete = new Map<number, PlayerRound[]>();
  for (const h of history) {
    if (h.preco == null || h.variacao == null || h.posicaoId === 6) continue;
    if (!byAthlete.has(h.atletaId)) byAthlete.set(h.atletaId, []);
    byAthlete.get(h.atletaId)!.push(h);
  }
  const allBy = new Map<number, PlayerRound[]>();
  for (const h of history) {
    if (!allBy.has(h.atletaId)) allBy.set(h.atletaId, []);
    allBy.get(h.atletaId)!.push(h);
  }
  for (const [id, rows] of byAthlete) {
    const all = (allBy.get(id) ?? []).sort((a, b) => a.rodada - b.rodada);
    for (const r of rows) {
      if (r.rodada === currentRound - 1) continue; // já contado acima
      const prev = all.filter((h) => h.rodada < r.rodada);
      if (prev.length < 1) continue;
      const mediaAntes = prev.reduce((s, h) => s + h.pontos, 0) / prev.length;
      X.push([r.pontos, r.preco!, mediaAntes, 1]);
      y.push(r.variacao!);
    }
  }

  if (X.length < 30) return FALLBACK;
  const beta = ridgeRegression(X, y, 1e-3);
  const [cpp, bPreco, bMedia, b0] = beta;
  if (!(cpp > 0.02)) return { ...FALLBACK, amostras: X.length };

  let ssRes = 0;
  let ssTot = 0;
  const my = y.reduce((s, v) => s + v, 0) / y.length;
  for (let i = 0; i < X.length; i++) {
    const pred = X[i][0] * cpp + X[i][1] * bPreco + X[i][2] * bMedia + b0;
    ssRes += (y[i] - pred) ** 2;
    ssTot += (y[i] - my) ** 2;
  }
  return {
    cpp,
    coefPreco: bPreco,
    coefMedia: bMedia,
    intercepto: b0,
    r2: ssTot > 0 ? 1 - ssRes / ssTot : 0,
    amostras: X.length,
  };
}

export function mpvFor(a: Athlete, model: PmvModel): { mpv: number; fonte: "oficial" | "modelo" } {
  if (a.gatoMestre?.mpv != null && Number.isFinite(a.gatoMestre.mpv)) return { mpv: a.gatoMestre.mpv, fonte: "oficial" };
  const mpv = -(model.coefPreco * a.preco + model.coefMedia * a.media + model.intercepto) / model.cpp;
  return { mpv: Math.round(clamp(mpv, -5, 40) * 10) / 10, fonte: "modelo" };
}
