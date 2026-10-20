import { beforeAll, describe, expect, it, vi } from "vitest";
import { generateDemoSeason } from "../src/data/demoSeason";
import { buildRoundAnalysis } from "../src/engine/analysis";
import type { RoundAnalysis } from "../src/engine/types";

const agora = Date.now();
vi.mock("../src/server/cartolaApi", () => ({
  getLivePontuados: async () => ({ rodada: 31, atletas: { 1: { pontuacao: 5.2, scout: { G: 1 }, entrou_em_campo: true } } }),
  getLivePartidas: async () => ({
    partidas: [
      // o feed diz "encerrada", mas o jogo é daqui a 2 dias: não pode aparecer como encerrado
      { partida_id: 1, clube_casa_id: 10, clube_visitante_id: 20, placar_oficial_mandante: 1, placar_oficial_visitante: 4, status_transmissao_tr: "ENCERRADA", timestamp: Math.floor((agora + 2 * 86400_000) / 1000) },
      { partida_id: 2, clube_casa_id: 30, clube_visitante_id: 40, placar_oficial_mandante: 2, placar_oficial_visitante: 0, status_transmissao_tr: "EM_ANDAMENTO", timestamp: Math.floor((agora - 3600_000) / 1000) },
    ],
  }),
}));

const { loadLive } = await import("../src/server/live");

let analysis: RoundAnalysis;
beforeAll(() => {
  analysis = buildRoundAnalysis(generateDemoSeason(), { simulations: 200 });
});

describe("ao vivo com dados reais", () => {
  it("mercado aberto: nenhum placar, parcial ou jogo ao vivo inventado", async () => {
    const live = await loadLive({ ...analysis, source: "cartola" }, 1);
    expect(live.source).toBe("cartola");
    expect(live.partidas.length).toBe(analysis.fixtures.length);
    expect(live.partidas.every((m) => m.status === "pre" && m.placarCasa == null && m.placarFora == null)).toBe(true);
    expect(Object.keys(live.atletas)).toHaveLength(0);
  });

  it("mercado fechado: jogo futuro fica como não iniciado, jogo em andamento vem do feed", async () => {
    const live = await loadLive({ ...analysis, source: "cartola" }, 2);
    const [futuro, rolando] = live.partidas;
    expect(futuro.status).toBe("pre");
    expect(futuro.placarCasa).toBeNull();
    expect(rolando.status).toBe("andamento");
    expect(rolando.placarCasa).toBe(2);
    expect(live.atletas[1].pontos).toBe(5.2);
  });

  it("modo demonstração continua simulando", async () => {
    const live = await loadLive({ ...analysis, source: "demo" }, 1);
    expect(live.source).toBe("demo");
    expect(live.partidas.some((m) => m.status !== "pre")).toBe(true);
  });
});
