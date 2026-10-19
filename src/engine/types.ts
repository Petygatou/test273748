import type { FormationKey, PositionId, ScoutKey, Scouts } from "./rules";

/* ------------------------------------------------------------------ */
/* Dados de entrada (normalizados a partir da API do Cartola)          */
/* ------------------------------------------------------------------ */

export interface Club {
  id: number;
  nome: string;
  abreviacao: string;
  escudo?: string;
}

export interface GatoMestre {
  /** Mínimo para valorizar oficial, quando a API expõe. */
  mpv?: number;
  mediaMandante?: number;
  mediaVisitante?: number;
  minutosMedia?: number;
}

export interface Athlete {
  id: number;
  apelido: string;
  nome?: string;
  foto?: string;
  clubeId: number;
  posicaoId: PositionId;
  statusId: number;
  preco: number;
  /** Variação de preço na última rodada. */
  variacao: number;
  media: number;
  jogos: number;
  pontosUltima: number;
  gatoMestre?: GatoMestre;
}

export interface Match {
  id: number;
  rodada: number;
  casaId: number;
  foraId: number;
  golsCasa?: number | null;
  golsFora?: number | null;
  data?: string;
  local?: string;
  valida: boolean;
}

/** Linha de histórico: o que um atleta fez em uma rodada (apenas quem entrou em campo). */
export interface PlayerRound {
  atletaId: number;
  rodada: number;
  clubeId: number;
  posicaoId: PositionId;
  pontos: number;
  scout: Scouts;
  /** Preço antes da rodada, quando conhecido (snapshots). */
  preco?: number;
  /** Variação após a rodada, quando conhecida. */
  variacao?: number;
}

/** Override editorial de provável escalação (painel ADM / fonte externa). */
export type LineupOverride = "titular" | "reserva" | "duvida" | "fora";

export interface SeasonData {
  temporada: number;
  rodadaAtual: number;
  /** 1 aberto, 2 fechado, 4 manutenção, 6 fim de jogo. */
  mercadoStatus: number;
  fechamento?: string;
  timesEscalados?: number;
  clubs: Record<number, Club>;
  athletes: Athlete[];
  matches: Match[];
  history: PlayerRound[];
  /** Nº de escalações por atleta (mais escalados), quando disponível. */
  ownership?: Record<number, number>;
  overrides?: Record<number, LineupOverride>;
  /** Recorte de backtest: o status do Cartola daquela rodada não é conhecido. */
  semStatus?: boolean;
  /** Status de cada atleta antes de cada rodada (snapshots do mercado): rodada → atleta → status. */
  statusHistory?: Record<number, Record<number, number>>;
  /** Sinais de notícias recentes: atleta → deslocamento (log-chance) na chance de jogar. */
  sinais?: Record<number, number>;
  source: "cartola" | "demo";
  updatedAt: string;
}

/* ------------------------------------------------------------------ */
/* Configuração do modelo                                              */
/* ------------------------------------------------------------------ */

export interface ModelConfig {
  /** Meia-vida (em rodadas) do peso da forma recente. */
  halfLife: number;
  /** Multiplicador global da força do shrinkage bayesiano (1 = estimado dos dados). */
  shrinkScale: number;
  /** Intensidade do ajuste de contexto (0 = ignora adversário/mando, 1 = completo). */
  contextStrength: number;
  /** Peso do xG por finalizações vs gols reais no modelo de times (0..1). */
  xgBlend: number;
  /** Meia-vida (rodadas) do modelo de times. */
  teamHalfLife: number;
  /** Simulações de Monte Carlo por rodada. */
  simulations: number;
  /** Semente do gerador aleatório (resultado reprodutível). */
  seed: number;
  /** Ajustar histórico pela força dos adversários enfrentados. */
  opponentAdjust: boolean;
}

export const DEFAULT_CONFIG: ModelConfig = {
  halfLife: 10,
  shrinkScale: 1,
  contextStrength: 0.75,
  xgBlend: 0.5,
  teamHalfLife: 10,
  simulations: 4000,
  seed: 20260101,
  opponentAdjust: true,
};

/* ------------------------------------------------------------------ */
/* Saídas                                                              */
/* ------------------------------------------------------------------ */

