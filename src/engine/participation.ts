/**
 * Chance de entrar em campo, aprendida com a própria temporada.
 *
 * Regressão logística treinada walk-forward: para cada rodada t já jogada,
 * montamos as variáveis de cada atleta só com o que se sabia ANTES de t e o
 * rótulo é "entrou em campo em t". O modelo aprende, por exemplo, quanto pesa
 * ter jogado a última partida, a sequência de jogos, a disputa pela posição
 * e a suspensão por cartões. A informação do dia (status do Cartola, ajustes
 * do Painel ADM) entra depois, como deslocamento nas chances.
 */
import { STATUS, type PositionId } from "./rules";
import type { Athlete, LineupOverride, PlayerRound } from "./types";

export const FEATURE_NAMES = [
  "intercepto",
  "jogou o último jogo",
  "jogou o penúltimo",
  "jogou o antepenúltimo",
  "participação nos últimos 5",
  "participação na temporada",
  "sequência jogando",
  "sequência fora",
  "1º na disputa da posição",
  "posição na disputa",
  "dentro das vagas da posição",
  "suspenso por cartões",
  "goleiro",
  "sem jogos pelo clube",
  "média de pontos recente",
  "status conhecido",
  "status: provável",
  "status: dúvida",
  "status: nulo",
] as const;

/** Acrescenta o status do Cartola (antes da rodada) às variáveis; sem status = zeros. */
export function withStatus(f: number[], statusId: number | undefined): number[] {
  const known = statusId === STATUS.PROVAVEL || statusId === STATUS.DUVIDA || statusId === STATUS.NULO;
  return [...f, known ? 1 : 0, statusId === STATUS.PROVAVEL ? 1 : 0, statusId === STATUS.DUVIDA ? 1 : 0, statusId === STATUS.NULO ? 1 : 0];
}

export interface ParticipationModel {
  weights: number[];
  /** linhas usadas no treino */
  n: number;
  /** taxa base de quem entra em campo no treino */
  base: number;
  /** o peso do status foi aprendido com o histórico de status (snapshots) */
  statusAprendido: boolean;
}

interface Index {
  /** atleta → rodada → linha */
  byAth: Map<number, Map<number, PlayerRound>>;
  /** clube → rodadas jogadas (ordenadas) */
  clubRounds: Map<number, number[]>;
}

export function buildIndex(history: PlayerRound[]): Index {
  const byAth = new Map<number, Map<number, PlayerRound>>();
  const cr = new Map<number, Set<number>>();
  for (const h of history) {
    if (!byAth.has(h.atletaId)) byAth.set(h.atletaId, new Map());
    byAth.get(h.atletaId)!.set(h.rodada, h);
    if (h.posicaoId === 6) continue;
    if (!cr.has(h.clubeId)) cr.set(h.clubeId, new Set());
    cr.get(h.clubeId)!.add(h.rodada);
  }
  const clubRounds = new Map<number, number[]>();
  for (const [c, s] of cr) clubRounds.set(c, [...s].sort((a, b) => a - b));
  return { byAth, clubRounds };
}


/** Participação ponderada (meia-vida de 3 jogos) usada para ordenar a disputa por posição. */
function weightedPart(rows: Map<number, PlayerRound> | undefined, rounds: number[]) {
  if (!rows) return 0;
  let s = 0;
  let w = 0;
  for (let i = 0; i < rounds.length; i++) {
    const wt = Math.pow(0.5, (rounds.length - 1 - i) / 3);
    w += wt;
    if (rows.has(rounds[i])) s += wt;
  }
  return w ? s / w : 0;
}

/**
 * Variáveis de todos os atletas de linha (e goleiros) de um elenco para a
 * rodada t, usando só rodadas < t.
 */
