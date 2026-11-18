// Cena 6, fecho: "Prontos em até 7 dias." se forma da névoa atrás dos óculos, lido inteiro pelas lentes. No
// segundo marco o estojo vira um play, por tempo e sem o scroll no meio: as hastes dobram, o estojo sobe
// aberto, os óculos sobem, deitam e descem para dentro dele, a tampa fecha e a luz da página apaga. Rolar
// de volta passa o play ao contrário. O pouso no painel do fim é do diretor.
import * as THREE from 'three';
import { gsap } from 'gsap';
import { EASE } from '../ease.js';
import { MARCOS, INI } from '../roteiro.js';
import { trocaPlano } from '../foco.js';

const TINTA = new THREE.Color('#111110');
const OSSO = new THREE.Color('#f1f1ef');

export function fecho(ctx) {
  const { fecho: titulo } = ctx.itens;
  const d = ctx.diretor;
  const pl = d.play;
  const cor = { k: 0 };
  const pintaTitulo = () => titulo.forEach(it => it.cor.copy(TINTA).lerp(OSSO, cor.k));

  const adiantado = () => d.real > INI.fim - 0.15;
  const RAPIDO = 2;
  const play = gsap.timeline({ paused: true })
    .to(pl, { dobraD: 1.55, duration: 0.75, ease: EASE.io }, 0)
    .to(pl, { dobraE: 1.5, duration: 0.75, ease: EASE.io }, 0.28)
    .to(pl, { sobe: 1, duration: 1.1, ease: EASE.out }, 0.3)
    // os óculos deitam: a lente deixa de mirar a promessa
    .to(d.extra, { miraCena: 0, duration: 0.5, ease: EASE.in }, 1.1)
    .to(pl, { deita: 1, duration: 1.7, ease: 'none' }, 1.15)
    .to(pl, { tampa: 0, duration: 0.75, ease: 'power2.inOut' }, 2.9)
    // a luz apaga: o papel vira breu e a promessa clareia, ainda desfocada
    .to(pl, { escuro: 1, duration: 1.2, ease: EASE.io }, 3.55)
    .to(cor, { k: 1, duration: 1.2, ease: EASE.io, onUpdate: pintaTitulo }, 3.55);

  return {
    marcos: MARCOS.fecho,
    vai(i, de, imediato) {
      if (i === 0) {
        // de volta às fotos (a cena dos 7 dias troca a placa)
        play.pause(0);
        cor.k = 0; pintaTitulo();
        gsap.to(d.extra, { miraCena: 0, duration: imediato ? 0 : 0.4, ease: EASE.in });
        return;
      }
      if (de <= 0) {
        // a promessa se forma da névoa das fotos; a lente mira ela inteira
        cor.k = 0; pintaTitulo();
        d.miraCaixa = d.caixaFecho;
        trocaPlano({ sai: ctx.itens.todos.filter(it => !titulo.includes(it)), entra: titulo, base: 4.4, imediato, duracao: 1.1 });
        gsap.to(d.extra, { miraCena: 1, duration: imediato ? 0 : 1.2, ease: EASE.io });
      }
      if (i === 1) {
        // na volta do play, de trás para a frente e um pouco mais rápido
        if (de === 2 && !imediato) { play.timeScale(1.5).reverse(); gsap.to(d.extra, { miraCena: 1, duration: 0.8, delay: 1.2, ease: EASE.io }); }
        else if (imediato) play.pause(0);
        return;
      }
      // i === 2: o play; se a rolagem já chegou ao fim (link, salto), ele já aparece pronto
      if (imediato || ctx.reduzido || d.y > INI.fim) { play.pause(play.duration()); pintaTitulo(); return; }
      play.timeScale(adiantado() ? RAPIDO : 1).play();
    },
    quadro() {
      // a rolagem encostou na parede do fim e o play não terminou: ele acelera até fechar (o painel nunca
      // sobe com o estojo aberto em cima dele)
      if (adiantado() && play.progress() < 1) {
        if (play.reversed() || !play.isActive()) play.reversed(false).play();
        play.timeScale(RAPIDO);
      }
    },
  };
}
