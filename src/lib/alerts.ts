/** Alertas de mercado publicados pelo Painel ADM (servidor + tempo real). */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createAlertFn, deleteAlertFn, fetchAlerts } from "../server/fnsConta";
import { useRealtime } from "./realtime";

export type AlertKind = "fechamento" | "lesao" | "desfalque" | "geral";

export interface MarketAlert {
  id: string;
  tipo: AlertKind;
  titulo: string;
  mensagem: string;
  criadoEm: string;
}

export async function createAlert(a: Omit<MarketAlert, "id" | "criadoEm">) {
  await createAlertFn({ data: a });
}

export async function deleteAlert(id: string) {
  await deleteAlertFn({ data: { id } });
}

export function useAlerts() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["alerts"], queryFn: () => fetchAlerts(), staleTime: 60_000 });
  useRealtime(["alerts"], () => void qc.invalidateQueries({ queryKey: ["alerts"] }));
  return { alerts: (q.data ?? []) as MarketAlert[], reload: () => q.refetch() };
}
