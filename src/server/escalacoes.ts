/**
 * Escalações OFICIAIS perto do jogo (somente servidor).
 *
 * Os clubes entregam a súmula cerca de 1 hora antes da bola. A API do Cartola
 * não traz isso; aqui usamos a API-Football (api-sports.io), que publica as
 * escalações do Brasileirão (liga 71) assim que saem. Com a lista oficial na
 * mão, cada atleta vira titular, reserva ou fora: é a informação que leva o
 * acerto das prováveis para perto de 100% nos minutos antes do jogo.
 *
 * Ligue com API_FOOTBALL_KEY. Sem a chave este módulo não faz nada.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Athlete, Club, LineupOverride } from "../engine/types";
import { dataDir } from "./db";

const BASE = process.env.API_FOOTBALL_BASE ?? "https://v3.football.api-sports.io";

export interface ApiFixture {
  fixture: { id: number; date: string; status?: { short?: string } };
  teams: { home: { id: number; name: string }; away: { id: number; name: string } };
}

export interface ApiFixtureFull extends ApiFixture {
  /** o endpoint /fixtures?ids= devolve as escalações junto, em uma só chamada para vários jogos */
  lineups?: ApiLineup[];
}

export interface ApiLineup {
  team: { id: number; name: string };
  startXI?: Array<{ player: { id?: number; name: string; number?: number; pos?: string } }>;
  substitutes?: Array<{ player: { id?: number; name: string; number?: number; pos?: string } }>;
}

export const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const NOISE = new Set(["fc", "ec", "sc", "ac", "cr", "de", "da", "do", "futebol", "clube", "esporte", "regatas", "club", "sp", "rj", "mg", "pr", "ba", "rs"]);
const ALIAS: Record<string, string[]> = {
  "atletico mg": ["atletico mineiro", "atletico mg"],
  "athletico pr": ["athletico paranaense", "athletico pr", "atletico pr"],
  bragantino: ["red bull bragantino", "rb bragantino", "bragantino"],
  vasco: ["vasco da gama", "vasco"],
  botafogo: ["botafogo rj", "botafogo"],
  gremio: ["gremio"],
  chapecoense: ["chapecoense sc", "chapecoense"],
  "sao paulo": ["sao paulo"],
  vitoria: ["vitoria"],
};

const tokens = (s: string) => norm(s).split(" ").filter((t) => t && !NOISE.has(t));

/** Casa o nome do time da API-Football com o clube do Cartola. */
export function matchClub(apiName: string, clubs: Record<number, Club>): Club | null {
  const a = norm(apiName);
  let best: { c: Club; s: number } | null = null;
  for (const c of Object.values(clubs)) {
    const cn = norm(c.nome);
    const names = [cn, ...(ALIAS[cn] ?? [])];
    let s = 0;
    for (const n of names) {
      if (n === a) s = Math.max(s, 100);
      else if (a.includes(n) || n.includes(a)) s = Math.max(s, 70);
    }
    if (!s) {
      const ta = tokens(apiName);
      const tc = tokens(c.nome);
      if (ta.length && tc.length && tc.every((t) => ta.includes(t))) s = 60;
    }
    if (s && (!best || s > best.s)) best = { c, s };
  }
  return best && best.s >= 60 ? best.c : null;
}

