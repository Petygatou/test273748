/**
 * Prováveis escalações por clube a partir do motor: chance de jogar (status
 * oficial do Cartola + ajustes do Painel ADM + histórico de minutos). O
 * esquema é o que melhor acomoda os 11 mais prováveis.
 */
import { FORMATIONS, FORMATION_KEYS, type FormationKey, type PositionId } from "../engine/rules";
import type { PlayerProjection } from "../engine/types";

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
