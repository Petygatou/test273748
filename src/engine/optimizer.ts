/**
 * Montador de tropas — otimização EXATA.
 *
 * Problema: escolher 11 atletas + técnico respeitando o esquema tático e o
 * orçamento, maximizando um objetivo que inclui o bônus do capitão (1,5×).
 *
 * Em vez de heurísticas (2-opt, guloso), usamos programação dinâmica sobre
 * fronteiras de Pareto (custo × valor) por posição, com uma flag "capitão já
 * escolhido". As fronteiras das posições são combinadas e a última combinação
 * usa busca binária no orçamento. O resultado é o ótimo global (com precisão
 * de centavos de cartoleta), em milissegundos.
 */
import { CAPTAIN_MULTIPLIER, FORMATIONS, FORMATION_KEYS, POSITIONS, type FormationKey, type PositionId } from "./rules";
import type {
  BenchPick,
  CaptainOption,
  OptimizeRequest,
  OptimizedLineup,
  PlayerProjection,
  ProfileKey,
  RoundAnalysis,
} from "./types";

/** Número no padrão brasileiro (vírgula decimal) para os textos explicativos. */
const br = (x: number, d = 2) => x.toFixed(d).replace(".", ",");

interface Candidate {
  id: number;
  pos: PositionId;
  cost: number; // centavos
  value: number;
  capBonus: number; // valor extra se for capitão
}

interface Entry {
  cost: number;
  value: number;
  picks: number[];
  cap: number | null;
}

/** Valor de um atleta para cada perfil (e métrica para capitão). */
export function profileValue(p: PlayerProjection, profile: ProfileKey): { value: number; capMetric: number } {
  const pj = p.pJogar;
  const xpj = p.xPJogando;
  switch (profile) {
    case "mitada": {
      // prioriza teto: média + metade do caminho até o P85
      const v = pj * (xpj + 0.5 * Math.max(0, p.teto - xpj));
      const cap = pj * (xpj + 0.6 * Math.max(0, p.teto - xpj));
      return { value: v, capMetric: cap };
    }
    case "equilibrada": {
      // pune o risco de queda (distância até o piso) e a incerteza de escalação
      const v = pj * (xpj - 0.25 * Math.max(0, xpj - p.piso)) * (0.85 + 0.15 * pj);
      return { value: v, capMetric: pj * xpj };
    }
    case "valorizacao": {
      // patrimônio primeiro; pontos como desempate
      const v = p.valorizacaoEsperada + 0.12 * p.xP;
      return { value: v, capMetric: 0.12 * p.xP };
    }
  }
}

function paretoPrune(list: Entry[], budget: number): Entry[] {
  const sorted = list.filter((e) => e.cost <= budget).sort((a, b) => a.cost - b.cost || b.value - a.value);
  const out: Entry[] = [];
  let best = -Infinity;
  for (const e of sorted) {
    if (e.value > best + 1e-9) {
      out.push(e);
      best = e.value;
    }
  }
  return out;
}

/** Remove atletas que nunca podem estar no ótimo (dominados por ≥ k outros mais baratos e melhores). */
function prunePool(pool: Candidate[], k: number): Candidate[] {
  if (k <= 0) return [];
  return pool.filter((c) => {
    let dominators = 0;
    for (const o of pool) {
      if (o === c) continue;
      if (o.cost <= c.cost && o.value >= c.value && o.value + o.capBonus >= c.value + c.capBonus) {
        if (o.cost < c.cost || o.value > c.value || o.capBonus > c.capBonus || o.id < c.id) dominators++;
        if (dominators >= k) return false;
      }
    }
    return true;
  });
}

