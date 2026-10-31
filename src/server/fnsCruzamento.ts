/**
 * Funções de servidor do Cruzamento de Scout. Validam a entrada e chamam o serviço
 * (cruzamentoServico.ts), que roda só no servidor; o navegador recebe só o resultado.
 */
import { createServerFn } from "@tanstack/react-start";
import type { SetorTimes } from "../engine/cruzamento";
import type { CruzScout } from "../engine/scoutDefs";

const CODIGOS = ["G", "A", "GA", "FIN", "FD", "FF", "FT", "FS", "PS", "DS", "SG", "DE", "DP", "GS", "FC", "CA", "CV", "I", "PC", "PP", "GC", "V"] as const;

/** Opções dos filtros e situação dos dados. */
export const fetchCruzamentoOpcoes = createServerFn({ method: "GET" })
  .validator((d: { temporada?: unknown } | undefined) => ({ temporada: Number.isInteger(Number(d?.temporada)) ? Number(d?.temporada) : undefined }))
  .handler(async ({ data }) => (await import("./cruzamentoServico")).opcoes(data));

/** Cruzamento por times: para cada jogo da rodada, conquistado (time analisado) × cedido (adversário). */
export const fetchCruzamentoTimes = createServerFn({ method: "GET" })
  .validator((d: Record<string, unknown> | undefined) => {
    const int = (v: unknown) => (v != null && v !== "" && Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : undefined);
    const setor = String(d?.setor ?? "5");
    const recorte = Number(d?.recorte);
    return {
      temporada: int(d?.temporada),
      rodada: int(d?.rodada),
      scout: (CODIGOS as readonly string[]).includes(String(d?.scout)) ? (d!.scout as CruzScout) : ("G" as CruzScout),
      setor: (setor === "time" || setor === "LE" || setor === "LD" ? setor : ["1", "2", "3", "4", "5"].includes(setor) ? Number(setor) : 5) as SetorTimes,
      recorte: recorte === 3 || recorte === 5 || recorte === 10 ? recorte : null,
      lado: (d?.lado === "visitantes" ? "visitantes" : "mandantes") as "mandantes" | "visitantes",
    };
  })
  .handler(async ({ data }) => (await import("./cruzamentoServico")).times(data));

const inteiro = (v: unknown) => (v != null && v !== "" && Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : undefined);
const recorteDe = (v: unknown) => (Number(v) === 3 || Number(v) === 5 || Number(v) === 10 ? Number(v) : null);

/** Conquistado × cedido por posição: cada jogo da rodada, média por atuação de cada posição. */
export const fetchConquistaCede = createServerFn({ method: "GET" })
  .validator((d: Record<string, unknown> | undefined) => ({ temporada: inteiro(d?.temporada), rodada: inteiro(d?.rodada), recorte: recorteDe(d?.recorte) }))
  .handler(async ({ data }) => (await import("./cruzamentoServico")).posicoes(data));

/** Jogo a jogo de uma partida da tabela por posição (cada atuação que entrou na conta). */
export const fetchConquistaCedeDetalhe = createServerFn({ method: "GET" })
  .validator((d: Record<string, unknown> | undefined) => ({
    temporada: inteiro(d?.temporada),
    rodada: inteiro(d?.rodada),
    recorte: recorteDe(d?.recorte),
    matchId: inteiro(d?.matchId) ?? 0,
    tabela: (d?.tabela === "visitantes" ? "visitantes" : "mandantes") as "mandantes" | "visitantes",
  }))
  .handler(async ({ data }) => (await import("./cruzamentoServico")).posicoesDetalhe(data));

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
export type CruzamentoTimes = Awaited<ReturnType<typeof fetchCruzamentoTimes>>;
export type ConquistaCede = Awaited<ReturnType<typeof fetchConquistaCede>>;
export type ConquistaCedeDetalhe = Awaited<ReturnType<typeof fetchConquistaCedeDetalhe>>;
