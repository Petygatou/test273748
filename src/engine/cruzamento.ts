/**
 * Cruzamento de Scout: o histórico do atleta × o que o adversário cede, scout a scout.
 *
 * Duas camadas, sempre separadas na tela:
 *
 *  1) HISTÓRICO (o que aconteceu): contagens reais por jogo — média, mediana,
 *     desvio, frequência, casa/fora, tendência, o que o adversário cedeu à posição.
 *
 *  2) PROJEÇÃO (o que pode acontecer), dado que o atleta entra em campo:
 *
 *       λ = taxa do atleta × fator do adversário × fator de mando
 *
 *     - taxa do atleta (Gama-Poisson com Bayes empírico):
 *           taxa = (a0 + φ·Σ wᵍ·xᵍ) / (b0 + φ·Σ wᵍ)
 *       a0/b0 = média da posição na liga e "força" do prior, estimada pela variação
 *       real entre atletas da posição (quanto mais parecidos, mais a amostra pequena é
 *       puxada para a média); wᵍ = peso de recência (meia-vida escolhida por validação
 *       fora da amostra); φ = média/variância dos jogos (scouts muito irregulares
 *       informam menos por jogo).
 *     - fator do adversário: o que ele cedeu à posição por atuação ÷ média da liga,
 *       encolhido para 1 na proporção do ruído (Bayes empírico entre os 20 times).
 *     - fator de mando: média da posição jogando naquele mando ÷ média da amostra usada.
 *     - distribuição: binomial negativa (Poisson-Gama) com a dispersão dos jogos da
 *       posição + a incerteza da própria taxa → P(X ≥ k).
 *     - SG, gols sofridos e vitória vêm do placar: Poisson de gols de cada time
 *       (ataque × defesa × mando, também encolhidos).
 *
 *  Pontuação: simulação de jogos com a tabela vigente. Gols e assistências saem dos
 *  gols do time no placar simulado, e SG/gols sofridos do mesmo placar; os demais
 *  scouts são sorteados independentes dado o jogo (limitação declarada).
 */
import { buildContextIndex } from "./cedencia";
import { Rng, decayWeight } from "./math";
import { POSITION_SCOUTS, type PositionId, type ScoutKey, type Scouts } from "./rules";
import { DEF_POR_CODIGO, scoutsDaPosicao, valorScout, type CruzScout } from "./scoutDefs";
import { desvio, gammaQuantile, media, mediana, poisson, probAtLeast, quantil, sortearNegBin } from "./stats";
import type { LadoLateral, Match, PlayerRound, SeasonData } from "./types";

export type FiltroMando = "todos" | "casa" | "fora";
/** últimos N jogos; null = temporada inteira (com peso de recência) */
export type Janela = 3 | 5 | 10 | null;
export type Confianca = "alta" | "media" | "baixa";

export const MEIA_VIDA_PADRAO = 8;
export const MIN_JOGOS = 3;

export interface Linha {
  atletaId: number;
  rodada: number;
  clubeId: number;
  opp: number;
  casa: boolean;
  pos: PositionId;
  pontos: number;
  scout: Scouts;
  golsPro: number | null;
  golsContra: number | null;
  lado?: LadoLateral;
}

export interface JogoClube {
  rodada: number;
  opp: number;
  casa: boolean;
  golsPro: number;
  golsContra: number;
}

export interface BaseCruzamento {
  temporada: number;
  /** a projeção é para esta rodada; o histórico usa só rodadas anteriores */
  rodadaAlvo: number;
  linhas: Linha[];
  porAtleta: Map<number, Linha[]>;
  /** jogos com placar de cada clube, do mais recente para o mais antigo */
  jogosClube: Map<number, JogoClube[]>;
  matches: Match[];
  memo: Map<string, unknown>;
}

type DadosBase = Pick<SeasonData, "temporada" | "history" | "matches"> & Partial<Pick<SeasonData, "lados" | "ladosJogo">>;

/** Monta o histórico até a rodada anterior à `rodadaAlvo` (nada de jogo futuro ou parcial). */
export function prepararBase(data: DadosBase, rodadaAlvo: number): BaseCruzamento {
  const ctx = buildContextIndex(data.matches);
  const placar = new Map<string, { pro: number; contra: number }>();
  const jogosClube = new Map<number, JogoClube[]>();
  for (const m of data.matches) {
    if (m.rodada >= rodadaAlvo || m.golsCasa == null || m.golsFora == null) continue;
    placar.set(`${m.rodada}:${m.casaId}`, { pro: m.golsCasa, contra: m.golsFora });
    placar.set(`${m.rodada}:${m.foraId}`, { pro: m.golsFora, contra: m.golsCasa });
    for (const [c, opp, casa, pro, contra] of [
      [m.casaId, m.foraId, true, m.golsCasa, m.golsFora],
      [m.foraId, m.casaId, false, m.golsFora, m.golsCasa],
    ] as const) {
      const l = jogosClube.get(c) ?? [];
      l.push({ rodada: m.rodada, opp, casa, golsPro: pro, golsContra: contra });
      jogosClube.set(c, l);
    }
  }
  for (const l of jogosClube.values()) l.sort((a, b) => b.rodada - a.rodada);
  const linhas: Linha[] = [];
  const porAtleta = new Map<number, Linha[]>();
  for (const pr of data.history) {
    if (pr.rodada >= rodadaAlvo) continue;
    const g = ctx.get(`${pr.rodada}:${pr.clubeId}`);
    if (!g) continue;
    const pl = placar.get(`${pr.rodada}:${pr.clubeId}`);
    const lado = pr.posicaoId === 2 ? (data.ladosJogo?.[`${pr.rodada}:${pr.atletaId}`] ?? data.lados?.[pr.atletaId]) : undefined;
    const l: Linha = {
      atletaId: pr.atletaId,
      rodada: pr.rodada,
      clubeId: pr.clubeId,
      opp: g.opp,
      casa: g.home,
      pos: pr.posicaoId,
      pontos: pr.pontos,
      scout: pr.scout,
      golsPro: pl?.pro ?? null,
      golsContra: pl?.contra ?? null,
      lado,
    };
    linhas.push(l);
    const lista = porAtleta.get(pr.atletaId) ?? [];
    lista.push(l);
    porAtleta.set(pr.atletaId, lista);
  }
  for (const l of porAtleta.values()) l.sort((a, b) => a.rodada - b.rodada);
  return { temporada: data.temporada, rodadaAlvo, linhas, porAtleta, jogosClube, matches: data.matches, memo: new Map() };
}

function memo<T>(base: BaseCruzamento, key: string, fn: () => T): T {
  if (base.memo.has(key)) return base.memo.get(key) as T;
  const v = fn();
  base.memo.set(key, v);
  return v;
}

const variancia = (xs: number[]) => {
  if (xs.length < 2) return 0;
  const m = media(xs);
  return xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length;
};
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const r3 = (x: number) => Math.round(x * 1000) / 1000;

/* ------------------------------ liga ------------------------------ */

export interface Liga {
  /** média por atuação da posição */
  mu: number;
  /** variância dentro do atleta (jogo a jogo), agrupada */
  varW: number;
  /** dispersão da binomial negativa (Infinity = Poisson) */
  k: number;
  /** informação por jogo (média/variância, entre 0,15 e 1) */
  phi: number;
  /** prior Gama: média mu e força b0 (em jogos) */
  a0: number;
  b0: number;
  atuacoes: number;
}

