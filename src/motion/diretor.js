// O diretor: liga a rolagem (Lenis + ScrollTrigger) ao palco. A cada quadro lê a posição na trilha (em telas),
// avalia as pistas presas ao scroll (suavizadas), troca os marcos de cada cena (por tempo, em máquina de
// estados: rolar rápido pula marcos sem empilhar animação) e desenha.
import * as THREE from 'three';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import Snap from 'lenis/snap';
import { CENAS, INI, PASSO, PARADAS, avalia, posesChave, misturaPose, opcoes } from './roteiro.js';
import { amortece, lerp, faixa, curva, EASE } from './ease.js';

const curvaIO = curva.io;
import { foco } from './foco.js';
import { corInterface } from './ui.js';

gsap.registerPlugin(ScrollTrigger);

// o filme anda no máximo a VMAX telas por segundo, por mais rápido que se role: cada marco tem tempo de
// tocar inteiro. Se a rolagem abre mais de SALTO telas de distância, o filme corta pela névoa até ela.
const VMAX = 0.75;
const SALTO = 1.5;

const PAPEL = new THREE.Color('#f6f3ec');
// a interface acompanha a névoa do salto (a troca de estado dela acontece escondida)
const borraInterface = () => {
  const el = document.querySelector('.interface');
  el.style.filter = foco.salto > 0.01 ? `blur(${(foco.salto * 12).toFixed(1)}px)` : 'none';
};
const BREU = new THREE.Color('#050505');

