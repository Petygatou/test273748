/**
 * Avisos de login em aparelho novo, para administradores: a lista vem do servidor e o
 * "já vi" fica neste navegador. Atualiza na hora quando alguém entra (tempo real).
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { adminAvisosFn } from "../server/fnsConta";
import { useRealtime } from "./realtime";
import { KEYS, useLocal } from "./storage";

export function useAvisosAparelho(ativo: boolean) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-avisos"], queryFn: () => adminAvisosFn(), enabled: ativo, refetchInterval: 60_000, retry: false });
  useRealtime(["users"], () => {
    if (ativo) void qc.invalidateQueries({ queryKey: ["admin-avisos"] });
  });
  const [vistoEm, setVistoEm] = useLocal<string>(KEYS.avisosVistosEm, "");
  const avisos = q.data?.avisos ?? [];
  const naoVistos = avisos.filter((a) => !vistoEm || a.em > vistoEm);
  return {
    avisos,
    naoVistos,
    limite: q.data?.limite ?? 3,
    marcarVistos: () => setVistoEm(new Date().toISOString()),
    vistoEm,
  };
}
