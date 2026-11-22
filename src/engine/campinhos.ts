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

export const FORMAS_GOL = ["dentro", "fora", "penalti", "cabeca", "falta", "contra", "indefinida"] as const;
export type FormaGol = (typeof FORMAS_GOL)[number];

export const NOME_FORMA: Record<FormaGol, string> = {
  dentro: "Dentro da área",
  fora: "Fora da área",
  penalti: "Pênalti",
  cabeca: "Cabeça",
  falta: "Falta",
  contra: "Gol contra",
  indefinida: "Não informada",
};

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
  /** lançado sozinho a partir dos scouts do Cartola (não está no banco) */
  auto?: boolean;
}

export interface PartidaCampinho {
  matchId: number;
  rodada: number;
  casaId: number;
  foraId: number;
  golsCasa: number | null;
  golsFora: number | null;
  /** criada à mão pela equipe (não veio do Cartola) */
  manual?: boolean;
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

/* ------------------------- gols automáticos (Cartola) ------------------------- */

/** Uma atuação do histórico do Cartola: quem jogou, por qual clube, na posição e com os scouts. */
export interface AtuacaoGol {
  atletaId: number;
  rodada: number;
  clubeId: number;
  /** gols, assistências e gols contra nessa atuação */
  G: number;
  A: number;
  GC: number;
  /** posição no campinho (centroavante, ponta, meia…); null quando não dá para dizer (técnico) */
  pos: PosCampinho | null;
}

/** Chave de um time numa partida: as correções à mão valem por time e por jogo. */
export const chaveTimeJogo = (matchId: number, clubeId: number) => `${matchId}:${clubeId}`;

/**
 * Gols de cada time em cada partida encerrada, pelos scouts do Cartola: um gol por G de cada
 * atleta (na posição dele), gol contra (GC do adversário) sem posição, e as assistências do
 * time distribuídas entre os gols (nunca para o próprio autor). O Cartola não diz a forma
 * do gol nem qual assistência foi de qual gol: a forma fica "não informada".
 */
export function golsDoCartola(temporada: number, partidas: PartidaCampinho[], atuacoes: AtuacaoGol[]): GolLancado[] {
  const porRodadaClube = new Map<string, AtuacaoGol[]>();
  for (const a of atuacoes) {
    if (!a.G && !a.A && !a.GC) continue;
    const k = `${a.rodada}:${a.clubeId}`;
    const l = porRodadaClube.get(k) ?? [];
    l.push(a);
    porRodadaClube.set(k, l);
  }
  const out: GolLancado[] = [];
  for (const m of partidas) {
    if (m.manual || m.golsCasa == null || m.golsFora == null) continue;
    for (const [clube, adv, casa] of [
      [m.casaId, m.foraId, true],
      [m.foraId, m.casaId, false],
    ] as const) {
      const meus = [...(porRodadaClube.get(`${m.rodada}:${clube}`) ?? [])].sort((x, y) => x.atletaId - y.atletaId);
      const deles = porRodadaClube.get(`${m.rodada}:${adv}`) ?? [];
      const gols: Array<{ autor: number | null; pos: PosCampinho | null; contra: boolean }> = [];
      for (const a of meus) for (let i = 0; i < a.G; i++) gols.push({ autor: a.atletaId, pos: a.pos, contra: false });
      for (const a of deles) for (let i = 0; i < a.GC; i++) gols.push({ autor: null, pos: null, contra: true });
      const assists: Array<{ atletaId: number; pos: PosCampinho | null }> = [];
      for (const a of meus) for (let i = 0; i < a.A; i++) assists.push({ atletaId: a.atletaId, pos: a.pos });
      gols.forEach((g, i) => {
        let assist: PosCampinho | null = null;
        if (!g.contra) {
          const j = assists.findIndex((x) => x.atletaId !== g.autor);
          if (j >= 0) assist = assists.splice(j, 1)[0].pos;
        }
        out.push({
          id: `auto:${m.matchId}:${clube}:${i}`,
          temporada,
          rodada: m.rodada,
          matchId: m.matchId,
          clubeId: clube,
          adversarioId: adv,
          casa,
          forma: g.contra ? "contra" : "indefinida",
          gol: g.contra ? null : (g.pos ?? "CENTRO"),
          assist,
          criadoEm: "",
          por: "auto",
          auto: true,
        });
      });
    }
  }
  return out;
}
