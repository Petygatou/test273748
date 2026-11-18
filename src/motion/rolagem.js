// Rolagem suave (Lenis) e um ponto único para tudo o que se mexe com a rolagem: cada módulo registra uma função em
// naRolagem() e ela roda no máximo uma vez por quadro, com a altura da tela.
// (o CSS do Lenis entra pela folha src/styles/site.css, nunca por aqui: CSS importado pelo JS chega atrasado no dev)
import Lenis from 'lenis';

export const reduzido = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const limita = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v));
export const suave = (p) => p * p * (3 - 2 * p);

let lenis = null;
let quadro = 0;
const ouvintes = new Set();

function pinta() {
  quadro = 0;
  const altura = window.innerHeight || document.documentElement.clientHeight;
  for (const f of ouvintes) f(altura);
}
export const pede = () => { if (!quadro) quadro = requestAnimationFrame(pinta); };
export const naRolagem = (f) => { ouvintes.add(f); pede(); };

export function iniciaRolagem() {
  if (!reduzido) {
    lenis = new Lenis({
      autoRaf: true, anchors: true, allowNestedScroll: true, smoothWheel: true, syncTouch: false,
      lerp: 0.094, wheelMultiplier: 0.96, touchMultiplier: 1,
    });
    lenis.on('scroll', pede);
    const ajusta = () => lenis?.resize();
    addEventListener('load', ajusta, { once: true });
    addEventListener('pageshow', ajusta);
    document.fonts?.ready.then(ajusta);
  }
  addEventListener('scroll', pede, { passive: true });
  addEventListener('resize', pede, { passive: true });
  document.fonts?.ready.then(pede);
  pede();
}

export function rolaPara(y) {
  if (lenis) lenis.scrollTo(Math.max(0, y));
  else scrollTo({ top: Math.max(0, y), behavior: 'auto' });
}
export const trava = () => lenis?.stop();
export const solta = () => lenis?.start();
