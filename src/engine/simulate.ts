/**
 * Simulação de Monte Carlo da rodada.
 *
 * 1. Para cada jogo, sorteia o placar da matriz Dixon-Coles.
 * 2. Gols do time são distribuídos entre os atletas pela participação de cada
 *    um (thinning binomial) → G, A, SG e GS ficam CORRELACIONADOS com o placar.
 * 3. Demais scouts: binomial negativa (Poisson com sobredispersão estimada).
 * 4. Técnico = média dos atletas do clube que entraram + bônus de vitória.
 *
 * Resultado: a distribuição completa de pontos de cada atleta (dado que joga),
 * de onde saem piso, teto e probabilidades. O mesmo motor simula uma tropa
 * inteira (com banco e reserva de luxo) respeitando as correlações.
 */
import { Rng, quantileSorted } from "./math";
import { CAPTAIN_MULTIPLIER, SCORING, SG_POSITIONS, type PositionId, type ScoutKey } from "./rules";
import { scoreMatrix } from "./teamModel";
import type { MatchSimParams, PlayerModelParams } from "./types";

const MAX_COUNT = 14;

/** CDF da binomial negativa (ou Poisson) truncada em MAX_COUNT. */
function countCdf(mean: number, k: number | undefined): Float64Array {
  const cdf = new Float64Array(MAX_COUNT + 1);
  if (mean <= 0) {
    cdf.fill(1);
    return cdf;
  }
  let acc = 0;
  if (k === undefined || !Number.isFinite(k)) {
    let p = Math.exp(-mean);
    for (let n = 0; n <= MAX_COUNT; n++) {
      if (n > 0) p *= mean / n;
      acc += p;
      cdf[n] = acc;
    }
  } else {
    // NB(r=k, p=k/(k+mean))
    const pr = k / (k + mean);
    let p = Math.pow(pr, k);
    for (let n = 0; n <= MAX_COUNT; n++) {
      if (n > 0) p *= ((n - 1 + k) / n) * (1 - pr);
      acc += p;
      cdf[n] = acc;
    }
  }
  for (let n = 0; n <= MAX_COUNT; n++) cdf[n] /= acc;
  return cdf;
}

function sampleCount(cdf: Float64Array, rng: Rng): number {
  const u = rng.next();
  let n = 0;
  while (n < MAX_COUNT && u > cdf[n]) n++;
  return n;
}

function binomial(n: number, p: number, rng: Rng): number {
  if (p <= 0 || n <= 0) return 0;
  let k = 0;
  for (let i = 0; i < n; i++) if (rng.next() < p) k++;
  return k;
}

interface MatchState {
  params: MatchSimParams;
  cdf: Float64Array;
  total: number;
}

function prepareMatches(matches: MatchSimParams[]): Map<number, MatchState> {
  const out = new Map<number, MatchState>();
  for (const m of matches) {
    const sm = scoreMatrix(m.lambdaCasa, m.lambdaFora, m.rho);
    const flat = new Float64Array(sm.length * sm.length);
    let acc = 0;
    let i = 0;
    for (let x = 0; x < sm.length; x++) {
      for (let y = 0; y < sm.length; y++) {
        acc += sm[x][y];
        flat[i++] = acc;
      }
    }
    out.set(m.matchId, { params: m, cdf: flat, total: acc });
  }
  return out;
}

const GRID = 11; // MAX_GOALS + 1

interface PreparedPlayer {
  p: PlayerModelParams;
  keys: ScoutKey[];
  cdfs: Float64Array[];
  weights: number[];
  sg: boolean;
}

function preparePlayer(p: PlayerModelParams): PreparedPlayer {
  const keys: ScoutKey[] = [];
  const cdfs: Float64Array[] = [];
  const weights: number[] = [];
  for (const k in p.rates) {
    const key = k as ScoutKey;
    const m = p.rates[key] ?? 0;
    if (m <= 1e-4) continue;
    keys.push(key);
    cdfs.push(countCdf(m, p.dispersion[key]));
    weights.push(SCORING[key]);
  }
  return { p, keys, cdfs, weights, sg: SG_POSITIONS.includes(p.posicaoId) };
}