/** Média, dispersão e prior da posição para o scout (Bayes empírico entre atletas). */
export function liga(base: BaseCruzamento, pos: PositionId, s: CruzScout, venue: FiltroMando = "todos"): Liga {
  return memo(base, `liga:${pos}:${s}:${venue}`, () => {
    const porAtleta = new Map<number, number[]>();
    let soma = 0;
    let n = 0;
    for (const l of base.linhas) {
      if (l.pos !== pos || (venue !== "todos" && l.casa !== (venue === "casa"))) continue;
      const v = valorScout(l.scout, s);
      soma += v;
      n++;
      const a = porAtleta.get(l.atletaId) ?? [];
      a.push(v);
      porAtleta.set(l.atletaId, a);
    }
    const mu = n ? soma / n : 0;
    let num = 0;
    let den = 0;
    for (const xs of porAtleta.values()) {
      if (xs.length < 2) continue;
      num += variancia(xs) * xs.length;
      den += xs.length - 1;
    }
    const varW = den > 0 ? num / den : mu;
    const k = varW > mu * 1.0001 && mu > 0 ? (mu * mu) / (varW - mu) : Infinity;
    const phi = varW > 0 ? clamp(mu / varW, 0.15, 1) : 1;
    // variação real entre atletas = variação das médias − ruído de amostra
    const medias: number[] = [];
    const ruido: number[] = [];
    for (const xs of porAtleta.values()) {
      if (xs.length < MIN_JOGOS) continue;
      medias.push(media(xs));
      ruido.push(varW / xs.length);
    }
    const tau2 = Math.max((0.05 * mu) ** 2, variancia(medias) - media(ruido), 1e-9);
    const b0 = mu > 0 ? clamp(mu / tau2, 0.5, 60) : 1;
    return { mu, varW, k, phi, a0: mu * b0, b0, atuacoes: n };
  });
}

/* ---------------------------- adversário ---------------------------- */

export interface Cedido {
  /** o que o adversário cedeu à posição por atuação */
  cede: number;
  liga: number;
  /** cede ÷ liga, sem ajuste */
  bruto: number;
  /** fator usado: encolhido para 1 conforme o ruído */
  fator: number;
  /** quanto o fator acredita nos dados do adversário (0 a 1) */
  peso: number;
  aparicoes: number;
  jogos: number;
}

interface TabelaCedencia {
  porClube: Map<number, { soma: number; n: number; jogos: number }>;
  L: number;
  varW: number;
  tau2: number;
}

/** Rodadas dos últimos N jogos do clube (opcionalmente só num mando). */
function rodadasDoClube(base: BaseCruzamento, clube: number, janela: Janela, venue: FiltroMando): Set<number> {
  let jogos = base.jogosClube.get(clube) ?? [];
  if (venue !== "todos") jogos = jogos.filter((j) => j.casa === (venue === "casa"));
  if (janela) jogos = jogos.slice(0, janela);
  return new Set(jogos.map((j) => j.rodada));
}

function tabelaCedencia(base: BaseCruzamento, pos: PositionId, s: CruzScout, janela: Janela, venueAdv: FiltroMando, lado?: LadoLateral): TabelaCedencia {
  return memo(base, `ced:${pos}:${s}:${janela}:${venueAdv}:${lado ?? "-"}`, () => {
    const rodadas = new Map<number, Set<number>>();
    for (const c of base.jogosClube.keys()) rodadas.set(c, rodadasDoClube(base, c, janela, venueAdv));
    const porClube = new Map<number, { soma: number; n: number; jogos: number }>();
    const jogosVistos = new Map<number, Set<number>>();
    let soma = 0;
    let n = 0;
    for (const l of base.linhas) {
      if (l.pos !== pos || (lado && l.lado !== lado)) continue;
      if (!rodadas.get(l.opp)?.has(l.rodada)) continue;
      const v = valorScout(l.scout, s);
      const c = porClube.get(l.opp) ?? { soma: 0, n: 0, jogos: 0 };
      c.soma += v;
      c.n++;
      porClube.set(l.opp, c);
      const js = jogosVistos.get(l.opp) ?? new Set<number>();
      js.add(l.rodada);
      jogosVistos.set(l.opp, js);
      soma += v;
      n++;
    }
    for (const [c, js] of jogosVistos) porClube.get(c)!.jogos = js.size;
    const L = n ? soma / n : 0;
    const varW = liga(base, pos, s).varW || L;
    const taxas: number[] = [];
    const ruido: number[] = [];
    for (const c of porClube.values()) {
      if (!c.n) continue;
      taxas.push(c.soma / c.n);
      ruido.push(varW / c.n);
    }
    const tau2 = Math.max(0, variancia(taxas) - media(ruido));
    return { porClube, L, varW, tau2 };
  });
}

function fatorDe(t: TabelaCedencia, clube: number): Cedido {
  const c = t.porClube.get(clube);
  if (!c || !c.n || t.L <= 0) return { cede: c && c.n ? c.soma / c.n : 0, liga: t.L, bruto: 1, fator: 1, peso: 0, aparicoes: c?.n ?? 0, jogos: c?.jogos ?? 0 };
  const r = c.soma / c.n;
  const peso = t.tau2 > 0 ? t.tau2 / (t.tau2 + t.varW / c.n) : 0;
  const rhat = t.L + peso * (r - t.L);
  return { cede: r, liga: t.L, bruto: r / t.L, fator: rhat / t.L, peso, aparicoes: c.n, jogos: c.jogos };
}

/** Fator do adversário para a posição (e o lado do lateral, quando há amostra do lado). */
export function cedidoPor(base: BaseCruzamento, adversario: number, pos: PositionId, s: CruzScout, janela: Janela, venueAdv: FiltroMando, lado?: LadoLateral): Cedido {
  if (lado) {
    const t = tabelaCedencia(base, pos, s, janela, venueAdv, lado);
    const f = fatorDe(t, adversario);
    if (f.aparicoes >= 3) return f;
  }
  return fatorDe(tabelaCedencia(base, pos, s, janela, venueAdv), adversario);
}

/* ----------------------------- gols (placar) ----------------------------- */

export interface ModeloGols {
  gCasa: number;
  gFora: number;
  ataque: Map<number, number>;
  defesa: Map<number, number>;
  jogos: Map<number, number>;
}

/** Ataque e defesa de cada time (gols por jogo ÷ média), encolhidos pelo ruído de Poisson. */
export function modeloGols(base: BaseCruzamento, janela: Janela): ModeloGols {
  return memo(base, `gols:${janela}`, () => {
    let somaCasa = 0;
    let somaFora = 0;
    let nJogos = 0;
    for (const m of base.matches) {
      if (m.rodada >= base.rodadaAlvo || m.golsCasa == null || m.golsFora == null) continue;
      somaCasa += m.golsCasa;
      somaFora += m.golsFora;
      nJogos++;
    }
    const gCasa = nJogos ? somaCasa / nJogos : 1.3;
    const gFora = nJogos ? somaFora / nJogos : 1.0;
    const g = (gCasa + gFora) / 2;
    const pro = new Map<number, { r: number; n: number }>();
    const contra = new Map<number, { r: number; n: number }>();
    const jogos = new Map<number, number>();
    for (const [c, js0] of base.jogosClube) {
      const js = janela ? js0.slice(0, janela) : js0;
      if (!js.length) continue;
      pro.set(c, { r: media(js.map((j) => j.golsPro)), n: js.length });
      contra.set(c, { r: media(js.map((j) => j.golsContra)), n: js.length });
      jogos.set(c, js.length);
    }
    const encolher = (m: Map<number, { r: number; n: number }>) => {
      const taxas = [...m.values()];
      const tau2 = Math.max(0, variancia(taxas.map((t) => t.r)) - media(taxas.map((t) => g / t.n)));
      const out = new Map<number, number>();
      for (const [c, t] of m) {
        const peso = tau2 > 0 ? tau2 / (tau2 + g / t.n) : 0;
        out.set(c, (g + peso * (t.r - g)) / g);
      }
      return out;
    };
    return { gCasa, gFora, ataque: encolher(pro), defesa: encolher(contra), jogos };
  });
}

