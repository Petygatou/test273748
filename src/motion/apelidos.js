// "Chame como quiser": enquanto a seção atravessa a tela, os quatro adesivos se afastam do título (cada um para um
// lado, girando um pouco) e o Capiá cruza a tela de lambreta, da esquerda para a direita, com um pulinho no meio.
import { naRolagem, limita, suave, reduzido } from './rolagem.js';

// deslocamento (px) e giro (graus) de cada adesivo no fim do curso; no meio da tela todos estão no lugar
const FORCAS = [
  [33, -43, 9],
  [-32, 44, -10],
  [24, 45, 9],
  [-28, -37, -7],
];

// a lambreta: de onde sai e aonde chega (vw), a altura do pulinho (px), o giro do começo ao fim (graus) e em que
// trecho da passagem da seção ela anda (começa aos 5% e leva 90%)
const VOO = { de: -106, ate: 106, pulo: 52, puloNoCelular: 27, giroDe: 6.2, giroAte: -4.8, comeca: 0.05, dura: 0.9 };

// no celular tudo anda um pouco menos
const NO_CELULAR = 0.72;

export function iniciaApelidos() {
  const secao = document.querySelector('[data-apelidos]');
  if (!secao || reduzido) return;
  const adesivos = [...secao.querySelectorAll('[data-apelido]')];
  const voo = secao.querySelector('[data-voo]');
  const celular = matchMedia('(max-width: 575.98px)');

  naRolagem((altura) => {
    const caixa = secao.getBoundingClientRect();
    if (caixa.bottom < -240 || caixa.top > altura + 240) return;
    const progresso = limita((altura - caixa.top) / (altura + caixa.height));
    const centrado = (suave(progresso) - 0.5) * 2;
    const forca = celular.matches ? NO_CELULAR : 1;

    adesivos.forEach((el, i) => {
      const [x, y, giro] = FORCAS[i % FORCAS.length];
      el.style.setProperty('--ax', `${(x * centrado * forca).toFixed(2)}px`);
      el.style.setProperty('--ay', `${(y * centrado * forca).toFixed(2)}px`);
      el.style.setProperty('--ar', `${(giro * centrado * forca).toFixed(2)}deg`);
    });

    if (voo) {
      const v = limita((progresso - VOO.comeca) / VOO.dura);
      const pulo = celular.matches ? VOO.puloNoCelular : VOO.pulo;
      voo.style.setProperty('--voo-x', `${(VOO.de + v * (VOO.ate - VOO.de)).toFixed(2)}vw`);
      voo.style.setProperty('--voo-y', `${(-pulo * Math.sin(v * Math.PI)).toFixed(2)}px`);
      voo.style.setProperty('--voo-r', `${(VOO.giroDe + v * (VOO.giroAte - VOO.giroDe)).toFixed(2)}deg`);
    }
  });
}
