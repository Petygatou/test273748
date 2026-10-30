/**
 * Serviço do Cruzamento de Scout (somente servidor): carrega a temporada (atual ou
 * guardada), confere a pontuação, calibra o modelo e monta ranking e fichas.
 * As funções de servidor (fnsCruzamento.ts) só validam a entrada e chamam este módulo.
 */
import type { FiltroMando, Janela } from "../engine/cruzamento";
import type { PositionId } from "../engine/rules";
import type { CruzScout } from "../engine/scoutDefs";

export type Comum = { temporada?: number; rodada?: number; janela: Janela; mando: FiltroMando; adversarioId?: number; mandoConfronto?: "casa" | "fora" };
export type PedidoRanking = Comum & { scout: CruzScout; limiar: number; posicao?: PositionId; clubeId?: number; somenteProvaveis: boolean };
export type PedidoAtleta = Comum & { atletaId: number };

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

/** Conferência da tabela de pontos e calibração (uma vez por versão dos dados). */
async function modelo(d: Dados) {
  const { cached } = await import("./cache");
  return cached(`cruz:modelo:${versao(d)}`, 6 * 3600_000, async () => {
    const { validateScoring } = await import("../engine/rulesCheck");
    const { conferirPontuacao, pontuacaoVigente } = await import("../engine/scoutDefs");
    const { calibrar } = await import("../engine/cruzamento");
    const conferencia = conferirPontuacao(d.history, validateScoring(d.history));
    const pontuacao = pontuacaoVigente(conferencia);
    await new Promise((r) => setImmediate(r));
    const calibracao = calibrar(d, pontuacao);
    return { conferencia, pontuacao, calibracao };
  });
}

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

/** Opções dos filtros, situação dos dados, cadastro de scouts e conferência do modelo. */
export async function opcoes(q: { temporada?: number }) {
  const { data: d, atual, fonte } = await carregar(q.temporada);
  const { statusDados, temporadasGuardadas } = await import("./scoutStore");
  const { modelo: m } = { modelo: await modelo(d) };
  const guardadas = temporadasGuardadas();
  const temporadas = [...new Set([d.temporada, ...guardadas.map((t) => t.temporada)])].sort((a, b) => b - a);
  const jogaram = new Set(d.history.map((h) => h.atletaId));
  return {
    temporada: d.temporada,
    atual,
    fonte,
    demo: "source" in d && d.source === "demo",
    temporadas,
    rodadaAtual: d.rodadaAtual,
    rodadaPadrao: rodadaValida(d, atual),
    clubes: Object.values(d.clubs).map((c) => ({ id: c.id, nome: c.nome, abreviacao: c.abreviacao, escudo: c.escudo })),
    atletas: d.athletes.filter((a) => jogaram.has(a.id)).map((a) => ({ id: a.id, apelido: a.apelido, clubeId: a.clubeId, posicaoId: a.posicaoId, statusId: a.statusId })),
    status: statusDados(d.temporada, atual ? d.rodadaAtual : d.rodadaAtual, fonte),
    conferencia: m.conferencia,
    calibracao: {
      ...m.calibracao,
      meiaVida: Number.isFinite(m.calibracao.meiaVida) ? m.calibracao.meiaVida : null,
      candidatos: m.calibracao.candidatos.map((c) => ({ ...c, meiaVida: Number.isFinite(c.meiaVida) ? c.meiaVida : null })),
    },
    historicoRodadas: [...new Set(d.history.map((h) => h.rodada))].length,
  };
}