/** Fronteira (custo × valor) para escolher exatamente k atletas de uma posição. */
function positionFrontier(
  forced: Candidate[],
  pool: Candidate[],
  k: number,
  budget: number,
  allowCaptain: boolean,
): [Entry[], Entry[]] {
  // states[j][c]
  let states: Entry[][][] = Array.from({ length: k + 1 }, () => [[], []]);
  states[0][0] = [{ cost: 0, value: 0, picks: [], cap: null }];
  const step = (cand: Candidate, mustPick: boolean) => {
    const next: Entry[][][] = mustPick
      ? Array.from({ length: k + 1 }, () => [[], []])
      : states.map((row) => row.map((l) => [...l]));
    for (let j = k - 1; j >= 0; j--) {
      for (let c = 0; c <= 1; c++) {
        for (const e of states[j][c]) {
          const cost = e.cost + cand.cost;
          if (cost > budget) continue;
          next[j + 1][c].push({ cost, value: e.value + cand.value, picks: [...e.picks, cand.id], cap: e.cap });
          if (c === 0 && allowCaptain && cand.capBonus > 0) {
            next[j + 1][1].push({ cost, value: e.value + cand.value + cand.capBonus, picks: [...e.picks, cand.id], cap: cand.id });
          }
        }
      }
    }
    for (let j = 0; j <= k; j++) for (let c = 0; c <= 1; c++) next[j][c] = paretoPrune(next[j][c], budget);
    states = next;
  };
  for (const f of forced) step(f, true);
  for (const p of pool) step(p, false);
  return [states[k][0], states[k][1]];
}

function mergeFrontiers(a: [Entry[], Entry[]], b: [Entry[], Entry[]], budget: number): [Entry[], Entry[]] {
  const out: [Entry[], Entry[]] = [[], []];
  for (let ca = 0; ca <= 1; ca++) {
    for (let cb = 0; cb <= 1 - ca; cb++) {
      for (const x of a[ca]) {
        for (const y of b[cb]) {
          const cost = x.cost + y.cost;
          if (cost > budget) break; // b ordenado por custo
          out[ca + cb].push({ cost, value: x.value + y.value, picks: [...x.picks, ...y.picks], cap: x.cap ?? y.cap });
        }
      }
    }
  }
  return [paretoPrune(out[0], budget), paretoPrune(out[1], budget)];
}

/** Melhor combinação final via busca binária (fronteira ordenada por custo tem valor crescente). */
function bestFinal(a: [Entry[], Entry[]], b: [Entry[], Entry[]], budget: number, needCaptain: boolean): Entry | null {
  let best: Entry | null = null;
  for (let ca = 0; ca <= 1; ca++) {
    for (let cb = 0; cb <= 1 - ca; cb++) {
      if (needCaptain && ca + cb !== 1) continue;
      const B = b[cb];
      if (!B.length) continue;
      for (const x of a[ca]) {
        const room = budget - x.cost;
        let lo = 0;
        let hi = B.length - 1;
        let idx = -1;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1;
          if (B[mid].cost <= room) {
            idx = mid;
            lo = mid + 1;
          } else hi = mid - 1;
        }
        if (idx < 0) continue;
        const y = B[idx];
        const v = x.value + y.value;
        if (!best || v > best.value + 1e-9) best = { cost: x.cost + y.cost, value: v, picks: [...x.picks, ...y.picks], cap: x.cap ?? y.cap };
      }
    }
  }
  return best;
}

export interface OptimizeResult {
  lineup: OptimizedLineup | null;
  porEsquema: Array<{ formation: FormationKey; objetivo: number; xP: number }>;
  erro?: string;
}

