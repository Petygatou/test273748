import { describe, expect, it } from "vitest";
import { generateDemoSeason } from "../src/data/demoSeason";
import { analisarAtleta, calibrar, cedidoPor, confrontoDe, cruzarTimes, linhaRanking, liga, prepararBase, simularPontos } from "../src/engine/cruzamento";
import { SCORING, type PositionId, type Scouts } from "../src/engine/rules";
import { validateScoring } from "../src/engine/rulesCheck";
import { conferirPontuacao, pontuacaoVigente, scoutsDaPosicao, valorScout } from "../src/engine/scoutDefs";
import { desvio, gammaP, gammaQuantile, lnGamma, media, mediana, negBin, poisson, probAtLeast, sortearNegBin } from "../src/engine/stats";
import { Rng } from "../src/engine/math";
import type { Match, PlayerRound } from "../src/engine/types";

const { latent: _l, ...demo } = generateDemoSeason();
void _l;
const opts = { janela: null, mando: "todos" as const, meiaVida: 8, pontuacao: SCORING };

describe("distribuições (valores conhecidos)", () => {
  it("log-gama, Poisson e binomial negativa", () => {
    expect(lnGamma(5)).toBeCloseTo(Math.log(24), 10);
    expect(lnGamma(0.5)).toBeCloseTo(Math.log(Math.sqrt(Math.PI)), 10);
    expect(poisson(2, 1.5)).toBeCloseTo(0.25102, 5);
    // NB de média 2 e tamanho 1 = geométrica com p = 1/3
    expect(negBin(0, 2, 1)).toBeCloseTo(1 / 3, 10);
    expect(negBin(1, 2, 1)).toBeCloseTo(2 / 9, 10);
    expect(probAtLeast(1, 2, 1)).toBeCloseTo(2 / 3, 10);
    // sem tamanho = Poisson
    expect(probAtLeast(1, 0.7)).toBeCloseTo(1 - Math.exp(-0.7), 10);
    expect(probAtLeast(2, 1.2)).toBeCloseTo(1 - Math.exp(-1.2) * (1 + 1.2), 10);
  });

  it("gama incompleta e quantis (tabela qui-quadrado)", () => {
    expect(gammaP(1, 1)).toBeCloseTo(1 - Math.exp(-1), 10);
    expect(gammaP(2.5, 3)).toBeCloseTo(0.69378, 4);
    expect(gammaQuantile(0.5, 1, 1)).toBeCloseTo(Math.LN2, 6);
    // Gama(3, taxa 2) = χ²(6)/4; χ²₀,₉(6) = 10,6446
    expect(gammaQuantile(0.9, 3, 2)).toBeCloseTo(10.6446 / 4, 3);
  });

  it("estatísticas descritivas", () => {
    const xs = [0, 1, 2, 3, 4];
    expect(media(xs)).toBe(2);
    expect(mediana(xs)).toBe(2);
    expect(mediana([1, 2, 3, 10])).toBe(2.5);
    expect(desvio(xs)).toBeCloseTo(Math.sqrt(2.5), 10);
  });

  it("sorteio da binomial negativa tem a média e a variância da teoria", () => {
    const rng = new Rng(3);
    const u = () => rng.next();
    const xs = Array.from({ length: 40000 }, () => sortearNegBin(2, 1.5, u));
    expect(media(xs)).toBeCloseTo(2, 1);
    // Var = μ + μ²/size = 2 + 4/1,5
    expect(desvio(xs) ** 2).toBeGreaterThan(4.4);
    expect(desvio(xs) ** 2).toBeLessThan(4.95);
  });
});

