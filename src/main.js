import './styles/tokens.css';
import './styles/base.css';
import './sections/nav.css';
import './sections/abertura.css';
import './sections/armacoes.css';
import './sections/lentes.css';
import './sections/sol.css';
import './sections/dias.css';
import './sections/fecho.css';
import './sections/fim.css';
import './sections/carga.css';
import './sections/interacoes.css';
import * as THREE from 'three';
import opticoUrl from 'optician-sans/Webfont/Web-PS/Optiker-K.woff2?url';
import { Palco } from './gl/palco.js';
import { Estojo } from './gl/estojo.js';
import { Diretor } from './motion/diretor.js';
import { Carga } from './motion/carga.js';
import { barra } from './motion/barra.js';
import { interacoes } from './motion/interacoes.js';
import { abertura } from './motion/cenas/abertura.js';
import { armacoes } from './motion/cenas/armacoes.js';
import { lentes } from './motion/cenas/lentes.js';
import { sol } from './motion/cenas/sol.js';
import { dias } from './motion/cenas/dias.js';
import { fecho } from './motion/cenas/fecho.js';
import { fim } from './motion/cenas/fim.js';

const reduzido = matchMedia('(prefers-reduced-motion: reduce)').matches;
const TINTA = new THREE.Color('#111110');
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
scrollTo(0, 0);

function textura(url) {
  return new Promise(res => new THREE.TextureLoader().load(url, tx => {
    tx.colorSpace = THREE.SRGBColorSpace;
    tx.wrapS = tx.wrapT = THREE.MirroredRepeatWrapping;
    tx.anisotropy = 8;
    res(tx);
  }));
}

async function inicia() {
  const carga = new Carga(6);
  const optico = new FontFace('Optician Sans', `url(${opticoUrl}) format('woff2')`);
  document.fonts.add(optico);
  await Promise.all([
    document.fonts.load('900 100px Satoshi'), document.fonts.load('700 20px Satoshi'),
    document.fonts.load('500 16px Satoshi'), document.fonts.load('400 16px Satoshi'), optico.load(),
  ]);
  carga.passo();

  const palco = new Palco(document.querySelector('.palco'), { dprMax: 2 });
  const tartaruga = await textura('/img/tartaruga.webp');
  carga.passo();
  await palco.montaOculos(tartaruga);
  carga.passo();
  palco.estojo = new Estojo();
  palco.cena.add(palco.estojo.grupo);

  // a camada de leitura: um item por linha ou peça, todos escondidos até a cena deles
  const P = palco.placa;
  const q = s => document.querySelector(s), qa = s => [...document.querySelectorAll(s)];
  const itens = {
    titulo: P.porLinha(q('.abertura__titulo')),
    nomes: qa('.armacoes__nome').map(el => P.novo(el, { opac: 0 })),
    cartoes: qa('.cartao').map((el, k) => P.novo(el, { src: el.dataset.src, raio: 28, opac: 0, cobre: k === 3 ? 'tela' : undefined, focoY: el.dataset.focoY ? +el.dataset.focoY : 0.5, ordem: -1 })),
    textos: qa('.lentes__texto').map(el => [P.novo(el.querySelector('.lentes__tipo'), { opac: 0 }), P.novo(el.querySelector('.lentes__frase'), { opac: 0 })]),
    sol: qa('.sol__titulo').map(el => P.novo(el, { opac: 0, cor: TINTA })),
    fotos: qa('.dias__foto').map(el => P.novo(el, { src: el.dataset.src, raio: 6, opac: 0, ordem: -1 })),
    fecho: P.porLinha(q('.fecho__titulo'), { opac: 0, cor: TINTA }),
  };
  itens.todos = [...itens.titulo, ...itens.nomes, ...itens.cartoes, ...itens.textos.flat(), ...itens.sol, ...itens.fotos, ...itens.fecho];
  for (const c of itens.cartoes) c.cor.setRGB(0.62, 0.62, 0.62);
  await Promise.all(itens.todos.map(it => it.pronta));
  carga.passo();

  const diretor = new Diretor(palco, { reduzido });
  const ctx = { palco, placa: P, oculos: palco.oculos, estojo: palco.estojo, diretor, itens, reduzido };
  const ab = abertura(ctx);
  const ar = armacoes(ctx);
  for (const cena of [ab, ar, lentes(ctx), sol(ctx), dias(ctx), fecho(ctx), fim(ctx)]) diretor.adiciona(cena);
  diretor.inicia();
  barra(diretor);
  interacoes();
  carga.passo();

  // compila os shaders antes de mostrar (sem engasgo no primeiro quadro de cada cena)
  palco.estojo.grupo.visible = true;
  palco.renderer.compile(palco.cena, palco.camera);
  palco.estojo.grupo.visible = false;
  carga.passo();
  window.__grau = { palco, diretor, itens };

  ab.prepara();
  await carga.fim(reduzido, () => ab.intro());
  if (location.hash && location.hash !== '#topo') {
    const alvo = diretor.posicaoDe(location.hash.slice(1));
    if (alvo !== null) setTimeout(() => diretor.vaiPara(alvo), 900);
  }
}
inicia();
