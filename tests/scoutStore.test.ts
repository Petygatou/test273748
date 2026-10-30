import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "cfc-scouts-"));

const { db } = await import("../src/server/db");
const S = await import("../src/server/scoutStore");
const { invalidate } = await import("../src/server/cache");
const { generateDemoSeason } = await import("../src/data/demoSeason");
import type { SeasonData } from "../src/engine/types";

const { latent: _l, ...demo0 } = generateDemoSeason();
void _l;
/** temporada "real" (o banco nunca guarda dados de demonstração) */
const real = (): SeasonData => ({ ...demo0, source: "cartola" });
const DEPOIS = Date.UTC(2027, 0, 1); // muito depois do último jogo: rodadas congeladas

/** Globo falsa com os dados da temporada de teste; conta as chamadas por caminho. */
function fakeGlobo(d: SeasonData, opts: { falhaPontuados?: number; mercado?: number } = {}) {
  const chamadas: string[] = [];
  const resp = (x: unknown, status = 200) => new Response(JSON.stringify(x), { status, headers: { "content-type": "application/json" } });
  const f = vi.fn(async (url: string) => {
    const path = new URL(url).pathname;
    chamadas.push(path);
    if (path === "/mercado/status") return resp({ rodada_atual: d.rodadaAtual, status_mercado: opts.mercado ?? 1, temporada: d.temporada, times_escalados: 1 });
    if (path === "/atletas/mercado") {
      const clubes: Record<string, unknown> = {};
      for (const c of Object.values(d.clubs)) clubes[c.id] = { id: c.id, nome: c.nome, abreviacao: c.abreviacao };
      return resp({
        clubes,
        atletas: d.athletes.map((a) => ({
          atleta_id: a.id,
          apelido: a.apelido,
          nome: a.apelido,
          clube_id: a.clubeId,
          posicao_id: a.posicaoId,
          status_id: a.statusId,
          pontos_num: 0,
          media_num: a.media,
          variacao_num: 0,
          preco_num: a.preco,
          jogos_num: a.jogos,
        })),
      });
    }
    const pm = path.match(/^\/partidas(?:\/(\d+))?$/);
    if (pm) {
      const r = Number(pm[1] ?? d.rodadaAtual);
      return resp({
        rodada: r,
        partidas: d.matches
          .filter((x) => x.rodada === r)
          .map((x) => ({
            partida_id: x.id,
            clube_casa_id: x.casaId,
            clube_visitante_id: x.foraId,
            placar_oficial_mandante: x.golsCasa ?? null,
            placar_oficial_visitante: x.golsFora ?? null,
            timestamp: x.data ? Math.floor(new Date(x.data).getTime() / 1000) : undefined,
            valida: true,
          })),
      });
    }
    const pp = path.match(/^\/atletas\/pontuados(?:\/(\d+))?$/);
    if (pp) {
      if (!pp[1]) return resp({}, 404); // parciais: nada com o mercado aberto
      const r = Number(pp[1]);
      if (r === opts.falhaPontuados) return resp({ mensagem: "erro" }, 503);
      const atletas: Record<string, unknown> = {};
      for (const h of d.history.filter((x) => x.rodada === r))
        atletas[h.atletaId] = { apelido: "", pontuacao: h.pontos, scout: h.scout, posicao_id: h.posicaoId, clube_id: h.clubeId, entrou_em_campo: true };
      return resp({ rodada: r, atletas });
    }
    if (path === "/mercado/destaques") return resp([]);
    if (path === "/clubes") return resp(Object.fromEntries(Object.values(d.clubs).map((c) => [c.id, { id: c.id, nome: c.nome, abreviacao: c.abreviacao }])));
    if (path === "/rodadas") return resp(Array.from({ length: 38 }, (_, i) => ({ rodada_id: i + 1, inicio: "2026-04-01 16:00:00", fim: "2026-04-03 21:00:00" })));
    return resp({ mensagem: "não encontrado" }, 404);
  });
  return { f, chamadas };
}

beforeEach(() => {
  for (const c of Object.values(db)) c._reset();
  invalidate("");
});
afterEach(() => vi.unstubAllGlobals());

