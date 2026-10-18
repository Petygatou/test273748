/**
 * Modelo de atleta: projeção scout a scout.
 *
 * Em vez de prever "pontos" diretamente (alvo muito ruidoso), projetamos cada
 * scout separadamente e somamos com os pesos oficiais. Para cada scout:
 *
 *   taxa_i = (Σ w_g · s_ig / M_g  +  m · prior_pos · q_i) / (Σ w_g + m)
 *
 * - w_g: peso de recência (meia-vida configurável) → forma recente;
 * - M_g: multiplicador de contexto do jogo g (adversário e mando enfrentados)
 *        → um desarme contra o time que mais cede desarmes vale menos;
 * - m:   força do prior estimada por Bayes empírico (Gamma-Poisson):
 *        scouts raros (gol) são mais "encolhidos" que scouts frequentes (desarme);
 * - q_i: qualidade implícita no preço (o mercado sabe algo no início da temporada).
 *
 * Gols e assistências usam "participação nos gols do time" × gols esperados
 * do time no confronto (modelo de Poisson). SG, GS e vitória vêm direto das
 * probabilidades do placar. Tudo é condicionado a entrar em campo; a
 * probabilidade de jogar é estimada à parte (status + participação recente +
 * overrides editoriais).
 */
import { buildIndex, finalPlayProbability, fitParticipation, squadFeatures } from "./participation";
import { buildContextIndex, type CedenciaResult } from "./cedencia";
import { clamp, decayWeight, mean, quantileSorted, ridgeRegression } from "./math";
import { POSITION_SCOUTS, SCORING, SG_POSITIONS, STATUS, type PositionId, type ScoutKey } from "./rules";
import { statContextMultiplier, type GoalsModel, type TeamStatModels } from "./teamModel";
import type { Athlete, ContextFactors, FixtureOdds, LineupOverride, ModelConfig, PlayerRound, SeasonData } from "./types";

/** Scouts com taxa própria por atleta (G e A usam participação nos gols do time). */
const RATE_SCOUTS: ScoutKey[] = ["FT", "FD", "FF", "FS", "PS", "PP", "I", "DS", "DE", "DP", "FC", "PC", "CA", "CV", "GC"];
const OFFENSIVE: ScoutKey[] = ["FT", "FD", "FF", "PS"];

export interface FixtureContext {
  matchId: number;
  opp: number;
  home: boolean;
  odds: FixtureOdds;
}

export interface PlayerDetail {
  athlete: Athlete;
  apps: number;
  pJogar: number;
  /** Esperado por scout dado que joga (já com contexto). */
  expected: Partial<Record<ScoutKey, number>>;
  /** Dispersão (binomial negativa) por scout. */
  dispersion: Partial<Record<ScoutKey, number>>;
  goalShare: number;
  assistShare: number;
  xPJogando: number;
  fatores: ContextFactors;
  regularidade: number;
  mediaCasa: number | null;
  mediaFora: number | null;
  ultimas: Array<{ rodada: number; pontos: number | null }>;
  alertas: string[];
  fixture: FixtureContext | null;
  override?: LineupOverride;
  /** Desvio padrão histórico das pontuações (para diagnósticos). */
  sdHist: number;
  /** Total de cartões amarelos na temporada. */
  amarelos: number;
}

export interface PlayerModelResult {
  details: Map<number, PlayerDetail>;
  priors: Record<number, Partial<Record<ScoutKey, { mean: number; strength: number; dispersion: number }>>>;
}

interface Row {
  pr: PlayerRound;
  w: number;
  opp: number | null;
  home: boolean | null;
  teamGoals: number;
  cleanSheet: boolean;
}

