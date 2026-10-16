/** Prováveis escalações (Painel ADM) e alertas de mercado, no banco próprio. */
import type { LineupOverride } from "../engine/types";
import { db, newId, type AlertRow } from "./db";

export async function loadOverrides(temporada: number, rodada: number): Promise<Record<number, LineupOverride>> {
  const out: Record<number, LineupOverride> = {};
  for (const o of db.overrides.filter((x) => x.temporada === temporada && x.rodada === rodada)) out[o.atletaId] = o.status;
  return out;
}

export async function saveOverride(temporada: number, rodada: number, atletaId: number, status: LineupOverride | null, userId: string) {
  const id = `${temporada}:${rodada}:${atletaId}`;
  if (status == null) db.overrides.remove(id);
  else db.overrides.put({ id, temporada, rodada, atletaId, status, userId, atualizadoEm: new Date().toISOString() });
}

export function listAlerts(): AlertRow[] {
  const since = Date.now() - 72 * 3600_000;
  return db.alerts.filter((a) => new Date(a.criadoEm).getTime() > since).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)).slice(0, 10);
}

export function createAlert(userId: string, a: { tipo: string; titulo: string; mensagem: string }) {
  const tipo = (["fechamento", "lesao", "desfalque", "geral"].includes(a.tipo) ? a.tipo : "geral") as AlertRow["tipo"];
  const titulo = a.titulo.trim().slice(0, 90);
  const mensagem = a.mensagem.trim().slice(0, 600);
  if (!titulo || !mensagem) throw new Error("Preencha título e mensagem.");
  return db.alerts.put({ id: newId(), tipo, titulo, mensagem, userId, criadoEm: new Date().toISOString() });
}

export function deleteAlert(id: string) {
  db.alerts.remove(id);
}