export class Diretor {
  constructor(palco, { reduzido }) {
    this.palco = palco;
    this.oculos = palco.oculos;
    this.estojo = palco.estojo;
    this.reduzido = reduzido;
    opcoes.reduzido = reduzido;
    this.cenas = [];
    this.y = 0;
    this.alvo = {};
    this.atual = null;
    this.mouse = { x: 0, y: 0, sx: 0, sy: 0 };
    this.extra = { dyOculos: 0, giro: 0, oculosOpac: 1, mouse: 1, miraCena: 0 };
    // texto que a lente mira fora da hero (o sol e o fecho escolhem a caixa e animam o peso em extra.miraCena)
    this.miraCaixa = null;
    // o play do fecho (por tempo): hastes, estojo subindo, óculos deitando, tampa, luz apagando
    this.play = { dobraD: 0, dobraE: 0, sobe: 0, deita: 0, tampa: 1.95, escuro: 0 };
    // o estojo fechado cai na borda do painel do fim (0 = parado no meio da tela, 1 = pousado no painel)
    this.pouso = { k: 0, quique: 0, giro: 0 };
    this.secoes = [...document.querySelectorAll('.cena')];
    this.fim = document.querySelector('.fim__painel');
    this.vaga = document.querySelector('.fim__estojo');
    for (const c of CENAS) document.getElementById(c.id).style.setProperty('--h', c.telas * 100 * PASSO);

    addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse') return;
      this.mouse.x = e.clientX / innerWidth - 0.5;
      this.mouse.y = e.clientY / innerHeight - 0.5;
    });
  }

  adiciona(cena) { this.cenas.push(cena); cena.atual = -1; }

  inicia() {
    if (!this.reduzido) {
      this.lenis = new Lenis({ lerp: 0.065, wheelMultiplier: 0.8, smoothWheel: true, syncTouch: false });
      this.lenis.on('scroll', ScrollTrigger.update);
      // a rolagem encosta na parada mais próxima quando para perto dela (nunca puxa de longe)
      this.snap = new Snap(this.lenis, { type: 'proximity', distanceThreshold: '30%', debounce: 260, duration: 0.9, easing: t => 1 - Math.pow(1 - t, 3) });
    }
    this.ultimo = performance.now();
    gsap.ticker.add(t => this.quadro(t * 1000));
    this.resize();
    addEventListener('resize', () => this.resize());
    // links internos: rolagem suave até a cena
    document.addEventListener('click', e => {
      const a = e.target.closest('a[href^="#"]');
      if (!a) return;
      const id = a.getAttribute('href').slice(1);
      const alvo = id === 'topo' ? 0 : this.posicaoDe(id);
      if (alvo === null) return;
      e.preventDefault();
      this.vaiPara(alvo);
    });
  }

  /** posição (px) de rolagem de uma cena ou elemento */
  posicaoDe(id) {
    const marcos = { armacoes: INI.armacoes, lentes: INI.lentes + 0.95, sol: INI.sol + 0.95, dias: INI.dias + 0.6 };
    if (marcos[id] !== undefined) return marcos[id] * innerHeight * PASSO;
    // o formulário: o painel inteiro na tela, logo abaixo da nav
    if (id === 'agendar') return this.fim.getBoundingClientRect().top + this.scroll() - innerHeight * 0.14;
    const el = document.getElementById(id);
    if (!el) return null;
    return el.getBoundingClientRect().top + (this.lenis ? this.lenis.animatedScroll : scrollY);
  }

  vaiPara(px, duracao) {
    // longe demais para rolar sem atropelar as cenas: corta pela névoa direto para lá
    if (this.lenis && Math.abs(px - this.scroll()) / (innerHeight * PASSO) > SALTO) { this.salta(px); return; }
    const d = duracao ?? Math.min(2.6, 0.9 + Math.abs(px - this.scroll()) / innerHeight * 0.16);
    this.livre = true;
    if (this.lenis) this.lenis.scrollTo(px, { duration: d, easing: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2), onComplete: () => { this.livre = false; } });
    else scrollTo({ top: px, behavior: 'auto' });
  }

  scroll() { return this.lenis ? this.lenis.animatedScroll : scrollY; }

  /** corte pela névoa: tudo desfoca, o filme pula para onde a rolagem está, ou para `px` (um link), com os
   * estados aplicados sem animar, e volta */
  salta(px) {
    this.saltando = true;
    if (px !== undefined) this.livre = true;
    gsap.killTweensOf(foco, 'salto');
    gsap.to(foco, {
      salto: 1, duration: 0.3, ease: 'power2.in',
      onUpdate: borraInterface,
      onComplete: () => {
        if (px !== undefined) {
          this.lenis.scrollTo(px, { immediate: true, force: true });
          this.real = px / (innerHeight * PASSO);
          // a parede volta a valer só depois que os marcos aplicaram o estado de destino
          this.liberaDepois = true;
        }
        this.yv = this.real;
        this.imediato = true;
        this.atual = null;
        this.saltando = false;
        gsap.to(foco, { salto: 0, duration: 0.9, ease: 'power2.out', onUpdate: borraInterface });
      },
    });
  }

  resize() {
    this.palco.resize();
    this.palco.placa.medir(this.palco.dpr);
    for (const c of this.cenas) c.resize?.();
    this.K = posesChave(this.palco);
    // caixas dos textos que as lentes miram (a lente reduz o texto e o mostra inteiro): o título da hero,
    // as duas frases do sol e a promessa do fecho
    const caixa = el => {
      const r = document.createRange();
      r.selectNodeContents(el);
      const q = r.getBoundingClientRect();
      return { x: (q.left + q.right) / 2 / innerWidth, y: 1 - (q.top + q.bottom) / 2 / innerHeight, w: q.width / innerHeight, h: q.height / innerHeight };
    };
    this.titulo = caixa(document.querySelector('.abertura__titulo'));
    this.frasesSol = [...document.querySelectorAll('.sol__titulo')].map(caixa);
    this.caixaFecho = caixa(document.querySelector('.fecho__titulo'));
    this.lenis?.resize();
    if (this.snap) {
      this.tiraParadas?.forEach(f => f());
      this.tiraParadas = PARADAS.map(p => this.snap.add(p * innerHeight * PASSO));
    }
    ScrollTrigger.refresh();
  }

  quadro(agora) {
    const dt = Math.min(0.05, (agora - this.ultimo) / 1000);
    this.ultimo = agora;
    if (this.lenis) this.lenis.raf(agora);
    // a parede do fim: o painel do formulário só sobe depois que o estojo fechou (rolando rápido, a rolagem
    // espera aqui o play terminar; os links da nav passam, porque saltam pela névoa)
    const parede = INI.fim * innerHeight * PASSO;
    if (this.lenis && !this.livre && this.play.escuro < 0.98 && this.scroll() > parede) this.lenis.scrollTo(parede, { immediate: true, force: true });
    const real = this.scroll() / (innerHeight * PASSO);
    this.real = real;
    if (this.yv === undefined || this.reduzido) this.yv = real;
    else if (!this.saltando) {
      const falta = real - this.yv;
      if (Math.abs(falta) > SALTO) this.salta();
      else {
        // segue a rolagem amortecido, com teto de velocidade
        const passo = falta * (1 - Math.exp(-5 * dt)), teto = VMAX * dt;
        this.yv += Math.max(-teto, Math.min(teto, passo));
      }
    }
    const y = this.yv;
    this.y = y;
    const imediato = this.imediato;
    this.imediato = false;

    // no painel do fim, a nav ganha fundo (o formulário passa por baixo dela)
    const fundoNav = y > INI.fim + 0.55;
    if (fundoNav !== this.fundoNav) { document.querySelector('.nav').classList.toggle('nav--fundo', fundoNav); this.fundoNav = fundoNav; }

    // cor da interface: tinta enquanto a página está clara (do sol ao fecho), clara no breu
    const clara = y < INI.sol + 0.3 || this.play.escuro > 0.5;
    if (clara !== this.uiClara) { corInterface(clara, this.uiClara === undefined); this.uiClara = clara; }

    // marcos
    for (const c of this.cenas) {
      let i = 0;
      while (i < c.marcos.length && y >= c.marcos[i]) i++;
      if (i !== c.atual) { const de = c.atual; c.atual = i; c.vai(i, de, de === -1 || imediato); }
    }
    if (this.liberaDepois && imediato) { this.livre = false; this.liberaDepois = false; }

    // pistas presas ao scroll, suavizadas
    const a = avalia(y, this.K, this.alvo);
    const lam = this.reduzido ? 30 : 9;
    if (!this.atual) this.atual = { ...a, pose: { ...a.pose } };
    const s = this.atual;
    for (const k in a) {
      if (k === 'pose') continue;
      s[k] = amortece(s[k], a[k], lam, dt);
    }
    for (const k in a.pose) s.pose[k] = amortece(s.pose[k], a.pose[k], lam, dt);
    for (const c of this.cenas) c.quadro?.(y, dt, s);

    this.aplica(s, dt);
    this.palco.render(agora);
  }

  aplica(s, dt) {
    const P = this.palco, oc = this.oculos, e = P.estado;
    // mouse: inclina os óculos e as lentes passeiam pelas letras (só no começo do site)
    const m = this.mouse;
    m.sx = amortece(m.sx, m.x, 4, dt); m.sy = amortece(m.sy, m.y, 4, dt);
    const inf = this.reduzido ? 0 : this.extra.mouse;
    const pose = s.pose;
    const g = oc.grupo;
    const t = performance.now() / 1000;
    const flut = this.reduzido ? 0 : 1;
    g.scale.setScalar(pose.s);
    g.position.set(
      pose.px + m.sx * 0.28 * inf,
      pose.py - m.sy * 0.16 * inf + Math.sin(t * 0.9) * 0.012 * flut + this.extra.dyOculos,
      pose.pz,
    );
    g.rotation.set(pose.pitch + m.sy * 0.2 * inf + Math.sin(t * 0.7) * 0.012 * flut, pose.yaw + m.sx * 0.38 * inf + this.extra.giro, pose.roll, 'YXZ');

    // fecho: hastes, estojo e os óculos deitando dentro dele
    oc.estado.dobraD = this.play.dobraD;
    oc.estado.dobraE = this.play.dobraE;
    this.confereVaga();
    this.posicionaEstojo();
    oc.estado.tinta = s.tinta;
    oc.aplica();

    e.expo.raio = s.expoRaio;
    e.expo.forca = s.expoForca;
    const lt = oc.lenteNaTela(P.camera, 1);
    e.expo.x = lt.x; e.expo.y = lt.y;
    // a lente mira o texto da vez e o reduz até ele caber inteiro nela: o título da hero (some na passagem
    // para as armações), as frases do sol e a promessa do fecho (a cena escolhe e troca dentro da névoa)
    const pesoHero = this.titulo ? 1 - faixa(this.y, 0.12, INI.armacoes) : 0;
    const alvo = pesoHero > 0 ? this.titulo : this.miraCaixa;
    if (alvo) {
      const folga = pesoHero > 0 ? 0.62 : 0.7;
      oc.mira.set(alvo.x, alvo.y, pesoHero > 0 ? pesoHero : this.extra.miraCena, (2 * lt.r * folga) / Math.max(alvo.w, alvo.h));
    } else oc.mira.z = 0;
    const d0 = Math.min(6, foco.base + foco.extra);
    e.desfoque = d0 + (6 - d0) * foco.salto;
    for (const l of oc.lentes) l.material.uniforms.uFoco.value = foco.lente + foco.salto * 4.5;
    e.fundo.copy(BREU).lerp(PAPEL, s.papel * (1 - this.play.escuro));
  }

  posicionaEstojo() {
    const es = this.estojo, P = this.palco, pl = this.play, oc = this.oculos;
    if (pl.sobe <= 0.001) { es.grupo.visible = false; oc.grupo.visible = true; return; }
    es.grupo.visible = true;
    const v = P.visivel();
    const cel = innerWidth <= 720;
    // o estojo é 12% maior que os óculos: deitados e dobrados, eles cabem com folga no forro
    const sE = this.K.alto.s * 1.12;
    // aberto, embaixo dos óculos, em 3/4 de cima; sobe de fora da tela
    const base = { px: 0, py: -v.h * (cel ? 0.1 : 0.16), pz: 0, s: sE, yaw: -0.12, pitch: 0.62, roll: 0 };
    const fora = { ...base, py: -v.h * 0.95 };
    let p = misturaPose(fora, base, pl.sobe);
    // fechado, ele cai na borda de cima do painel do fim e segue com ele
    const vaga = this.poseNaVaga();
    if (vaga && this.pouso.k > 0) p = misturaPose(p, vaga, this.pouso.k);
    // se o painel sobe mais rápido do que o estojo cai, a borda apara o estojo (ele nunca passa para dentro)
    if (vaga && this.pousado) p.py = Math.max(p.py, vaga.py);
    p.py += this.pouso.quique * v.h;
    p.yaw += this.pouso.giro;
    es.grupo.scale.setScalar(p.s);
    es.grupo.position.set(p.px, p.py, p.pz);
    es.grupo.rotation.set(p.pitch, p.yaw, p.roll, 'YXZ');
    es.estado.tampa = pl.tampa;

    // os óculos deitam e entram no estojo: primeiro sobem para cima da boca já virando, depois descem retos
    // (nunca atravessam a parede); dobrados e deitados, a frente fica para cima
    const d = pl.deita;
    if (d > 0.001) {
      es.grupo.updateMatrixWorld(true);
      const acima = new THREE.Vector3(0, 70, 0).applyMatrix4(es.grupo.matrixWorld);
      const dentro = new THREE.Vector3(0, -5, 0).applyMatrix4(es.grupo.matrixWorld);
      const qE = new THREE.Quaternion().setFromEuler(es.grupo.rotation);
      const qDeita = qE.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2));
      const a = curvaIO(Math.min(1, d / 0.55)), b = curvaIO(Math.max(0, (d - 0.5) / 0.5));
      const g = oc.grupo;
      const q0 = new THREE.Quaternion().setFromEuler(g.rotation);
      g.position.lerp(acima, a).lerp(dentro, b);
      g.quaternion.copy(q0.slerp(qDeita, a));
      g.scale.setScalar(lerp(g.scale.x, p.s / 1.12, a));
    }
    // fechado, os óculos não aparecem mais (e não custam o raymarching)
    oc.grupo.visible = pl.tampa > 0.03;
  }

  /** pose do estojo pousado na borda de cima do painel do fim (null antes de o painel existir na tela) */
  poseNaVaga() {
    const r = this.vaga.getBoundingClientRect();
    const P = this.palco, v = P.visivel();
    const cy = (r.top + r.height * 0.5) / innerHeight;
    const s = (r.width / innerWidth) * v.w / 158;
    return { px: ((r.left + r.width * 0.5) / innerWidth - 0.5) * v.w, py: (0.5 - cy) * v.h, pz: 0, s, yaw: -0.35, pitch: 0.36, roll: 0.03 };
  }

  /** o painel do fim chegou perto do estojo: ele cai e pousa (na volta, sobe de novo) */
  confereVaga() {
    if (!this.vaga || this.play.tampa > 0.05) return;
    const r = this.vaga.getBoundingClientRect();
    const cy = (r.top + r.height * 0.5) / innerHeight;
    const pousar = cy < 0.92;
    if (pousar === this.pousado) return;
    this.pousado = pousar;
    gsap.killTweensOf(this.pouso);
    if (pousar) {
      // desce girando (uma volta que vai freando), acelerando até bater na borda, e quica de leve
      this.pouso.giro = Math.PI * 2 * (1 - this.pouso.k);
      gsap.to(this.pouso, { k: 1, duration: 1.25, ease: 'power2.in' });
      gsap.to(this.pouso, { giro: 0, duration: 1.25, ease: 'power1.out' });
      gsap.timeline({ delay: 1.25 }).set(this.pouso, { quique: 0 })
        .to(this.pouso, { quique: 0.018, duration: 0.16, ease: 'power2.out' })
        .to(this.pouso, { quique: 0, duration: 0.32, ease: 'bounce.out' });
    } else gsap.to(this.pouso, { k: 0, quique: 0, giro: 0, duration: 0.7, ease: EASE.io });
  }

}
