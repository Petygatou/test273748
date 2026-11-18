// Cena 5, os 7 dias: do exame à entrega. Quatro fotos do processo soltas no papel atravessam a tela com o
// scroll, desfocadas (a última ainda está saindo quando a promessa começa a se formar); os óculos acompanham a foto da vez e a lente mais perto dela a deixa nítida. As
// legendas (interface) andam presas ao pé de cada foto. Entrada e saída são trocas de plano, por marco.
import { MARCOS, INI, pista } from '../roteiro.js';
import { trocaPlano } from '../foco.js';
import { faixa, curva, lerp } from '../ease.js';

export function dias(ctx) {
  const { fotos } = ctx.itens;
  const secao = document.querySelector('.dias');
  const legendas = [...secao.querySelectorAll('.dias__legenda')];
  const marcos = [...MARCOS.dias, MARCOS.fecho[0]];
  const D = INI.dias, F = INI.fecho;
  let altura = 0;

  return {
    marcos,
    resize() {
      const r = document.querySelector('.dias__fotos').getBoundingClientRect();
      altura = r.height;
    },
    vai(i, de, imediato) {
      if (i === 1) {
        secao.classList.add('ativa');
        trocaPlano({ sai: ctx.itens.todos.filter(it => !fotos.includes(it)), entra: fotos, base: 3.5, imediato });
        return;
      }
      // fora da cena: quem entra (o sol na volta, o fecho na ida) cuida da placa
      secao.classList.remove('ativa');
    },
    quadro(y) {
      // o conjunto entra pelo pé da tela e sai pelo topo, ao longo da cena
      const H = innerHeight;
      const k = faixa(y, D, F, curva.linear);
      const dy = lerp(H * 1.02, -altura - H * 0.05, k);
      let somaX = 0, somaP = 0;
      fotos.forEach((it, j) => {
        it.dy = dy;
        const cy = it.y + it.h * 0.5 + dy;
        const cx = it.x + it.w * 0.5;
        // a foto mais perto do meio da tela puxa os óculos para ela (peso estreito: o par vai de uma foto
        // à outra, nunca para no meio do caminho)
        const p = Math.exp(-(((cy - H * 0.5) / (H * 0.16)) ** 2)) + 1e-6;
        somaX += p * cx; somaP += p;
        const lg = legendas[j];
        const direita = cx > innerWidth * 0.5;
        const lx = direita ? it.x + it.w - lg.offsetWidth : it.x;
        lg.style.transform = `translate(${lx.toFixed(1)}px, ${(it.y + it.h + dy + 16).toFixed(1)}px)`;
      });
      // centro dos óculos: a lente do lado da foto fica sobre ela (o par nunca sai da tela)
      const alvoX = somaP > 1e-3 ? somaX / somaP : innerWidth * 0.5;
      const lado = alvoX > innerWidth * 0.5 ? 1 : -1;
      const meioPar = innerWidth * (innerWidth <= 720 ? 0.17 : 0.105);
      const lim = innerWidth <= 720 ? 0.37 : 0.3;
      const x = Math.min(Math.max(alvoX - lado * meioPar, innerWidth * lim), innerWidth * (1 - lim));
      pista.diasX = x / innerWidth;
    },
  };
}
