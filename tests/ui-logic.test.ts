import { beforeAll, describe, expect, it } from "vitest";
import { generateDemoSeason } from "../src/data/demoSeason";
import { buildRoundAnalysis } from "../src/engine/analysis";
import { FORMATIONS } from "../src/engine/rules";
import type { RoundAnalysis } from "../src/engine/types";
import { probableXI } from "../src/lib/provaveis";
import { matchScore, searchPlayers } from "../src/lib/search";

let a: RoundAnalysis;
beforeAll(() => {
  a = buildRoundAnalysis(generateDemoSeason(), { simulations: 300 });
});

describe("busca", () => {
  it("ignora acentos e prioriza prefixo", () => {
    expect(matchScore("São Paulo", "sao")).toBeGreaterThan(matchScore("Pássaro", "sao"));
    expect(matchScore("Gabriel Barbosa", "barb")).toBeGreaterThan(0);
    expect(matchScore("Gabriel Barbosa", "xyz")).toBe(0);
  });

  it("combina posição e clube", () => {
    const fla = Object.values(a.clubs).find((c) => c.abreviacao === "FLA")!;
    const res = searchPlayers(a.players, a.clubs, "ata fla", { limit: 50 });
    expect(res.length).toBeGreaterThan(0);
    for (const p of res) {
      expect(p.posicaoId).toBe(5);
      expect(p.clubeId).toBe(fla.id);
    }
  });

  it("encontra pelo começo do nome", () => {
    const alvo = a.players[10];
    const res = searchPlayers(a.players, a.clubs, alvo.apelido.slice(0, 4).toLowerCase(), { limit: 50 });
    expect(res.some((p) => p.atletaId === alvo.atletaId)).toBe(true);
  });
});

describe("prováveis", () => {
  it("monta 11 titulares num esquema válido, sem repetir atleta", () => {
    for (const f of a.fixtures) {
      for (const clube of [f.casaId, f.foraId]) {
        const xi = probableXI(a.players, clube);
        const all = [...xi.lines.gol, ...xi.lines.def, ...xi.lines.mei, ...xi.lines.ata];
        expect(all).toHaveLength(11);
        expect(new Set(all.map((p) => p.atletaId)).size).toBe(11);
        expect(all.every((p) => p.clubeId === clube)).toBe(true);
        const need = FORMATIONS[xi.formation];
        expect(xi.lines.ata).toHaveLength(need[5]);
        expect(xi.banco.every((p) => !all.includes(p))).toBe(true);
      }
    }
  });
});

describe("chance de jogar aprendida", () => {
  it("regressão logística recupera os pesos de um caso conhecido", async () => {
    const { fitLogistic } = await import("../src/engine/participation");
    const { Rng } = await import("../src/engine/math");
    const rng = new Rng(3);
    const X: number[][] = [];
    const y: number[] = [];
    for (let i = 0; i < 4000; i++) {
      const x = [1, rng.next() < 0.5 ? 1 : 0, rng.normal()];
      const z = -0.5 + 2 * x[1] - 1 * x[2];
      X.push(x);
      y.push(rng.next() < 1 / (1 + Math.exp(-z)) ? 1 : 0);
    }
    const w = fitLogistic(X, y, 0.01);
    expect(w[0]).toBeCloseTo(-0.5, 0);
    expect(w[1]).toBeCloseTo(2, 0);
    expect(w[2]).toBeCloseTo(-1, 0);
  });

  it("as prováveis acertam mais que repetir o último jogo e a chance é calibrada", async () => {
    const { runLineupBacktest } = await import("../src/engine/backtest");
    const acc = runLineupBacktest(generateDemoSeason(), { fromRound: 26, toRound: 30 });
    expect(acc.acerto).toBeGreaterThan(acc.acertoBaseline + 0.03);
    for (const b of acc.calibracao) if (b.n > 200) expect(Math.abs(b.previsto - b.observado)).toBeLessThan(0.08);
  });

  it("lesionado e suspenso não jogam; ajuste do ADM manda", async () => {
    const { finalPlayProbability } = await import("../src/engine/participation");
    const model = { weights: new Array(19).fill(0).map((_, i) => (i === 0 ? 2 : 0)), n: 1000, base: 0.6, statusAprendido: false };
    const f = new Array(15).fill(0).map((_, i) => (i === 0 ? 1 : 0));
    const base = { id: 1, apelido: "x", clubeId: 1, posicaoId: 4 as const, preco: 5, variacao: 0, media: 3, jogos: 10, pontosUltima: 0 };
    expect(finalPlayProbability(model, f, { ...base, statusId: 5 })).toBe(0);
    expect(finalPlayProbability(model, f, { ...base, statusId: 3 })).toBe(0);
    expect(finalPlayProbability(model, f, { ...base, statusId: 7 }, "fora")).toBe(0);
    expect(finalPlayProbability(model, f, { ...base, statusId: 6 }, "titular")).toBeGreaterThanOrEqual(0.97);
    expect(finalPlayProbability(model, f, { ...base, statusId: 7 })).toBeGreaterThan(finalPlayProbability(model, f, { ...base, statusId: 2 }));
  });
});

describe("token do Cartola colado pela pessoa", async () => {
  const { extrairTokenCartola } = await import("../src/lib/cartolaToken");
  const tk = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.abcDEF123_-xyz";
  it("acha no Copy as cURL inteiro", () => {
    const curl = `curl 'https://api.cartola.globo.com/auth/time' \\\n  -H 'accept: application/json' \\\n  -H 'authorization: Bearer ${tk}' \\\n  -H 'origin: https://cartola.globo.com'`;
    expect(extrairTokenCartola(curl)).toBe(tk);
  });
  it("acha no Copy as fetch e no X-GLB-Token", () => {
    expect(extrairTokenCartola(`fetch("https://api.cartola.globo.com/auth/time", { "headers": { "authorization": "Bearer ${tk}" } });`)).toBe(tk);
    expect(extrairTokenCartola(`x-glb-token: ${tk}`)).toBe(tk);
  });
  it("aceita Bearer ou só o token, e recusa texto sem token", () => {
    expect(extrairTokenCartola(`Bearer ${tk}`)).toBe(tk);
    expect(extrairTokenCartola(`  ${tk}  `)).toBe(tk);
    expect(extrairTokenCartola("curl 'https://api.cartola.globo.com/auth/time' -H 'accept: */*'")).toBeNull();
    expect(extrairTokenCartola("oi")).toBeNull();
  });
});
