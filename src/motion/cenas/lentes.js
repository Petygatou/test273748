// Cena 3, lentes: a câmera mergulhou na lente (roteiro). A seção passa por trás dela: dentro, nítida; fora,
// borrada. Cada marco sobe um cartão novo por trás da lente, e a própria lente demonstra o tipo: o corredor
// da multifocal, os reflexos que o antirreflexo limpa, a borda grossa que afina.
import { gsap } from 'gsap';
import { EASE, lerp } from '../ease.js';
import { MARCOS, INI } from '../roteiro.js';
import { trocaPlano, finalizaTroca } from '../foco.js';
import { entra, sai } from '../ui.js';

export function lentes(ctx) {
  const { cartoes, textos } = ctx.itens;
  const demo = ctx.oculos.demo;
  const secao = document.querySelector('.lentes');
  const conta = secao.querySelector('.lentes__conta');
  const nota = secao.querySelector('.lentes__nota');
  conta.innerHTML = conta.innerHTML.replace(/<span([^>]*)>([^<]*)<\/span>/g, '<span class="mascara"><span$1>$2</span></span>');
  nota.innerHTML = `<span class="mascara">${nota.innerHTML}</span>`;
  const num = secao.querySelector('.lentes__n');
  const marcos = [...MARCOS.lentes, INI.sol + 0.12];
  let demoTl = null;
  const grupo = k => [cartoes[k], ...textos[k]];

  function rodaDemo(k, imediato) {
    demoTl?.kill();
    const alvo = { multi: 0, fantasma: 0, varreAR: -0.3, grosso: 0 };
    // visão simples: nítida de borda a borda, sem franja de cor; nas outras, a franja normal
    gsap.to(demo, { franja: k === 0 ? 0.12 : 1, duration: imediato ? 0 : 0.6, ease: EASE.io });
    if (imediato || ctx.reduzido) {
      if (k === 1) alvo.multi = 1;
      if (k === 2) { alvo.fantasma = 1; alvo.varreAR = 1.4; }
      Object.assign(demo, alvo);
      return;
    }
    demoTl = gsap.timeline();
    if (k === 1) demoTl.to(demo, { multi: 1, fantasma: 0, grosso: 0, duration: 1.0, ease: EASE.io }, 0.55);
    else if (k === 2) {
      demoTl.set(demo, { varreAR: -0.3 }).to(demo, { fantasma: 1, multi: 0, grosso: 0, duration: 0.5, ease: EASE.out }, 0.3)
        .to(demo, { varreAR: 1.4, duration: 1.35, ease: 'power2.inOut' }, 1.0);
    } else if (k === 3) {
      demoTl.to(demo, { grosso: 1, multi: 0, fantasma: 0, duration: 0.45, ease: EASE.out }, 0.25)
        .to(demo, { grosso: 0, duration: 1.3, ease: EASE.io }, 1.05);
    } else demoTl.to(demo, { multi: 0, fantasma: 0, grosso: 0, duration: 0.5, ease: EASE.io }, 0);
  }

  function cartao(k, de, imediato) {
    const H = innerHeight;
    finalizaTroca();
    num.textContent = `${String(k + 1).padStart(2, '0')}/04`;
    rodaDemo(k, imediato);
    if (imediato || de < 1) {
      cartoes.forEach((c, j) => { if (j !== k) gsap.killTweensOf(grupo(j)); });
      return;
    }
    // a foto nova se funde sobre a velha (sem emenda); a frase velha sai antes e a nova sobe devagar depois
    const dir = k > de - 1 ? 1 : -1;
    const fv = cartoes[de - 1], fn = cartoes[k];
    const tv = textos[de - 1], tn = textos[k];
    for (let j = 0; j < 4; j++) if (j !== k && j !== de - 1) for (const it of grupo(j)) { gsap.killTweensOf(it); it.opac = 0; it.dy = 0; }
    gsap.killTweensOf([fv, fn, ...tv, ...tn]);
    fv.dy = 0; fn.dy = 0;
    fn.mesh.renderOrder = fn.ordem + 0.5;
    gsap.fromTo(fn, { opac: fv.opac > 0.5 ? 0 : fn.opac }, { opac: 1, duration: 1.5, ease: EASE.io, onComplete: () => { fv.opac = 0; fn.mesh.renderOrder = fn.ordem; } });
    gsap.to(tv, { opac: 0, dy: -H * 0.035 * dir, duration: 0.55, ease: EASE.in, onComplete: () => tv.forEach(it => { it.dy = 0; }) });
    // um tween por linha (com stagger, um killTweensOf por item não para o tween e a frase volta)
    tn.forEach((it, j) => gsap.fromTo(it, { opac: 0, dy: H * 0.05 * dir }, { opac: 1, dy: 0, duration: 1.2, ease: EASE.out, delay: 0.6 + j * 0.12 }));
  }

  return {
    marcos,
    vai(i, de, imediato) {
      if (i === 0) {
        // antes do mergulho (as armações cuidam da placa na volta)
        secao.classList.remove('ativa');
        sai(conta, { imediato }); sai(nota, { imediato });
        rodaDemo(0, true);
        if (de > 0) for (let j = 0; j < 4; j++) for (const it of grupo(j)) gsap.killTweensOf(it);
        return;
      }
      if (i >= 1 && i <= 4) {
        const k = i - 1;
        secao.classList.add('ativa');
        if (de <= 0 || de === 5 || imediato) {
          const todos = ctx.itens.todos;
          trocaPlano({ sai: todos.filter(it => !grupo(k).includes(it)), entra: grupo(k), base: 5.0, imediato: imediato || de === 5 });
          entra(conta, { imediato, atraso: 0.3 }); entra(nota, { imediato, atraso: 0.4 });
          num.textContent = `${String(k + 1).padStart(2, '0')}/04`;
          rodaDemo(k, imediato);
          if (de === 5 && k === 3 && !imediato) for (const it of textos[3]) gsap.fromTo(it, { opac: 0 }, { opac: 1, duration: 0.6, ease: EASE.out });
        } else cartao(k, de, imediato);
        return;
      }
      // saída para o sol: a frase sai, a interface sai, a praia fica e abre (roteiro)
      secao.classList.remove('ativa');
      sai(conta, { imediato }); sai(nota, { imediato });
      gsap.to(textos[3], { opac: 0, duration: imediato ? 0 : 0.4, ease: EASE.in });
      rodaDemo(-1, imediato);
    },
    quadro(y, dt, s) {
      // a praia: o cartão 4 vira janela para a tela inteira, e depois desbota no papel
      const c = cartoes[3];
      const k = s.praiaAbre;
      if (k > 0.001) {
        const r = { x: c.x, y: c.y, w: c.w, h: c.h };
        c.recorte = { x: lerp(r.x, 0, k), y: lerp(r.y, 0, k), w: lerp(r.w, innerWidth, k), h: lerp(r.h, innerHeight, k), raio: lerp(c.raio, 0, k) };
      } else c.recorte = null;
      if (y > INI.sol) c.opac = s.praiaOpac;
      // dentro do sol a foto não leva o véu escuro dos cartões
      const v = lerp(0.62, 1, k);
      c.cor.setRGB(v, v, v);
    },
  };
}
