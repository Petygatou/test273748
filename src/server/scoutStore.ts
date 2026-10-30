/**
 * Histórico de scouts guardado no banco do site (somente servidor).
 *
 * A API do Cartola só serve a temporada em andamento e cada rodada passada tem de ser
 * pedida de novo a cada carga. Aqui cada rodada encerrada vira uma linha no banco:
 *
 *   scout-rodadas  (partidas + scouts de cada atleta por jogo; uma linha por rodada)
 *   scout-atletas  (cadastro de atletas por temporada: nome, clube, posição, status)
 *   sync-logs      (cada sincronização, revisão, verificação de fontes e erro)
 *
 * O cadastro dos scouts (código, nome, categoria, posições, pontos) fica em código,
 * versionado: src/engine/scoutDefs.ts.
 *
 * Sincronização idempotente: o conteúdo de cada rodada tem uma impressão digital
 * (hash). Mesma impressão → nada é gravado; mudou → grava e conta uma revisão (a Globo
 * às vezes corrige scouts dias depois). Rodada "congelada" (todos os jogos encerrados
 * há mais de 5 dias) passa a ser lida do banco, sem pedir de novo à API.
 */
import { SCOUT_KEYS, pointsFromScouts, type PositionId, type ScoutKey, type Scouts } from "../engine/rules";
import type { Athlete, Club, Match, PlayerRound, SeasonData } from "../engine/types";
import { db, newId } from "./db";

export type StatusPartida = "encerrada" | "em-andamento" | "futura" | "sem-placar";

export interface PartidaGuardada {
  id: number;
  casaId: number;
  foraId: number;
  golsCasa: number | null;
  golsFora: number | null;
  data?: string;
  valida: boolean;
  status: StatusPartida;
}

/** [atletaId, clubeId, posicaoId, pontos, scouts "G1 FD2"] */
export type AtuacaoGuardada = [number, number, number, number, string];

export interface RodadaScoutRow {
  id: string; // temporada:rodada
  temporada: number;
  rodada: number;
  fonte: "cartola" | "importada";
  coletadoEm: string;
  atualizadoEm: string;
  verificadoEm: string;
  hash: string;
  /** quantas vezes o conteúdo mudou depois da primeira coleta */
  revisao: number;
  congelada: boolean;
  partidas: PartidaGuardada[];
  atletas: AtuacaoGuardada[];
  /** atuações cujos pontos recalculados pelos scouts batem com os oficiais */
  validacao: { linhas: number; batem: number };
}

export interface AtletaScoutRow {
  id: string; // temporada:atletaId
  temporada: number;
  atletaId: number;
  apelido: string;
  nome?: string;
  clubeId: number;
  posicaoId: number;
  statusId: number;
  atualizadoEm: string;
}

/** Clubes e última rodada de cada temporada guardada. */
export interface TemporadaScoutRow {
  id: string; // temporada
  temporada: number;
  clubes: Record<number, Club>;
  atualizadoEm: string;
}

export interface SyncLogRow {
  id: string;
  em: string;
  fonte: string;
  operacao: "sincronizacao" | "revisao" | "verificacao" | "erro";
  resultado: "ok" | "sem-mudanca" | "parcial" | "erro";
  registros: number;
  novos: number;
  revisados: number;
  mensagem?: string;
  duracaoMs?: number;
}

const DIA = 86400_000;
const CONGELA_APOS_MS = 5 * DIA;
const MAX_LOGS = 300;

/* ------------------------------ codificação ------------------------------ */

export function codificarScouts(s: Scouts): string {
  return SCOUT_KEYS.filter((k) => (s[k] ?? 0) !== 0)
    .map((k) => `${k}${s[k]}`)
    .join(" ");
}

export function decodificarScouts(txt: string): Scouts {
  const out: Scouts = {};
  for (const part of txt.split(" ")) {
    const m = part.match(/^([A-Z]+)(-?\d+(?:\.\d+)?)$/);
    if (m && (SCOUT_KEYS as readonly string[]).includes(m[1])) out[m[1] as ScoutKey] = Number(m[2]);
  }
  return out;
}

