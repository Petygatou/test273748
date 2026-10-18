/**
 * Cliente da API pública do Cartola FC (somente servidor).
 *
 * Monta a temporada completa a partir de:
 *  - /mercado/status            rodada atual e status do mercado
 *  - /atletas/mercado           atletas, preços, status, médias, Gato Mestre
 *  - /partidas/{r}              jogos e placares de cada rodada
 *  - /atletas/pontuados/{r}     scouts de cada atleta em cada rodada passada
 *  - /mercado/destaques         mais escalados (efeito manada)
 *
 * Rodadas encerradas não mudam → cache longo. Mercado e status → cache curto.
 * A cada leitura do mercado gravamos um snapshot (preço/variação/status por
 * rodada): com o tempo isso calibra o MPV e a chance de jogar com dados reais.
 */
import { normalizeFoto } from "./foto";
import type { PositionId, Scouts } from "../engine/rules";
import { normalizeHistoryScouts } from "../engine/rulesCheck";
import type { Athlete, Club, Match, PlayerRound, SeasonData } from "../engine/types";
import { cached, pool } from "./cache";
import { cartola } from "./cartolaHttp";
import { enrichHistory, loadSnapshots, saveSnapshot } from "./snapshots";

async function getJson<T>(path: string, timeoutMs = 10_000): Promise<T> {
  return cartola<T>(path, { timeoutMs });
}

/* --------------------------- formatos crus --------------------------- */

interface RawStatus {
  rodada_atual: number;
  status_mercado: number;
  temporada: number;
  times_escalados?: number;
  fechamento?: { timestamp?: number };
}

interface RawClube {
  id: number;
  nome: string;
  abreviacao: string;
  nome_fantasia?: string;
  escudos?: Record<string, string>;
}

interface RawAtleta {
  atleta_id: number;
  apelido: string;
  nome?: string;
  foto?: string | null;
  clube_id: number;
  posicao_id: number;
  status_id: number;
  pontos_num: number;
  media_num: number;
  variacao_num: number;
  preco_num: number;
  jogos_num: number;
  minimo_para_valorizar?: number | null;
  gato_mestre?: {
    media_pontos_mandante?: number;
    media_pontos_visitante?: number;
    media_minutos_jogados?: number;
    minimo_para_valorizar?: number;
  };
}

interface RawMercado {
  atletas: RawAtleta[];
  clubes: Record<string, RawClube>;
}

interface RawPartida {
  partida_id: number;
  clube_casa_id: number;
  clube_visitante_id: number;
  placar_oficial_mandante: number | null;
  placar_oficial_visitante: number | null;
  partida_data?: string;
  timestamp?: number;
  local?: string;
  valida?: boolean;
  status_transmissao_tr?: string;
}

interface RawPartidas {
  partidas: RawPartida[];
  rodada: number;
}

interface RawPontuado {
  apelido: string;
  pontuacao: number;
  scout?: Scouts | null;
  posicao_id: number;
  clube_id: number;
  entrou_em_campo?: boolean;
}

interface RawPontuados {
  atletas?: Record<string, RawPontuado>;
  rodada?: number;
}

interface RawDestaque {
  Atleta?: { atleta_id: number };
  escalacoes?: number;
}

/* --------------------------- endpoints --------------------------- */

export const getStatus = () => cached("cartola:status", 25_000, () => getJson<RawStatus>("/mercado/status"));
const getMercado = () => cached("cartola:mercado", 40_000, () => getJson<RawMercado>("/atletas/mercado"));
const getPartidas = (r: number, current: boolean) =>
  cached(`cartola:partidas:${r}`, current ? 45_000 : 12 * 3600_000, () => getJson<RawPartidas>(`/partidas/${r}`));
const getPontuados = (r: number, recent: boolean) =>
  cached(`cartola:pontuados:${r}`, recent ? 10 * 60_000 : 24 * 3600_000, () => getJson<RawPontuados>(`/atletas/pontuados/${r}`));
const getDestaques = () =>
  cached("cartola:destaques", 10 * 60_000, () => getJson<RawDestaque[]>("/mercado/destaques").catch(() => [] as RawDestaque[]));

/** Parciais ao vivo da rodada em andamento. */
export const getLivePontuados = () =>
  cached("cartola:pontuados:live", 45_000, () => getJson<RawPontuados>("/atletas/pontuados"));
export const getLivePartidas = () => cached("cartola:partidas:live", 45_000, () => getJson<RawPartidas>("/partidas"));

/* --------------------------- normalização --------------------------- */

const foto = normalizeFoto;