export function golsEsperados(m: ModeloGols, time: number, adversario: number, casa: boolean) {
  const at = (c: number) => m.ataque.get(c) ?? 1;
  const de = (c: number) => m.defesa.get(c) ?? 1;
  return { pro: (casa ? m.gCasa : m.gFora) * at(time) * de(adversario), contra: (casa ? m.gFora : m.gCasa) * at(adversario) * de(time) };
}

/**
 * Nem todo atleta em campo ganha o SG quando o time não sofre gol (quem entra no fim,
 * por exemplo). q = parte dos jogos sem gol sofrido em que ele recebeu o SG, encolhida
 * para a média da posição pela variação real entre atletas (Bayes empírico, Beta-binomial).
 */
export function aproveitamentoSG(base: BaseCruzamento, atletaId: number, pos: PositionId): { q: number; qPosicao: number; jogosSemSofrer: number; comSG: number } {
  const pos0 = memo(base, `qsg:${pos}`, () => {
    let cs = 0;
    let sg = 0;
    const porAtleta = new Map<number, { n: number; x: number }>();
    for (const l of base.linhas) {
      if (l.pos !== pos || l.golsContra !== 0) continue;
      cs++;
      const x = (l.scout.SG ?? 0) > 0 ? 1 : 0;
      sg += x;
      const a = porAtleta.get(l.atletaId) ?? { n: 0, x: 0 };
      a.n++;
      a.x += x;
      porAtleta.set(l.atletaId, a);
    }
    const q = cs ? sg / cs : 1;
    const qs = [...porAtleta.values()].filter((a) => a.n >= MIN_JOGOS);
    const tau2 = Math.max(1e-4, variancia(qs.map((a) => a.x / a.n)) - media(qs.map((a) => (q * (1 - q)) / a.n)));
    const m = clamp((q * (1 - q)) / tau2 - 1, 1, 50);
    return { q, m };
  });
  let n = 0;
  let x = 0;
  for (const l of base.porAtleta.get(atletaId) ?? []) {
    if (l.golsContra !== 0) continue;
    n++;
    if ((l.scout.SG ?? 0) > 0) x++;
  }
  return { q: (x + pos0.m * pos0.q) / (n + pos0.m), qPosicao: pos0.q, jogosSemSofrer: n, comSG: x };
}

/** P(time vence) com gols de Poisson independentes. */
export function pVitoria(pro: number, contra: number) {
  let p = 0;
  for (let a = 0; a <= 10; a++) for (let b = 0; b < a; b++) p += poisson(a, pro) * poisson(b, contra);
  return p;
}

/* ------------------------------ análise ------------------------------ */

export interface Limiar {
  k: number;
  /** probabilidade estimada (modelo) */
  p: number;
  /** faixa de 80% pela incerteza da taxa (null quando vem do placar) */
  pBaixo: number | null;
  pAlto: number | null;
  /** frequência histórica na amostra (fato, não previsão) */
  freqHist: number | null;
}

export interface ProjecaoScout {
  metodo: "taxa" | "placar";
  /** quantidade esperada no próximo jogo (no SG/vitória: probabilidade) */
  lambda: number;
  intervalo: [number, number] | null;
  limiares: Limiar[];
  confianca: Confianca;
  componentes: {
    taxaJogador?: number;
    mediaPosicao?: number;
    pesoPrior?: number;
    pesoDados?: number;
    fatorAdversario: number;
    fatorMando: number;
    dispersao?: number | null;
    golsPro?: number;
    golsContra?: number;
    /** SG: parte dos jogos sem gol sofrido em que o atleta recebe o SG */
    qSG?: number;
  };
  /** tamanho da binomial negativa preditiva (dispersão do jogo + incerteza da taxa) */
  k?: number;
}

export interface Historico {
  n: number;
  total: number;
  media: number;
  mediana: number;
  desvio: number;
  jogosCom: number;
  freq: number;
  maximo: number;
  recente: { n: number; media: number };
  /** últimos 5 × jogos anteriores, por teste binomial exato (null: poucos eventos para dizer) */
  tendencia: { rotulo: "alta" | "queda" | "estavel"; p: number } | null;
  casa: { n: number; media: number };
  fora: { n: number; media: number };
  /** contra adversários que cedem esse scout num nível parecido com o do próximo */
  perfil: { faixa: "cede muito" | "cede na média" | "cede pouco"; n: number; media: number } | null;
}

export interface AnaliseScout {
  codigo: CruzScout;
  hist: Historico;
  adversario: Cedido | null;
  projecao: ProjecaoScout | null;
  semProjecao?: string;
  /** resultado real na rodada analisada (só em rodada passada) */
  real?: number | null;
  /** ninguém da posição registrou o scout: entra como zero na pontuação */
  zero?: boolean;
}

export interface Confronto {
  rodada: number;
  adversarioId: number;
  casa: boolean;
  hipotetico: boolean;
}

export interface OpcoesCruzamento {
  janela: Janela;
  mando: FiltroMando;
  meiaVida: number;
  adversarioId?: number | null;
  mandoConfronto?: "casa" | "fora" | null;
  pontuacao: Record<ScoutKey, number>;
  simulacoes?: number;
  /** ranking: pula as descritivas que só aparecem na ficha */
  leve?: boolean;
  /** ranking: só estes scouts precisam de faixa de incerteza */
  scoutsDetalhe?: CruzScout[];
}

export interface AtletaInfo {
  id: number;
  apelido: string;
  clubeId: number;
  posicaoId: PositionId;
}

export interface ProjecaoPontos {
  /** média e desvio exatos (soma das médias; variância com o placar enumerado) */
  esperado: number;
  desvio: number;
  /** cenários da simulação (null quando não simulado, como no ranking) */
  p20: number | null;
  p50: number | null;
  p80: number | null;
  pNegativo: number | null;
  pAcima: Record<5 | 8 | 12, number> | null;
  contribuicoes: Array<{ codigo: ScoutKey; pontos: number; pAoMenosUm: number | null }>;
  simulacoes: number;
}

export interface AnaliseAtleta {
  atleta: AtletaInfo;
  confronto: Confronto | null;
  amostra: { jogos: number; jogosTemporada: number; rodadas: [number, number] | null; janela: Janela; mando: FiltroMando };
  pontosHist: { media: number | null; recente: number | null; janela: number | null; regularidade: number | null; n: number };
  scouts: AnaliseScout[];
  pontos: ProjecaoPontos | null;
  semPontos?: string;
  gols: { pro: number; contra: number; pSG: number; pVitoria: number } | null;
  /** rodada passada: o que aconteceu de fato */
  real: { jogou: boolean; pontos: number | null; scout: Scouts | null } | null;
  partidas: Array<{ rodada: number; opp: number; casa: boolean; golsPro: number | null; golsContra: number | null; pontos: number; scout: Scouts }>;
}

/** Próximo jogo do clube na rodada analisada, ou o confronto escolhido pelo usuário. */
export function confrontoDe(base: BaseCruzamento, clubeId: number, opts: Pick<OpcoesCruzamento, "adversarioId" | "mandoConfronto">): Confronto | null {
  const m = base.matches.find((x) => x.rodada === base.rodadaAlvo && (x.casaId === clubeId || x.foraId === clubeId));
  const realOpp = m ? (m.casaId === clubeId ? m.foraId : m.casaId) : null;
  const realCasa = m ? m.casaId === clubeId : null;
  if (opts.adversarioId && opts.adversarioId !== clubeId) {
    const casa = opts.mandoConfronto ? opts.mandoConfronto === "casa" : realOpp === opts.adversarioId && realCasa != null ? realCasa : true;
    return { rodada: base.rodadaAlvo, adversarioId: opts.adversarioId, casa, hipotetico: !(realOpp === opts.adversarioId && realCasa === casa) };
  }
  if (realOpp == null || realCasa == null) return null;
  if (opts.mandoConfronto && (opts.mandoConfronto === "casa") !== realCasa) return { rodada: base.rodadaAlvo, adversarioId: realOpp, casa: opts.mandoConfronto === "casa", hipotetico: true };
  return { rodada: base.rodadaAlvo, adversarioId: realOpp, casa: realCasa, hipotetico: false };
}

