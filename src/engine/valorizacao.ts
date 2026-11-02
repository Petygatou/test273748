/**
 * Fórmula de valorização do Cartola (regra de 2025 em diante), escrita a partir da
 * descrição pública do CartolaAnalítico ("A fórmula de valorização 2025").
 *
 *   média nova  = (média × jogos + pontos) ÷ (jogos + 1);  jogos' = jogos + 1
 *   ka = (3 + jogos') ÷ 2,  kc = (15 − jogos') ÷ 2   (a partir de 6 jogos: ka = 4, kc = 5)
 *   preço novo  = s × (pontos + ka × média nova + kc × preço médio do ano),  mínimo C$ 0,70
 *   valorização = preço novo − preço
 *
 * s é o fator de inflação da rodada (≈ 0,13), calculado com todos os atletas que jogaram para
 * o preço médio do mercado não mudar. Como o preço novo é linear nos pontos, o mínimo para
 * valorizar (pontos com valorização zero) sai fechado.
 */

export interface EntradaValorizacao {
  /** pontos na rodada */
  pontos: number;
  /** preço antes da rodada */
  preco: number;
  /** preço médio do atleta no ano */
  precoMedio: number;
  /** média e jogos ANTES da rodada */
  media: number;
  jogos: number;
}

/** fator de inflação medido no Cartola 2025 (rodada 4: 0,1239); o valor exato varia pouco por rodada */
export const FATOR_PADRAO = 0.124;
export const PRECO_MINIMO = 0.7;

/** Pesos da média (ka) e do preço médio (kc) para quem chega a g jogos com esta rodada. */
export function pesos(g: number) {
  return g > 5 ? { ka: 4, kc: 5 } : { ka: (3 + g) / 2, kc: (15 - g) / 2 };
}

export function precoNovo(a: EntradaValorizacao, s: number, minimo = PRECO_MINIMO) {
  const g = a.jogos + 1;
  const media = (a.media * a.jogos + a.pontos) / g;
  const { ka, kc } = pesos(g);
  return Math.max(minimo, s * (a.pontos + ka * media + kc * a.precoMedio));
}

export const valorizacao = (a: EntradaValorizacao, s: number, minimo = PRECO_MINIMO) => precoNovo(a, s, minimo) - a.preco;

/** Pontos que deixam o preço igual (valorização zero). */
export function minimoParaValorizar(a: Omit<EntradaValorizacao, "pontos">, s: number) {
  const g = a.jogos + 1;
  const { ka, kc } = pesos(g);
  return (a.preco / s - (ka * a.media * a.jogos) / g - kc * a.precoMedio) / (1 + ka / g);
}

/** Quanto o preço muda por ponto feito (inclinação da reta). */
export function cartoletaPorPonto(jogos: number, s: number) {
  const g = jogos + 1;
  return s * (1 + pesos(g).ka / g);
}

/**
 * Fator de inflação da rodada: o que mantém o preço médio de quem jogou, descontando
 * o efeito de quem bateu no preço mínimo.
 */
export function fatorInflacao(atletas: EntradaValorizacao[]) {
  if (!atletas.length) return FATOR_PADRAO;
  const n = atletas.length;
  let precoMedioMercado = 0;
  let semFator = 0;
  for (const a of atletas) {
    precoMedioMercado += a.preco;
    semFator += valorizacao(a, 1, 0);
  }
  precoMedioMercado /= n;
  const base = semFator / n + precoMedioMercado;
  const s0 = precoMedioMercado / base;
  const sobra = atletas.reduce((t, a) => t + valorizacao(a, s0), 0) / n;
  return (precoMedioMercado - sobra) / base;
}

/**
 * Preço médio recuperado da variação real da última rodada: a fórmula ao contrário.
 * `depois` = média e jogos já com a rodada; null quando o preço bateu no mínimo.
 */
export function precoMedioReverso(d: { precoAtual: number; pontos: number; mediaDepois: number; jogosDepois: number }, s: number): number | null {
  if (d.precoAtual <= PRECO_MINIMO + 1e-6 || d.jogosDepois < 1) return null;
  const { ka, kc } = pesos(d.jogosDepois);
  if (kc <= 0) return null;
  return (d.precoAtual / s - d.pontos - ka * d.mediaDepois) / kc;
}

export interface FormulaAtleta {
  /** mínimo para valorizar na próxima rodada */
  mpv: number;
  /** C$ por ponto acima (ou abaixo) do mínimo */
  porPonto: number;
  /** preço médio do ano recuperado da última variação */
  precoMedio: number;
}

/**
 * Prepara a fórmula para a próxima rodada de cada atleta que jogou a rodada passada:
 * o preço médio sai da variação real dessa rodada (fórmula ao contrário) e vale como
 * aproximação para a próxima (ele muda devagar ao longo do ano).
 */
export function formulaDaRodada(
  athletes: Array<{ id: number; preco: number; variacao: number; media: number; jogos: number }>,
  pontosRodadaPassada: Map<number, number>,
  s = FATOR_PADRAO,
): Map<number, FormulaAtleta> {
  const out = new Map<number, FormulaAtleta>();
  for (const a of athletes) {
    const pontos = pontosRodadaPassada.get(a.id);
    if (pontos == null || a.jogos < 1 || !Number.isFinite(a.variacao)) continue;
    const precoMedio = precoMedioReverso({ precoAtual: a.preco, pontos, mediaDepois: a.media, jogosDepois: a.jogos }, s);
    if (precoMedio == null || !(precoMedio > 0)) continue;
    const mpv = minimoParaValorizar({ preco: a.preco, precoMedio, media: a.media, jogos: a.jogos }, s);
    if (!Number.isFinite(mpv)) continue;
    out.set(a.id, { mpv, porPonto: cartoletaPorPonto(a.jogos, s), precoMedio });
  }
  return out;
}
