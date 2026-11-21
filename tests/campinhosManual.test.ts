import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "cfc-camp-"));

const clube = (id: number, nome: string, abreviacao: string) => ({ id, nome, abreviacao });
const temporada = {
  temporada: 2026,
  rodadaAtual: 5,
  source: "live",
  clubs: { 1: clube(1, "Flamengo", "FLA"), 2: clube(2, "Palmeiras", "PAL"), 3: clube(3, "Santos", "SAN") },
  matches: [{ id: 500, rodada: 1, casaId: 1, foraId: 2, golsCasa: 2, golsFora: 1, valida: true }],
};
vi.mock("../src/server/season", () => ({ loadSeason: async () => ({ data: temporada }) }));

const { db } = await import("../src/server/db");
const c = await import("../src/server/campinhos");

beforeEach(() => {
  for (const col of Object.values(db)) col._reset();
});

describe("partidas manuais no Campinhos", () => {
  it("cria a partida, entra na lista junto com as do Cartola e aceita gols", async () => {
    const p = await c.criarPartida({ rodada: 2, casaId: 3, foraId: 1, golsCasa: 1, golsFora: 0 }, "adm");
    expect(p).toMatchObject({ matchId: -1, rodada: 2, manual: true });
    const b = await c.base();
    expect(b.partidas.map((x) => x.matchId)).toEqual([500, -1]);
    const g = await c.lancar({ matchId: -1, clubeId: 3, forma: "dentro", gol: "CENTRO", assist: null }, "adm");
    expect(g).toMatchObject({ matchId: -1, rodada: 2, adversarioId: 1, casa: true });
    // a segunda ganha outro id
    expect((await c.criarPartida({ rodada: 3, casaId: 2, foraId: 3, golsCasa: 0, golsFora: 0 }, "adm")).matchId).toBe(-2);
  });

  it("recusa time repetido, placar inválido e partida manual duplicada", async () => {
    await expect(c.criarPartida({ rodada: 2, casaId: 1, foraId: 1, golsCasa: 0, golsFora: 0 }, "adm")).rejects.toThrow(/diferentes/);
    await expect(c.criarPartida({ rodada: 2, casaId: 1, foraId: 2, golsCasa: -1, golsFora: 0 }, "adm")).rejects.toThrow(/Placar/);
    await expect(c.criarPartida({ rodada: 40, casaId: 1, foraId: 2, golsCasa: 0, golsFora: 0 }, "adm")).rejects.toThrow(/Rodada/);
    await c.criarPartida({ rodada: 2, casaId: 1, foraId: 2, golsCasa: 0, golsFora: 0 }, "adm");
    await expect(c.criarPartida({ rodada: 2, casaId: 1, foraId: 2, golsCasa: 3, golsFora: 0 }, "adm")).rejects.toThrow(/já existe/);
  });

  it("apagar a partida manual leva os gols dela; partida do Cartola não se apaga", async () => {
    await c.criarPartida({ rodada: 2, casaId: 3, foraId: 1, golsCasa: 1, golsFora: 0 }, "adm");
    await c.lancar({ matchId: -1, clubeId: 3, forma: "penalti", gol: "MEI", assist: null }, "adm");
    await c.lancar({ matchId: 500, clubeId: 1, forma: "dentro", gol: "CENTRO", assist: null }, "adm");
    c.apagarPartida(-1);
    expect(db.gols.all().map((g) => g.matchId)).toEqual([500]);
    expect(() => c.apagarPartida(500)).toThrow(/criadas à mão/);
  });

  it("importar histórico acha a partida manual", async () => {
    await c.criarPartida({ rodada: 2, casaId: 3, foraId: 1, golsCasa: 1, golsFora: 0 }, "adm");
    const r = await c.importar("rodada;time;adversario;forma;gol;assistencia\n2;SAN;FLA;cabeca;ZAG;MEI", "adm", false);
    expect(r.importados).toBe(1);
    expect(db.gols.all()[0]).toMatchObject({ matchId: -1, clubeId: 3, casa: true });
  });
});
