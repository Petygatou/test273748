// O palco: um canvas WebGL fixo atrás da interface. A cada quadro: a placa (camada de leitura) vai
// nítida para um alvo; uma pirâmide de reduções gera os níveis de desfoque; a composição monta o fundo
// (desfoque por região, exposição do sol, vidro fosco) e vai para a tela; por cima, os óculos e o estojo.
import * as THREE from 'three';
import { Placa } from './placa.js';
import { vertTela, fragReduz, fragComposicao, fragTela } from './shaders.js';
import { Oculos } from './glasses/oculos.js';

const NIVEIS = 7;

export class Palco {
  constructor(canvas, { dprMax = 2 } = {}) {
    this.canvas = canvas;
    this.dprMax = dprMax;
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance', stencil: false }));
    r.autoClear = false;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NoToneMapping;

    this.placa = new Placa();
    this.estado = {
      fundo: new THREE.Color('#050505'),
      desfoque: 4.6,
      faixas: [],
      paineis: [],
      expo: { x: 0.5, y: 0.5, raio: 0, forca: 1 },
      grao: 0.012,
    };

    const rtOp = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, generateMipmaps: false };
    this.niveis = Array.from({ length: NIVEIS }, () => new THREE.WebGLRenderTarget(4, 4, rtOp));
    this.rtComp = new THREE.WebGLRenderTarget(4, 4, rtOp);

    // uniforms compartilhados pela composição, pelas lentes e pela armação
    this.u = {
      uN0: { value: this.niveis[0].texture }, uN1: { value: this.niveis[1].texture }, uN2: { value: this.niveis[2].texture },
      uN3: { value: this.niveis[3].texture }, uN4: { value: this.niveis[4].texture }, uN5: { value: this.niveis[5].texture },
      uN6: { value: this.niveis[6].texture },
      uTam: { value: Array.from({ length: NIVEIS }, () => new THREE.Vector2(1, 1)) },
      uExpo: { value: new THREE.Vector4(0.5, 0.5, 0, 1) },
      uAspecto: { value: 1 },
    };

    const tela = (frag, uniforms) => new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: vertTela, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
    this.matReduz = tela(fragReduz, { uFonte: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.matComp = tela(fragComposicao, {
      ...this.u,
      uDesfoque: { value: 4.6 },
      uFaixa: { value: Array.from({ length: 8 }, () => new THREE.Vector4()) },
      uNFaixas: { value: 0 },
      uPainel: { value: [new THREE.Vector4(), new THREE.Vector4()] },
      uPainelInfo: { value: [new THREE.Vector4(), new THREE.Vector4()] },
      uRes: { value: new THREE.Vector2(1, 1) },
      uDpr: { value: 1 },
    });
    this.matTela = tela(fragTela, { uFonte: { value: this.rtComp.texture }, uGrao: { value: 0.012 }, uSemente: { value: 0 } });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.matReduz);
    this.quad.frustumCulled = false;
    this.camQuad = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.cena = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(24, 1, 0.02, 60);
    this.camera.position.set(0, 0, 8);
    this.distancia = 8;

    this.ativo = true;
    this.resize();
  }

  async montaOculos(tartaruga) {
    this.oculos = new Oculos({ tartaruga, fundo: this.rtComp.texture, desfoque: this.u });
    this.cena.add(this.oculos.grupo);
    await this.oculos.carregaCampos();
  }

  /** largura e altura visíveis (unidades da cena) no plano z = 0 */
  visivel() {
    const h = 2 * this.distancia * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2);
    return { w: h * this.camera.aspect, h };
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, this.dprMax);
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(w, h, false);
    this.w = w; this.h = h;
    const bw = Math.round(w * this.dpr), bh = Math.round(h * this.dpr);
    this.bw = bw; this.bh = bh;
    let lw = bw, lh = bh;
    for (let i = 0; i < NIVEIS; i++) {
      this.niveis[i].setSize(lw, lh);
      this.u.uTam.value[i].set(lw, lh);
      lw = Math.max(1, Math.round(lw / 2)); lh = Math.max(1, Math.round(lh / 2));
    }
    this.rtComp.setSize(bw, bh);
    this.u.uAspecto.value = w / h;
    this.matComp.uniforms.uRes.value.set(bw, bh);
    this.matComp.uniforms.uDpr.value = this.dpr;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.placa.resize(w, h);
  }

  passe(mat, alvo) {
    this.quad.material = mat;
    this.renderer.setRenderTarget(alvo);
    this.renderer.render(this.quad, this.camQuad);
  }

  render(tempo) {
    if (!this.ativo) return;
    const r = this.renderer, e = this.estado;
    this.placa.atualiza();

    r.setRenderTarget(this.niveis[0]);
    r.setClearColor(e.fundo, 1);
    r.clear(true, false, false);
    r.render(this.placa.cena, this.placa.cam);

    for (let i = 1; i < NIVEIS; i++) {
      const src = this.niveis[i - 1];
      this.matReduz.uniforms.uFonte.value = src.texture;
      this.matReduz.uniforms.uTexel.value.set(1 / src.width, 1 / src.height);
      this.passe(this.matReduz, this.niveis[i]);
    }

    const c = this.matComp.uniforms;
    c.uDesfoque.value = e.desfoque;
    c.uNFaixas.value = Math.min(8, e.faixas.length);
    e.faixas.slice(0, 8).forEach((f, i) => c.uFaixa.value[i].set(1 - f.y1 / this.h, 1 - f.y0 / this.h, f.nitidez, f.desfoque));
    for (let i = 0; i < 2; i++) {
      const p = e.paineis[i];
      if (!p || p.opac <= 0) { c.uPainelInfo.value[i].set(0, 0, 0, 0); continue; }
      c.uPainel.value[i].set(p.x / this.w, 1 - (p.y + p.h) / this.h, (p.x + p.w) / this.w, 1 - p.y / this.h);
      c.uPainelInfo.value[i].set(p.raio, p.opac, p.desfoque ?? 5, p.brilho ?? 1);
    }
    this.u.uExpo.value.set(e.expo.x, e.expo.y, e.expo.raio, e.expo.forca);
    this.passe(this.matComp, this.rtComp);

    r.setRenderTarget(null);
    r.setClearColor(0x000000, 1);
    r.clear(true, true, false);
    this.matTela.uniforms.uGrao.value = e.grao;
    this.matTela.uniforms.uSemente.value = (tempo * 0.001) % 7;
    this.quad.material = this.matTela;
    r.render(this.quad, this.camQuad);

    if (this.oculos) this.oculos.quadro(this.camera, this.bw, this.bh, this.bh);
    if (this.estojo) this.estojo.quadro(this.camera, this.bh);
    r.render(this.cena, this.camera);
  }
}
