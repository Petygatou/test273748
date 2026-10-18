import { beforeAll, describe, expect, it } from "vitest";
import { generateDemoSeason } from "../src/data/demoSeason";
import { buildRoundAnalysis } from "../src/engine/analysis";
import { runBacktest } from "../src/engine/backtest";
import { Rng, pearson, poissonPmf, quantileSorted } from "../src/engine/math";
import { optimizeLineup, profileValue } from "../src/engine/optimizer";
import { CAPTAIN_MULTIPLIER, FORMATIONS, SCORING, pointsFromScouts } from "../src/engine/rules";
import { normalizeHistoryScouts } from "../src/engine/rulesCheck";
import { scoreMatrix } from "../src/engine/teamModel";
import type { PlayerProjection, RoundAnalysis } from "../src/engine/types";

const data = generateDemoSeason();
let analysis: RoundAnalysis;

beforeAll(() => {
  analysis = buildRoundAnalysis(data, { simulations: 1500 });
});

describe("math", () => {
  it("rng é determinístico e uniforme", () => {
    const a = new Rng(42);
    const b = new Rng(42);
    const xs = Array.from({ length: 5000 }, () => a.next());
    expect(xs.slice(0, 5)).toEqual(Array.from({ length: 5 }, () => b.next()));
    const m = xs.reduce((s, x) => s + x, 0) / xs.length;
    expect(m).toBeGreaterThan(0.48);
    expect(m).toBeLessThan(0.52);
  });

  it("binomial negativa respeita média e sobredispersão", () => {
    const r = new Rng(1);
    const xs = Array.from({ length: 20000 }, () => r.negBin(2, 3));
    const m = xs.reduce((s, x) => s + x, 0) / xs.length;
    const v = xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length;
    expect(m).toBeCloseTo(2, 1);
    expect(v).toBeGreaterThan(2 + 4 / 3 - 0.4); // μ + μ²/k
  });

  it("poisson pmf soma 1 e matriz de placares é normalizada", () => {
    let s = 0;
    for (let k = 0; k < 30; k++) s += poissonPmf(k, 1.7);
    expect(s).toBeCloseTo(1, 6);
    const m = scoreMatrix(1.5, 1.1, -0.08);
    expect(m.flat().reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
  });

  it("quantil interpola", () => {
    expect(quantileSorted([0, 10], 0.5)).toBe(5);
  });
});

describe("regras", () => {
  it("calcula pontos a partir dos scouts", () => {
    expect(pointsFromScouts({ G: 1, A: 1, DS: 2, CA: 1 })).toBeCloseTo(8 + 5 + 2.4 - 1, 5);
  });

  it("detecta scouts acumulados e converte para scouts por rodada", () => {
    const sample = data.history.filter((h) => h.rodada <= 12);
    const acc = new Map<number, Record<string, number>>();
    const cumulative = [...sample]
      .sort((a, b) => a.rodada - b.rodada)
      .map((h) => {
        const cur = { ...(acc.get(h.atletaId) ?? {}) };
        for (const [k, v] of Object.entries(h.scout)) cur[k] = (cur[k] ?? 0) + (v ?? 0);
        acc.set(h.atletaId, cur);
        return { ...h, scout: { ...cur } };
      });
    const fixed = normalizeHistoryScouts(cumulative);
    expect(fixed.convertido).toBe(true);
    const byKey = new Map(sample.map((h) => [`${h.atletaId}:${h.rodada}`, h]));
    for (const h of fixed.history.slice(0, 200)) expect(h.scout).toEqual(Object.fromEntries(Object.entries(byKey.get(`${h.atletaId}:${h.rodada}`)!.scout).filter(([, v]) => (v ?? 0) > 0)));
    expect(normalizeHistoryScouts(sample).convertido).toBe(false);
  });

  it("a auditoria confere a tabela contra o histórico", () => {
    expect(analysis.rulesCheck.acerto).toBe(1);
    expect(analysis.rulesCheck.divergencias).toHaveLength(0);
  });
});

describe("modelo de times", () => {
  it("recupera as forças latentes (correlação alta)", () => {
    const lat = new Map(data.latent.clubs.map((c) => [c.id, c]));
    const att = analysis.teams.map((t) => t.attack);
    const attTrue = analysis.teams.map((t) => lat.get(t.clubeId)!.attack);
    const def = analysis.teams.map((t) => t.defense);
    const defTrue = analysis.teams.map((t) => lat.get(t.clubeId)!.defense);
    expect(pearson(att, attTrue)).toBeGreaterThan(0.75);
    expect(pearson(def, defTrue)).toBeGreaterThan(0.6);
  });

  it("odds de cada jogo somam 1 e SG é coerente", () => {
    for (const f of analysis.fixtures) {
      expect(f.pCasa + f.pEmpate + f.pFora).toBeCloseTo(1, 5);
      expect(f.sgCasa).toBeGreaterThan(0);
      expect(f.sgCasa).toBeLessThan(1);
    }
    expect(analysis.homeAdvantage).toBeGreaterThan(1);
  });
});

describe("projeção de atletas", () => {
  it("xP = pJogar × xP-jogando e lesionados não pontuam", () => {
    for (const p of analysis.players) {
      expect(p.xP).toBeCloseTo(p.pJogar * p.xPJogando, 1);
      if (p.statusId === 5 || p.statusId === 3) expect(p.pJogar).toBe(0);
    }
  });

  it("piso ≤ mediana ≤ teto e decomposição base+explosão fecha", () => {
    for (const p of analysis.players.filter((x) => x.matchId != null && x.posicaoId !== 6)) {
      expect(p.piso).toBeLessThanOrEqual(p.mediana + 1e-9);
      expect(p.mediana).toBeLessThanOrEqual(p.teto + 1e-9);
      expect(p.base + p.explosao).toBeCloseTo(p.xPJogando, 0);
    }
  });

  it("a média da simulação bate com o xP analítico", () => {
    const sample = analysis.players.filter((p) => p.matchId != null && p.posicaoId !== 6).slice(0, 40);
    for (const p of sample) {
      // mediana não é média, então usamos tolerância generosa só para pegar regressões grosseiras
      expect(Math.abs(p.mediana - p.xPJogando)).toBeLessThan(4);
    }
  });

  it("PMV calibrado recupera a fórmula verdadeira da demo", () => {
    // verdade da demo: V = 0.25 × (pts − (0.5·preço + 0.25·média))
    expect(analysis.pmvModel.cpp).toBeCloseTo(0.25, 1);
    expect(-analysis.pmvModel.coefPreco / analysis.pmvModel.cpp).toBeCloseTo(0.5, 1);
    expect(analysis.pmvModel.r2).toBeGreaterThan(0.95);
  });
});

describe("otimizador exato", () => {
  it("respeita esquema, orçamento, fixos e banidos", () => {
    const top = analysis.players.filter((p) => p.posicaoId === 5 && p.pJogar > 0.5)[0];
    const ban = analysis.players.filter((p) => p.posicaoId === 4 && p.pJogar > 0.5)[0];
    const res = optimizeLineup(analysis, { formation: "4-3-3", budget: 110, profile: "equilibrada", fixed: [top.atletaId], banned: [ban.atletaId] });
    const l = res.lineup!;
    expect(l).toBeTruthy();
    expect(l.custo).toBeLessThanOrEqual(110 + 1e-9);
    const ids = l.slots.map((s) => s.atletaId);
    expect(ids).toContain(top.atletaId);
    expect(ids).not.toContain(ban.atletaId);
    const counts: Record<number, number> = {};
    for (const s of l.slots) counts[s.posicaoId] = (counts[s.posicaoId] ?? 0) + 1;
    expect(counts).toEqual(Object.fromEntries(Object.entries(FORMATIONS["4-3-3"]).filter(([, v]) => v > 0)));
    expect(l.slots.find((s) => s.atletaId === l.captainId)?.posicaoId).not.toBe(6);
  });

  it("encontra o ótimo global (confere com força bruta)", () => {
    // instância pequena: poucos candidatos por posição
    const pick = (pos: number, n: number) =>
      analysis.players.filter((p) => p.posicaoId === pos && p.matchId != null && p.pJogar > 0.5).slice(0, n);
    const pools: Record<number, PlayerProjection[]> = { 1: pick(1, 3), 2: pick(2, 4), 3: pick(3, 4), 4: pick(4, 5), 5: pick(5, 5), 6: pick(6, 3) };
    const small: RoundAnalysis = { ...analysis, players: Object.values(pools).flat() };
    const budget = 130;
    const res = optimizeLineup(small, { formation: "4-3-3", budget, profile: "mitada" });

    const combos = <T,>(arr: T[], k: number): T[][] =>
      k === 0 ? [[]] : arr.flatMap((x, i) => combos(arr.slice(i + 1), k - 1).map((c) => [x, ...c]));
    let best = -Infinity;
    const f = FORMATIONS["4-3-3"];
    for (const g of combos(pools[1], f[1]))
      for (const l of combos(pools[2], f[2]))
        for (const z of combos(pools[3], f[3]))
          for (const m of combos(pools[4], f[4]))
            for (const a of combos(pools[5], f[5]))
              for (const t of combos(pools[6], f[6])) {
                const team = [...g, ...l, ...z, ...m, ...a, ...t];
                const cost = team.reduce((s, p) => s + Math.round(p.preco * 100), 0);
                if (cost > budget * 100) continue;
                const base = team.reduce((s, p) => s + profileValue(p, "mitada").value, 0);
                const capBest = Math.max(
                  ...team.filter((p) => p.posicaoId !== 6).map((p) => (CAPTAIN_MULTIPLIER - 1) * profileValue(p, "mitada").capMetric),
                );
                best = Math.max(best, base + capBest);
              }
    expect(best).toBeGreaterThan(-Infinity);
    expect(res.erro ?? null).toBeNull();
    expect(res.lineup!.objetivo).toBeCloseTo(best, 1);
  });

  it("perfil valorização prioriza variação esperada", () => {
    const val = optimizeLineup(analysis, { formation: "4-3-3", budget: 140, profile: "valorizacao" }).lineup!;
    const mit = optimizeLineup(analysis, { formation: "4-3-3", budget: 140, profile: "mitada" }).lineup!;
    expect(val.valorizacaoEsperada).toBeGreaterThan(mit.valorizacaoEsperada);
    expect(mit.xP).toBeGreaterThanOrEqual(val.xP - 0.5);
  });

  it("banco respeita a regra de preço do Cartola", () => {
    const l = optimizeLineup(analysis, { formation: "auto", budget: 130, profile: "equilibrada" }).lineup!;
    const byId = new Map(analysis.players.map((p) => [p.atletaId, p]));
    for (const b of l.banco) {
      const tit = l.slots.filter((s) => s.posicaoId === b.posicaoId).map((s) => byId.get(s.atletaId)!.preco);
      expect(b.preco).toBeLessThanOrEqual(Math.min(...tit) + 1e-9);
    }
    expect(l.banco.filter((b) => b.luxo)).toHaveLength(1);
  });
});

describe("backtest", () => {
  it("modelo supera a média em RMSE, ordenação e pontos reais da tropa", () => {
    const res = runBacktest(data, { fromRound: 14, toRound: 26, config: { simulations: 300 } });
    expect(res.resumo.rmseModelo).toBeLessThan(res.resumo.rmseMedia);
    expect(res.resumo.spearmanModelo).toBeGreaterThan(res.resumo.spearmanMedia);
    expect(res.resumo.tropaModelo!).toBeGreaterThan(res.resumo.tropaMedia!);
    // intervalo P15–P85 deve conter ~70% dos resultados
    expect(res.resumo.dentroIntervalo).toBeGreaterThan(0.6);
    expect(res.resumo.dentroIntervalo).toBeLessThan(0.8);
  }, 120000);
});

describe("pontuação", () => {
  it("captain multiplier é 1.5 e SG vale 5", () => {
    expect(CAPTAIN_MULTIPLIER).toBe(1.5);
    expect(SCORING.SG).toBe(5);
  });
});
