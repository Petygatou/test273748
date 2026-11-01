/**
 * Lado dos laterais descoberto sozinho (somente servidor).
 *
 * O Cartola só diz "lateral". Aqui lemos a escalação de cada jogo em duas fontes
 * e anotamos de que lado cada lateral jogou:
 *
 *  - ESPN (sem chave): a escalação de cada jogo do Brasileirão traz a posição
 *    escrita, "Left Back" / "Right Back". É a fonte principal: temporada atual,
 *    jogo a jogo.
 *  - API-Football (API_FOOTBALL_KEY): a escalação traz a posição no desenho
 *    tático ("grid" linha:coluna). Usamos a temporada mais recente que o plano
 *    libera. Qual ponta é a esquerda é conferido pelos próprios dados: no Brasil
 *    a camisa 2 é do lateral direito e a 6 do esquerdo.
 *
 * Na cedência cada jogo usa o lado em que o lateral jogou NAQUELE jogo; o lado do
 * atleta (filtros, ficha, Mercado) é o da maioria dos jogos. A marcação manual do
 * Painel ADM continua valendo por cima de tudo, só para corrigir.
 */
import type { Athlete, Club, LadoLateral, Match, PlayerRound } from "../engine/types";
import { db, emit, flushRemote, syncRemote, type EvidenciaLado, type FonteLadoRow, type LadoJogoRow } from "./db";
import { apiPaged, explainApiError, matchClub, matchPlayer, norm, spend, type OfficialState } from "./escalacoes";
import type { ResultadoLista } from "./ladosLista";

const ESPN_BASE = () => process.env.ESPN_BASE ?? "https://site.api.espn.com/apis/site/v2/sports/soccer";
const ESPN_LIGA = () => process.env.ESPN_LIGA ?? "bra.1";
const HORA = 3600_000;
/** jogo encerrado sem escalação publicada: tenta de novo algumas vezes */
const MAX_TENTATIVAS_VAZIO = 4;

/* ------------------------- leitura da posição ------------------------- */

export interface LadoLido {
  lado: LadoLateral;
  /** lateral/ala de verdade (não só "do lado esquerdo do campo") */
  forte: boolean;
}

/** "Left Back", "Right Wing Back", "LB", "CD-L", "Lateral esquerdo"… → lado. */
export function ladoDaPosicao(nome?: string | null, abrev?: string | null): LadoLido | null {
  const s = ` ${(nome ?? "").toLowerCase()} ${(abrev ?? "").toLowerCase()} `;
  const esq = /\bleft\b|esquerd|izquierd|\b(lb|lwb|lm|lw|lf)\b|-l\b/.test(s);
  const dir = /\bright\b|direit|derech|\b(rb|rwb|rm|rw|rf)\b|-r\b/.test(s);
  if (esq === dir) return null;
  const forte = !/cent(er|re)|zagueir|defensor central/.test(s) && /\bback\b|wing ?back|lateral|\b(lb|rb|lwb|rwb)\b/.test(s);
  return { lado: esq ? "E" : "D", forte };
}

/**
 * Grid da API-Football ("linha:coluna"): a coluna 1 é a esquerda do time (no exemplo
 * da documentação, Zinchenko, lateral esquerdo, é "2:1" e Walker, o direito, "2:4").
 * `invertido` troca as pontas se a conferência pelas camisas disser o contrário.
 */
export function ladoDoGrid(grid: [number, number, number] | undefined, invertido = false): LadoLido | null {
  if (!grid) return null;
  const [, col, n] = grid;
  if (n < 2 || (col !== 1 && col !== n)) return null;
  const esquerda = col === 1 ? !invertido : invertido;
  return { lado: esquerda ? "E" : "D", forte: n >= 4 };
}

/** Evidência → lado lido, conforme a fonte. */
export function ladoDaEvidencia(ev: EvidenciaLado, invertido = false): LadoLido | null {
  return ev.grid ? ladoDoGrid(ev.grid, invertido) : ladoDaPosicao(ev.posicao);
}

/* ------------------------- casamento de nomes ------------------------- */

interface Contexto {
  temporada: number;
  athletes: Athlete[];
  clubs: Record<number, Club>;
  matches: Match[];
  history: PlayerRound[];
}

function rodadaDoJogo(ctx: Contexto, casaId: number | null, foraId: number | null, em?: string): number | null {
  if (!casaId || !foraId) return null;
  const achados = ctx.matches.filter((m) => (m.casaId === casaId && m.foraId === foraId) || (m.casaId === foraId && m.foraId === casaId));
  if (!achados.length) return null;
  const mesmoMando = achados.filter((m) => m.casaId === casaId);
  const lista = mesmoMando.length ? mesmoMando : achados;
  if (lista.length === 1 || !em) return lista[0].rodada;
  const t = new Date(em).getTime();
  return lista.reduce((a, b) => (Math.abs(new Date(a.data ?? 0).getTime() - t) <= Math.abs(new Date(b.data ?? 0).getTime() - t) ? a : b)).rodada;
}