function amostra(base: BaseCruzamento, atletaId: number, janela: Janela, mando: FiltroMando) {
  let rows = base.porAtleta.get(atletaId) ?? [];
  if (mando !== "todos") rows = rows.filter((l) => l.casa === (mando === "casa"));
  if (janela) rows = rows.slice(-janela);
  return rows;
}

function confiancaTaxa(n: number, alpha: number, jogosAdv: number): Confianca {
  const cv = 1 / Math.sqrt(Math.max(alpha, 1e-9));
  if (n >= 10 && cv <= 0.3 && jogosAdv >= 6) return "alta";
  if (n >= 5 && cv <= 0.55) return "media";
  return "baixa";
}

function terciL(base: BaseCruzamento, pos: PositionId, s: CruzScout): [number, number] {
  return memo(base, `tercil:${pos}:${s}`, () => {
    const t = tabelaCedencia(base, pos, s, null, "todos");
    const fs = [...t.porClube.values()]
      .filter((c) => c.n)
      .map((c) => (t.L > 0 ? c.soma / c.n / t.L : 1))
      .sort((a, b) => a - b);
    return [quantil(fs, 1 / 3), quantil(fs, 2 / 3)] as [number, number];
  });
}

function historico(base: BaseCruzamento, rows: Linha[], todas: Linha[], s: CruzScout, pos: PositionId, conf: Confronto | null, leve: boolean): Historico {
  const xs = rows.map((l) => valorScout(l.scout, s));
  const all = todas.map((l) => valorScout(l.scout, s));
  const rec = all.slice(-5);
  const resto = all.slice(0, -5);
  let tendencia: Historico["tendencia"] = null;
  if (!leve && rec.length === 5 && resto.length >= MIN_JOGOS) {
    // com taxas iguais, os eventos dos últimos 5 jogos seguem Binomial(total, 5/n)
    const x = Math.round(rec.reduce((a, b) => a + b, 0));
    const total = x + Math.round(resto.reduce((a, b) => a + b, 0));
    if (total >= 3) {
      const p0 = 5 / (5 + resto.length);
      let abaixo = 0;
      for (let k = 0; k < x; k++) abaixo += binomialPmf(k, total, p0);
      const pAcima = 1 - abaixo;
      const pAbaixo = abaixo + binomialPmf(x, total, p0);
      tendencia = { rotulo: pAcima < 0.05 ? "alta" : pAbaixo < 0.05 ? "queda" : "estavel", p: r3(Math.min(pAcima, pAbaixo)) };
    }
  }
  const em = (casa: boolean) => {
    const v = todas.filter((l) => l.casa === casa).map((l) => valorScout(l.scout, s));
    return { n: v.length, media: r3(media(v)) };
  };
  let perfil: Historico["perfil"] = null;
  if (!leve && conf) {
    const [t1, t2] = terciL(base, pos, s);
    const tab = tabelaCedencia(base, pos, s, null, "todos");
    const fatorBruto = (c: number) => {
      const x = tab.porClube.get(c);
      return x && x.n && tab.L > 0 ? x.soma / x.n / tab.L : 1;
    };
    const faixa = (f: number) => (f >= t2 ? "cede muito" : f <= t1 ? "cede pouco" : "cede na média");
    const alvo = faixa(fatorBruto(conf.adversarioId));
    const v = todas.filter((l) => faixa(fatorBruto(l.opp)) === alvo).map((l) => valorScout(l.scout, s));
    perfil = { faixa: alvo, n: v.length, media: r3(media(v)) };
  }
  const com = xs.filter((x) => x >= 1).length;
  return {
    n: xs.length,
    total: xs.reduce((a, b) => a + b, 0),
    media: r3(media(xs)),
    mediana: mediana(xs),
    desvio: r3(desvio(xs)),
    jogosCom: com,
    freq: xs.length ? r3(com / xs.length) : 0,
    maximo: xs.length ? Math.max(...xs) : 0,
    recente: { n: rec.length, media: r3(media(rec)) },
    tendencia,
    casa: em(true),
    fora: em(false),
    perfil,
  };
}

/** Projeção pela taxa do atleta × adversário × mando. */
function projetarTaxa(
  base: BaseCruzamento,
  rows: Linha[],
  s: CruzScout,
  pos: PositionId,
  conf: Confronto,
  opts: OpcoesCruzamento,
  lado: LadoLateral | undefined,
  comFaixa: boolean,
): { proj: ProjecaoScout | null; ced: Cedido; motivo?: string; zero?: boolean } {
  const venueAmostra = opts.mando;
  const L = liga(base, pos, s, venueAmostra);
  const venueAdv: FiltroMando = venueAmostra === "todos" ? "todos" : venueAmostra === "casa" ? "fora" : "casa";
  const ced = cedidoPor(base, conf.adversarioId, pos, s, opts.janela, venueAdv, lado);
  if (rows.length < MIN_JOGOS) return { proj: null, ced, motivo: `Amostra insuficiente: ${rows.length} jogo(s) com dados (mínimo ${MIN_JOGOS}).` };
  if (L.mu <= 0 && rows.every((l) => !valorScout(l.scout, s))) return { proj: null, ced, motivo: "Nenhum atleta da posição registrou esse scout na amostra.", zero: true };
  let sw = 0;
  let swx = 0;
  rows.forEach((l, i) => {
    const w = opts.janela ? 1 : decayWeight(rows.length - 1 - i, opts.meiaVida);
    sw += w;
    swx += w * valorScout(l.scout, s);
  });
  const alpha = L.a0 + L.phi * swx;
  const beta = L.b0 + L.phi * sw;
  const muProj = liga(base, pos, s, conf.casa ? "casa" : "fora").mu;
  const fatorMando = L.mu > 0 && muProj > 0 ? muProj / L.mu : 1;
  const c = ced.fator * fatorMando;
  const taxa = alpha / beta;
  const lambda = c * taxa;
  const k = L.k;
  const sizeEff = Number.isFinite(k) ? 1 / (1 / k + 1 / alpha + 1 / (k * alpha)) : alpha;
  const def = DEF_POR_CODIGO.get(s)!;
  const lo = comFaixa && alpha > 0 ? c * gammaQuantile(0.1, alpha, beta) : null;
  const hi = comFaixa && alpha > 0 ? c * gammaQuantile(0.9, alpha, beta) : null;
  const xs = rows.map((l) => valorScout(l.scout, s));
  const limiares: Limiar[] = def.limiares.map((t) => ({
    k: t,
    p: r3(probAtLeast(t, lambda, sizeEff)),
    pBaixo: lo != null ? r3(probAtLeast(t, lo, k)) : null,
    pAlto: hi != null ? r3(probAtLeast(t, hi, k)) : null,
    freqHist: r3(xs.filter((x) => x >= t).length / xs.length),
  }));
  return {
    ced,
    proj: {
      metodo: "taxa",
      lambda: r3(lambda),
      intervalo: lo != null && hi != null ? [r3(lo), r3(hi)] : null,
      limiares,
      confianca: confiancaTaxa(rows.length, alpha, ced.jogos),
      componentes: {
        taxaJogador: r3(taxa),
        mediaPosicao: r3(L.mu),
        pesoPrior: r3(L.b0),
        pesoDados: r3(L.phi * sw),
        fatorAdversario: r3(ced.fator),
        fatorMando: r3(fatorMando),
        dispersao: Number.isFinite(k) ? r3(k) : null,
      },
      k: sizeEff,
    },
  };
}

