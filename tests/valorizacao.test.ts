import { describe, expect, it } from "vitest";
import { cartoletaPorPonto, fatorInflacao, formulaDaRodada, minimoParaValorizar, pesos, precoMedioReverso, valorizacao } from "../src/engine/valorizacao";

/**
 * Amostra da rodada 4 do Cartola 2025 (valores públicos do mercado, publicados pelo CartolaAnalítico
 * no repositório ModeloCartoletas): [jogos, preço, preço médio, média, pontos, valorização real].
 * O fator de inflação daquela rodada, calculado com os 301 atletas que jogaram, foi 0,12387.
 */
const R4_2025: Array<[number, number, number, number, number, number]> = [
  [3, 11.27, 12.02, 3.7, 7.6, -0.11], // Fábio (Fluminense, gol)
  [3, 5.78, 6.52, 2.47, -0.3, -0.6], // Edenílson (Grêmio, mei)
  [3, 7.7, 8.3, 3.73, 3.9, 0.07], // Enner Valencia (Internacional, ata)
  [0, 5.0, 5.0, 0.0, 2.3, 0.19], // Rincón (Santos, mei)
  [2, 4.98, 5.32, 1.05, 13.2, 2.5], // Lucas Silva (Cruzeiro, mei)
  [3, 9.79, 10.05, 4.4, 5.5, -0.23], // Léo Pereira (Flamengo, zag)
  [3, 6.42, 6.74, 3.6, 0.0, -0.66], // Thaciano (Santos, mei)
  [2, 6.3, 6.34, 2.05, 1.8, -0.63], // João Pedro (Grêmio, lat)
  [2, 8.99, 8.62, 6.05, -0.1, -1.11], // Arboleda (São Paulo, zag)
  [3, 12.08, 12.6, 6.47, 0.8, -1.21], // John (Botafogo, gol)
  [2, 16.18, 17.07, 4.05, 4.4, -1.4], // Matheus Pereira (Cruzeiro, mei)
  [3, 7.37, 6.51, 4.83, 1.5, -1.02], // Kuscevic (Fortaleza, zag)
  [3, 15.54, 16.74, 4.23, 13.6, 0.4], // Arias (Fluminense, mei)
  [2, 10.69, 10.1, 6.95, 4.7, -0.29], // Matheuzinho (Corinthians, lat)
  [2, 4.79, 5.23, 2.2, 1.9, 0.12], // Matheus Alexandre (Sport, lat)
  [3, 11.41, 11.48, 6.12, 3.97, -0.67], // Juan Vojvoda (Fortaleza, tec)
  [3, 6.37, 6.02, 3.76, 6.03, 0.36], // Thiago Carpini (Vitória, tec)
  [2, 3.69, 3.53, 2.55, 0.5, -0.31], // Ênio (Juventude, ata)
  [1, 5.41, 5.2, 2.9, 0.0, -0.77], // Calebe (Fortaleza, mei)
  [2, 5.39, 5.61, 1.75, 6.9, 0.92], // Matheus Martins (Botafogo, ata)
  [3, 8.79, 8.77, 5.8, 3.2, -0.18], // Cuiabano (Botafogo, lat)
  [3, 6.21, 5.86, 4.17, 4.17, 0.11], // Pepa (Sport, tec)
  [3, 6.43, 5.91, 4.0, 0.5, -0.99], // Vinicinho (Bragantino, ata)
  [3, 4.45, 3.88, 3.67, 7.08, 1.03], // Rafael Guanaes (Mirassol, tec)
  [0, 6.0, 6.0, 0.0, 0.0, -0.8], // Gabriel Carvalho (Internacional, mei)
];
const S_R4 = 0.12387;
const atletas = R4_2025.map(([jogos, preco, precoMedio, media, pontos, real]) => ({ jogos, preco, precoMedio, media, pontos, real }));

describe("fórmula de valorização do Cartola (2025)", () => {
  it("reproduz a valorização real de cada atleta da amostra com erro de no máximo 1 centavo", () => {
    for (const a of atletas) expect(Math.abs(valorizacao(a, S_R4) - a.real)).toBeLessThanOrEqual(0.011);
  });

  it("fator de inflação de um mercado em equilíbrio fica perto de 0,13", () => {
    const s = fatorInflacao(atletas);
    expect(s).toBeGreaterThan(0.11);
    expect(s).toBeLessThan(0.14);
  });

  it("pesos: média e preço médio dividem o peso nos 5 primeiros jogos; depois 4 e 5", () => {
    expect(pesos(1)).toEqual({ ka: 2, kc: 7 });
    expect(pesos(5)).toEqual({ ka: 4, kc: 5 });
    expect(pesos(20)).toEqual({ ka: 4, kc: 5 });
  });

  it("no mínimo para valorizar a valorização é zero; cada ponto acima vale a inclinação", () => {
    for (const a of atletas) {
      const mpv = minimoParaValorizar(a, S_R4);
      expect(valorizacao({ ...a, pontos: mpv }, S_R4, 0)).toBeCloseTo(0, 9);
      expect(valorizacao({ ...a, pontos: mpv + 1 }, S_R4, 0)).toBeCloseTo(cartoletaPorPonto(a.jogos, S_R4), 9);
    }
  });

  it("o preço médio sai de volta da variação real (fórmula ao contrário)", () => {
    for (const a of atletas) {
      const depois = a.preco + a.real;
      if (depois <= 0.71) continue;
      const g = a.jogos + 1;
      const cm = precoMedioReverso({ precoAtual: depois, pontos: a.pontos, mediaDepois: (a.media * a.jogos + a.pontos) / g, jogosDepois: g }, S_R4)!;
      expect(Math.abs(cm - a.precoMedio)).toBeLessThan(0.02);
    }
  });

  it("prepara o mínimo da próxima rodada para quem jogou a rodada passada", () => {
    const athletes = [
      { id: 1, preco: 10, variacao: 0.5, media: 5, jogos: 10 },
      { id: 2, preco: 8, variacao: -0.3, media: 4, jogos: 10 }, // não jogou a rodada passada
    ];
    const f = formulaDaRodada(athletes, new Map([[1, 8]]), 0.13);
    expect([...f.keys()]).toEqual([1]);
    const x = f.get(1)!;
    // com o preço médio recuperado, a fórmula devolve exatamente o preço atual para os pontos feitos
    expect(valorizacao({ pontos: 8, preco: 0, precoMedio: x.precoMedio, media: (5 * 10 - 8) / 9, jogos: 9 }, 0.13)).toBeCloseTo(10, 6);
    expect(x.porPonto).toBeCloseTo(0.13 * (1 + 4 / 11), 9);
  });
});