function hashTexto(t: string): string {
  // FNV-1a 32 bits, duas passadas com sementes diferentes (colisão desprezível aqui)
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < t.length; i++) {
    const c = t.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x5bd1e995);
  }
  return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36);
}

export function statusPartida(m: Match, rodadaAtual: number, agora = Date.now()): StatusPartida {
  if (m.golsCasa != null && m.golsFora != null) return m.rodada < rodadaAtual ? "encerrada" : "em-andamento";
  const t = m.data ? new Date(m.data).getTime() : NaN;
  if (m.rodada >= rodadaAtual || (Number.isFinite(t) && t > agora)) return "futura";
  return "sem-placar";
}

/* ------------------------------ gravação ------------------------------ */

export interface ResumoSincronizacao {
  novos: number;
  revisados: number;
  iguais: number;
  atletas: number;
}

/**
 * Guarda as rodadas encerradas da temporada (só dados reais). Idempotente: rodada com o
 * mesmo conteúdo não é regravada; conteúdo novo conta como revisão e vai para o log.
 */
export function registrarTemporada(data: SeasonData, fonte: RodadaScoutRow["fonte"], agora = Date.now()): ResumoSincronizacao {
  if (data.source !== "cartola") return { novos: 0, revisados: 0, iguais: 0, atletas: 0 };
  const t0 = Date.now();
  const iso = new Date(agora).toISOString();
  const porRodada = new Map<number, PlayerRound[]>();
  for (const h of data.history) {
    if (h.rodada >= data.rodadaAtual) continue; // nada de parcial
    const l = porRodada.get(h.rodada) ?? [];
    l.push(h);
    porRodada.set(h.rodada, l);
  }
  const resumo: ResumoSincronizacao = { novos: 0, revisados: 0, iguais: 0, atletas: 0 };
  const revisadas: number[] = [];
  const parciais: number[] = [];
  for (let r = 1; r < data.rodadaAtual; r++) {
    const linhas = porRodada.get(r) ?? [];
    const partidas = data.matches
      .filter((m) => m.rodada === r)
      .map((m) => ({
        id: m.id,
        casaId: m.casaId,
        foraId: m.foraId,
        golsCasa: m.golsCasa ?? null,
        golsFora: m.golsFora ?? null,
        data: m.data,
        valida: m.valida,
        status: statusPartida(m, data.rodadaAtual, agora),
      }))
      .sort((a, b) => a.id - b.id);
    // rodada sem atuações = a API falhou nela agora: nunca apaga o que já está guardado
    if (!linhas.length) continue;
    const atletas: AtuacaoGuardada[] = linhas
      .map((h) => [h.atletaId, h.clubeId, h.posicaoId, Math.round(h.pontos * 100) / 100, codificarScouts(h.scout)] as AtuacaoGuardada)
      .sort((a, b) => a[0] - b[0]);
    const hash = hashTexto(JSON.stringify([partidas.map((p) => [p.id, p.casaId, p.foraId, p.golsCasa, p.golsFora, p.valida]), atletas]));
    const ultimoJogo = Math.max(0, ...partidas.map((p) => (p.data ? new Date(p.data).getTime() : 0)));
    const encerradas = partidas.length > 0 && partidas.every((p) => p.status === "encerrada" || !p.valida);
    const congelada = encerradas && ultimoJogo > 0 && agora - ultimoJogo > CONGELA_APOS_MS;
    const id = `${data.temporada}:${r}`;
    const atual = db.scoutRodadas.get(id);
    const validacao = { linhas: 0, batem: 0 };
    for (const h of linhas) {
      if (h.posicaoId === 6) continue;
      validacao.linhas++;
      if (Math.abs(pointsFromScouts(h.scout) - h.pontos) < 0.051) validacao.batem++;
    }
    // resposta bem menor que a guardada: provável resposta parcial da fonte, não revisão
    if (atual && atletas.length < atual.atletas.length * 0.9) {
      parciais.push(r);
      continue;
    }
    if (atual && atual.hash === hash) {
      resumo.iguais++;
      // só marca a verificação de vez em quando (cada gravação vai para todas as instâncias)
      if (atual.congelada !== congelada || agora - new Date(atual.verificadoEm).getTime() > 6 * 3600_000) db.scoutRodadas.update(id, { verificadoEm: iso, congelada });
      continue;
    }
    db.scoutRodadas.put({
      id,
      temporada: data.temporada,
      rodada: r,
      fonte,
      coletadoEm: atual?.coletadoEm ?? iso,
      atualizadoEm: iso,
      verificadoEm: iso,
      hash,
      revisao: atual ? atual.revisao + 1 : 0,
      congelada,
      partidas,
      atletas,
      validacao,
    });
    if (atual) {
      resumo.revisados++;
      revisadas.push(r);
    } else resumo.novos++;
  }
  // clubes da temporada (nomes e escudos para quando a API já estiver em outra temporada)
  const tid = String(data.temporada);
  const clubesAntes = db.scoutTemporadas.get(tid);
  if (!clubesAntes || JSON.stringify(clubesAntes.clubes) !== JSON.stringify(data.clubs)) db.scoutTemporadas.put({ id: tid, temporada: data.temporada, clubes: data.clubs, atualizadoEm: iso });
  // cadastro de atletas da temporada (só grava quem mudou)
  for (const a of data.athletes) {
    const id = `${data.temporada}:${a.id}`;
    const cur = db.scoutAtletas.get(id);
    if (cur && cur.apelido === a.apelido && cur.clubeId === a.clubeId && cur.posicaoId === a.posicaoId && cur.statusId === a.statusId) continue;
    db.scoutAtletas.put({ id, temporada: data.temporada, atletaId: a.id, apelido: a.apelido, nome: a.nome, clubeId: a.clubeId, posicaoId: a.posicaoId, statusId: a.statusId, atualizadoEm: iso });
    resumo.atletas++;
  }
  if (parciais.length)
    registrarErroFonte(
      fonte === "cartola" ? "Cartola /atletas/pontuados" : "Temporada importada",
      `Resposta com menos atletas que a versão guardada nas rodadas ${parciais.join(", ")}; a versão guardada foi mantida.`,
      agora,
    );
  if (resumo.novos || resumo.revisados) {
    registrarLog({
      fonte: fonte === "cartola" ? "Cartola /atletas/pontuados e /partidas" : "Temporada importada",
      operacao: resumo.revisados && !resumo.novos ? "revisao" : "sincronizacao",
      resultado: "ok",
      registros: resumo.novos + resumo.revisados,
      novos: resumo.novos,
      revisados: resumo.revisados,
      mensagem: revisadas.length ? `Rodadas com scouts corrigidos pela fonte: ${revisadas.join(", ")}` : undefined,
      duracaoMs: Date.now() - t0,
    });
  }
  return resumo;
}

