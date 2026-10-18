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
