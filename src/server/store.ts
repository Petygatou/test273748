/**
 * Persistência do servidor: overrides de prováveis escalações (painel ADM).
 * Usa o Lovable Cloud quando configurado; senão, memória do processo.
 */
import type { LineupOverride } from "../engine/types";
import { getSupabase, supabaseKey, supabaseUrl } from "../lib/supabase";

const memory = new Map<string, Record<number, LineupOverride>>();
const k = (temporada: number, rodada: number) => `${temporada}:${rodada}`;

export async function loadOverrides(temporada: number, rodada: number): Promise<Record<number, LineupOverride>> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb
      .from("lineup_overrides")
      .select("atleta_id,status")
      .eq("temporada", temporada)
      .eq("rodada", rodada);
    if (!error && data) {
      const out: Record<number, LineupOverride> = {};
      for (const row of data as Array<{ atleta_id: number; status: LineupOverride }>) out[row.atleta_id] = row.status;
      return out;
    }
  }
  return memory.get(k(temporada, rodada)) ?? {};
}

export async function saveOverride(temporada: number, rodada: number, atletaId: number, status: LineupOverride | null, accessToken?: string) {
  const sb = getSupabase();
  if (sb && accessToken) {
    const { createClient } = await import("@supabase/supabase-js");
    const authed = createClient(supabaseUrl!, supabaseKey!, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false },
    });
    if (status == null) {
      const { error } = await authed.from("lineup_overrides").delete().match({ temporada, rodada, atleta_id: atletaId });
      if (error) throw new Error(error.message);
    } else {
      const { error } = await authed
        .from("lineup_overrides")
        .upsert({ temporada, rodada, atleta_id: atletaId, status }, { onConflict: "temporada,rodada,atleta_id" });
      if (error) throw new Error(error.message);
    }
    return;
  }
  const cur = { ...(memory.get(k(temporada, rodada)) ?? {}) };
  if (status == null) delete cur[atletaId];
  else cur[atletaId] = status;
  memory.set(k(temporada, rodada), cur);
}