export function registrarLog(l: Omit<SyncLogRow, "id" | "em"> & { em?: string }) {
  const row: SyncLogRow = { id: newId(), em: l.em ?? new Date().toISOString(), ...l };
  db.syncLogs.put(row);
  const todos = db.syncLogs.all();
  if (todos.length > MAX_LOGS) for (const velho of todos.sort((a, b) => b.em.localeCompare(a.em)).slice(MAX_LOGS)) db.syncLogs.remove(velho.id);
  return row;
}

/** Erro de uma fonte: grava no log, sem repetir o mesmo erro mais de uma vez por hora. */
export function registrarErroFonte(fonte: string, mensagem: string, agora = Date.now()) {
  const ultimo = db.syncLogs.filter((l) => l.fonte === fonte && l.operacao === "erro").sort((a, b) => b.em.localeCompare(a.em))[0];
  if (ultimo && ultimo.mensagem === mensagem && agora - new Date(ultimo.em).getTime() < 3600_000) return;
  registrarLog({ fonte, operacao: "erro", resultado: "erro", registros: 0, novos: 0, revisados: 0, mensagem: mensagem.slice(0, 300), em: new Date(agora).toISOString() });
}

export function logsRecentes(n = 40): SyncLogRow[] {
  return db.syncLogs
    .all()
    .sort((a, b) => b.em.localeCompare(a.em))
    .slice(0, n);
}

