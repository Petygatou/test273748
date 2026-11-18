// Monta o HTML dos painéis do cardápio a partir do config.js. Roda no build (vite.config.js troca <!-- @paineis -->
// por este HTML), então a página já chega com o cardápio escrito, sem depender do JavaScript para aparecer.
import { CARDAPIO, FAIXA, MARCA, MURAL, produto, miniatura, peca, cartao } from '../config.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// Sete vagas por cena: cinco peças nítidas e duas desfocadas (a 2 e a 7), que ficam no fundo.
export const VAGAS = 7;

const pilula = (item, i, ativo, categoria) => `
            <button class="pilula pilula--${'abc'[i % 3]}" type="button" role="tab" data-indice="${i}" aria-selected="${ativo}" aria-controls="cena-${categoria}" tabindex="${ativo ? 0 : -1}">
              <span class="pilula__foto"><img src="${miniatura(item.id)}" alt="" width="200" height="200" loading="lazy" decoding="async"></span>
              <span class="pilula__texto"><strong>${esc(item.nome)}</strong><small>${esc(item.linha)}</small></span>
            </button>`;

function painel(categoria, ordem) {
  const primeiro = categoria.itens[0];
  const laco = categoria.itens.length > 4;
  // pelas falhas do rasgo de cima aparece a cor do painel anterior (o primeiro não tem anterior: aparece o fundo)
  const deTras = ordem > 0 ? `;--cor-de-tras:var(--${CARDAPIO[ordem - 1].cor})` : '';
  return `
    <span class="cardapio__ancora" id="${categoria.id}" data-ancora></span>
    <section class="painel painel--${categoria.cor}" data-painel="${categoria.id}" data-cor="${categoria.cor}" data-cena aria-labelledby="titulo-${categoria.id}" style="--ordem:${ordem + 1}${deTras}">
      <span class="painel__borda" aria-hidden="true"></span>
      <div class="painel__recorte">
        <div class="painel__palco">
          <h2 class="painel__titulo" id="titulo-${categoria.id}">${esc(categoria.titulo)}</h2>
          <div class="seletor${laco ? ' seletor--laco' : ''}" data-seletor data-total="${categoria.itens.length}">
            <button class="seletor__seta" type="button" data-anterior aria-label="Anterior"><span aria-hidden="true">‹</span></button>
            <div class="seletor__janela" data-janela>
              <div class="seletor__trilho" role="tablist" aria-label="${esc(categoria.titulo)}" data-trilho>${categoria.itens.map((item, i) => pilula(item, i, i === 0, categoria.id)).join('')}
              </div>
            </div>
            <button class="seletor__seta" type="button" data-proximo aria-label="Próximo"><span aria-hidden="true">›</span></button>
          </div>
          <div class="cena" id="cena-${categoria.id}" role="tabpanel" aria-labelledby="titulo-${categoria.id}" data-palco-cena>
            <p class="cena__marca" aria-hidden="true">${esc(MARCA.nome)}</p>
            ${primeiro.pecas.slice(0, VAGAS).map((nome, v) => `<span class="cena__peca cena__peca--${v + 1}" data-peca><img src="${peca(nome)}" alt="" width="360" height="360" loading="lazy" decoding="async"></span>`).join('\n            ')}
            <span class="cena__produto" data-produto><img src="${produto(primeiro.id)}" alt="${esc(primeiro.nome)}" width="720" height="720" loading="lazy" decoding="async"></span>
            <ul class="cena__selos" data-selos>${primeiro.selos.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
          </div>
          <p class="painel__ingredientes" data-ingredientes>${primeiro.ingredientes.map(esc).join(' · ')}</p>
          <a class="botao botao--painel" href="${esc(MARCA.pedido)}" data-pedir><span>Pedir ${esc(categoria.titulo.toLowerCase())}</span><span class="botao__seta" aria-hidden="true">›</span></a>
          <p class="so-leitor" role="status" aria-live="polite" data-status></p>
        </div>
      </div>
    </section>
    <div class="cardapio__folga" aria-hidden="true"></div>`;
}

export const paineis = () => `
  <div class="cardapio" id="cardapio" data-cardapio data-cor="${CARDAPIO[0].cor}">
    <nav class="cardapio__nav" aria-label="Categorias do cardápio" data-nav style="--n:${CARDAPIO.length}">
      ${CARDAPIO.map((c) => `<button class="cardapio__ponto" type="button" data-ir="${c.id}" aria-label="${esc(c.titulo)}"></button>`).join('\n      ')}
    </nav>${CARDAPIO.map(painel).join('')}
  </div>`;

// A faixa: cada linha repete as palavras o bastante para cobrir a tela mais o quanto ela anda com a rolagem.
const CORES_DA_FAIXA = ['cheddar', 'tomate', 'pao', 'mate'];
export const faixa = () => FAIXA.map((palavras, linha) => {
  const uma = palavras.map((p, i) => `<span class="faixa__palavra faixa__palavra--${CORES_DA_FAIXA[(i + linha * 2) % CORES_DA_FAIXA.length]}">${esc(p)}</span>`).join('');
  return `<div class="faixa__linha faixa__linha--${linha + 1}"><div class="faixa__trilho" data-trilho-faixa>${uma.repeat(4)}</div></div>`;
}).join('\n      ');

export const menuDoCardapio = (classe) => CARDAPIO.map((c) => `<a class="${classe}" href="#${c.id}">${esc(c.titulo)}</a>`).join('');

// A pilha de cartões do mural no celular: os mesmos arquivos do rastro do mouse (lista MURAL do config.js).
export const pilhaDoMural = () => MURAL.map((n) => `<img class="mural__carta" src="${cartao(n)}" alt="" width="612" height="1088" loading="lazy" decoding="async">`).join('\n      ');

// A cor do primeiro painel: a faixa de palavras termina nela e o fundo do cardápio também.
export const corDoPrimeiroPainel = () => `var(--${CARDAPIO[0].cor})`;
