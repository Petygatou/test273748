/** Utilidades numéricas do motor (sem dependências externas). */

/** Gerador pseudoaleatório determinístico (xoshiro128**). */
export class Rng {
  private s0: number;
  private s1: number;
  private s2: number;
  private s3: number;
  private spare: number | null = null;

  constructor(seed: number) {
    // splitmix32 para espalhar a semente
    let x = seed >>> 0;
    const next = () => {
      x = (x + 0x9e3779b9) >>> 0;
      let z = x;
      z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
      z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
      return (z ^ (z >>> 16)) >>> 0;
    };
    this.s0 = next();
    this.s1 = next();
    this.s2 = next();
    this.s3 = next();
  }

  /** Uniforme em [0, 1). */
  next(): number {
    const result = Math.imul(rotl(Math.imul(this.s1, 5), 7), 9) >>> 0;
    const t = (this.s1 << 9) >>> 0;
    this.s2 ^= this.s0;
    this.s3 ^= this.s1;
    this.s1 ^= this.s2;
    this.s0 ^= this.s3;
    this.s2 ^= t;
    this.s3 = rotl(this.s3, 11);
    return result / 4294967296;
  }

  normal(): number {
    if (this.spare !== null) {
      const v = this.spare;
      this.spare = null;
      return v;
    }
    let u = 0;
    let v = 0;
    let s = 0;
    do {
      u = this.next() * 2 - 1;
      v = this.next() * 2 - 1;
      s = u * u + v * v;
    } while (s >= 1 || s === 0);
    const m = Math.sqrt((-2 * Math.log(s)) / s);
    this.spare = v * m;
    return u * m;
  }

  /** Gamma(shape, 1) — Marsaglia & Tsang. */
  gamma(shape: number): number {
    if (shape < 1) {
      const u = this.next();
      return this.gamma(1 + shape) * Math.pow(u, 1 / shape);
    }
    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);
    for (;;) {
      let x: number;
      let v: number;
      do {
        x = this.normal();
        v = 1 + c * x;
      } while (v <= 0);
      v = v * v * v;
      const u = this.next();
      if (u < 1 - 0.0331 * x * x * x * x) return d * v;
      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
    }
  }

  poisson(lambda: number): number {
    if (lambda <= 0) return 0;
    if (lambda < 30) {
      const L = Math.exp(-lambda);
      let k = 0;
      let p = 1;
      do {
        k++;
        p *= this.next();
      } while (p > L);
      return k - 1;
    }
    // aproximação normal com correção de continuidade (raro no Cartola)
    return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * this.normal()));
  }

  /**
   * Binomial negativa parametrizada pela média e pela dispersão k
   * (variância = μ + μ²/k). k = Infinity vira Poisson.
   */
  negBin(mean: number, k: number): number {
    if (mean <= 0) return 0;
    if (!Number.isFinite(k) || k > 1e4) return this.poisson(mean);
    const lambda = (this.gamma(k) * mean) / k;
    return this.poisson(lambda);
  }

  bernoulli(p: number): boolean {
    return this.next() < p;
  }

  /** Índice sorteado proporcional aos pesos (cdf pré-computada). */
  pickCdf(cdf: Float64Array | number[], total: number): number {
    const u = this.next() * total;
    let lo = 0;
    let hi = cdf.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cdf[mid] > u) hi = mid;
      else lo = mid + 1;
    }
    return lo;
  }
}

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

export function round(x: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
}

export function sum(xs: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < xs.length; i++) s += xs[i];
  return s;
}

export function mean(xs: ArrayLike<number>): number {
  return xs.length ? sum(xs) / xs.length : 0;
}

export function variance(xs: ArrayLike<number>): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  let s = 0;
  for (let i = 0; i < xs.length; i++) s += (xs[i] - m) ** 2;
  return s / (xs.length - 1);
}

export function weightedMean(values: number[], weights: number[]): number {
  let s = 0;
  let w = 0;
  for (let i = 0; i < values.length; i++) {
    s += values[i] * weights[i];
    w += weights[i];
  }
  return w > 0 ? s / w : 0;
}

/** Quantil de um array já ordenado (interpolação linear). */
export function quantileSorted(sorted: ArrayLike<number>, q: number): number {
  const n = sorted.length;
  if (n === 0) return 0;
  const pos = (n - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function poissonPmf(k: number, lambda: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let logp = -lambda + k * Math.log(lambda);
  for (let i = 2; i <= k; i++) logp -= Math.log(i);
  return Math.exp(logp);
}

/** Correlação de postos de Spearman. */
export function spearman(a: number[], b: number[]): number {
  if (a.length < 3) return 0;
  const ra = ranks(a);
  const rb = ranks(b);
  return pearson(ra, rb);
}

export function pearson(a: number[], b: number[]): number {
  const n = a.length;
  if (n < 3) return 0;
  const ma = mean(a);
  const mb = mean(b);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return da > 0 && db > 0 ? num / Math.sqrt(da * db) : 0;
}

function ranks(xs: number[]): number[] {
  const idx = xs.map((v, i) => [v, i] as const).sort((x, y) => x[0] - y[0]);
  const r = new Array<number>(xs.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
    i = j + 1;
  }
  return r;
}

/**
 * Mínimos quadrados ponderados com regularização ridge.
 * X: linhas de features (sem intercepto — inclua uma coluna 1 se quiser).
 */
export function ridgeRegression(X: number[][], y: number[], lambda = 0, w?: number[], penalize?: boolean[]): number[] {
  const p = X[0]?.length ?? 0;
  const A: number[][] = Array.from({ length: p }, () => new Array<number>(p).fill(0));
  const b = new Array<number>(p).fill(0);
  for (let i = 0; i < X.length; i++) {
    const wi = w ? w[i] : 1;
    const xi = X[i];
    for (let r = 0; r < p; r++) {
      b[r] += wi * xi[r] * y[i];
      for (let c = r; c < p; c++) A[r][c] += wi * xi[r] * xi[c];
    }
  }
  for (let r = 0; r < p; r++) {
    for (let c = 0; c < r; c++) A[r][c] = A[c][r];
    if (!penalize || penalize[r]) A[r][r] += lambda;
  }
  return solveLinear(A, b);
}

/** Eliminação gaussiana com pivoteamento parcial. */
export function solveLinear(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < 1e-12) continue;
    [M[col], M[piv]] = [M[piv], M[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / M[col][col];
      if (f === 0) continue;
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((row, i) => (Math.abs(row[i]) < 1e-12 ? 0 : row[n] / row[i]));
}

/** Peso de decaimento exponencial por idade (em rodadas). */
export function decayWeight(age: number, halfLife: number): number {
  if (!Number.isFinite(halfLife) || halfLife <= 0) return 1;
  return Math.pow(0.5, age / halfLife);
}
