// Os painéis presos do cardápio. O CSS faz o empilhamento (position: sticky); aqui fica o que depende da rolagem:
// - a bolinha ativa da navegação lateral (o painel cujo topo já passou de 42% da tela);
// - a entrada do produto (sobe 132 px e cresce de 0,88 a 1) e do botão (sobe 186 px) enquanto o painel chega;
// - as peças soltas, que derivam com a rolagem e ainda flutuam sozinhas, cada uma no seu ritmo;
// - o painel que ficou inteiro coberto pelo seguinte sai do teclado e do leitor de tela (inert): sem isso o foco
//   cai num botão que ninguém vê.
import { naRolagem, rolaPara, limita, suave, reduzido } from './rolagem.js';

// a bolinha troca quando o topo do painel passa desta fração da altura da tela
const LINHA = 0.42;
// a chegada do painel: em que fração da tela ela acontece, quanto o produto sobe (px) e de que tamanho nasce, e
// quanto o botão sobe (px)
const CHEGADA = { curso: 0.76, sobe: 132, escala: 0.88, botao: 186 };
// o jeito de cada peça solta, uma linha por vaga da cena: quanto deriva com a rolagem (x e y, em px, e giro, em
// graus), para que lado, e como flutua sozinha (x e y, em px, giro, em graus, e o tempo de uma volta, em ms)
const JEITOS = [
  { x: 26, y: 34, giro: 2.8, dx: 1, dy: -1, fx: 8, fy: 13, fr: 1.4, volta: 4700 },
  { x: 41, y: 52, giro: 5.2, dx: -1, dy: 1, fx: 11.5, fy: 17.5, fr: 2.6, volta: 5300 },
  { x: 56, y: 72, giro: 7.4, dx: 1, dy: 1, fx: 15, fy: 22, fr: 3.8, volta: 5900 },
  { x: 70, y: 34, giro: 9.6, dx: -1, dy: -1, fx: 18, fy: 26, fr: 1.4, volta: 6500 },
  { x: 26, y: 52, giro: 2.8, dx: 1, dy: 1, fx: 8, fy: 13, fr: 2.6, volta: 7100 },
  { x: 41, y: 72, giro: 5.2, dx: -1, dy: 1, fx: 11.5, fy: 17.5, fr: 3.8, volta: 4900 },
  { x: 56, y: 34, giro: 7.4, dx: 1, dy: -1, fx: 15, fy: 22, fr: 1.4, volta: 5500 },
];
// no celular as peças andam menos (na deriva e na flutuação)
const DERIVA_NO_CELULAR = 0.62;
const FLUTUA_NO_CELULAR = 0.72;

