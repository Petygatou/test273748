import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { golsDoCartola, type AtuacaoGol } from "../src/engine/campinhos";

const { temporada } = vi.hoisted(() => {
  const temporada = {
    temporada: 2026,
    rodadaAtual: 3,
    source: "live",
    clubs: { 1: { id: 1, nome: "Flamengo", abreviacao: "FLA" }, 2: { id: 2, nome: "Palmeiras", abreviacao: "PAL" } },
    matches: [{ id: 10, rodada: 1, casaId: 1, foraId: 2, golsCasa: 2, golsFora: 1, valida: true }],
    history: [
      { atletaId: 100, rodada: 1, clubeId: 1, posicaoId: 5, pontos: 10, scout: { G: 1 } },
      { atletaId: 101, rodada: 1, clubeId: 1, posicaoId: 2, pontos: 10, scout: { G: 1, A: 0 } },
      { atletaId: 102, rodada: 1, clubeId: 1, posicaoId: 4, pontos: 5, scout: { A: 1 } },
      { atletaId: 200, rodada: 1, clubeId: 2, posicaoId: 5, pontos: 8, scout: { G: 1 } },
    ],
    funcoesAtaque: { 100: "PE" },
    funcoesMeio: { 102: "VOL" },
    lados: { 101: "D" },
  };
  return { temporada };
});

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "cfc-campauto-"));

describe("gols automáticos pelos scouts do Cartola", () => {
  const partidas = [
    { matchId: 10, rodada: 1, casaId: 1, foraId: 2, golsCasa: 2, golsFora: 1 },
    { matchId: 11, rodada: 2, casaId: 2, foraId: 1, golsCasa: null, golsFora: null }, // não jogado
  ];
  const at = (atletaId: number, rodada: number, clubeId: number, s: Partial<Pick<AtuacaoGol, "G" | "A" | "GC">>, pos: AtuacaoGol["pos"]): AtuacaoGol => ({
    atletaId,
    rodada,
    clubeId,
    G: 0,
    A: 0,
    GC: 0,
    ...s,
    pos,
  });

  it("um gol por G na posição do autor; assistência de outro atleta; gol contra sem posição; jogo sem placar fica de fora", () => {
    const gols = golsDoCartola(2026, partidas, [
      at(100, 1, 1, { G: 1, A: 1 }, "CENTRO"), // gol do 9 e assistência dele (vai para o gol do outro)
      at(101, 1, 1, { G: 1 }, "PONTE"),
      at(200, 1, 2, { A: 1 }, "MEI"), // assistência do time 2 sem gol do time 2 (o gol dele é contra)
      at(201, 1, 2, { GC: 1 }, "ZAG"), // gol contra do time 2 → gol do time 1? não: GC do 2 vira gol do 1
      at(300, 2, 1, { G: 3 }, "CENTRO"),
    ]);
    const t1 = gols.filter((g) => g.clubeId === 1);
    const t2 = gols.filter((g) => g.clubeId === 2);
    // time 1: gol do 100 (assistência não pode ser dele mesmo → nenhuma), gol do 101 com assistência do 100, gol contra do 201
    expect(t1.map((g) => [g.gol, g.assist, g.forma])).toEqual([
      ["CENTRO", null, "indefinida"],
      ["PONTE", "CENTRO", "indefinida"],
      [null, null, "contra"],
    ]);
    expect(t1.every((g) => g.auto && g.casa && g.adversarioId === 2 && g.rodada === 1)).toBe(true);
    expect(t2).toEqual([]);
    expect(gols.some((g) => g.matchId === 11)).toBe(false);
  });
});

describe("automático com correção à mão (servidor)", () => {
  vi.mock("../src/server/season", () => ({ loadSeason: async () => ({ data: temporada }) }));

  let db: typeof import("../src/server/db").db;
  let c: typeof import("../src/server/campinhos");
  beforeEach(async () => {
    db = (await import("../src/server/db")).db;
    c = await import("../src/server/campinhos");
    for (const col of Object.values(db)) col._reset();
  });

  it("posições pelas listas: ponta esquerda, lateral direito, volante", async () => {
    const b = await c.base();
    const fla = b.gols.filter((g) => g.clubeId === 1);
    expect(fla.map((g) => [g.gol, g.assist])).toEqual([
      ["PONTE", "VOL"],
      ["LATD", null],
    ]);
    expect(b.gols.filter((g) => g.clubeId === 2).map((g) => g.gol)).toEqual(["CENTRO"]);
    expect(b.corrigidos).toEqual([]);
  });

  it("lançar à mão copia os automáticos do time naquele jogo; apagar um automático também corrige; voltar ao automático desfaz", async () => {
    await c.lancar({ matchId: 10, clubeId: 1, forma: "cabeca", gol: "ZAG", assist: "MEI" }, "adm");
    let b = await c.base();
    expect(b.corrigidos).toEqual(["10:1"]);
    const fla = b.gols.filter((g) => g.clubeId === 1);
    expect(fla).toHaveLength(3); // 2 copiados + o novo
    expect(fla.every((g) => !g.auto)).toBe(true);
    // o Palmeiras segue automático
    expect(b.gols.filter((g) => g.clubeId === 2).every((g) => g.auto)).toBe(true);

    // apagar o gol automático do Palmeiras: corrige o Palmeiras sem esse gol
    const autoPal = b.gols.find((g) => g.clubeId === 2)!;
    await c.apagar(autoPal.id, "adm");
    b = await c.base();
    expect(b.corrigidos.sort()).toEqual(["10:1", "10:2"]);
    expect(b.gols.filter((g) => g.clubeId === 2)).toEqual([]);

    await c.voltarAoAutomatico(10, 1);
    b = await c.base();
    expect(b.corrigidos).toEqual(["10:2"]);
    expect(b.gols.filter((g) => g.clubeId === 1).every((g) => g.auto)).toBe(true);
    expect(b.gols.filter((g) => g.clubeId === 1)).toHaveLength(2);
  });

  it("apagar um de dois gols automáticos deixa o outro (copiado à mão) e o do adversário", async () => {
    const b0 = await c.base();
    const primeiro = b0.gols.find((g) => g.clubeId === 1)!;
    await c.apagar(primeiro.id, "adm");
    const b = await c.base();
    expect(b.gols.filter((g) => g.clubeId === 1).map((g) => [g.gol, g.auto])).toEqual([["LATD", undefined]]);
    expect(b.gols.filter((g) => g.clubeId === 2)).toHaveLength(1);
  });

  it("importar histórico manda no time/jogo: os automáticos dele saem", async () => {
    const r = await c.importar("1;FLA;PAL;penalti;CENTRO;", "adm", false);
    expect(r.importados).toBe(1);
    const b = await c.base();
    expect(b.gols.filter((g) => g.clubeId === 1).map((g) => [g.forma, g.auto])).toEqual([["penalti", undefined]]);
  });
});