/** Casa um jogador da súmula ("G. Arrascaeta", "Pedro") com um atleta do clube. */
export function matchPlayer(apiName: string, squad: Athlete[]): Athlete | null {
  const full = norm(apiName);
  const m = full.match(/^([a-z]) (.+)$/); // "g arrascaeta"
  const initial = m && apiName.trim().match(/^[A-Za-zÀ-ÿ]\.\s/) ? m[1] : null;
  const surname = initial ? m![2] : full;
  const sTokens = surname.split(" ");
  let best: { a: Athlete; s: number } | null = null;
  let tie = false;
  for (const a of squad) {
    const nome = norm(a.nome ?? "");
    const apel = norm(a.apelido);
    const nt = nome.split(" ").filter(Boolean);
    let s = 0;
    if (full === nome || full === apel) s = 100;
    else if (!initial && sTokens.every((t) => nt.includes(t)) && sTokens.length > 1) s = 90;
    else if (!initial && sTokens.length === 1 && (apel === surname || nt[nt.length - 1] === surname)) s = 75;
    else if (initial && (nt[nt.length - 1] === sTokens[sTokens.length - 1] || nt.includes(sTokens[sTokens.length - 1]) || apel === surname) && (nome.startsWith(initial) || apel.startsWith(initial) || nt.some((t) => t.startsWith(initial)))) s = 80;
    else if (apel === surname || apel === sTokens[sTokens.length - 1]) s = 70;
    if (!s) continue;
    if (best && s === best.s) tie = true;
    else if (!best || s > best.s) {
      best = { a, s };
      tie = false;
    }
  }
  return best && !tie && best.s >= 70 ? best.a : null;
}

export interface OfficialResult {
  clubeId: number;
  titulares: number[];
  banco: number[];
  /** quantos nomes da súmula não foram casados com um atleta do Cartola */
  naoCasados: string[];
}

export function mapLineup(l: ApiLineup, athletes: Athlete[], clubs: Record<number, Club>): OfficialResult | null {
  const club = matchClub(l.team.name, clubs);
  if (!club || (l.startXI?.length ?? 0) < 11) return null;
  const squad = athletes.filter((a) => a.clubeId === club.id && a.posicaoId !== 6);
  const used = new Set<number>();
  const naoCasados: string[] = [];
  const take = (names: string[]) => {
    const out: number[] = [];
    for (const n of names) {
      const a = matchPlayer(n, squad.filter((x) => !used.has(x.id)));
      if (a) {
        used.add(a.id);
        out.push(a.id);
      } else naoCasados.push(n);
    }
    return out;
  };
  const titulares = take((l.startXI ?? []).map((x) => x.player.name));
  const banco = take((l.substitutes ?? []).map((x) => x.player.name));
  return { clubeId: club.id, titulares, banco, naoCasados };
}

/**
 * Transforma a escalação oficial em ajustes por atleta. Só usa "fora" quando a
 * súmula foi casada quase por inteiro; senão quem ficou de fora vira "reserva"
 * (nunca excluímos alguém por causa de um nome que não conseguimos casar).
 */
export function toOverrides(r: OfficialResult, athletes: Athlete[]): Record<number, LineupOverride> {
  const out: Record<number, LineupOverride> = {};
  const bemCasada = r.titulares.length >= 11 && r.banco.length >= 5;
  const squad = athletes.filter((a) => a.clubeId === r.clubeId && a.posicaoId !== 6);
  for (const a of squad) out[a.id] = bemCasada ? "fora" : "reserva";
  for (const id of r.banco) out[id] = "reserva";
  for (const id of r.titulares) out[id] = "titular";
  return out;
}

/** Traduz o erro da API; `permanente` = não adianta tentar de novo hoje. */
export function explainApiError(e: unknown): { texto: string; permanente: boolean } {
  const msg = e instanceof Error ? e.message : String(e);
  if (/Free plans do not have access|plan/i.test(msg) && /season|plan/i.test(msg))
    return { texto: "O plano gratuito da API-Football só libera as temporadas 2022 a 2024. A escalação oficial de 2026 exige um plano pago (ou outra fonte).", permanente: true };
  if (/HTTP 40[13]|token|key|Missing application/i.test(msg)) return { texto: `A API-Football recusou a chave: ${msg}`, permanente: true };
  if (/limit|rate|requests/i.test(msg)) return { texto: `Limite de chamadas da API-Football atingido: ${msg}`, permanente: true };
  return { texto: msg, permanente: false };
}

/* ------------------------- orçamento e rede ------------------------- */

