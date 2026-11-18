// Cena 4, sol: a página estourou de branco (roteiro: a luz sobe de dentro da lente) e as lentes escureceram
// para G-15. O título está na camada de leitura: estourado fora, na exposição certa pela lente escura.
// Segundo marco: a polarizada tira o brilho do sol na água.
import { gsap } from 'gsap';
import { EASE } from '../ease.js';
import { MARCOS, INI } from '../roteiro.js';
import { trocaPlano } from '../foco.js';
import { entra, sai } from '../ui.js';

export function sol(ctx) {
  const { sol: titulos, cartoes } = ctx.itens;
  const demo = ctx.oculos.demo;
  const secao = document.querySelector('.sol');
  const lead = secao.querySelector('.sol__lead');
  const det = secao.querySelector('.sol__det');
  const marcos = [...MARCOS.sol, INI.dias + 0.08];
  const praia = cartoes[3];
  const d = ctx.diretor;

  return {
    marcos,
    vai(i, de, imediato) {
      const dur = imediato ? 0 : 0.8;
      if (i === 0) {
        secao.classList.remove('ativa');
        sai(lead, { imediato }); sai(det, { imediato });
        gsap.to(titulos, { opac: 0, duration: imediato ? 0 : 0.35, ease: EASE.in });
        gsap.to(demo, { polar: 0, duration: dur });
        gsap.to(d.extra, { miraCena: 0, duration: imediato ? 0 : 0.35, ease: EASE.in });
        return;
      }
      if (i <= 2) {
        secao.classList.add('ativa');
        if (de <= 0 || de === 3 || imediato) { entra(lead, { imediato, atraso: 0.15 }); entra(det, { imediato, atraso: 0.3 }); }
        const k = i - 1;
        // a lente mira a frase da vez: a troca de alvo acontece dentro da névoa, junto com a troca de texto
        if (de <= 0 || de === 3 || imediato) d.miraCaixa = d.frasesSol[k];
        gsap.to(d.extra, { miraCena: 1, duration: imediato ? 0 : 0.6, ease: EASE.io });
        trocaPlano({ sai: ctx.itens.todos.filter(it => it !== titulos[k] && it !== praia), entra: [titulos[k]], base: 3.6, imediato, duracao: 0.9, aoTrocar: () => { d.miraCaixa = d.frasesSol[k]; } });
        if (praia.opac < 1 && !imediato) gsap.to(praia, { opac: 1, duration: 0.3 });
        gsap.to(demo, { polar: k === 1 ? 1 : 0, duration: k === 1 ? 1.1 : 0.5, delay: k === 1 && !imediato ? 0.35 : 0, ease: EASE.io });
        return;
      }
      // saída para os 7 dias (as fotos se formam da névoa)
      secao.classList.remove('ativa');
      sai(lead, { imediato }); sai(det, { imediato });
      gsap.killTweensOf(titulos);
      gsap.to(titulos, { opac: 0, duration: imediato ? 0 : 0.35, ease: EASE.in });
      gsap.to(d.extra, { miraCena: 0, duration: imediato ? 0 : 0.3, ease: EASE.in });
      gsap.to(demo, { polar: 0, duration: dur });
    },
  };
}
