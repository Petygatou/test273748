/**
 * Modelo de força dos times.
 *
 * Gols: regressão de Poisson bidirecional (ataque × defesa + mando) com
 * decaimento temporal e prior ridge — essencialmente Dixon & Coles (1997).
 * O alvo mistura gols reais com um "xG por finalizações" derivado dos scouts
 * (FD, FT, FF e G), que é bem menos ruidoso que o placar.
 *
 * O mesmo ajustador é reaproveitado para volumes de scouts por time
 * (desarmes, finalizações, faltas, defesas do goleiro...), o que permite
 * medir quanto cada adversário "cede" de cada scout.
 */
import { decayWeight, poissonPmf } from "./math";
import type { ScoutKey } from "./rules";
import type { FixtureOdds, Match, ModelConfig, PlayerRound, TeamStrength } from "./types";

export interface TeamObs {
  team: number;
  opp: number;
  home: boolean;
  y: number;
  w: number;
}

export interface PoissonTeamFit {
  mu: number;
  home: number;
  /** Efeito do próprio time (ataque, no caso de gols). */
  own: Record<number, number>;
  /** Efeito do adversário (fragilidade defensiva, no caso de gols). */
  opp: Record<number, number>;
  games: Record<number, number>;
}

/**
 * Ajusta log E[y] = mu + home·H + own[team] + opp[opp] por máxima
 * verossimilhança penalizada (Newton coordenado). `priorSd` controla o
 * shrinkage dos efeitos em direção à média da liga.
 */
export function fitPoissonTeamModel(obs: TeamObs[], teams: number[], priorSd = 0.3, iterations = 60): PoissonTeamFit {
  const own: Record<number, number> = {};
  const opp: Record<number, number> = {};
  const games: Record<number, number> = {};
  for (const t of teams) {
    own[t] = 0;
    opp[t] = 0;
    games[t] = 0;
  }
  for (const o of obs) games[o.team] = (games[o.team] ?? 0) + 1;

  let sw = 0;
  let sy = 0;
  for (const o of obs) {
    sw += o.w;
    sy += o.w * o.y;
  }
  let mu = Math.log(Math.max(sy / Math.max(sw, 1e-9), 1e-3));
  let home = 0;
  const pen = 1 / (priorSd * priorSd);
  if (obs.length === 0) return { mu, home, own, opp, games };

  const byOwn = new Map<number, TeamObs[]>();
  const byOpp = new Map<number, TeamObs[]>();
  for (const o of obs) {
    if (!byOwn.has(o.team)) byOwn.set(o.team, []);
    if (!byOpp.has(o.opp)) byOpp.set(o.opp, []);
    byOwn.get(o.team)!.push(o);
    byOpp.get(o.opp)!.push(o);
  }
  const lam = (o: TeamObs) => Math.exp(mu + (o.home ? home : 0) + (own[o.team] ?? 0) + (opp[o.opp] ?? 0));

  for (let it = 0; it < iterations; it++) {
    // intercepto
    {
      let g = 0;
      let h = 0;
      for (const o of obs) {
        const l = lam(o);
        g += o.w * (o.y - l);
        h += o.w * l;
      }
      if (h > 0) mu += g / h;
    }
    // mando (prior fraco)
    {
      let g = -home * 4;
      let h = 4;
      for (const o of obs) {
        if (!o.home) continue;
        const l = lam(o);
        g += o.w * (o.y - l);
        h += o.w * l;
      }
      home += g / h;
    }
    for (const t of teams) {
      const list = byOwn.get(t) ?? [];
      let g = -own[t] * pen;
      let h = pen;
      for (const o of list) {
        const l = lam(o);
        g += o.w * (o.y - l);
        h += o.w * l;
      }
      own[t] += g / h;
    }
    for (const t of teams) {
      const list = byOpp.get(t) ?? [];
      let g = -opp[t] * pen;
      let h = pen;
      for (const o of list) {
        const l = lam(o);
        g += o.w * (o.y - l);
        h += o.w * l;
      }
      opp[t] += g / h;
    }
    // identificabilidade: centraliza efeitos
    const mo = teams.reduce((s, t) => s + own[t], 0) / teams.length;
    const mp = teams.reduce((s, t) => s + opp[t], 0) / teams.length;
    for (const t of teams) {
      own[t] -= mo;
      opp[t] -= mp;
    }
    mu += mo + mp;
  }
  return { mu, home, own, opp, games };
}

