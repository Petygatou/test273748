/**
 * Snapshots do mercado por rodada (preço e status de cada atleta antes da
 * rodada). A API só entrega o preço atual; guardando um retrato por rodada
 * conseguimos reconstruir preço antes/depois de cada jogo, o que alimenta a
 * calibração do MPV com várias rodadas — e, no futuro, a calibração da
 * chance de jogar a partir do status histórico.
 */
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Athlete, PlayerRound } from "../engine/types";
import { dataDir } from "./db";

export interface Snapshot {
  temporada: number;
  rodada: number;
  salvoEm: string;
  /** atletaId → [preço, statusId] */
  atletas: Record<number, [number, number]>;
}

const dir = () => join(dataDir(), "snapshots");

export async function saveSnapshot(temporada: number, rodada: number, athletes: Athlete[]) {
  try {
    await mkdir(dir(), { recursive: true });
    const snap: Snapshot = { temporada, rodada, salvoEm: new Date().toISOString(), atletas: {} };
    for (const a of athletes) snap.atletas[a.id] = [a.preco, a.statusId];
    const file = join(dir(), `${temporada}-${String(rodada).padStart(2, "0")}.json`);
    await writeFile(file + ".tmp", JSON.stringify(snap));
    await rename(file + ".tmp", file);
  } catch {
    /* disco somente leitura: segue sem snapshot */
  }
}

export async function loadSnapshots(temporada: number): Promise<Map<number, Snapshot>> {
  const out = new Map<number, Snapshot>();
  try {
    for (const f of await readdir(dir())) {
      if (!f.startsWith(`${temporada}-`) || !f.endsWith(".json")) continue;
      const s = JSON.parse(await readFile(join(dir(), f), "utf8")) as Snapshot;
      out.set(s.rodada, s);
    }
  } catch {
    /* sem snapshots ainda */
  }
  return out;
}

/** Preenche preço antes da rodada e variação depois dela onde houver snapshots. */
export function enrichHistory(history: PlayerRound[], snaps: Map<number, Snapshot>): PlayerRound[] {
  if (!snaps.size) return history;
  return history.map((h) => {
    const before = snaps.get(h.rodada)?.atletas[h.atletaId];
    const after = snaps.get(h.rodada + 1)?.atletas[h.atletaId];
    if (!before) return h;
    return { ...h, preco: before[0], variacao: after ? Math.round((after[0] - before[0]) * 100) / 100 : undefined };
  });
}
