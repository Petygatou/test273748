// A casa: selos e fotos entram presos à rolagem. Cada um começa quando o topo dele passa de 97% da altura da tela e
// termina em 58%: aparece (opacidade), sobe com um leve rebote e cresce até o tamanho final. Um pequeno atraso por
// ordem faz a fila entrar em cascata.
import { naRolagem, limita, suave, reduzido } from './rolagem.js';

// onde a entrada começa e termina (fração da altura da tela) e quanto passa do ponto antes de assentar
const COMECA = 0.97;
const TERMINA = 0.58;
const PASSA = 1.42;
// de quantos px cada peça sobe, de que tamanho ela nasce e o atraso (em px de rolagem) entre uma e a seguinte
const SELOS = { sobe: 112, escala: 0.92, atraso: 30 };
const FOTOS = { sobe: 168, escala: 0.895, atraso: 20 };

const rebote = (p) => 1 + (PASSA + 1) * (p - 1) ** 3 + PASSA * (p - 1) ** 2;

// posição no documento sem contar os transforms (o próprio movimento não pode mexer na conta)
const topoNoDocumento = (el) => {
  let topo = 0;
  for (let no = el; no; no = no.offsetParent) topo += no.offsetTop || 0;
  return topo;
};

function aplica(el, progresso, { sobe, escala }) {
  const movimento = rebote(progresso);
  el.style.setProperty('--vis', suave(progresso).toFixed(4));
  el.style.setProperty('--sobe', `${((1 - movimento) * sobe).toFixed(2)}px`);
  el.style.setProperty('--cresce', (escala + (1 - escala) * movimento).toFixed(4));
}

export function iniciaCasa() {
  const secao = document.querySelector('[data-casa]');
  if (!secao || reduzido) return;
  const selos = [...secao.querySelectorAll('[data-selo]')];
  const fotos = [...secao.querySelectorAll('[data-foto]')];

  naRolagem((altura) => {
    const caixa = secao.getBoundingClientRect();
    if (caixa.bottom < -320 || caixa.top > altura + 320) return;
    const comeca = altura * COMECA;
    const curso = comeca - altura * TERMINA;
    const rolado = window.scrollY;
    selos.forEach((el, i) => aplica(el, limita((comeca - (topoNoDocumento(el) - rolado) - i * SELOS.atraso) / curso), SELOS));
    fotos.forEach((el, i) => aplica(el, limita((comeca - (topoNoDocumento(el) - rolado) - i * FOTOS.atraso) / curso), FOTOS));
  });
}
