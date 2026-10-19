/**
 * Temporada sintética para o MODO DEMONSTRAÇÃO e para testes do motor.
 *
 * Gera um Brasileirão completo a partir de uma "verdade latente" conhecida
 * (força dos times, taxas reais de cada atleta, lesões, suspensões, pênaltis,
 * valorização). Os nomes de atletas são fictícios. Como a verdade é
 * conhecida, dá para medir se o modelo a recupera.
 */
import { Rng, clamp } from "../engine/math";
import { SCORING, STATUS, pointsFromScouts, type PositionId, type ScoutKey, type Scouts } from "../engine/rules";
import type { Athlete, Club, Match, PlayerRound, SeasonData } from "../engine/types";

export const DEMO_CLUBS: Club[] = [
  { id: 262, nome: "Flamengo", abreviacao: "FLA" },
  { id: 263, nome: "Botafogo", abreviacao: "BOT" },
  { id: 264, nome: "Corinthians", abreviacao: "COR" },
  { id: 265, nome: "Bahia", abreviacao: "BAH" },
  { id: 266, nome: "Fluminense", abreviacao: "FLU" },
  { id: 267, nome: "Vasco", abreviacao: "VAS" },
  { id: 275, nome: "Palmeiras", abreviacao: "PAL" },
  { id: 276, nome: "São Paulo", abreviacao: "SAO" },
  { id: 277, nome: "Santos", abreviacao: "SAN" },
  { id: 280, nome: "Bragantino", abreviacao: "RBB" },
  { id: 282, nome: "Atlético-MG", abreviacao: "CAM" },
  { id: 283, nome: "Cruzeiro", abreviacao: "CRU" },
  { id: 284, nome: "Grêmio", abreviacao: "GRE" },
  { id: 285, nome: "Internacional", abreviacao: "INT" },
  { id: 287, nome: "Vitória", abreviacao: "VIT" },
  { id: 293, nome: "Athletico-PR", abreviacao: "CAP" },
  { id: 294, nome: "Coritiba", abreviacao: "CFC" },
  { id: 315, nome: "Chapecoense", abreviacao: "CHA" },
  { id: 364, nome: "Remo", abreviacao: "REM" },
  { id: 2305, nome: "Mirassol", abreviacao: "MIR" },
];

const FIRST = ["Rafael", "Lucas", "Gabriel", "Matheus", "Pedro", "Thiago", "Bruno", "Felipe", "Gustavo", "Diego", "Caio", "Vitor", "Igor", "Danilo", "Renan", "Wesley", "Kaique", "Luan", "Yuri", "Erick", "Hugo", "Davi", "Arthur", "Breno", "Marcos", "Léo", "Alex", "Fabrício", "Jean", "Otávio", "Murilo", "Samuel", "Enzo", "Nathan", "Ruan", "Patrick", "Jonas", "Tiago", "Éverton", "Wallace"];
const LAST = ["Silva", "Souza", "Costa", "Rocha", "Lima", "Alves", "Pereira", "Ribeiro", "Martins", "Barbosa", "Moura", "Teixeira", "Cardoso", "Freitas", "Nunes", "Batista", "Ramos", "Campos", "Duarte", "Prado", "Viana", "Sales", "Bastos", "Monteiro", "Pires", "Farias", "Neves", "Peixoto", "Matos", "Brito"];
const COACH = ["Abel Ramos", "Tite Moura", "Renato Lima", "Dorival Costa", "Fernando Diniz Jr.", "Luís Prado", "Rogério Teixeira", "Cuca Neves", "Vojvoda Ruiz", "Mano Batista", "Jair Ventura Filho", "Zubeldía Sanz", "Ancelotti Cruz", "Filipe Luís Dias", "Leonardo Jardim Pires", "Rafael Paiva", "Pedro Caixinha Matos", "Thiago Carpini", "Roger Machado Neto", "Juan Vojvoda"];

