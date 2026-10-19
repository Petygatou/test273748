/**
 * Rostos reais via API-Football (somente servidor).
 *
 * A API entrega o elenco de cada time com a foto de cada jogador
 * (`/players/squads?team=ID`). Gastamos ~20 chamadas UMA vez por temporada
 * (1 time por minuto, só quando sobra cota além da reserva das escalações),
 * casamos os nomes com os atletas do Cartola e guardamos o mapa em disco.
 * Atleta que o Cartola já manda com foto não é tocado.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Athlete, Club } from "../engine/types";
import { dataDir } from "./db";
import { api, dailyLimit, explainApiError, matchClub, matchPlayer, spend, type OfficialState } from "./escalacoes";

interface SquadResponse {
  team: { id: number; name: string };
  players: Array<{ id: number; name: string; photo?: string }>;
}

export interface FotosState {
  temporada: number;
  /** atleta do Cartola → URL da foto */
  porAtleta: Record<number, string>;
  /** time da API → quando o elenco foi lido */
  times: Record<number, string>;
  naoCasados: number;
  /** time da API → nome, descoberto por /teams?country=Brazil (1 chamada, sem precisar de temporada) */
  descobertos: Record<number, string>;
  descobertosEm: string;
  bloqueadoAte: number;
  erro: string | null;
}

const file = () => join(dataDir(), "fotos-apifootball.json");
const REFRESH_MS = 30 * 86400_000;
/** só gasta chamadas de foto se sobrarem pelo menos isto no dia (reserva para as escalações) */
const RESERVA = 30;

let mem: FotosState | null = null;

export function loadFotos(temporada: number): FotosState {
  if (mem && mem.temporada === temporada) return mem;
  try {
    const j = JSON.parse(readFileSync(file(), "utf8")) as FotosState;
    if (j.temporada === temporada) return (mem = { ...j, descobertos: j.descobertos ?? {}, descobertosEm: j.descobertosEm ?? "", bloqueadoAte: j.bloqueadoAte ?? 0, erro: j.erro ?? null });
  } catch {
    /* primeira execução */
  }
  return (mem = { temporada, porAtleta: {}, times: {}, naoCasados: 0, descobertos: {}, descobertosEm: "", bloqueadoAte: 0, erro: null });
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
export const fotosResumo = (athletes: Athlete[]) => {
  const m = mem?.porAtleta ?? {};
  return { mapeadas: Object.keys(m).length, atletas: athletes.length, timesLidos: Object.keys(mem?.times ?? {}).length, naoCasados: mem?.naoCasados ?? 0, erro: mem?.erro ?? null };
};

/** Mescla as fotos da API-Football nos atletas que o Cartola mandou sem foto. */
export function withFotos(athletes: Athlete[]): Athlete[] {
  const m = mem?.porAtleta;
  if (!m || !Object.keys(m).length) return athletes;
  return athletes.map((a) => (a.foto || !m[a.id] ? a : { ...a, foto: m[a.id] }));
}

/**
 * Um passo (chamado a cada minuto pelo vigia): lê no máximo UM elenco por vez.
 * Retorna true se algo novo foi mapeado.
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
  const gasto = () => (of.quota.dia === new Date(now).toISOString().slice(0, 10) ? of.quota.usadas : 0);
  if (dailyLimit() - gasto() < RESERVA) return false;
  if (of.quota.restantes != null && of.quota.restantes < RESERVA) return false;
  try {
    // 1) descobre os times do Brasil (1 chamada; não depende da temporada, então funciona no plano gratuito)
    if (!Object.keys(st.descobertos).length || now - new Date(st.descobertosEm || 0).getTime() > REFRESH_MS) {
      if (!spend(of, now)) return false;
      const list = await api<Array<{ team: { id: number; name: string; national?: boolean } }>>("/teams?country=Brazil", key, of, doFetch);
      st.descobertos = {};
      for (const t of list ?? []) {
        // ignora seleções, base e feminino
        if (t.team.national || /\b(u-?\d\d|w|women|feminino|b)\b/i.test(t.team.name)) continue;
        if (matchClub(t.team.name, clubs)) st.descobertos[t.team.id] = t.team.name;
      }
      st.descobertosEm = new Date(now).toISOString();
      st.erro = null;
      saveFotos(st);
      return false;
    }
  } catch (e) {
    const r = explainApiError(e);
    st.erro = r.texto;
    st.bloqueadoAte = r.permanente ? new Date(new Date(now + 86400_000).toISOString().slice(0, 10)).getTime() : now + 30 * 60_000;
    saveFotos(st);
    return false;
  }
  const alvo = Object.entries(st.descobertos).map(([id, n]) => [Number(id), n] as [number, string]).find(([id]) => !st.times[id] || now - new Date(st.times[id]).getTime() > REFRESH_MS);
  if (!alvo) return false;
  // nunca gasta com jogo na janela das escalações
  const janela = [...of.fixtures.values()].some((f) => {
    const k = new Date(f.fixture.fixture.date).getTime();
    return !f.found && now >= k - 90 * 60_000 && now <= k + 15 * 60_000;
  });
  if (janela) return false;
  if (!spend(of, now)) return false;
  const [teamId, teamName] = alvo;
  try {
    const list = await api<SquadResponse[]>(`/players/squads?team=${teamId}`, key, of, doFetch);
    st.times[teamId] = new Date(now).toISOString();
    const club = matchClub(teamName, clubs);
    const squad = list?.[0]?.players ?? [];
    if (club) {
      const mine = athletes.filter((a) => a.clubeId === club.id && a.posicaoId !== 6);
      const used = new Set<number>();
      for (const p of squad) {
        const a = matchPlayer(p.name, mine.filter((x) => !used.has(x.id)));
        if (!a) {
          st.naoCasados++;
          continue;
        }
        used.add(a.id);
        st.porAtleta[a.id] = p.photo || `https://media.api-sports.io/football/players/${p.id}.png`;
      }
    }
    saveFotos(st);
    return true;
  } catch (e) {
    const r = explainApiError(e);
    st.erro = r.texto;
    st.bloqueadoAte = r.permanente ? new Date(new Date(now + 86400_000).toISOString().slice(0, 10)).getTime() : now + 30 * 60_000;
    saveFotos(st);
    return false;
  }
}
