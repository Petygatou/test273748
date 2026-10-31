/**
 * Cadastro central dos scouts do Cartola FC usado pelo Cruzamento de Scout.
 *
 * Os códigos são os que a API devolve em `scout` (em /atletas/pontuados/{rodada});
 * o valor de cada scout vem de rules.ts.
 */
import { POSITION_SCOUTS, SCORING, SG_POSITIONS, type PositionId, type ScoutKey, type Scouts } from "./rules";

export type Categoria = "ofensivo" | "defensivo" | "negativo" | "coletivo";
/** Scouts do Cartola e duas somas de scouts DISTINTOS (nunca o mesmo lance duas vezes). */
export type CruzScout = ScoutKey | "FIN" | "GA";

export interface ScoutDef {
  codigo: CruzScout;
  nome: string;
  descricao: string;
  categoria: Categoria;
  posicoes: PositionId[];
  /** valor da tabela do site (null nas somas, que juntam scouts de valores diferentes) */
  pontos: number | null;
  vigencia: string;
  /** de onde vem o histórico por jogo */
  historico: string;
  /** limites para "pelo menos k" (probabilidades) */
  limiares: number[];
  /** sim/não por jogo (ex.: SG) em vez de contagem */
  binario?: boolean;
  /** vem do placar do time (modelo de gols), não da taxa individual */
  doPlacar?: boolean;
  /** componentes de uma soma */
  partes?: ScoutKey[];
  nota?: string;
}

const LINHA: PositionId[] = [2, 3, 4, 5];
const quem = (k: ScoutKey) => ([1, 2, 3, 4, 5, 6] as PositionId[]).filter((p) => POSITION_SCOUTS[p].includes(k));
const VIGENCIA = "Tabela do Cartola desde 2023, conferida a cada carga contra a pontuação oficial da temporada";
const HIST = "Cartola: /atletas/pontuados/{rodada}, um registro por atleta que entrou em campo";

