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
import type { Athlete, Club, LineupOverride } from "../engine/types";

const BASE = process.env.API_FOOTBALL_BASE ?? "https://v3.football.api-sports.io";

export interface ApiFixture {
  fixture: { id: number; date: string; status?: { short?: string } };
  teams: { home: { id: number; name: string }; away: { id: number; name: string } };
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

/* ------------------------------ rede ------------------------------ */

async function api<T>(path: string, key: string, doFetch: typeof fetch = fetch): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await doFetch(`${BASE}${path}`, { headers: { "x-apisports-key": key, Accept: "application/json" }, signal: ctrl.signal });
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

interface FixtureState {
  fixture: ApiFixture;
  found: boolean;
  lastTry: number;
  tries: number;
}

export interface OfficialState {
  fixtures: Map<number, FixtureState>;
  fixturesAt: number;
  chamadas: number;
  ultimaChamada: string | null;
  erro: string | null;
  /** atleta → ajuste oficial, por jogo (expira 6 h depois do início) */
  porJogo: Map<number, { quando: number; overrides: Record<number, LineupOverride>; clubes: [string, string] }>;
}

export const newOfficialState = (): OfficialState => ({ fixtures: new Map(), fixturesAt: 0, chamadas: 0, ultimaChamada: null, erro: null, porJogo: new Map() });

export const officialEnabled = () => Boolean(process.env.API_FOOTBALL_KEY);

const POLL_MS = Number(process.env.LINEUP_POLL_MS ?? 5 * 60_000);
const WINDOW_BEFORE = 100 * 60_000; // começa a perguntar 100 min antes
const WINDOW_AFTER = 20 * 60_000;

/**
 * Um passo do vigia: descobre os jogos próximos e busca as escalações dos que
 * estão na janela (de 100 min antes a 20 min depois do início), de 5 em 5 min
 * até saírem. Devolve os jogos cuja escalação chegou agora.
 */
export async function stepOfficial(
  st: OfficialState,
  athletes: Athlete[],
  clubs: Record<number, Club>,
  temporada: number,
  now = Date.now(),
  doFetch: typeof fetch = fetch,
): Promise<Array<{ id: number; clubes: [string, string]; overrides: Record<number, LineupOverride> }>> {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) return [];
  const novos: Array<{ id: number; clubes: [string, string]; overrides: Record<number, LineupOverride> }> = [];
  try {
    if (now - st.fixturesAt > 3 * 3600_000) {
      const day = (t: number) => new Date(t).toISOString().slice(0, 10);
      const league = process.env.API_FOOTBALL_LEAGUE ?? "71";
      const list = await api<ApiFixture[]>(`/fixtures?league=${league}&season=${temporada}&from=${day(now - 86400_000)}&to=${day(now + 3 * 86400_000)}`, key, doFetch);
      st.chamadas++;
      st.fixturesAt = now;
      for (const f of list ?? []) if (!st.fixtures.has(f.fixture.id)) st.fixtures.set(f.fixture.id, { fixture: f, found: false, lastTry: 0, tries: 0 });
    }
    for (const fs of st.fixtures.values()) {
      if (fs.found) continue;
      const kick = new Date(fs.fixture.fixture.date).getTime();
      if (now < kick - WINDOW_BEFORE || now > kick + WINDOW_AFTER) continue;
      if (now - fs.lastTry < POLL_MS) continue;
      fs.lastTry = now;
      fs.tries++;
      const lineups = await api<ApiLineup[]>(`/fixtures/lineups?fixture=${fs.fixture.fixture.id}`, key, doFetch);
      st.chamadas++;
      st.ultimaChamada = new Date(now).toISOString();
      if (!lineups || lineups.length < 2) continue;
      const rs = lineups.map((l) => mapLineup(l, athletes, clubs));
      if (rs.some((r) => !r)) continue;
      const overrides: Record<number, LineupOverride> = {};
      for (const r of rs as OfficialResult[]) Object.assign(overrides, toOverrides(r, athletes));
      fs.found = true;
      const clubes: [string, string] = [clubs[(rs[0] as OfficialResult).clubeId]?.abreviacao ?? "?", clubs[(rs[1] as OfficialResult).clubeId]?.abreviacao ?? "?"];
      st.porJogo.set(fs.fixture.fixture.id, { quando: kick, overrides, clubes });
      novos.push({ id: fs.fixture.fixture.id, clubes, overrides });
    }
    for (const [id, j] of st.porJogo) if (now - j.quando > 6 * 3600_000) st.porJogo.delete(id);
    st.erro = null;
  } catch (e) {
    st.erro = e instanceof Error ? e.message : String(e);
  }
  return novos;
}

export function currentOfficialOverrides(st: OfficialState): Record<number, LineupOverride> {
  const out: Record<number, LineupOverride> = {};
  for (const j of st.porJogo.values()) Object.assign(out, j.overrides);
  return out;
}