/** Taxas-base por 90 minutos de cada arquétipo. */
type Archetype = { pos: PositionId; name: string; rates: Partial<Record<ScoutKey, number>>; goal: number; assist: number };
const ARCHETYPES: Archetype[] = [
  { pos: 1, name: "goleiro", rates: { FS: 0.15, FC: 0.05, CA: 0.05 }, goal: 0, assist: 0.003 },
  { pos: 2, name: "lateral ofensivo", rates: { DS: 1.5, FS: 1.0, FC: 0.9, FF: 0.45, FD: 0.25, FT: 0.03, I: 0.05, CA: 0.17 }, goal: 0.03, assist: 0.09 },
  { pos: 2, name: "lateral defensivo", rates: { DS: 2.1, FS: 0.6, FC: 1.1, FF: 0.25, FD: 0.12, FT: 0.01, I: 0.02, CA: 0.2 }, goal: 0.02, assist: 0.04 },
  { pos: 3, name: "zagueiro", rates: { DS: 1.4, FS: 0.35, FC: 1.1, FF: 0.3, FD: 0.14, FT: 0.02, CA: 0.21 }, goal: 0.045, assist: 0.015 },
  { pos: 4, name: "volante", rates: { DS: 2.3, FS: 0.9, FC: 1.4, FF: 0.5, FD: 0.25, FT: 0.02, I: 0.02, CA: 0.24 }, goal: 0.04, assist: 0.05 },
  { pos: 4, name: "meia armador", rates: { DS: 1.0, FS: 1.6, FC: 0.9, FF: 0.9, FD: 0.55, FT: 0.06, I: 0.08, CA: 0.13 }, goal: 0.11, assist: 0.15 },
  { pos: 5, name: "centroavante", rates: { DS: 0.4, FS: 1.0, FC: 1.0, FF: 1.2, FD: 0.9, FT: 0.08, I: 0.5, CA: 0.12 }, goal: 0.28, assist: 0.06 },
  { pos: 5, name: "ponta", rates: { DS: 0.8, FS: 1.6, FC: 0.7, FF: 1.0, FD: 0.65, FT: 0.07, I: 0.3, CA: 0.1 }, goal: 0.16, assist: 0.11 },
];

interface LatentPlayer {
  athlete: Athlete;
  quality: number;
  arch: Archetype;
  rates: Partial<Record<ScoutKey, number>>;
  goal: number;
  assist: number;
  depth: number;
  injuredUntil: number;
  suspendedRound: number;
  yellows: number;
  history: number[];
}

interface LatentClub {
  club: Club;
  attack: number;
  defense: number;
  possession: number;
  fouls: number;
  players: LatentPlayer[];
}

/** Calendário de turno e returno (método do círculo). */
function roundRobin(ids: number[], rng: Rng): Array<Array<[number, number]>> {
  const teams = [...ids];
  for (let i = teams.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [teams[i], teams[j]] = [teams[j], teams[i]];
  }
  const n = teams.length;
  const rounds: Array<Array<[number, number]>> = [];
  const arr = [...teams];
  for (let r = 0; r < n - 1; r++) {
    const games: Array<[number, number]> = [];
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      games.push(r % 2 === 0 ? [a, b] : [b, a]);
    }
    rounds.push(games);
    arr.splice(1, 0, arr.pop()!);
  }
  const second = rounds.map((g) => g.map(([a, b]) => [b, a] as [number, number]));
  return [...rounds, ...second];
}

export interface DemoOptions {
  seed?: number;
  /** Referência de tempo para o calendário (padrão: agora). */
  now?: number;
  currentRound?: number;
  temporada?: number;
}

