// O roteiro: o tamanho de cada cena (em telas de rolagem) e tudo o que segue o scroll — pose dos óculos,
// mergulho na lente, exposição do sol, tinta da lente, os óculos seguindo as fotos dos 7 dias. O estojo é
// um play por tempo (cena do fecho). Texto e estados não estão
// aqui: entram por marco, nos módulos de cada cena.
import { faixa, lerp, curva, clamp01 } from './ease.js';

export const CENAS = [
  { id: 'abertura', telas: 0.9 },
  { id: 'armacoes', telas: 2.9 },
  { id: 'lentes', telas: 3.8 },
  { id: 'sol', telas: 2.4 },
  { id: 'dias', telas: 3.2 },
  { id: 'fecho', telas: 1.7 },
];
// uma "tela" do roteiro vale PASSO alturas de rolagem: dá tempo de ver cada estado antes do próximo marco
export const PASSO = 2;
export const INI = {};
{
  let a = 0;
  for (const c of CENAS) { INI[c.id] = a; a += c.telas; }
  INI.fim = a;
}

// marcos (posição absoluta em telas)
export const MARCOS = {
  abertura: [0.06, 0.42],
  armacoes: [1, 2, 3].map(k => INI.armacoes + 0.725 * k),
  lentes: [INI.lentes + 0.22, ...[1, 2, 3].map(k => INI.lentes + 0.92 + 0.72 * k)],
  sol: [INI.sol + 0.5, INI.sol + 1.55],
  dias: [INI.dias + 0.1],
  // fecho: a promessa entra; depois o estojo é um "play" (por tempo, nunca preso ao scroll)
  fecho: [INI.fecho - 0.25, INI.fecho + 0.95],
};

// paradas: o meio de cada trecho entre marcos, onde o estado está assentado; a rolagem encosta nelas
export const PARADAS = (() => {
  const m = [...new Set(Object.values(MARCOS).flat())].sort((a, b) => a - b);
  const p = [0];
  for (let i = 0; i < m.length - 1; i++) if (m[i + 1] - m[i] > 0.25) p.push((m[i] + m[i + 1]) / 2);
  return p;
})();

// pistas que as cenas calculam a cada quadro e o roteiro usa (os 7 dias: x do centro dos óculos, fração da tela)
export const pista = { diasX: 0.5 };

const celular = () => innerWidth <= 720;
/** movimento reduzido: sem o balanço das armações (o diretor liga) */
export const opcoes = { reduzido: false };

/** intenção de pose em fração da tela → pose no mundo */
export function poseTela(palco, { cx, cy, largura, yaw = 0, pitch = 0, roll = 0 }) {
  const v = palco.visivel();
  const s = (largura * v.w) / 140;
  return { px: (cx - 0.5) * v.w, py: (0.5 - cy) * v.h, pz: 0, s, yaw, pitch, roll };
}
/** aproxima os óculos da câmera até a lente direita ocupar `raio` da altura, centrada */
export function poseLente(palco, base, raio, cxMm, raioMm) {
  const t = Math.tan((palco.camera.fov * Math.PI) / 360);
  const d = (raioMm * base.s) / (2 * raio * t);
  return { px: -base.s * cxMm, py: 0, pz: palco.distancia - d, s: base.s, yaw: 0, pitch: 0, roll: 0 };
}
export function misturaPose(a, b, k) {
  return {
    px: lerp(a.px, b.px, k), py: lerp(a.py, b.py, k), pz: lerp(a.pz, b.pz, k), s: lerp(a.s, b.s, k),
    yaw: lerp(a.yaw, b.yaw, k), pitch: lerp(a.pitch, b.pitch, k), roll: lerp(a.roll, b.roll, k),
  };
}