describe("cadastro de scouts e pontuação oficial", () => {
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

  it("confere cada scout contra os pontos oficiais e usa o valor oficial quando diverge", () => {
    const ok = conferirPontuacao(demo.history, validateScoring(demo.history));
    expect(ok.find((c) => c.codigo === "DS")!.estado).toBe("conferido");
    expect(pontuacaoVigente(ok).DS).toBe(SCORING.DS);
    // temporada em que o desarme passou a valer 1,5: os pontos oficiais denunciam
    const mudou = demo.history.map((h) => ({ ...h, pontos: Math.round((h.pontos + (h.scout.DS ?? 0) * (1.5 - SCORING.DS)) * 100) / 100 }));
    const conf = conferirPontuacao(mudou, validateScoring(mudou));
    const ds = conf.find((c) => c.codigo === "DS")!;
    expect(ds.estado).toBe("divergente");
    expect(ds.vigente).toBe(1.5);
    expect(conf.find((c) => c.codigo === "G")!.estado).not.toBe("divergente");
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

describe("histórico do atleta (fatos)", () => {
  it("média, mediana, desvio, frequência e máximo batem com as contagens", () => {
    const base = prepararBase(mini(), 7);
    const an = analisarAtleta(base, { id: 100, apelido: "Teste", clubeId: 1, posicaoId: 5 }, opts);
    const fin = an.scouts.find((s) => s.codigo === "FIN")!.hist;
    expect(fin.n).toBe(6);
    expect(fin.total).toBe(12);
    expect(fin.media).toBe(2);
    expect(fin.mediana).toBe(2);
    expect(fin.desvio).toBeCloseTo(Math.sqrt(2), 3);
    expect(fin.jogosCom).toBe(5);
    expect(fin.freq).toBeCloseTo(5 / 6, 3);
    expect(fin.maximo).toBe(4);
    // a rodada 7 (sem placar, parcial) não entra no histórico nem na amostra
    expect(an.amostra.jogosTemporada).toBe(6);
    expect(an.partidas.every((p) => p.rodada < 7)).toBe(true);
  });

  it("janela e mando filtram a amostra", () => {
    const base = prepararBase(mini(), 7);
    const at = { id: 100, apelido: "Teste", clubeId: 1, posicaoId: 5 as PositionId };
    const ult3 = analisarAtleta(base, at, { ...opts, janela: 3 });
    expect(ult3.amostra.jogos).toBe(3);
    expect(ult3.scouts.find((s) => s.codigo === "FIN")!.hist.media).toBe(3); // 3, 4, 2
    const casa = analisarAtleta(base, at, { ...opts, mando: "casa" });
    expect(casa.amostra.jogos).toBe(3);
    expect(casa.scouts.find((s) => s.codigo === "FIN")!.hist.media).toBeCloseTo((0 + 2 + 4) / 3, 3);
  });

  it("confronto real da rodada e confronto escolhido (hipotético)", () => {
    const base = prepararBase(mini(), 7);
    expect(confrontoDe(base, 1, {})).toEqual({ rodada: 7, adversarioId: 2, casa: true, hipotetico: false });
    expect(confrontoDe(base, 1, { adversarioId: 4, mandoConfronto: "fora" })).toEqual({ rodada: 7, adversarioId: 4, casa: false, hipotetico: true });
  });
});

describe("tendência dos últimos 5 jogos", () => {
  const caso = (serie: number[]) => {
    const d = mini();
    const rod = serie.length;
    const matches: Match[] = [];
    for (let r = 1; r <= rod + 1; r++) matches.push({ id: r, rodada: r, casaId: 1, foraId: 2, golsCasa: r <= rod ? 1 : null, golsFora: r <= rod ? 0 : null, valida: true });
    const history: PlayerRound[] = serie.map((v, i) => ({ atletaId: 100, rodada: i + 1, clubeId: 1, posicaoId: 3, pontos: v, scout: { DS: v } }));
    const base = prepararBase({ ...d, matches, history }, rod + 1);
    return analisarAtleta(base, { id: 100, apelido: "T", clubeId: 1, posicaoId: 3 }, opts).scouts.find((x) => x.codigo === "DS")!.hist.tendencia;
  };
  it("alta só quando os últimos 5 fogem do acaso (teste binomial exato)", () => {
    expect(caso([...Array(15).fill(0), 3, 3, 3, 2, 3])!.rotulo).toBe("alta");
    expect(caso([...Array(15).fill(3), 0, 0, 0, 0, 0])!.rotulo).toBe("queda");
    // um único evento recente não é tendência
    expect(caso([...Array(15).fill(0), 0, 1, 0, 0, 0])).toBeNull();
    expect(caso([1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 2, 1, 2, 1, 2])!.rotulo).toBe("estavel");
  });
});

describe("projeção (modelo)", () => {
  const base = prepararBase(demo, demo.rodadaAtual);
  const atacantes = demo.athletes.filter((a) => a.posicaoId === 5 && (base.porAtleta.get(a.id)?.length ?? 0) >= 15);

  it("a projeção não usa a rodada que está sendo prevista", () => {
    const r = demo.rodadaAtual - 3;
    const at = atacantes[0];
    const info = { id: at.id, apelido: at.apelido, clubeId: at.clubeId, posicaoId: at.posicaoId };
    const a1 = analisarAtleta(prepararBase(demo, r), info, opts);
    const alterada = { ...demo, history: demo.history.map((h) => (h.rodada === r && h.atletaId === at.id ? { ...h, scout: { ...h.scout, FD: 30 } } : h)) };
    const a2 = analisarAtleta(prepararBase(alterada, r), info, opts);
    expect(a2.scouts.find((s) => s.codigo === "FD")!.projecao!.lambda).toBe(a1.scouts.find((s) => s.codigo === "FD")!.projecao!.lambda);
  });

  it("amostra pequena é puxada para a média da posição mais que amostra grande", () => {
    const L = liga(base, 5, "FIN");
    const at = atacantes.find((a) => media((base.porAtleta.get(a.id) ?? []).map((l) => valorScout(l.scout, "FIN"))) > L.mu * 1.3)!;
    const info = { id: at.id, apelido: at.apelido, clubeId: at.clubeId, posicaoId: at.posicaoId };
    const grande = analisarAtleta(base, info, opts).scouts.find((s) => s.codigo === "FIN")!.projecao!.componentes.taxaJogador!;
    const pequena = analisarAtleta(base, info, { ...opts, janela: 3 }).scouts.find((s) => s.codigo === "FIN")!;
    const m3 = pequena.hist.media;
    // com 3 jogos a taxa fica entre a média da posição e a média dos 3 jogos
    const t3 = pequena.projecao!.componentes.taxaJogador!;
    expect(t3).toBeLessThan(Math.max(m3, L.mu) + 1e-9);
    expect(t3).toBeGreaterThan(Math.min(m3, L.mu) - 1e-9);
    expect(grande).toBeGreaterThan(L.mu);
  });

  it("fator do adversário fica entre 1 e o bruto (encolhido pelo ruído)", () => {
    for (const c of Object.keys(demo.clubs).map(Number)) {
      const f = cedidoPor(base, c, 5, "FIN", null, "todos");
      expect(f.fator).toBeGreaterThanOrEqual(Math.min(1, f.bruto) - 1e-9);
      expect(f.fator).toBeLessThanOrEqual(Math.max(1, f.bruto) + 1e-9);
      expect(f.peso).toBeGreaterThanOrEqual(0);
      expect(f.peso).toBeLessThanOrEqual(1);
    }
  });

  it("probabilidades coerentes: P(≥k) cai com k, faixa contém a central, frequência é separada", () => {
    const at = atacantes[0];
    const an = analisarAtleta(base, { id: at.id, apelido: at.apelido, clubeId: at.clubeId, posicaoId: at.posicaoId }, opts);
    const fin = an.scouts.find((s) => s.codigo === "FIN")!.projecao!;
    const ps = fin.limiares.map((l) => l.p);
    expect([...ps].sort((a, b) => b - a)).toEqual(ps);
    for (const l of fin.limiares) {
      expect(l.pBaixo!).toBeLessThanOrEqual(l.p + 0.02);
      expect(l.pAlto!).toBeGreaterThanOrEqual(l.p - 0.02);
      expect(l.freqHist).not.toBeNull();
    }
    expect(fin.intervalo![0]).toBeLessThan(fin.lambda);
    expect(fin.intervalo![1]).toBeGreaterThan(fin.lambda);
  });

  it("pontuação: média exata = soma das contribuições, e bate com a simulação", () => {
    const at = atacantes[1];
    const an = analisarAtleta(base, { id: at.id, apelido: at.apelido, clubeId: at.clubeId, posicaoId: at.posicaoId }, { ...opts, simulacoes: 20000 });
    const p = an.pontos!;
    const soma = p.contribuicoes.reduce((s, c) => s + c.pontos, 0);
    expect(Math.abs(soma - p.esperado)).toBeLessThan(0.05);
    expect(p.p20!).toBeLessThanOrEqual(p.p50!);
    expect(p.p50!).toBeLessThanOrEqual(p.p80!);
    // simulação independente confere média e desvio exatos
    const sim = simularPontos(5, an.scouts, an.gols!, SCORING, 20000, 99)!;
    expect(sim.esperado).toBe(p.esperado);
    expect(Math.abs((sim.p50! + sim.p20! + sim.p80!) / 3 - p.esperado)).toBeLessThan(2.5);
  });

  it("sem amostra mínima não inventa projeção", () => {
    const base2 = prepararBase(mini(), 3); // atleta com 2 jogos
    const an = analisarAtleta(base2, { id: 100, apelido: "Teste", clubeId: 1, posicaoId: 5 }, opts);
    const fin = an.scouts.find((s) => s.codigo === "FIN")!;
    expect(fin.projecao).toBeNull();
    expect(fin.semProjecao).toMatch(/Amostra insuficiente/);
    expect(an.pontos).toBeNull();
    expect(an.semPontos).toMatch(/Amostra insuficiente/);
  });

  it("técnico: sem projeção por scouts, só vitória pelo placar", () => {
    const tec = demo.athletes.find((a) => a.posicaoId === 6 && (base.porAtleta.get(a.id)?.length ?? 0) > 5)!;
    const an = analisarAtleta(base, { id: tec.id, apelido: tec.apelido, clubeId: tec.clubeId, posicaoId: 6 }, opts);
    expect(an.pontos).toBeNull();
    expect(an.semPontos).toMatch(/técnico/);
    expect(an.scouts.map((s) => s.codigo)).toEqual(["V"]);
    expect(an.scouts[0].projecao!.lambda).toBeCloseTo(an.gols!.pVitoria, 3);
  });

  it("linha do ranking traz as métricas explicadas", () => {
    const at = atacantes[2];
    const an = analisarAtleta(base, { id: at.id, apelido: at.apelido, clubeId: at.clubeId, posicaoId: at.posicaoId }, { ...opts, leve: true, simulacoes: 0 });
    const l = linhaRanking(an, "FIN", 2);
    expect(l.scout.limiar).toBe(2);
    expect(l.esperado).toBe(an.pontos!.esperado);
    expect(l.ofensivo! + l.defensivo!).toBeLessThanOrEqual(l.esperado! + 1);
    expect(l.razao).toBeCloseTo(an.pontos!.esperado / an.pontos!.desvio, 1);
    expect(an.pontos!.p20).toBeNull(); // sem simulação no ranking
  });
});

describe("conferência fora da amostra", () => {
  it("probabilidades calibradas: previsto ≈ observado em cada faixa", () => {
    const cal = calibrar(demo, SCORING);
    expect(cal.previsoes).toBeGreaterThan(10000);
    expect([4, 8, 16, Infinity]).toContain(cal.meiaVida);
    for (const f of cal.faixas.filter((x) => x.n >= 500)) expect(Math.abs(f.previsto - f.observado)).toBeLessThan(0.06);
    const sg = cal.porScout.find((x) => x.codigo === "SG")!;
    expect(Math.abs(sg.previsto - sg.observado)).toBeLessThan(0.03);
    // o modelo é pelo menos tão bom quanto a frequência da posição nos scouts de volume
    for (const c of ["FIN", "DS"] as const) expect(cal.porScout.find((x) => x.codigo === c && x.limiar === 1)!.habilidade).toBeGreaterThan(0);
  }, 60000);
});

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
