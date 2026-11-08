import { describe, expect, it } from "vitest";
import { jogosDoTime, montarCampinho, type GolLancado, type PartidaCampinho } from "../src/engine/campinhos";
import { lerForma, lerPosicao } from "../src/server/campinhos";

const partidas: PartidaCampinho[] = [
  { matchId: 1, rodada: 1, casaId: 10, foraId: 20, golsCasa: 2, golsFora: 1 },
  { matchId: 2, rodada: 2, casaId: 30, foraId: 10, golsCasa: 0, golsFora: 1 },
  { matchId: 3, rodada: 3, casaId: 10, foraId: 30, golsCasa: null, golsFora: null }, // ainda não jogado
];
let n = 0;
const gol = (rodada: number, matchId: number, clubeId: number, adversarioId: number, casa: boolean, g: Partial<GolLancado>): GolLancado => ({
  id: String(++n),
  temporada: 2026,
  rodada,
  matchId,
  clubeId,
  adversarioId,
  casa,
  forma: "dentro",
  gol: "CENTRO",
  assist: null,
  criadoEm: "",
  por: "",
  ...g,
});
const gols: GolLancado[] = [
  gol(1, 1, 10, 20, true, { gol: "CENTRO", assist: "PONTD" }),
  gol(1, 1, 10, 20, true, { forma: "cabeca", gol: "ZAG", assist: "MEI" }),
  gol(1, 1, 20, 10, false, { forma: "penalti", gol: "MEI" }),
  gol(2, 2, 10, 30, false, { forma: "contra", gol: null }),
];

describe("campinhos", () => {
  it("ataque soma gols e assistências feitos por posição; gol contra entra só no total", () => {
    const c = montarCampinho(gols, partidas, 10, "ataque", { periodo: "todos", mando: "geral", forma: "todas" });
    expect(c.jogos).toBe(2);
    expect(c.totalGols).toBe(3);
    expect(c.gols.CENTRO).toBe(1);
    expect(c.gols.ZAG).toBe(1);
    expect(c.assist.PONTD).toBe(1);
    expect(c.assist.MEI).toBe(1);
    expect(c.totalAssist).toBe(2);
  });
  it("defesa soma os gols sofridos pela posição de quem fez (o atacante adversário)", () => {
    const c = montarCampinho(gols, partidas, 10, "defesa", { periodo: "todos", mando: "geral", forma: "todas" });
    expect(c.totalGols).toBe(1);
    expect(c.gols.MEI).toBe(1);
  });
  it("filtros: mando, últimos N jogos, forma e só jogos antes da rodada", () => {
    expect(montarCampinho(gols, partidas, 10, "ataque", { periodo: "todos", mando: "casa", forma: "todas" }).totalGols).toBe(2);
    expect(montarCampinho(gols, partidas, 10, "ataque", { periodo: 1, mando: "geral", forma: "todas" }).totalGols).toBe(1); // só a rodada 2
    expect(montarCampinho(gols, partidas, 10, "ataque", { periodo: "todos", mando: "geral", forma: "cabeca" }).gols.ZAG).toBe(1);
    expect(jogosDoTime(partidas, 10, { periodo: "todos", mando: "geral", antesDe: 2 })).toEqual([1]);
  });
  it("importação entende formas e posições escritas de vários jeitos", () => {
    expect(lerForma("Dentro da área")).toBe("dentro");
    expect(lerForma("Fora da área")).toBe("fora");
    expect(lerForma("Pênalti")).toBe("penalti");
    expect(lerForma("Cabeça")).toBe("cabeca");
    expect(lerForma("Gol contra")).toBe("contra");
    expect(lerPosicao("CENTRO")).toBe("CENTRO");
    expect(lerPosicao("pontd")).toBe("PONTD");
    expect(lerPosicao("Volante")).toBe("VOL");
    expect(lerPosicao("")).toBeNull();
    expect(lerPosicao("goleiro")).toBe("invalida");
  });
});
