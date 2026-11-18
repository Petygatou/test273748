// As pílulas de cada painel e a troca da cena.
// - Com mais de quatro itens o trilho é um laço sem fim (cópias dos itens nas duas pontas). Na tela grande o item
//   ativo fica sempre na SEGUNDA casa, com o anterior à vista; no celular ele fica no centro.
// - Escolher um item apaga a cena (145 ms, em cascata), troca as imagens e os textos já carregados e acende de
//   novo (440 ms de opacidade e 560 ms crescendo de 0,95 a 1): primeiro os ingredientes soltos, depois o prato e,
//   por fim, os adesivos e a linha de ingredientes.
// - Se a imagem de um item não existe (nome errado no config.js), a cena fica onde estava, a fila volta ao item
//   que está na tela e o console diz qual arquivo faltou.
import { CARDAPIO, produto, peca } from '../config.js';
import { reduzido } from './rolagem.js';

const VISIVEIS = 4;
// a troca de cena: tempos (ms), o atraso entre um ator e o seguinte (ms) e o tamanho de que a cena volta a crescer
const TROCA = { sai: 145, cascataSai: 12, entra: 440, cresce: 560, cascataEntra: 32, escala: 0.95 };
// o trilho das pílulas desliza em 410 ms (src/styles/cardapio.css); a volta da cópia para o item espera um pouco mais
const VOLTA_DO_TRILHO = 480;
// quantos px de arrasto para o lado trocam de item
const ARRASTO = 42;
const estreita = matchMedia('(max-width: 767.98px)');

// —— imagens: cada endereço é baixado e decodificado uma vez só ——
const baixadas = new Map();
function carrega(url) {
  if (!baixadas.has(url)) {
    baixadas.set(url, new Promise((ok, falha) => {
      const imagem = new Image();
      const relogio = setTimeout(() => falha(new Error('imagem demorou')), 12000);
      imagem.onload = () => { clearTimeout(relogio); Promise.resolve(imagem.decode?.()).catch(() => {}).then(() => ok(url)); };
      imagem.onerror = () => { clearTimeout(relogio); falha(new Error(`não carregou ${url}`)); };
      imagem.src = url;
    }).catch((erro) => { baixadas.delete(url); throw erro; }));
  }
  return baixadas.get(url);
}
const enderecos = (item) => [...item.pecas.map(peca), produto(item.id)];

