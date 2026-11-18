// Cabeçalho: o suspenso "Cardápio" (mouse, teclado e toque) e a gaveta do menu nas telas menores.
import { trava, solta } from './rolagem.js';

export function iniciaTopo() {
  // —— suspenso ——
  for (const grupo of document.querySelectorAll('[data-suspenso]')) {
    const botao = grupo.querySelector('[data-suspenso-botao]');
    const abre = (sim) => { grupo.classList.toggle('aberto', sim); botao?.setAttribute('aria-expanded', String(sim)); };
    let saindo = 0;
    grupo.addEventListener('pointerenter', (evento) => { if (evento.pointerType === 'mouse') { clearTimeout(saindo); abre(true); } });
    grupo.addEventListener('pointerleave', (evento) => { if (evento.pointerType === 'mouse') saindo = setTimeout(() => abre(false), 160); });
    // com o mouse o menu já abriu ao encostar: o clique mantém aberto (fechar é sair de cima, Esc ou clicar fora).
    // Teclado (clique sem ponteiro) e toque alternam
    let ponteiro = 'mouse';
    botao?.addEventListener('pointerdown', (evento) => { ponteiro = evento.pointerType; });
    botao?.addEventListener('click', (evento) => {
      const comMouse = evento.detail > 0 && ponteiro === 'mouse';
      abre(comMouse ? true : !grupo.classList.contains('aberto'));
    });
    grupo.addEventListener('focusout', (evento) => { if (!grupo.contains(evento.relatedTarget)) abre(false); });
    grupo.addEventListener('keydown', (evento) => { if (evento.key === 'Escape') { abre(false); botao?.focus(); } });
    grupo.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => abre(false)));
    document.addEventListener('pointerdown', (evento) => { if (!grupo.contains(evento.target)) abre(false); });
  }

  // —— gaveta ——
  const gaveta = document.querySelector('[data-gaveta]');
  const fundo = document.querySelector('[data-fundo-gaveta]');
  const abridor = document.querySelector('[data-abre-gaveta]');
  if (!gaveta || !abridor) return;

  function mostra(sim) {
    gaveta.classList.toggle('aberta', sim);
    gaveta.inert = !sim;
    abridor.setAttribute('aria-expanded', String(sim));
    if (fundo) {
      if (sim) { fundo.hidden = false; requestAnimationFrame(() => fundo.classList.add('aberta')); }
      else { fundo.classList.remove('aberta'); setTimeout(() => { if (!gaveta.classList.contains('aberta')) fundo.hidden = true; }, 320); }
    }
    document.documentElement.style.overflow = sim ? 'hidden' : '';
    if (sim) { trava(); gaveta.querySelector('[data-fecha-gaveta]')?.focus({ preventScroll: true }); }
    else { solta(); }
  }
  abridor.addEventListener('click', () => mostra(true));
  fundo?.addEventListener('click', () => { mostra(false); abridor.focus(); });
  gaveta.addEventListener('click', (evento) => {
    if (evento.target.closest('[data-fecha-gaveta], .gaveta__opcao')) mostra(false);
  });
  gaveta.addEventListener('keydown', (evento) => { if (evento.key === 'Escape') { mostra(false); abridor.focus(); } });
  matchMedia('(min-width: 900px)').addEventListener?.('change', (mq) => { if (mq.matches) mostra(false); });

  const cardapio = gaveta.querySelector('[data-gaveta-cardapio]');
  const sub = gaveta.querySelector('[data-gaveta-sub]');
  cardapio?.addEventListener('click', () => {
    const abrir = cardapio.getAttribute('aria-expanded') !== 'true';
    cardapio.setAttribute('aria-expanded', String(abrir));
    if (sub) sub.hidden = !abrir;
  });
}
