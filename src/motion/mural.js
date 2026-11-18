// O mural do rodapé.
// - Com mouse: mexer o cursor sobre a área do mural solta os cartões um atrás do outro, no ponto do cursor (a cada
//   52 px de caminho e no máximo um a cada 70 ms). Cada cartão nasce pequeno e torto, assenta, fica uns segundos e
//   some descendo. Enquanto não há cartão, uma etiqueta "mexa o mouse" acompanha o cursor.
// - Com toque (tablet): um toque solta um cartão; o botão "toca aqui" solta um no centro.
// - No celular: uma pilha de cartões que troca a cada toque.
import { MURAL, cartao } from '../config.js';
import { reduzido, naRolagem } from './rolagem.js';

const limita = (v, min, max) => Math.min(max, Math.max(min, v));
// o rastro: de quantos em quantos px de caminho sai um cartão, o intervalo mínimo entre dois (ms), quanto tempo cada
// um vive (ms), a faixa do topo do rodapé onde nada nasce (px) e quantos cabem na tela de uma vez
const ENTRE_CARTOES = 52;
const INTERVALO = 70;
const VIDA = 3800;
const ZONA_MORTA = 56;
const MAXIMO = 22;
const MAXIMO_NO_TOQUE = 9;
// o cartão: altura ÷ largura (9:16, o formato dos arquivos em public/img/mural/), o quanto ele passa do tamanho ao
// assentar e a curva da vida inteira dele
const PROPORCAO = 16 / 9;
const ESTOURO = 1.07;
const CURVA_DO_CARTAO = 'cubic-bezier(.2,.84,.3,1)';