function cena(painel, categoria) {
  const imagens = [...painel.querySelectorAll('[data-peca] img'), painel.querySelector('[data-produto] img')];
  const textos = [painel.querySelector('[data-selos]'), painel.querySelector('[data-ingredientes]')].filter(Boolean);
  const atores = [...imagens, ...textos];
  const repouso = atores.map((el) => Number(getComputedStyle(el).opacity));
  const aviso = painel.querySelector('[data-status]');
  let pedido = 0, mostrado = 0, versao = 0, animacoes = [];

  const cancela = () => { animacoes.forEach((a) => a.cancel()); animacoes = []; };

  function anima(saindo) {
    if (reduzido || typeof Element.prototype.animate !== 'function') return Promise.resolve();
    return Promise.all(atores.map((el, i) => {
      const opacidade = repouso[i];
      const atraso = i * (saindo ? TROCA.cascataSai : TROCA.cascataEntra);
      const pequeno = { transform: `scale(${TROCA.escala})` };
      const some = el.animate(saindo ? [{ opacity: opacidade }, { opacity: 0 }] : [{ opacity: 0 }, { opacity: opacidade }], {
        duration: saindo ? TROCA.sai : TROCA.entra, delay: atraso,
        easing: saindo ? 'ease-in' : 'cubic-bezier(.16,1,.3,1)', fill: 'both',
      });
      const cresce = el.animate(saindo ? [{ transform: 'scale(1)' }, pequeno] : [pequeno, { transform: 'scale(1)' }], {
        duration: saindo ? TROCA.sai : TROCA.cresce, delay: atraso,
        easing: 'cubic-bezier(.16,1,.3,1)', composite: 'add', fill: 'both',
      });
      animacoes.push(some, cresce);
      return Promise.all([some.finished, cresce.finished]).catch(() => {});
    }));
  }

  function escreve(item) {
    const urls = enderecos(item);
    imagens.forEach((img, i) => { img.src = urls[i]; });
    imagens[imagens.length - 1].alt = item.nome;
    const selos = painel.querySelector('[data-selos]');
    if (selos) selos.replaceChildren(...item.selos.map((texto) => Object.assign(document.createElement('li'), { textContent: texto })));
    const ingredientes = painel.querySelector('[data-ingredientes]');
    if (ingredientes) ingredientes.textContent = item.ingredientes.join(' · ');
  }

  async function mostra(indice) {
    const item = categoria.itens[indice];
    if (!item || pedido === indice) return;
    pedido = indice;
    const senha = ++versao;
    cancela();
    if (mostrado === indice) { painel.removeAttribute('aria-busy'); return; }
    painel.setAttribute('aria-busy', 'true');
    try {
      await Promise.all(enderecos(item).map(carrega));
      if (senha !== versao) return;
      await anima(true);
      if (senha !== versao) return;
      escreve(item);
      mostrado = indice;
      cancela();
      await anima(false);
      if (senha !== versao) return;
      cancela();
      painel.removeAttribute('aria-busy');
      if (aviso) aviso.textContent = `${item.nome}: ${item.ingredientes.join(', ')}.`;
    } catch (erro) {
      if (senha !== versao) return;
      cancela();
      pedido = mostrado;
      painel.removeAttribute('aria-busy');
      if (aviso) aviso.textContent = 'As imagens deste item não carregaram. Tente de novo.';
      console.error(`[cardápio] "${item.nome}": ${erro?.message ?? 'imagem indisponível'}. Confira os nomes em src/config.js e os arquivos em public/img/.`);
      return false;
    }
  }

  return {
    mostra,
    atual: () => mostrado,
    aquece: (indice) => { const item = categoria.itens[indice]; if (item) enderecos(item).forEach((u) => carrega(u).catch(() => {})); },
  };
}

