/**
 * Orquestrador: transforma os dados da temporada em uma análise completa da
 * rodada (forças dos times, odds dos jogos, cedência, projeção de cada
 * atleta com distribuição, MPV e valorização esperada).
 *
 * Princípio: a matemática decide os números. A IA só lê esta saída.
 */
import { computeCedencia } from "./cedencia";
import { clamp, round } from "./math";
import { estimatePlayers, type FixtureContext, type PlayerDetail } from "./playerModel";
import { calibratePmv, mpvFor } from "./pmv";
import { BASE_SCOUTS, SCORING, type PositionId, type ScoutKey } from "./rules";
import { validateScoring } from "./rulesCheck";
import { probAtLeast, quantile, simulateRound, type PlayerDistribution } from "./simulate";
import { fitGoalsModel, fitTeamStatModels, fixtureOdds } from "./teamModel";
import {
  DEFAULT_CONFIG,
  type MatchSimParams,
  type ModelConfig,
  type PlayerModelParams,
  type PlayerProjection,
  type RoundAnalysis,
  type ScoutProjection,
  type SeasonData,
  type UpcomingFixture,
} from "./types";

const SIM_EXCLUDED: ScoutKey[] = ["G", "A", "SG", "GS", "V"];

export function buildRoundAnalysis(data: SeasonData, partial: Partial<ModelConfig> = {}): RoundAnalysis {
  const t0 = Date.now();
  const config: ModelConfig = { ...DEFAULT_CONFIG, ...partial };
  const R = data.rodadaAtual;
  const clubIds = Object.keys(data.clubs).map(Number);
  const history = data.history.filter((h) => h.rodada < R);

  const goals = fitGoalsModel(data.matches, history, clubIds, R, config);
  const stats = fitTeamStatModels(data.matches, history, clubIds, R, config.teamHalfLife);
  const ced = computeCedencia(history, data.matches, clubIds, R, config.teamHalfLife, 10, data.lados ?? {});

  const roundMatches = data.matches.filter((m) => m.rodada === R && m.valida);
  const fixtures = roundMatches.map((m) => fixtureOdds(goals, m));
  const fixtureByClub = new Map<number, FixtureContext>();
  for (const f of fixtures) {
    fixtureByClub.set(f.casaId, { matchId: f.matchId, opp: f.foraId, home: true, odds: f });
    fixtureByClub.set(f.foraId, { matchId: f.matchId, opp: f.casaId, home: false, odds: f });
  }

  const proximos: Record<number, UpcomingFixture[]> = {};
  for (const m of data.matches) {
    if (m.rodada < R || m.rodada > R + 4 || !m.valida) continue;
    const f = fixtureOdds(goals, m);
    for (const home of [true, false]) {
      const club = home ? m.casaId : m.foraId;
      (proximos[club] ??= []).push({
        rodada: m.rodada,
        adversarioId: home ? m.foraId : m.casaId,
        mando: home ? "casa" : "fora",
        pVitoria: round(home ? f.pCasa : f.pFora, 3),
        xgPro: round(home ? f.lambdaCasa : f.lambdaFora, 2),
        xgContra: round(home ? f.lambdaFora : f.lambdaCasa, 2),
        pSG: round(home ? f.sgCasa : f.sgFora, 3),
      });
    }
  }
  for (const list of Object.values(proximos)) list.sort((a, b) => a.rodada - b.rodada);

  const { details } = estimatePlayers({ ...data, history }, config, goals, stats, ced, fixtureByClub);

  const simPlayers: PlayerModelParams[] = [];
  for (const d of details.values()) simPlayers.push(toSimParams(d));
  const simMatches: MatchSimParams[] = fixtures.map((f) => ({
    matchId: f.matchId,
    casaId: f.casaId,
    foraId: f.foraId,
    lambdaCasa: f.lambdaCasa,
    lambdaFora: f.lambdaFora,
    rho: goals.rho,
    assistPerGoal: goals.assistPerGoal,
  }));

  const dists =
    config.simulations > 0
      ? simulateRound(simPlayers, simMatches, config.simulations, config.seed + R)
      : new Map<number, PlayerDistribution>();

  const pmvModel = calibratePmv(data.athletes, history, R);
  const total = data.timesEscalados ?? 0;

  const players: PlayerProjection[] = [];
  for (const d of details.values()) {
    players.push(toProjection(d, dists.get(d.athlete.id), pmvModel, data.ownership, total, data.lados));
  }
  players.sort((a, b) => b.xP - a.xP);

  return {
    temporada: data.temporada,
    rodada: R,
    source: data.source,
    updatedAt: data.updatedAt,
    config,
    clubs: data.clubs,
    teams: goals.teamsList,
    homeAdvantage: Math.exp(goals.home),
    fixtures,
    cedencia: ced.rows,
    proximos,
    players,
    sim: { matches: simMatches, players: simPlayers.filter((p) => p.matchId != null) },
    pmvModel,
    rulesCheck: validateScoring(history),
    ligaMedias: ced.ligaMedias,
    diagnostics: {
      tempoMs: Date.now() - t0,
      atletasModelados: details.size,
      rodadasHistorico: new Set(history.map((h) => h.rodada)).size,
    },
  };
}