/** Agrega scouts dos atletas por (rodada, clube). */
export function aggregateTeamScouts(history: PlayerRound[]): Map<string, Partial<Record<ScoutKey, number>>> {
  const map = new Map<string, Partial<Record<ScoutKey, number>>>();
  for (const pr of history) {
    if (pr.posicaoId === 6) continue;
    const key = `${pr.rodada}:${pr.clubeId}`;
    let agg = map.get(key);
    if (!agg) {
      agg = {};
      map.set(key, agg);
    }
    for (const k in pr.scout) {
      const sk = k as ScoutKey;
      agg[sk] = (agg[sk] ?? 0) + (pr.scout[sk] ?? 0);
    }
  }
  return map;
}

export function playedMatches(matches: Match[], beforeRound: number): Match[] {
  return matches.filter(
    (m) => m.rodada < beforeRound && m.valida && m.golsCasa != null && m.golsFora != null,
  );
}

/** xG por finalizações: chutes no alvo pesam mais que bolas na trave e para fora. */
function shotsProxy(s: Partial<Record<ScoutKey, number>> | undefined): number | null {
  if (!s) return null;
  return (s.FD ?? 0) + (s.G ?? 0) + 0.5 * (s.FT ?? 0) + 0.22 * (s.FF ?? 0);
}

export interface GoalsModel extends PoissonTeamFit {
  rho: number;
  teamsList: TeamStrength[];
  /** Assistências por gol na liga. */
  assistPerGoal: number;
}

export function fitGoalsModel(
  matches: Match[],
  history: PlayerRound[],
  teams: number[],
  currentRound: number,
  config: Pick<ModelConfig, "teamHalfLife" | "xgBlend">,
): GoalsModel {
  const played = playedMatches(matches, currentRound);
  const agg = aggregateTeamScouts(history);

  // calibra a escala do proxy de finalizações para a média de gols da liga
  let goals = 0;
  let proxy = 0;
  let assists = 0;
  for (const m of played) {
    const sc = agg.get(`${m.rodada}:${m.casaId}`);
    const sf = agg.get(`${m.rodada}:${m.foraId}`);
    const pc = shotsProxy(sc);
    const pf = shotsProxy(sf);
    if (pc != null && pf != null) {
      goals += (m.golsCasa ?? 0) + (m.golsFora ?? 0);
      proxy += pc + pf;
      assists += (sc?.A ?? 0) + (sf?.A ?? 0);
    }
  }
  const scale = proxy > 0 ? goals / proxy : 0;
  const assistPerGoal = goals > 0 ? Math.min(0.95, Math.max(0.4, assists / goals)) : 0.68;

  const obs: TeamObs[] = [];
  for (const m of played) {
    const w = decayWeight(currentRound - 1 - m.rodada, config.teamHalfLife);
    const pc = shotsProxy(agg.get(`${m.rodada}:${m.casaId}`));
    const pf = shotsProxy(agg.get(`${m.rodada}:${m.foraId}`));
    const blend = scale > 0 && pc != null && pf != null ? config.xgBlend : 0;
    const yc = (1 - blend) * (m.golsCasa ?? 0) + blend * (pc ?? 0) * scale;
    const yf = (1 - blend) * (m.golsFora ?? 0) + blend * (pf ?? 0) * scale;
    obs.push({ team: m.casaId, opp: m.foraId, home: true, y: yc, w });
    obs.push({ team: m.foraId, opp: m.casaId, home: false, y: yf, w });
  }
  const fit = fitPoissonTeamModel(obs, teams, 0.28);
  const rho = fitRho(played, fit);

  const teamsList: TeamStrength[] = teams.map((t) => ({
    clubeId: t,
    attack: fit.own[t],
    defense: fit.opp[t],
    xgFor: Math.exp(fit.mu + fit.home / 2 + fit.own[t]),
    xgAgainst: Math.exp(fit.mu + fit.home / 2 + fit.opp[t]),
    games: fit.games[t] ?? 0,
  }));
  return { ...fit, rho, teamsList, assistPerGoal };
}

function dcTau(x: number, y: number, l1: number, l2: number, rho: number): number {
  if (x === 0 && y === 0) return 1 - l1 * l2 * rho;
  if (x === 0 && y === 1) return 1 + l1 * rho;
  if (x === 1 && y === 0) return 1 + l2 * rho;
  if (x === 1 && y === 1) return 1 - rho;
  return 1;
}

/** Estima o ρ de Dixon-Coles (dependência em placares baixos) por busca em grade. */
function fitRho(played: Match[], fit: PoissonTeamFit): number {
  if (played.length < 30) return -0.06;
  let best = -0.06;
  let bestLL = -Infinity;
  for (let rho = -0.2; rho <= 0.1001; rho += 0.01) {
    let ll = 0;
    for (const m of played) {
      const l1 = Math.exp(fit.mu + fit.home + fit.own[m.casaId] + fit.opp[m.foraId]);
      const l2 = Math.exp(fit.mu + fit.own[m.foraId] + fit.opp[m.casaId]);
      const x = m.golsCasa ?? 0;
      const y = m.golsFora ?? 0;
      const tau = dcTau(x, y, l1, l2, rho);
      if (tau <= 0) {
        ll = -Infinity;
        break;
      }
      ll += Math.log(tau);
    }
    if (ll > bestLL) {
      bestLL = ll;
      best = rho;
    }
  }
  return Math.round(best * 100) / 100;
}

