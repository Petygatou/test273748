/**
 * "vs Adversário": quem da mesma posição já enfrentou um time, jogo a jogo.
 *
 * Para o próximo adversário de um atleta, lista cada jogo da temporada desse
 * adversário e os atletas da posição pedida que jogaram contra ele: rodada,
 * mando (de quem enfrentou), clube, placar, pontos e scouts. Tudo vem do
 * histórico real da temporada (pontuados do Cartola), nada é estimado.
 */
import type { PositionId } from "../engine/rules";
import type { PlayerRound, SeasonData } from "../engine/types";

export interface VsAtleta {
  atletaId: number;
  apelido: string;
  pontos: number;
  scout: Record<string, number>;
}

export interface VsJogo {
  rodada: number;
  data?: string;
  /** mando de quem ENFRENTOU o adversário */
  mando: "casa" | "fora";
  /** clube de quem enfrentou */
  clubeId: number;
  /** gols de quem enfrentou x gols do adversário */
  placar: [number, number] | null;
  atletas: VsAtleta[];
}

export interface VsAdversario {
  adversarioId: number;
  posicaoId: PositionId;
  rodadaAtual: number;
  /** média da liga para a posição (quem entrou em campo), para comparar */
  mediaLiga: number;
  jogos: VsJogo[];
}

// índice rodada:clube → linhas do histórico, montado uma vez por temporada carregada
const indices = new WeakMap<PlayerRound[], Map<string, PlayerRound[]>>();
function indice(history: PlayerRound[]) {
  let idx = indices.get(history);
  if (!idx) {
    idx = new Map();
    for (const pr of history) {
      const k = `${pr.rodada}:${pr.clubeId}`;
      const l = idx.get(k);
      if (l) l.push(pr);
      else idx.set(k, [pr]);
    }
    indices.set(history, idx);
  }
  return idx;
}

export function vsAdversario(data: SeasonData, adversarioId: number, posicaoId: PositionId): VsAdversario {
  const idx = indice(data.history);
  const nomes = new Map(data.athletes.map((a) => [a.id, a.apelido] as const));
  const jogos: VsJogo[] = [];
  for (const m of data.matches) {
    if (m.rodada >= data.rodadaAtual || m.golsCasa == null || m.golsFora == null) continue;
    const advEmCasa = m.casaId === adversarioId;
    if (!advEmCasa && m.foraId !== adversarioId) continue;
    const clubeId = advEmCasa ? m.foraId : m.casaId;
    const atletas = (idx.get(`${m.rodada}:${clubeId}`) ?? [])
      .filter((pr) => pr.posicaoId === posicaoId)
      .map((pr) => ({
        atletaId: pr.atletaId,
        apelido: nomes.get(pr.atletaId) ?? `Atleta ${pr.atletaId}`,
        pontos: Math.round(pr.pontos * 100) / 100,
        scout: Object.fromEntries(Object.entries(pr.scout).filter(([, v]) => typeof v === "number" && v !== 0)) as Record<string, number>,
      }))
      .sort((x, y) => y.pontos - x.pontos);
    jogos.push({
      rodada: m.rodada,
      data: m.data,
      mando: advEmCasa ? "fora" : "casa",
      clubeId,
      placar: advEmCasa ? [m.golsFora, m.golsCasa] : [m.golsCasa, m.golsFora],
      atletas,
    });
  }
  jogos.sort((x, y) => y.rodada - x.rodada);

  let soma = 0;
  let n = 0;
  for (const pr of data.history) {
    if (pr.posicaoId !== posicaoId || pr.rodada >= data.rodadaAtual) continue;
    soma += pr.pontos;
    n++;
  }
  return { adversarioId, posicaoId, rodadaAtual: data.rodadaAtual, mediaLiga: n ? Math.round((soma / n) * 100) / 100 : 0, jogos };
}