describe("histórico de scouts guardado", () => {
  it("codifica e decodifica os scouts sem perda", () => {
    const s = { G: 1, FD: 2, DS: 3, CA: 1 };
    expect(S.decodificarScouts(S.codificarScouts(s))).toEqual(s);
    expect(S.codificarScouts({})).toBe("");
  });

  it("sincronização idempotente: rodar de novo não duplica nem regrava", () => {
    const d = real();
    const r1 = S.registrarTemporada(d, "cartola", DEPOIS);
    expect(r1.novos).toBe(d.rodadaAtual - 1);
    const r2 = S.registrarTemporada(d, "cartola", DEPOIS);
    expect(r2).toMatchObject({ novos: 0, revisados: 0, iguais: d.rodadaAtual - 1 });
    expect(db.scoutRodadas.all()).toHaveLength(d.rodadaAtual - 1);
    // cada atuação aparece uma vez só
    const r5 = db.scoutRodadas.get(`${d.temporada}:5`)!;
    expect(new Set(r5.atletas.map((a) => a[0])).size).toBe(r5.atletas.length);
    expect(r5.atletas).toHaveLength(d.history.filter((h) => h.rodada === 5).length);
    // log: uma sincronização (a segunda passada não gera log)
    expect(db.syncLogs.all().filter((l) => l.operacao === "sincronizacao")).toHaveLength(1);
  });

  it("nunca guarda dados de demonstração nem a rodada em andamento", () => {
    expect(S.registrarTemporada(demo0, "cartola", DEPOIS).novos).toBe(0);
    const d = real();
    S.registrarTemporada(d, "cartola", DEPOIS);
    expect(db.scoutRodadas.get(`${d.temporada}:${d.rodadaAtual}`)).toBeUndefined();
  });

  it("scouts corrigidos pela fonte viram revisão registrada", () => {
    const d = real();
    S.registrarTemporada(d, "cartola", DEPOIS);
    const alvo = d.history.find((h) => h.rodada === 5)!;
    const corrigida = { ...d, history: d.history.map((h) => (h === alvo ? { ...h, scout: { ...h.scout, DS: (h.scout.DS ?? 0) + 1 } } : h)) };
    const r = S.registrarTemporada(corrigida, "cartola", DEPOIS);
    expect(r).toMatchObject({ novos: 0, revisados: 1 });
    const row = db.scoutRodadas.get(`${d.temporada}:5`)!;
    expect(row.revisao).toBe(1);
    expect(row.atletas.find((a) => a[0] === alvo.atletaId)![4]).toContain(`DS${(alvo.scout.DS ?? 0) + 1}`);
    expect(S.logsRecentes().find((l) => l.operacao === "revisao")?.mensagem).toMatch(/5/);
  });

  it("resposta vazia ou bem menor que a guardada não apaga o que já existe", () => {
    const d = real();
    S.registrarTemporada(d, "cartola", DEPOIS);
    const antes = db.scoutRodadas.get(`${d.temporada}:7`)!;
    const semRodada7 = { ...d, history: d.history.filter((h) => h.rodada !== 7) };
    S.registrarTemporada(semRodada7, "cartola", DEPOIS);
    expect(db.scoutRodadas.get(`${d.temporada}:7`)!.hash).toBe(antes.hash);
    const metade = { ...d, history: d.history.filter((h) => h.rodada !== 7 || h.atletaId % 2 === 0) };
    S.registrarTemporada(metade, "cartola", DEPOIS);
    expect(db.scoutRodadas.get(`${d.temporada}:7`)!.hash).toBe(antes.hash);
    expect(S.logsRecentes().some((l) => l.operacao === "erro" && /rodadas 7/.test(l.mensagem ?? ""))).toBe(true);
  });

  it("status: lacunas, validação dos pontos e estado", () => {
    const d = real();
    expect(S.statusDados(d.temporada, d.rodadaAtual, "API do Cartola", DEPOIS).estado).toBe("indisponivel");
    S.registrarTemporada({ ...d, history: d.history.filter((h) => h.rodada !== 4) }, "cartola", DEPOIS);
    const st = S.statusDados(d.temporada, d.rodadaAtual, "API do Cartola", DEPOIS);
    expect(st.lacunas).toEqual([4]);
    expect(st.estado).toBe("desatualizado");
    expect(st.explicacao).toMatch(/rodadas 4/);
    expect(st.validacao.batem).toBe(st.validacao.linhas); // demonstração segue a tabela à risca
    S.registrarTemporada(d, "cartola", DEPOIS);
    expect(S.statusDados(d.temporada, d.rodadaAtual, "API do Cartola", DEPOIS).estado).toBe("atualizado");
  });

  it("temporada guardada é remontada do banco (para quando a API já estiver em outra)", () => {
    const d = real();
    S.registrarTemporada(d, "cartola", DEPOIS);
    const g = S.temporadaGuardada(d.temporada)!;
    expect(g.history).toHaveLength(d.history.filter((h) => h.rodada < d.rodadaAtual).length);
    expect(g.rodadaFinal).toBe(d.rodadaAtual - 1);
    expect(Object.keys(g.clubs)).toHaveLength(Object.keys(d.clubs).length);
    const h = d.history.find((x) => x.rodada === 3)!;
    const volta = g.history.find((x) => x.rodada === 3 && x.atletaId === h.atletaId)!;
    expect(volta.scout).toEqual(Object.fromEntries(Object.entries(h.scout).filter(([, v]) => v)));
    expect(volta.pontos).toBeCloseTo(h.pontos, 2);
  });
});