export function optimizeLineup(analysis: RoundAnalysis, req: OptimizeRequest): OptimizeResult {
  const budget = Math.round(req.budget * 100);
  const banned = new Set(req.banned ?? []);
  const fixed = new Set(req.fixed ?? []);
  const minP = req.minPJogar ?? 0.35;
  const byId = new Map(analysis.players.map((p) => [p.atletaId, p] as const));

  const cands = new Map<number, Candidate>();
  for (const p of analysis.players) {
    if (banned.has(p.atletaId) && !fixed.has(p.atletaId)) continue;
    if (!fixed.has(p.atletaId) && (p.matchId == null || p.pJogar < minP)) continue;
    const { value, capMetric } = profileValue(p, req.profile);
    const canCap = p.posicaoId !== 6 && (req.captainId == null || req.captainId === p.atletaId);
    cands.set(p.atletaId, {
      id: p.atletaId,
      pos: p.posicaoId,
      cost: Math.round(p.preco * 100),
      value,
      capBonus: canCap ? (CAPTAIN_MULTIPLIER - 1) * capMetric : 0,
    });
  }

  const formations = req.formation === "auto" ? FORMATION_KEYS : [req.formation];
  const porEsquema: OptimizeResult["porEsquema"] = [];
  let bestEntry: Entry | null = null;
  let bestFormation: FormationKey | null = null;
  let erro: string | undefined;

  for (const f of formations) {
    const counts = FORMATIONS[f];
    const frontiers: Array<[Entry[], Entry[]]> = [];
    let ok = true;
    for (const pos of [1, 6, 3, 2, 5, 4] as PositionId[]) {
      const k = counts[pos];
      const forced = [...fixed].map((id) => cands.get(id)).filter((c): c is Candidate => !!c && c.pos === pos);
      if (forced.length > k) {
        ok = false;
        erro = `Você fixou ${forced.length} ${POSITIONS[pos].plural.toLowerCase()}, mas o ${f} usa ${k}.`;
        break;
      }
      const pool = prunePool(
        [...cands.values()].filter((c) => c.pos === pos && !fixed.has(c.id)),
        k - forced.length,
      ).sort((a, b) => a.cost - b.cost);
      const fr = positionFrontier(forced, pool, k, budget, true);
      if (!fr[0].length && !fr[1].length) {
        ok = false;
        erro = `Sem atletas suficientes para ${POSITIONS[pos].plural.toLowerCase()} (${k}).`;
        break;
      }
      frontiers.push(fr);
    }
    if (!ok) continue;
    let acc = frontiers[0];
    for (let i = 1; i < frontiers.length - 1; i++) acc = mergeFrontiers(acc, frontiers[i], budget);
    const entry = bestFinal(acc, frontiers[frontiers.length - 1], budget, true);
    if (!entry) {
      erro = "Orçamento insuficiente para montar o time com essas travas.";
      continue;
    }
    const xP = entry.picks.reduce((s, id) => s + (byId.get(id)?.xP ?? 0), 0);
    porEsquema.push({ formation: f, objetivo: entry.value, xP });
    if (!bestEntry || entry.value > bestEntry.value) {
      bestEntry = entry;
      bestFormation = f;
    }
  }

  if (!bestEntry || !bestFormation) return { lineup: null, porEsquema, erro: erro ?? "Não foi possível montar a tropa." };
  porEsquema.sort((a, b) => b.objetivo - a.objetivo);
  return { lineup: describeLineup(analysis, bestEntry, bestFormation, req, porEsquema), porEsquema };
}