export interface PlayerDistribution {
  /** Amostras ordenadas (dado que joga). */
  sorted: Float32Array;
  mean: number;
  sd: number;
}

/** Simula a rodada inteira e devolve a distribuição condicional de cada atleta. */
export function simulateRound(
  players: PlayerModelParams[],
  matches: MatchSimParams[],
  nSims: number,
  seed: number,
): Map<number, PlayerDistribution> {
  const rng = new Rng(seed);
  const ms = prepareMatches(matches);
  const field = players.filter((p) => p.matchId != null && ms.has(p.matchId) && p.posicaoId !== 6).map(preparePlayer);
  const tecs = players.filter((p) => p.matchId != null && ms.has(p.matchId) && p.posicaoId === 6);
  const nF = field.length;
  const samples = new Float32Array((nF + tecs.length) * nSims);
  const goals = new Map<number, number>();
  const conceded = new Map<number, number>();
  const won = new Map<number, boolean>();
  const clubSum = new Map<number, number>();
  const clubCnt = new Map<number, number>();

  for (let s = 0; s < nSims; s++) {
    for (const st of ms.values()) {
      const idx = rng.pickCdf(st.cdf, st.total);
      const gc = Math.floor(idx / GRID);
      const gf = idx % GRID;
      const { casaId, foraId } = st.params;
      goals.set(casaId, gc);
      goals.set(foraId, gf);
      conceded.set(casaId, gf);
      conceded.set(foraId, gc);
      won.set(casaId, gc > gf);
      won.set(foraId, gf > gc);
      clubSum.set(casaId, 0);
      clubSum.set(foraId, 0);
      clubCnt.set(casaId, 0);
      clubCnt.set(foraId, 0);
    }
    for (let i = 0; i < nF; i++) {
      const pp = field[i];
      const p = pp.p;
      const T = goals.get(p.clubeId) ?? 0;
      const O = conceded.get(p.clubeId) ?? 0;
      let pts = 0;
      const g = binomial(T, p.goalShare, rng);
      const aShare = p.goalShare < 0.99 ? Math.min(0.95, p.assistShare / (1 - p.goalShare)) : 0;
      const a = binomial(T - g, aShare, rng);
      pts += g * SCORING.G + a * SCORING.A;
      for (let j = 0; j < pp.keys.length; j++) pts += sampleCount(pp.cdfs[j], rng) * pp.weights[j];
      if (pp.sg && O === 0) pts += SCORING.SG;
      if (p.posicaoId === 1) pts += O * SCORING.GS;
      samples[i * nSims + s] = pts;
      if (rng.next() < p.pJogar) {
        clubSum.set(p.clubeId, (clubSum.get(p.clubeId) ?? 0) + pts);
        clubCnt.set(p.clubeId, (clubCnt.get(p.clubeId) ?? 0) + 1);
      }
    }
    for (let t = 0; t < tecs.length; t++) {
      const c = tecs[t].clubeId;
      const n = clubCnt.get(c) ?? 0;
      const base = n > 0 ? (clubSum.get(c) ?? 0) / n : 0;
      samples[(nF + t) * nSims + s] = base + (won.get(c) ? SCORING.V : 0);
    }
  }

  const out = new Map<number, PlayerDistribution>();
  const all = [...field.map((f) => f.p), ...tecs];
  for (let i = 0; i < all.length; i++) {
    const arr = samples.slice(i * nSims, (i + 1) * nSims).sort();
    let m = 0;
    for (let j = 0; j < arr.length; j++) m += arr[j];
    m /= arr.length;
    let v = 0;
    for (let j = 0; j < arr.length; j++) v += (arr[j] - m) ** 2;
    out.set(all[i].atletaId, { sorted: arr, mean: m, sd: Math.sqrt(v / Math.max(1, arr.length - 1)) });
  }
  return out;
}