describe("integração com a API (Globo simulada no formato real)", () => {
  it("rodadas congeladas são lidas do banco: a API não é chamada de novo para elas", async () => {
    const d = real();
    const { fetchCartolaSeason } = await import("../src/server/cartolaApi");
    const g1 = fakeGlobo(d);
    vi.stubGlobal("fetch", g1.f);
    const s1 = await fetchCartolaSeason();
    expect(s1.history.length).toBe(d.history.filter((h) => h.rodada < d.rodadaAtual).length);
    expect(g1.chamadas.filter((p) => p.startsWith("/atletas/pontuados/")).length).toBe(d.rodadaAtual - 1);
    // as rodadas antigas (jogos de abril a outubro) já estão congeladas no banco
    expect(S.rodadasCongeladas(d.temporada).size).toBeGreaterThan(0);
    const congeladas = S.rodadasCongeladas(d.temporada);
    invalidate("cartola:");
    const g2 = fakeGlobo(d);
    vi.stubGlobal("fetch", g2.f);
    const s2 = await fetchCartolaSeason();
    const pedidas = g2.chamadas.filter((p) => p.startsWith("/atletas/pontuados/")).map((p) => Number(p.split("/").pop()));
    for (const r of congeladas.keys()) expect(pedidas).not.toContain(r);
    expect(s2.history.length).toBe(s1.history.length);
  });

  it("se a API falha numa rodada, usa a versão guardada (e avisa quando não há)", async () => {
    const d = real();
    const { fetchCartolaSeason } = await import("../src/server/cartolaApi");
    vi.stubGlobal("fetch", fakeGlobo(d).f);
    await fetchCartolaSeason();
    // tira o congelamento para forçar a nova consulta da rodada 30, que agora falha
    const id = `${d.temporada}:30`;
    db.scoutRodadas.update(id, { congelada: false });
    invalidate("cartola:");
    vi.stubGlobal("fetch", fakeGlobo(d, { falhaPontuados: 30 }).f);
    const s = await fetchCartolaSeason();
    expect(s.history.filter((h) => h.rodada === 30).length).toBe(d.history.filter((h) => h.rodada === 30).length);
  });

  it("verifica cada endpoint: campos, tempo, parciais fora de hora e falhas", async () => {
    const d = real();
    vi.stubGlobal("fetch", fakeGlobo(d).f);
    const { verificarEndpoints } = await import("../src/server/fontesCartola");
    const v = await verificarEndpoints();
    const por = Object.fromEntries(v.resultados.map((x) => [x.endpoint, x]));
    expect(por["/mercado/status"].situacao).toBe("ok");
    expect(por["/atletas/mercado"].situacao).toBe("ok");
    expect(por["/partidas"].situacao).toBe("ok");
    expect(por[`/partidas/${d.rodadaAtual - 1}`].situacao).toBe("ok");
    expect(por["/atletas/pontuados"].situacao).toBe("nao-se-aplica"); // mercado aberto
    expect(por[`/atletas/pontuados/${d.rodadaAtual - 1}`].observacao).toMatch(/100%/);
    expect(por["/clubes"].situacao).toBe("ok");
    expect(por["/rodadas"].situacao).toBe("ok");
    expect(S.logsRecentes()[0]).toMatchObject({ operacao: "verificacao", resultado: "ok" });
    // a Globo bloqueando o servidor
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("Forbidden", { status: 403 })),
    );
    const ruim = await verificarEndpoints();
    expect(ruim.resultados.every((x) => x.situacao !== "ok")).toBe(true);
    expect(ruim.resultados[0].http).toBe(403);
    expect(S.logsRecentes()[0].resultado).toBe("erro");
  });

  it("resposta inválida (sem campos) é apontada, não aceita em silêncio", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const path = new URL(url).pathname;
        if (path === "/mercado/status") return new Response(JSON.stringify({ rodada_atual: 10 }), { status: 200 });
        if (path === "/atletas/mercado") return new Response(JSON.stringify({ atletas: [{ atleta_id: 1 }] }), { status: 200 });
        return new Response("{}", { status: 200 });
      }),
    );
    const { verificarEndpoints } = await import("../src/server/fontesCartola");
    const v = await verificarEndpoints();
    const st = v.resultados.find((x) => x.endpoint === "/mercado/status")!;
    expect(st.situacao).toBe("campos-faltando");
    expect(st.faltando).toEqual(["status_mercado", "temporada"]);
    expect(v.resultados.find((x) => x.endpoint === "/atletas/mercado")!.faltando).toContain("clube_id");
    expect(v.resultados.find((x) => x.endpoint === "/partidas")!.situacao).toBe("falhou");
  });
});