/**
 * O plano gratuito da API-Football tem 100 chamadas por dia. Regras para não
 * estourar:
 *  - lista de jogos: UMA chamada por dia (cobre hoje e os próximos 2 dias);
 *  - escalações: UMA chamada para TODOS os jogos devidos (`ids=a-b-c`);
 *  - cada jogo só é consultado de 75 min antes até 10 min depois do início,
 *    de 10 em 10 minutos, no máximo 7 vezes, e para quando a súmula chega;
 *  - contador diário salvo em disco (não zera ao reiniciar) com teto de
 *    API_FOOTBALL_DAILY_LIMIT (padrão 90, folga de 10) e leitura do saldo que
 *    a própria API informa a cada resposta (x-ratelimit-requests-remaining).
 */
export interface Quota {
  /** dia UTC (a API zera à meia-noite UTC) */
  dia: string;
  usadas: number;
  /** saldo informado pela API na última resposta */
  restantes: number | null;
}

interface FixtureState {
  fixture: ApiFixture;
  found: boolean;
  lastTry: number;
  tries: number;
}

export interface Medicao {
  em: string;
  clube: string;
  /** dos 11 que apontamos, quantos estavam na súmula */
  acertos: number;
  /** dos 11 da súmula, quantos tinham chance de jogar de 50% ou mais */
  acimaDe50: number;
}

export interface OfficialState {
  persist: boolean;
  fixtures: Map<number, FixtureState>;
  fixturesDia: string;
  fixturesAt: number;
  quota: Quota;
  ultimaChamada: string | null;
  erro: string | null;
  /** a resposta em lote não traz `lineups`: usar a chamada por jogo (mais cara) */
  semLote: boolean;
  /** não chama a API antes desta hora (erro de plano/chave): evita gastar cota tentando de novo */
  bloqueadoAte: number;
  /** previsão (antes da súmula) x súmula oficial, por time: a medida real de acerto */
  medicoes: Medicao[];
  /** ajustes por jogo; expiram 6 h depois do início */
  porJogo: Map<number, { quando: number; overrides: Record<number, LineupOverride>; clubes: [string, string] }>;
}

const file = () => join(dataDir(), "api-football-state.json");
export const dayOf = (t: number) => new Date(t).toISOString().slice(0, 10);

export function newOfficialState(persist = true): OfficialState {
  const st: OfficialState = {
    persist,
    fixtures: new Map(),
    fixturesDia: "",
    fixturesAt: 0,
    quota: { dia: dayOf(Date.now()), usadas: 0, restantes: null },
    ultimaChamada: null,
    erro: null,
    semLote: false,
    bloqueadoAte: 0,
    medicoes: [],
    porJogo: new Map(),
  };
  if (persist) {
    try {
      const j = JSON.parse(readFileSync(file(), "utf8")) as {
        quota: Quota;
        fixturesDia: string;
        fixturesAt: number;
        semLote?: boolean;
        bloqueadoAte?: number;
        medicoes?: Medicao[];
        fixtures: Array<[number, FixtureState]>;
        porJogo: Array<[number, OfficialState["porJogo"] extends Map<number, infer V> ? V : never]>;
      };
      st.quota = j.quota;
      st.fixturesDia = j.fixturesDia;
      st.fixturesAt = j.fixturesAt;
      st.semLote = Boolean(j.semLote);
      st.bloqueadoAte = j.bloqueadoAte ?? 0;
      st.medicoes = j.medicoes ?? [];
      st.fixtures = new Map(j.fixtures);
      st.porJogo = new Map(j.porJogo);
    } catch {
      /* primeira execução */
    }
  }
  return st;
}

export function persistOfficial(st: OfficialState) {
  save(st);
}

function save(st: OfficialState) {
  if (!st.persist) return;
  try {
    mkdirSync(dataDir(), { recursive: true });
    const out = { quota: st.quota, fixturesDia: st.fixturesDia, fixturesAt: st.fixturesAt, semLote: st.semLote, bloqueadoAte: st.bloqueadoAte, medicoes: st.medicoes, fixtures: [...st.fixtures], porJogo: [...st.porJogo] };
    writeFileSync(file() + ".tmp", JSON.stringify(out));
    renameSync(file() + ".tmp", file());
  } catch {
    /* disco somente leitura: segue só em memória */
  }
}

