// A borda de papel rasgado que separa as seções: o papel de embrulho do lanche. É um desenho só, gerado aqui por
// sorteio com semente fixa (sai sempre igual), e entra na página como máscara (--borda, posta no <head> pelo
// vite.config.js). Quem usa pinta o fundo com a cor da seção de baixo: a área pintada é a que fica abaixo da linha.

const sorteio = (semente) => () => {
  // mulberry32: pequeno, rápido e determinístico
  let t = (semente += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export function caminhoDaBorda({ largura = 1440, altura = 44, semente = 7 } = {}) {
  const r = sorteio(semente);
  const meio = altura * 0.52;
  const pontos = [];
  let x = 0;
  const fase1 = r() * 6.28, fase2 = r() * 6.28;
  while (x < largura) {
    // ondas longas (o rasgo "anda") mais dentes curtos e, de vez em quando, uma lasca
    let y = meio + Math.sin(x / 190 + fase1) * altura * 0.16 + Math.sin(x / 57 + fase2) * altura * 0.1;
    y += (r() - 0.5) * altura * 0.24;
    if (r() < 0.14) y += (r() - 0.5) * altura * 0.5;
    pontos.push([x, Math.min(altura - 3, Math.max(3, y))]);
    x += 5 + r() * 13;
  }
  pontos.push([largura, pontos[0][1]]);
  const n = (v) => Math.round(v * 10) / 10;
  return `M0 ${altura}L${pontos.map(([px, py]) => `${n(px)} ${n(py)}`).join('L')}L${largura} ${altura}Z`;
}

export function bordaComoMascara(opcoes = {}) {
  const { largura = 1440, altura = 44 } = opcoes;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${largura} ${altura}' preserveAspectRatio='none'><path d='${caminhoDaBorda(opcoes)}'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg).replace(/'/g, '%27')}")`;
}
