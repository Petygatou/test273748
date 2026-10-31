/**
 * Serviço do Cruzamento de Scout (somente servidor): carrega a temporada (atual ou
 * guardada) e monta o cruzamento por times da rodada.
 * As funções de servidor (fnsCruzamento.ts) só validam a entrada e chamam este módulo.
 */
import type { SetorTimes } from "../engine/cruzamento";
import type { CruzScout } from "../engine/scoutDefs";

export type PedidoTimes = { temporada?: number; rodada?: number; scout: CruzScout; setor: SetorTimes; recorte: number | null; lado: "mandantes" | "visitantes" };

/** Temporada pedida: a atual (da API ou importada) ou uma guardada no banco. */
export async function carregar(temporada?: number) {
  const { loadSeason } = await import("./season");
  const { data, meta } = await loadSeason();
  if (!temporada || temporada === data.temporada) return { data, atual: true, fonte: meta.source === "demo" ? "demonstração" : meta.importadoEm ? "temporada importada" : "API do Cartola" };
  const { temporadaGuardada } = await import("./scoutStore");
  const g = temporadaGuardada(temporada);
  if (!g) throw new Error(`A temporada ${temporada} não está guardada no banco.`);
  return { data: { ...g, rodadaAtual: g.rodadaFinal + 1, mercadoStatus: 6, source: "cartola" as const, updatedAt: "" }, atual: false, fonte: "histórico guardado" };
}

type Dados = Awaited<ReturnType<typeof carregar>>["data"];
const versao = (d: Dados) => `${d.temporada}:${d.rodadaAtual}:${d.history.length}:${Object.keys(d.ladosJogo ?? {}).length}`;

async function baseDe(d: Dados, rodada: number) {
  const { cached } = await import("./cache");
  const { prepararBase } = await import("../engine/cruzamento");
  return cached(`cruz:base:${versao(d)}:${rodada}`, 10 * 60_000, async () => prepararBase(d, rodada));
}

function rodadaValida(d: Dados, atual: boolean, pedida?: number) {
  const max = atual ? d.rodadaAtual : d.rodadaAtual - 1;
  if (!pedida) return atual ? d.rodadaAtual : max;
  return Math.min(Math.max(2, pedida), max);
}

/** Opções dos filtros e situação dos dados. */
export async function opcoes(q: { temporada?: number }) {
  const { data: d, atual, fonte } = await carregar(q.temporada);
  const { statusDados, temporadasGuardadas } = await import("./scoutStore");
  const temporadas = [...new Set([d.temporada, ...temporadasGuardadas().map((t) => t.temporada)])].sort((a, b) => b - a);
  return {
    temporada: d.temporada,
    atual,
    fonte,
    demo: "source" in d && d.source === "demo",
    temporadas,
    rodadaAtual: d.rodadaAtual,
    rodadaPadrao: rodadaValida(d, atual),
    clubes: Object.values(d.clubs).map((c) => ({ id: c.id, nome: c.nome, abreviacao: c.abreviacao, escudo: c.escudo })),
    status: statusDados(d.temporada, d.rodadaAtual, fonte),
    historicoRodadas: [...new Set(d.history.map((h) => h.rodada))].length,
  };
}

/** Relê a temporada agora (rodadas não congeladas são pedidas de novo e comparadas). */
export async function sincronizar() {
  const t0 = Date.now();
  const { invalidate } = await import("./cache");
  invalidate("cartola:pontuados");
  invalidate("cartola:partidas");
  invalidate("cruz:");
  const { refreshSeason } = await import("./season");
  const { statusDados, registrarErroFonte } = await import("./scoutStore");
  try {
    const { data } = await refreshSeason();
    if (data.source === "demo") return { ok: true, ms: Date.now() - t0, aviso: "Modo demonstração: nada é guardado (o banco só recebe dados reais do Cartola)." };
    return { ok: true, ms: Date.now() - t0, status: statusDados(data.temporada, data.rodadaAtual, "API do Cartola") };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    registrarErroFonte("Cartola API", msg);
    return { ok: false, ms: Date.now() - t0, erro: msg };
  }
}

/** Cruzamento por times: cada jogo da rodada, conquistado × cedido. */
export async function times(q: PedidoTimes) {
  const { data: d, atual } = await carregar(q.temporada);
  const rodada = rodadaValida(d, atual, q.rodada);
  const base = await baseDe(d, rodada);
  const { cruzarTimes } = await import("../engine/cruzamento");
  const passada = rodada < d.rodadaAtual;
  const linhas = cruzarTimes(base, q, passada ? d.history.filter((h) => h.rodada === rodada) : undefined);
  const nomes: Record<number, string> = {};
  const porId = new Map(d.athletes.map((a) => [a.id, a.apelido] as const));
  for (const l of linhas) for (const j of [...l.conquistado.lista, ...l.cedido.lista]) for (const a of j.atletas) nomes[a.atletaId] = porId.get(a.atletaId) ?? `Atleta ${a.atletaId}`;
  const partidas = d.matches
    .filter((m) => m.rodada === rodada)
    .map((m) => ({ matchId: m.id, casaId: m.casaId, foraId: m.foraId, data: m.data ?? null, golsCasa: m.golsCasa ?? null, golsFora: m.golsFora ?? null }));
  // quanto das atuações de laterais tem o lado (LE/LD) conhecido: sem isso o filtro por lado fica incompleto
  const lat = base.linhas.filter((l) => l.pos === 2);
  const ladosCobertura = lat.length ? Math.round((lat.filter((l) => l.lado).length / lat.length) * 1000) / 1000 : 0;
  return { rodada, passada, rodadaAtual: d.rodadaAtual, partidas, linhas, nomes, ladosCobertura, geradoEm: new Date().toISOString() };
}
