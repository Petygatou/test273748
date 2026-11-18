// Interações: a íris dos preenchimentos abre (e fecha) a partir do ponto do mouse ou do toque.
// O resto (foco que muda de lugar, aro de lente no teclado, clique que refoca) é CSS: sections/interacoes.css.
export function interacoes() {
  const alvo = el => (el.matches('.chips label') ? el.querySelector('span') : el);
  const marca = (e, el) => {
    const t = alvo(el);
    const r = t.getBoundingClientRect();
    // a íris nasce dentro do elemento (na saída o ponteiro pode estar longe)
    const k = v => Math.min(100, Math.max(0, v * 100));
    t.style.setProperty('--x', `${k((e.clientX - r.left) / r.width)}%`);
    t.style.setProperty('--y', `${k((e.clientY - r.top) / r.height)}%`);
  };
  for (const el of document.querySelectorAll('.pilula, .seta, .chips label')) {
    for (const ev of ['pointerenter', 'pointerdown', 'pointerleave']) el.addEventListener(ev, e => marca(e, el));
  }
  // toque: o :active não é confiável no celular (o Safari só aplica com listener de toque); a classe
  // .toque faz o mesmo papel do hover e do clique, e fica pelo menos 260 ms para o dedo ver a resposta
  const tocaveis = '.pilula, .seta, .chips label, .nav__links a, .nav__marca, .rodape a, .pontos button';
  for (const el of document.querySelectorAll(tocaveis)) {
    let desde = 0;
    el.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse') return; marca(e, el.matches('.pilula, .seta, .chips label') ? el : el); el.classList.add('toque'); desde = performance.now(); });
    const solta = () => { const resta = Math.max(0, 260 - (performance.now() - desde)); setTimeout(() => el.classList.remove('toque'), resta); };
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(ev, solta);
  }
}
