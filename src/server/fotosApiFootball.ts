/**
 * Rostos reais via API-Football (somente servidor).
 *
 * Caminho preferido: o elenco atual de cada time (`/players/squads?team=ID`),
 * ~20 chamadas uma vez. Se o plano não liberar (o gratuito só abre as
 * temporadas 2022–2024), usamos a temporada liberada (`/players?team=ID&
 * season=2024`, páginas de 20): o rosto é o mesmo, só não aparecem os
 * contratados depois. Sempre 1 chamada por minuto, só com cota sobrando,
 * nomes casados com os atletas do Cartola e o mapa salvo em disco.
 * Atleta que o Cartola já manda com foto real não é tocado.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Athlete, Club } from "../engine/types";
import { dataDir } from "./db";
import { apiPaged, dailyLimit, explainApiError, matchClub, matchPlayer, norm, spend, type OfficialState } from "./escalacoes";

interface SquadResponse {
  team: { id: number; name: string };
  players: Array<{ id: number; name: string; photo?: string }>;
}

interface PlayerItem {
  player: { id: number; name: string; firstname?: string; lastname?: string; photo?: string };
}

export interface FotosState {
  temporada: number;
  /** atleta do Cartola → URL da foto */
  porAtleta: Record<number, string>;
  /** time da API → quando o elenco foi lido por completo */
  times: Record<number, string>;
  naoCasados: number;
  /** nomes da API que não casaram com nenhum atleta do Cartola (para o admin conferir) */
  semPar: Array<{ nome: string; time: string }>;
  /** time da API → nome */
  descobertos: Record<number, string>;
  descobertosEm: string;
  /** "elenco": /players/squads · "temporada": /players?season= (plano gratuito) */
  modo: "elenco" | "temporada";
  /** próxima página a ler, por time, no modo temporada */
  paginas: Record<number, number>;
  bloqueadoAte: number;
  erro: string | null;
}

const file = () => join(dataDir(), "fotos-apifootball.json");
const REFRESH_MS = 30 * 86400_000;
/** temporada usada quando o plano não abre a atual */
export const photoSeason = () => Number(process.env.API_FOOTBALL_PHOTO_SEASON ?? 2024);

let mem: FotosState | null = null;

const empty = (temporada: number): FotosState => ({
  temporada,
  porAtleta: {},
  times: {},
  naoCasados: 0,
  semPar: [],
  descobertos: {},
  descobertosEm: "",
  modo: "elenco",
  paginas: {},
  bloqueadoAte: 0,
  erro: null,
});

export function loadFotos(temporada: number): FotosState {
  if (mem && mem.temporada === temporada) return mem;
  try {
    const j = JSON.parse(readFileSync(file(), "utf8")) as Partial<FotosState>;
    if (j.temporada === temporada) return (mem = { ...empty(temporada), ...j } as FotosState);
  } catch {
    /* primeira execução */
  }
  return (mem = empty(temporada));
}

/** Só para testes: começa do zero. */
export function resetFotos(temporada: number) {
  mem = empty(temporada);
}

function saveFotos(st: FotosState) {
  try {
    mkdirSync(dataDir(), { recursive: true });
    writeFileSync(file() + ".tmp", JSON.stringify(st));
    renameSync(file() + ".tmp", file());
  } catch {
    /* disco somente leitura: segue em memória */
  }
}

export const fotosMap = (): Record<number, string> => mem?.porAtleta ?? {};
export const fotosSemPar = () => mem?.semPar ?? [];
export const fotosResumo = (athletes: Athlete[]) => {
  const m = mem?.porAtleta ?? {};
  return {
    mapeadas: Object.keys(m).length,
    atletas: athletes.length,
    timesLidos: Object.keys(mem?.times ?? {}).length,
    timesTotal: Object.keys(mem?.descobertos ?? {}).length,
    naoCasados: mem?.naoCasados ?? 0,
    modo: mem?.modo ?? "elenco",
    temporadaFoto: mem?.modo === "temporada" ? photoSeason() : null,
    erro: mem?.erro ?? null,
  };
};

/** Mescla as fotos da API-Football nos atletas que o Cartola mandou sem foto. */
export function withFotos(athletes: Athlete[]): Athlete[] {
  const m = mem?.porAtleta;
  if (!m || !Object.keys(m).length) return athletes;
  return athletes.map((a) => (a.foto || !m[a.id] ? a : { ...a, foto: m[a.id] }));
}

const isPlanError = (texto: string) => /plano gratuito|plan/i.test(texto);
const nextDay = (now: number) => new Date(new Date(now + 86400_000).toISOString().slice(0, 10)).getTime();

/**
 * Casa um jogador da API: primeiro no clube atual; se não achar, no mercado
 * inteiro, mas só com nome completo idêntico e único (quem trocou de clube).
 */
function assign(st: FotosState, names: string[], photo: string, mine: Athlete[], all: Athlete[], taken: Set<number>, time = "") {
  for (const n of names) {
    if (!n) continue;
    const a = matchPlayer(n, mine.filter((x) => !taken.has(x.id)));
    if (a) {
      taken.add(a.id);
      st.porAtleta[a.id] = photo;
      return true;
    }
  }
  const full = names.map((n) => norm(n)).filter((n) => n.split(" ").length >= 2);
  for (const n of full) {
    const hits = all.filter((a) => a.posicaoId !== 6 && !st.porAtleta[a.id] && norm(a.nome ?? "") === n);
    if (hits.length === 1) {
      st.porAtleta[hits[0].id] = photo;
      return true;
    }
  }
  st.naoCasados++;
  if (st.semPar.length < 400) st.semPar.push({ nome: names.find(Boolean) ?? "?", time });
  return false;
}

