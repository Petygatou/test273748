/**
 * Campinhos: gols da temporada classificados à mão pela equipe (posição de quem fez,
 * posição de quem deu a assistência e forma do gol) e somados por posição no campinho.
 *
 *  - Ataque de um time: gols e assistências que ele FEZ, por posição de quem fez.
 *  - Defesa de um time: gols e assistências que ele SOFREU, por posição de quem fez
 *    (o atacante adversário). Gol contra conta no total, mas não tem posição.
 */

export const POSICOES_CAMPINHO = ["CENTRO", "PONTE", "PONTD", "MEI", "VOL", "LATE", "LATD", "ZAG"] as const;
export type PosCampinho = (typeof POSICOES_CAMPINHO)[number];

export const NOME_POSICAO: Record<PosCampinho, string> = {
  CENTRO: "Centroavante",
  PONTE: "Ponta esquerda",
  PONTD: "Ponta direita",
  MEI: "Meia",
  VOL: "Volante",
  LATE: "Lateral esquerdo",
  LATD: "Lateral direito",
  ZAG: "Zagueiro",
};

export const FORMAS_GOL = ["dentro", "fora", "penalti", "cabeca", "falta", "contra"] as const;
export type FormaGol = (typeof FORMAS_GOL)[number];

export const NOME_FORMA: Record<FormaGol, string> = { dentro: "Dentro da área", fora: "Fora da área", penalti: "Pênalti", cabeca: "Cabeça", falta: "Falta", contra: "Gol contra" };

export interface GolLancado {
  id: string;
  temporada: number;
  rodada: number;
  matchId: number;
  /** time que fez o gol */
  clubeId: number;
  adversarioId: number;
  /** o time que fez o gol jogava em casa */
  casa: boolean;
  forma: FormaGol;
  /** posição de quem fez (null no gol contra) */
  gol: PosCampinho | null;
  assist: PosCampinho | null;
  criadoEm: string;
  por: string;
}

export interface PartidaCampinho {
  matchId: number;
  rodada: number;
  casaId: number;
  foraId: number;
  golsCasa: number | null;
  golsFora: number | null;
}

export interface FiltroCampinho {
  /** "todos" = campeonato inteiro; número = últimos N jogos do time (com placar) */
  periodo: "todos" | number;
  /** mando do time analisado */
  mando: "geral" | "casa" | "fora";
  forma: "todas" | FormaGol;
  /** só jogos antes desta rodada (ex.: a rodada que vai ser jogada) */
  antesDe?: number;
}

export interface Campinho {
  gols: Record<PosCampinho, number>;
  assist: Record<PosCampinho, number>;
  totalGols: number;
  totalAssist: number;
  /** jogos do time que entraram no recorte */
  jogos: number;
}

const zerado = () => Object.fromEntries(POSICOES_CAMPINHO.map((p) => [p, 0])) as Record<PosCampinho, number>;

/** Rodadas dos jogos do time que entram no recorte (do mais recente para o mais antigo). */
export function jogosDoTime(partidas: PartidaCampinho[], clube: number, f: Pick<FiltroCampinho, "periodo" | "mando" | "antesDe">): number[] {
  const rodadas = partidas
    .filter((p) => (p.casaId === clube || p.foraId === clube) && p.golsCasa != null && p.golsFora != null)
    .filter((p) => f.antesDe == null || p.rodada < f.antesDe)
    .filter((p) => f.mando === "geral" || (f.mando === "casa" ? p.casaId === clube : p.foraId === clube))
    .map((p) => p.rodada)
    .sort((a, b) => b - a);
  return f.periodo === "todos" ? rodadas : rodadas.slice(0, f.periodo);
}

/** Campinho do ataque (gols feitos) ou da defesa (gols sofridos) de um time no recorte. */
export function montarCampinho(gols: GolLancado[], partidas: PartidaCampinho[], clube: number, lado: "ataque" | "defesa", f: FiltroCampinho): Campinho {
  const rodadas = new Set(jogosDoTime(partidas, clube, f));
  const out: Campinho = { gols: zerado(), assist: zerado(), totalGols: 0, totalAssist: 0, jogos: rodadas.size };
  for (const g of gols) {
    if (!rodadas.has(g.rodada)) continue;
    if (lado === "ataque" ? g.clubeId !== clube : g.adversarioId !== clube) continue;
    if (f.forma !== "todas" && g.forma !== f.forma) continue;
    out.totalGols++;
    if (g.gol) out.gols[g.gol]++;
    if (g.assist) {
      out.assist[g.assist]++;
      out.totalAssist++;
    }
  }
  return out;
}