function describeLineup(
  analysis: RoundAnalysis,
  entry: Entry,
  formation: FormationKey,
  req: OptimizeRequest,
  porEsquema: OptimizeResult["porEsquema"],
): OptimizedLineup {
  const byId = new Map(analysis.players.map((p) => [p.atletaId, p] as const));
  const players = entry.picks.map((id) => byId.get(id)!).sort((a, b) => a.posicaoId - b.posicaoId || b.xP - a.xP);
  const captainId = entry.cap ?? players.filter((p) => p.posicaoId !== 6).sort((a, b) => b.xP - a.xP)[0].atletaId;
  const cap = byId.get(captainId)!;
  const custo = players.reduce((s, p) => s + p.preco, 0);
  const xP = players.reduce((s, p) => s + p.xP, 0);
  const valorizacao = players.reduce((s, p) => s + p.valorizacaoEsperada, 0);

  const capitaes = captainOptions(players, analysis, req.profile);
  const banco = pickBench(analysis, players, new Set(req.banned ?? []));

  const explicacao: string[] = [];
  const perfilNome = { mitada: "Tropa da Mitada", equilibrada: "Tropa Equilibrada", valorizacao: "Tropa de Valorização" }[req.profile];
  explicacao.push(`${perfilNome}: solução ótima exata para C$ ${br(req.budget)} (gastou C$ ${br(custo)}).`);
  if (porEsquema.length > 1) {
    const second = porEsquema[1];
    explicacao.push(
      `${formation} venceu os outros esquemas; o segundo melhor (${second.formation}) ficaria ${br(porEsquema[0].objetivo - second.objetivo)} pts de objetivo atrás.`,
    );
  }
  const clubCount = new Map<number, number>();
  for (const p of players) if (p.posicaoId !== 6) clubCount.set(p.clubeId, (clubCount.get(p.clubeId) ?? 0) + 1);
  const stacks = [...clubCount.entries()].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]);
  for (const [club, n] of stacks) {
    const fx = analysis.fixtures.find((f) => f.casaId === club || f.foraId === club);
    const lam = fx ? (fx.casaId === club ? fx.lambdaCasa : fx.lambdaFora) : 0;
    const sg = fx ? (fx.casaId === club ? fx.sgCasa : fx.sgFora) : 0;
    explicacao.push(
      `${n} atletas do ${analysis.clubs[club]?.nome ?? club}: ${br(lam)} gols esperados e ${(sg * 100).toFixed(0)}% de chance de SG — resultados correlacionados (sobe e desce junto).`,
    );
  }
  explicacao.push(`Capitão: ${cap.apelido} — ${capitaes[0]?.justificativa ?? ""}`);
  const riscos = players.filter((p) => p.pJogar < 0.7);
  if (riscos.length) explicacao.push(`Atenção à escalação de: ${riscos.map((p) => `${p.apelido} (${Math.round(p.pJogar * 100)}% de jogar)`).join(", ")}.`);

  return {
    formation,
    profile: req.profile,
    slots: players.map((p) => ({ atletaId: p.atletaId, posicaoId: p.posicaoId, preco: p.preco, valor: profileValue(p, req.profile).value, xP: p.xP })),
    captainId,
    custo: Math.round(custo * 100) / 100,
    sobra: Math.round((req.budget - custo) * 100) / 100,
    xP: Math.round(xP * 100) / 100,
    xPComCapitao: Math.round((xP + (CAPTAIN_MULTIPLIER - 1) * cap.xP) * 100) / 100,
    objetivo: Math.round(entry.value * 100) / 100,
    valorizacaoEsperada: Math.round(valorizacao * 100) / 100,
    capitaes,
    banco,
    explicacao,
  };
}

function captainOptions(players: PlayerProjection[], analysis: RoundAnalysis, profile: ProfileKey): CaptainOption[] {
  const field = players.filter((p) => p.posicaoId !== 6);
  const scored = field
    .map((p) => ({ p, m: profileValue(p, profile === "valorizacao" ? "equilibrada" : profile).capMetric }))
    .sort((a, b) => b.m - a.m)
    .slice(0, 5);
  const top = scored[0]?.m ?? 0;
  return scored.map(({ p, m }, i) => {
    const fx = analysis.fixtures.find((f) => f.matchId === p.matchId);
    const parts: string[] = [];
    parts.push(`xP ${br(p.xP, 1)} e ${Math.round(p.pAcima12 * 100)}% de chance de 12+ pontos (dado que joga)`);
    if (fx) {
      const lam = p.mando === "casa" ? fx.lambdaCasa : fx.lambdaFora;
      parts.push(`${p.mando === "casa" ? "em casa" : "fora"} contra ${analysis.clubs[p.adversarioId ?? 0]?.nome ?? "?"} (${br(lam)} gols esperados do time)`);
    }
    if (p.pJogar < 0.8) parts.push(`risco de não jogar: ${Math.round((1 - p.pJogar) * 100)}%`);
    if (p.posse != null) parts.push(p.posse > 30 ? `capitão popular (${br(p.posse, 1)}% escalam)` : `diferencial (${br(p.posse, 1)}% escalam)`);
    if (i > 0) parts.push(`${br((top - m) * (CAPTAIN_MULTIPLIER - 1))} pts esperados a menos que a 1ª opção`);
    return {
      atletaId: p.atletaId,
      xP: p.xP,
      teto: p.teto,
      pAcima12: p.pAcima12,
      ganhoEsperado: Math.round((CAPTAIN_MULTIPLIER - 1) * p.xP * 100) / 100,
      posse: p.posse,
      justificativa: parts.join("; ") + ".",
    };
  });
}