export const officialEnabled = () => Boolean(process.env.API_FOOTBALL_KEY);
export const dailyLimit = () => Math.max(1, Number(process.env.API_FOOTBALL_DAILY_LIMIT ?? 90));

/** Reserva uma chamada do dia; false = orçamento esgotado. */
export function spend(st: OfficialState, now: number): boolean {
  const dia = dayOf(now);
  if (st.quota.dia !== dia) st.quota = { dia, usadas: 0, restantes: null };
  if (st.quota.usadas >= dailyLimit()) return false;
  if (st.quota.restantes != null && st.quota.restantes <= 3) return false;
  st.quota.usadas++;
  return true;
}

export const quotaStatus = (st: OfficialState, now = Date.now()) => ({
  dia: dayOf(now),
  usadas: st.quota.dia === dayOf(now) ? st.quota.usadas : 0,
  limite: dailyLimit(),
  restantesNaApi: st.quota.dia === dayOf(now) ? st.quota.restantes : null,
});

const BEFORE = 75 * 60_000;
const AFTER = 10 * 60_000;
const EVERY = Number(process.env.LINEUP_POLL_MS ?? 10 * 60_000);
const MAX_TRIES = 7;

export async function api<T>(path: string, key: string, st: OfficialState, doFetch: typeof fetch): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await doFetch(`${BASE}${path}`, { headers: { "x-apisports-key": key, Accept: "application/json" }, signal: ctrl.signal });
    const rem = res.headers?.get?.("x-ratelimit-requests-remaining");
    if (rem != null && rem !== "" && Number.isFinite(Number(rem))) st.quota.restantes = Number(rem);
    if (!res.ok) throw new Error(`API-Football HTTP ${res.status}`);
    const json = (await res.json()) as { response?: T; errors?: unknown };
    const errs = json.errors;
    if (errs && ((Array.isArray(errs) && errs.length) || (!Array.isArray(errs) && typeof errs === "object" && Object.keys(errs as object).length)))
      throw new Error(`API-Football: ${JSON.stringify(errs).slice(0, 160)}`);
    return json.response as T;
  } finally {
    clearTimeout(timer);
  }
}

export type Novo = { id: number; clubes: [string, string]; overrides: Record<number, LineupOverride>; times: Array<{ clubeId: number; titulares: number[] }> };

function accept(st: OfficialState, fs: FixtureState, lineups: ApiLineup[] | undefined, athletes: Athlete[], clubs: Record<number, Club>): Novo | null {
  if (!lineups || lineups.length < 2) return null;
  const rs = lineups.map((l) => mapLineup(l, athletes, clubs));
  if (rs.some((r) => !r)) return null;
  const overrides: Record<number, LineupOverride> = {};
  for (const r of rs as OfficialResult[]) Object.assign(overrides, toOverrides(r, athletes));
  fs.found = true;
  const kick = new Date(fs.fixture.fixture.date).getTime();
  const clubes: [string, string] = [clubs[(rs[0] as OfficialResult).clubeId]?.abreviacao ?? "?", clubs[(rs[1] as OfficialResult).clubeId]?.abreviacao ?? "?"];
  st.porJogo.set(fs.fixture.fixture.id, { quando: kick, overrides, clubes });
  return { id: fs.fixture.fixture.id, clubes, overrides, times: (rs as OfficialResult[]).map((r) => ({ clubeId: r.clubeId, titulares: r.titulares })) };
}

/**
 * Um passo do vigia (roda a cada minuto, mas quase nunca chama a API).
 * Devolve os jogos cuja escalação oficial chegou agora.
 */