export function estimatePlayers(
  data: SeasonData,
  config: ModelConfig,
  goals: GoalsModel,
  stats: TeamStatModels,
  cedencia: CedenciaResult,
  fixtures: Map<number, FixtureContext>,
): PlayerModelResult {
  const R = data.rodadaAtual;
  const ctxIdx = buildContextIndex(data.matches);
  const goalsByClubRound = new Map<string, number>();
  const concededByClubRound = new Map<string, number>();
  const clubRounds = new Map<number, number[]>();
  for (const m of data.matches) {
    if (m.rodada >= R || m.golsCasa == null || m.golsFora == null) continue;
    goalsByClubRound.set(`${m.rodada}:${m.casaId}`, m.golsCasa);
    goalsByClubRound.set(`${m.rodada}:${m.foraId}`, m.golsFora);
    concededByClubRound.set(`${m.rodada}:${m.casaId}`, m.golsFora);
    concededByClubRound.set(`${m.rodada}:${m.foraId}`, m.golsCasa);
    for (const c of [m.casaId, m.foraId]) {
      if (!clubRounds.has(c)) clubRounds.set(c, []);
      clubRounds.get(c)!.push(m.rodada);
    }
  }
  for (const rs of clubRounds.values()) rs.sort((a, b) => a - b);

  // histórico por atleta (somente rodadas anteriores à atual)
  const rowsBy = new Map<number, Row[]>();
  for (const pr of data.history) {
    if (pr.rodada >= R) continue;
    const g = ctxIdx.get(`${pr.rodada}:${pr.clubeId}`);
    const row: Row = {
      pr,
      w: decayWeight(R - 1 - pr.rodada, config.halfLife),
      opp: g?.opp ?? null,
      home: g?.home ?? null,
      teamGoals: goalsByClubRound.get(`${pr.rodada}:${pr.clubeId}`) ?? 0,
      cleanSheet: concededByClubRound.get(`${pr.rodada}:${pr.clubeId}`) === 0,
    };
    if (!rowsBy.has(pr.atletaId)) rowsBy.set(pr.atletaId, []);
    rowsBy.get(pr.atletaId)!.push(row);
  }
  for (const rows of rowsBy.values()) rows.sort((a, b) => a.pr.rodada - b.pr.rodada);

  const c = config.contextStrength;
  const statMult = (k: ScoutKey, pos: PositionId, opp: number | null, home: boolean | null) => {
    if (opp == null || home == null || c === 0) return 1;
    const team = statContextMultiplier(stats[k], opp, home);
    const resid = cedencia.shareResidual.get(opp)?.[pos]?.[k] ?? 1;
    return clamp(Math.pow(team * resid, c), 0.55, 1.8);
  };
  const goalMult = (opp: number | null, home: boolean | null) => {
    if (opp == null || home == null || c === 0) return 1;
    const m = Math.exp((goals.opp[opp] ?? 0) + (home ? goals.home / 2 : -goals.home / 2));
    return clamp(Math.pow(m, c), 0.45, 2.2);
  };

  /* ---------- qualidade implícita no preço (por posição) ---------- */
  const athletesById = new Map<number, Athlete>();
  for (const a of data.athletes) athletesById.set(a.id, a);
  const priceMedian: Record<number, number> = {};
  const priceBeta: Record<number, number> = {};
  for (const pos of [1, 2, 3, 4, 5, 6] as PositionId[]) {
    const prices = data.athletes.filter((a) => a.posicaoId === pos && a.preco > 0).map((a) => a.preco).sort((x, y) => x - y);
    priceMedian[pos] = prices.length ? quantileSorted(prices, 0.5) : 5;
    const X: number[][] = [];
    const y: number[] = [];
    const posMean = mean(
      data.history.filter((h) => h.posicaoId === pos && h.rodada < R).map((h) => h.pontos),
    );
    for (const [id, rows] of rowsBy) {
      const a = athletesById.get(id);
      if (!a || a.posicaoId !== pos || rows.length < 4 || a.preco <= 0) continue;
      const ppg = mean(rows.map((r) => r.pr.pontos));
      X.push([1, Math.log(a.preco / priceMedian[pos])]);
      y.push(Math.log(Math.max(ppg + 3, 0.5)) - Math.log(posMean + 3));
    }
    const beta = X.length >= 12 ? ridgeRegression(X, y, 2, undefined, [false, true])[1] : 0.35;
    priceBeta[pos] = clamp(beta, 0, 1);
  }
  const rawQuality = (a: Athlete) =>
    a.preco > 0 ? clamp(Math.pow(a.preco / priceMedian[a.posicaoId], priceBeta[a.posicaoId]), 0.6, 1.8) : 1;
  // normaliza para que a média de q entre as APARIÇÕES da posição seja 1 (o prior é a média das aparições)
  const qNorm: Record<number, number> = {};
  {
    const acc: Record<number, { s: number; n: number }> = {};
    for (const [id, rows] of rowsBy) {
      const a = athletesById.get(id);
      if (!a) continue;
      const o = (acc[a.posicaoId] ??= { s: 0, n: 0 });
      o.s += rawQuality(a) * rows.length;
      o.n += rows.length;
    }
    for (const pos of [1, 2, 3, 4, 5, 6]) qNorm[pos] = acc[pos]?.n ? acc[pos].s / acc[pos].n : 1;
  }
  const quality = (a: Athlete) => rawQuality(a) / (qNorm[a.posicaoId] || 1);

  /* ---------- priors por posição via Bayes empírico ---------- */
  const priors: PlayerModelResult["priors"] = {};
  const goalSharePrior: Record<number, number> = {};
  const assistSharePrior: Record<number, number> = {};
  const sgPrior: Record<number, number> = {};
  for (const pos of [1, 2, 3, 4, 5] as PositionId[]) {
    priors[pos] = {};
    let gS = 0;
    let aS = 0;
    let tg = 0;
    for (const [id, rows] of rowsBy) {
      const a = athletesById.get(id);
      const p = a?.posicaoId ?? rows[0].pr.posicaoId;
      if (p !== pos) continue;
      for (const r of rows) {
        gS += r.pr.scout.G ?? 0;
        aS += r.pr.scout.A ?? 0;
        tg += r.teamGoals;
      }
    }
    goalSharePrior[pos] = tg > 0 ? gS / tg : 0.05;
    assistSharePrior[pos] = tg > 0 ? aS / tg : 0.04;
    if (SG_POSITIONS.includes(pos)) {
      // fração das "chances de SG" (jogos sem sofrer gol em que o atleta entrou) que viraram SG
      let earned = 0;
      let chances = 0;
      for (const [id, rows] of rowsBy) {
        const a = athletesById.get(id);
        if ((a?.posicaoId ?? rows[0].pr.posicaoId) !== pos) continue;
        for (const r of rows) {
          if (!r.cleanSheet) continue;
          chances++;
          earned += r.pr.scout.SG ? 1 : 0;
        }
      }
      sgPrior[pos] = chances >= 10 ? earned / chances : 0.9;
    }

    for (const k of RATE_SCOUTS) {
      if (!POSITION_SCOUTS[pos].includes(k)) continue;
      const rates: number[] = [];
      const exps: number[] = [];
      let totX = 0;
      let totN = 0;
      const perGame: Array<{ x: number; mu: number }> = [];
      for (const [id, rows] of rowsBy) {
        const a = athletesById.get(id);
        const p = a?.posicaoId ?? rows[0].pr.posicaoId;
        if (p !== pos) continue;
        let x = 0;
        for (const r of rows) x += r.pr.scout[k] ?? 0;
        const n = rows.length;
        totX += x;
        totN += n;
        if (n >= 3) {
          rates.push(x / n);
          exps.push(n);
          const mu = x / n;
          for (const r of rows) perGame.push({ x: r.pr.scout[k] ?? 0, mu });
        }
      }
      const mu = totN > 0 ? totX / totN : 0;
      // variância entre atletas = variância observada − ruído de Poisson
      let strength = 8;
      if (rates.length >= 8 && mu > 0) {
        const mr = mean(rates);
        let v = 0;
        for (const r of rates) v += (r - mr) ** 2;
        v /= rates.length - 1;
        const noise = mean(exps.map((n) => mu / n));
        const tau2 = Math.max(v - noise, (mu * mu) / 400);
        strength = clamp(mu / tau2, 1, 40);
      }
      // dispersão intra-atleta (1/k da binomial negativa)
      let num = 0;
      let den = 0;
      for (const g of perGame) {
        num += (g.x - g.mu) ** 2 - g.mu;
        den += g.mu * g.mu;
      }
      const invK = den > 0 ? num / den : 0;
      const dispersion = invK > 0.02 ? clamp(1 / invK, 1, 60) : Infinity;
      priors[pos][k] = { mean: mu, strength: strength * config.shrinkScale, dispersion };
    }
  }
  const GOAL_SHARE_M = 6 * config.shrinkScale; // em "gols do time" observados

  /* ---------- proxy de minutos: volume de scouts por aparição ----------
   * A API não informa minutos por jogo, mas desarmes, faltas e finalizações
   * acumulam com o tempo em campo. Quem tem volume baixo por aparição é, em
   * geral, quem sai do banco — e não deve herdar o prior dos titulares. */
  const VOLUME: ScoutKey[] = ["DS", "FS", "FC", "FF", "FD", "FT", "I", "DE"];
  const volOf = (sc: PlayerRound["scout"]) => VOLUME.reduce((t, k) => t + (sc[k] ?? 0), 0);
  const posVol: Record<number, number> = {};
  {
    const acc: Record<number, { s: number; n: number }> = {};
    for (const [id, rows] of rowsBy) {
      const pos = athletesById.get(id)?.posicaoId ?? rows[0].pr.posicaoId;
      const o = (acc[pos] ??= { s: 0, n: 0 });
      for (const r of rows) {
        o.s += volOf(r.pr.scout);
        o.n++;
      }
    }
    for (const pos of [1, 2, 3, 4, 5]) posVol[pos] = acc[pos]?.n ? acc[pos].s / acc[pos].n : 1;
  }
  const minutesFactor = (a: Athlete, rows: Row[]) => {
    const pv = posVol[a.posicaoId] || 1;
    const VOL_M = 2;
    let sx = 0;
    let sw = 0;
    for (const r of rows) {
      sx += r.w * volOf(r.pr.scout);
      sw += r.w;
    }
    let f = (sx + VOL_M * pv) / (sw + VOL_M) / pv;
    if (a.gatoMestre?.minutosMedia != null && a.gatoMestre.minutosMedia > 0) {
      f = 0.5 * f + 0.5 * (a.gatoMestre.minutosMedia / 80);
    }
    return clamp(f, 0.3, 1.6);
  };

  /* ---------- chance de jogar: modelo aprendido na temporada ---------- */
  const histBefore = data.history.filter((h) => h.rodada < R);
  const partModel = fitParticipation(data.athletes, histBefore, R, data.statusHistory);
  const partFeats = partModel ? squadFeatures(data.athletes, buildIndex(histBefore), R) : null;

  /* ---------- atleta a atleta ---------- */
  const details = new Map<number, PlayerDetail>();
  for (const a of data.athletes) {
    const rows = rowsBy.get(a.id) ?? [];
    const pos = a.posicaoId;
    const fixture = fixtures.get(a.clubeId) ?? null;
    const q = quality(a);
    const mf = pos === 6 ? 1 : minutesFactor(a, rows);
    const expected: Partial<Record<ScoutKey, number>> = {};
    const dispersion: Partial<Record<ScoutKey, number>> = {};
    const fatores: ContextFactors = { ataque: 1, cedencia: 1, mando: 1, forma: 1 };
    let goalShare = 0;
    let assistShare = 0;
    let sgEligibility = 1;
    const amarelos = rows.reduce((s, r) => s + (r.pr.scout.CA ?? 0), 0);

    if (pos !== 6) {
      const sw = rows.reduce((s, r) => s + r.w, 0);
      const opp = fixture?.opp ?? null;
      const home = fixture?.home ?? null;

      for (const k of RATE_SCOUTS) {
        if (!POSITION_SCOUTS[pos].includes(k)) continue;
        const pr = priors[pos][k];
        if (!pr) continue;
        let sx = 0;
        for (const r of rows) {
          const v = r.pr.scout[k] ?? 0;
          if (!v) continue;
          const adj = config.opponentAdjust ? statMult(k, pos, r.opp, r.home) : 1;
          sx += (r.w * v) / adj;
        }
        const priorMean = (OFFENSIVE.includes(k) ? pr.mean * q : pr.mean) * mf;
        const rate = (sx + pr.strength * priorMean) / (sw + pr.strength);
        const mult = statMult(k, pos, opp, home);
        expected[k] = rate * mult;
        dispersion[k] = pr.dispersion;
      }

      // participação nos gols e assistências do time
      let gw = 0;
      let aw = 0;
      let tgw = 0;
      for (const r of rows) {
        const adj = config.opponentAdjust ? goalMult(r.opp, r.home) : 1;
        gw += (r.w * (r.pr.scout.G ?? 0)) / adj;
        aw += (r.w * (r.pr.scout.A ?? 0)) / adj;
        tgw += (r.w * r.teamGoals) / adj;
      }
      const gPrior = goalSharePrior[pos] * q * mf;
      const aPrior = assistSharePrior[pos] * q * mf;
      goalShare = clamp((gw + GOAL_SHARE_M * gPrior) / (tgw + GOAL_SHARE_M), 0, 0.85);
      assistShare = clamp((aw + GOAL_SHARE_M * aPrior) / (tgw + GOAL_SHARE_M), 0, 0.7);

      if (fixture) {
        const lamTeam = fixture.home ? fixture.odds.lambdaCasa : fixture.odds.lambdaFora;
        const lamOpp = fixture.home ? fixture.odds.lambdaFora : fixture.odds.lambdaCasa;
        const lamAvg = Math.exp(goals.mu + goals.home / 2 + (goals.own[a.clubeId] ?? 0));
        const lamEff = Math.pow(lamAvg, 1 - c) * Math.pow(lamTeam, c);
        expected.G = goalShare * lamEff;
        expected.A = assistShare * lamEff;
        fatores.ataque = lamTeam / lamAvg;
        if (SG_POSITIONS.includes(pos)) {
          // elegibilidade individual: quem costuma sair do banco raramente leva o SG
          let earned = 0;
          let chances = 0;
          for (const r of rows) {
            if (!r.cleanSheet) continue;
            chances += r.w;
            if (r.pr.scout.SG) earned += r.w;
          }
          const SG_M = 3;
          sgEligibility = clamp((earned + SG_M * (sgPrior[pos] ?? 0.9)) / (chances + SG_M), 0, 1);
          expected.SG = sgEligibility * (fixture.home ? fixture.odds.sgCasa : fixture.odds.sgFora);
        }
        if (pos === 1) expected.GS = lamOpp;
        const keyStat: ScoutKey = pos === 1 ? "DE" : pos === 5 || pos === 4 ? "FD" : "DS";
        fatores.cedencia = statMult(keyStat, pos, fixture.opp, fixture.home);
        fatores.mando = fixture.home ? Math.exp(goals.home / 2) : Math.exp(-goals.home / 2);
      } else {
        const lamAvg = Math.exp(goals.mu + goals.home / 2 + (goals.own[a.clubeId] ?? 0));
        expected.G = goalShare * lamAvg;
        expected.A = assistShare * lamAvg;
      }
    } else if (fixture) {
      expected.V = fixture.home ? fixture.odds.pCasa : fixture.odds.pFora;
    }

    let xPJ = 0;
    for (const k in expected) xPJ += (expected[k as ScoutKey] ?? 0) * SCORING[k as ScoutKey];

    // forma: xP com pesos recentes vs. temporada inteira (sem contexto)
    if (rows.length >= 3) {
      const all = mean(rows.map((r) => r.pr.pontos));
      const wsum = rows.reduce((s, r) => s + r.w, 0);
      const rec = rows.reduce((s, r) => s + r.w * r.pr.pontos, 0) / wsum;
      fatores.forma = clamp((rec + 3) / (all + 3), 0.5, 1.8);
    }

    const pts = rows.map((r) => r.pr.pontos);
    const sdHist = pts.length >= 2 ? Math.sqrt(pts.reduce((s, p) => s + (p - mean(pts)) ** 2, 0) / (pts.length - 1)) : 0;
    const casaPts = rows.filter((r) => r.home === true).map((r) => r.pr.pontos);
    const foraPts = rows.filter((r) => r.home === false).map((r) => r.pr.pontos);
    const hits = pts.filter((p) => p >= 3).length;
    const regularidade = Math.round(((hits + 2 * 0.45) / (pts.length + 2)) * 100);

    const clubRs = clubRounds.get(a.clubeId) ?? [];
    const lastClubRounds = clubRs.slice(-6);
    const byRound = new Map(rows.map((r) => [r.pr.rodada, r.pr.pontos] as const));
    const ultimas = lastClubRounds.map((r) => ({ rodada: r, pontos: byRound.has(r) ? byRound.get(r)! : null }));

    const override = data.overrides?.[a.id];
    const feats = partFeats?.get(a.id);
    const pJogar = !fixture
      ? 0
      : partModel && feats && a.posicaoId !== 6
        ? finalPlayProbability(partModel, feats, data.semStatus ? { ...a, statusId: -1 } : a, override, data.sinais?.[a.id] ?? 0)
        : playProbability(a, rows, clubRs, R, override);

    const alertas: string[] = [];
    if (pos !== 6 && amarelos % 3 === 2) alertas.push("Pendurado: o próximo amarelo tira o atleta da rodada seguinte");
    if (a.statusId === STATUS.DUVIDA) alertas.push("Status de dúvida no Cartola");
    if (!fixture) alertas.push("Clube sem jogo válido nesta rodada");
    const recentApps = ultimas.slice(-3).filter((u) => u.pontos != null).length;
    if (fixture && a.statusId === STATUS.PROVAVEL && ultimas.length >= 3 && recentApps === 0)
      alertas.push("Não entrou em campo nos últimos 3 jogos do clube");
    if (fatores.ataque < 0.75 && pos >= 4) alertas.push("Confronto ofensivo difícil (gols esperados bem abaixo do normal do time)");
    if (pos <= 3 && fixture && (fixture.home ? fixture.odds.sgCasa : fixture.odds.sgFora) > 0.45)
      alertas.push("Boa chance de SG nesta rodada");

    details.set(a.id, {
      athlete: a,
      apps: rows.length,
      pJogar,
      expected,
      dispersion,
      goalShare,
      assistShare,
      xPJogando: xPJ,
      fatores,
      regularidade,
      mediaCasa: casaPts.length ? mean(casaPts) : null,
      mediaFora: foraPts.length ? mean(foraPts) : null,
      ultimas,
      alertas,
      fixture,
      override,
      sdHist,
      amarelos,
    });
  }

  // goleiro: só um entra em campo. Normaliza a soma das chances por clube para ≤ 1,
  // preservando quem tem override editorial de titular.
  const gkByClub = new Map<number, PlayerDetail[]>();
  for (const d of details.values()) {
    if (d.athlete.posicaoId !== 1 || d.pJogar <= 0) continue;
    if (!gkByClub.has(d.athlete.clubeId)) gkByClub.set(d.athlete.clubeId, []);
    gkByClub.get(d.athlete.clubeId)!.push(d);
  }
  for (const list of gkByClub.values()) {
    const locked = list.filter((d) => d.override === "titular");
    const free = list.filter((d) => d.override !== "titular");
    const lockedSum = locked.reduce((s, d) => s + d.pJogar, 0);
    const freeSum = free.reduce((s, d) => s + d.pJogar, 0);
    const room = Math.max(0, 1 - lockedSum);
    if (freeSum > room && freeSum > 0) for (const d of free) d.pJogar *= room / freeSum;
  }

  // técnico: média dos atletas do clube que entram + bônus de vitória
  const byClub = new Map<number, PlayerDetail[]>();
  for (const d of details.values()) {
    if (d.athlete.posicaoId === 6) continue;
    if (!byClub.has(d.athlete.clubeId)) byClub.set(d.athlete.clubeId, []);
    byClub.get(d.athlete.clubeId)!.push(d);
  }
  for (const d of details.values()) {
    if (d.athlete.posicaoId !== 6) continue;
    const mates = byClub.get(d.athlete.clubeId) ?? [];
    let sp = 0;
    let sx = 0;
    for (const m of mates) {
      sp += m.pJogar;
      sx += m.pJogar * m.xPJogando;
    }
    const avg = sp > 0 ? sx / sp : 0;
    d.xPJogando = avg + (d.expected.V ?? 0) * SCORING.V;
  }

  return { details, priors };
}