/* ------------------------------ leitura ------------------------------ */

function paraPartidas(row: RodadaScoutRow): Match[] {
  return row.partidas.map((p) => ({ id: p.id, rodada: row.rodada, casaId: p.casaId, foraId: p.foraId, golsCasa: p.golsCasa, golsFora: p.golsFora, data: p.data, valida: p.valida }));
}

function paraHistorico(row: RodadaScoutRow): PlayerRound[] {
  return row.atletas.map(([atletaId, clubeId, posicaoId, pontos, sc]) => ({ atletaId, rodada: row.rodada, clubeId, posicaoId: posicaoId as PositionId, pontos, scout: decodificarScouts(sc) }));
}

/** Uma rodada guardada (qualquer estado), para quando a API falha nela. */
export function rodadaGuardada(temporada: number, rodada: number): PlayerRound[] | null {
  const row = db.scoutRodadas.get(`${temporada}:${rodada}`);
  return row?.atletas.length ? paraHistorico(row) : null;
}

/** Rodadas congeladas da temporada: lidas do banco em vez de pedidas de novo à API. */
export function rodadasCongeladas(temporada: number): Map<number, { partidas: Match[]; historico: PlayerRound[] }> {
  const out = new Map<number, { partidas: Match[]; historico: PlayerRound[] }>();
  for (const row of db.scoutRodadas.all()) {
    if (row.temporada !== temporada || !row.congelada || !row.atletas.length) continue;
    out.set(row.rodada, { partidas: paraPartidas(row), historico: paraHistorico(row) });
  }
  return out;
}

export function temporadasGuardadas(): Array<{ temporada: number; rodadas: number; ultimaRodada: number }> {
  const m = new Map<number, { rodadas: number; ultimaRodada: number }>();
  for (const r of db.scoutRodadas.all()) {
    const x = m.get(r.temporada) ?? { rodadas: 0, ultimaRodada: 0 };
    x.rodadas++;
    x.ultimaRodada = Math.max(x.ultimaRodada, r.rodada);
    m.set(r.temporada, x);
  }
  return [...m.entries()].map(([temporada, x]) => ({ temporada, ...x })).sort((a, b) => b.temporada - a.temporada);
}

/** Temporada guardada (uma que a API não serve mais): histórico, partidas e atletas. */
export function temporadaGuardada(temporada: number): (Pick<SeasonData, "temporada" | "history" | "matches" | "athletes" | "clubs"> & { rodadaFinal: number }) | null {
  const rows = db.scoutRodadas.filter((r) => r.temporada === temporada).sort((a, b) => a.rodada - b.rodada);
  if (!rows.length) return null;
  const history = rows.flatMap(paraHistorico);
  const matches = rows.flatMap(paraPartidas);
  const atletas = new Map<number, Athlete>();
  for (const a of db.scoutAtletas.filter((x) => x.temporada === temporada))
    atletas.set(a.atletaId, {
      id: a.atletaId,
      apelido: a.apelido,
      nome: a.nome,
      clubeId: a.clubeId,
      posicaoId: a.posicaoId as PositionId,
      statusId: a.statusId,
      preco: 0,
      variacao: 0,
      media: 0,
      jogos: 0,
      pontosUltima: 0,
    });
  // atleta sem cadastro (saiu do mercado): usa o último clube/posição vistos no histórico
  for (const h of history)
    if (!atletas.has(h.atletaId))
      atletas.set(h.atletaId, { id: h.atletaId, apelido: `Atleta ${h.atletaId}`, clubeId: h.clubeId, posicaoId: h.posicaoId, statusId: 0, preco: 0, variacao: 0, media: 0, jogos: 0, pontosUltima: 0 });
  return { temporada, history, matches, athletes: [...atletas.values()], clubs: db.scoutTemporadas.get(String(temporada))?.clubes ?? {}, rodadaFinal: rows[rows.length - 1].rodada };
}