function toMatch(p: RawPartida, rodada: number): Match {
  const data = p.timestamp ? new Date(p.timestamp * 1000).toISOString() : p.partida_data ? new Date(p.partida_data.replace(" ", "T") + "-03:00").toISOString() : undefined;
  return {
    id: p.partida_id,
    rodada,
    casaId: p.clube_casa_id,
    foraId: p.clube_visitante_id,
    golsCasa: p.placar_oficial_mandante,
    golsFora: p.placar_oficial_visitante,
    data,
    local: p.local,
    valida: p.valida !== false,
  };
}

export async function fetchCartolaSeason(): Promise<SeasonData> {
  const status = await getStatus();
  const R = status.rodada_atual;
  const mercado = await getMercado();

  const clubs: Record<number, Club> = {};
  for (const c of Object.values(mercado.clubes ?? {})) {
    if (!c?.id || c.id === 1) continue;
    clubs[c.id] = { id: c.id, nome: c.nome_fantasia || c.nome, abreviacao: c.abreviacao, escudo: c.escudos?.["60x60"] ?? c.escudos?.["45x45"] };
  }

  const athletes: Athlete[] = mercado.atletas
    .filter((a) => clubs[a.clube_id])
    .map((a) => ({
      id: a.atleta_id,
      apelido: a.apelido,
      nome: a.nome,
      foto: foto(a.foto),
      clubeId: a.clube_id,
      posicaoId: a.posicao_id as PositionId,
      statusId: a.status_id,
      preco: a.preco_num,
      variacao: a.variacao_num,
      media: a.media_num,
      jogos: a.jogos_num,
      pontosUltima: a.pontos_num,
      gatoMestre: {
        mpv: a.gato_mestre?.minimo_para_valorizar ?? a.minimo_para_valorizar ?? undefined,
        mediaMandante: a.gato_mestre?.media_pontos_mandante,
        mediaVisitante: a.gato_mestre?.media_pontos_visitante,
        minutosMedia: a.gato_mestre?.media_minutos_jogados,
      },
    }));

  const rounds = Array.from({ length: Math.min(38, Math.max(R, 1)) }, (_, i) => i + 1);
  const partidas = await pool(rounds, 6, async (r) => {
    try {
      const p = await getPartidas(r, r >= R - 1);
      return (p.partidas ?? []).map((x) => toMatch(x, r));
    } catch {
      return [] as Match[];
    }
  });
  const matches = partidas.flat();

  const past = rounds.filter((r) => r < R);
  const pontuados = await pool(past, 6, async (r) => {
    try {
      const p = await getPontuados(r, r >= R - 2);
      const rows: PlayerRound[] = [];
      for (const [id, v] of Object.entries(p.atletas ?? {})) {
        if (v.entrou_em_campo === false) continue;
        rows.push({
          atletaId: Number(id),
          rodada: r,
          clubeId: v.clube_id,
          posicaoId: v.posicao_id as PositionId,
          pontos: v.pontuacao,
          scout: v.scout ?? {},
        });
      }
      return rows;
    } catch {
      return [] as PlayerRound[];
    }
  });
  // salvaguarda: converte scouts acumulados em scouts por rodada, se for o caso
  const { history: rawHistory } = normalizeHistoryScouts(pontuados.flat());
  if (status.status_mercado === 1) await saveSnapshot(status.temporada, R, athletes);
  const snaps = await loadSnapshots(status.temporada);
  const history = enrichHistory(rawHistory, snaps);
  // status antes de cada rodada (último retrato com o mercado aberto) → ensina a chance de jogar
  const statusHistory: Record<number, Record<number, number>> = {};
  for (const [rodada, snap] of snaps) {
    if (rodada > R) continue;
    statusHistory[rodada] = Object.fromEntries(Object.entries(snap.atletas).map(([id, v]) => [Number(id), v[1]]));
  }

  const destaques = await getDestaques();
  const ownership: Record<number, number> = {};
  for (const d of destaques) if (d.Atleta?.atleta_id && d.escalacoes) ownership[d.Atleta.atleta_id] = d.escalacoes;

  return {
    temporada: status.temporada,
    rodadaAtual: R,
    mercadoStatus: status.status_mercado,
    fechamento: status.fechamento?.timestamp ? new Date(status.fechamento.timestamp * 1000).toISOString() : undefined,
    timesEscalados: status.times_escalados,
    clubs,
    athletes,
    matches,
    history,
    ownership,
    overrides: {},
    statusHistory,
    source: "cartola",
    updatedAt: new Date().toISOString(),
  };
}

export type { RawPontuados, RawPartidas };
