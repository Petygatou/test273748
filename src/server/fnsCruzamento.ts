/**
 * Funções de servidor do Cruzamento de Scout. Validam a entrada e chamam o serviço
 * (cruzamentoServico.ts), que roda só no servidor; o navegador recebe só o resultado.
 */
import { createServerFn } from "@tanstack/react-start";
import type { CriterioRanking, FiltroMando, Janela } from "../engine/cruzamento";
import type { PositionId } from "../engine/rules";
import type { CruzScout } from "../engine/scoutDefs";

const JANELAS = [3, 5, 10] as const;
const CODIGOS = ["G", "A", "GA", "FIN", "FD", "FF", "FT", "FS", "PS", "DS", "SG", "DE", "DP", "GS", "FC", "CA", "CV", "I", "PC", "PP", "GC", "V"] as const;

function lerComum(d: Record<string, unknown> | undefined) {
  const int = (v: unknown) => (v != null && v !== "" && Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : undefined);
  const j = Number(d?.janela);
  return {
    temporada: int(d?.temporada),
    rodada: int(d?.rodada),
    janela: (JANELAS as readonly number[]).includes(j) ? (j as Janela) : null,
    mando: (d?.mando === "casa" || d?.mando === "fora" ? d.mando : "todos") as FiltroMando,
    adversarioId: int(d?.adversarioId),
    mandoConfronto: d?.mandoConfronto === "casa" || d?.mandoConfronto === "fora" ? (d.mandoConfronto as "casa" | "fora") : undefined,
  };
}

/** Opções dos filtros, situação dos dados, cadastro de scouts e conferência do modelo. */
export const fetchCruzamentoOpcoes = createServerFn({ method: "GET" })
  .validator((d: { temporada?: unknown } | undefined) => ({ temporada: Number.isInteger(Number(d?.temporada)) ? Number(d?.temporada) : undefined }))
  .handler(async ({ data }) => (await import("./cruzamentoServico")).opcoes(data));

/** Ranking de oportunidades para a rodada escolhida. */
export const fetchCruzamentoRanking = createServerFn({ method: "GET" })
  .validator((d: Record<string, unknown> | undefined) => {
    const pos = Number(d?.posicao);
    return {
      ...lerComum(d),
      scout: (CODIGOS as readonly string[]).includes(String(d?.scout)) ? (d!.scout as CruzScout) : ("FIN" as CruzScout),
      limiar: Math.min(10, Math.max(1, Number(d?.limiar) || 1)),
      posicao: pos >= 1 && pos <= 6 ? (pos as PositionId) : undefined,
      clubeId: Number(d?.clubeId) > 0 ? Number(d?.clubeId) : undefined,
      somenteProvaveis: d?.somenteProvaveis === true || d?.somenteProvaveis === "1",
    };
  })
  .handler(async ({ data }) => (await import("./cruzamentoServico")).ranking(data));

/** Análise completa de um atleta. */
export const fetchCruzamentoAtleta = createServerFn({ method: "GET" })
  .validator((d: Record<string, unknown> | undefined) => {
    const id = Number(d?.atletaId);
    if (!Number.isInteger(id) || id <= 0) throw new Error("Atleta inválido.");
    return { ...lerComum(d), atletaId: id };
  })
  .handler(async ({ data }) => (await import("./cruzamentoServico")).atleta(data));

/** ADM: chama cada endpoint do Cartola agora e confere os campos. */
export const verificarFontesCruzamento = createServerFn({ method: "POST" }).handler(async () => {
  const { requireAdmin } = await import("./auth");
  requireAdmin();
  const { verificarEndpoints } = await import("./fontesCartola");
  return verificarEndpoints();
});

/** ADM: relê a temporada agora (rodadas não congeladas são pedidas de novo e comparadas). */
export const sincronizarScoutsAgora = createServerFn({ method: "POST" }).handler(async () => {
  const { requireAdmin } = await import("./auth");
  requireAdmin();
  return (await import("./cruzamentoServico")).sincronizar();
});

/** ADM: últimas sincronizações, revisões, verificações e erros. */
export const fetchSyncLogs = createServerFn({ method: "GET" }).handler(async () => {
  const { requireAdmin } = await import("./auth");
  requireAdmin();
  const { logsRecentes } = await import("./scoutStore");
  return logsRecentes(60);
});

export type CruzamentoOpcoes = Awaited<ReturnType<typeof fetchCruzamentoOpcoes>>;
export type CruzamentoRanking = Awaited<ReturnType<typeof fetchCruzamentoRanking>>;
export type CruzamentoAtleta = Awaited<ReturnType<typeof fetchCruzamentoAtleta>>;
export type { CriterioRanking };