function seletor(painel, categoria) {
  const raiz = painel.querySelector('[data-seletor]');
  const janela = raiz.querySelector('[data-janela]');
  const trilho = raiz.querySelector('[data-trilho]');
  const originais = [...trilho.querySelectorAll(':scope > [data-indice]')];
  const total = originais.length;
  if (!total) return;
  const palco = cena(painel, categoria);
  const resto = (v, d = total) => ((v % d) + d) % d;

  // as cópias nascem num documento à parte, que não baixa nada: uma <img> clonada direto na página começa a baixar na
  // hora, mesmo com loading="lazy", e as miniaturas de todos os painéis chegariam juntas na abertura
  const forno = document.implementation.createHTMLDocument('');
  const copia = (pilula) => {
    const c = forno.importNode(pilula, true);
    c.dataset.copia = 'true';
    c.setAttribute('aria-hidden', 'true');
    c.removeAttribute('role');
    c.removeAttribute('aria-selected');
    c.tabIndex = -1;
    return c;
  };
  trilho.prepend(...originais.map(copia));
  trilho.append(...originais.map(copia));
  const todas = [...trilho.children];

  let ativo = 0; // posição "virtual": pode passar de total-1 ou ficar negativa enquanto o trilho desliza
  let relogio = 0;
  let toque = null;

  // na tela grande, até quatro itens cabem inteiros: o trilho não anda e as cópias somem
  const emLaco = () => estreita.matches || total > VISIVEIS;

  function posiciona(comAnimacao = true) {
    trilho.classList.toggle('sem-transicao', !comAnimacao);
    const laco = emLaco();
    for (const pilula of todas) if (pilula.dataset.copia) pilula.hidden = !laco;
    if (!laco) { trilho.style.transform = 'none'; return; }
    const casa = todas[total + ativo - (estreita.matches ? 0 : 1)];
    if (!casa) return;
    const desvio = estreita.matches
      ? janela.clientWidth / 2 - (casa.offsetLeft + casa.offsetWidth / 2)
      : -casa.offsetLeft;
    trilho.style.transform = `translate3d(${desvio}px, 0, 0)`;
  }

  // depois de deslizar para uma cópia, volta sem animação para o item de verdade
  function normaliza() {
    if (ativo >= 0 && ativo < total) return;
    ativo = resto(ativo);
    posiciona(false);
    trilho.getBoundingClientRect();
    requestAnimationFrame(() => trilho.classList.remove('sem-transicao'));
  }

  function escolhe(virtual, comAnimacao = true) {
    ativo = emLaco() ? Number(virtual) : resto(Number(virtual));
    const indice = resto(ativo);
    for (const pilula of todas) {
      const eAtiva = Number(pilula.dataset.indice) === indice;
      pilula.classList.toggle('ativa', eAtiva);
      if (!pilula.dataset.copia) {
        pilula.setAttribute('aria-selected', String(eAtiva));
        pilula.tabIndex = eAtiva ? 0 : -1;
      }
    }
    posiciona(comAnimacao && !reduzido);
    clearTimeout(relogio);
    relogio = setTimeout(normaliza, comAnimacao ? VOLTA_DO_TRILHO : 0);
    // não deu para mostrar (imagem faltando): a fila volta para o item que continua na tela
    Promise.resolve(palco.mostra(indice)).then((deu) => { if (deu === false) escolheItem(palco.atual()); });
  }

  // vai ao item pelo caminho mais curto do laço
  function escolheItem(indice) {
    const voltas = Math.round((ativo - indice) / total);
    escolhe(indice + voltas * total);
  }

  trilho.addEventListener('click', (evento) => {
    const pilula = evento.target.closest('[data-indice]');
    if (pilula && trilho.contains(pilula)) escolheItem(Number(pilula.dataset.indice));
  });
  raiz.querySelector('[data-anterior]')?.addEventListener('click', () => escolhe(ativo - 1));
  raiz.querySelector('[data-proximo]')?.addEventListener('click', () => escolhe(ativo + 1));
  trilho.addEventListener('transitionend', (evento) => { if (evento.target === trilho) normaliza(); });

  originais.forEach((pilula) => pilula.addEventListener('keydown', (evento) => {
    const passo = evento.key === 'ArrowLeft' ? -1 : evento.key === 'ArrowRight' ? 1 : 0;
    if (!passo) return;
    evento.preventDefault();
    escolhe(ativo + passo);
    originais[resto(ativo)]?.focus({ preventScroll: true });
  }));

  // arrastar o trilho para o lado troca de item
  janela.addEventListener('pointerdown', (evento) => { toque = evento.clientX; });
  janela.addEventListener('pointerup', (evento) => {
    if (toque === null) return;
    const distancia = evento.clientX - toque;
    toque = null;
    if (Math.abs(distancia) >= ARRASTO) escolhe(ativo + (distancia < 0 ? 1 : -1));
  });
  janela.addEventListener('pointercancel', () => { toque = null; });

  // passar o mouse (ou o foco) numa pílula já busca as imagens dela
  const aquece = (evento) => {
    const pilula = evento.target.closest?.('[data-indice]');
    if (pilula) palco.aquece(Number(pilula.dataset.indice));
  };
  trilho.addEventListener('pointerover', aquece, { passive: true });
  trilho.addEventListener('focusin', aquece);

  new ResizeObserver(() => posiciona(false)).observe(janela);
  estreita.addEventListener?.('change', () => { ativo = resto(ativo); posiciona(false); });
  escolhe(0, false);
  // quando o painel chega perto da tela, os vizinhos do item aberto já vão para a memória:
  // a primeira troca não espera download (e nada disso pesa na abertura da página)
  if ('IntersectionObserver' in window) {
    const olho = new IntersectionObserver(([entrada]) => {
      if (!entrada.isIntersecting) return;
      olho.disconnect();
      palco.aquece(1 % total);
      palco.aquece(total - 1);
    }, { rootMargin: '240px' });
    olho.observe(painel);
  }
  addEventListener('load', () => posiciona(false), { once: true });
  requestAnimationFrame(() => requestAnimationFrame(() => { posiciona(false); trilho.classList.remove('sem-transicao'); }));
}

export function iniciaSeletores() {
  for (const painel of document.querySelectorAll('[data-painel]')) {
    const categoria = CARDAPIO.find((c) => c.id === painel.dataset.painel);
    if (categoria) seletor(painel, categoria);
  }
}