export async function stepOfficial(
  st: OfficialState,
  athletes: Athlete[],
  clubs: Record<number, Club>,
  temporada: number,
  now = Date.now(),
  doFetch: typeof fetch = fetch,
): Promise<Novo[]> {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) return [];
  const novos: Novo[] = [];
  if (now < st.bloqueadoAte) return novos;
  try {
    // 1) lista de jogos: uma vez por dia (ou se vem jogo nas próximas 3 h que não conhecemos, no máximo a cada 6 h)
    const dia = dayOf(now);
    const desconhecido = [...st.fixtures.values()].length === 0 && now - st.fixturesAt > 6 * 3600_000;
    if ((st.fixturesDia !== dia || desconhecido) && spend(st, now)) {
      const league = process.env.API_FOOTBALL_LEAGUE ?? "71";
      const list = await api<ApiFixture[]>(`/fixtures?league=${league}&season=${temporada}&from=${dia}&to=${dayOf(now + 2 * 86400_000)}`, key, st, doFetch);
      st.fixturesDia = dia;
      st.fixturesAt = now;
      for (const f of list ?? []) if (!st.fixtures.has(f.fixture.id)) st.fixtures.set(f.fixture.id, { fixture: f, found: false, lastTry: 0, tries: 0 });
      for (const [id, f] of st.fixtures) if (now - new Date(f.fixture.fixture.date).getTime() > 12 * 3600_000) st.fixtures.delete(id);
    }

    // 2) jogos devidos agora: todos numa só chamada
    const devidos = [...st.fixtures.values()].filter((f) => {
      if (f.found || f.tries >= MAX_TRIES) return false;
      const kick = new Date(f.fixture.fixture.date).getTime();
      return now >= kick - BEFORE && now <= kick + AFTER && now - f.lastTry >= EVERY - 30_000;
    });
    if (devidos.length) {
      const batch = devidos.slice(0, 20);
      if (!st.semLote) {
        if (spend(st, now)) {
          for (const f of batch) {
            f.lastTry = now;
            f.tries++;
          }
          const list = await api<ApiFixtureFull[]>(`/fixtures?ids=${batch.map((f) => f.fixture.fixture.id).join("-")}`, key, st, doFetch);
          st.ultimaChamada = new Date(now).toISOString();
          const temCampo = (list ?? []).some((x) => Array.isArray(x.lineups));
          if (list?.length && !temCampo) st.semLote = true; // a API não devolveu `lineups` no lote: usa a chamada por jogo daqui em diante
          for (const item of list ?? []) {
            const fs = st.fixtures.get(item.fixture.id);
            const n = fs && accept(st, fs, item.lineups, athletes, clubs);
            if (n) novos.push(n);
          }
        }
      } else {
        // modo por jogo: uma chamada por jogo, o mais urgente primeiro
        for (const fs of batch.sort((a, b) => new Date(a.fixture.fixture.date).getTime() - new Date(b.fixture.fixture.date).getTime())) {
          if (!spend(st, now)) break;
          fs.lastTry = now;
          fs.tries++;
          const lineups = await api<ApiLineup[]>(`/fixtures/lineups?fixture=${fs.fixture.fixture.id}`, key, st, doFetch);
          st.ultimaChamada = new Date(now).toISOString();
          const n = accept(st, fs, lineups, athletes, clubs);
          if (n) novos.push(n);
        }
      }
    }
    for (const [id, j] of st.porJogo) if (now - j.quando > 6 * 3600_000) st.porJogo.delete(id);
    st.erro = null;
  } catch (e) {
    const r = explainApiError(e);
    st.erro = r.texto;
    // erro de plano/chave não melhora tentando de novo: espera; outros erros, 15 min
    st.bloqueadoAte = r.permanente ? new Date(dayOf(now + 86400_000)).getTime() : now + 15 * 60_000;
  }
  save(st);
  return novos;
}

export function currentOfficialOverrides(st: OfficialState): Record<number, LineupOverride> {
  const out: Record<number, LineupOverride> = {};
  for (const j of st.porJogo.values()) Object.assign(out, j.overrides);
  return out;
}

