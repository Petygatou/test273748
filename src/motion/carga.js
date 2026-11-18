// Loader: o símbolo (dois aros e a ponte) se desenha em traço conforme o carregamento, e a acuidade embaixo
// sobe de 20/200 a 20/20. No fim, o símbolo sai de foco e a página aparece já desfocada atrás dele.
import { gsap } from 'gsap';
import { EASE } from './ease.js';

const ACUIDADE = ['20/200', '20/100', '20/70', '20/50', '20/40', '20/30', '20/25', '20/20'];

export class Carga {
  constructor(total) {
    this.el = document.querySelector('.carga');
    this.tracos = [...this.el.querySelectorAll('circle, path')];
    this.texto = this.el.querySelector('.carga__acuidade');
    this.total = total;
    this.feitos = 0;
    this.p = { v: 0 };
    this.inicio = performance.now();
    this.desenha();
  }

  desenha() {
    const v = this.p.v;
    // cada aro se fecha numa parte do caminho; a ponte entra por último
    const partes = [[0, 0.45], [0.3, 0.8], [0.72, 1]];
    this.tracos.forEach((t, i) => {
      const [a, b] = partes[i];
      const k = Math.min(1, Math.max(0, (v - a) / (b - a)));
      t.setAttribute('stroke-dashoffset', String(Math.round(1000 * (1 - k))));
    });
    const n = Math.min(ACUIDADE.length - 1, Math.floor(v * (ACUIDADE.length - 1) + 0.0001));
    if (this.texto.textContent !== ACUIDADE[n]) this.texto.textContent = ACUIDADE[n];
  }

  passo() {
    this.feitos++;
    const alvo = Math.min(1, this.feitos / this.total);
    gsap.to(this.p, { v: alvo, duration: 0.6, ease: EASE.io, overwrite: true, onUpdate: () => this.desenha() });
  }

  /** termina o desenho (com um mínimo de tempo na tela) e sai de foco */
  async fim(reduzido, aoSair) {
    const resta = Math.max(0, 1.3 - (performance.now() - this.inicio) / 1000);
    await gsap.to(this.p, { v: 1, duration: Math.max(0.45, resta), ease: EASE.io, overwrite: true, onUpdate: () => this.desenha() });
    await new Promise(r => setTimeout(r, 180));
    const filho = [this.el.querySelector('.carga__marca'), this.texto];
    aoSair?.();
    if (reduzido) {
      await gsap.to(this.el, { opacity: 0, duration: 0.4 });
    } else {
      const b = { px: 0 };
      const tl = gsap.timeline();
      tl.to(b, { px: 18, duration: 0.7, ease: EASE.in, onUpdate: () => filho.forEach(f => (f.style.filter = `blur(${b.px}px)`)) }, 0);
      tl.to(filho, { opacity: 0, duration: 0.7, ease: EASE.in }, 0);
      tl.to(this.el, { backgroundColor: 'rgba(5,5,5,0)', duration: 0.55, ease: 'power1.in' }, 0.25);
      await tl;
    }
    this.el.classList.add('fora');
    this.el.style.display = 'none';
  }
}
