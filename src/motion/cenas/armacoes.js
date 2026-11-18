// Cena 2, armações: os mesmos óculos trocam de forma a cada marco (morph de 0,9 s) e a cor nova se espalha
// pelo acetato a partir da ponte. O nome entra grande atrás, desfocado (nítido pela lente), com a medida
// gravada. O giro dos óculos é do roteiro (preso ao scroll); aqui só os marcos.
import { gsap } from 'gsap';
import { EASE } from '../ease.js';
import { MARCOS, INI, PASSO } from '../roteiro.js';
import { trocaPlano } from '../foco.js';
import { MODELOS } from '../../gl/glasses/modelos.js';
import { entra, sai, mascara, surge, some } from '../ui.js';

export function armacoes(ctx) {
  const oc = ctx.oculos;
  const { titulo, nomes } = ctx.itens;
  const secao = document.querySelector('.armacoes');
  const itensFicha = [...secao.querySelectorAll('.ficha__item')];
  const conta = secao.querySelector('.ficha__conta');
  const medidas = [...secao.querySelectorAll('.medida span')];
  const setas = document.querySelector('.setas');
  const pontos = [...document.querySelectorAll('.pontos button')];
  itensFicha.forEach(mascara);
  conta.innerHTML = `<span class="mascara"><span>${conta.innerHTML}</span></span>`;
  const n = secao.querySelector('.ficha__n');
  const marcos = [MARCOS.abertura[1], INI.armacoes + 0.725, INI.armacoes + 1.45, INI.armacoes + 2.175, MARCOS.lentes[0]];
  let morph = null;
  let modeloAtual = 0;

  function trocaModelo(para, imediato) {
    const e = oc.estado;
    morph?.kill();
    if (imediato || ctx.reduzido) {
      Object.assign(e, { a: para, b: para, morph: 0, corA: MODELOS[para].cor, corB: MODELOS[para].cor, varre: 999 });
      if (ctx.reduzido && !imediato) {
        // movimento reduzido: troca por uma fusão curta da cor, sem morph longo
        Object.assign(e, { a: modeloAtual, b: para, morph: 0, corA: MODELOS[modeloAtual].cor, corB: MODELOS[para].cor, varre: -40 });
        morph = gsap.timeline({ onComplete: fim }).to(e, { morph: 1, varre: 260, duration: 0.35, ease: 'none' });
      }
      modeloAtual = para;
      return;
    }
    // parte do que está mais visível agora (rolagem rápida não acumula morphs)
    const de = e.morph > 0.5 ? e.b : e.a;
    Object.assign(e, { a: de, b: para, morph: 0, corA: MODELOS[de].cor, corB: MODELOS[para].cor, varre: -30 });
    morph = gsap.timeline({ onComplete: fim })
      .to(e, { morph: 1, duration: 0.95, ease: EASE.io }, 0)
      .to(e, { varre: 230, duration: 1.25, ease: 'power2.inOut' }, 0.05);
    modeloAtual = para;
    function fim() { Object.assign(e, { a: para, b: para, morph: 0, corA: MODELOS[para].cor, corB: MODELOS[para].cor, varre: 999 }); }
  }

  function ficha(m, de, imediato) {
    itensFicha.forEach((it, k) => { if (k !== m) sai(it, { imediato: imediato || k !== de }); });
    entra(itensFicha[m], { imediato, atraso: imediato ? 0 : 0.25, passo: 0.06 });
    n.textContent = String(m + 1).padStart(2, '0');
    medidas.forEach((s, k) => gsap.to(s, { opacity: k === m ? 1 : 0, duration: imediato ? 0 : 0.5, delay: k === m && !imediato ? 0.45 : 0, ease: EASE.io }));
    pontos.forEach((p, k) => p.setAttribute('aria-current', k === m ? 'true' : 'false'));
    setas.querySelector('[data-dir="-1"]').disabled = m === 0;
    setas.querySelector('[data-dir="1"]').disabled = m === 3;
  }

  // setas e pontos: passam de modelo rolando até o marco (a troca é sempre pelo scroll)
  const irPara = m => ctx.diretor.vaiPara((m === 0 ? marcos[0] + 0.25 : marcos[m] + 0.3) * innerHeight * PASSO, 1.1);
  setas.addEventListener('click', e => {
    const b = e.target.closest('.seta');
    if (!b) return;
    const atual = Math.max(0, Math.min(3, this_.atual - 1));
    irPara(Math.max(0, Math.min(3, atual + +b.dataset.dir)));
  });
  pontos.forEach((p, k) => p.addEventListener('click', () => irPara(k)));

  const this_ = {
    marcos,
    resize() {
      // a medida fica no canto de cima, à direita, de cada nome
      // (no celular, sem espaço ao lado, a medida desce para baixo do nome, alinhada à direita)
      const margem = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--gutter')) || 20;
      nomes.forEach((it, k) => {
        const r = it.el.getBoundingClientRect();
        const s = medidas[k];
        const w = s.getBoundingClientRect().width;
        const cabe = r.right + 10 + w < innerWidth - margem;
        const x = cabe ? r.right + 10 : r.right - w;
        const y = cabe ? r.top + r.height * 0.16 : r.bottom + 6;
        s.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
      });
    },
    vai(i, de, imediato) {
      if (i === 0) {
        // volta para a abertura: o nome sai em névoa, o título volta
        trocaPlano({ sai: ctx.itens.todos.filter(it => !titulo.includes(it)), entra: titulo, base: 4.6, imediato });
        secao.classList.remove('ativa');
        itensFicha.forEach(it => sai(it, { imediato }));
        sai(conta, { imediato });
        medidas.forEach(s => gsap.to(s, { opacity: 0, duration: imediato ? 0 : 0.3, overwrite: true }));
        trocaModelo(0, imediato);
        surge(setas, { imediato }); surge(document.querySelector('.pontos'), { imediato });
        pontos.forEach((p, k) => p.setAttribute('aria-current', k === 0 ? 'true' : 'false'));
        setas.querySelector('[data-dir="-1"]').disabled = true;
        setas.querySelector('[data-dir="1"]').disabled = false;
        return;
      }
      if (i === marcos.length) {
        // a câmera mergulhou na lente: a interface das armações sai (a cena Lentes troca a placa).
        // Daqui para frente o modelo é sempre a Redonda de cristal (a lente que vira janela é um círculo).
        this_.sai(imediato);
        if (modeloAtual !== 3 || oc.estado.b !== 3) trocaModelo(3, true);
        return;
      }
      const m = i - 1;
      secao.classList.add('ativa');
      if (de <= 0 || de === marcos.length) {
        // entrando (do começo, de um salto ou voltando das lentes): sai o que estiver na placa, entra o nome
        trocaPlano({ sai: ctx.itens.todos.filter(it => it !== nomes[m]), entra: [nomes[m]], base: 4.1, imediato });
        entra(conta, { imediato });
        surge(setas, { imediato }); surge(document.querySelector('.pontos'), { imediato });
      } else {
        trocaPlano({ sai: ctx.itens.todos.filter(it => it !== nomes[m]), entra: [nomes[m]], base: 4.1, imediato, duracao: 0.85 });
      }
      if (m !== modeloAtual || imediato) trocaModelo(m, imediato);
      ficha(m, de - 1, imediato);
    },
    sai(imediato) {
      secao.classList.remove('ativa');
      itensFicha.forEach(it => sai(it, { imediato }));
      sai(conta, { imediato });
      medidas.forEach(s => gsap.to(s, { opacity: 0, duration: imediato ? 0 : 0.3, overwrite: true }));
      some(setas, { imediato });
      some(document.querySelector('.pontos'), { imediato });
    },
  };
  return this_;
}
