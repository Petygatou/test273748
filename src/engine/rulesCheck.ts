/**
 * Auditoria da tabela de pontuação: recalcula os pontos de cada linha do
 * histórico a partir dos scouts e compara com a pontuação oficial. Também
 * estima os pesos por mínimos quadrados — se a Globo mudar o valor de um
 * scout, o motor percebe sozinho e aponta a divergência.
 */
import { ridgeRegression } from "./math";
import { SCORING, SCOUT_KEYS, pointsFromScouts, type ScoutKey } from "./rules";
import type { PlayerRound, RulesCheck } from "./types";

export function validateScoring(history: PlayerRound[]): RulesCheck {
  const rows = history.filter((h) => h.posicaoId !== 6);
  if (!rows.length) return { acerto: 1, amostras: 0, pesosEstimados: {}, divergencias: [] };
  let ok = 0;
  for (const r of rows) if (Math.abs(pointsFromScouts(r.scout) - r.pontos) < 0.051) ok++;

  // inclui todo scout observado (omitir os raros enviesaria os demais); só reporta os bem amostrados
  const freq = (k: ScoutKey) => rows.filter((r) => (r.scout[k] ?? 0) > 0).length;
  const keys = SCOUT_KEYS.filter((k) => k !== "V" && freq(k) >= 3);
  const X = rows.map((r) => keys.map((k) => r.scout[k] ?? 0));
  const y = rows.map((r) => r.pontos);
  const beta = keys.length ? ridgeRegression(X, y, 1e-6) : [];
  const pesosEstimados: Partial<Record<ScoutKey, number>> = {};
  const divergencias: RulesCheck["divergencias"] = [];
  keys.forEach((k, i) => {
    if (freq(k) < 30) return;
    const est = Math.round(beta[i] * 100) / 100;
    pesosEstimados[k] = est;
    if (Math.abs(est - SCORING[k]) > 0.15) divergencias.push({ key: k, oficial: SCORING[k], estimado: est });
  });
  return { acerto: ok / rows.length, amostras: rows.length, pesosEstimados, divergencias };
}

/**
 * Salvaguarda de formato: se os scouts por rodada vierem ACUMULADOS (soma da
 * temporada) em vez de por jogo, os pontos recalculados não batem. Nesse caso
 * converte por diferença entre rodadas consecutivas de cada atleta e confere
 * de novo — fica com a versão que melhor reproduz a pontuação oficial.
 */
export function normalizeHistoryScouts(history: PlayerRound[]): { history: PlayerRound[]; convertido: boolean } {
  const rows = history.filter((h) => h.posicaoId !== 6);
  if (rows.length < 50) return { history, convertido: false };
  const rate = (hs: PlayerRound[]) => {
    const r = hs.filter((h) => h.posicaoId !== 6);
    let ok = 0;
    for (const h of r) if (Math.abs(pointsFromScouts(h.scout) - h.pontos) < 0.051) ok++;
    return ok / Math.max(1, r.length);
  };
  const original = rate(history);
  if (original >= 0.6) return { history, convertido: false };
  const byAthlete = new Map<number, PlayerRound[]>();
  for (const h of history) {
    if (!byAthlete.has(h.atletaId)) byAthlete.set(h.atletaId, []);
    byAthlete.get(h.atletaId)!.push(h);
  }
  const diffed: PlayerRound[] = [];
  for (const list of byAthlete.values()) {
    list.sort((a, b) => a.rodada - b.rodada);
    let prev: Partial<Record<ScoutKey, number>> = {};
    for (const h of list) {
      const scout: Partial<Record<ScoutKey, number>> = {};
      for (const k of SCOUT_KEYS) {
        const v = (h.scout[k] ?? 0) - (prev[k] ?? 0);
        if (v > 0) scout[k] = v;
      }
      prev = h.scout;
      diffed.push({ ...h, scout });
    }
  }
  return rate(diffed) > original ? { history: diffed, convertido: true } : { history, convertido: false };
}
