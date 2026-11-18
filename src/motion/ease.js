// Curvas da Grau. Entradas assentam devagar; saídas são curtas; passagens têm início e fim macios.
// grau-foco é a caçada do foco: passa do ponto e volta, como o anel de uma câmera.
import { gsap } from 'gsap';
import { CustomEase } from 'gsap/CustomEase';

gsap.registerPlugin(CustomEase);

CustomEase.create('grau-out', 'M0,0 C0.16,0.84 0.3,1 1,1');
CustomEase.create('grau-in', 'M0,0 C0.55,0 0.85,0.4 1,1');
CustomEase.create('grau-io', 'M0,0 C0.62,0 0.18,1 1,1');
CustomEase.create('grau-snap', 'M0,0 C0.3,0.9 0.4,1 1,1');

export const EASE = { out: 'grau-out', in: 'grau-in', io: 'grau-io', snap: 'grau-snap' };

/** funções puras para as pistas presas ao scroll */
export const curva = {
  linear: t => t,
  io: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  out: t => 1 - Math.pow(1 - t, 3),
  in: t => t * t * t,
  suave: t => t * t * (3 - 2 * t),
};

export const clamp01 = x => Math.min(1, Math.max(0, x));
export const lerp = (a, b, t) => a + (b - a) * t;
/** 0 → 1 entre a e b (posição na trilha), com curva */
export const faixa = (y, a, b, f = curva.io) => f(clamp01((y - a) / (b - a)));
/** amortecimento exponencial independente de fps */
export const amortece = (atual, alvo, lambda, dt) => alvo + (atual - alvo) * Math.exp(-lambda * dt);
