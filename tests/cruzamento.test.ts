import { describe, expect, it } from "vitest";
import { generateDemoSeason } from "../src/data/demoSeason";
import { cruzarTimes, prepararBase } from "../src/engine/cruzamento";
import type { Scouts } from "../src/engine/rules";
import { scoutsDaPosicao, valorScout } from "../src/engine/scoutDefs";
import type { Match, PlayerRound } from "../src/engine/types";

const { latent: _l, ...demo } = generateDemoSeason();
void _l;

describe("cadastro de scouts", () => {
  it("somas só de scouts distintos e scouts certos por posição", () => {
    const s: Scouts = { FD: 2, FF: 1, FT: 1, G: 1, A: 2, DS: 3 };
    expect(valorScout(s, "FIN")).toBe(4); // o gol não entra
    expect(valorScout(s, "GA")).toBe(3);
    expect(valorScout(s, "DS")).toBe(3);
    const gol = scoutsDaPosicao(1).map((d) => d.codigo);
    expect(gol).toEqual(expect.arrayContaining(["DE", "GS", "SG", "DP"]));
    expect(gol).not.toContain("FIN");
    expect(scoutsDaPosicao(5).map((d) => d.codigo)).not.toContain("SG");
    expect(scoutsDaPosicao(6).map((d) => d.codigo)).toEqual(["V"]);
  });
});

/* temporada pequena e conhecida: 4 clubes, 6 rodadas */
function mini() {
  const matches: Match[] = [];
  const pares = [
    [1, 2, 3, 4],
    [1, 3, 2, 4],
    [1, 4, 2, 3],
  ];
  let id = 1;
  for (let r = 1; r <= 7; r++) {
    const [a, b, c, d] = pares[(r - 1) % 3];
    const casa = r % 2 === 1;
    const fim = r < 7;
    matches.push({ id: id++, rodada: r, casaId: casa ? a : b, foraId: casa ? b : a, golsCasa: fim ? 1 : null, golsFora: fim ? 0 : null, valida: true });
    matches.push({ id: id++, rodada: r, casaId: casa ? c : d, foraId: casa ? d : c, golsCasa: fim ? 2 : null, golsFora: fim ? 2 : null, valida: true });
  }
  const history: PlayerRound[] = [];
  const fin = [0, 1, 2, 3, 4, 2];
  for (let r = 1; r <= 6; r++) {
    // atleta 100 (atacante do clube 1): finalizações conhecidas
    history.push({ atletaId: 100, rodada: r, clubeId: 1, posicaoId: 5, pontos: fin[r - 1] * 1.2, scout: { FD: fin[r - 1] } });
    // um atacante em cada outro clube, com 1 finalização por jogo
    for (const c of [2, 3, 4]) history.push({ atletaId: 200 + c, rodada: r, clubeId: c, posicaoId: 5, pontos: 1.2, scout: { FD: 1 } });
  }
  // rodada 7 ainda não tem placar; um registro "parcial" que NÃO pode entrar
  history.push({ atletaId: 100, rodada: 7, clubeId: 1, posicaoId: 5, pontos: 99, scout: { FD: 50 } });
  return { temporada: 2026, history, matches };
}

