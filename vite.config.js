import { defineConfig } from 'vite';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { MASCOTE } from './src/marca/mascote.js';
import { bordaComoMascara } from './src/marca/borda.js';
import { paineis, faixa, menuDoCardapio, pilhaDoMural, corDoPrimeiroPainel } from './src/marca/paineis.js';
import { CARDAPIO, MARCA, MURAL } from './src/config.js';

// Uma seção por arquivo: <!-- @secao hero --> no index.html vira o conteúdo de src/sections/hero.html.
const SECAO = /<!--\s*@secao\s+([\w-]+)\s*-->/g;
const inclui = (html) =>
  html.replace(SECAO, (_, nome) => inclui(readFileSync(resolve(import.meta.dirname, `src/sections/${nome}.html`), 'utf8')));

// O mascote entra uma vez só, como símbolos de SVG: <!-- @marca --> vira esse bloco e cada lugar usa
// <svg viewBox="%caixa:em-pe%"><use href="#capi-em-pe"/></svg>. A cor vem do texto (currentColor).
const simbolos = () => `<svg class="so-leitor" aria-hidden="true" focusable="false" width="0" height="0"><defs>${Object.entries(MASCOTE)
  .map(([pose, { caixa, d }]) => `<symbol id="capi-${pose}" viewBox="${caixa.join(' ')}"><path fill="currentColor" fill-rule="evenodd" d="${d}"/></symbol>`)
  .join('')}</defs></svg>`;

// A borda de papel rasgado é uma máscara só para a página inteira (src/marca/borda.js). Junto vai a cor do primeiro
// painel do cardápio, que a faixa de palavras e o fundo do cardápio usam.
const estiloDaBorda = () => `<style>:root{--borda:${bordaComoMascara({ semente: 11 })};--primeiro-painel:${corDoPrimeiroPainel()}}</style>`;

// Os dados da marca nos HTML: %marca:cidade% vira MARCA.cidade (src/config.js).
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// Confere, a cada montagem, se toda imagem que o config.js cita existe em public/img/. Nome errado não quebra o build:
// só aparece no site quando o item é escolhido (a cena não troca). Por isso o aviso sai aqui, no terminal.
let avisado = '';
function confereImagens() {
  const faltam = [];
  const existe = (caminho) => existsSync(resolve(import.meta.dirname, 'public/img', caminho));
  for (const categoria of CARDAPIO) for (const item of categoria.itens) {
    if (!existe(`produtos/${item.id}.webp`)) faltam.push(`produtos/${item.id}.webp (o prato de "${item.nome}")`);
    if (!existe(`produtos/${item.id}-p.webp`)) faltam.push(`produtos/${item.id}-p.webp (a miniatura de "${item.nome}")`);
    for (const nome of item.pecas) if (!existe(`pecas/${nome}.webp`)) faltam.push(`pecas/${nome}.webp (peça de "${item.nome}")`);
    if (item.pecas.length !== 7) faltam.push(`"${item.nome}" tem ${item.pecas.length} peças: a cena usa 7`);
  }
  for (const n of MURAL) if (!existe(`mural/${n}.webp`)) faltam.push(`mural/${n}.webp (cartão do mural)`);
  const texto = [...new Set(faltam)].join('\n  - ');
  if (texto && texto !== avisado) console.warn(`\n[cardápio] o src/config.js cita imagens que não estão em public/img/:\n  - ${texto}\n`);
  avisado = texto;
}

const monta = (html) => (confereImagens(), inclui(html))
  .replace(/<!--\s*@marca\s*-->/g, simbolos)
  .replace(/<!--\s*@borda\s*-->/g, estiloDaBorda)
  .replace(/<!--\s*@paineis\s*-->/g, paineis)
  .replace(/<!--\s*@faixa\s*-->/g, faixa)
  .replace(/<!--\s*@menu-cardapio\s+([\w-]+)\s*-->/g, (_, classe) => menuDoCardapio(classe))
  .replace(/<!--\s*@mural-pilha\s*-->/g, pilhaDoMural)
  .replace(/%marca:([\w-]+)%/g, (_, campo) => esc(MARCA[campo] ?? ''))
  .replace(/%caixa:([\w-]+)%/g, (_, pose) => (MASCOTE[pose]?.caixa ?? [0, 0, 100, 100]).join(' '));

const secoes = () => ({
  name: 'secoes',
  transformIndexHtml: { order: 'pre', handler: monta },
  handleHotUpdate({ file, server }) {
    if ((file.includes('/src/sections/') && file.endsWith('.html')) || file.includes('/src/marca/') || file.endsWith('/src/config.js')) {
      server.ws.send({ type: 'full-reload' });
    }
  },
});

export default defineConfig({
  plugins: [secoes()],
  // base relativa: o dist/ abre em qualquer pasta da hospedagem, não só na raiz do domínio
  base: './',
  build: { target: 'es2022', assetsInlineLimit: 0 },
});