export function iniciaCardapio() {
  const raiz = document.querySelector('[data-cardapio]');
  if (!raiz) return;
  const nav = raiz.querySelector('[data-nav]');
  const pontos = [...raiz.querySelectorAll('[data-ir]')];

  const paineis = [...raiz.querySelectorAll('[data-painel]')].map((el, p) => ({
    el,
    id: el.dataset.painel,
    ancora: el.previousElementSibling,
    folga: el.nextElementSibling,
    produto: el.querySelector('[data-produto]'),
    botao: el.querySelector('[data-pedir]'),
    visivel: true,
    coberto: false,
    // cada peça tem o seu jeito, sempre o mesmo (nada de sorteio); de um painel para o outro a lista gira uma casa,
    // para as cenas não se mexerem iguais
    pecas: [...el.querySelectorAll('[data-peca]')].map((peca, i) => ({
      el: peca,
      ...JEITOS[(i + p) % JEITOS.length],
      fase: i * 1.21 + p * 0.94,
    })),
  }));
  if (!paineis.length) return;

  nav?.style.setProperty('--n', String(paineis.length));
  pontos.forEach((botao, i) => botao.addEventListener('click', () => {
    rolaPara(paineis[i].ancora.getBoundingClientRect().top + window.scrollY);
  }));

  let margemDaNav = 220;
  const medeNav = () => { if (nav) margemDaNav = parseFloat(getComputedStyle(nav).marginTop) || 220; };
  medeNav();
  addEventListener('resize', medeNav, { passive: true });
  let desvioAnterior = 0;
  let ativoAnterior = -1;

  naRolagem((altura) => {
    const linha = altura * LINHA;
    const estreito = window.innerWidth <= 575;
    let ativo = 0;

    // a navegação para junto com o último painel, com a mesma folga que tinha no começo
    if (nav && nav.offsetParent !== null) {
      const caixaNav = nav.getBoundingClientRect();
      const recuo = Math.max(0, margemDaNav - caixaNav.height / 2);
      const fim = paineis[paineis.length - 1].el.getBoundingClientRect().bottom;
      const desvio = Math.min(0, fim - recuo - (caixaNav.bottom - desvioAnterior));
      desvioAnterior = desvio;
      nav.style.transform = `translateY(calc(-50% + ${desvio.toFixed(1)}px))`;
    }

    const caixas = paineis.map((painel) => painel.el.getBoundingClientRect());
    paineis.forEach((painel, i) => {
      const caixa = caixas[i];
      if (caixa.top <= linha) ativo = i;
      const coberto = i < paineis.length - 1 && caixas[i + 1].top <= 1;
      if (coberto !== painel.coberto) { painel.coberto = coberto; painel.el.inert = coberto; }
      if (reduzido) return;

      const entrada = suave(limita((altura - caixa.top) / (altura * CHEGADA.curso)));
      painel.produto?.style.setProperty('--entra-y', `${((1 - entrada) * CHEGADA.sobe).toFixed(2)}px`);
      painel.produto?.style.setProperty('--entra-s', (CHEGADA.escala + entrada * (1 - CHEGADA.escala)).toFixed(4));
      painel.botao?.style.setProperty('--botao-y', `${((1 - entrada) * CHEGADA.botao).toFixed(2)}px`);

      const topoDaCena = painel.ancora.getBoundingClientRect().top;
      const cena = limita((altura - topoDaCena) / (altura + painel.el.offsetHeight + painel.folga.offsetHeight));
      const centrado = (suave(cena) - 0.5) * 2;
      const forca = estreito ? DERIVA_NO_CELULAR : 1;
      for (const peca of painel.pecas) {
        peca.el.style.setProperty('--rx', `${(peca.x * peca.dx * centrado * forca).toFixed(2)}px`);
        peca.el.style.setProperty('--ry', `${(peca.y * peca.dy * centrado * forca).toFixed(2)}px`);
        peca.el.style.setProperty('--rr', `${(peca.giro * peca.dx * centrado * forca).toFixed(2)}deg`);
      }
    });

    if (ativo !== ativoAnterior) {
      ativoAnterior = ativo;
      raiz.dataset.ativo = paineis[ativo].id;
      raiz.dataset.cor = paineis[ativo].el.dataset.cor ?? '';
      paineis.forEach((painel, i) => {
        painel.el.classList.toggle('ativo', i === ativo);
        pontos[i]?.classList.toggle('ativo', i === ativo);
        pontos[i]?.setAttribute('aria-current', i === ativo ? 'true' : 'false');
      });
    }
  });

  if (reduzido) return;

  // a flutuação só roda nos painéis que estão na tela
  if ('IntersectionObserver' in window) {
    const olho = new IntersectionObserver((entradas) => {
      for (const entrada of entradas) {
        const painel = paineis.find((item) => item.el === entrada.target);
        if (painel) painel.visivel = entrada.isIntersecting;
      }
    }, { rootMargin: '96px' });
    paineis.forEach((painel) => olho.observe(painel.el));
  }

  const flutua = (agora) => {
    if (!document.hidden) {
      const forca = window.innerWidth <= 575 ? FLUTUA_NO_CELULAR : 1;
      for (const painel of paineis) {
        if (!painel.visivel) continue;
        for (const peca of painel.pecas) {
          // os três movimentos têm períodos que não casam: a peça nunca repete o mesmo caminho logo em seguida
          const ciclo = (agora / peca.volta) * Math.PI * 2 + peca.fase;
          peca.el.style.setProperty('--fx', `${(Math.sin(ciclo) * peca.fx * forca).toFixed(2)}px`);
          peca.el.style.setProperty('--fy', `${(Math.cos(ciclo * 0.77) * peca.fy * forca).toFixed(2)}px`);
          peca.el.style.setProperty('--fr', `${(Math.sin(ciclo * 0.61 + 0.5) * peca.fr * forca).toFixed(2)}deg`);
        }
      }
    }
    requestAnimationFrame(flutua);
  };
  requestAnimationFrame(flutua);
}