/** SG, gols sofridos e vitória: do placar esperado (Poisson). */
function projetarPlacar(s: CruzScout, gols: { pro: number; contra: number }, jogosTime: number, jogosAdv: number, xs: number[], qSG = 1): ProjecaoScout {
  const conf: Confianca = jogosTime >= 10 && jogosAdv >= 10 ? "alta" : jogosTime >= 5 && jogosAdv >= 5 ? "media" : "baixa";
  const freq = (t: number) => (xs.length ? r3(xs.filter((x) => x >= t).length / xs.length) : null);
  const comp = { fatorAdversario: 1, fatorMando: 1, golsPro: r3(gols.pro), golsContra: r3(gols.contra) };
  if (s === "SG") {
    const p = Math.exp(-gols.contra) * qSG;
    return { metodo: "placar", lambda: r3(p), intervalo: null, limiares: [{ k: 1, p: r3(p), pBaixo: null, pAlto: null, freqHist: freq(1) }], confianca: conf, componentes: { ...comp, qSG: r3(qSG) } };
  }
  if (s === "V") {
    const p = pVitoria(gols.pro, gols.contra);
    return { metodo: "placar", lambda: r3(p), intervalo: null, limiares: [{ k: 1, p: r3(p), pBaixo: null, pAlto: null, freqHist: freq(1) }], confianca: conf, componentes: comp };
  }
  // GS: gols sofridos pelo goleiro
  const def = DEF_POR_CODIGO.get(s)!;
  return {
    metodo: "placar",
    lambda: r3(gols.contra),
    intervalo: null,
    limiares: def.limiares.map((t) => ({ k: t, p: r3(probAtLeast(t, gols.contra)), pBaixo: null, pAlto: null, freqHist: freq(t) })),
    confianca: conf,
    componentes: comp,
  };
}

/** Sorteio binomial simples (n pequeno: gols do time). */
function binomial(n: number, p: number, u: () => number) {
  let k = 0;
  for (let i = 0; i < n; i++) if (u() < p) k++;
  return k;
}

function binomialPmf(k: number, n: number, p: number) {
  if (k < 0 || k > n) return 0;
  let c = 1;
  for (let i = 0; i < k; i++) c = (c * (n - i)) / (i + 1);
  return c * p ** k * (1 - p) ** (n - k);
}

/**
 * Pontuação do próximo jogo com os scouts projetados e a tabela vigente.
 * Média e desvio são exatos: scouts individuais somam variâncias (independentes dado o
 * jogo) e a parte do placar (gols, assistências, SG, gols sofridos) é enumerada placar a
 * placar, sem tratar esses eventos como independentes. Os cenários (20%, 50%, 80%) vêm
 * de `n` jogos simulados com a mesma estrutura.
 */
export function simularPontos(pos: PositionId, scouts: AnaliseScout[], gols: { pro: number; contra: number }, pontuacao: Record<ScoutKey, number>, n = 4000, seed = 7): ProjecaoPontos | null {
  const proj = new Map(scouts.filter((s) => s.projecao).map((s) => [s.codigo, s.projecao!] as const));
  const zerados = new Set(scouts.filter((s) => s.zero).map((s) => s.codigo));
  const base = POSITION_SCOUTS[pos].filter((k) => k !== "V" && !zerados.has(k));
  const taxa = base.filter((k) => !["G", "A", "SG", "GS"].includes(k));
  for (const k of taxa) if (!proj.has(k)) return null;
  const lG = base.includes("G") ? (proj.get("G")?.lambda ?? 0) : 0;
  const lA = base.includes("A") ? (proj.get("A")?.lambda ?? 0) : 0;
  const piG = gols.pro > 0 ? Math.min(0.95, lG / gols.pro) : 0;
  const piA = gols.pro - lG > 0 ? Math.min(0.95, lA / (gols.pro - lG)) : 0;
  const temSG = base.includes("SG");
  const temGS = base.includes("GS");
  const qSG = proj.get("SG")?.componentes.qSG ?? 1;

  // parte do placar, enumerada
  const MAXG = 10;
  const pmf = (mu: number) => {
    const v = Array.from({ length: MAXG + 1 }, (_, g) => poisson(g, mu));
    const t = v.reduce((a, b) => a + b, 0);
    return v.map((x) => x / t);
  };
  const pPro = pmf(gols.pro);
  const pContra = pmf(gols.contra);
  let e1 = 0;
  let e2 = 0;
  for (let gp = 0; gp <= MAXG; gp++)
    for (let g = 0; g <= gp; g++) {
      const pg = pPro[gp] * binomialPmf(g, gp, piG);
      if (pg < 1e-12) continue;
      for (let a = 0; a <= gp - g; a++) {
        const pr = pg * binomialPmf(a, gp - g, piA);
        const t = g * pontuacao.G + a * pontuacao.A;
        e1 += pr * t;
        e2 += pr * t * t;
      }
    }
  let c1 = 0;
  let c2 = 0;
  for (let gc = 0; gc <= MAXG; gc++) {
    const t = temGS ? gc * pontuacao.GS : 0;
    if (temSG && gc === 0) {
      c1 += pContra[gc] * (qSG * (t + pontuacao.SG) + (1 - qSG) * t);
      c2 += pContra[gc] * (qSG * (t + pontuacao.SG) ** 2 + (1 - qSG) * t * t);
    } else {
      c1 += pContra[gc] * t;
      c2 += pContra[gc] * t * t;
    }
  }
  let esperado = e1 + c1;
  let variance = e2 - e1 * e1 + (c2 - c1 * c1);
  const contribuicoes: ProjecaoPontos["contribuicoes"] = [];
  for (const k of base) {
    let e: number;
    let p1: number | null = null;
    if (k === "SG") {
      p1 = Math.exp(-gols.contra) * qSG;
      e = p1 * pontuacao.SG;
    } else if (k === "GS") {
      e = gols.contra * pontuacao.GS;
      p1 = 1 - Math.exp(-gols.contra);
    } else {
      const pr = proj.get(k);
      if (!pr) continue;
      e = pr.lambda * pontuacao[k];
      p1 = pr.limiares.find((l) => l.k === 1)?.p ?? r3(probAtLeast(1, pr.lambda, pr.k));
      if (k !== "G" && k !== "A") {
        esperado += e;
        const sz = pr.k && Number.isFinite(pr.k) ? pr.k : Infinity;
        variance += pontuacao[k] ** 2 * (pr.lambda + (Number.isFinite(sz) ? (pr.lambda * pr.lambda) / sz : 0));
      }
    }
    contribuicoes.push({ codigo: k, pontos: r3(e), pAoMenosUm: p1 == null ? null : r3(p1) });
  }
  contribuicoes.sort((a, b) => b.pontos - a.pontos);
  const out: ProjecaoPontos = {
    esperado: Math.round(esperado * 100) / 100,
    desvio: Math.round(Math.sqrt(Math.max(0, variance)) * 100) / 100,
    p20: null,
    p50: null,
    p80: null,
    pNegativo: null,
    pAcima: null,
    contribuicoes,
    simulacoes: n,
  };
  if (n <= 0) return out;

  const rng = new Rng(seed);
  const u = () => rng.next();
  const pts = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const gp = sortearNegBin(gols.pro, undefined, u);
    const gc = sortearNegBin(gols.contra, undefined, u);
    const g = binomial(gp, piG, u);
    const a = binomial(gp - g, piA, u);
    let p = g * pontuacao.G + a * pontuacao.A;
    if (temSG && gc === 0 && u() < qSG) p += pontuacao.SG;
    if (temGS) p += gc * pontuacao.GS;
    for (const k of taxa) {
      const pr = proj.get(k)!;
      if (pr.lambda > 0) p += sortearNegBin(pr.lambda, pr.k, u) * pontuacao[k];
    }
    pts[i] = p;
  }
  const ord = Float64Array.from(pts).sort();
  const frac = (f: (x: number) => boolean) => {
    let c = 0;
    for (const x of pts) if (f(x)) c++;
    return r3(c / n);
  };
  out.p20 = Math.round(quantil(ord, 0.2) * 100) / 100;
  out.p50 = Math.round(quantil(ord, 0.5) * 100) / 100;
  out.p80 = Math.round(quantil(ord, 0.8) * 100) / 100;
  out.pNegativo = frac((x) => x < 0);
  out.pAcima = { 5: frac((x) => x >= 5), 8: frac((x) => x >= 8), 12: frac((x) => x >= 12) };
  return out;
}

