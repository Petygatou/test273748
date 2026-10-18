import { describe, expect, it } from "vitest";
import { generateDemoSeason } from "../src/data/demoSeason";
import { buildRoundAnalysis } from "../src/engine/analysis";
import { _runToolForTests as runTool, allowRequest, runComandante, type ChatEvent } from "../src/server/comandante";

const analysis = buildRoundAnalysis(generateDemoSeason(), { simulations: 400 });
const noBacktest = async () => ({ ok: true });

describe("ferramentas do Comandante (números sempre do motor)", () => {
  it("buscar_atletas filtra e ordena", async () => {
    const out = (await runTool("buscar_atletas", { posicao: "ATA", ordenar_por: "xP", limite: 5 }, analysis, noBacktest)) as Array<{ posicao: number; xP: number }>;
    expect(out).toHaveLength(5);
    expect(out.every((p) => p.posicao === 5)).toBe(true);
    expect(out[0].xP).toBeGreaterThanOrEqual(out[4].xP);
  });

  it("detalhar_atleta encontra por apelido parcial e devolve scouts", async () => {
    const top = analysis.players[0];
    const out = (await runTool("detalhar_atleta", { atleta: top.apelido.split(" ")[0] + " " + top.apelido.split(" ")[1] }, analysis, noBacktest)) as { atleta: string; scouts: unknown[] };
    expect(out.atleta).toBe(top.apelido);
    expect(out.scouts.length).toBeGreaterThan(0);
  });

  it("montar_tropa respeita orçamento e retorna simulação", async () => {
    const out = (await runTool("montar_tropa", { orcamento: 110, perfil: "mitada" }, analysis, noBacktest)) as { custo: number; titulares: unknown[]; simulacao: { p10: number; p90: number } };
    expect(out.custo).toBeLessThanOrEqual(110);
    expect(out.titulares).toHaveLength(12);
    expect(out.simulacao.p90).toBeGreaterThan(out.simulacao.p10);
  });

  it("cedencia_do_time e jogos_da_rodada", async () => {
    const ced = (await runTool("cedencia_do_time", { clube: "FLA" }, analysis, noBacktest)) as { clube: string };
    expect(ced.clube).toBe("Flamengo");
    const jogos = (await runTool("jogos_da_rodada", {}, analysis, noBacktest)) as unknown[];
    expect(jogos).toHaveLength(analysis.fixtures.length);
  });

  it("erros viram mensagens, não exceções", async () => {
    const out = (await runTool("detalhar_atleta", { atleta: "zzzz-inexistente" }, analysis, noBacktest)) as { erro?: string };
    expect(out.erro).toBeTruthy();
  });
});

describe("proteções", () => {
  it("modo offline responde com números do motor quando não há chave", async () => {
    const prev = process.env.ANTHROPIC_API_KEY;
    const prevTok = process.env.ANTHROPIC_AUTH_TOKEN;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_AUTH_TOKEN;
    const events: ChatEvent[] = [];
    for await (const ev of runComandante({ messages: [{ role: "user", content: "quem capitanear?" }] }, { analysis, loadBacktest: noBacktest })) events.push(ev);
    if (prev) process.env.ANTHROPIC_API_KEY = prev;
    if (prevTok) process.env.ANTHROPIC_AUTH_TOKEN = prevTok;
    const text = events.filter((e) => e.type === "text").map((e) => (e as { text: string }).text).join("");
    expect(text).toContain("modo offline");
    expect(text).toContain(analysis.players.filter((p) => p.posicaoId !== 6)[0].apelido);
    expect(events.at(-1)).toEqual({ type: "done", offline: true });
  });

  it("limite de uso por IP", () => {
    let ok = 0;
    for (let i = 0; i < 30; i++) if (allowRequest("1.2.3.4")) ok++;
    expect(ok).toBeLessThanOrEqual(13);
    expect(allowRequest("5.6.7.8")).toBe(true);
  });
});
