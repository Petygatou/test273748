/**
 * Times, ligas e conta do cartoleiro na API do Cartola (somente servidor).
 *
 * Públicos: busca de times e ligas, time por id/slug (inclusive por rodada),
 * esquemas, rodadas e destaques pós-rodada.
 * Autenticados (token do próprio cartoleiro): meu time, minhas ligas, liga
 * por slug e salvar a escalação direto no Cartola.
 */
import { aprenderSilhueta, camisaDoClube } from "./foto";
import { FORMATIONS, type FormationKey } from "../engine/rules";
import { cached } from "./cache";
import { cartola } from "./cartolaHttp";

/* ------------------------------ formatos ------------------------------ */

export interface TeamSummary {
  timeId: number;
  nome: string;
  cartoleiro: string;
  slug: string;
  escudo?: string;
  assinante?: boolean;
}

export interface TeamAthlete {
  atletaId: number;
  apelido: string;
  posicaoId: number;
  clubeId: number;
  preco: number;
  pontos: number | null;
  foto?: string;
}

export interface TeamDetail {
  time: TeamSummary;
  rodada: number | null;
  esquemaId: number | null;
  capitaoId: number | null;
  reservaLuxoId: number | null;
  atletas: TeamAthlete[];
  reservas: TeamAthlete[];
  patrimonio: number | null;
  valorTime: number | null;
  pontosRodada: number | null;
  pontosCampeonato: number | null;
}

export interface LeagueSummary {
  ligaId: number;
  nome: string;
  slug: string;
  descricao?: string;
  imagem?: string;
  totalTimes?: number;
}

export interface LeagueDetail {
  liga: LeagueSummary;
  times: Array<TeamSummary & { pontosRodada: number | null; pontosCampeonato: number | null; patrimonio: number | null; posicao: number | null }>;
}

type Raw = Record<string, unknown>;
const num = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : typeof x === "string" && x.trim() !== "" && !Number.isNaN(Number(x)) ? Number(x) : null);
const str = (x: unknown): string => (typeof x === "string" ? x : x == null ? "" : String(x));

export function parseTeamSummary(r: Raw): TeamSummary {
  return {
    timeId: num(r.time_id) ?? 0,
    nome: str(r.nome),
    cartoleiro: str(r.nome_cartola),
    slug: str(r.slug),
    escudo: str(r.url_escudo_png || r.url_escudo_svg) || undefined,
    assinante: Boolean(r.assinante),
  };
}

function parseAthlete(a: Raw): TeamAthlete {
  const clubeId = num(a.clube_id) ?? 0;
  const posicaoId = num(a.posicao_id) ?? 0;
  aprenderSilhueta(clubeId, posicaoId, typeof a.foto === "string" ? a.foto : undefined);
  return {
    atletaId: num(a.atleta_id) ?? 0,
    apelido: str(a.apelido),
    posicaoId: num(a.posicao_id) ?? 0,
    clubeId: num(a.clube_id) ?? 0,
    preco: num(a.preco_num) ?? 0,
    pontos: num(a.pontos_num),
    // sem rostos: a camisa do clube no Cartola
    foto: camisaDoClube(clubeId, posicaoId),
  };
}

export function parseTeamDetail(r: Raw): TeamDetail {
  const time = (r.time as Raw) ?? {};
  const pontos = r.pontos as unknown;
  return {
    time: parseTeamSummary(time),
    rodada: num(r.rodada_atual),
    esquemaId: num(r.esquema_id ?? time.esquema_id),
    capitaoId: num(r.capitao_id),
    reservaLuxoId: num(r.reserva_luxo_id),
    atletas: (Array.isArray(r.atletas) ? (r.atletas as Raw[]) : []).map(parseAthlete),
    reservas: (Array.isArray(r.reservas) ? (r.reservas as Raw[]) : []).map(parseAthlete),
    patrimonio: num(r.patrimonio ?? time.patrimonio),
    valorTime: num(r.valor_time),
    pontosRodada: typeof pontos === "object" && pontos ? num((pontos as Raw).rodada) : num(pontos),
    pontosCampeonato: num(r.pontos_campeonato ?? (typeof pontos === "object" && pontos ? (pontos as Raw).campeonato : null)),
  };
}

