/**
 * Distribuições usadas no Cruzamento de Scout (contagens por jogo).
 *
 * Tudo aqui é matemática padrão, sem dependências: log-gama (Lanczos), Poisson,
 * binomial negativa (mistura Poisson-Gama), gama incompleta regularizada e seus
 * quantis. Os testes conferem com valores tabelados.
 */

const LANCZOS = [676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];

/** ln Γ(x) para x > 0. */
export function lnGamma(x: number): number {
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x);
  const z = x - 1;
  let a = 0.99999999999980993;
  const t = z + 7.5;
  for (let i = 0; i < 8; i++) a += LANCZOS[i] / (z + i + 1);
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}

/** P(X = k) com X ~ Poisson(λ). */
export function poisson(k: number, lambda: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  return Math.exp(k * Math.log(lambda) - lambda - lnGamma(k + 1));
}

/**
 * P(X = k) com X ~ binomial negativa de média `mu` e tamanho `size` (Var = μ + μ²/size).
 * `size` infinito (ou ausente) vira Poisson.
 */
export function negBin(k: number, mu: number, size?: number): number {
  if (!size || !Number.isFinite(size) || size > 1e6) return poisson(k, mu);
  if (mu <= 0) return k === 0 ? 1 : 0;
  const p = size / (size + mu);
  return Math.exp(lnGamma(k + size) - lnGamma(size) - lnGamma(k + 1) + size * Math.log(p) + k * Math.log(1 - p));
}

/** P(X ≥ k) para a binomial negativa (ou Poisson, sem `size`). */
export function probAtLeast(k: number, mu: number, size?: number): number {
  if (k <= 0) return 1;
  let acc = 0;
  for (let i = 0; i < k; i++) acc += negBin(i, mu, size);
  return Math.min(1, Math.max(0, 1 - acc));
}

/** Gama incompleta inferior regularizada P(a, x) (série ou fração contínua). */
export function gammaP(a: number, x: number): number {
  if (x <= 0) return 0;
  if (x < a + 1) {
    let sum = 1 / a;
    let term = sum;
    for (let n = 1; n < 500; n++) {
      term *= x / (a + n);
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * 1e-14) break;
    }
    return Math.min(1, sum * Math.exp(-x + a * Math.log(x) - lnGamma(a)));
  }
  // fração contínua de Lentz para Q(a, x)
  let b = x + 1 - a;
  let c = 1 / 1e-300;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c;
    if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-14) break;
  }
  return Math.max(0, 1 - Math.exp(-x + a * Math.log(x) - lnGamma(a)) * h);
}

/** Quantil q da Gama(forma, taxa) (bissecção sobre P(a, x)). */
export function gammaQuantile(q: number, shape: number, rate: number): number {
  if (q <= 0) return 0;
  const mean = shape / rate;
  let lo = 0;
  let hi = Math.max(1, mean * 4 + 10 / rate);
  while (gammaP(shape, hi * rate) < q) hi *= 2;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (gammaP(shape, mid * rate) < q) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export function media(xs: number[]): number {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
}

export function mediana(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Desvio-padrão amostral (n − 1). */
export function desvio(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = media(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}

/** Quantil (interpolação linear) de valores já ordenados. */
export function quantil(sorted: ArrayLike<number>, q: number): number {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const i = Math.floor(pos);
  const f = pos - i;
  return i + 1 < sorted.length ? sorted[i] * (1 - f) + sorted[i + 1] * f : sorted[i];
}

/** Sorteio de uma contagem pela binomial negativa (ou Poisson) com um gerador uniforme. */
export function sortearNegBin(mu: number, size: number | undefined, u: () => number): number {
  if (mu <= 0) return 0;
  let lambda = mu;
  if (size && Number.isFinite(size) && size < 1e6) lambda = sortearGama(size, size / mu, u);
  // Poisson por inversão (λ pequeno no futebol)
  const L = Math.exp(-lambda);
  let k = 0;
  let p = u();
  while (p > L && k < 60) {
    p *= u();
    k++;
  }
  return k;
}

/** Gama(forma, taxa) por Marsaglia-Tsang. */
export function sortearGama(shape: number, rate: number, u: () => number): number {
  if (shape < 1) return sortearGama(shape + 1, rate, u) * Math.pow(u(), 1 / shape);
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number;
    let v: number;
    do {
      // normal padrão por Box-Muller
      x = Math.sqrt(-2 * Math.log(u() || 1e-12)) * Math.cos(2 * Math.PI * u());
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const uu = u();
    if (uu < 1 - 0.0331 * x ** 4 || Math.log(uu) < 0.5 * x * x + d * (1 - v + Math.log(v))) return (d * v) / rate;
  }
}