function normPdf(x: number) {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}
function normCdf(x: number) {
  // Abramowitz-Stegun
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}
/** E[max(0, X)] para X ~ N(m, s²). */
function expectedPositive(m: number, s: number) {
  if (s <= 1e-6) return Math.max(0, m);
  const z = m / s;
  return m * normCdf(z) + s * normPdf(z);
}

/**
 * Banco de reservas: um por posição, com preço ≤ titular mais barato da posição
 * (regra do Cartola; reservas não consomem cartoletas). Escolhe quem mais
 * adiciona em pontos esperados cobrindo ausências, e designa o reserva de luxo
 * pelo maior ganho esperado E[max(0, reserva − pior titular)].
 */
export function pickBench(analysis: RoundAnalysis, titulares: PlayerProjection[], banned: Set<number>): BenchPick[] {
  const inLineup = new Set(titulares.map((p) => p.atletaId));
  const picks: BenchPick[] = [];
  for (const pos of [1, 2, 3, 4, 5] as PositionId[]) {
    const tit = titulares.filter((p) => p.posicaoId === pos);
    if (!tit.length) continue;
    const maxPrice = Math.min(...tit.map((p) => p.preco));
    const pAllPlay = tit.reduce((s, p) => s * p.pJogar, 1);
    const pAusencia = 1 - pAllPlay;
    let best: BenchPick | null = null;
    for (const r of analysis.players) {
      if (r.posicaoId !== pos || inLineup.has(r.atletaId) || banned.has(r.atletaId)) continue;
      if (r.preco > maxPrice + 1e-9 || r.matchId == null || r.pJogar < 0.3) continue;
      const cobertura = pAusencia * r.pJogar * r.xPJogando;
      // ganho do luxo: só quando todos os titulares jogam
      const worst = [...tit].sort((a, b) => a.xPJogando - b.xPJogando)[0];
      const m = r.xPJogando - worst.xPJogando;
      const s = Math.sqrt(r.sd * r.sd + worst.sd * worst.sd);
      const luxo = pAllPlay * r.pJogar * expectedPositive(m, s);
      const score = cobertura + 0.35 * luxo;
      if (!best || score > best.ganhoCobertura + 0.35 * (best.ganhoLuxo ?? 0)) {
        best = {
          posicaoId: pos,
          atletaId: r.atletaId,
          preco: r.preco,
          xP: r.xP,
          pJogar: r.pJogar,
          ganhoCobertura: Math.round(cobertura * 100) / 100,
          ganhoLuxo: Math.round(luxo * 100) / 100,
        };
      }
    }
    if (best) picks.push(best);
  }
  const luxo = [...picks].sort((a, b) => (b.ganhoLuxo ?? 0) - (a.ganhoLuxo ?? 0))[0];
  if (luxo) luxo.luxo = true;
  return picks;
}

/**
 * Remonta o resumo de uma tropa editada manualmente (troca no campinho),
 * mantendo as mesmas métricas, banco e justificativas da tropa otimizada.
 */
export function lineupFromIds(
  analysis: RoundAnalysis,
  ids: number[],
  formation: FormationKey,
  req: OptimizeRequest,
  captainId?: number | null,
): OptimizedLineup {
  const byId = new Map(analysis.players.map((p) => [p.atletaId, p] as const));
  const players = ids.map((id) => byId.get(id)).filter((p): p is PlayerProjection => !!p);
  let value = 0;
  for (const p of players) value += profileValue(p, req.profile).value;
  const cap =
    captainId != null && ids.includes(captainId) && byId.get(captainId)?.posicaoId !== 6
      ? captainId
      : players.filter((p) => p.posicaoId !== 6).sort((a, b) => profileValue(b, req.profile).capMetric - profileValue(a, req.profile).capMetric)[0]?.atletaId ?? null;
  if (cap != null) value += (CAPTAIN_MULTIPLIER - 1) * profileValue(byId.get(cap)!, req.profile).capMetric;
  const entry: Entry = { cost: players.reduce((s, p) => s + Math.round(p.preco * 100), 0), value, picks: ids, cap };
  return describeLineup(analysis, entry, formation, req, []);
}
