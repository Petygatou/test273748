// Barra de rolagem própria: fina, por cima do palco (a nativa fica escondida), arrastável, na cor da interface.
export function barra(diretor) {
  const el = document.querySelector('.barra');
  const pol = el.querySelector('.barra__polegar');
  let arrasto = null;
  const medidas = () => {
    const total = document.documentElement.scrollHeight - innerHeight;
    const h = Math.max(36, (innerHeight * innerHeight) / document.documentElement.scrollHeight);
    return { total, h };
  };
  const quadro = () => {
    const { total, h } = medidas();
    const y = total > 0 ? (diretor.scroll() / total) * (innerHeight - h) : 0;
    pol.style.height = `${h}px`;
    pol.style.transform = `translateY(${y}px)`;
    requestAnimationFrame(quadro);
  };
  requestAnimationFrame(quadro);

  const leva = e => {
    const { total, h } = medidas();
    const k = Math.min(1, Math.max(0, (e.clientY - arrasto.dy) / (innerHeight - h)));
    if (diretor.lenis) diretor.lenis.scrollTo(k * total, { immediate: true });
    else scrollTo(0, k * total);
  };
  el.addEventListener('pointerdown', e => {
    const { total, h } = medidas();
    const y = total > 0 ? (diretor.scroll() / total) * (innerHeight - h) : 0;
    const noPolegar = e.clientY >= y && e.clientY <= y + h;
    arrasto = { dy: noPolegar ? e.clientY - y : h / 2 };
    el.classList.add('arrastando');
    el.setPointerCapture(e.pointerId);
    leva(e);
  });
  el.addEventListener('pointermove', e => { if (arrasto) leva(e); });
  const solta = () => { arrasto = null; el.classList.remove('arrastando'); };
  el.addEventListener('pointerup', solta);
  el.addEventListener('pointercancel', solta);
}