/** Análise completa de um atleta para o confronto da rodada (ou o escolhido). */
export function analisarAtleta(base: BaseCruzamento, atleta: AtletaInfo, opts: OpcoesCruzamento, realRow?: PlayerRound | null): AnaliseAtleta {
  const conf = confrontoDe(base, atleta.clubeId, opts);
  const todas = base.porAtleta.get(atleta.id) ?? [];
  const rows = amostra(base, atleta.id, opts.janela, opts.mando);
  const pos = atleta.posicaoId;
  const lado = pos === 2 ? [...todas].reverse().find((l) => l.lado)?.lado : undefined;
  const gm = modeloGols(base, opts.janela);
  const gols = conf ? golsEsperados(gm, atleta.clubeId, conf.adversarioId, conf.casa) : null;
  const defs = scoutsDaPosicao(pos);
  const detalhe = new Set(opts.scoutsDetalhe ?? defs.map((d) => d.codigo));
  const scouts: AnaliseScout[] = defs.map((d) => {
    const hist = historico(base, rows, todas, d.codigo, pos, conf, Boolean(opts.leve));
    const real = realRow ? valorScout(realRow.scout, d.codigo) : realRow === null ? null : undefined;
    if (!conf) return { codigo: d.codigo, hist, adversario: null, projecao: null, semProjecao: "Sem jogo do clube nesta rodada.", real };
    if (d.doPlacar) {
      if (!gols) return { codigo: d.codigo, hist, adversario: null, projecao: null, semProjecao: "Sem placar esperado.", real };
      const jt = gm.jogos.get(atleta.clubeId) ?? 0;
      const ja = gm.jogos.get(conf.adversarioId) ?? 0;
      if (jt < MIN_JOGOS || ja < MIN_JOGOS) return { codigo: d.codigo, hist, adversario: null, projecao: null, semProjecao: "Poucos jogos dos times para o modelo de gols.", real };
      const q = d.codigo === "SG" ? aproveitamentoSG(base, atleta.id, pos).q : 1;
      return {
        codigo: d.codigo,
        hist,
        adversario: null,
        projecao: projetarPlacar(
          d.codigo,
          gols,
          jt,
          ja,
          rows.map((l) => valorScout(l.scout, d.codigo)),
          q,
        ),
        real,
      };
    }
    const { proj, ced, motivo, zero } = projetarTaxa(base, rows, d.codigo, pos, conf, opts, lado, detalhe.has(d.codigo));
    return { codigo: d.codigo, hist, adversario: ced, projecao: proj, semProjecao: motivo, real, zero };
  });

  const ptsTodas = todas.map((l) => l.pontos);
  const ptsJanela = rows.map((l) => l.pontos);
  const medianaPos = memo(base, `medpts:${pos}`, () => mediana(base.linhas.filter((l) => l.pos === pos).map((l) => l.pontos)));
  const pontosHist = {
    media: ptsTodas.length ? Math.round(media(ptsTodas) * 100) / 100 : null,
    recente: ptsTodas.length ? Math.round(media(ptsTodas.slice(-5)) * 100) / 100 : null,
    janela: ptsJanela.length ? Math.round(media(ptsJanela) * 100) / 100 : null,
    regularidade: ptsJanela.length ? r3(ptsJanela.filter((x) => x >= medianaPos).length / ptsJanela.length) : null,
    n: ptsTodas.length,
  };

  let pontos: ProjecaoPontos | null = null;
  let semPontos: string | undefined;
  if (pos === 6) semPontos = "O técnico pontua por regra própria do Cartola; a projeção por scouts não se aplica. Veja o histórico oficial e a chance de vitória.";
  else if (!conf || !gols) semPontos = "Sem confronto nesta rodada.";
  else if (rows.length < MIN_JOGOS) semPontos = `Amostra insuficiente para projetar a pontuação (${rows.length} jogo(s); mínimo ${MIN_JOGOS}).`;
  else {
    pontos = simularPontos(pos, scouts, gols, opts.pontuacao, opts.simulacoes ?? 4000, atleta.id);
    if (!pontos) semPontos = "Algum scout da posição ficou sem projeção.";
  }

  const real = realRow === undefined ? null : { jogou: Boolean(realRow), pontos: realRow?.pontos ?? null, scout: realRow?.scout ?? null };
  return {
    atleta,
    confronto: conf,
    amostra: { jogos: rows.length, jogosTemporada: todas.length, rodadas: rows.length ? [rows[0].rodada, rows[rows.length - 1].rodada] : null, janela: opts.janela, mando: opts.mando },
    pontosHist,
    scouts,
    pontos,
    semPontos,
    gols: gols ? { pro: r3(gols.pro), contra: r3(gols.contra), pSG: r3(Math.exp(-gols.contra)), pVitoria: r3(pVitoria(gols.pro, gols.contra)) } : null,
    real,
    partidas: todas.map((l) => ({ rodada: l.rodada, opp: l.opp, casa: l.casa, golsPro: l.golsPro, golsContra: l.golsContra, pontos: l.pontos, scout: l.scout })).reverse(),
  };
}

/* ------------------------------ ranking ------------------------------ */

export type CriterioRanking = "pontos" | "ofensivo" | "defensivo" | "regularidade" | "confronto" | "volatilidade" | "razao" | "scout";

export const CRITERIOS: Array<{ id: CriterioRanking; nome: string; explica: string }> = [
  { id: "pontos", nome: "Pontuação projetada", explica: "Pontos esperados no próximo jogo, se entrar em campo: soma de cada scout esperado × o valor do scout." },
  { id: "scout", nome: "Scout escolhido", explica: "Probabilidade de atingir o limite do scout escolhido no próximo jogo." },
  { id: "ofensivo", nome: "Potencial ofensivo", explica: "Pontos esperados só dos scouts de ataque: gol, assistência, finalizações, faltas e pênaltis sofridos." },
  { id: "defensivo", nome: "Potencial defensivo", explica: "Pontos esperados só dos scouts de defesa: desarmes, SG, defesas e defesas de pênalti." },
  { id: "confronto", nome: "Melhor confronto", explica: "Pontos a mais (ou a menos) que o mesmo atleta faria contra um adversário médio, no mesmo mando." },
  { id: "regularidade", nome: "Regularidade", explica: "Em quantos jogos da amostra ele pontuou acima da mediana da posição." },
  { id: "volatilidade", nome: "Menor volatilidade", explica: "Desvio-padrão da pontuação simulada: quanto menor, mais previsível." },
  { id: "razao", nome: "Risco × potencial", explica: "Pontos esperados ÷ desvio-padrão: quanto ele entrega por unidade de risco." },
];

const OFENSIVOS: ScoutKey[] = ["G", "A", "FT", "FD", "FF", "FS", "PS"];
const DEFENSIVOS: ScoutKey[] = ["DS", "SG", "DE", "DP"];

