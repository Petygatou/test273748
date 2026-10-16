/** Alertas de mercado publicados pelo Painel ADM (nuvem ou local). */
import { useCallback, useEffect, useState } from "react";
import { getSupabase } from "./supabase";

export type AlertKind = "fechamento" | "lesao" | "desfalque" | "geral";

export interface MarketAlert {
  id: string;
  tipo: AlertKind;
  titulo: string;
  mensagem: string;
  criadoEm: string;
}

const LS = "cfc:alerts";

function readLocal(): MarketAlert[] {
  try {
    return JSON.parse(localStorage.getItem(LS) ?? "[]") as MarketAlert[];
  } catch {
    return [];
  }
}

export async function listAlerts(): Promise<MarketAlert[]> {
  const sb = getSupabase();
  const since = new Date(Date.now() - 72 * 3600_000).toISOString();
  if (sb) {
    const { data, error } = await sb.from("alerts").select("*").gt("created_at", since).order("created_at", { ascending: false }).limit(10);
    if (error) throw new Error(error.message);
    return (data as Array<{ id: string; tipo: AlertKind; titulo: string; mensagem: string; created_at: string }>).map((r) => ({ id: r.id, tipo: r.tipo, titulo: r.titulo, mensagem: r.mensagem, criadoEm: r.created_at }));
  }
  return readLocal().filter((a) => a.criadoEm > since);
}

export async function createAlert(a: Omit<MarketAlert, "id" | "criadoEm">) {
  const sb = getSupabase();
  if (sb) {
    const { error } = await sb.from("alerts").insert(a);
    if (error) throw new Error(error.message);
  } else {
    const list = readLocal();
    list.unshift({ ...a, id: `${Date.now()}`, criadoEm: new Date().toISOString() });
    localStorage.setItem(LS, JSON.stringify(list.slice(0, 30)));
  }
  window.dispatchEvent(new Event("cfc-alerts"));
}

export async function deleteAlert(id: string) {
  const sb = getSupabase();
  if (sb) {
    const { error } = await sb.from("alerts").delete().eq("id", id);
    if (error) throw new Error(error.message);
  } else {
    localStorage.setItem(LS, JSON.stringify(readLocal().filter((a) => a.id !== id)));
  }
  window.dispatchEvent(new Event("cfc-alerts"));
}

export function useAlerts() {
  const [alerts, setAlerts] = useState<MarketAlert[]>([]);
  const load = useCallback(() => {
    listAlerts().then(setAlerts).catch(() => setAlerts([]));
  }, []);
  useEffect(() => {
    load();
    window.addEventListener("cfc-alerts", load);
    return () => window.removeEventListener("cfc-alerts", load);
  }, [load]);
  return { alerts, reload: load };
}