export function squadFeatures(squad: Athlete[], idx: Index, t: number): Map<number, number[]> {
  const out = new Map<number, number[]>();
  const byClubPos = new Map<string, Athlete[]>();
  for (const a of squad) {
    if (a.posicaoId === 6) continue;
    const k = `${a.clubeId}:${a.posicaoId}`;
    if (!byClubPos.has(k)) byClubPos.set(k, []);
    byClubPos.get(k)!.push(a);
  }
  for (const group of byClubPos.values()) {
    const clube = group[0].clubeId;
    const pos = group[0].posicaoId as PositionId;
    const rounds = (idx.clubRounds.get(clube) ?? []).filter((r) => r < t);
    const last10 = rounds.slice(-10);
    const last5 = rounds.slice(-5);
    // disputa: ordem por participação recente ponderada
    const ranked = group
      .map((a) => ({ a, w: weightedPart(idx.byAth.get(a.id), last10) }))
      .sort((x, y) => y.w - x.w || y.a.preco - x.a.preco);
    // vagas típicas: quantos dessa posição entram por jogo (descontando ~30% de trocas em MEI/ATA/LAT)
    let entering = 0;
    for (const r of last5) entering += group.filter((a) => idx.byAth.get(a.id)?.has(r)).length;
    const perMatch = last5.length ? entering / last5.length : pos === 1 ? 1 : 2;
    const slots = pos === 1 ? 1 : Math.max(1, Math.round(perMatch * (pos === 3 ? 0.92 : 0.75)));

    ranked.forEach(({ a }, rank) => {
      const rows = idx.byAth.get(a.id);
      const played = (r: number | undefined) => (r != null && rows?.has(r) ? 1 : 0);
      const n = rounds.length;
      const l1 = played(rounds[n - 1]);
      const l2 = played(rounds[n - 2]);
      const l3 = played(rounds[n - 3]);
      const p5 = last5.length ? last5.filter((r) => rows?.has(r)).length / last5.length : 0;
      const firstSeen = rows ? Math.min(...[...rows.keys()].filter((r) => r < t), Infinity) : Infinity;
      const since = rounds.filter((r) => r >= firstSeen);
      const pAll = since.length ? since.filter((r) => rows?.has(r)).length / since.length : 0;
      let streak = 0;
      for (let i = n - 1; i >= 0 && rows?.has(rounds[i]); i--) streak++;
      let out_ = 0;
      for (let i = n - 1; i >= 0 && !rows?.has(rounds[i]); i--) out_++;
      // suspensão: vermelho no último jogo, ou terceiro amarelo (acumulado múltiplo de 3) no último jogo
      let susp = 0;
      const lastRow = n ? rows?.get(rounds[n - 1]) : undefined;
      if (lastRow) {
        if ((lastRow.scout.CV ?? 0) > 0) susp = 1;
        else if ((lastRow.scout.CA ?? 0) > 0) {
          let ca = 0;
          for (const [r, row] of rows!) if (r < t) ca += row.scout.CA ?? 0;
          if (ca > 0 && ca % 3 === 0) susp = 1;
        }
      }
      const recentPts = last5.map((r) => rows?.get(r)?.pontos).filter((x): x is number => x != null);
      const avgPts = recentPts.length ? recentPts.reduce((s, x) => s + x, 0) / recentPts.length : 0;
      out.set(a.id, [
        1,
        l1,
        l2,
        l3,
        p5,
        pAll,
        Math.min(streak, 6) / 6,
        Math.min(out_, 6) / 6,
        rank === 0 ? 1 : 0,
        Math.min(rank, 6) / 6,
        rank < slots ? 1 : 0,
        susp,
        pos === 1 ? 1 : 0,
        rows && [...rows.keys()].some((r) => r < t) ? 0 : 1,
        Math.max(-0.5, Math.min(1.5, avgPts / 8)),
      ]);
    });
  }
  return out;
}

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

/** Regressão logística com penalização L2 (Newton/IRLS). */
export function fitLogistic(X: number[][], y: number[], l2 = 1): number[] {
  const d = X[0]?.length ?? 0;
  let w = new Array(d).fill(0);
  for (let it = 0; it < 25; it++) {
    const g = new Array(d).fill(0);
    const H = Array.from({ length: d }, () => new Array(d).fill(0));
    for (let i = 0; i < X.length; i++) {
      const x = X[i];
      let z = 0;
      for (let j = 0; j < d; j++) z += w[j] * x[j];
      const p = sigmoid(z);
      const r = p * (1 - p);
      for (let j = 0; j < d; j++) {
        g[j] += (p - y[i]) * x[j];
        const rx = r * x[j];
        for (let k = j; k < d; k++) H[j][k] += rx * x[k];
      }
    }
    for (let j = 0; j < d; j++) {
      for (let k = 0; k < j; k++) H[j][k] = H[k][j];
      if (j > 0) {
        g[j] += l2 * w[j];
        H[j][j] += l2;
      } else H[j][j] += 1e-6;
    }
    const step = solve(H, g);
    if (!step) break;
    let maxStep = 0;
    w = w.map((wj, j) => {
      maxStep = Math.max(maxStep, Math.abs(step[j]));
      return wj - step[j];
    });
    if (maxStep < 1e-6) break;
  }
  return w;
}