/* ------------------------- verificação da chave ------------------------- */

export interface ApiFootballProbe {
  ok: boolean;
  /** frase pronta para mostrar na tela */
  leitura: string;
  plano?: string;
  usadasHoje?: number;
  limiteDia?: number;
  ativa?: boolean;
}

/**
 * Pergunta à API quem somos. O endpoint /status NÃO consome a cota diária e
 * responde plano, validade e quantas chamadas já foram usadas hoje.
 */
export async function probeApiFootball(doFetch: typeof fetch = fetch): Promise<ApiFootballProbe> {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) return { ok: false, leitura: "Desligada: a variável API_FOOTBALL_KEY não está definida no servidor." };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await doFetch(`${BASE}/status`, { headers: { "x-apisports-key": key, Accept: "application/json" }, signal: ctrl.signal });
    if (res.status === 401 || res.status === 403) return { ok: false, leitura: `A API recusou a chave (HTTP ${res.status}). Confira se copiou inteira, sem espaço, e se ela é da API-Football (api-sports.io).` };
    if (!res.ok) return { ok: false, leitura: `A API respondeu HTTP ${res.status}.` };
    const j = (await res.json()) as { response?: unknown; errors?: unknown };
    const errs = j.errors;
    if (errs && !Array.isArray(errs) && typeof errs === "object" && Object.keys(errs as object).length) {
      const msg = Object.values(errs as Record<string, string>).join("; ");
      return { ok: false, leitura: `Chave não aceita pela API: ${msg}` };
    }
    const r = (Array.isArray(j.response) ? undefined : j.response) as { subscription?: { plan?: string; active?: boolean }; requests?: { current?: number; limit_day?: number } } | undefined;
    if (!r?.subscription) return { ok: false, leitura: "A API respondeu, mas sem dados da conta. Se a chave é nova, aguarde alguns minutos." };
    const usadasHoje = r.requests?.current;
    const limiteDia = r.requests?.limit_day;
    const ativa = r.subscription.active !== false;
    return {
      ok: ativa,
      plano: r.subscription.plan,
      usadasHoje,
      limiteDia,
      ativa,
      leitura: ativa
        ? `Chave válida · plano ${r.subscription.plan ?? "?"} · ${usadasHoje ?? "?"} de ${limiteDia ?? "?"} chamadas usadas hoje (em toda a conta, não só neste site).`
        : "Chave reconhecida, mas a assinatura está inativa.",
    };
  } catch (e) {
    return { ok: false, leitura: `Sem resposta da API-Football (${e instanceof Error ? e.message : "erro"}). O servidor do site pode estar sem acesso externo.` };
  } finally {
    clearTimeout(timer);
  }
}

/** Resumo dos jogos acompanhados, para o Painel ADM. */
export function fixturesSummary(st: OfficialState, clubs: Record<number, Club>, now = Date.now()) {
  const short = (name: string) => matchClub(name, clubs)?.abreviacao ?? name;
  return [...st.fixtures.values()]
    .map((f) => ({
      id: f.fixture.fixture.id,
      quando: f.fixture.fixture.date,
      mandante: short(f.fixture.teams.home.name),
      visitante: short(f.fixture.teams.away.name),
      situacao: f.found ? ("oficial" as const) : f.tries >= MAX_TRIES ? ("esgotado" as const) : now < new Date(f.fixture.fixture.date).getTime() - BEFORE ? ("aguardando" as const) : ("buscando" as const),
      tentativas: f.tries,
    }))
    .sort((a, b) => a.quando.localeCompare(b.quando))
    .slice(0, 24);
}

/** Resumo da medida real: nossa previsão antes da súmula contra a súmula oficial. */
export function medicaoResumo(st: OfficialState) {
  const m = st.medicoes;
  const total = m.length * 11;
  return {
    times: m.length,
    acerto: total ? m.reduce((s, x) => s + x.acertos, 0) / total : null,
    ultimos: m.slice(-8).reverse(),
  };
}