export function generateDemoSeason(opts: DemoOptions = {}): SeasonData & { latent: { clubs: Array<{ id: number; attack: number; defense: number }>; players: Array<{ id: number; quality: number }> } } {
  const seed = opts.seed ?? 2026;
  const R = opts.currentRound ?? 31;
  const rng = new Rng(seed);
  const mu = Math.log(1.22);
  const H = 0.24;
  let nextId = 100000;

  const clubs: LatentClub[] = DEMO_CLUBS.map((club, ci) => {
    const attack = rng.normal() * 0.2;
    const defense = rng.normal() * 0.18;
    const lc: LatentClub = { club, attack, defense, possession: rng.normal() * 0.15, fouls: rng.normal() * 0.12, players: [] };
    const plan: Array<[number, number]> = [
      [0, 3], [1, 2], [2, 2], [3, 5], [4, 4], [5, 4], [6, 3], [7, 3],
    ];
    const usedNames = new Set<string>();
    for (const [ai, count] of plan) {
      const arch = ARCHETYPES[ai];
      for (let d = 0; d < count; d++) {
        let apelido = "";
        do {
          apelido = `${FIRST[Math.floor(rng.next() * FIRST.length)]} ${LAST[Math.floor(rng.next() * LAST.length)]}`;
        } while (usedNames.has(apelido));
        usedNames.add(apelido);
        const quality = rng.normal() * 0.8 + (d === 0 ? 0.55 : d === 1 ? 0.2 : -0.35);
        const rates: Partial<Record<ScoutKey, number>> = {};
        for (const k in arch.rates) {
          const key = k as ScoutKey;
          const qBoost = ["FD", "FF", "FT", "FS"].includes(key) ? Math.exp(0.18 * quality) : Math.exp(0.08 * quality);
          rates[key] = (arch.rates[key] ?? 0) * qBoost * Math.exp(rng.normal() * 0.25);
        }
        const basePrice = { 1: 8, 2: 8, 3: 8, 4: 9.5, 5: 10.5, 6: 8 }[arch.pos];
        const preco = clamp(basePrice * Math.exp(0.32 * quality + 0.6 * attack + rng.normal() * 0.12), 2, 24);
        lc.players.push({
          athlete: {
            id: nextId++,
            apelido,
            clubeId: club.id,
            posicaoId: arch.pos,
            statusId: STATUS.PROVAVEL,
            preco: Math.round(preco * 100) / 100,
            variacao: 0,
            media: 0,
            jogos: 0,
            pontosUltima: 0,
          },
          quality,
          arch,
          rates,
          goal: arch.goal * Math.exp(0.3 * quality + rng.normal() * 0.3),
          assist: arch.assist * Math.exp(0.25 * quality + rng.normal() * 0.3),
          depth: d,
          injuredUntil: 0,
          suspendedRound: 0,
          yellows: 0,
          history: [],
        });
      }
    }
    // técnico
    lc.players.push({
      athlete: {
        id: nextId++,
        apelido: COACH[ci % COACH.length],
        clubeId: club.id,
        posicaoId: 6,
        statusId: STATUS.PROVAVEL,
        preco: Math.round(clamp(8 * Math.exp(0.9 * attack - 0.6 * defense), 3, 18) * 100) / 100,
        variacao: 0,
        media: 0,
        jogos: 0,
        pontosUltima: 0,
      },
      quality: 0,
      arch: { pos: 6, name: "técnico", rates: {}, goal: 0, assist: 0 },
      rates: {},
      goal: 0,
      assist: 0,
      depth: 0,
      injuredUntil: 0,
      suspendedRound: 0,
      yellows: 0,
      history: [],
    });
    return lc;
  });

  const byId = new Map(clubs.map((c) => [c.club.id, c] as const));
  const schedule = roundRobin(clubs.map((c) => c.club.id), rng);
  const matches: Match[] = [];
  const history: PlayerRound[] = [];
  let matchId = 1;
  // calendário ancorado em "agora": a rodada atual acontece daqui a ~2 dias (mercado aberto)
  const anchor = opts.now ?? Date.now();
  const anchorDay = new Date(anchor);
  anchorDay.setUTCHours(21, 30, 0, 0);
  const start = new Date(anchorDay.getTime() + 2 * 86400000 - (R - 1) * 7 * 86400000);

  // status "como o Cartola mostrava antes de cada rodada" (o que os snapshots
  // guardam em produção); rng separado para não alterar a temporada simulada
  const srng = new Rng(seed + 7);
  const statusHistory: Record<number, Record<number, number>> = {};
  const snapshotStatus = (r: number) => {
    const snap: Record<number, number> = {};
    for (const c of clubs) {
      const lineup = pickLineup(c, r, srng, true);
      const starters = new Set(lineup.starters.map((p) => p.athlete.id));
      const bench = new Set(lineup.bench.map((p) => p.athlete.id));
      for (const p of c.players) {
        const id = p.athlete.id;
        if (p.athlete.posicaoId === 6) snap[id] = STATUS.PROVAVEL;
        else if (p.injuredUntil >= r) snap[id] = STATUS.CONTUNDIDO;
        else if (p.suspendedRound === r) snap[id] = STATUS.SUSPENSO;
        else if (starters.has(id)) snap[id] = srng.next() < 0.08 ? STATUS.DUVIDA : STATUS.PROVAVEL;
        else if (bench.has(id)) snap[id] = srng.next() < 0.55 ? STATUS.PROVAVEL : STATUS.NULO;
        else snap[id] = STATUS.NULO;
      }
    }
    return snap;
  };

  for (let r = 1; r <= schedule.length; r++) {
    if (r < R) statusHistory[r] = snapshotStatus(r);
    if (r < R) {
      for (const c of clubs)
        for (const p of c.players) {
          p.athlete.variacao = 0;
          p.athlete.pontosUltima = 0;
        }
    }
    for (const [casaId, foraId] of schedule[r - 1]) {
      const date = new Date(start.getTime() + (r - 1) * 7 * 86400000 + Math.floor(rng.next() * 3) * 86400000);
      const m: Match = {
        id: matchId++,
        rodada: r,
        casaId,
        foraId,
        golsCasa: null,
        golsFora: null,
        data: date.toISOString(),
        local: `Estádio ${byId.get(casaId)!.club.nome}`,
        valida: true,
      };
      matches.push(m);
      if (r < R) playMatch(m, byId.get(casaId)!, byId.get(foraId)!, r, rng, mu, H, history);
    }
  }

  // status para a rodada atual
  for (const c of clubs) {
    const lineup = pickLineup(c, R, rng, true);
    const starters = new Set(lineup.starters.map((p) => p.athlete.id));
    const bench = new Set(lineup.bench.map((p) => p.athlete.id));
    for (const p of c.players) {
      const a = p.athlete;
      if (a.posicaoId === 6) {
        a.statusId = STATUS.PROVAVEL;
        continue;
      }
      if (p.injuredUntil >= R) a.statusId = STATUS.CONTUNDIDO;
      else if (p.suspendedRound === R) a.statusId = STATUS.SUSPENSO;
      else if (starters.has(a.id)) a.statusId = rng.next() < 0.08 ? STATUS.DUVIDA : STATUS.PROVAVEL;
      else if (bench.has(a.id)) a.statusId = rng.next() < 0.55 ? STATUS.PROVAVEL : STATUS.NULO;
      else a.statusId = STATUS.NULO;
    }
  }

  const athletes = clubs.flatMap((c) => c.players.map((p) => p.athlete));
  const clubsRec: Record<number, Club> = {};
  for (const c of DEMO_CLUBS) clubsRec[c.id] = c;

  // mais escalados: popularidade ~ média × preço (efeito manada)
  const totalTimes = 4_850_000;
  const pop = athletes
    .filter((a) => a.statusId === STATUS.PROVAVEL && a.jogos >= 5)
    .map((a) => ({ a, s: Math.max(0, a.media) * Math.sqrt(a.preco) * Math.exp(rng.normal() * 0.35) }))
    .sort((x, y) => y.s - x.s)
    .slice(0, 60);
  const ownership: Record<number, number> = {};
  pop.forEach(({ a }, i) => {
    ownership[a.id] = Math.round(totalTimes * clamp(0.62 * Math.exp(-i / 9) + 0.01 * rng.next(), 0.01, 0.75));
  });

  const fechamento = matches.filter((m) => m.rodada === R).map((m) => m.data!).sort()[0];

  return {
    temporada: opts.temporada ?? 2026,
    rodadaAtual: R,
    mercadoStatus: 1,
    fechamento: fechamento ? new Date(new Date(fechamento).getTime() - 3600000).toISOString() : undefined,
    timesEscalados: totalTimes,
    clubs: clubsRec,
    athletes,
    matches,
    history,
    ownership,
    overrides: {},
    statusHistory,
    source: "demo",
    updatedAt: new Date(anchor).toISOString(),
    latent: { clubs: clubs.map((c) => ({ id: c.club.id, attack: c.attack, defense: c.defense })), players: clubs.flatMap((c) => c.players.map((p) => ({ id: p.athlete.id, quality: p.quality }))) },
  };
}