function solve(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    if (Math.abs(M[piv][c]) < 1e-12) return null;
    [M[c], M[piv]] = [M[piv], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      if (f === 0) continue;
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

/**
 * Treina com as rodadas [R − janela, R − 1]. Elenco = atletas atuais de cada
 * clube (quem trocou de clube conta pelo clube atual).
 */
export function fitParticipation(
  athletes: Athlete[],
  history: PlayerRound[],
  R: number,
  statusHistory?: Record<number, Record<number, number>>,
  window = 12,
): ParticipationModel | null {
  const field = athletes.filter((a) => a.posicaoId !== 6);
  const X: number[][] = [];
  const y: number[] = [];
  let known = 0;
  const full = buildIndex(history.filter((h) => h.rodada < R));
  for (let t = Math.max(4, R - window); t < R; t++) {
    const idx = buildIndex(history.filter((h) => h.rodada < t));
    const feats = squadFeatures(field, idx, t);
    for (const a of field) {
      // só clubes que jogaram em t
      if (!full.clubRounds.get(a.clubeId)?.includes(t)) continue;
      const f = feats.get(a.id);
      if (!f) continue;
      const st = statusHistory?.[t]?.[a.id];
      // lesionado/suspenso é regra dura na previsão; não ensina o modelo
      if (st === STATUS.CONTUNDIDO || st === STATUS.SUSPENSO) continue;
      if (st != null) known++;
      X.push(withStatus(f, st));
      y.push(full.byAth.get(a.id)?.has(t) ? 1 : 0);
    }
  }
  if (X.length < 200 || !y.some((v) => v === 1) || !y.some((v) => v === 0)) return null;
  const statusAprendido = known >= 300;
  // sem histórico de status suficiente, as colunas de status ficam fora do ajuste (pesos 0)
  const Xfit = statusAprendido ? X : X.map((x) => x.slice(0, FEATURE_NAMES.length - 4));
  const w = fitLogistic(Xfit, y, 1);
  const weights = statusAprendido ? w : [...w, 0, 0, 0, 0];
  return { weights, n: X.length, base: y.reduce((s, v) => s + v, 0) / y.length, statusAprendido };
}

export function predictLogit(model: ParticipationModel, f: number[]) {
  let z = 0;
  for (let j = 0; j < f.length; j++) z += model.weights[j] * f[j];
  return z;
}

/** Deslocamentos (em log-chance) da informação do dia. */
export const STATUS_SHIFT: Record<number, number> = {
  [STATUS.PROVAVEL]: 0.35,
  [STATUS.DUVIDA]: -1.3,
  [STATUS.NULO]: -2.2,
};

/**
 * Combina o modelo com a informação do dia. Se o peso do status foi aprendido
 * (histórico de snapshots), ele já está no logit; senão usamos deslocamentos
 * fixos conservadores. statusId −1 = sem informação (recorte de backtest).
 */
export function finalPlayProbability(model: ParticipationModel, baseFeatures: number[], a: Athlete, override?: LineupOverride): number {
  if (override === "fora") return 0;
  if (a.statusId === STATUS.CONTUNDIDO || a.statusId === STATUS.SUSPENSO) return override === "titular" ? 0.97 : 0;
  const status = a.statusId === -1 ? undefined : a.statusId;
  let z = predictLogit(model, withStatus(baseFeatures, model.statusAprendido ? status : undefined));
  if (!model.statusAprendido && status != null) z += STATUS_SHIFT[status] ?? -1.5;
  const p = sigmoid(z);
  if (override === "titular") return Math.max(0.97, p);
  if (override === "reserva") return Math.min(p, 0.3);
  if (override === "duvida") return Math.min(0.55, Math.max(0.35, p * 0.6));
  return Math.max(0.005, Math.min(0.99, p));
}