describe("cruzamento por times (conquistado × cedido)", () => {
  // rodada 7: 1 (casa) x 2 e 3 (casa) x 4. Em casa o clube 1 jogou as rodadas 1, 3 e 5;
  // o clube 2 jogou fora as rodadas 1 (vs 1), 2 (vs 4) e 6 (vs 3).
  const base = prepararBase(mini(), 7);
  const op = { scout: "FD" as const, setor: 5 as const, recorte: null, lado: "mandantes" as const };

  it("conquistado = o que o setor do time fez no mesmo mando; cedido = o que o adversário permitiu no mando oposto", () => {
    const [l] = cruzarTimes(base, op);
    expect(l).toMatchObject({ timeId: 1, adversarioId: 2, timeEmCasa: true });
    // atleta 100 em casa: 0 (R1) + 2 (R3) + 4 (R5)
    expect(l.conquistado).toMatchObject({ total: 6, jogos: 3, media: 2 });
    expect(l.conquistado.lista.map((j) => j.rodada)).toEqual([5, 3, 1]);
    // quem enfrentou o clube 2 fora dele: clube 1 na R1 (0), clube 4 na R2 (1), clube 3 na R6 (1)
    expect(l.cedido).toMatchObject({ total: 2, jogos: 3 });
    expect(l.cedido.lista.map((j) => [j.rodada, j.adversarioId, j.valor])).toEqual([
      [6, 3, 1],
      [2, 4, 1],
      [1, 1, 0],
    ]);
    // a rodada 7 (sem placar, parcial) nunca entra
    expect([...l.conquistado.lista, ...l.cedido.lista].every((j) => j.rodada < 7)).toBe(true);
  });

  it("visitantes invertem os mandos e o recorte pega só os últimos N jogos", () => {
    const v = cruzarTimes(base, { ...op, lado: "visitantes" });
    expect(v[0]).toMatchObject({ timeId: 2, adversarioId: 1, timeEmCasa: false });
    expect(v[0].conquistado.jogos).toBe(3); // clube 2 fora: R1, R2, R6
    expect(v[0].cedido.lista.map((j) => j.rodada)).toEqual([5, 3, 1]); // clube 1 em casa
    const r2 = cruzarTimes(base, { ...op, recorte: 2 })[0];
    expect(r2.conquistado).toMatchObject({ total: 6, jogos: 2 }); // R5 (4) + R3 (2)
    expect(cruzarTimes(base, { ...op, recorte: 1 })[0].conquistado.total).toBe(4);
  });

  it("SG conta jogos sem sofrer gol (conquistado) e jogos em que o adversário não marcou (cedido)", () => {
    const [l] = cruzarTimes(base, { ...op, scout: "SG", setor: 1 });
    expect(l.conquistado).toMatchObject({ total: 3, jogos: 3 }); // 1 x 0 nas três
    expect(l.cedido).toMatchObject({ total: 1, jogos: 3 }); // só na R1 o clube 2 não marcou
  });

  it("jogo sem dados da fonte fica fora da conta (não vira zero)", () => {
    const d = mini();
    const semR3 = prepararBase({ ...d, history: d.history.filter((h) => !(h.rodada === 3 && h.clubeId === 1)) }, 7);
    expect(cruzarTimes(semR3, op)[0].conquistado).toMatchObject({ total: 4, jogos: 2 });
  });

  it("rodada passada traz o que o setor fez de fato na partida", () => {
    const d = mini();
    const b6 = prepararBase(d, 6);
    const l = cruzarTimes(
      b6,
      op,
      d.history.filter((h) => h.rodada === 6),
    );
    // R6: 4 (casa) x 1 e 3 (casa) x 2; o atacante do clube 4 fez 1 FD
    const doClube4 = l.find((x) => x.timeId === 4)!;
    expect(doClube4.real).toBe(1);
  });
});

