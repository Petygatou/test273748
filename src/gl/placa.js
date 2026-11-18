// A camada de leitura: tudo o que a lente deixa nítido (títulos gigantes, nomes, frases, fotos, tabela).
// Cada peça vem de um elemento do HTML marcado com data-placa: o CSS decide posição, fonte e tamanho,
// e aqui o texto é redesenhado num canvas no mesmo lugar, palavra por palavra. O elemento do HTML fica
// transparente (continua lá para leitor de tela e busca). A placa inteira é renderizada num alvo nítido
// que a composição desfoca e a lente lê.
import * as THREE from 'three';

const vert = /* glsl */ `
out vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const frag = /* glsl */ `
in vec2 vUv;
out vec4 cor;
uniform sampler2D uMapa;
uniform float uOpac;
uniform vec2 uTam;
uniform float uRaio;
uniform vec3 uCor;
uniform vec4 uUv;
uniform float uLavar;
float caixaArred(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r; }
void main() {
  vec4 t = texture(uMapa, uUv.xy + vUv * uUv.zw);
  float m = 1.0;
  if (uRaio > 0.0) m = 1.0 - smoothstep(-0.6, 0.6, caixaArred((vUv - 0.5) * uTam, uTam * 0.5, uRaio));
  vec3 c = t.rgb * uCor;
  c = mix(c, vec3(t.a) * uCor, uLavar);
  cor = vec4(c, t.a) * m * uOpac;
}
`;

const temSpacing = 'letterSpacing' in CanvasRenderingContext2D.prototype;

/** linhas de um elemento como o navegador quebrou, com a posição de cada palavra */
function linhas(el) {
  const out = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const r = document.createRange();
  let no;
  while ((no = walker.nextNode())) {
    const st = getComputedStyle(no.parentElement);
    const txt = no.textContent;
    const re = /\S+/g;
    let m;
    while ((m = re.exec(txt))) {
      r.setStart(no, m.index);
      r.setEnd(no, m.index + m[0].length);
      const b = r.getBoundingClientRect();
      if (!b.width) continue;
      const ult = out[out.length - 1];
      const p = { texto: m[0], x: b.left, y: b.top, w: b.width, h: b.height, st };
      if (ult && Math.abs(ult.y - b.top) < b.height * 0.5) ult.palavras.push(p);
      else out.push({ y: b.top, palavras: [p] });
    }
  }
  for (const l of out) {
    const ps = l.palavras;
    l.x0 = Math.min(...ps.map(p => p.x)); l.x1 = Math.max(...ps.map(p => p.x + p.w));
    l.y0 = Math.min(...ps.map(p => p.y)); l.y1 = Math.max(...ps.map(p => p.y + p.h));
    l.texto = ps.map(p => p.texto).join(' ');
  }
  return out;
}

function fonte(st) { return `${st.fontStyle} ${st.fontWeight} ${st.fontSize} ${st.fontFamily}`; }

function desenhaPalavra(ctx, p, x, y) {
  const st = p.st;
  ctx.font = fonte(st);
  const ls = parseFloat(st.letterSpacing) || 0;
  const asc = ctx.measureText(p.texto).fontBoundingBoxAscent;
  const base = y + asc;
  if (!ls) { ctx.fillText(p.texto, x, base); return; }
  if (temSpacing) { ctx.letterSpacing = `${ls}px`; ctx.fillText(p.texto, x, base); ctx.letterSpacing = '0px'; return; }
  // sem letterSpacing no canvas: letra a letra, com o kerning medido pelo prefixo
  for (let i = 0; i < p.texto.length; i++) ctx.fillText(p.texto[i], x + ctx.measureText(p.texto.slice(0, i)).width + i * ls, base);
}

export class Placa {
  constructor() {
    this.cena = new THREE.Scene();
    this.cam = new THREE.OrthographicCamera(0, 1, 0, -1, -10, 10);
    this.itens = [];
    this.qualidade = 1.25;
    this.geo = new THREE.PlaneGeometry(1, 1);
    this.carregador = new THREE.TextureLoader();
  }

  material(mapa) {
    return new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      uniforms: {
        uMapa: { value: mapa }, uOpac: { value: 1 }, uTam: { value: new THREE.Vector2(1, 1) },
        uRaio: { value: 0 }, uCor: { value: new THREE.Color(1, 1, 1) }, uUv: { value: new THREE.Vector4(0, 0, 1, 1) },
        uLavar: { value: 0 },
      },
    });
  }

  /** um item: texto (cor pela var CSS --placa ou opção) ou imagem (src) */
  novo(el, op = {}) {
    const it = {
      el, op, tipo: op.src ? 'imagem' : 'texto', opac: op.opac ?? 1, dx: 0, dy: 0, escala: 1, ordem: op.ordem ?? 0,
      cor: new THREE.Color(op.cor ?? 0xf1f1ef), raio: op.raio ?? 0, visivel: true, x: 0, y: 0, w: 0, h: 0, lavar: 0,
    };
    const mat = this.material(null);
    it.mesh = new THREE.Mesh(this.geo, mat);
    it.mesh.renderOrder = it.ordem;
    it.mesh.frustumCulled = false;
    this.cena.add(it.mesh);
    if (it.tipo === 'imagem') {
      it.pronta = new Promise(res => this.carregador.load(op.src, tx => {
        tx.colorSpace = THREE.SRGBColorSpace;
        tx.minFilter = THREE.LinearMipmapLinearFilter;
        tx.anisotropy = 4;
        mat.uniforms.uMapa.value = tx;
        it.tx = tx;
        res();
      }, undefined, () => {
        // sem a foto: um cinza escuro no lugar, para a cena seguir funcionando
        const c = document.createElement('canvas'); c.width = 3; c.height = 2;
        const g = c.getContext('2d'); g.fillStyle = '#2a2826'; g.fillRect(0, 0, 3, 2);
        it.tx = new THREE.CanvasTexture(c); it.tx.colorSpace = THREE.SRGBColorSpace;
        mat.uniforms.uMapa.value = it.tx;
        res();
      }));
    } else {
      it.canvas = document.createElement('canvas');
      it.tx = new THREE.CanvasTexture(it.canvas);
      it.tx.colorSpace = THREE.NoColorSpace;
      it.tx.premultiplyAlpha = true;
      it.tx.minFilter = THREE.LinearFilter;
      it.tx.generateMipmaps = false;
      mat.uniforms.uMapa.value = it.tx;
      it.pronta = Promise.resolve();
    }
    this.itens.push(it);
    return it;
  }

  /** um item por linha do elemento (para as linhas entrarem uma a uma) */
  porLinha(el, op = {}) {
    const ls = linhas(el);
    return ls.map((_, i) => this.novo(el, { ...op, linha: i }));
  }

  medir(dpr) {
    const s = Math.min(dpr * this.qualidade, 3);
    const cache = new Map();
    for (const it of this.itens) {
      const r = it.el.getBoundingClientRect();
      if (it.tipo === 'imagem') {
        it.x = r.left; it.y = r.top; it.w = r.width; it.h = r.height;
        continue;
      }
      if (!cache.has(it.el)) cache.set(it.el, linhas(it.el));
      let ls = cache.get(it.el);
      if (it.op.linha !== undefined) ls = ls[it.op.linha] ? [ls[it.op.linha]] : [];
      if (!ls.length) { it.w = it.h = 0; continue; }
      const fs = parseFloat(ls[0].palavras[0].st.fontSize);
      const pad = Math.ceil(fs * 0.22);
      const x0 = Math.min(...ls.map(l => l.x0)) - pad, x1 = Math.max(...ls.map(l => l.x1)) + pad;
      const y0 = Math.min(...ls.map(l => l.y0)) - pad, y1 = Math.max(...ls.map(l => l.y1)) + pad;
      it.x = x0; it.y = y0; it.w = x1 - x0; it.h = y1 - y0;
      const c = it.canvas;
      c.width = Math.min(4096, Math.ceil(it.w * s)); c.height = Math.min(4096, Math.ceil(it.h * s));
      const ctx = c.getContext('2d');
      ctx.setTransform(c.width / it.w, 0, 0, c.height / it.h, 0, 0);
      ctx.clearRect(0, 0, it.w, it.h);
      ctx.fillStyle = '#fff';
      ctx.textBaseline = 'alphabetic';
      for (const l of ls) for (const p of l.palavras) desenhaPalavra(ctx, p, p.x - x0, p.y - y0);
      it.tx.dispose();
      it.tx.needsUpdate = true;
    }
  }

  resize(w, h) {
    this.cam.right = w; this.cam.bottom = -h;
    this.cam.updateProjectionMatrix();
  }

  atualiza() {
    const W = this.cam.right, H = -this.cam.bottom;
    for (const it of this.itens) {
      const u = it.mesh.material.uniforms;
      const R = it.recorte || it;
      const vis = it.visivel && it.opac > 0.001 && R.w > 0;
      it.mesh.visible = vis;
      if (!vis) continue;
      const w = R.w * it.escala, h = R.h * it.escala;
      it.mesh.position.set(R.x + R.w / 2 + it.dx, -(R.y + R.h / 2 + it.dy), 0);
      it.mesh.scale.set(w, h, 1);
      u.uOpac.value = it.opac;
      u.uTam.value.set(w, h);
      u.uRaio.value = (it.recorte?.raio ?? it.raio) * it.escala;
      u.uCor.value.copy(it.cor);
      u.uLavar.value = it.lavar;
      if (it.tipo === 'imagem' && it.tx?.image) {
        // object-fit: cover — do próprio retângulo, ou da tela inteira (o retângulo vira uma janela para a foto)
        const alvo = it.op.cobre === 'tela' ? { x: 0, y: 0, w: W, h: H } : { x: R.x, y: R.y, w: R.w, h: R.h };
        const ia = it.tx.image.width / it.tx.image.height, ra = alvo.w / alvo.h;
        let iw, ih;
        if (ia > ra) { ih = alvo.h; iw = ih * ia; } else { iw = alvo.w; ih = iw / ia; }
        const ix = alvo.x + (alvo.w - iw) * (it.op.focoX ?? 0.5), iy = alvo.y + (alvo.h - ih) * (it.op.focoY ?? 0.5);
        u.uUv.value.set((R.x - ix) / iw, (iy + ih - (R.y + R.h)) / ih, R.w / iw, R.h / ih);
      }
    }
  }
}