export interface TeamStrength {
  clubeId: number;
  /** log-força ofensiva (0 = média da liga). */
  attack: number;
  /** log-fragilidade defensiva (0 = média; positivo = sofre mais). */
  defense: number;
  /** Gols esperados por jogo contra adversário médio em campo neutro. */
  xgFor: number;
  xgAgainst: number;
  games: number;
}

export interface FixtureOdds {
  matchId: number;
  rodada: number;
  casaId: number;
  foraId: number;
  data?: string;
  local?: string;
  lambdaCasa: number;
  lambdaFora: number;
  pCasa: number;
  pEmpate: number;
  pFora: number;
  /** Probabilidade de cada time NÃO sofrer gol. */
  sgCasa: number;
  sgFora: number;
  /** Placar mais provável. */
  placarProvavel: [number, number];
  pOver25: number;
  /** Matriz de probabilidade de placares [golsCasa][golsFora]. */
  scoreMatrix: number[][];
}

export interface UpcomingFixture {
  rodada: number;
  adversarioId: number;
  mando: "casa" | "fora";
  pVitoria: number;
  xgPro: number;
  xgContra: number;
  pSG: number;
}

export interface CedenciaCell {
  /** Pontos médios cedidos por jogo à posição. */
  pontos: number;
  /** Fator relativo à média da liga (shrunk). 1.2 = cede 20% a mais. */
  fator: number;
  jogos: number;
}

export interface CedenciaRow {
  clubeId: number;
  geral: Record<PositionId, CedenciaCell>;
  casa: Record<PositionId, CedenciaCell>;
  fora: Record<PositionId, CedenciaCell>;
  ultimos5: Record<PositionId, CedenciaCell>;
  /** Fatores de cedência por scout (shrunk), por posição. */
  scouts: Partial<Record<PositionId, Partial<Record<ScoutKey, number>>>>;
}

export interface ContextFactors {
  /** Multiplicador ofensivo derivado de gols esperados no confronto. */
  ataque: number;
  /** Multiplicador da cedência do adversário à posição. */
  cedencia: number;
  /** Efeito de mando (casa/fora) observado no histórico do atleta. */
  mando: number;
  /** Forma recente vs média da temporada. */
  forma: number;
}

export interface ScoutProjection {
  key: ScoutKey;
  /** Quantidade esperada dado que entra em campo. */
  esperado: number;
  /** Pontos esperados (dado que entra em campo). */
  pontos: number;
}

export interface PlayerProjection {
  atletaId: number;
  apelido: string;
  foto?: string;
  clubeId: number;
  posicaoId: PositionId;
  statusId: number;
  preco: number;
  media: number;
  jogos: number;
  adversarioId: number | null;
  mando: "casa" | "fora" | null;
  matchId: number | null;

  /** Probabilidade de entrar em campo. */
  pJogar: number;
  /** Pontos esperados dado que joga. */
  xPJogando: number;
  /** Pontos esperados incondicionais (xP). */
  xP: number;
  /** Desvio padrão (simulação). */
  sd: number;
  /** Percentis da simulação, condicionados a jogar. */
  piso: number; // P15
  mediana: number;
  teto: number; // P85
  p95: number;
  /** Probabilidades (condicionadas a jogar). */
  pNegativo: number;
  pAcima5: number;
  pAcima8: number;
  pAcima12: number;
  /** Probabilidade de bater o mínimo para valorizar (dado que joga). */
  pValorizar: number;
  /** Regularidade (0..100): estabilidade histórica de pontuação. */
  regularidade: number;

  /** Componentes do xP (dado que joga). */
  base: number;
  explosao: number;
  scouts: ScoutProjection[];
  fatores: ContextFactors;

  /** Mínimo para valorizar e variação esperada (C$). */
  mpv: number;
  mpvFonte: "oficial" | "modelo";
  valorizacaoEsperada: number;

  /** % de escalação (efeito manada), quando disponível. */
  posse?: number;
  /** Médias históricas por mando. */
  mediaCasa: number | null;
  mediaFora: number | null;
  /** Pontos nas últimas rodadas (mais recente por último). */
  ultimas: Array<{ rodada: number; pontos: number | null }>;
  /** Sinais que merecem atenção. */
  alertas: string[];
  override?: LineupOverride;
}

