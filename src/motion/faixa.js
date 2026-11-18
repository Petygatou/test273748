// A faixa de palavras: as duas linhas deslizam para a esquerda conforme a seção atravessa a tela (não é um letreiro
// por tempo: parada a rolagem, param as palavras).
import { naRolagem, limita, suave, reduzido } from './rolagem.js';

// desencontro fixo de cada linha, em % da largura da tela
const BASES = [-13.4, 1.6];
// quanto as linhas andam do começo ao fim da passagem, em vw (para cada lado do meio)
const ANDA = 14.5;
const ANDA_NO_CELULAR = 30;
const REPETICOES = 4;

export function iniciaFaixa() {
  const secao = document.querySelector('[data-faixa]');
  if (!secao) return;
  const trilhos = [...secao.querySelectorAll('[data-trilho-faixa]')];
  const celular = matchMedia('(max-width: 575.98px)');

  // cada trilho começa uma repetição inteira para trás, para nunca faltar palavra na ponta esquerda
  const mede = () => trilhos.forEach((trilho, i) => {
    const periodo = trilho.scrollWidth / REPETICOES;
    trilho.style.setProperty('--base', `${((BASES[i % BASES.length] / 100) * secao.clientWidth - periodo).toFixed(1)}px`);
  });
  mede();
  new ResizeObserver(mede).observe(secao);
  document.fonts?.ready.then(mede);
  if (reduzido) return;

  naRolagem((altura) => {
    const caixa = secao.getBoundingClientRect();
    if (caixa.bottom < -120 || caixa.top > altura + 120) return;
    const progresso = limita((altura - caixa.top) / (altura + caixa.height));
    const centrado = (suave(progresso) - 0.5) * 2;
    const distancia = celular.matches ? ANDA_NO_CELULAR : ANDA;
    for (const trilho of trilhos) trilho.style.setProperty('--anda', `${(-centrado * distancia).toFixed(2)}vw`);
  });
}