describe("cruzamento por times × recálculo independente (força bruta)", () => {
  // laterais com lado: ímpar = esquerdo; alguns jogos com o lado trocado naquele jogo
  const lados = Object.fromEntries(demo.athletes.filter((a) => a.posicaoId === 2).map((a) => [a.id, a.id % 2 ? "E" : "D"])) as Record<number, "E" | "D">;
  const ladosJogo: Record<string, "E" | "D"> = {};
  for (const h of demo.history) if (h.posicaoId === 2 && h.rodada % 7 === 0) ladosJogo[`${h.rodada}:${h.atletaId}`] = lados[h.atletaId] === "E" ? "D" : "E";
  // simula rodadas que faltaram na fonte para alguns clubes
  const clubes = Object.keys(demo.clubs).map(Number);
  const faltando = new Set([`${demo.rodadaAtual - 2}:${clubes[0]}`, `${demo.rodadaAtual - 5}:${clubes[1]}`, `${demo.rodadaAtual - 4}:${clubes[2]}`]);
  const dados = { ...demo, lados, ladosJogo, history: demo.history.filter((h) => !faltando.has(`${h.rodada}:${h.clubeId}`)) };

  type Setor = "time" | 1 | 2 | 3 | 4 | 5 | "LE" | "LD";
  const noSetor = (s: Setor, h: PlayerRound) => {
    const lado = h.posicaoId === 2 ? (ladosJogo[`${h.rodada}:${h.atletaId}`] ?? lados[h.atletaId]) : undefined;
    return s === "time" ? h.posicaoId !== 6 : s === "LE" ? h.posicaoId === 2 && lado === "E" : s === "LD" ? h.posicaoId === 2 && lado === "D" : h.posicaoId === s;
  };
  /** o cálculo do zero, só com partidas e scouts crus */
  function bruto(R: number, scout: Parameters<typeof valorScout>[1], setor: Setor, recorte: number | null, lado: "mandantes" | "visitantes") {
    const temDados = (r: number, c: number) => dados.history.some((h) => h.rodada === r && h.clubeId === c);
    const jogos = (clube: number, emCasa: boolean) =>
      dados.matches
        .filter((m) => m.rodada < R && m.golsCasa != null && m.golsFora != null && (emCasa ? m.casaId === clube : m.foraId === clube))
        .map((m) => ({ r: m.rodada, outro: emCasa ? m.foraId : m.casaId, pro: emCasa ? m.golsCasa! : m.golsFora!, contra: emCasa ? m.golsFora! : m.golsCasa! }))
        .sort((a, b) => b.r - a.r);
    const soma = (r: number, c: number) => dados.history.filter((h) => h.rodada === r && h.clubeId === c && noSetor(setor, h)).reduce((s, h) => s + valorScout(h.scout, scout), 0);
    return dados.matches
      .filter((m) => m.rodada === R)
      .map((m) => {
        const emCasa = lado === "mandantes";
        const time = emCasa ? m.casaId : m.foraId;
        const adv = emCasa ? m.foraId : m.casaId;
        let jt = jogos(time, emCasa).filter((j) => temDados(j.r, time));
        let ja = jogos(adv, !emCasa).filter((j) => temDados(j.r, j.outro));
        if (recorte) {
          jt = jt.slice(0, recorte);
          ja = ja.slice(0, recorte);
        }
        const conquistado = scout === "SG" ? jt.filter((j) => j.contra === 0).length : jt.reduce((s, j) => s + soma(j.r, time), 0);
        const cedido = scout === "SG" ? ja.filter((j) => j.pro === 0).length : ja.reduce((s, j) => s + soma(j.r, j.outro), 0);
        return { matchId: m.id, time, adv, conquistado, jc: jt.length, cedido, ja: ja.length };
      });
  }

  it("bate em todas as combinações de scout, posição, recorte e mando", () => {
    const R = dados.rodadaAtual;
    const base = prepararBase(dados, R);
    let conferidas = 0;
    for (const scout of ["G", "A", "GA", "FIN", "DS", "DE", "SG", "FS", "FC", "CA", "GS"] as const)
      for (const setor of ["time", 1, 2, 3, 4, 5, "LE", "LD"] as Setor[])
        for (const recorte of [3, 5, 10, null])
          for (const lado of ["mandantes", "visitantes"] as const) {
            const esperado = bruto(R, scout, setor, recorte, lado);
            const obtido = cruzarTimes(base, { scout, setor, recorte, lado });
            expect(obtido.length).toBe(esperado.length);
            for (const e of esperado) {
              const o = obtido.find((x) => x.matchId === e.matchId)!;
              expect([o.timeId, o.adversarioId]).toEqual([e.time, e.adv]);
              expect([o.conquistado.total, o.conquistado.jogos, o.cedido.total, o.cedido.jogos]).toEqual([e.conquistado, e.jc, e.cedido, e.ja]);
              // o detalhe jogo a jogo soma o total mostrado
              expect(o.conquistado.lista.reduce((s, j) => s + j.valor, 0)).toBe(o.conquistado.total);
              expect(o.cedido.lista.reduce((s, j) => s + j.valor, 0)).toBe(o.cedido.total);
              conferidas++;
            }
          }
    expect(conferidas).toBeGreaterThan(5000);
  });

  it("recorte busca o jogo anterior quando um jogo faltou na fonte", () => {
    const R = dados.rodadaAtual;
    const base = prepararBase(dados, R);
    const linhas = cruzarTimes(base, { scout: "G", setor: 5, recorte: 5, lado: "mandantes" });
    // com jogos suficientes no mando, o recorte de 5 sempre tem 5 jogos
    for (const l of linhas) {
      const casaComDados = (base.jogosClube.get(l.timeId) ?? []).filter((j) => j.casa && !faltando.has(`${j.rodada}:${l.timeId}`)).length;
      expect(l.conquistado.jogos).toBe(Math.min(5, casaComDados));
    }
  });

  it("rodada passada: a coluna real é o que o setor fez naquela partida", () => {
    const R = dados.rodadaAtual - 3;
    const base = prepararBase(dados, R);
    const hist = dados.history.filter((h) => h.rodada === R);
    for (const scout of ["G", "DS", "FIN"] as const) {
      const linhas = cruzarTimes(base, { scout, setor: "time", recorte: 5, lado: "visitantes" }, hist);
      for (const l of linhas) {
        const rows = hist.filter((h) => h.clubeId === l.timeId);
        expect(l.real).toBe(rows.length ? rows.filter((h) => h.posicaoId !== 6).reduce((s, h) => s + valorScout(h.scout, scout), 0) : null);
      }
    }
  });
});

describe("cruzamento por times: coerência com os placares", () => {
  it("nenhum setor marca mais gols que o time, nem o adversário cede mais gols do que sofreu", () => {
    const base = prepararBase(demo, demo.rodadaAtual);
    let jogos = 0;
    for (const setor of ["time", 1, 2, 3, 4, 5] as const)
      for (const lado of ["mandantes", "visitantes"] as const)
        for (const l of cruzarTimes(base, { scout: "G", setor, recorte: null, lado })) {
          for (const j of l.conquistado.lista) {
            expect(j.valor).toBeLessThanOrEqual(j.golsPro);
            jogos++;
          }
          // no cedido, o placar é do ponto de vista do adversário: quem o enfrentou marcou golsContra
          for (const j of l.cedido.lista) expect(j.valor).toBeLessThanOrEqual(j.golsContra);
          // e o mando de cada jogo listado é o pedido
          expect(l.conquistado.lista.every((j) => j.casa === (lado === "mandantes"))).toBe(true);
          expect(l.cedido.lista.every((j) => j.casa === (lado !== "mandantes"))).toBe(true);
        }
    expect(jogos).toBeGreaterThan(1000);
  });
});