export interface LinhaRanking {
  atletaId: number;
  apelido: string;
  clubeId: number;
  posicaoId: PositionId;
  adversarioId: number | null;
  casa: boolean | null;
  jogos: number;
  confianca: Confianca | null;
  scout: { codigo: CruzScout; lambda: number | null; limiar: number; p: number | null; freqHist: number | null; real?: number | null };
  esperado: number | null;
  p20: number | null;
  p80: number | null;
  desvio: number | null;
  ofensivo: number | null;
  defensivo: number | null;
  confronto: number | null;
  regularidade: number | null;
  razao: number | null;
  real?: { jogou: boolean; pontos: number | null } | null;
}

/** Uma linha do ranking a partir da análise do atleta. */
export function linhaRanking(an: AnaliseAtleta, scout: CruzScout, limiar: number): LinhaRanking {
  const sc = an.scouts.find((s) => s.codigo === scout);
  const lim = sc?.projecao?.limiares.find((l) => l.k === limiar) ?? sc?.projecao?.limiares[0];
  const soma = (keys: ScoutKey[]) => (an.pontos ? Math.round(an.pontos.contribuicoes.filter((c) => keys.includes(c.codigo)).reduce((s, c) => s + c.pontos, 0) * 100) / 100 : null);
  // confronto: pontos esperados − os mesmos pontos contra um adversário médio (fator 1), no mesmo mando
  let confronto: number | null = null;
  if (an.pontos) {
    let d = 0;
    for (const s of an.scouts) {
      const pr = s.projecao;
      if (!pr || pr.metodo !== "taxa") continue;
      const f = pr.componentes.fatorAdversario;
      const valor = an.pontos.contribuicoes.find((x) => x.codigo === s.codigo)?.pontos ?? 0;
      d += f > 0 ? valor - valor / f : 0;
    }
    confronto = Math.round(d * 100) / 100;
  }
  return {
    atletaId: an.atleta.id,
    apelido: an.atleta.apelido,
    clubeId: an.atleta.clubeId,
    posicaoId: an.atleta.posicaoId,
    adversarioId: an.confronto?.adversarioId ?? null,
    casa: an.confronto?.casa ?? null,
    jogos: an.amostra.jogos,
    confianca: sc?.projecao?.confianca ?? null,
    scout: { codigo: scout, lambda: sc?.projecao?.lambda ?? null, limiar: lim?.k ?? limiar, p: lim?.p ?? null, freqHist: lim?.freqHist ?? null, real: sc?.real },
    esperado: an.pontos?.esperado ?? null,
    p20: an.pontos?.p20 ?? null,
    p80: an.pontos?.p80 ?? null,
    desvio: an.pontos?.desvio ?? null,
    ofensivo: soma(OFENSIVOS),
    defensivo: soma(DEFENSIVOS),
    confronto,
    regularidade: an.pontosHist.regularidade,
    razao: an.pontos && an.pontos.desvio > 0 ? Math.round((an.pontos.esperado / an.pontos.desvio) * 100) / 100 : null,
    real: an.real ? { jogou: an.real.jogou, pontos: an.real.pontos } : undefined,
  };
}

/* ----------------------------- conferência ----------------------------- */

export interface Calibracao {
  meiaVida: number;
  candidatos: Array<{ meiaVida: number; logLoss: number; brier: number }>;
  porScout: Array<{ codigo: CruzScout; limiar: number; n: number; previsto: number; observado: number; brier: number; brierBase: number; habilidade: number }>;
  faixas: Array<{ de: number; ate: number; n: number; previsto: number; observado: number }>;
  rodadas: [number, number] | null;
  previsoes: number;
}

const ALVOS: Array<[CruzScout, number]> = [
  ["FIN", 1],
  ["DS", 1],
  ["DS", 2],
  ["G", 1],
  ["A", 1],
  ["FS", 1],
  ["FC", 1],
  ["CA", 1],
  ["DE", 3],
  ["SG", 1],
];

/**
 * Conferência fora da amostra (walk-forward): para cada rodada passada, o modelo só vê
 * as rodadas anteriores e prevê P(scout ≥ k) de quem entrou em campo; depois compara com
 * o que aconteceu. Também escolhe a meia-vida de recência pela menor perda logarítmica.
 */
export function calibrar(data: DadosBase & { rodadaAtual: number }, pontuacao: Record<ScoutKey, number>, candidatos: number[] = [4, 8, 16, Infinity], rodadaInicial = 6): Calibracao {
  const fim = data.rodadaAtual - 1;
  type Prev = { codigo: CruzScout; limiar: number; p: number; y: number; base: number };
  const porH = new Map<number, Prev[]>(candidatos.map((h) => [h, []]));
  const ctx = buildContextIndex(data.matches);
  for (let r = rodadaInicial; r <= fim; r++) {
    const base = prepararBase(data, r);
    const freqBase = new Map<string, number>();
    const fb = (pos: PositionId, s: CruzScout, k: number) => {
      const key = `${pos}:${s}:${k}`;
      if (!freqBase.has(key)) {
        const rs = base.linhas.filter((l) => l.pos === pos);
        freqBase.set(key, rs.length ? rs.filter((l) => valorScout(l.scout, s) >= k).length / rs.length : 0);
      }
      return freqBase.get(key)!;
    };
    for (const pr of data.history) {
      if (pr.rodada !== r || pr.posicaoId === 6) continue;
      const g = ctx.get(`${r}:${pr.clubeId}`);
      if (!g) continue;
      const rows = base.porAtleta.get(pr.atletaId) ?? [];
      if (rows.length < MIN_JOGOS) continue;
      const conf: Confronto = { rodada: r, adversarioId: g.opp, casa: g.home, hipotetico: false };
      for (const [s, k] of ALVOS) {
        const def = DEF_POR_CODIGO.get(s)!;
        if (!def.posicoes.includes(pr.posicaoId)) continue;
        const y = valorScout(pr.scout, s) >= k ? 1 : 0;
        const b = clamp(fb(pr.posicaoId, s, k), 0.001, 0.999);
        if (def.doPlacar) {
          const gm = modeloGols(base, null);
          const e = golsEsperados(gm, pr.clubeId, g.opp, g.home);
          const p = Math.exp(-e.contra) * aproveitamentoSG(base, pr.atletaId, pr.posicaoId).q;
          for (const h of candidatos) porH.get(h)!.push({ codigo: s, limiar: k, p, y, base: b });
          continue;
        }
        const lado = pr.posicaoId === 2 ? [...rows].reverse().find((l) => l.lado)?.lado : undefined;
        for (const h of candidatos) {
          const { proj } = projetarTaxa(base, rows, s, pr.posicaoId, conf, { janela: null, mando: "todos", meiaVida: h, pontuacao }, lado, false);
          if (!proj) continue;
          const p = proj.limiares.find((l) => l.k === k)?.p ?? 0;
          porH.get(h)!.push({ codigo: s, limiar: k, p, y, base: b });
        }
      }
    }
  }
  const perda = (ps: Prev[]) => {
    let ll = 0;
    let br = 0;
    for (const x of ps) {
      const p = clamp(x.p, 1e-4, 1 - 1e-4);
      ll -= x.y * Math.log(p) + (1 - x.y) * Math.log(1 - p);
      br += (x.p - x.y) ** 2;
    }
    return { logLoss: ps.length ? ll / ps.length : 0, brier: ps.length ? br / ps.length : 0 };
  };
  const cand = candidatos.map((h) => ({ meiaVida: h, ...perda(porH.get(h)!) }));
  const total = porH.get(candidatos[0])!.length;
  const melhor = total ? cand.reduce((a, b) => (b.logLoss < a.logLoss ? b : a)) : { meiaVida: MEIA_VIDA_PADRAO };
  const ps = porH.get(melhor.meiaVida) ?? [];
  const grupos = new Map<string, Prev[]>();
  for (const x of ps) {
    const k = `${x.codigo}:${x.limiar}`;
    grupos.set(k, [...(grupos.get(k) ?? []), x]);
  }
  const porScout = [...grupos.values()].map((g) => {
    const brier = g.reduce((s, x) => s + (x.p - x.y) ** 2, 0) / g.length;
    const brierBase = g.reduce((s, x) => s + (x.base - x.y) ** 2, 0) / g.length;
    return {
      codigo: g[0].codigo,
      limiar: g[0].limiar,
      n: g.length,
      previsto: r3(media(g.map((x) => x.p))),
      observado: r3(media(g.map((x) => x.y))),
      brier: r3(brier),
      brierBase: r3(brierBase),
      habilidade: brierBase > 0 ? r3(1 - brier / brierBase) : 0,
    };
  });
  const faixas: Calibracao["faixas"] = [];
  for (let i = 0; i < 10; i++) {
    const de = i / 10;
    const ate = (i + 1) / 10;
    const g = ps.filter((x) => x.p >= de && (i === 9 ? x.p <= ate : x.p < ate));
    if (g.length) faixas.push({ de, ate, n: g.length, previsto: r3(media(g.map((x) => x.p))), observado: r3(media(g.map((x) => x.y))) });
  }
  return {
    meiaVida: melhor.meiaVida,
    candidatos: cand.map((c) => ({ meiaVida: c.meiaVida, logLoss: r3(c.logLoss), brier: r3(c.brier) })),
    porScout,
    faixas,
    rodadas: total ? [rodadaInicial, fim] : null,
    previsoes: ps.length,
  };
}

