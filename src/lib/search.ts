/** Busca tolerante a acento, maiúsculas e ordem: prefixo > início de palavra > trecho. */
import { useEffect, useState } from "react";
import type { Club, PlayerProjection } from "../engine/types";
import { POSITIONS } from "../engine/rules";

export const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/** Pontua o quanto `text` casa com a consulta (0 = não casa). */
export function matchScore(text: string, q: string): number {
  const t = norm(text);
  if (!q) return 0;
  if (t === q) return 100;
  if (t.startsWith(q)) return 80;
  if (t.split(/[\s.\-']+/).some((w) => w.startsWith(q))) return 60;
  if (t.includes(q)) return 35;
  // iniciais ("gb" → Gabriel Barbosa)
  const ini = t
    .split(/\s+/)
    .map((w) => w[0])
    .join("");
  if (q.length >= 2 && ini.startsWith(q)) return 30;
  return 0;
}

const POS_WORDS: Record<string, number> = {
  gol: 1, goleiro: 1, goleiros: 1,
  lat: 2, lateral: 2, laterais: 2,
  zag: 3, zagueiro: 3, zagueiros: 3,
  mei: 4, meia: 4, meias: 4,
  ata: 5, atacante: 5, atacantes: 5,
  tec: 6, tecnico: 6, tecnicos: 6,
};

/**
 * Busca de atletas: aceita nome, clube ("fla"), posição ("ata") e combinações
 * ("ata fla"). Empates resolvidos por xP.
 */
export function searchPlayers(players: PlayerProjection[], clubs: Record<number, Club>, query: string, opts: { limit?: number; filter?: (p: PlayerProjection) => boolean } = {}) {
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const out: Array<{ p: PlayerProjection; s: number }> = [];
  for (const p of players) {
    if (opts.filter && !opts.filter(p)) continue;
    const c = clubs[p.clubeId];
    let total = 0;
    let ok = true;
    for (const w of words) {
      const s = Math.max(
        matchScore(p.apelido, w) * 1.2,
        c ? Math.max(matchScore(c.nome, w), matchScore(c.abreviacao, w)) * 0.7 : 0,
        POS_WORDS[w] === p.posicaoId || norm(POSITIONS[p.posicaoId as 1].abbr) === w ? 40 : 0,
      );
      if (!s) {
        ok = false;
        break;
      }
      total += s;
    }
    if (ok) out.push({ p, s: total });
  }
  out.sort((x, y) => y.s - x.s || y.p.xP - x.p.xP);
  return out.slice(0, opts.limit ?? 8).map((x) => x.p);
}

/** Valor atrasado (para buscas remotas enquanto digita). */
export function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