/** Laterais candidatos de um clube num jogo: os do elenco atual e quem jogou como lateral naquela rodada. */
function candidatos(ctx: Contexto, clubeId: number, rodada: number | null) {
  const porId = new Map(ctx.athletes.map((a) => [a.id, a] as const));
  const ids = new Set(ctx.athletes.filter((a) => a.clubeId === clubeId && a.posicaoId === 2).map((a) => a.id));
  if (rodada != null) for (const pr of ctx.history) if (pr.rodada === rodada && pr.clubeId === clubeId && pr.posicaoId === 2) ids.add(pr.atletaId);
  return [...ids].map((id) => porId.get(id)).filter((a): a is Athlete => Boolean(a) && a!.posicaoId === 2);
}

/** Fora do clube (temporada antiga, atleta que trocou de time): só nome idêntico e único entre todos os laterais. */
function casarGlobal(nomes: string[], laterais: Athlete[]): Athlete | null {
  for (const n of nomes.map(norm).filter((n) => n.length >= 4)) {
    const hits = laterais.filter((a) => norm(a.apelido) === n || norm(a.nome ?? "") === n);
    if (hits.length === 1) return hits[0];
  }
  return null;
}

function casar(nomes: string[], grupo: Athlete[]): Athlete | null {
  for (const n of nomes) {
    if (!n) continue;
    const a = matchPlayer(n, grupo);
    if (a) return a;
  }
  return null;
}

/* ------------------------------- ESPN -------------------------------- */

interface EspnTeam {
  id?: string;
  displayName?: string;
  shortDisplayName?: string;
  name?: string;
  location?: string;
  abbreviation?: string;
}
interface EspnCompetitor {
  homeAway?: "home" | "away";
  team?: EspnTeam;
}
interface EspnEvent {
  id: string;
  date?: string;
  status?: { type?: { completed?: boolean; state?: string } };
  competitions?: Array<{ competitors?: EspnCompetitor[]; status?: { type?: { completed?: boolean; state?: string } } }>;
}
interface EspnRosterEntry {
  starter?: boolean;
  subbedIn?: boolean | { didSub?: boolean };
  jersey?: string;
  athlete?: { displayName?: string; fullName?: string; shortName?: string };
  position?: { name?: string; displayName?: string; abbreviation?: string };
}
interface EspnSummary {
  header?: { competitions?: Array<{ date?: string; competitors?: EspnCompetitor[] }> };
  rosters?: Array<{ homeAway?: "home" | "away"; team?: EspnTeam; roster?: EspnRosterEntry[] }>;
}

