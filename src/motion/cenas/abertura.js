// Cena 1, abertura: a página nasce fora de foco, o foco caça uma vez e trava na interface (o título fica
// desfocado); os óculos descem girando até a pose da hero. A interface da hero sai no primeiro marco.
import { gsap } from 'gsap';
import { EASE } from '../ease.js';
import { MARCOS } from '../roteiro.js';
import { cacaFoco, foco } from '../foco.js';
import { entra, sai, surge, some } from '../ui.js';

export function abertura(ctx) {
  const prazo = document.querySelector('.prazo');
  const chamada = document.querySelector('.chamada');
  const pilula = chamada.querySelector('.pilula');
  const fio = chamada.querySelector('.chamada__fio');
  const vinte = document.querySelector('.vinte span');

  function mostra(imediato) {
    entra(prazo, { imediato, passo: 0.08 });
    gsap.killTweensOf([pilula, fio, vinte]);
    if (imediato) { gsap.set(pilula, { opacity: 1, y: 0 }); gsap.set(fio, { scaleX: 1 }); gsap.set(vinte, { yPercent: 0, opacity: 1 }); return; }
    surge(pilula, { atraso: 0.12 });
    gsap.fromTo(fio, { scaleX: 0 }, { scaleX: 1, duration: 1.1, ease: EASE.io, delay: 0.3 });
    gsap.fromTo(vinte, { yPercent: 38, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 1.2, ease: EASE.out, delay: 0.2 });
  }
  function esconde(imediato) {
    sai(prazo, { imediato });
    gsap.killTweensOf([pilula, fio, vinte]);
    if (imediato) { gsap.set(pilula, { opacity: 0 }); gsap.set(fio, { scaleX: 0 }); gsap.set(vinte, { yPercent: 38, opacity: 0 }); return; }
    gsap.to(pilula, { opacity: 0, duration: 0.3, ease: EASE.in });
    gsap.to(fio, { scaleX: 0, transformOrigin: 'right', duration: 0.45, ease: EASE.in, onComplete: () => gsap.set(fio, { transformOrigin: 'left' }) });
    gsap.to(vinte, { yPercent: 30, opacity: 0, duration: 0.45, ease: EASE.in });
  }

  return {
    marcos: [MARCOS.abertura[0]],
    pronto: false,
    vai(i, de, imediato) {
      if (!this.pronto) return;
      if (i === 0) mostra(imediato); else esconde(imediato);
    },

    /** estado inicial da entrada, aplicado antes do loader sair (a página aparece já em névoa) */
    prepara() {
      if (ctx.reduzido) return;
      const d = ctx.diretor;
      const iface = document.querySelector('.interface');
      d.extra.dyOculos = ctx.palco.visivel().h * 0.95;
      d.extra.giro = -Math.PI * 2.2;
      d.extra.mouse = 0;
      foco.base = 4.6; foco.extra = 1.5; foco.lente = 4.5;
      iface.style.filter = 'blur(16px)';
    },

    /** a entrada: começa junto com a saída do loader */
    intro() {
      const d = ctx.diretor;
      const iface = document.querySelector('.interface');
      this.pronto = true;
      if (ctx.reduzido) {
        gsap.set(iface, { filter: 'none' });
        if (this.atual === 0) mostra(true); else esconde(true);
        return gsap.timeline();
      }
      // a interface já está no lugar: quem a revela é o foco que caça
      if (this.atual === 0) mostra(true); else esconde(true);
      const borrao = { px: 16 };
      const aplica = () => { iface.style.filter = borrao.px > 0.05 ? `blur(${borrao.px.toFixed(2)}px)` : 'none'; };
      aplica();
      const tl = gsap.timeline();
      // o foco caça: borra, quase acerta, borra, trava (a interface acompanha e trava nítida)
      tl.add(cacaFoco(4.6, passo => {
        const alvo = [1.6, 6.5, 0][passo];
        const dur = [0.7, 0.42, 0.75][passo];
        gsap.to(borrao, { px: alvo, duration: dur, ease: passo === 2 ? EASE.out : 'power2.inOut', onUpdate: aplica });
      }), 0.25);
      tl.to(d.extra, { dyOculos: 0, duration: 2.3, ease: 'expo.out' }, 0.3);
      tl.to(d.extra, { giro: 0, duration: 2.5, ease: 'power3.out' }, 0.3);
      tl.to(d.extra, { mouse: 1, duration: 1.2, ease: 'power2.inOut' }, 2.2);
      return tl;
    },
  };
}