export const SCOUT_DEFS: ScoutDef[] = [
  { codigo: "G", nome: "Gol", descricao: "Gol marcado (não conta gol contra).", categoria: "ofensivo", posicoes: quem("G"), pontos: SCORING.G, vigencia: VIGENCIA, historico: HIST, limiares: [1, 2] },
  { codigo: "A", nome: "Assistência", descricao: "Passe que resulta em gol.", categoria: "ofensivo", posicoes: quem("A"), pontos: SCORING.A, vigencia: VIGENCIA, historico: HIST, limiares: [1] },
  {
    codigo: "GA",
    nome: "Participação em gol",
    descricao: "Gols + assistências. São eventos diferentes (o autor do gol não recebe a assistência do próprio gol), por isso a soma não conta o mesmo lance duas vezes.",
    categoria: "ofensivo",
    posicoes: LINHA,
    pontos: null,
    vigencia: VIGENCIA,
    historico: HIST,
    limiares: [1, 2],
    partes: ["G", "A"],
  },
  {
    codigo: "FIN",
    nome: "Finalizações",
    descricao: "Finalizações que não viraram gol: defendidas (FD) + para fora (FF) + na trave (FT). Cada chute entra em um só desses scouts; o gol não entra.",
    categoria: "ofensivo",
    posicoes: LINHA,
    pontos: null,
    vigencia: VIGENCIA,
    historico: HIST,
    limiares: [1, 2, 3],
    partes: ["FD", "FF", "FT"],
  },
  {
    codigo: "FD",
    nome: "Finalização defendida",
    descricao: "Chute no gol defendido pelo goleiro.",
    categoria: "ofensivo",
    posicoes: quem("FD"),
    pontos: SCORING.FD,
    vigencia: VIGENCIA,
    historico: HIST,
    limiares: [1, 2],
  },
  {
    codigo: "FF",
    nome: "Finalização para fora",
    descricao: "Chute que sai pela linha de fundo.",
    categoria: "ofensivo",
    posicoes: quem("FF"),
    pontos: SCORING.FF,
    vigencia: VIGENCIA,
    historico: HIST,
    limiares: [1, 2],
  },
  {
    codigo: "FT",
    nome: "Finalização na trave",
    descricao: "Chute que acerta a trave ou o travessão.",
    categoria: "ofensivo",
    posicoes: quem("FT"),
    pontos: SCORING.FT,
    vigencia: VIGENCIA,
    historico: HIST,
    limiares: [1],
  },
  { codigo: "FS", nome: "Falta sofrida", descricao: "Falta recebida.", categoria: "ofensivo", posicoes: quem("FS"), pontos: SCORING.FS, vigencia: VIGENCIA, historico: HIST, limiares: [1, 2, 3] },
  {
    codigo: "PS",
    nome: "Pênalti sofrido",
    descricao: "Pênalti cometido sobre o atleta.",
    categoria: "ofensivo",
    posicoes: quem("PS"),
    pontos: SCORING.PS,
    vigencia: VIGENCIA,
    historico: HIST,
    limiares: [1],
  },
  {
    codigo: "DS",
    nome: "Desarme",
    descricao: "Bola roubada do adversário.",
    categoria: "defensivo",
    posicoes: quem("DS"),
    pontos: SCORING.DS,
    vigencia: VIGENCIA,
    historico: HIST,
    limiares: [1, 2, 3],
    nota: "É o antigo “RB – roubada de bola”: o Cartola mudou o nome do mesmo scout. Não existe um segundo scout de desarme para somar.",
  },
  {
    codigo: "SG",
    nome: "Saldo de gol",
    descricao: "Jogo sem sofrer gol (goleiro, lateral e zagueiro que estavam em campo).",
    categoria: "defensivo",
    posicoes: [...SG_POSITIONS],
    pontos: SCORING.SG,
    vigencia: VIGENCIA,
    historico: HIST,
    limiares: [1],
    binario: true,
    doPlacar: true,
  },
  { codigo: "DE", nome: "Defesa", descricao: "Defesa do goleiro.", categoria: "defensivo", posicoes: [1], pontos: SCORING.DE, vigencia: VIGENCIA, historico: HIST, limiares: [2, 3, 4, 5] },
  { codigo: "DP", nome: "Defesa de pênalti", descricao: "Pênalti defendido.", categoria: "defensivo", posicoes: [1], pontos: SCORING.DP, vigencia: VIGENCIA, historico: HIST, limiares: [1] },
  {
    codigo: "GS",
    nome: "Gol sofrido",
    descricao: "Gol sofrido pelo goleiro em campo.",
    categoria: "negativo",
    posicoes: [1],
    pontos: SCORING.GS,
    vigencia: VIGENCIA,
    historico: HIST,
    limiares: [1, 2, 3],
    doPlacar: true,
  },
  {
    codigo: "FC",
    nome: "Falta cometida",
    descricao: "Falta feita no adversário.",
    categoria: "negativo",
    posicoes: quem("FC"),
    pontos: SCORING.FC,
    vigencia: VIGENCIA,
    historico: HIST,
    limiares: [1, 2, 3],
  },
  { codigo: "CA", nome: "Cartão amarelo", descricao: "Cartão amarelo recebido.", categoria: "negativo", posicoes: quem("CA"), pontos: SCORING.CA, vigencia: VIGENCIA, historico: HIST, limiares: [1] },
  { codigo: "CV", nome: "Cartão vermelho", descricao: "Expulsão.", categoria: "negativo", posicoes: quem("CV"), pontos: SCORING.CV, vigencia: VIGENCIA, historico: HIST, limiares: [1] },
  { codigo: "I", nome: "Impedimento", descricao: "Impedimento marcado.", categoria: "negativo", posicoes: quem("I"), pontos: SCORING.I, vigencia: VIGENCIA, historico: HIST, limiares: [1, 2] },
  {
    codigo: "PC",
    nome: "Pênalti cometido",
    descricao: "Pênalti feito no adversário.",
    categoria: "negativo",
    posicoes: quem("PC"),
    pontos: SCORING.PC,
    vigencia: VIGENCIA,
    historico: HIST,
    limiares: [1],
  },
  {
    codigo: "PP",
    nome: "Pênalti perdido",
    descricao: "Pênalti cobrado e não convertido.",
    categoria: "negativo",
    posicoes: quem("PP"),
    pontos: SCORING.PP,
    vigencia: VIGENCIA,
    historico: HIST,
    limiares: [1],
  },
  { codigo: "GC", nome: "Gol contra", descricao: "Gol contra.", categoria: "negativo", posicoes: quem("GC"), pontos: SCORING.GC, vigencia: VIGENCIA, historico: HIST, limiares: [1] },
  {
    codigo: "V",
    nome: "Vitória",
    descricao: "Vitória do time (pontua para o técnico).",
    categoria: "coletivo",
    posicoes: [6],
    pontos: SCORING.V,
    vigencia: VIGENCIA,
    historico: HIST,
    limiares: [1],
    binario: true,
    doPlacar: true,
  },
];

export const DEF_POR_CODIGO = new Map(SCOUT_DEFS.map((d) => [d.codigo, d] as const));

/** Quantidade do scout (ou da soma) num registro de scouts. */
export function valorScout(s: Scouts, k: CruzScout): number {
  if (k === "FIN") return (s.FD ?? 0) + (s.FF ?? 0) + (s.FT ?? 0);
  if (k === "GA") return (s.G ?? 0) + (s.A ?? 0);
  return s[k] ?? 0;
}

/** Scouts que fazem sentido para a posição (na ordem do cadastro). */
export function scoutsDaPosicao(p: PositionId): ScoutDef[] {
  return SCOUT_DEFS.filter((d) => d.posicoes.includes(p));
}