/* ------------------------- cruzamento por times ------------------------- */

/** Setor analisado: uma posição, laterais por lado, ou o time inteiro (sem técnico). */
export type SetorTimes = "time" | 1 | 2 | 3 | 4 | 5 | "LE" | "LD";

export interface JogoTimes {
  rodada: number;
  /** quem estava do outro lado nesse jogo */
  adversarioId: number;
  casa: boolean;
  golsPro: number;
  golsContra: number;
  valor: number;
  atletas: Array<{ atletaId: number; valor: number }>;
}

export interface LadoTimes {
  total: number;
  jogos: number;
  media: number;
  lista: JogoTimes[];
}

export interface LinhaTimes {
  matchId: number;
  timeId: number;
  adversarioId: number;
  /** o time analisado joga em casa nesta partida */
  timeEmCasa: boolean;
  /** o que o setor do time analisado fez nos últimos jogos no mesmo mando */
  conquistado: LadoTimes;
  /** o que o adversário permitiu ao mesmo setor nos últimos jogos no mando oposto */
  cedido: LadoTimes;
  /** rodada passada: o que o setor do time analisado fez nesta partida */
  real?: number | null;
}

export interface OpcoesTimes {
  scout: CruzScout;
  setor: SetorTimes;
  /** últimos N jogos no mando; null = todos */
  recorte: number | null;
  lado: "mandantes" | "visitantes";
}

const doSetor = (setor: SetorTimes) => (l: Linha) =>
  setor === "time" ? l.pos !== 6 : setor === "LE" ? l.pos === 2 && l.lado === "E" : setor === "LD" ? l.pos === 2 && l.lado === "D" : l.pos === setor;

/**
 * Cruzamento por times, jogo a jogo da rodada:
 *  - Conquistado: soma do scout feita pelo setor do time analisado nos últimos N jogos
 *    dele no MESMO mando desta partida (visitante → jogos fora);
 *  - Cedido: soma do scout feita pelo mesmo setor dos times que enfrentaram o adversário,
 *    nos últimos N jogos do adversário no mando OPOSTO (adversário em casa → jogos em casa).
 * SG conta jogos: conquistado = jogos sem sofrer gol; cedido = jogos em que o adversário não marcou.
 * Jogo sem nenhum registro do time no histórico (rodada que faltou na fonte) fica fora da conta.
 */
export function cruzarTimes(base: BaseCruzamento, opts: OpcoesTimes, historicoRodada?: PlayerRound[]): LinhaTimes[] {
  const noSetor = doSetor(opts.setor);
  const porJogo = memo(base, "times:porJogo", () => {
    const m = new Map<string, Linha[]>();
    for (const l of base.linhas) {
      const k = `${l.rodada}:${l.clubeId}`;
      const a = m.get(k);
      if (a) a.push(l);
      else m.set(k, [l]);
    }
    return m;
  });
  const sg = opts.scout === "SG";
  /** o que o time `quem` fez em cada jogo da lista */
  const somar = (quem: (j: JogoClube) => number, jogos: JogoClube[], semGol: (j: JogoClube) => boolean): LadoTimes => {
    const lista: JogoTimes[] = [];
    for (const j of jogos) {
      const linhas = porJogo.get(`${j.rodada}:${quem(j)}`);
      if (!linhas?.length) continue; // sem dados da fonte nesse jogo
      const doLado = linhas.filter(noSetor);
      const atletas = doLado.map((l) => ({ atletaId: l.atletaId, valor: valorScout(l.scout, opts.scout) })).filter((a) => a.valor);
      const valor = sg ? (semGol(j) ? 1 : 0) : atletas.reduce((s, a) => s + a.valor, 0);
      lista.push({ rodada: j.rodada, adversarioId: j.opp, casa: j.casa, golsPro: j.golsPro, golsContra: j.golsContra, valor, atletas: sg ? [] : atletas.sort((a, b) => b.valor - a.valor) });
    }
    const total = lista.reduce((s, x) => s + x.valor, 0);
    return { total, jogos: lista.length, media: lista.length ? r3(total / lista.length) : 0, lista };
  };
  const ultimos = (clube: number, casa: boolean) => {
    const js = (base.jogosClube.get(clube) ?? []).filter((j) => j.casa === casa);
    return opts.recorte ? js.slice(0, opts.recorte) : js;
  };
  const out: LinhaTimes[] = [];
  for (const m of base.matches.filter((x) => x.rodada === base.rodadaAlvo).sort((a, b) => (a.data ?? "").localeCompare(b.data ?? "") || a.id - b.id)) {
    const emCasa = opts.lado === "mandantes";
    const time = emCasa ? m.casaId : m.foraId;
    const adv = emCasa ? m.foraId : m.casaId;
    // conquistado: jogos do time no mesmo mando; o próprio time é quem faz o scout
    const conquistado = somar(
      () => time,
      ultimos(time, emCasa),
      (j) => j.golsContra === 0,
    );
    // cedido: jogos do adversário no mando oposto; quem faz o scout é o time que o enfrentou
    const cedido = somar(
      (j) => j.opp,
      ultimos(adv, !emCasa),
      (j) => j.golsPro === 0,
    );
    let real: number | null | undefined;
    if (historicoRodada) {
      const linhas = historicoRodada.filter((h) => h.clubeId === time);
      if (!linhas.length) real = null;
      else if (sg) {
        const gc = emCasa ? m.golsFora : m.golsCasa;
        real = gc == null ? null : gc === 0 ? 1 : 0;
      } else {
        const lado = (h: PlayerRound) => (h.posicaoId === 2 ? base.porAtleta.get(h.atletaId)?.find((l) => l.lado)?.lado : undefined);
        real = linhas.filter((h) => noSetor({ pos: h.posicaoId, lado: lado(h) } as Linha)).reduce((s, h) => s + valorScout(h.scout, opts.scout), 0);
      }
    }
    out.push({ matchId: m.id, timeId: time, adversarioId: adv, timeEmCasa: emCasa, conquistado, cedido, real });
  }
  return out;
}