/**
 * Um passo (chamado a cada minuto pelo vigia): no máximo UMA chamada.
 * Retorna true se algum rosto novo foi mapeado.
 */
export async function stepFotos(
  of: OfficialState,
  athletes: Athlete[],
  clubs: Record<number, Club>,
  temporada: number,
  now = Date.now(),
  doFetch: typeof fetch = fetch,
): Promise<boolean> {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key || process.env.FOTOS_APIFOOTBALL === "0") return false;
  const st = loadFotos(temporada);
  if (now < st.bloqueadoAte) return false;
  // se a escalação oficial está travada pelo plano, ela não vai usar a cota: a reserva pode ser pequena
  const reserva = now < of.bloqueadoAte ? 5 : 30;
  const gasto = of.quota.dia === new Date(now).toISOString().slice(0, 10) ? of.quota.usadas : 0;
  if (dailyLimit() - gasto < reserva) return false;
  if (of.quota.restantes != null && of.quota.restantes < reserva) return false;
  // nunca disputa a cota com uma súmula prestes a sair
  const janela = now >= of.bloqueadoAte && [...of.fixtures.values()].some((f) => {
    const k = new Date(f.fixture.fixture.date).getTime();
    return !f.found && now >= k - 90 * 60_000 && now <= k + 15 * 60_000;
  });
  if (janela) return false;

  const fail = (e: unknown) => {
    const r = explainApiError(e);
    st.erro = r.texto;
    st.bloqueadoAte = r.permanente ? nextDay(now) : now + 30 * 60_000;
    saveFotos(st);
    return false;
  };

  // 1) descobre os times: pelo país (sem temporada); se o plano barrar, pelas ligas da temporada liberada
  if (!Object.keys(st.descobertos).length || now - new Date(st.descobertosEm || 0).getTime() > REFRESH_MS) {
    if (!spend(of, now)) return false;
    const add = (list: Array<{ team: { id: number; name: string; national?: boolean } }> | undefined) => {
      for (const t of list ?? []) {
        if (t.team.national || /\b(u-?\d\d|w|women|feminino|b)\b/i.test(t.team.name)) continue;
        if (matchClub(t.team.name, clubs)) st.descobertos[t.team.id] = t.team.name;
      }
    };
    try {
      const { response } = await apiPaged<Array<{ team: { id: number; name: string; national?: boolean } }>>("/teams?country=Brazil", key, of, doFetch);
      add(response);
    } catch (e) {
      const r = explainApiError(e);
      if (!isPlanError(r.texto)) return fail(e);
      // Série A e Série B da temporada liberada cobrem os clubes atuais (inclusive os que subiram)
      try {
        const { response } = await apiPaged<Array<{ team: { id: number; name: string } }>>(`/teams?league=71&season=${photoSeason()}`, key, of, doFetch);
        add(response);
        if (spend(of, now)) add((await apiPaged<Array<{ team: { id: number; name: string } }>>(`/teams?league=72&season=${photoSeason()}`, key, of, doFetch)).response);
      } catch (e2) {
        return fail(e2);
      }
    }
    st.descobertosEm = new Date(now).toISOString();
    st.erro = null;
    saveFotos(st);
    return false;
  }

  const alvo = Object.entries(st.descobertos)
    .map(([id, n]) => [Number(id), n] as [number, string])
    .find(([id]) => !st.times[id] || now - new Date(st.times[id]).getTime() > REFRESH_MS);
  if (!alvo) return false;
  if (!spend(of, now)) return false;
  const [teamId, teamName] = alvo;
  const club = matchClub(teamName, clubs);
  const mine = club ? athletes.filter((a) => a.clubeId === club.id && a.posicaoId !== 6) : [];
  const taken = new Set<number>(mine.filter((a) => st.porAtleta[a.id]).map((a) => a.id));
  const antes = Object.keys(st.porAtleta).length;

  try {
    if (st.modo === "elenco") {
      try {
        const { response } = await apiPaged<SquadResponse[]>(`/players/squads?team=${teamId}`, key, of, doFetch);
        for (const p of response?.[0]?.players ?? []) assign(st, [p.name], p.photo || `https://media.api-sports.io/football/players/${p.id}.png`, mine, athletes, taken, teamName);
        st.times[teamId] = new Date(now).toISOString();
      } catch (e) {
        const r = explainApiError(e);
        if (!isPlanError(r.texto)) throw e;
        // o plano não abre o elenco atual: passa a usar a temporada liberada (próximos minutos)
        st.modo = "temporada";
        st.erro = null;
        saveFotos(st);
        return false;
      }
    } else {
      const page = st.paginas[teamId] ?? 1;
      const { response, paging } = await apiPaged<PlayerItem[]>(`/players?team=${teamId}&season=${photoSeason()}&page=${page}`, key, of, doFetch);
      for (const it of response ?? []) {
        const pl = it.player;
        const full = [pl.firstname, pl.lastname].filter(Boolean).join(" ");
        assign(st, [pl.name, full], pl.photo || `https://media.api-sports.io/football/players/${pl.id}.png`, mine, athletes, taken, teamName);
      }
      const total = paging?.total ?? 1;
      if (page >= total) {
        st.times[teamId] = new Date(now).toISOString();
        delete st.paginas[teamId];
      } else st.paginas[teamId] = page + 1;
    }
    st.erro = null;
    saveFotos(st);
    return Object.keys(st.porAtleta).length > antes;
  } catch (e) {
    return fail(e);
  }
}