function available(p: LatentPlayer, r: number) {
  return p.injuredUntil < r && p.suspendedRound !== r;
}

function pickLineup(c: LatentClub, r: number, rng: Rng, deterministic = false) {
  const need: Record<number, number> = { 1: 1, 2: 2, 3: 2, 4: 4, 5: 2 };
  if (c.attack > 0.1) {
    need[4] = 3;
    need[5] = 3;
  }
  const starters: LatentPlayer[] = [];
  const bench: LatentPlayer[] = [];
  for (const pos of [1, 2, 3, 4, 5]) {
    const pool = c.players
      .filter((p) => p.athlete.posicaoId === pos && available(p, r))
      .map((p) => ({ p, s: p.quality + (deterministic ? 0 : rng.normal() * 0.35) }))
      .sort((a, b) => b.s - a.s);
    pool.forEach((x, i) => (i < need[pos] ? starters : bench).push(x.p));
  }
  return { starters, bench };
}

function playMatch(m: Match, home: LatentClub, away: LatentClub, r: number, rng: Rng, mu: number, H: number, history: PlayerRound[]) {
  const lh = Math.exp(mu + H + home.attack + away.defense);
  const la = Math.exp(mu + home.defense + away.attack);
  const sides = [
    { club: home, opp: away, lam: lh, oppLam: la, isHome: true },
    { club: away, opp: home, lam: la, oppLam: lh, isHome: false },
  ];
  const lineups = sides.map((s) => {
    const { starters, bench } = pickLineup(s.club, r, rng);
    const minutes = new Map<number, number>();
    for (const p of starters) minutes.set(p.athlete.id, 90);
    // 3 a 5 substituições entre meias, atacantes e laterais
    const subsIn = bench.filter((p) => p.athlete.posicaoId >= 2 && rng.next() < 0.45).slice(0, 2 + Math.floor(rng.next() * 3));
    for (const sub of subsIn) {
      const out = starters.filter((p) => p.athlete.posicaoId === sub.athlete.posicaoId && minutes.get(p.athlete.id) === 90);
      const minute = 55 + Math.floor(rng.next() * 30);
      if (out.length) {
        const o = out[Math.floor(rng.next() * out.length)];
        minutes.set(o.athlete.id, minute);
        minutes.set(sub.athlete.id, 90 - minute);
      }
    }
    return { starters, bench, minutes };
  });

  const scouts = new Map<number, Scouts>();
  const add = (id: number, k: ScoutKey, n = 1) => {
    const s = scouts.get(id) ?? {};
    s[k] = (s[k] ?? 0) + n;
    scouts.set(id, s);
  };

  const goals = [0, 0];
  sides.forEach((s, i) => {
    const lu = lineups[i];
    const onField = s.club.players.filter((p) => lu.minutes.has(p.athlete.id));
    const oppOnField = s.opp.players.filter((p) => lineups[1 - i].minutes.has(p.athlete.id));
    const oppGk = oppOnField.find((p) => p.athlete.posicaoId === 1);
    const attackRatio = s.lam / 1.3;

    // gols de jogo corrido
    let g = rng.poisson(s.lam * 0.9);
    // pênalti
    if (rng.next() < 0.13) {
      const takers = onField.filter((p) => p.athlete.posicaoId >= 4).sort((a, b) => b.goal - a.goal);
      const fouled = onField.filter((p) => p.athlete.posicaoId >= 4)[Math.floor(rng.next() * Math.max(1, onField.filter((p) => p.athlete.posicaoId >= 4).length))];
      const fouler = oppOnField.filter((p) => p.athlete.posicaoId === 3 || p.athlete.posicaoId === 2)[0];
      if (fouled) add(fouled.athlete.id, "PS");
      if (fouler) add(fouler.athlete.id, "PC");
      if (takers[0]) {
        if (rng.next() < 0.78) {
          add(takers[0].athlete.id, "G");
          goals[i]++;
        } else {
          add(takers[0].athlete.id, "PP");
          if (oppGk && rng.next() < 0.6) add(oppGk.athlete.id, "DP");
        }
      }
    }
    const weights = onField.map((p) => p.goal * ((lu.minutes.get(p.athlete.id) ?? 0) / 90));
    const aWeights = onField.map((p) => p.assist * ((lu.minutes.get(p.athlete.id) ?? 0) / 90));
    const wsum = weights.reduce((a, b) => a + b, 0) + 0.04;
    for (let k = 0; k < g; k++) {
      if (rng.next() < 0.012 * 3) {
        // gol contra do adversário
        const d = oppOnField.filter((p) => p.athlete.posicaoId === 3)[0];
        if (d) add(d.athlete.id, "GC");
        goals[i]++;
        continue;
      }
      let u = rng.next() * wsum;
      let scorer = -1;
      for (let j = 0; j < weights.length; j++) {
        if (u < weights[j]) {
          scorer = j;
          break;
        }
        u -= weights[j];
      }
      goals[i]++;
      if (scorer >= 0) add(onField[scorer].athlete.id, "G");
      if (rng.next() < 0.7) {
        const asum = aWeights.reduce((a, b, j) => a + (j === scorer ? 0 : b), 0);
        let v = rng.next() * asum;
        for (let j = 0; j < aWeights.length; j++) {
          if (j === scorer) continue;
          if (v < aWeights[j]) {
            add(onField[j].athlete.id, "A");
            break;
          }
          v -= aWeights[j];
        }
      }
    }

    // scouts de volume
    for (const p of onField) {
      const frac = (lu.minutes.get(p.athlete.id) ?? 0) / 90;
      for (const k in p.rates) {
        const key = k as ScoutKey;
        let rate = (p.rates[key] ?? 0) * frac;
        if (key === "FD" || key === "FF" || key === "FT") rate *= Math.pow(attackRatio, 0.85);
        if (key === "DS") rate *= Math.exp(s.opp.possession - s.club.possession);
        if (key === "FS") rate *= Math.exp(s.opp.fouls);
        if (key === "FC" || key === "CA") rate *= Math.exp(s.club.fouls);
        const n = rng.negBin(rate, key === "DS" || key === "FS" || key === "FC" ? 6 : 50);
        if (n) add(p.athlete.id, key, n);
      }
      if (rng.next() < 0.012 * frac) add(p.athlete.id, "CV");
    }
    // defesas do goleiro adversário: proporcionais às finalizações deste time
    if (oppGk) {
      const de = rng.negBin(3.1 * Math.pow(attackRatio, 0.9), 12);
      if (de) add(oppGk.athlete.id, "DE", de);
    }
  });

  m.golsCasa = goals[0];
  m.golsFora = goals[1];

  sides.forEach((s, i) => {
    const lu = lineups[i];
    const conceded = goals[1 - i];
    const won = goals[i] > goals[1 - i];
    const participants: number[] = [];
    for (const p of s.club.players) {
      const a = p.athlete;
      if (a.posicaoId === 6) continue;
      const min = lu.minutes.get(a.id);
      if (min == null) continue;
      const sc = scouts.get(a.id) ?? {};
      if (a.posicaoId === 1 && conceded) sc.GS = conceded;
      if ((a.posicaoId === 1 || a.posicaoId === 2 || a.posicaoId === 3) && conceded === 0 && min >= 60) sc.SG = 1;
      const pts = pointsFromScouts(sc);
      participants.push(pts);
      record(p, r, pts, sc, history, rng);
      // disciplina
      p.yellows += sc.CA ?? 0;
      if (sc.CV) p.suspendedRound = r + 1;
      else if (p.yellows >= 3) {
        p.yellows = 0;
        p.suspendedRound = r + 1;
      }
      // lesões
      if (rng.next() < 0.03) p.injuredUntil = r + 1 + Math.floor(rng.next() * 4);
    }
    const tec = s.club.players.find((p) => p.athlete.posicaoId === 6)!;
    const avg = participants.length ? participants.reduce((a, b) => a + b, 0) / participants.length : 0;
    const tecSc: Scouts = won ? { V: 1 } : {};
    record(tec, r, Math.round((avg + (won ? SCORING.V : 0)) * 100) / 100, tecSc, history, rng);
  });
}

function record(p: LatentPlayer, r: number, pts: number, sc: Scouts, history: PlayerRound[], rng: Rng) {
  const a = p.athlete;
  const precoAntes = a.preco;
  const mediaAntes = a.jogos ? a.media : pts;
  // "verdade" da valorização: V = 0.25 × (pts − (0.5·preço + 0.25·média_anterior))
  const mpv = 0.5 * precoAntes + 0.25 * mediaAntes;
  const variacao = Math.round((0.25 * (pts - mpv) + rng.normal() * 0.05) * 100) / 100;
  a.preco = Math.max(1, Math.round((a.preco + variacao) * 100) / 100);
  a.variacao = Math.round((a.preco - precoAntes) * 100) / 100;
  a.media = (a.media * a.jogos + pts) / (a.jogos + 1);
  a.jogos += 1;
  a.pontosUltima = pts;
  p.history.push(pts);
  history.push({
    atletaId: a.id,
    rodada: r,
    clubeId: a.clubeId,
    posicaoId: a.posicaoId,
    pontos: pts,
    scout: sc,
    preco: precoAntes,
    variacao: a.variacao,
  });
}