/** poses-chave, recalculadas no resize */
export function posesChave(palco) {
  const m = celular();
  const P = intent => poseTela(palco, intent);
  const hero = P(m ? { cx: 0.5, cy: 0.445, largura: 0.96, yaw: -0.38, pitch: -0.16, roll: -0.04 } : { cx: 0.47, cy: 0.465, largura: 0.6, yaw: -0.44, pitch: -0.17, roll: -0.045 });
  const frente = P(m ? { cx: 0.5, cy: 0.43, largura: 0.9, pitch: -0.05 } : { cx: 0.5, cy: 0.5, largura: 0.5, pitch: -0.05 });
  const lente = poseLente(palco, frente, m ? 0.2 : 0.445, 34.0, 23.6);
  const sol = P(m ? { cx: 0.5, cy: 0.42, largura: 0.94, pitch: -0.04 } : { cx: 0.5, cy: 0.5, largura: 0.6, pitch: -0.04 });
  const dias = P(m ? { cx: 0.5, cy: 0.5, largura: 0.7, pitch: -0.04 } : { cx: 0.5, cy: 0.5, largura: 0.4, pitch: -0.04 });
  const alto = P(m ? { cx: 0.5, cy: 0.47, largura: 0.66, pitch: 0.08 } : { cx: 0.5, cy: 0.42, largura: 0.44, pitch: 0.08 });
  return { hero, frente, lente, sol, dias, alto, vw: palco.visivel().w };
}

/** avalia as pistas em y (telas) e escreve os alvos */
export function avalia(y, K, alvo) {
  const A = INI.armacoes, L = INI.lentes, S = INI.sol, E = INI.dias, F = INI.fecho;
  let pose;
  if (y < A) {
    pose = misturaPose(K.hero, K.frente, faixa(y, 0.12, A, curva.io));
  } else if (y < L) {
    // armações: a pose balança de um lado a outro e passa de frente em cada marco (quando o modelo troca)
    const fase = ((y - A) / 1.45) * Math.PI * 2;
    const amp = opcoes.reduzido ? 0 : celular() ? 0.5 : 0.62;
    pose = { ...K.frente, yaw: Math.sin(fase) * amp, pitch: K.frente.pitch + Math.sin(fase * 0.5) * 0.06, roll: Math.sin(fase) * -0.035 };
    // o fim das armações já começa a virar de frente para o mergulho
    const k = faixa(y, L - 0.3, L, curva.io);
    pose.yaw *= 1 - k; pose.pitch = lerp(pose.pitch, 0, k); pose.roll *= 1 - k;
  } else if (y < S) {
    pose = misturaPose(K.frente, K.lente, faixa(y, L, L + 0.85, curva.io));
  } else if (y < E) {
    pose = misturaPose(K.lente, K.sol, faixa(y, S, S + 0.95, curva.io));
    const k = faixa(y, S + 0.9, E, curva.linear);
    pose.yaw += Math.sin(k * Math.PI) * 0.12;
  } else {
    // os 7 dias: os óculos seguem a foto da vez; no fecho sobem para a promessa
    const dias = { ...K.dias, px: (pista.diasX - 0.5) * K.vw };
    pose = misturaPose(K.sol, dias, faixa(y, E, E + 0.6, curva.io));
    if (y >= F - 0.25) pose = misturaPose(pose, K.alto, faixa(y, F - 0.25, F + 0.45, curva.io));
  }
  alvo.pose = pose;

  // sol: a luz sobe de dentro da lente até cobrir a tela; a lente escurece junto
  const subida = faixa(y, S + 0.05, S + 0.9, curva.io);
  const descida = faixa(y, E + 0.02, E + 0.55, curva.io);
  alvo.expoRaio = lerp(0, 2.6, subida);
  alvo.expoForca = lerp(1, 5.2, subida) * (1 - descida) + descida * 1;
  alvo.tinta = clamp01(subida * 1.05) * (1 - descida);
  // a praia: abre do cartão até a tela inteira, e depois desbota no papel dos 7 dias
  alvo.praiaAbre = faixa(y, S + 0.02, S + 0.8, curva.io);
  alvo.praiaOpac = (y > L + 2.6 ? 1 : 0) * (1 - faixa(y, E + 0.05, E + 0.6, curva.io));
  // fundo da página: preto até a praia cobrir, papel daí em diante (o play do estojo apaga a luz no fim)
  alvo.papel = y > S + 0.75 ? 1 : 0;

  return alvo;
}