/**
 * Probabilidade de entrar em campo.
 * Combina status oficial, participação recente (com decaimento) e override editorial.
 */
export function playProbability(
  a: Athlete,
  rows: Array<{ pr: PlayerRound }>,
  clubRounds: number[],
  currentRound: number,
  override?: LineupOverride,
): number {
  if (override === "fora") return 0;
  if (override === "titular") return 0.96;
  if (a.statusId === STATUS.CONTUNDIDO || a.statusId === STATUS.SUSPENSO) return 0;
  if (a.posicaoId === 6) return a.statusId === STATUS.NULO ? 0.2 : 0.99;

  const played = new Set(rows.map((r) => r.pr.rodada));
  const recent = clubRounds.slice(-10);
  let wp = 0;
  let w = 0;
  for (const r of recent) {
    const wt = decayWeight(currentRound - 1 - r, 4);
    w += wt;
    if (played.has(r)) wp += wt;
  }
  const part = (wp + 0.5 * 1.5) / (w + 1.5);

  if (override === "reserva") return clamp(0.15 + 0.3 * part, 0.1, 0.45);
  if (override === "duvida") return 0.5 * (0.4 + 0.6 * part);

  switch (a.statusId) {
    case STATUS.PROVAVEL:
      return clamp(0.32 + 0.66 * part, 0.3, 0.97);
    case STATUS.DUVIDA:
      return clamp(0.15 + 0.45 * part, 0.1, 0.6);
    case STATUS.NULO:
      return clamp(0.12 * part, 0, 0.12);
    default:
      return clamp(0.3 * part, 0, 0.3);
  }
}
