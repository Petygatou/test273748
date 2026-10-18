/**
 * Temporada real importada. Quando o servidor do site não consegue falar com a
 * API do Cartola (a Globo costuma barrar IPs de nuvem), um computador comum
 * baixa os dados reais e envia para cá (`npm run enviar`). O site usa esse
 * arquivo enquanto estiver fresco; os dados continuam sendo reais.
 */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { SeasonData } from "../engine/types";
import { dataDir } from "./db";

const file = () => join(dataDir(), "season-import.json");

/** Idade máxima aceita: depois disso o site prefere avisar a mostrar dado velho. */
export const IMPORT_MAX_AGE_MS = 48 * 3600_000;

export interface Imported {
  data: SeasonData;
  importadoEm: string;
}

export function validateSeason(x: unknown): SeasonData {
  const d = x as Partial<SeasonData> | null;
  if (!d || typeof d !== "object") throw new Error("JSON inválido");
  if (d.source !== "cartola") throw new Error("Só dados reais (source=cartola) são aceitos");
  if (!Array.isArray(d.athletes) || d.athletes.length < 50) throw new Error("Mercado com poucos atletas");
  if (!Array.isArray(d.matches) || !Array.isArray(d.history) || !d.clubs || typeof d.rodadaAtual !== "number") throw new Error("Estrutura da temporada incompleta");
  return d as SeasonData;
}

export async function saveImported(data: SeasonData): Promise<Imported> {
  const out: Imported = { data, importadoEm: new Date().toISOString() };
  await mkdir(dataDir(), { recursive: true });
  await writeFile(file() + ".tmp", JSON.stringify(out));
  await rename(file() + ".tmp", file());
  return out;
}

export async function loadImported(): Promise<Imported | null> {
  try {
    const out = JSON.parse(await readFile(file(), "utf8")) as Imported;
    if (Date.now() - new Date(out.importadoEm).getTime() > IMPORT_MAX_AGE_MS) return null;
    return out;
  } catch {
    return null;
  }
}