/** P(X ≥ x) a partir de amostras ordenadas. */
export function probAtLeast(sorted: Float32Array, x: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < x - 1e-9) lo = mid + 1;
    else hi = mid;
  }
  return (sorted.length - lo) / sorted.length;
}

export function quantile(sorted: Float32Array, q: number): number {
  return quantileSorted(sorted, q);
}

/* ------------------------------------------------------------------ */
/* Simulação de uma tropa (titulares + banco + capitão)                 */
/* ------------------------------------------------------------------ */

export interface LineupSimInput {
  titulares: number[];
  captainId: number | null;
  reservas: Array<{ atletaId: number; posicaoId: PositionId }>;
  luxoId?: number | null;
}

export interface LineupSimResult {
  mean: number;
  meanSemBanco: number;
  p10: number;
  p50: number;
  p90: number;
  pAcima: Record<string, number>;
  ganhoBanco: number;
  ganhoLuxo: number;
  /** Probabilidade de cada titular não entrar e ser coberto. */
  coberturas: Record<number, number>;
}

export function simulateLineup(
  params: { players: PlayerModelParams[]; matches: MatchSimParams[] },
  input: LineupSimInput,
  nSims = 3000,
  seed = 7,
  thresholds = [40, 50, 60, 70, 80, 90, 100],
): LineupSimResult {
  const rng = new Rng(seed);
  const byId = new Map(params.players.map((p) => [p.atletaId, p] as const));
  const involvedIds = [...new Set([...input.titulares, ...input.reservas.map((r) => r.atletaId)])];
  const involved = involvedIds.map((id) => byId.get(id)).filter((p): p is PlayerModelParams => !!p);
  const matchIds = new Set(involved.map((p) => p.matchId).filter((m): m is number => m != null));
  const ms = prepareMatches(params.matches.filter((m) => matchIds.has(m.matchId)));
  const prepared = new Map(involved.map((p) => [p.atletaId, preparePlayer(p)] as const));

  const byClub = new Map<number, PlayerModelParams[]>();
  for (const p of involved) {
    if (p.posicaoId === 6) continue;
    if (!byClub.has(p.clubeId)) byClub.set(p.clubeId, []);
    byClub.get(p.clubeId)!.push(p);
  }

  const titularesByPos = new Map<PositionId, number[]>();
  for (const id of input.titulares) {
    const p = byId.get(id);
    if (!p) continue;
    if (!titularesByPos.has(p.posicaoId)) titularesByPos.set(p.posicaoId, []);
    titularesByPos.get(p.posicaoId)!.push(id);
  }

  const totals = new Float64Array(nSims);
  let sumNoBench = 0;
  let sumNoLuxo = 0;
  const cover: Record<number, number> = {};
  const goals = new Map<number, number>();
  const conceded = new Map<number, number>();
  const won = new Map<number, boolean>();
  const pts = new Map<number, number>();
  const appear = new Map<number, boolean>();

  for (let s = 0; s < nSims; s++) {
    for (const st of ms.values()) {
      const idx = rng.pickCdf(st.cdf, st.total);
      const gc = Math.floor(idx / GRID);
      const gf = idx % GRID;
      goals.set(st.params.casaId, gc);
      goals.set(st.params.foraId, gf);
      conceded.set(st.params.casaId, gf);
      conceded.set(st.params.foraId, gc);
      won.set(st.params.casaId, gc > gf);
      won.set(st.params.foraId, gf > gc);
    }
    for (const p of involved) {
      appear.set(p.atletaId, p.matchId != null && ms.has(p.matchId) && rng.next() < p.pJogar);
      pts.set(p.atletaId, 0);
    }
    // gols e assistências: multinomial entre os atletas envolvidos que jogam (mutuamente exclusivos)
    for (const [club, list] of byClub) {
      const T = goals.get(club) ?? 0;
      if (!T) continue;
      const on = list.filter((p) => appear.get(p.atletaId));
      if (!on.length) continue;
      for (let g = 0; g < T; g++) {
        let u = rng.next();
        let scorer: PlayerModelParams | null = null;
        for (const p of on) {
          if (u < p.goalShare) {
            scorer = p;
            break;
          }
          u -= p.goalShare;
        }
        if (scorer) pts.set(scorer.atletaId, pts.get(scorer.atletaId)! + SCORING.G);
        let v = rng.next();
        for (const p of on) {
          if (p === scorer) continue;
          if (v < p.assistShare) {
            pts.set(p.atletaId, pts.get(p.atletaId)! + SCORING.A);
            break;
          }
          v -= p.assistShare;
        }
      }
    }
    for (const p of involved) {
      if (!appear.get(p.atletaId)) continue;
      if (p.posicaoId === 6) {
        const base = (p.tecBase ?? 3) + (p.tecSd ?? 1.2) * rng.normal() * 0.8;
        pts.set(p.atletaId, base + (won.get(p.clubeId) ? SCORING.V : 0));
        continue;
      }
      const pp = prepared.get(p.atletaId)!;
      let x = pts.get(p.atletaId)!;
      for (let j = 0; j < pp.keys.length; j++) x += sampleCount(pp.cdfs[j], rng) * pp.weights[j];
      const O = conceded.get(p.clubeId) ?? 0;
      if (pp.sg && O === 0) x += SCORING.SG;
      if (p.posicaoId === 1) x += O * SCORING.GS;
      pts.set(p.atletaId, x);
    }

    // titulares + capitão
    let semBanco = 0;
    const efetivo = new Map<number, number>(); // atletaId titular → pontos efetivos
    for (const id of input.titulares) {
      const v = appear.get(id) ? pts.get(id) ?? 0 : 0;
      efetivo.set(id, v);
      semBanco += v * (id === input.captainId && appear.get(id) ? CAPTAIN_MULTIPLIER : 1);
    }
    sumNoBench += semBanco;

    // banco: reserva entra no lugar do primeiro titular da posição que não jogou
    let total = semBanco;
    let luxoGain = 0;
    for (const r of input.reservas) {
      const tit = titularesByPos.get(r.posicaoId) ?? [];
      if (!appear.get(r.atletaId)) continue;
      const rp = pts.get(r.atletaId) ?? 0;
      const ausente = tit.find((id) => !appear.get(id));
      if (ausente != null) {
        total += rp;
        cover[ausente] = (cover[ausente] ?? 0) + 1;
        continue;
      }
      if (input.luxoId === r.atletaId && tit.length) {
        // reserva de luxo: substitui o titular de menor pontuação se fizer mais
        let worst: number | null = null;
        for (const id of tit) {
          if (id === input.captainId) continue;
          if (worst == null || (efetivo.get(id) ?? 0) < (efetivo.get(worst) ?? 0)) worst = id;
        }
        if (worst != null && rp > (efetivo.get(worst) ?? 0)) {
          luxoGain = rp - (efetivo.get(worst) ?? 0);
          total += luxoGain;
        }
      }
    }
    sumNoLuxo += total - luxoGain;
    totals[s] = total;
  }

  const sorted = Float32Array.from(totals).sort();
  const mean = totals.reduce((a, b) => a + b, 0) / nSims;
  const pAcima: Record<string, number> = {};
  for (const t of thresholds) pAcima[String(t)] = probAtLeast(sorted, t);
  for (const k in cover) cover[k] /= nSims;
  return {
    mean,
    meanSemBanco: sumNoBench / nSims,
    p10: quantileSorted(sorted, 0.1),
    p50: quantileSorted(sorted, 0.5),
    p90: quantileSorted(sorted, 0.9),
    pAcima,
    ganhoBanco: sumNoLuxo / nSims - sumNoBench / nSims,
    ganhoLuxo: mean - sumNoLuxo / nSims,
    coberturas: cover,
  };
}
