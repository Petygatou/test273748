// Entradas e saídas da interface (DOM). Linha entra pela máscara, de baixo, com duração fixa; sai no lugar,
// apagando, sem atravessar a máscara. Nada disso é preso ao scroll: só os marcos disparam.
import { gsap } from 'gsap';
import { EASE } from './ease.js';

/** envolve o texto de cada filho numa máscara (para entrar por linha) */
export function mascara(el) {
  for (const p of el.querySelectorAll(':scope > p, :scope p')) {
    if (p.querySelector(':scope > .mascara') || p.closest('.mascara')) continue;
    const s = document.createElement('span');
    s.className = 'mascara';
    const i = document.createElement('span');
    while (p.firstChild) i.appendChild(p.firstChild);
    s.appendChild(i);
    p.appendChild(s);
  }
}

const linhas = el => (el ? [...el.querySelectorAll('.mascara > span')] : []);

export function entra(el, { atraso = 0, imediato = false, passo = 0.07 } = {}) {
  const s = linhas(el);
  if (!s.length) return;
  gsap.killTweensOf(s);
  if (imediato) { gsap.set(s, { yPercent: 0, opacity: 1, overwrite: true }); return; }
  // um tween por linha (stagger com atraso escapa do kill quando a saída vem antes da entrada começar)
  s.forEach((l, k) => gsap.fromTo(l, { yPercent: 160, opacity: 1 }, { yPercent: 0, opacity: 1, duration: 0.95, ease: EASE.out, delay: atraso + k * passo, overwrite: true }));
}

export function sai(el, { imediato = false } = {}) {
  const s = linhas(el);
  if (!s.length) return;
  gsap.killTweensOf(s);
  if (imediato) { gsap.set(s, { yPercent: 160, opacity: 0, overwrite: true }); return; }
  gsap.to(s, { opacity: 0, duration: 0.32, ease: EASE.in, overwrite: true, onComplete: () => gsap.set(s, { yPercent: 160, opacity: 0 }) });
}

/** elemento sem máscara: sobe pouco e acende */
export function surge(els, { atraso = 0, imediato = false, y = 16, duracao = 0.9 } = {}) {
  gsap.killTweensOf(els);
  if (imediato) { gsap.set(els, { opacity: 1, y: 0, visibility: 'visible', overwrite: true }); return; }
  [].concat(els).forEach((e, k) => gsap.fromTo(e, { opacity: 0, y, visibility: 'visible' }, { opacity: 1, y: 0, duration: duracao, ease: EASE.out, delay: atraso + k * 0.06, overwrite: true }));
}

export function some(els, { imediato = false } = {}) {
  gsap.killTweensOf(els);
  if (imediato) { gsap.set(els, { opacity: 0, visibility: 'hidden', overwrite: true }); return; }
  gsap.to(els, { opacity: 0, duration: 0.32, ease: EASE.in, overwrite: true, onComplete: () => gsap.set(els, { visibility: 'hidden' }) });
}

/** cor da interface (nav, setas, legendas): clara sobre o breu, tinta sobre o papel */
const corUi = { ui: '#f1f1ef', ui2: '#8d8d88', fio: 'rgba(241,241,239,0.24)' };
export function corInterface(clara, imediato = false) {
  const raiz = document.documentElement;
  const alvo = clara ? { ui: '#f1f1ef', ui2: '#8d8d88', fio: 'rgba(241,241,239,0.24)' } : { ui: '#111110', ui2: '#5f5b54', fio: 'rgba(17,17,16,0.2)' };
  const aplica = () => { raiz.style.setProperty('--ui', corUi.ui); raiz.style.setProperty('--ui-2', corUi.ui2); raiz.style.setProperty('--ui-fio', corUi.fio); };
  gsap.killTweensOf(corUi);
  if (imediato) { Object.assign(corUi, alvo); aplica(); return; }
  gsap.to(corUi, { ...alvo, duration: 0.6, ease: EASE.io, onUpdate: aplica });
}
