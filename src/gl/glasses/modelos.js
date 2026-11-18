// Os quatro modelos da Grau, em milímetros. Cada lente é uma superelipse com expoente e meias-larguras
// próprios em cima, embaixo, por fora (lado da haste) e por dentro (lado do nariz), mais "bossas"
// que puxam o canto do gatinho e a gota do aviador. Ângulo 0 = para fora, 90° = para cima.
//
// medida: largura da lente □ ponte (gravada na haste); haste: comprimento em mm.

export const MODELOS = [
  {
    id: 'quadrada', nome: 'Quadrada', medida: '50□21', haste: 145, cor: 'tartaruga',
    lente: { fora: 25.2, dentro: 24.0, cima: 20.6, baixo: 22.6, nCima: 3.6, nBaixo: 2.7, bossas: [[-0.55, -0.5, 0.55]] },
    aro: { base: 4.7, cima: 1.3, baixo: -0.4, canto: 1.4 },
    ponte: { dbl: 21, topo: 14.2, base: 5.0, arco: 4.2 },
    orelha: { y: 11, alto: 11, fora: 3.6 },
    espessura: 5.6, curva: 0.0013,
  },
  {
    id: 'gatinho', nome: 'Gatinho', medida: '52□18', haste: 140, cor: 'preto',
    lente: { fora: 26.4, dentro: 24.2, cima: 15.6, baixo: 19.6, nCima: 2.9, nBaixo: 2.4, bossas: [[0.5, 7.2, 0.36], [2.6, -2.2, 0.55], [-1.2, -1.6, 0.6]] },
    aro: { base: 4.4, cima: 1.6, baixo: -0.9, canto: 6.5 },
    ponte: { dbl: 18, topo: 12.8, base: 4.4, arco: 4.4 },
    orelha: { y: 13.5, alto: 10, fora: 4.4 },
    espessura: 5.8, curva: 0.0014,
  },
  {
    id: 'aviador', nome: 'Aviador', medida: '56□16', haste: 145, cor: 'verde',
    lente: { fora: 28.4, dentro: 25.6, cima: 20.2, baixo: 25.5, nCima: 5.2, nBaixo: 2.3, bossas: [[-0.78, 3.6, 0.62], [-2.3, -3.8, 0.5]] },
    aro: { base: 4.2, cima: 1.4, baixo: -0.6, canto: 1.0 },
    ponte: { dbl: 16, topo: 17.0, base: 7.6, arco: 3.6 },
    orelha: { y: 14, alto: 9, fora: 3.4 },
    espessura: 5.0, curva: 0.0016,
  },
  {
    id: 'redonda', nome: 'Redonda', medida: '47□22', haste: 145, cor: 'cristal',
    lente: { fora: 23.6, dentro: 23.6, cima: 23.6, baixo: 23.6, nCima: 2, nBaixo: 2, bossas: [] },
    aro: { base: 4.5, cima: 0.8, baixo: -0.2, canto: 0.8 },
    ponte: { dbl: 22, topo: 12.0, base: 4.0, arco: 4.6 },
    orelha: { y: 9.5, alto: 10, fora: 3.4 },
    espessura: 5.6, curva: 0.0012,
  },
];

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;

/** raio da lente na direção t (rad), a partir do centro da lente */
export function raioLente(m, t) {
  const L = m.lente;
  const c = Math.cos(t), s = Math.sin(t);
  const kx = smooth(-0.35, 0.35, c), ky = smooth(-0.45, 0.45, s);
  const a = mix(L.dentro, L.fora, kx), b = mix(L.baixo, L.cima, ky);
  const n = mix(L.nBaixo, L.nCima, ky);
  let r = Math.pow(Math.pow(Math.abs(c) / a, n) + Math.pow(Math.abs(s) / b, n), -1 / n);
  for (const [ang, amp, larg] of L.bossas) {
    let d = t - ang; d = Math.atan2(Math.sin(d), Math.cos(d));
    r += amp * Math.exp(-(d * d) / (larg * larg));
  }
  return r;
}

/** largura do aro na direção t */
export function larguraAro(m, t) {
  const A = m.aro, s = Math.sin(t);
  let d = t - 0.5; d = Math.atan2(Math.sin(d), Math.cos(d));
  return A.base + A.cima * Math.max(0, s) ** 1.5 + A.baixo * Math.max(0, -s) + A.canto * Math.exp(-(d * d) / 0.28);
}

/** centro da lente direita (x > 0) */
export const centroLente = m => m.ponte.dbl / 2 + m.lente.dentro;

/** dobradiça: onde a haste encaixa, atrás da orelha (ponta de fora do aro) */
export function dobradica(m) {
  const cx = centroLente(m);
  const r0 = raioLente(m, 0) + larguraAro(m, 0);
  return { x: cx + r0 + m.orelha.fora - 2.6, y: m.orelha.y };
}

/** retângulo (mm) coberto pela metade direita da frente, com folga, para a textura de distância */
export const RET = { x0: 0, x1: 80, y0: -34, y1: 34 };
