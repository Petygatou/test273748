// O foco do site: um nível de desfoque global para a camada de leitura (fora das lentes) e um para dentro
// das lentes. As trocas de texto grande são "mudanças de plano": o que sai vai para o desfoque fundo, a troca
// acontece dentro da névoa e o que entra se forma do mesmo desfoque. Nunca dois textos nítidos ao mesmo tempo.
import { gsap } from 'gsap';
import { EASE } from './ease.js';

// salto: a névoa que cobre um corte quando a rolagem se afasta demais do filme (o diretor anima)
export const foco = { base: 4.6, extra: 0, lente: 0, salto: 0 };
const NEVOA = 6.1;

let corrente = null;
let pendente = null;

/** aplica já o estado dos itens de uma troca que ainda não chegou na névoa (sem mexer no foco) */
export function finalizaTroca() {
  if (pendente) { const f = pendente; pendente = null; f(); }
}

/**
 * troca de plano: `sai` e `entra` são listas de itens da placa; `base` é o desfoque de repouso depois da troca.
 * Se `imediato`, aplica o estado final sem animar (carga no meio da página, movimento reduzido).
 */
export function trocaPlano({ sai = [], entra = [], base = foco.base, imediato = false, aoTrocar, duracao = 1 }) {
  finalizaTroca();
  corrente?.kill();
  // quem sai e quem entra perde qualquer animação em curso (senão um tween antigo reafirma a opacidade)
  // o que entra cresce junto com o foco (no papel claro, um texto escuro surgindo inteiro na névoa vira uma
  // mancha que aparece do nada); o que já estava visível fica como está
  const troca = (suave = false) => {
    for (const it of sai) if (!entra.includes(it)) { gsap.killTweensOf(it); it.opac = 0; it.dy = 0; }
    for (const it of entra) {
      gsap.killTweensOf(it);
      it.dy = 0;
      if (suave && it.opac < 0.99) gsap.fromTo(it, { opac: 0 }, { opac: 1, duration: 1.2 * duracao, ease: 'power1.inOut' });
      else it.opac = 1;
    }
    aoTrocar?.();
  };
  if (imediato) {
    troca();
    foco.base = base; foco.extra = 0; foco.lente = 0;
    corrente = null;
    return null;
  }
  const tl = gsap.timeline();
  tl.to(foco, { extra: Math.max(0, NEVOA - foco.base), lente: 3.6, duration: 0.7 * duracao, ease: 'power2.in' });
  const saem = sai.filter(it => !entra.includes(it));
  if (saem.length) { gsap.killTweensOf(saem); tl.to(saem, { opac: 0, duration: 0.7 * duracao, ease: 'power2.in' }, 0); }
  pendente = troca;
  tl.add(() => {
    if (pendente === troca) { pendente = null; troca(true); }
    foco.extra = Math.max(0, NEVOA - base);
    foco.base = base;
  });
  tl.to(foco, { extra: 0, duration: 1.5 * duracao, ease: 'power2.out' });
  tl.to(foco, { lente: 0, duration: 1.25 * duracao, ease: 'power2.out' }, '<');
  corrente = tl;
  return tl;
}

/** muda só o desfoque de repouso, sem troca de texto */
export function ajustaFoco(base, duracao = 0.8) {
  finalizaTroca();
  corrente?.kill();
  corrente = gsap.to(foco, { base, extra: 0, lente: 0, duration: duracao, ease: EASE.io });
  return corrente;
}

/** a caçada da abertura: borra, quase acerta, borra, trava (a interface trava nítida; o título fica desfocado) */
export function cacaFoco(base, aoPasso) {
  finalizaTroca();
  corrente?.kill();
  foco.base = base;
  foco.extra = NEVOA - base;
  foco.lente = 4.5;
  const tl = gsap.timeline();
  tl.to(foco, { extra: 1.2 - base, lente: 0.7, duration: 0.7, ease: 'power2.inOut', onStart: () => aoPasso?.(0) })
    .to(foco, { extra: 3.5 - base, lente: 2.4, duration: 0.42, ease: 'power2.inOut', onStart: () => aoPasso?.(1) })
    .to(foco, { extra: 0, lente: 0, duration: 0.75, ease: EASE.out, onStart: () => aoPasso?.(2) });
  corrente = tl;
  return tl;
}