export interface PlayerModelParams {
  atletaId: number;
  posicaoId: PositionId;
  clubeId: number;
  matchId: number | null;
  home: boolean;
  pJogar: number;
  /** Esperado por scout (por jogo disputado), já ajustado ao confronto. Exclui G, A, SG, GS e V. */
  rates: Partial<Record<ScoutKey, number>>;
  /** Dispersão k da binomial negativa por scout (ausente = Poisson). */
  dispersion: Partial<Record<ScoutKey, number>>;
  /** Fração dos gols do time feitos pelo atleta quando joga. */
  goalShare: number;
  /** Fração dos gols do time em que o atleta dá a assistência. */
  assistShare: number;
  /** Técnico: média esperada dos atletas do clube e seu desvio. */
  tecBase?: number;
  tecSd?: number;
}

export interface MatchSimParams {
  matchId: number;
  casaId: number;
  foraId: number;
  lambdaCasa: number;
  lambdaFora: number;
  /** Parâmetro de correlação Dixon-Coles. */
  rho: number;
  /** Assistências por gol (liga). */
  assistPerGoal: number;
}

export interface PmvModel {
  /** variação ≈ cpp × (pontos − mpv). */
  cpp: number;
  coefPreco: number;
  coefMedia: number;
  intercepto: number;
  r2: number;
  amostras: number;
}

export interface RulesCheck {
  /** % de linhas em que pontos oficiais == pontos recalculados pelos scouts. */
  acerto: number;
  amostras: number;
  /** Pesos estimados pelos dados para cada scout (mínimos quadrados). */
  pesosEstimados: Partial<Record<ScoutKey, number>>;
  divergencias: Array<{ key: ScoutKey; oficial: number; estimado: number }>;
}

export interface RoundAnalysis {
  temporada: number;
  rodada: number;
  source: SeasonData["source"];
  updatedAt: string;
  config: ModelConfig;
  clubs: Record<number, Club>;
  teams: TeamStrength[];
  homeAdvantage: number;
  fixtures: FixtureOdds[];
  cedencia: CedenciaRow[];
  /** Próximos jogos de cada clube (rodada atual + 4), com odds do modelo. */
  proximos: Record<number, UpcomingFixture[]>;
  players: PlayerProjection[];
  /** Parâmetros para simulação no cliente (lineup, reserva de luxo). */
  sim: {
    matches: MatchSimParams[];
    players: PlayerModelParams[];
  };
  pmvModel: PmvModel;
  rulesCheck: RulesCheck;
  ligaMedias: Record<PositionId, number>;
  diagnostics: { tempoMs: number; atletasModelados: number; rodadasHistorico: number };
}

/* ------------------------------------------------------------------ */
/* Otimizador                                                          */
/* ------------------------------------------------------------------ */

export type ProfileKey = "mitada" | "equilibrada" | "valorizacao";

export interface OptimizeRequest {
  formation: FormationKey | "auto";
  budget: number;
  profile: ProfileKey;
  fixed?: number[];
  banned?: number[];
  /** Ignora jogadores com probabilidade de jogar abaixo disso. */
  minPJogar?: number;
  /** Força um capitão específico. */
  captainId?: number | null;
}

export interface LineupSlot {
  atletaId: number;
  posicaoId: PositionId;
  preco: number;
  valor: number;
  xP: number;
}

export interface CaptainOption {
  atletaId: number;
  xP: number;
  teto: number;
  pAcima12: number;
  ganhoEsperado: number;
  posse?: number;
  justificativa: string;
}

export interface BenchPick {
  posicaoId: PositionId;
  atletaId: number;
  preco: number;
  xP: number;
  pJogar: number;
  /** Pontos esperados que o reserva adiciona cobrindo ausências. */
  ganhoCobertura: number;
  luxo?: boolean;
  ganhoLuxo?: number;
}

export interface OptimizedLineup {
  formation: FormationKey;
  profile: ProfileKey;
  slots: LineupSlot[];
  captainId: number;
  custo: number;
  sobra: number;
  xP: number;
  xPComCapitao: number;
  objetivo: number;
  valorizacaoEsperada: number;
  capitaes: CaptainOption[];
  banco: BenchPick[];
  /** Distribuição da pontuação do time (simulação com correlações). */
  distribuicao?: { p10: number; p50: number; p90: number; pAcima: Record<string, number> };
  explicacao: string[];
}