export function expectedGoals(model: PoissonTeamFit, casaId: number, foraId: number): [number, number] {
  const lc = Math.exp(model.mu + model.home + (model.own[casaId] ?? 0) + (model.opp[foraId] ?? 0));
  const lf = Math.exp(model.mu + (model.own[foraId] ?? 0) + (model.opp[casaId] ?? 0));
  return [lc, lf];
}

export const MAX_GOALS = 10;

export function scoreMatrix(l1: number, l2: number, rho: number): number[][] {
  const m: number[][] = [];
  let total = 0;
  for (let x = 0; x <= MAX_GOALS; x++) {
    const row: number[] = [];
    for (let y = 0; y <= MAX_GOALS; y++) {
      const p = Math.max(0, dcTau(x, y, l1, l2, rho)) * poissonPmf(x, l1) * poissonPmf(y, l2);
      row.push(p);
      total += p;
    }
    m.push(row);
  }
  for (const row of m) for (let y = 0; y < row.length; y++) row[y] /= total;
  return m;
}

export function fixtureOdds(model: GoalsModel, match: Match): FixtureOdds {
  const [lc, lf] = expectedGoals(model, match.casaId, match.foraId);
  const sm = scoreMatrix(lc, lf, model.rho);
  let pc = 0;
  let pe = 0;
  let pf = 0;
  let sgc = 0;
  let sgf = 0;
  let over = 0;
  let best: [number, number] = [0, 0];
  let bestP = -1;
  for (let x = 0; x <= MAX_GOALS; x++) {
    for (let y = 0; y <= MAX_GOALS; y++) {
      const p = sm[x][y];
      if (x > y) pc += p;
      else if (x === y) pe += p;
      else pf += p;
      if (y === 0) sgc += p;
      if (x === 0) sgf += p;
      if (x + y > 2.5) over += p;
      if (p > bestP) {
        bestP = p;
        best = [x, y];
      }
    }
  }
  return {
    matchId: match.id,
    rodada: match.rodada,
    casaId: match.casaId,
    foraId: match.foraId,
    data: match.data,
    local: match.local,
    lambdaCasa: lc,
    lambdaFora: lf,
    pCasa: pc,
    pEmpate: pe,
    pFora: pf,
    sgCasa: sgc,
    sgFora: sgf,
    placarProvavel: best,
    pOver25: over,
    scoreMatrix: sm.slice(0, 6).map((r) => r.slice(0, 6)),
  };
}

/** Scouts de volume modelados no nível de time (quanto cada adversário cede). */
export const TEAM_STAT_KEYS: ScoutKey[] = ["FD", "FF", "FT", "DS", "FS", "FC", "CA", "I", "DE", "PS", "PC"];

export type TeamStatModels = Partial<Record<ScoutKey, PoissonTeamFit>>;

export function fitTeamStatModels(
  matches: Match[],
  history: PlayerRound[],
  teams: number[],
  currentRound: number,
  halfLife: number,
): TeamStatModels {
  const played = playedMatches(matches, currentRound);
  const agg = aggregateTeamScouts(history);
  const out: TeamStatModels = {};
  for (const k of TEAM_STAT_KEYS) {
    const obs: TeamObs[] = [];
    for (const m of played) {
      const w = decayWeight(currentRound - 1 - m.rodada, halfLife);
      const sc = agg.get(`${m.rodada}:${m.casaId}`);
      const sf = agg.get(`${m.rodada}:${m.foraId}`);
      if (!sc || !sf) continue;
      obs.push({ team: m.casaId, opp: m.foraId, home: true, y: sc[k] ?? 0, w });
      obs.push({ team: m.foraId, opp: m.casaId, home: false, y: sf[k] ?? 0, w });
    }
    // eventos raros recebem prior mais forte
    const priorSd = k === "PS" || k === "PC" || k === "CA" || k === "FT" ? 0.12 : 0.22;
    out[k] = fitPoissonTeamModel(obs, teams, priorSd, 40);
  }
  return out;
}

/**
 * Multiplicador de contexto de um scout para o time `team` contra `opp`:
 * E[k | confronto] / E[k | adversário médio, mando neutro].
 */
export function statContextMultiplier(fit: PoissonTeamFit | undefined, opp: number, home: boolean): number {
  if (!fit) return 1;
  return Math.exp((fit.opp[opp] ?? 0) + (home ? fit.home / 2 : -fit.home / 2));
}