function toSimParams(d: PlayerDetail): PlayerModelParams {
  const rates: Partial<Record<ScoutKey, number>> = {};
  const dispersion: Partial<Record<ScoutKey, number>> = {};
  for (const k in d.expected) {
    const key = k as ScoutKey;
    const v = d.expected[key] ?? 0;
    if (SIM_EXCLUDED.includes(key) || v <= 1e-4) continue;
    rates[key] = round(v, 4);
    const disp = d.dispersion[key];
    if (disp != null && Number.isFinite(disp)) dispersion[key] = round(disp, 2);
  }
  const f = d.fixture;
  const lamTeam = f ? (f.home ? f.odds.lambdaCasa : f.odds.lambdaFora) : 0;
  const p: PlayerModelParams = {
    atletaId: d.athlete.id,
    posicaoId: d.athlete.posicaoId,
    clubeId: d.athlete.clubeId,
    matchId: f?.matchId ?? null,
    home: f?.home ?? false,
    pJogar: round(d.pJogar, 3),
    rates,
    dispersion,
    // participação efetiva: reproduz exatamente o G/A esperado já com o contexto aplicado
    goalShare: round(lamTeam > 0 ? clamp((d.expected.G ?? 0) / lamTeam, 0, 0.9) : d.goalShare, 4),
    assistShare: round(lamTeam > 0 ? clamp((d.expected.A ?? 0) / lamTeam, 0, 0.8) : d.assistShare, 4),
  };
  if (d.athlete.posicaoId === 6) {
    p.tecBase = round(d.xPJogando - (d.expected.V ?? 0) * SCORING.V, 2);
    p.tecSd = 1.4;
  }
  return p;
}

function toProjection(
  d: PlayerDetail,
  dist: PlayerDistribution | undefined,
  pmvModel: RoundAnalysis["pmvModel"],
  ownership: SeasonData["ownership"],
  totalTimes: number,
  lados?: SeasonData["lados"],
): PlayerProjection {
  const a = d.athlete;
  const scouts: ScoutProjection[] = [];
  let base = 0;
  let explosao = 0;
  for (const k in d.expected) {
    const key = k as ScoutKey;
    const esperado = d.expected[key] ?? 0;
    if (esperado <= 0) continue;
    const pontos = esperado * SCORING[key];
    if (BASE_SCOUTS.includes(key)) base += pontos;
    else explosao += pontos;
    if (Math.abs(pontos) >= 0.01) scouts.push({ key, esperado: round(esperado, 3), pontos: round(pontos, 2) });
  }
  if (a.posicaoId === 6) {
    base = d.xPJogando - (d.expected.V ?? 0) * SCORING.V;
    explosao = (d.expected.V ?? 0) * SCORING.V;
  }
  scouts.sort((x, y) => Math.abs(y.pontos) - Math.abs(x.pontos));

  const { mpv, fonte } = mpvFor(a, pmvModel);
  const xPJ = d.xPJogando;
  const s = dist?.sorted;
  const q = (p: number) => (s && s.length ? round(quantile(s, p), 1) : round(xPJ, 1));
  const pr = (x: number) => (s && s.length ? round(probAtLeast(s, x), 3) : 0);
  const pNeg = s && s.length ? round(1 - probAtLeast(s, 0), 3) : 0;
  const owned = ownership?.[a.id];

  return {
    atletaId: a.id,
    apelido: a.apelido,
    foto: a.foto,
    clubeId: a.clubeId,
    posicaoId: a.posicaoId as PositionId,
    statusId: a.statusId,
    preco: a.preco,
    media: round(a.media, 2),
    jogos: a.jogos,
    adversarioId: d.fixture?.opp ?? null,
    mando: d.fixture ? (d.fixture.home ? "casa" : "fora") : null,
    matchId: d.fixture?.matchId ?? null,
    lado: a.posicaoId === 2 ? lados?.[a.id] : undefined,
    pJogar: round(d.pJogar, 3),
    xPJogando: round(xPJ, 2),
    xP: round(xPJ * d.pJogar, 2),
    sd: round(dist?.sd ?? 0, 2),
    piso: q(0.15),
    mediana: q(0.5),
    teto: q(0.85),
    p95: q(0.95),
    pNegativo: pNeg,
    pAcima5: pr(5),
    pAcima8: pr(8),
    pAcima12: pr(12),
    pValorizar: pr(mpv),
    regularidade: d.regularidade,
    base: round(base, 2),
    explosao: round(explosao, 2),
    scouts,
    fatores: {
      ataque: round(d.fatores.ataque, 3),
      cedencia: round(d.fatores.cedencia, 3),
      mando: round(d.fatores.mando, 3),
      forma: round(d.fatores.forma, 3),
    },
    mpv,
    mpvFonte: fonte,
    valorizacaoEsperada: round(d.pJogar * pmvModel.cpp * (xPJ - mpv), 2),
    posse: owned != null && totalTimes > 0 ? round((owned / totalTimes) * 100, 1) : undefined,
    mediaCasa: d.mediaCasa != null ? round(d.mediaCasa, 2) : null,
    mediaFora: d.mediaFora != null ? round(d.mediaFora, 2) : null,
    ultimas: d.ultimas,
    alertas: d.alertas,
    override: d.override,
  };
}