export function iniciaMural() {
  const rodape = document.querySelector('[data-rodape]');
  const mural = rodape?.querySelector('[data-mural]');
  const rastro = rodape?.querySelector('[data-rastro]');
  const recado = rodape?.querySelector('[data-recado]');
  if (!rodape || !mural || !rastro || !recado) return;

  const dica = rodape.querySelector('[data-dica]');
  const fontes = MURAL.map(cartao);
  const mouseFino = matchMedia('(hover: hover) and (pointer: fine)');
  const celular = matchMedia('(max-width: 767.98px)');
  const interativo = 'a, button, input, textarea, select, label, form, [contenteditable], [role="button"]';
  const eInterativo = (evento) => evento.target instanceof Element && !!evento.target.closest(interativo);

  // —— a pilha do celular ——
  const pilha = mural.querySelector('[data-pilha]');
  const cartas = pilha ? [...pilha.querySelectorAll('.mural__carta')] : [];
  const avisoPilha = mural.querySelector('[data-pilha-status]');
  const GIROS = [-3.5, 2.5, -2, 4.5, -4, 3];
  let naFrente = 0;
  let animacaoDaPilha = null;
  const arruma = () => cartas.forEach((carta, i) => {
    carta.dataset.papel = ['frente', 'perto', 'longe'][(i - naFrente + cartas.length) % cartas.length] || 'fundo';
  });
  arruma();
  function avancaPilha() {
    if (!cartas.length) return;
    animacaoDaPilha?.cancel();
    naFrente = (naFrente + 1) % cartas.length;
    arruma();
    const frente = cartas[naFrente];
    const giro = GIROS[naFrente % GIROS.length];
    frente.style.setProperty('--gira', `${giro}deg`);
    if (avisoPilha) avisoPilha.textContent = `Foto ${naFrente + 1} de ${cartas.length}`;
    if (!reduzido && typeof frente.animate === 'function') {
      animacaoDaPilha = frente.animate([
        { transform: `translate3d(0, 24px, 0) rotate(${giro - 8}deg) scale(.95)` },
        { transform: `translate3d(0, 0, 0) rotate(${giro}deg) scale(1)` },
      ], { duration: 380, easing: 'cubic-bezier(.22,.82,.3,1)' });
    }
  }
  pilha?.addEventListener('click', avancaPilha);

  // —— o rastro ——
  const vivos = [];
  const guardados = new Map();
  let proxima = 0, ultimoTempo = 0, ultimoX = -9999, ultimoY = -9999, dentro = false, toque = null;
  let limiteDeBaixo = 0;

  // o rastro vale do topo do rodapé até onde começa o recado
  function medeZona() {
    const caixa = rodape.getBoundingClientRect();
    limiteDeBaixo = limita(recado.getBoundingClientRect().top - caixa.top, 0, caixa.height);
    rodape.style.setProperty('--zona', `${limiteDeBaixo}px`);
  }
  const foraDaZona = (evento) => {
    medeZona();
    const y = evento.clientY - rodape.getBoundingClientRect().top;
    return y < ZONA_MORTA || y >= limiteDeBaixo;
  };
  medeZona();
  addEventListener('resize', medeZona, { passive: true });
  addEventListener('load', medeZona, { once: true });
  document.fonts?.ready.then(medeZona);

  function tira(imagem) {
    const coisas = guardados.get(imagem);
    if (!coisas) return;
    clearTimeout(coisas.relogio);
    coisas.animacao?.cancel();
    guardados.delete(imagem);
    const i = vivos.indexOf(imagem);
    if (i !== -1) vivos.splice(i, 1);
    imagem.remove();
    if (!vivos.length && dentro && mouseFino.matches) dica?.classList.add('visivel');
  }

  function solta(x, y, opcoes = {}) {
    medeZona();
    if (y < ZONA_MORTA || y >= limiteDeBaixo) return;
    const imagem = document.createElement('img');
    const giro = opcoes.giro ?? (-11.5 + Math.random() * 23);
    const escala = opcoes.escala ?? (0.88 + Math.random() * 0.16);
    imagem.className = 'mural__foto';
    imagem.src = fontes[proxima % fontes.length];
    proxima += 1;
    imagem.alt = '';
    imagem.decoding = 'async';
    imagem.draggable = false;
    imagem.style.left = `${x}px`;
    imagem.style.top = `${y}px`;
    rastro.appendChild(imagem);
    // o cartão inteiro (girado e no estouro da entrada) fica abaixo da borda de cima
    const largura = imagem.getBoundingClientRect().width;
    const seguro = (Math.hypot(largura, largura * PROPORCAO) * escala * ESTOURO) / 2 + 8;
    imagem.style.top = `${Math.max(y, seguro)}px`;
    vivos.push(imagem);

    if (reduzido || typeof imagem.animate !== 'function') {
      imagem.style.opacity = '1';
      guardados.set(imagem, { animacao: null, relogio: setTimeout(() => tira(imagem), VIDA) });
      while (vivos.length > 1) tira(vivos[0]);
      return;
    }
    const animacao = imagem.animate([
      { opacity: 0, transform: `translate(-50%, -50%) scale(.2) rotate(${giro + 14}deg)` },
      { opacity: 1, offset: 0.2, transform: `translate(-50%, -50%) scale(${escala * ESTOURO}) rotate(${giro - 1.5}deg)` },
      { opacity: 1, offset: 0.8, transform: `translate(-50%, -50%) scale(${escala}) rotate(${giro}deg)` },
      { opacity: 0, transform: `translate(-50%, calc(-50% + 30px)) scale(${escala * 0.66}) rotate(${giro - 7}deg)` },
    ], { duration: VIDA, easing: CURVA_DO_CARTAO, fill: 'forwards' });
    animacao.addEventListener('finish', () => tira(imagem), { once: true });
    guardados.set(imagem, { animacao, relogio: setTimeout(() => tira(imagem), VIDA + 300) });
    const maximo = mouseFino.matches ? MAXIMO : MAXIMO_NO_TOQUE;
    while (vivos.length > maximo) tira(vivos[0]);
  }

  function levaDica(evento) {
    if (!dica) return;
    const caixa = rodape.getBoundingClientRect();
    dica.style.left = `${limita(evento.clientX - caixa.left + 82, 92, caixa.width - 92)}px`;
    dica.style.top = `${Math.min(evento.clientY - caixa.top - 30, limiteDeBaixo - 24)}px`;
  }

  rodape.addEventListener('pointermove', (evento) => {
    if (celular.matches || evento.pointerType !== 'mouse' || !mouseFino.matches) return;
    if (eInterativo(evento) || foraDaZona(evento)) { dentro = false; dica?.classList.remove('visivel'); return; }
    dentro = true;
    const caixa = rodape.getBoundingClientRect();
    const agora = performance.now();
    levaDica(evento);
    dica?.classList.remove('visivel');
    if (Math.hypot(evento.clientX - ultimoX, evento.clientY - ultimoY) < ENTRE_CARTOES || agora - ultimoTempo < INTERVALO) return;
    ultimoX = evento.clientX; ultimoY = evento.clientY; ultimoTempo = agora;
    solta(evento.clientX - caixa.left, evento.clientY - caixa.top);
  }, { passive: true });
  // quem chega rolando a página tem o mouse parado: nenhum evento de mouse avisa que o mural passou para baixo
  // dele. A roda e o movimento guardam onde o cursor está, e a cada rolagem a etiqueta é posta (ou tirada) ali
  let ponteiro = null;
  const guarda = (evento) => { if (evento.pointerType === undefined || evento.pointerType === 'mouse') ponteiro = { x: evento.clientX, y: evento.clientY }; };
  addEventListener('wheel', guarda, { passive: true });
  addEventListener('pointermove', guarda, { passive: true });
  naRolagem(() => {
    if (!ponteiro || !dica || celular.matches || !mouseFino.matches || vivos.length) return;
    const sobre = document.elementFromPoint(ponteiro.x, ponteiro.y);
    const noMural = !!sobre && rodape.contains(sobre) && !sobre.closest(interativo) && !foraDaZona({ clientY: ponteiro.y });
    dentro = noMural;
    if (noMural) levaDica({ clientX: ponteiro.x, clientY: ponteiro.y });
    dica.classList.toggle('visivel', noMural);
  });

  // parado na área, antes de qualquer cartão: a etiqueta avisa o que fazer
  rodape.addEventListener('pointerenter', (evento) => {
    if (celular.matches || evento.pointerType !== 'mouse' || !mouseFino.matches || eInterativo(evento) || foraDaZona(evento)) return;
    dentro = true;
    levaDica(evento);
    if (!vivos.length) dica?.classList.add('visivel');
  }, { passive: true });
  rodape.addEventListener('pointerleave', () => { dentro = false; ultimoX = ultimoY = -9999; dica?.classList.remove('visivel'); }, { passive: true });

  // toque em tablet: um toque parado solta um cartão
  rodape.addEventListener('pointerdown', (evento) => {
    toque = null;
    if (celular.matches || evento.pointerType === 'mouse' || !evento.isPrimary || eInterativo(evento) || foraDaZona(evento)) return;
    toque = { id: evento.pointerId, x: evento.clientX, y: evento.clientY, tempo: performance.now(), rolado: window.scrollY };
  }, { passive: true });
  rodape.addEventListener('pointerup', (evento) => {
    const inicio = toque;
    toque = null;
    if (celular.matches || !inicio || inicio.id !== evento.pointerId || eInterativo(evento) || foraDaZona(evento)) return;
    // só vale o toque parado e curto: arrastar o dedo ou rolar a página não solta cartão
    if (performance.now() - inicio.tempo > 600 || Math.hypot(evento.clientX - inicio.x, evento.clientY - inicio.y) > 10 || Math.abs(window.scrollY - inicio.rolado) > 6) return;
    const caixa = rodape.getBoundingClientRect();
    solta(limita(evento.clientX - caixa.left, 36, caixa.width - 36), limita(evento.clientY - caixa.top, 50, caixa.height - 50), { giro: -9 + Math.random() * 18, escala: 1.04 });
  }, { passive: true });
  rodape.addEventListener('pointercancel', () => { toque = null; }, { passive: true });

  // o botão "toca aqui": no celular vira a pilha, no resto solta um cartão no meio do mural
  mural.querySelector('[data-toque]')?.addEventListener('click', () => {
    if (celular.matches) { avancaPilha(); return; }
    const caixa = rodape.getBoundingClientRect();
    const area = mural.getBoundingClientRect();
    medeZona();
    solta(area.left - caixa.left + area.width * 0.5, limita(area.top - caixa.top + area.height * 0.5, ZONA_MORTA + 1, limiteDeBaixo - 1), { giro: -9 + Math.random() * 18, escala: 1.04 });
  });

  const limpa = () => { dentro = false; toque = null; dica?.classList.remove('visivel'); [...vivos].forEach(tira); };
  document.addEventListener('visibilitychange', () => { if (document.hidden) limpa(); });
  if ('IntersectionObserver' in window) new IntersectionObserver(([entrada]) => { if (!entrada.isIntersecting) limpa(); }).observe(rodape);

  // —— o recado: sem servidor na demonstração, só confere o e-mail e agradece ——
  const form = rodape.querySelector('[data-recado-form]');
  const aviso = rodape.querySelector('[data-recado-aviso]');
  form?.addEventListener('submit', (evento) => {
    evento.preventDefault();
    const campo = form.elements.email;
    const valido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(campo.value.trim());
    if (aviso) aviso.textContent = valido ? 'Anotado. Calma, que a gente escreve.' : 'Confere o e-mail e tenta de novo.';
    if (valido) form.reset(); else campo.focus();
  });
}