export type EstadoDados = "atualizado" | "desatualizado" | "indisponivel";

export interface StatusDados {
  estado: EstadoDados;
  fonte: string;
  temporada: number;
  rodadasEsperadas: number;
  rodadasGuardadas: number;
  lacunas: number[];
  /** rodadas em que os scouts foram corrigidos pela fonte depois da primeira coleta */
  revisoes: number;
  ultimaVerificacao: string | null;
  ultimaMudanca: string | null;
  /** atuações em que os pontos recalculados batem com os oficiais */
  validacao: { linhas: number; batem: number };
  ultimoErro: { em: string; mensagem: string } | null;
  explicacao: string;
}

/** Situação do histórico guardado de uma temporada (para o indicador da tela). */
export function statusDados(temporada: number, rodadaAtual: number, fonteAtual: string, agora = Date.now()): StatusDados {
  const rows = db.scoutRodadas.filter((r) => r.temporada === temporada);
  const guardadas = new Set(rows.filter((r) => r.atletas.length).map((r) => r.rodada));
  const lacunas: number[] = [];
  for (let r = 1; r < rodadaAtual; r++) if (!guardadas.has(r)) lacunas.push(r);
  const ultimaVerificacao = rows.reduce<string | null>((m, r) => (!m || r.verificadoEm > m ? r.verificadoEm : m), null);
  const ultimaMudanca = rows.reduce<string | null>((m, r) => (!m || r.atualizadoEm > m ? r.atualizadoEm : m), null);
  const erro = db.syncLogs.filter((l) => l.operacao === "erro").sort((a, b) => b.em.localeCompare(a.em))[0];
  const validacao = rows.reduce((s, r) => ({ linhas: s.linhas + r.validacao.linhas, batem: s.batem + r.validacao.batem }), { linhas: 0, batem: 0 });
  const recente = ultimaVerificacao && agora - new Date(ultimaVerificacao).getTime() < 12 * 3600_000;
  const erroRecente = erro && (!ultimaVerificacao || erro.em > ultimaVerificacao);
  const estado: EstadoDados = !guardadas.size ? "indisponivel" : lacunas.length || !recente || erroRecente ? "desatualizado" : "atualizado";
  const explicacao =
    estado === "indisponivel"
      ? "Nenhuma rodada guardada ainda: a análise usa o que a API respondeu agora (se respondeu)."
      : estado === "atualizado"
        ? `Rodadas 1 a ${rodadaAtual - 1} guardadas e conferidas com a fonte nas últimas 12 horas.`
        : lacunas.length
          ? `Faltam as rodadas ${lacunas.join(", ")}: as análises dessas rodadas ficam sem esses jogos.`
          : erroRecente
            ? "A última tentativa de atualizar falhou; os números usam a última versão guardada."
            : "A última conferência com a fonte tem mais de 12 horas.";
  return {
    estado,
    fonte: fonteAtual,
    temporada,
    rodadasEsperadas: Math.max(0, rodadaAtual - 1),
    rodadasGuardadas: guardadas.size,
    lacunas,
    revisoes: rows.reduce((s, r) => s + r.revisao, 0),
    ultimaVerificacao,
    ultimaMudanca,
    validacao,
    ultimoErro: erro ? { em: erro.em, mensagem: erro.mensagem ?? "" } : null,
    explicacao,
  };
}