export function parseLeagueSummary(r: Raw): LeagueSummary {
  return {
    ligaId: num(r.liga_id) ?? 0,
    nome: str(r.nome),
    slug: str(r.slug),
    descricao: str(r.descricao) || undefined,
    imagem: str(r.imagem || r.url_flamula_png) || undefined,
    totalTimes: num(r.total_times_liga) ?? undefined,
  };
}

export function parseLeagueDetail(r: Raw): LeagueDetail {
  const times = (Array.isArray(r.times) ? (r.times as Raw[]) : []).map((t) => {
    const p = (t.pontos as Raw) ?? {};
    const rk = (t.ranking as Raw) ?? {};
    return {
      ...parseTeamSummary(t),
      pontosRodada: num(p.rodada),
      pontosCampeonato: num(p.campeonato),
      patrimonio: num(t.patrimonio),
      posicao: num(rk.campeonato ?? rk.rodada),
    };
  });
  return { liga: parseLeagueSummary((r.liga as Raw) ?? r), times };
}

/* ------------------------------ públicos ------------------------------ */

export async function searchTeams(q: string): Promise<TeamSummary[]> {
  const term = q.trim();
  if (term.length < 2) return [];
  const raw = await cached(`cartola:times:${term.toLowerCase()}`, 10 * 60_000, () => cartola<Raw[]>(`/times?q=${encodeURIComponent(term)}`));
  return (Array.isArray(raw) ? raw : []).map(parseTeamSummary).slice(0, 30);
}

export async function getTeam(ref: { id?: number; slug?: string }, rodada?: number): Promise<TeamDetail> {
  const base = ref.id ? `/time/id/${ref.id}` : `/time/slug/${encodeURIComponent(ref.slug ?? "")}`;
  const path = rodada ? `${base}/${rodada}` : base;
  return parseTeamDetail(await cached(`cartola:time:${path}`, rodada ? 6 * 3600_000 : 60_000, () => cartola<Raw>(path)));
}

export async function searchLeagues(q: string): Promise<LeagueSummary[]> {
  const term = q.trim();
  if (term.length < 2) return [];
  const raw = await cached(`cartola:ligas:${term.toLowerCase()}`, 10 * 60_000, () => cartola<Raw[]>(`/ligas?q=${encodeURIComponent(term)}`));
  return (Array.isArray(raw) ? raw : []).map(parseLeagueSummary).slice(0, 30);
}

export interface Esquema {
  esquemaId: number;
  nome: string;
}

/** Ids conhecidos dos esquemas (usados se /esquemas não responder). */
export const ESQUEMAS_PADRAO: Record<FormationKey, number> = { "3-4-3": 1, "3-5-2": 2, "4-3-3": 3, "4-4-2": 4, "4-5-1": 5, "5-3-2": 6, "5-4-1": 7 };

export async function getEsquemas(): Promise<Esquema[]> {
  try {
    const raw = await cached("cartola:esquemas", 24 * 3600_000, () => cartola<Raw[]>("/esquemas"));
    const list = (Array.isArray(raw) ? raw : []).map((e) => ({ esquemaId: num(e.esquema_id) ?? 0, nome: str(e.nome) })).filter((e) => e.esquemaId);
    if (list.length) return list;
  } catch {
    /* usa a tabela conhecida */
  }
  return (Object.keys(ESQUEMAS_PADRAO) as FormationKey[]).map((nome) => ({ esquemaId: ESQUEMAS_PADRAO[nome], nome }));
}