async function getJson<T>(url: string, doFetch: typeof fetch): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await doFetch(url, { headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (Tropa; +https://tropa)" }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

const nomeTime = (t?: EspnTeam) => [t?.displayName, t?.shortDisplayName, t?.name, t?.location].filter((x): x is string => Boolean(x));
const clubeDoTime = (t: EspnTeam | undefined, clubs: Record<number, Club>) => {
  for (const n of nomeTime(t)) {
    const c = matchClub(n, clubs);
    if (c) return c;
  }
  return null;
};
const encerrado = (e: EspnEvent) => {
  const s = e.status?.type ?? e.competitions?.[0]?.status?.type;
  return Boolean(s?.completed) || s?.state === "post";
};
const entrou = (r: EspnRosterEntry) => Boolean(r.starter) || (typeof r.subbedIn === "boolean" ? r.subbedIn : Boolean(r.subbedIn?.didSub));

/** Lê a escalação de um jogo da ESPN e devolve a linha pronta para guardar. */
export function lerResumoEspn(eventId: string, em: string, s: EspnSummary, ctx: Contexto, agora = Date.now()): LadoJogoRow {
  const comp = s.header?.competitions?.[0]?.competitors ?? [];
  const rosters = s.rosters ?? [];
  const timeDe = (i: number) => {
    const r = rosters[i];
    const lado = r?.homeAway ?? comp[i]?.homeAway ?? (i === 0 ? "home" : "away");
    const t = r?.team ?? comp.find((c) => c.homeAway === lado)?.team ?? comp[i]?.team;
    return { lado, clube: clubeDoTime(t, ctx.clubs) };
  };
  const times = rosters.map((_, i) => timeDe(i));
  const casa = times.find((t) => t.lado === "home")?.clube ?? null;
  const fora = times.find((t) => t.lado === "away")?.clube ?? null;
  const rodada = rodadaDoJogo(ctx, casa?.id ?? null, fora?.id ?? null, em);
  const laterais: EvidenciaLado[] = [];
  const semPar: string[] = [];
  const timesSemPar: string[] = [];
  let algumaEscalacao = false;
  rosters.forEach((r, i) => {
    const clube = times[i].clube;
    if (!clube && r.roster?.length) timesSemPar.push(nomeTime(r.team ?? comp[i]?.team)[0] ?? "?");
    if (!clube || !r.roster?.length) return;
    algumaEscalacao = true;
    const grupo = candidatos(ctx, clube.id, rodada);
    const elenco = ctx.athletes.filter((a) => a.clubeId === clube.id);
    const usados = new Set<number>();
    for (const p of r.roster) {
      if (!entrou(p)) continue;
      const nomes = [p.athlete?.displayName, p.athlete?.fullName, p.athlete?.shortName].filter((x): x is string => Boolean(x));
      const posicao = p.position?.name ?? p.position?.displayName ?? p.position?.abbreviation ?? "";
      const a = casar(
        nomes,
        grupo.filter((x) => !usados.has(x.id)),
      );
      if (a) {
        usados.add(a.id);
        laterais.push({ atletaId: a.id, clubeId: clube.id, posicao: [posicao, p.position?.abbreviation].filter(Boolean).join(" · "), titular: Boolean(p.starter) });
        continue;
      }
      // lateral de verdade na ESPN que não achamos entre os laterais do Cartola: guarda para o admin conferir
      const lido = ladoDaPosicao(posicao, p.position?.abbreviation);
      if (lido?.forte && p.starter && !casar(nomes, elenco)) semPar.push(`${nomes[0] ?? "?"} (${clube.abreviacao})`);
    }
  });
  return {
    id: `espn:${eventId}`,
    fonte: "espn",
    temporada: ctx.temporada,
    rodada,
    em,
    clubes: [casa?.id ?? null, fora?.id ?? null],
    laterais,
    semPar,
    timesSemPar: timesSemPar.length ? timesSemPar : undefined,
    vazio: !algumaEscalacao || undefined,
    lidoEm: new Date(agora).toISOString(),
  };
}

function jogoVazio(id: string, fonteId: LadoJogoRow["fonte"], temporada: number, em: string, agora: number): LadoJogoRow {
  return { id, fonte: fonteId, temporada, rodada: null, em, clubes: [null, null], laterais: [], semPar: [], vazio: true, lidoEm: new Date(agora).toISOString() };
}

function fonte(id: FonteLadoRow["id"], temporada: number): FonteLadoRow {
  const f = db.ladosFontes.get(id);
  if (f && f.temporada === temporada) return f;
  return { id, temporada, eventos: [], listaEm: null, erro: null, bloqueadoAte: 0, tentativas: {} };
}

/** Jogos de uma fonte que ainda precisam ser lidos. */
function pendentes(f: FonteLadoRow, prefixo: string, agora: number) {
  return f.eventos.filter((e) => {
    const row = db.ladosJogos.get(`${prefixo}:${e.id}`);
    if (!row) return true;
    if (!row.vazio) return false;
    return (f.tentativas[e.id] ?? 0) < MAX_TENTATIVAS_VAZIO && agora - new Date(row.lidoEm).getTime() > 6 * HORA;
  });
}

/**
 * Um passo da ESPN: renova a lista de jogos (a cada 6 h) e lê até `maxJogos` escalações.
 * Devolve quantos jogos vieram com escalação (`lidos`) e quantos foram consultados.
 */
export async function passoEspn(ctx: Contexto, maxJogos: number, agora = Date.now(), doFetch: typeof fetch = fetch): Promise<{ lidos: number; processados: number }> {
  let f = fonte("espn", ctx.temporada);
  if (agora < (f.bloqueadoAte ?? 0)) return { lidos: 0, processados: 0 };
  const base = `${ESPN_BASE()}/${ESPN_LIGA()}`;
  try {
    if (!f.listaEm || agora - new Date(f.listaEm).getTime() > 6 * HORA) {
      // mês a mês (cada resposta fica pequena), até o mês atual
      const hoje = new Date(agora);
      const meses = hoje.getUTCFullYear() > ctx.temporada ? 12 : hoje.getUTCFullYear() < ctx.temporada ? 0 : hoje.getUTCMonth() + 1;
      const eventos = new Map<string, { id: string; em: string }>();
      for (let mes = 1; mes <= meses; mes++) {
        const mm = String(mes).padStart(2, "0");
        const fim = new Date(Date.UTC(ctx.temporada, mes, 0)).getUTCDate();
        const j = await getJson<{ events?: EspnEvent[] }>(`${base}/scoreboard?dates=${ctx.temporada}${mm}01-${ctx.temporada}${mm}${fim}&limit=300`, doFetch);
        for (const e of j.events ?? []) if (encerrado(e)) eventos.set(String(e.id), { id: String(e.id), em: e.date ?? "" });
      }
      f = { ...f, eventos: [...eventos.values()], listaEm: new Date(agora).toISOString(), erro: null };
      db.ladosFontes.put(f);
    }
    const fila = pendentes(f, "espn", agora).slice(0, maxJogos);
    let lidos = 0;
    // poucos de cada vez, em paralelo, para não pesar
    for (let i = 0; i < fila.length; i += 4) {
      const lote = fila.slice(i, i + 4);
      const resumos = await Promise.allSettled(lote.map((e) => getJson<EspnSummary>(`${base}/summary?event=${e.id}`, doFetch)));
      // todos falharam: a fonte está fora do ar (não conta como tentativa de nenhum jogo)
      const falha = resumos.find((r): r is PromiseRejectedResult => r.status === "rejected");
      if (falha && resumos.every((r) => r.status === "rejected")) throw falha.reason;
      resumos.forEach((r, k) => {
        const e = lote[k];
        // um jogo só com problema: fica como "sem escalação" e volta para a fila mais tarde
        const row = r.status === "fulfilled" ? lerResumoEspn(e.id, e.em, r.value, ctx, agora) : jogoVazio(`espn:${e.id}`, "espn", ctx.temporada, e.em, agora);
        if (row.vazio) f.tentativas[e.id] = (f.tentativas[e.id] ?? 0) + 1;
        else lidos++;
        db.ladosJogos.put(row);
      });
    }
    if (fila.length) db.ladosFontes.put({ ...f, erro: null, ultimaLeitura: new Date(agora).toISOString() });
    return { lidos, processados: fila.length };
  } catch (e) {
    const msg = e instanceof Error ? (e.name === "AbortError" ? "sem resposta em 10 s" : e.message) : String(e);
    db.ladosFontes.put({ ...f, erro: `ESPN: ${msg}`, bloqueadoAte: agora + 15 * 60_000 });
    return { lidos: 0, processados: 0 };
  }
}

/* ---------------------------- API-Football ---------------------------- */

interface ApiPlayer {
  id?: number;
  name: string;
  number?: number;
  pos?: string;
  grid?: string | null;
}
interface ApiFixtureLista {
  fixture: { id: number; date: string };
  teams: { home: { name: string }; away: { name: string } };
}
interface ApiFixtureComEscalacao extends ApiFixtureLista {
  lineups?: Array<{ team: { name: string }; startXI?: Array<{ player: ApiPlayer }> }>;
}

const LIGAS_API = () => (process.env.API_FOOTBALL_LADOS_LIGAS ?? "71,72").split(",").map((s) => Number(s.trim())).filter(Boolean);

/** Lê as escalações de um jogo da API-Football: posição no desenho e camisas 2/6 nas pontas da defesa. */
export function lerJogoApi(item: ApiFixtureComEscalacao, temporadaApi: number, ctx: Contexto, agora = Date.now()): LadoJogoRow {
  const casaClube = matchClub(item.teams.home.name, ctx.clubs);
  const foraClube = matchClub(item.teams.away.name, ctx.clubs);
  const atual = temporadaApi === ctx.temporada;
  const rodada = atual ? rodadaDoJogo(ctx, casaClube?.id ?? null, foraClube?.id ?? null, item.fixture.date) : null;
  const todosLaterais = ctx.athletes.filter((a) => a.posicaoId === 2);
  const laterais: EvidenciaLado[] = [];
  const semPar: string[] = [];
  const camisas = { c2esq: 0, c2dir: 0, c6esq: 0, c6dir: 0 };
  const timesSemPar: string[] = [];
  let algumaEscalacao = false;
  for (const l of item.lineups ?? []) {
    const xi = (l.startXI ?? []).map((x) => x.player).filter((p) => p && p.grid);
    if (xi.length < 10) continue;
    algumaEscalacao = true;
    const clube = matchClub(l.team.name, ctx.clubs);
    if (!clube && atual) timesSemPar.push(l.team.name);
    const linhas = new Map<number, number>();
    const pos = xi.map((p) => {
      const [r, c] = String(p.grid).split(":").map(Number);
      linhas.set(r, Math.max(linhas.get(r) ?? 0, c));
      return { p, r, c };
    });
    // conferência da orientação: camisa 2 (lateral direito) e 6 (esquerdo) nas pontas da linha de defesa
    for (const { p, r, c } of pos) {
      const n = linhas.get(r) ?? 0;
      if (r !== 2 || n < 4 || (c !== 1 && c !== n)) continue;
      if (p.number === 2) c === 1 ? camisas.c2esq++ : camisas.c2dir++;
      if (p.number === 6) c === 1 ? camisas.c6esq++ : camisas.c6dir++;
    }
    const grupo = clube ? candidatos(ctx, clube.id, rodada) : [];
    const usados = new Set<number>();
    for (const { p, r, c } of pos) {
      // lateral joga na defesa (D) ou como ala no meio (M)
      if ((p.pos !== "D" && p.pos !== "M") || !Number.isFinite(r) || !Number.isFinite(c)) continue;
      const n = linhas.get(r) ?? 0;
      let a = casar([p.name], grupo.filter((x) => !usados.has(x.id)));
      // temporada antiga: o atleta pode estar em outro clube hoje
      if (!a && !atual) a = casarGlobal([p.name], todosLaterais.filter((x) => !usados.has(x.id)));
      if (a) {
        usados.add(a.id);
        laterais.push({ atletaId: a.id, clubeId: clube?.id ?? a.clubeId, posicao: `grid ${r}:${c} de ${n}`, titular: true, grid: [r, c, n] });
      } else if (atual && clube && r === 2 && n >= 4 && (c === 1 || c === n) && !casar([p.name], ctx.athletes.filter((x) => x.clubeId === clube.id))) {
        semPar.push(`${p.name} (${clube.abreviacao})`);
      }
    }
  }
  return {
    id: `apif:${item.fixture.id}`,
    fonte: "apifootball",
    temporada: temporadaApi,
    rodada,
    em: item.fixture.date,
    clubes: [casaClube?.id ?? null, foraClube?.id ?? null],
    laterais,
    semPar,
    timesSemPar: timesSemPar.length ? timesSemPar : undefined,
    camisas,
    vazio: !algumaEscalacao || undefined,
    lidoEm: new Date(agora).toISOString(),
  };
}

const erroDePlano = (texto: string) => /plano gratuito|plan/i.test(texto);

/**
 * Um passo da API-Football: no máximo UMA chamada, só com cota sobrando e longe das
 * súmulas. Primeiro acha a temporada mais recente liberada pelo plano, lista os jogos
 * encerrados (Série A e B) e depois lê as escalações de 20 em 20 (`/fixtures?ids=`).
 */
export async function passoApiFootball(ctx: Contexto, of: OfficialState, agora = Date.now(), doFetch: typeof fetch = fetch): Promise<number> {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key || process.env.LADOS_APIFOOTBALL === "0") return 0;
  let f = fonte("apifootball", ctx.temporada);
  if (agora < (f.bloqueadoAte ?? 0)) return 0;
  // mesma regra das fotos: sobra de cota e nada de súmula prestes a sair
  const reserva = agora < of.bloqueadoAte ? 5 : 30;
  const gasto = of.quota.dia === new Date(agora).toISOString().slice(0, 10) ? of.quota.usadas : 0;
  if (Math.max(1, Number(process.env.API_FOOTBALL_DAILY_LIMIT ?? 90)) - gasto < reserva) return 0;
  if (of.quota.restantes != null && of.quota.restantes < reserva) return 0;
  const janela =
    agora >= of.bloqueadoAte &&
    [...of.fixtures.values()].some((x) => {
      const k = new Date(x.fixture.fixture.date).getTime();
      return !x.found && agora >= k - 90 * 60_000 && agora <= k + 15 * 60_000;
    });
  if (janela) return 0;

  const temporadaApi = f.temporadaApi ?? ctx.temporada;
  // temporada atual: só a Série A (a do Cartola); anteriores: também a B, de onde vêm os que subiram
  const ligas = temporadaApi === ctx.temporada ? [71] : LIGAS_API();
  const ligasLidas = f.ligasLidas ?? [];
  try {
    // 1) lista de jogos encerrados de cada liga (uma chamada por liga; renova a cada 12 h na temporada atual)
    const listaVelha = temporadaApi === ctx.temporada && f.listaEm && agora - new Date(f.listaEm).getTime() > 12 * HORA;
    const liga = listaVelha ? ligas[0] : ligas.find((l) => !ligasLidas.includes(l));
    if (liga != null) {
      if (!spend(of, agora)) return 0;
      try {
        const { response } = await apiPaged<ApiFixtureLista[]>(`/fixtures?league=${liga}&season=${temporadaApi}&status=FT-AET-PEN`, key, of, doFetch);
        const novos = (response ?? []).map((x) => ({ id: String(x.fixture.id), em: x.fixture.date }));
        const ids = new Set(f.eventos.map((e) => e.id));
        f = {
          ...f,
          temporadaApi,
          eventos: [...f.eventos, ...novos.filter((e) => !ids.has(e.id))],
          ligasLidas: listaVelha ? ligas.slice(0, 1) : [...ligasLidas, liga],
          listaEm: new Date(agora).toISOString(),
          erro: null,
        };
        db.ladosFontes.put(f);
      } catch (e) {
        const r = explainApiError(e);
        // o plano não abre esta temporada: tenta a anterior (até 4 anos para trás)
        if (erroDePlano(r.texto) && temporadaApi > ctx.temporada - 4) {
          db.ladosFontes.put({ ...f, temporadaApi: temporadaApi - 1, eventos: [], ligasLidas: [], negadas: [...(f.negadas ?? []), temporadaApi], erro: null });
          return 0;
        }
        throw e;
      }
      return 0;
    }

    // 2) escalações: 20 jogos por chamada (ou um por chamada, se o lote não trouxer escalações)
    const fila = pendentes(f, "apif", agora).slice(0, f.semLote ? 1 : 20);
    if (!fila.length) return 0;
    if (!spend(of, agora)) return 0;
    let itens: ApiFixtureComEscalacao[];
    if (f.semLote) {
      const e = fila[0];
      const lineups = await apiPaged<NonNullable<ApiFixtureComEscalacao["lineups"]>>(`/fixtures/lineups?fixture=${e.id}`, key, of, doFetch);
      const nomes = (lineups.response ?? []).map((l) => l.team.name);
      itens = [{ fixture: { id: Number(e.id), date: e.em }, teams: { home: { name: nomes[0] ?? "" }, away: { name: nomes[1] ?? "" } }, lineups: lineups.response ?? [] }];
    } else {
      itens = (await apiPaged<ApiFixtureComEscalacao[]>(`/fixtures?ids=${fila.map((x) => x.id).join("-")}`, key, of, doFetch)).response ?? [];
      // o lote veio sem o campo de escalações: daqui em diante, um jogo por chamada
      if (itens.length && !itens.some((x) => Array.isArray(x.lineups))) {
        db.ladosFontes.put({ ...f, semLote: true, erro: null });
        return 0;
      }
    }
    let lidos = 0;
    const vistos = new Set<string>();
    for (const item of itens) {
      const id = String(item.fixture.id);
      vistos.add(id);
      const row = lerJogoApi(item, temporadaApi, ctx, agora);
      if (row.vazio) f.tentativas[id] = (f.tentativas[id] ?? 0) + 1;
      else lidos++;
      db.ladosJogos.put(row);
    }
    // jogo pedido que não voltou: fica como "sem escalação" e volta para a fila mais tarde
    for (const e of fila)
      if (!vistos.has(e.id)) {
        f.tentativas[e.id] = (f.tentativas[e.id] ?? 0) + 1;
        db.ladosJogos.put(jogoVazio(`apif:${e.id}`, "apifootball", temporadaApi, e.em, agora));
      }
    db.ladosFontes.put({ ...f, erro: null, ultimaLeitura: new Date(agora).toISOString() });
    return lidos;
  } catch (e) {
    const r = explainApiError(e);
    db.ladosFontes.put({ ...f, erro: `API-Football: ${r.texto}`, bloqueadoAte: r.permanente ? new Date(new Date(agora + 86400_000).toISOString().slice(0, 10)).getTime() : agora + 30 * 60_000 });
    return 0;
  }
}

/* ------------------------------ combinação ----------------------------- */

export interface OrientacaoGrid {
  invertido: boolean;
  /** camisas 2/6 nas pontas que confirmam a orientação usada */
  confirmam: number;
  contrariam: number;
}

/** Conferência da orientação do grid pelas camisas 2 (direita) e 6 (esquerda). */
export function orientacaoGrid(rows: LadoJogoRow[]): OrientacaoGrid {
  let normal = 0;
  let invertida = 0;
  for (const r of rows) {
    if (!r.camisas) continue;
    normal += r.camisas.c2dir + r.camisas.c6esq;
    invertida += r.camisas.c2esq + r.camisas.c6dir;
  }
  const invertido = invertida >= 8 && invertida > normal * 2;
  return { invertido, confirmam: invertido ? invertida : normal, contrariam: invertido ? normal : invertida };
}

export interface LadoAuto {
  lado?: LadoLateral;
  /** pesos somados de cada lado (jogos como lateral/ala valem 1; outras posições do lado, menos) */
  e: number;
  d: number;
  /** jogos com o lado lido, na temporada atual e em temporadas anteriores */
  jogosAtual: number;
  jogosAnteriores: number;
  /** jogos de cada lado (contagem simples, para mostrar): nesta temporada e nas anteriores */
  atual: Record<LadoLateral, number>;
  anterior: Record<LadoLateral, number>;
  ambos: boolean;
  /** dividido na temporada, mas os últimos jogos são de um lado só: vale esse lado */
  pelosUltimos?: boolean;
  fontes: Array<"espn" | "apifootball">;
  temporadasAnteriores: number[];
  ultimo?: { rodada: number | null; temporada: number; posicao: string; lado: LadoLateral; fonte: "espn" | "apifootball" };
}

export interface LadosCombinados {
  porAtleta: Record<number, LadoAuto>;
  /** "rodada:atletaId" → lado em que jogou naquele jogo (temporada atual) */
  porJogo: Record<string, LadoLateral>;
  orientacao: OrientacaoGrid;
  versao: string;
}

/** Junta as escalações lidas: lado de cada jogo e lado do atleta pela maioria. */
export function combinarLados(rows: LadoJogoRow[], temporada: number): LadosCombinados {
  const orientacao = orientacaoGrid(rows.filter((r) => r.fonte === "apifootball"));
  const porAtleta: Record<number, LadoAuto> = {};
  const porJogo: Record<string, LadoLateral> = {};
  const fonteJogo: Record<string, "espn" | "apifootball"> = {};
  // jogos desta temporada de cada atleta (rodada → lado), para o desempate pelos últimos jogos
  const recentes = new Map<number, Map<number, LadoLateral>>();
  // ESPN primeiro: no mesmo jogo, a posição escrita vale mais que o desenho
  const ordenadas = [...rows].sort((a, b) => (a.fonte === b.fonte ? a.em.localeCompare(b.em) : a.fonte === "espn" ? -1 : 1));
  let h = 0;
  for (const r of ordenadas) {
    if (r.vazio) continue;
    const atual = r.temporada === temporada && r.rodada != null;
    for (const ev of r.laterais) {
      const lido = ladoDaEvidencia(ev, orientacao.invertido);
      if (!lido) continue;
      const k = `${r.rodada}:${ev.atletaId}`;
      if (atual) {
        if (fonteJogo[k] && fonteJogo[k] !== r.fonte) continue; // o mesmo jogo já contado pela outra fonte
        porJogo[k] = lido.lado;
        fonteJogo[k] = r.fonte;
        if (!recentes.has(ev.atletaId)) recentes.set(ev.atletaId, new Map());
        recentes.get(ev.atletaId)!.set(r.rodada!, lido.lado);
      }
      const peso = atual ? (lido.forte ? 1 : 0.35) : lido.forte ? 0.5 : 0.15;
      const s = (porAtleta[ev.atletaId] ??= { e: 0, d: 0, jogosAtual: 0, jogosAnteriores: 0, atual: { E: 0, D: 0 }, anterior: { E: 0, D: 0 }, ambos: false, fontes: [], temporadasAnteriores: [] });
      if (lido.lado === "E") s.e += peso;
      else s.d += peso;
      (atual ? s.atual : s.anterior)[lido.lado]++;
      if (atual) s.jogosAtual++;
      else {
        s.jogosAnteriores++;
        if (!s.temporadasAnteriores.includes(r.temporada)) s.temporadasAnteriores.push(r.temporada);
      }
      if (!s.fontes.includes(r.fonte)) s.fontes.push(r.fonte);
      const quando = (x?: LadoAuto["ultimo"]) => (x ? x.temporada * 100 + (x.rodada ?? 0) : -1);
      const este = { rodada: r.rodada, temporada: r.temporada, posicao: ev.posicao, lado: lido.lado, fonte: r.fonte };
      if (quando(este) >= quando(s.ultimo)) s.ultimo = este;
      h = (h * 31 + ev.atletaId * (lido.lado === "E" ? 3 : 7) + (r.rodada ?? 0)) | 0;
    }
  }
  for (const [id, s] of Object.entries(porAtleta)) {
    const total = s.e + s.d;
    const maior = Math.max(s.e, s.d);
    s.e = Math.round(s.e * 100) / 100;
    s.d = Math.round(s.d * 100) / 100;
    // pelo menos um jogo como lateral nesta temporada (ou dois em temporadas anteriores)
    if (total < 1) continue;
    if (maior / total >= 0.65) {
      s.lado = s.e > s.d ? "E" : "D";
      continue;
    }
    s.ambos = true;
    // dividido na temporada: se os últimos jogos (até 5) foram quase todos de um lado, é o lado de agora
    const ult = [...(recentes.get(Number(id)) ?? new Map<number, LadoLateral>())].sort((a, b) => b[0] - a[0]).slice(0, 5).map(([, l]) => l);
    const e = ult.filter((l) => l === "E").length;
    const d = ult.length - e;
    if (ult.length >= 3 && Math.max(e, d) / ult.length >= 0.8) {
      s.lado = e > d ? "E" : "D";
      s.pelosUltimos = true;
    }
  }
  return { porAtleta, porJogo, orientacao, versao: `${rows.length}:${(h >>> 0).toString(36)}` };
}

/* --------------------------- memória e passos -------------------------- */

let memo: { chave: string; valor: LadosCombinados } | null = null;

/** Lados automáticos da temporada (memorizado enquanto as escalações lidas não mudam). */
export function ladosAutomaticos(temporada: number): LadosCombinados {
  const rows = db.ladosJogos.all();
  const chave = `${temporada}:${rows.length}:${rows.reduce((m, r) => (r.lidoEm > m ? r.lidoEm : m), "")}`;
  if (memo?.chave === chave) return memo.valor;
  const valor = combinarLados(rows, temporada);
  memo = { chave, valor };
  return valor;
}

/** Ligado quando os dados são reais (ESPN e API-Football falam dos jogadores de verdade). */
export function ladosAutoLigado(source: string) {
  if (process.env.LADOS_AUTO === "0") return false;
  return source === "cartola" || process.env.LADOS_AUTO === "1";
}

let rodando = false;
let avisoTimer: ReturnType<typeof setTimeout> | null = null;

/** Recalcula a análise uma vez só depois de uma leva de escalações lidas. */
function avisarDepois() {
  if (avisoTimer) clearTimeout(avisoTimer);
  avisoTimer = setTimeout(() => {
    avisoTimer = null;
    void import("./cache").then(({ invalidate }) => {
      invalidate("analysis:");
      emit("dados");
    });
  }, 4000);
  avisoTimer.unref?.();
}

/**
 * Um passo das duas fontes (vigia: a cada minuto; botão do Painel ADM: até o tempo
 * acabar). Devolve quantos jogos novos foram lidos.
 */
export async function passoLados(ctx: Contexto, of: OfficialState | null, opts: { maxEspn?: number; ateMs?: number } = {}, doFetch: typeof fetch = fetch): Promise<number> {
  if (rodando) return 0;
  rodando = true;
  try {
    await syncRemote();
    let lidos = 0;
    const ate = opts.ateMs ?? 0;
    do {
      const r = await passoEspn(ctx, opts.maxEspn ?? 4, Date.now(), doFetch);
      lidos += r.lidos;
      if (!r.processados) break;
    } while (Date.now() < ate);
    if (of) lidos += await passoApiFootball(ctx, of, Date.now(), doFetch);
    await flushRemote();
    if (lidos) avisarDepois();
    return lidos;
  } finally {
    rodando = false;
  }
}

/** Resumo para o Painel ADM: fontes, progresso e evidências por atleta. */
export function resumoLados(temporada: number, athletes: Athlete[], ligado: boolean, lista: ResultadoLista | null = null) {
  const comb = ladosAutomaticos(temporada);
  const rows = db.ladosJogos.all();
  const manuais = new Map(db.lados.all().map((l) => [l.atletaId, l] as const));
  const resumoFonte = (id: FonteLadoRow["id"], prefixo: string) => {
    const f = db.ladosFontes.get(id);
    const minhas = rows.filter((r) => r.fonte === id);
    return {
      temporadaConsultada: f?.temporadaApi ?? f?.temporada ?? null,
      negadas: f?.negadas ?? [],
      jogosNaLista: f?.eventos.length ?? 0,
      jogosLidos: minhas.filter((r) => !r.vazio).length,
      semEscalacao: minhas.filter((r) => r.vazio).length,
      pendentes: f ? pendentes(f, prefixo, Date.now()).length : 0,
      lateraisEncontrados: minhas.reduce((s, r) => s + r.laterais.length, 0),
      listaEm: f?.listaEm ?? null,
      ultimaLeitura: f?.ultimaLeitura ?? null,
      erro: f?.erro ?? null,
    };
  };
  const daTemporada = rows.filter((r) => r.temporada === temporada && !r.vazio);
  const semPar = [...new Set(daTemporada.flatMap((r) => r.semPar))].slice(0, 40);
  const timesSemPar = [...new Set(daTemporada.flatMap((r) => r.timesSemPar ?? []))];
  // jogo desta temporada que não achamos no calendário do Cartola (não entra no lado por jogo)
  const jogosSemRodada = daTemporada.filter((r) => r.rodada == null).length;
  const porAtleta: Record<number, { auto: LadoAuto | null; manual: LadoLateral | null; lista: LadoLateral | null; nomeLista: string | null }> = {};
  for (const a of athletes) {
    if (a.posicaoId !== 2) continue;
    porAtleta[a.id] = { auto: comb.porAtleta[a.id] ?? null, manual: manuais.get(a.id)?.lado ?? null, lista: lista?.lados[a.id] ?? null, nomeLista: lista?.nomes[a.id] ?? null };
  }
  return {
    ligado,
    temporada,
    espn: resumoFonte("espn", "espn"),
    apiFootball: { ...resumoFonte("apifootball", "apif"), chave: Boolean(process.env.API_FOOTBALL_KEY) },
    orientacao: comb.orientacao,
    jogosComLado: Object.keys(comb.porJogo).length,
    semPar,
    timesSemPar,
    jogosSemRodada,
    porAtleta,
    lista: lista && { total: lista.total, casados: Object.keys(lista.lados).length, semPar: lista.semPar, conflitos: lista.conflitos },
  };
}

export type ResumoLados = ReturnType<typeof resumoLados>;