/** Ranking de oportunidades para a rodada escolhida. */
export async function ranking(q: PedidoRanking) {
  const { data: d, atual } = await carregar(q.temporada);
  const rodada = rodadaValida(d, atual, q.rodada);
  const { cached } = await import("./cache");
  const chave = `cruz:rank:${versao(d)}:${rodada}:${q.janela}:${q.mando}:${q.scout}:${q.limiar}:${q.posicao ?? 0}:${q.clubeId ?? 0}:${q.adversarioId ?? 0}:${q.somenteProvaveis}`;
  return cached(chave, 10 * 60_000, async () => {
    const m = await modelo(d);
    const base = await baseDe(d, rodada);
    const { analisarAtleta, linhaRanking, confrontoDe, MEIA_VIDA_PADRAO } = await import("../engine/cruzamento");
    const meiaVida = m.calibracao.rodadas ? m.calibracao.meiaVida : MEIA_VIDA_PADRAO;
    // chance de jogar só existe para a rodada atual (do modelo de prováveis)
    let pJogar: Record<number, number> = {};
    if (atual && rodada === d.rodadaAtual) {
      const { loadAnalysis } = await import("./season");
      const { analysis } = await loadAnalysis();
      pJogar = Object.fromEntries(analysis.players.map((p) => [p.atletaId, Math.round(p.pJogar * 1000) / 1000]));
    }
    const passada = rodada < d.rodadaAtual;
    const realDe = new Map(d.history.filter((h) => h.rodada === rodada).map((h) => [h.atletaId, h] as const));
    const linhas = [];
    for (const a of d.athletes) {
      if (q.posicao ? a.posicaoId !== q.posicao : a.posicaoId === 6) continue;
      if (q.clubeId && a.clubeId !== q.clubeId) continue;
      if (!base.porAtleta.get(a.id)?.length) continue;
      if (q.adversarioId && confrontoDe(base, a.clubeId, {})?.adversarioId !== q.adversarioId) continue;
      if (q.somenteProvaveis && !passada && (pJogar[a.id] ?? 0) < 0.5) continue;
      const an = analisarAtleta(
        base,
        { id: a.id, apelido: a.apelido, clubeId: a.clubeId, posicaoId: a.posicaoId },
        { janela: q.janela, mando: q.mando, meiaVida, pontuacao: m.pontuacao, leve: true, simulacoes: 0, scoutsDetalhe: [] },
        passada ? (realDe.get(a.id) ?? null) : undefined,
      );
      if (!an.confronto) continue;
      linhas.push({ ...linhaRanking(an, q.scout, q.limiar), pJogar: pJogar[a.id] ?? null, statusId: a.statusId });
    }
    linhas.sort((x, y) => (y.esperado ?? -99) - (x.esperado ?? -99));
    return { rodada, passada, meiaVida: Number.isFinite(meiaVida) ? meiaVida : null, geradoEm: new Date().toISOString(), linhas: linhas.slice(0, 400), total: linhas.length };
  });
}

/** Análise completa de um atleta. */
export async function atleta(q: PedidoAtleta) {
  const { data: d, atual } = await carregar(q.temporada);
  const rodada = rodadaValida(d, atual, q.rodada);
  const a = d.athletes.find((x) => x.id === q.atletaId);
  if (!a) throw new Error("Atleta não encontrado nesta temporada.");
  const m = await modelo(d);
  const base = await baseDe(d, rodada);
  const { analisarAtleta, liga, MEIA_VIDA_PADRAO } = await import("../engine/cruzamento");
  const meiaVida = m.calibracao.rodadas ? m.calibracao.meiaVida : MEIA_VIDA_PADRAO;
  const passada = rodada < d.rodadaAtual;
  const realRow = passada ? (d.history.find((h) => h.rodada === rodada && h.atletaId === a.id) ?? null) : undefined;
  const an = analisarAtleta(
    base,
    { id: a.id, apelido: a.apelido, clubeId: a.clubeId, posicaoId: a.posicaoId },
    { janela: q.janela, mando: q.mando, meiaVida, pontuacao: m.pontuacao, adversarioId: q.adversarioId, mandoConfronto: q.mandoConfronto, simulacoes: 4000 },
    realRow,
  );
  let pJogar: number | null = null;
  if (atual && rodada === d.rodadaAtual) {
    const { loadAnalysis } = await import("./season");
    pJogar = (await loadAnalysis()).analysis.players.find((p) => p.atletaId === a.id)?.pJogar ?? null;
  }
  // média da posição por scout (para o gráfico jogador × liga × adversário)
  const mediasPosicao = Object.fromEntries(an.scouts.map((s) => [s.codigo, Math.round(liga(base, a.posicaoId, s.codigo).mu * 1000) / 1000]));
  return { ...an, rodada, passada, pJogar, statusId: a.statusId, mediasPosicao, meiaVida: Number.isFinite(meiaVida) ? meiaVida : null, pontuacao: m.pontuacao, geradoEm: new Date().toISOString() };
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