export async function esquemaIdFor(f: FormationKey): Promise<number> {
  const list = await getEsquemas();
  return list.find((e) => e.nome.replace(/\s/g, "") === f)?.esquemaId ?? ESQUEMAS_PADRAO[f];
}

export interface PosRodada {
  mito: (TeamSummary & { pontos: number | null }) | null;
  mediaPontos: number | null;
  mediaCartoletas: number | null;
}

export async function getPosRodada(): Promise<PosRodada> {
  const r = await cached("cartola:pos-rodada", 15 * 60_000, () => cartola<Raw>("/pos-rodada/destaques"));
  const mito = (r?.mito_rodada as Raw) ?? null;
  return {
    mito: mito ? { ...parseTeamSummary(mito), pontos: num(mito.pontos) } : null,
    mediaPontos: num(r?.media_pontos),
    mediaCartoletas: num(r?.media_cartoletas),
  };
}

export async function getRodadas(): Promise<Array<{ rodada: number; inicio: string | null; fim: string | null }>> {
  const raw = await cached("cartola:rodadas", 24 * 3600_000, () => cartola<Raw[]>("/rodadas"));
  return (Array.isArray(raw) ? raw : []).map((r) => ({ rodada: num(r.rodada_id) ?? 0, inicio: str(r.inicio) || null, fim: str(r.fim) || null }));
}

/* ------------------------------ autenticados ------------------------------ */

function checkToken(token: string) {
  const t = token.trim();
  if (t.length < 20 || t.length > 4000 || /\s/.test(t.replace(/^Bearer /, ""))) throw new Error("Token do Cartola inválido.");
  return t;
}

export async function getMyTeam(token: string): Promise<TeamDetail> {
  return parseTeamDetail(await cartola<Raw>("/auth/time", { token: checkToken(token) }));
}

export async function getMyLeagues(token: string): Promise<LeagueSummary[]> {
  const r = await cartola<Raw>("/auth/ligas", { token: checkToken(token) });
  const list = Array.isArray(r) ? (r as Raw[]) : Array.isArray(r?.ligas) ? (r.ligas as Raw[]) : [];
  return list.map(parseLeagueSummary);
}

export async function getLeague(token: string, slug: string, ordem?: "campeonato" | "rodada" | "mes" | "turno"): Promise<LeagueDetail> {
  const qs = ordem ? `?orderBy=${ordem}` : "";
  return parseLeagueDetail(await cartola<Raw>(`/auth/liga/${encodeURIComponent(slug)}${qs}`, { token: checkToken(token) }));
}

export interface SaveLineupInput {
  formation: FormationKey;
  titulares: number[];
  captainId: number;
  reservas?: Array<{ atletaId: number; posicaoId: number; luxo?: boolean }>;
}

/** Monta o corpo esperado por /auth/time/salvar. */
export async function buildSaveBody(input: SaveLineupInput) {
  const counts = FORMATIONS[input.formation];
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (!counts || input.titulares.length !== total) throw new Error(`O esquema ${input.formation} pede ${total} atletas.`);
  if (!input.titulares.includes(input.captainId)) throw new Error("O capitão precisa estar entre os titulares.");
  const reservas: Record<string, number> = {};
  for (const r of input.reservas ?? []) reservas[String(r.posicaoId)] = r.atletaId;
  const luxo = input.reservas?.find((r) => r.luxo)?.atletaId;
  return {
    esquema: await esquemaIdFor(input.formation),
    atletas: input.titulares,
    capitao: input.captainId,
    ...(Object.keys(reservas).length ? { reservas } : {}),
    ...(luxo ? { reserva_luxo_id: luxo } : {}),
  };
}

export async function saveMyLineup(token: string, input: SaveLineupInput): Promise<{ mensagem: string }> {
  const body = await buildSaveBody(input);
  const r = await cartola<Raw>("/auth/time/salvar", { method: "POST", body, token: checkToken(token), timeoutMs: 15_000 });
  return { mensagem: str(r?.mensagem) || "Time escalado!" };
}
