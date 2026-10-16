/**
 * Regras do Cartola FC usadas pelo motor.
 *
 * Tudo que é "regra do jogo" fica aqui, isolado do modelo estatístico, para
 * que uma mudança de regulamento (ex.: valor do desarme) seja um ajuste de
 * uma linha. O motor também confere esta tabela contra as pontuações oficiais
 * (ver `validateScoring` em rulesCheck.ts) e avisa se algum peso mudou.
 */

export const SCOUT_KEYS = [
  "G", "A", "FT", "FD", "FF", "FS", "PS", "PP", "I",
  "DS", "SG", "DE", "DP", "GS",
  "FC", "PC", "CA", "CV", "GC", "V",
] as const;

export type ScoutKey = (typeof SCOUT_KEYS)[number];
export type Scouts = Partial<Record<ScoutKey, number>>;

/** Pontuação por scout (temporada 2023+; conferida contra dados oficiais). */
export const SCORING: Record<ScoutKey, number> = {
  G: 8.0, // gol
  A: 5.0, // assistência
  FT: 3.0, // finalização na trave
  FD: 1.2, // finalização defendida
  FF: 0.8, // finalização para fora
  FS: 0.5, // falta sofrida
  PS: 1.0, // pênalti sofrido
  PP: -4.0, // pênalti perdido
  I: -0.1, // impedimento
  DS: 1.2, // desarme
  SG: 5.0, // jogo sem sofrer gol (GOL, LAT, ZAG)
  DE: 1.0, // defesa (goleiro)
  DP: 7.0, // defesa de pênalti
  GS: -1.0, // gol sofrido (goleiro)
  FC: -0.3, // falta cometida
  PC: -1.0, // pênalti cometido
  CA: -1.0, // cartão amarelo
  CV: -3.0, // cartão vermelho
  GC: -3.0, // gol contra
  V: 1.0, // vitória (técnico)
};

export const SCOUT_LABELS: Record<ScoutKey, string> = {
  G: "Gol",
  A: "Assistência",
  FT: "Finalização na trave",
  FD: "Finalização defendida",
  FF: "Finalização para fora",
  FS: "Falta sofrida",
  PS: "Pênalti sofrido",
  PP: "Pênalti perdido",
  I: "Impedimento",
  DS: "Desarme",
  SG: "Saldo de gol (sem sofrer gol)",
  DE: "Defesa",
  DP: "Defesa de pênalti",
  GS: "Gol sofrido",
  FC: "Falta cometida",
  PC: "Pênalti cometido",
  CA: "Cartão amarelo",
  CV: "Cartão vermelho",
  GC: "Gol contra",
  V: "Vitória (técnico)",
};

/** Scouts que formam o "piso" (volume recorrente) vs "explosão" (eventos raros e decisivos). */
export const BASE_SCOUTS: ScoutKey[] = ["DS", "FS", "FD", "FF", "DE", "I", "FC", "CA", "CV", "GS", "PC", "GC", "PP"];
export const EXPLOSION_SCOUTS: ScoutKey[] = ["G", "A", "FT", "SG", "DP", "PS", "V"];

export type PositionId = 1 | 2 | 3 | 4 | 5 | 6;
export const POSITIONS: Record<PositionId, { abbr: "GOL" | "LAT" | "ZAG" | "MEI" | "ATA" | "TEC"; name: string; plural: string }> = {
  1: { abbr: "GOL", name: "Goleiro", plural: "Goleiros" },
  2: { abbr: "LAT", name: "Lateral", plural: "Laterais" },
  3: { abbr: "ZAG", name: "Zagueiro", plural: "Zagueiros" },
  4: { abbr: "MEI", name: "Meia", plural: "Meias" },
  5: { abbr: "ATA", name: "Atacante", plural: "Atacantes" },
  6: { abbr: "TEC", name: "Técnico", plural: "Técnicos" },
};
export const PLAYER_POSITIONS: PositionId[] = [1, 2, 3, 4, 5];
export const ALL_POSITIONS: PositionId[] = [1, 2, 3, 4, 5, 6];

/** Posições que recebem SG. */
export const SG_POSITIONS: PositionId[] = [1, 2, 3];

/** Scouts que cada posição pode pontuar no modelo (os demais ficam zerados). */
export const POSITION_SCOUTS: Record<PositionId, ScoutKey[]> = {
  1: ["DE", "DP", "GS", "SG", "FS", "FC", "CA", "CV", "GC", "PC", "A", "G", "DS"],
  2: ["G", "A", "FT", "FD", "FF", "FS", "PS", "PP", "I", "DS", "SG", "FC", "PC", "CA", "CV", "GC"],
  3: ["G", "A", "FT", "FD", "FF", "FS", "PS", "PP", "I", "DS", "SG", "FC", "PC", "CA", "CV", "GC"],
  4: ["G", "A", "FT", "FD", "FF", "FS", "PS", "PP", "I", "DS", "FC", "PC", "CA", "CV", "GC"],
  5: ["G", "A", "FT", "FD", "FF", "FS", "PS", "PP", "I", "DS", "FC", "PC", "CA", "CV", "GC"],
  6: ["V"],
};

export const STATUS = {
  DUVIDA: 2,
  SUSPENSO: 3,
  CONTUNDIDO: 5,
  NULO: 6,
  PROVAVEL: 7,
} as const;

export const STATUS_LABELS: Record<number, string> = {
  2: "Dúvida",
  3: "Suspenso",
  5: "Contundido",
  6: "Nulo",
  7: "Provável",
};

export const CAPTAIN_MULTIPLIER = 1.5;

export type FormationKey = "3-4-3" | "3-5-2" | "4-3-3" | "4-4-2" | "4-5-1" | "5-3-2" | "5-4-1";

/** Quantidade por posição em cada esquema (GOL e TEC sempre 1). */
export const FORMATIONS: Record<FormationKey, Record<PositionId, number>> = {
  "3-4-3": { 1: 1, 2: 0, 3: 3, 4: 4, 5: 3, 6: 1 },
  "3-5-2": { 1: 1, 2: 0, 3: 3, 4: 5, 5: 2, 6: 1 },
  "4-3-3": { 1: 1, 2: 2, 3: 2, 4: 3, 5: 3, 6: 1 },
  "4-4-2": { 1: 1, 2: 2, 3: 2, 4: 4, 5: 2, 6: 1 },
  "4-5-1": { 1: 1, 2: 2, 3: 2, 4: 5, 5: 1, 6: 1 },
  "5-3-2": { 1: 1, 2: 2, 3: 3, 4: 3, 5: 2, 6: 1 },
  "5-4-1": { 1: 1, 2: 2, 3: 3, 4: 4, 5: 1, 6: 1 },
};
export const FORMATION_KEYS = Object.keys(FORMATIONS) as FormationKey[];

/** Pontos de um conjunto de scouts. */
export function pointsFromScouts(scouts: Scouts, scoring: Record<ScoutKey, number> = SCORING): number {
  let total = 0;
  for (const k in scouts) {
    const key = k as ScoutKey;
    const n = scouts[key];
    if (n) total += n * (scoring[key] ?? 0);
  }
  return Math.round(total * 100) / 100;
}
