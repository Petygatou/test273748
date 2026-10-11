// The master choreography. Every cue is written in VO time (seconds in vo.mp3, from the
// word-level transcription in data/words.json) and shifted by VO_OFFSET onto the film clock.
import * as THREE from 'three';
import { makeText, scramble } from './overlay.js';

export const VO_OFFSET = 0.8;
const v = x => x + VO_OFFSET;
export const DURATION = v(66.7);

export function buildTimeline({ s3, hud, typeRoot, cover }) {
  const tl = gsap.timeline({ paused: true, defaults: { ease: 'expo.out' } });
  const fx = [];        // sound effects
  const music = [];     // music layers
  const hooks = [];     // per-frame functions (decoders, counters)
  const sfx = (type, t, p = {}) => fx.push({ type, t, p });

  const cam = s3.cam, P = s3.post, pw = s3.pw, S = s3.structureState, M = s3.modState;
  const pu = s3.particles.material.uniforms;
  const panels = s3.panels;

  /* ---------- helpers ---------- */
  // text whose words are revealed exactly when spoken
  function say(html, opt, times, out, outStyle = 'up') {
    const T = makeText(typeRoot, html, opt);
    const t0 = Array.isArray(times) ? times[0] : times;
    tl.set(T.el, { opacity: 1 }, v(t0) - 0.001);
    const style = opt.style || 'rise';
    T.words.forEach((w, i) => {
      const at = v(Array.isArray(times) ? (times[i] ?? times[times.length - 1]) : times + i * (opt.stagger ?? 0.06));
      if (style === 'rise') tl.fromTo(w, { yPercent: 115 }, { yPercent: 0, duration: 0.6 }, at);
      else if (style === 'stamp') tl.fromTo(w, { scale: 1.9, opacity: 0, filter: 'blur(14px)' }, { scale: 1, opacity: 1, filter: 'blur(0px)', duration: 0.42, ease: 'power4.out' }, at);
      else if (style === 'blur') tl.fromTo(w, { opacity: 0, filter: 'blur(18px)', y: 18 }, { opacity: 1, filter: 'blur(0px)', y: 0, duration: 0.7, ease: 'power3.out' }, at);
      else if (style === 'chars') {
        const cs = w.querySelectorAll('.c');
        tl.fromTo(cs, { yPercent: 120, rotate: 8 }, { yPercent: 0, rotate: 0, duration: 0.55, stagger: 0.022 }, at);
      } else if (style === 'assemble') {
        const cs = [...w.querySelectorAll('.c')];
        cs.forEach((c, j) => {
          const r = Math.sin(j * 91.7 + i * 13.1) * 0.5 + 0.5, r2 = Math.sin(j * 33.3 + 7) * 0.5 + 0.5;
          tl.fromTo(c, { x: (r - 0.5) * 900, y: (r2 - 0.5) * 600, rotate: (r - 0.5) * 220, opacity: 0, filter: 'blur(10px)' },
            { x: 0, y: 0, rotate: 0, opacity: 1, filter: 'blur(0px)', duration: 0.75, ease: 'expo.out' }, at + j * 0.018);
        });
      }
    });
    if (out != null) {
      const o = v(out);
      if (outStyle === 'up') tl.to(T.words, { yPercent: -115, duration: 0.32, ease: 'expo.in', stagger: 0.015 }, o - 0.32);
      else if (outStyle === 'blur') tl.to(T.el, { opacity: 0, filter: 'blur(20px)', scale: 1.06, duration: 0.35, ease: 'power2.in' }, o - 0.35);
      else if (outStyle === 'scatter') {
        T.chars.forEach((c, j) => {
          const r = Math.sin(j * 12.9898) * 0.5 + 0.5, r2 = Math.cos(j * 78.233) * 0.5 + 0.5;
          tl.to(c, { x: (r - 0.5) * 700, y: (r2 - 0.5) * 500, rotate: (r - 0.5) * 180, opacity: 0, filter: 'blur(8px)', duration: 0.4, ease: 'expo.in' }, o - 0.4);
        });
      }
      tl.set(T.el, { opacity: 0 }, o);
    }
    return T;
  }

  // mono label that decodes in
  function decode(text, opt, at, out, dur = 0.6) {
    const T = makeText(typeRoot, '', opt);
    const proxy = { p: 0 };
    tl.set(T.el, { opacity: 1 }, v(at));
    tl.fromTo(proxy, { p: 0 }, { p: 1, duration: dur, ease: 'none' }, v(at));
    if (out != null) { tl.to(T.el, { opacity: 0, duration: 0.2, ease: 'none' }, v(out) - 0.2); tl.set(T.el, { opacity: 0 }, v(out)); }
    hooks.push(t => { T.el.textContent = scramble(text, proxy.p, text.length, t); });
    return T;
  }

  function strike(T, at, color) {
    const bar = document.createElement('div'); bar.className = 'strike';
    if (color) { bar.style.background = color; bar.style.boxShadow = `0 0 30px ${color}`; }
    T.el.appendChild(bar);
    tl.fromTo(bar, { scaleX: 0 }, { scaleX: 1, duration: 0.28, ease: 'expo.out' }, v(at));
  }

  const camTo = (at, dur, to, ease = 'expo.inOut') => tl.to(cam, { ...to, duration: dur, ease }, at);
  const camSet = (at, to) => tl.set(cam, to, at);
  const flash = (at, amt = 0.8, dur = 0.6) => tl.fromTo(P, { flash: amt }, { flash: 0, duration: dur, ease: 'power2.out', immediateRender: false }, at);
  const shake = (at, amt = 1, dur = 0.7) => tl.fromTo(cam, { shake: amt }, { shake: 0, duration: dur, ease: 'power2.out', immediateRender: false }, at);
  const glitch = (at, amt = 0.8, dur = 0.3) => tl.fromTo(P, { glitch: amt }, { glitch: 0, duration: dur, ease: 'steps(6)', immediateRender: false }, at);
  const morph = (at, dur, target) => {
    const to = { cloud: 0, text: 0, rings: 0, shell: 0, galaxy: 0, [target]: 1 };
    tl.to(pw, { ...to, duration: dur, ease: 'power3.inOut' }, at);
  };
  const panelIn = (k, at, from, rot) => {
    const p = panels[k], h = p.userData.home;
    tl.set(p.userData, { opacity: 0 }, 0);
    tl.fromTo(p.position, { x: from.x, y: from.y, z: from.z }, { x: h.x, y: h.y, z: h.z, duration: 0.9, ease: 'expo.out' }, at);
    tl.fromTo(p.rotation, { x: rot.x0 || 0, y: rot.y0 || 0 }, { x: rot.x || 0, y: rot.y || 0, duration: 1.1, ease: 'expo.out' }, at);
    tl.to(p.userData, { opacity: 1, duration: 0.35, ease: 'power2.out' }, at);
  };
  const anchor = (world, label, sub, at, out, dx = 150, dy = -120) => {
    const a = hud.addAnchor({ world, label, sub, dx, dy, textP: 0 });
    tl.to(a, { alpha: 1, duration: 0.2, ease: 'none' }, at);
    tl.fromTo(a, { draw: 0 }, { draw: 1, duration: 0.45, ease: 'power3.out', immediateRender: false }, at);
    tl.fromTo(a, { textP: 0 }, { textP: 1, duration: 0.45, ease: 'none', immediateRender: false }, at + 0.2);
    tl.to(a, { alpha: 0, duration: 0.25, ease: 'none' }, out - 0.25);
    return a;
  };
  const worldOf = (obj, off) => () => s3.worldOf(obj, off);

  /* ---------- initial state ---------- */
  tl.set(cover, { opacity: 1 }, 0);
  tl.set(cam, { x: 0, y: 0.4, z: 26, tx: 0, ty: 0, tz: 0, roll: 0, fov: 58, shake: 0 }, 0);
  tl.set(P, { bgIntensity: 0, floor: 0, bloom: 1.1, flash: 0, glitch: 0, desat: 0, fade: 0 }, 0);
  tl.set(pu.uOpacity, { value: 0 }, 0);
  tl.set(pu.uSize, { value: 1 }, 0);
  tl.set(S, { opacity: 0, mods: 0, lift: 0, spin: 0, pulse: 0 }, 0);
  tl.set(hud.v, { chrome: 0, wave: 0, guides: 0 }, 0);

  /* ================= PRE-ROLL ================= */
  const lineEl = document.createElement('div');
  Object.assign(lineEl.style, { position: 'absolute', left: '0', top: '959px', width: '1080px', height: '2px', background: '#7c3aff', boxShadow: '0 0 24px #7c3aff, 0 0 60px #7c3aff', transform: 'scaleX(0)', opacity: '0' });
  typeRoot.appendChild(lineEl);
  tl.set(cover, { opacity: 0 }, 0.02);
  tl.set(lineEl, { opacity: 1 }, 0.05);
  tl.fromTo(lineEl, { scaleX: 0 }, { scaleX: 1, duration: 0.55, ease: 'expo.inOut' }, 0.05);
  tl.to(lineEl, { scaleY: 0, scaleX: 0.02, duration: 0.18, ease: 'expo.in' }, 0.62);
  tl.set(lineEl, { opacity: 0 }, 0.8);
  sfx('tick', 0.05, { gain: 0.35 });
  sfx('suck', 0.1, { dur: 0.7, gain: 0.35 });

  /* ================= 01 · O PROBLEMA ================= */
  flash(v(0), 0.55, 0.7);
  sfx('hit', v(0), { gain: 0.75 });
  tl.to(P, { bgIntensity: 0.9, duration: 2.2, ease: 'power2.out' }, v(0));
  tl.to(pu.uOpacity, { value: 0.55, duration: 2.5, ease: 'power2.out' }, v(0));
  tl.to(hud.v, { chrome: 1, wave: 1, duration: 0.8, ease: 'power2.out' }, v(0.1));
  camTo(v(0), 5.4, { z: 19, y: 0.2 }, 'power1.inOut');

  say('A maioria das empresas', { cls: 'h-s', y: 720 }, [0.0, 0.19, 0.6, 0.75], 3.45);
  say('não tem um problema de', { cls: 'h-xs', y: 800 }, [1.25, 1.43, 1.66, 1.68, 2.3], 3.45);
  const esf = say('esforço.', { cls: 'h-xl', y: 990, style: 'stamp' }, [2.44], 3.5, 'scatter');
  strike(esf, 2.98);
  sfx('thump', v(2.44), { gain: 0.8 });
  sfx('glitch', v(2.98), { dur: 0.22, gain: 0.25, seed: 4 });
  glitch(v(2.98), 0.5, 0.25);

  say('tem um problema de', { cls: 'h-xs', y: 790 }, [3.55, 3.75, 3.8, 4.14], 5.25);
  say('estrutura.', { cls: 'h-xl grad', y: 970, style: 'assemble' }, [4.2], 5.3, 'scatter');
  sfx('whoosh', v(4.1), { dur: 0.6, gain: 0.35, pan: 0.6 });
  sfx('thump', v(4.4), { gain: 0.9 });
  tl.fromTo(P, { floor: 0 }, { floor: 0.55, duration: 0.6, ease: 'power2.out', immediateRender: false }, v(4.35));
  tl.to(P, { floor: 0, duration: 0.5, ease: 'power2.in' }, v(4.9));
  shake(v(4.4), 0.6, 0.5);

  /* ================= 01b · peças soltas ================= */
  camSet(v(5.3), { x: 0, y: 1.2, z: 15.5, tx: 0, ty: 0.7, tz: -1 });
  camTo(v(5.3), 6.2, { z: 13.8, x: 0.5 }, 'power1.inOut');
  panelIn('site', v(5.5), { x: -12, y: 4.6, z: 0 }, { y0: 1.4, y: 0.3 });
  panelIn('ads', v(6.64), { x: 12, y: -1.2, z: 0 }, { y0: -1.4, y: 0.25 });
  panelIn('sys', v(7.88), { x: 1.0, y: 14, z: -2 }, { x0: -1.2, x: 0.12, y: -0.3 });
  sfx('whoosh', v(5.45), { dur: 0.55, gain: 0.5, pan: -0.8 });
  sfx('whoosh', v(6.6), { dur: 0.55, gain: 0.5, pan: 0.8 });
  sfx('whoosh', v(7.84), { dur: 0.55, gain: 0.45, pan: 0.1 });
  ['sheet', 'crm', 'app'].forEach((k, i) => {
    const p = panels[k];
    tl.fromTo(p.userData, { opacity: 0 }, { opacity: 0.3, duration: 1.2, ease: 'power2.out', immediateRender: false }, v(8.2 + i * 0.15));
    tl.fromTo(p.rotation, { y: (i - 1) * 0.8 }, { y: (i - 1) * 0.5, duration: 6, ease: 'none', immediateRender: false }, v(8.2));
  });
  anchor(worldOf(panels.site, new THREE.Vector3(-1.2, 1, 0)), 'SITE', 'De um lado.', v(5.9), v(9.75), 120, -140);
  anchor(worldOf(panels.ads, new THREE.Vector3(1.2, -0.9, 0)), 'CAMPANHA', 'Do outro.', v(7.05), v(9.75), 120, 130);
  anchor(worldOf(panels.sys, new THREE.Vector3(-1.4, -0.8, 0)), 'SISTEMA', 'Ninguém integra.', v(8.3), v(9.75), -120, 90);

  // connection attempts fail on "integra"
  [s3.brokenA, s3.brokenB].forEach((b, i) => {
    const u = b.material.uniforms;
    tl.set(u.uOpacity, { value: 1 }, 0);
    tl.set(u.uFlicker, { value: 0 }, 0);
    tl.fromTo(u.uDraw, { value: 0 }, { value: 0.78, duration: 0.55, ease: 'power2.out', immediateRender: false }, v(8.45 + i * 0.08));
    tl.to(u.uFlicker, { value: 1, duration: 0.05 }, v(9.0));
    tl.to(u.uDraw, { value: 0.42, duration: 0.3, ease: 'expo.out' }, v(9.02));
    tl.to(u.uOpacity, { value: 0.35, duration: 0.3 }, v(9.05));
    tl.to(u.uOpacity, { value: 0, duration: 0.4 }, v(13.2));
  });
  sfx('riser', v(8.45), { dur: 0.55, gain: 0.18 });
  sfx('glitch', v(9.0), { dur: 0.38, gain: 0.32, seed: 12 });
  glitch(v(9.0), 0.9, 0.35);
  tl.fromTo(hud.v, { broken: 0 }, { broken: 1, duration: 0.15, ease: 'none', immediateRender: false }, v(9.05));
  tl.to(hud.v, { broken: 0, duration: 0.3, ease: 'none' }, v(13.2));

  // "Cada peça funciona."
  [['site', 9.84, 660], ['ads', 10.21, 880], ['sys', 10.55, 1046]].forEach(([k, t, f]) => {
    tl.fromTo(panels[k].userData, { glow: 0.2 }, { glow: 1.3, duration: 0.15, ease: 'power2.out', immediateRender: false }, v(t));
    tl.to(panels[k].userData, { glow: 0.55, duration: 0.6, ease: 'power2.out' }, v(t) + 0.15);
    sfx('blip', v(t), { freq: f, gain: 0.2 });
  });
  say('Cada peça funciona.', { cls: 'h-m', y: 1420 }, [9.84, 10.21, 10.55], 11.35);

  // "nenhuma conversa com a outra." — the pieces turn their backs
  tl.to(panels.site.rotation, { y: -1.15, duration: 1.2, ease: 'expo.out' }, v(11.45));
  tl.to(panels.ads.rotation, { y: 1.15, duration: 1.2, ease: 'expo.out' }, v(11.6));
  tl.to(panels.sys.rotation, { x: -0.9, duration: 1.2, ease: 'expo.out' }, v(11.75));
  ['site', 'ads', 'sys'].forEach(k => tl.to(panels[k].userData, { glow: 0.08, duration: 0.8 }, v(11.5)));
  sfx('thump', v(11.45), { gain: 0.6 });
  say('Nenhuma conversa.', { cls: 'h-l', y: 1400, style: 'chars' }, [11.45, 11.89], 13.25);
  decode('0 conexões ativas', { cls: 'mono', y: 1500 }, 12.4, 13.25, 0.5);
  sfx('type', v(12.4), { count: 8, dur: 0.45 });

  // "e o crescimento fica esperando."
  camTo(v(13.3), 1.9, { z: 24, y: 1.6 }, 'expo.inOut');
  ['site', 'ads', 'sys'].forEach(k => tl.to(panels[k].userData, { opacity: 0.3, duration: 1 }, v(13.4)));
  say('o crescimento', { cls: 'h-l', y: 920 }, [13.47, 13.68], 15.15, 'blur');
  tl.fromTo(hud.v, { load: 0 }, { load: 1, duration: 0.3, ease: 'none', immediateRender: false }, v(13.9));
  tl.fromTo(hud.v, { loadP: 0 }, { loadP: 0.12, duration: 0.6, ease: 'power2.out', immediateRender: false }, v(14.0));
  tl.to(hud.v, { load: 0, duration: 0.15, ease: 'none' }, v(15.05));
  say('fica esperando.', { cls: 'h-s dim', y: 1220, style: 'blur' }, [14.17, 14.42], 15.15, 'blur');
  for (let t = 13.4; t < 15.2; t += 0.5) sfx('tick', v(t), { gain: 0.3, freq: 3500 });

  /* ================= 02 · NOVA PERSPECTIVA ================= */
  Object.keys(panels).forEach(k => tl.set(panels[k].userData, { opacity: 0 }, v(15.22)));
  camSet(v(15.22), { x: 0, y: 1.4, z: 18, tx: 0, ty: 0.6, tz: 0 });
  camTo(v(15.22), 2.3, { z: 16.5 }, 'power1.out');
  tl.set(P, { floor: 0.45 }, v(15.22));
  tl.set(pu.uOpacity, { value: 0.3 }, v(15.22));
  tl.set(s3.pile.userData, { opacity: 1, fall: 0, align: 0, suck: 0 }, v(15.22));
  tl.set(s3.pile.userData, { opacity: 0 }, 0);
  tl.to(s3.pile.userData, { fall: 1, duration: 1.7, ease: 'none' }, v(15.6));
  sfx('thump', v(15.24), { gain: 0.7 });
  sfx('clatter', v(15.9), { dur: 1.3, count: 22, gain: 0.35 });
  say('Crescer ≠ <span class="violet">acumular</span>', { cls: 'h-l', y: 400 }, [15.24, 15.6, 16.01], 17.5);
  decode('ferramentas  ×42', { cls: 'mono-l', y: 510 }, 16.71, 17.5, 0.5);
  sfx('type', v(16.71), { count: 10, dur: 0.5 });

  // freeze, then everything aligns
  tl.fromTo(P, { desat: 0 }, { desat: 0.85, duration: 0.25, ease: 'power2.out', immediateRender: false }, v(17.57));
  tl.to(P, { desat: 0, duration: 0.8, ease: 'power2.inOut' }, v(18.5));
  sfx('thump', v(17.57), { gain: 0.7 });
  tl.to(s3.pile.userData, { align: 1, duration: 1.5, ease: 'none' }, v(18.0));
  camTo(v(18.0), 2.4, { x: 1.8, y: 1.0, z: 16, ty: 0.9 }, 'power2.inOut');
  for (let i = 0; i < 12; i++) sfx('snap', v(18.05 + i * 0.105), { freq: [523, 587, 659, 784, 880, 1046][i % 6] * (i >= 6 ? 2 : 1), gain: 0.16 });
  say('Cada uma, trabalhando', { cls: 'h-s', y: 1470 }, [18.03, 18.39, 18.68], 19.25);
  tl.fromTo(P, { floorScan: -40 }, { floorScan: 40, duration: 1.1, ease: 'power2.inOut', immediateRender: false }, v(19.3));
  say('na mesma direção <span class="violet">→</span>', { cls: 'h-l', y: 1470 }, [19.12, 19.35, 19.71, 19.95], 20.4, 'blur');
  sfx('whoosh', v(19.3), { dur: 1.0, gain: 0.4, pan: 1 });
  sfx('riser', v(18.4), { dur: v(21.43) - v(18.4), gain: 0.42 });
  music.push({ type: 'roll', start: v(19.9), end: v(21.41) });

  // collapse: "Foi para isso que a..."
  tl.to(s3.pile.userData, { suck: 1, duration: 0.95, ease: 'expo.in' }, v(20.45));
  tl.to(P, { floor: 0, bgIntensity: 0.25, duration: 0.9, ease: 'power2.in' }, v(20.45));
  tl.to(pu.uOpacity, { value: 0.9, duration: 0.9 }, v(20.45));
  tl.fromTo(pu.uCollapse, { value: 0 }, { value: 1, duration: 0.95, ease: 'expo.in', immediateRender: false }, v(20.45));
  camTo(v(20.45), 0.95, { x: 0, y: 0, z: 12, tx: 0, ty: 0, tz: 0 }, 'expo.in');
  say('Foi para isso que a', { cls: 'h-s', y: 1400 }, [20.48, 20.62, 20.91, 21.18, 21.18], 21.42, 'blur');
  sfx('suck', v(20.5), { dur: 0.92, gain: 0.5 });

  /* ================= 03 · OPUS ================= */
  tl.set(s3.pile.userData, { opacity: 0 }, v(21.42));
  tl.set(pw, { cloud: 0, text: 1, rings: 0, shell: 0, galaxy: 0 }, v(21.42));
  tl.set(pw, { cloud: 1, text: 0 }, 0);
  camSet(v(21.42), { x: 0, y: 0, z: 17, tx: 0, ty: 0, tz: 0 });
  camTo(v(21.43), 1.0, { z: 15.5 }, 'power2.out');
  tl.fromTo(pu.uCollapse, { value: 1 }, { value: 0, duration: 1.0, ease: 'expo.out', immediateRender: false }, v(21.43));
  tl.fromTo(pu.uExplode, { value: 4 }, { value: 0, duration: 1.3, ease: 'expo.out', immediateRender: false }, v(21.43));
  tl.set(pu.uExplode, { value: 0 }, 0);
  tl.to(pu.uOpacity, { value: 1, duration: 0.2 }, v(21.43));
  flash(v(21.43), 0.85, 0.45);
  shake(v(21.43), 1.4, 0.9);
  tl.fromTo(P, { bloom: 2.6 }, { bloom: 1.2, duration: 1.2, ease: 'power2.out', immediateRender: false }, v(21.43));
  tl.to(P, { bgIntensity: 0.75, duration: 1.2, ease: 'power2.out' }, v(21.43));
  sfx('hit', v(21.43), { gain: 1.25 });
  decode('Tecnologia · Estratégia · Crescimento', { cls: 'mono', y: 1200 }, 21.66, 22.15, 0.4);

  // three disciplines become three orbits
  morph(v(22.15), 1.0, 'rings');
  camTo(v(22.15), 3.0, { x: 2.4, y: 1.6, z: 14, tx: 0, ty: -2.4, tz: 0 }, 'expo.inOut');
  const disc = [['Tecnologia', 22.2, 1250], ['Marketing', 22.92, 1360], ['Estratégia comercial', 23.76, 1470]];
  disc.forEach(([w, t, y], i) => {
    decode(`0${i + 1}`, { cls: 'mono', x: 100, y: y - 4, align: 'left' }, t, 25.25, 0.2);
    say(w, { cls: 'h-m', x: 165, y, align: 'left', maxW: 830 }, [t, t + 0.25], 25.25);
    sfx('blip', v(t), { freq: [784, 988, 1175][i], gain: 0.18 });
    sfx('whoosh', v(t) - 0.08, { dur: 0.45, gain: 0.25, pan: 0.5 });
  });

  // "construídos como uma só estrutura."
  morph(v(25.3), 1.1, 'shell');
  camTo(v(25.3), 2.0, { x: 0, y: 1.0, z: 13.5, tx: 0, ty: -0.8, tz: 0 }, 'expo.inOut');
  tl.to(pu.uOpacity, { value: 0.28, duration: 1 }, v(25.6));
  tl.to(pu.uSize, { value: 0.75, duration: 1 }, v(25.6));
  tl.to(S, { opacity: 1, duration: 0.9, ease: 'power2.out' }, v(25.55));
  tl.set(M, { core: 0, traffic: 0, site: 0, sys: 0, app: 0 }, 0);
  tl.fromTo(M, { core: 0 }, { core: 1, duration: 0.25, ease: 'power2.out', immediateRender: false }, v(26.72));
  tl.to(M, { core: 0.45, duration: 0.8 }, v(27.0));
  say('Uma só <span class="violet">estrutura.</span>', { cls: 'h-l', y: 1400 }, [26.14, 26.54, 26.72], 27.6);
  sfx('thump', v(26.72), { gain: 0.9 });
  flash(v(26.72), 0.25, 0.4);

  /* ================= 04 · A ESTRUTURA ================= */
  tl.to(S, { mods: 1, duration: 0.8, ease: 'power2.out' }, v(27.4));
  tl.to(P, { bloom: 0.75, duration: 1 }, v(25.5));
  tl.to(P, { bloom: 1.0, duration: 0.3 }, v(40.0));
  tl.to(P, { bloom: 0.75, duration: 0.5 }, v(54.3));
  const mp = s3.modPos;
  const viewOf = (k, side = 1) => {
    const p = mp[k], d = p.clone().normalize();
    const sideV = new THREE.Vector3(-d.z, 0, d.x).multiplyScalar(side * 2.2);
    const pos = p.clone().add(d.clone().multiplyScalar(8.5)).add(sideV);
    return { x: pos.x, y: 2.4, z: pos.z, tx: p.x * 0.75, ty: -0.6, tz: p.z * 0.75 };
  };
  const mods = [
    { k: 'traffic', t: 27.77, label: '01 / AQUISIÇÃO', sub: 'Atenção certa.', off: new THREE.Vector3(0, 1.3, 0), key: 28.86, end: 29.9 },
    { k: 'site', t: 29.95, label: '02 / CONVERSÃO', sub: 'Atenção → interesse.', off: new THREE.Vector3(1.4, 1.1, 0), key: 31.59, end: 32.4 },
    { k: 'sys', t: 32.44, label: '03 / OPERAÇÃO', sub: 'Tudo organizado.', off: new THREE.Vector3(1.4, 1.4, 0), key: 33.04, end: 34.6 },
    { k: 'app', t: 34.65, label: '04 / RELACIONAMENTO', sub: 'Cliente por perto.', off: new THREE.Vector3(0.8, 1.5, 0), key: 36.39, end: 36.95 },
  ];
  mods.forEach((m, i) => {
    camTo(v(m.t) - 0.25, 1.05, viewOf(m.k, i % 2 ? -1 : 1));
    sfx('whoosh', v(m.t) - 0.25, { dur: 0.7, gain: 0.42, pan: i % 2 ? -0.7 : 0.7 });
    tl.to(M, { [m.k]: 1, duration: 0.6, ease: 'power2.out' }, v(m.t) + 0.15);
    tl.to(M, { [m.k]: 0.5, duration: 0.6 }, v(m.end));
    anchor(worldOf(s3.modules[m.k], m.off), m.label, m.sub, v(m.t) + 0.05, v(m.end), i % 2 ? -120 : 120, -220);
    if (i > 0) {
      const ch = s3.chain[i - 1].material.uniforms;
      tl.set(ch.uDraw, { value: 0 }, 0);
      tl.to(ch.uDraw, { value: 1, duration: 0.9, ease: 'power2.inOut' }, v(m.t) - 0.2);
    }
  });
  sfx('blip', v(28.86), { freq: 988, gain: 0.18 });
  tl.set(s3.stream.material.uniforms.uSpeed, { value: 0.35 }, 0);
  tl.to(s3.stream.material.uniforms.uSpeed, { value: 0.9, duration: 0.6, ease: 'power2.out' }, v(28.86));
  // site converts at "interesse"
  tl.to(M, { site: 1.8, duration: 0.15, ease: 'power2.out' }, v(31.59));
  tl.to(M, { site: 1, duration: 0.6 }, v(31.75));
  sfx('blip', v(31.59), { freq: 1318, gain: 0.2 });
  // system organizes at "organiza"
  tl.set(s3.modules.sys.userData, { order: 0 }, 0);
  tl.to(s3.modules.sys.userData, { order: 1, duration: 1.1, ease: 'none' }, v(33.04));
  for (let i = 0; i < 8; i++) sfx('snap', v(33.06 + i * 0.11), { freq: [659, 784, 880, 1046][i % 4], gain: 0.13 });
  // app ping at "perto"
  sfx('blip', v(36.39), { freq: 1568, gain: 0.2, dur: 0.3 });
  sfx('blip', v(36.52), { freq: 2093, gain: 0.12, dur: 0.3 });

  // strategy: the whole system, from above
  camTo(v(36.75), 1.7, { x: 0.5, y: 20, z: 27, tx: 0, ty: -2.5, tz: 0 });
  tl.to(S, { spin: 0.55, duration: 3.6, ease: 'power1.inOut' }, v(36.9));
  sfx('whoosh', v(36.75), { dur: 1.0, gain: 0.45, pan: -0.5 });
  { const ch = s3.chain[3].material.uniforms; tl.set(ch.uDraw, { value: 0 }, 0); tl.to(ch.uDraw, { value: 1, duration: 0.9, ease: 'power2.inOut' }, v(37.0)); }
  tl.to(M, { core: 1.4, duration: 0.2, ease: 'power2.out' }, v(37.82));
  tl.to(M, { core: 1, duration: 0.6 }, v(38.05));
  sfx('thump', v(37.82), { gain: 0.8 });
  anchor(worldOf(s3.core, new THREE.Vector3(0, 2.2, 0)), '00 / DIREÇÃO', 'A estratégia decide.', v(37.3), v(40.1), 120, -260);
  s3.links.forEach((l, i) => {
    tl.set(l.material.uniforms.uDraw, { value: 0 }, 0);
    tl.to(l.material.uniforms.uDraw, { value: 1, duration: 0.5, ease: 'power3.out' }, v(38.91) + i * 0.1);
    sfx('blip', v(38.91) + i * 0.1, { freq: [523, 659, 784, 1046][i], gain: 0.12, dur: 0.1 });
  });
  tl.set(S, { pulse: 0 }, 0);
  tl.set(S, { pulse: 1 }, v(39.0));
  tl.set(M, { traffic: 1, site: 1, sys: 1, app: 1 }, v(39.0));
  const bu = s3.beam.material.uniforms;
  tl.set(bu.uOpacity, { value: 0 }, 0); tl.set(bu.uLen, { value: 0 }, 0);
  tl.to(bu.uOpacity, { value: 1, duration: 0.1 }, v(39.53));
  tl.to(bu.uLen, { value: 1, duration: 0.6, ease: 'expo.out' }, v(39.53));
  tl.to(bu.uOpacity, { value: 0, duration: 0.4 }, v(40.05));
  sfx('whoosh', v(39.45), { dur: 0.6, gain: 0.45, pan: 0.2 });
  sfx('thump', v(39.53), { gain: 0.7 });
  flash(v(39.53), 0.3, 0.5);
  say('Tudo apontando para o <span class="violet">mesmo lugar.</span>', { cls: 'h-s', y: 1470 }, [38.91, 39.11, 39.53, 39.53, 39.53, 39.6, 39.7], 40.15, 'blur');

  /* ================= 05 · O DIFERENCIAL ================= */
  tl.to(S, { opacity: 0, duration: 0.25, ease: 'power2.in' }, v(39.95));
  tl.to(pu.uOpacity, { value: 0.12, duration: 0.3 }, v(40.0));
  tl.to(P, { bgIntensity: 0.45, duration: 0.3 }, v(40.0));
  decode('Não vendemos', { cls: 'mono-l', y: 650 }, 40.19, 42.85, 0.35);
  sfx('type', v(40.19), { count: 8, dur: 0.35 });
  const words3 = [['páginas,', 40.91, 820], ['sistemas', 41.4, 970], ['ou campanhas.', 41.96, 1120]];
  words3.forEach(([w, t, y], i) => {
    const T = say(w, { cls: 'h-l', y, style: 'stamp' }, [t, 42.08], 42.85, 'scatter');
    strike(T, t + 0.3);
    sfx('thump', v(t), { gain: 0.55 });
    sfx('tick', v(t + 0.3), { gain: 0.35, freq: 2000 });
  });
  sfx('glitch', v(42.45), { dur: 0.3, gain: 0.22, seed: 21 });
  glitch(v(42.45), 0.5, 0.3);

  // "Desenvolvemos soluções em que cada elemento tem uma função." — blueprint from above
  camSet(v(42.85), { x: 0, y: 44, z: 5, tx: 0, ty: 0, tz: 0.6, roll: 0 });
  camTo(v(42.85), 3.4, { y: 36, z: 4 }, 'power2.out');
  tl.set(S, { spin: 0 }, v(42.85));
  tl.to(S, { opacity: 1, duration: 0.4 }, v(42.85));
  tl.to(S, { spin: 0.35, duration: 3.5, ease: 'none' }, v(42.85));
  tl.to(P, { floor: 0.7, bgIntensity: 0.6, duration: 0.5 }, v(42.85));
  tl.to(pu.uOpacity, { value: 0.25, duration: 0.5 }, v(42.85));
  sfx('whoosh', v(42.8), { dur: 0.6, gain: 0.4, pan: -0.4 });
  say('Soluções com <span class="violet">propósito.</span>', { cls: 'h-m', y: 360 }, [43.56, 43.56, 44.09], 46.3, 'up');
  const fn = [['traffic', 'Atrair'], ['site', 'Converter'], ['sys', 'Organizar'], ['app', 'Reter']];
  fn.forEach(([k, s], i) => {
    const t0 = v(44.43) + i * 0.3;
    anchor(worldOf(s3.modules[k], new THREE.Vector3(0, 0.8, 0)), 'Função', s, t0, v(46.3), [60, 120, -60, 120][i], [-170, 150, 170, -150][i]);
    sfx('blip', t0, { freq: [880, 988, 1175, 1318][i], gain: 0.13, dur: 0.12 });
  });
  anchor(worldOf(s3.core, new THREE.Vector3(0, 0, 0)), 'Função', 'Direcionar', v(45.7), v(46.3), -110, -200);
  sfx('thump', v(45.7), { gain: 0.6 });

  // "dentro de uma estratégia maior." — pull out to reveal the bigger network
  morph(v(46.3), 1.6, 'galaxy');
  camTo(v(46.3), 1.9, { x: 0, y: 120, z: 95, tx: 0, ty: 0, tz: 0 });
  tl.to(pu.uOpacity, { value: 1, duration: 1 }, v(46.4));
  tl.to(pu.uSize, { value: 2.6, duration: 1.6 }, v(46.4));
  tl.to(P, { floor: 0, duration: 1 }, v(46.4));
  tl.to(pu.uSwirl, { value: 0.6, duration: 2.0, ease: 'power2.out' }, v(46.4));
  sfx('whoosh', v(46.3), { dur: 1.4, gain: 0.45, pan: 0 });
  say('Uma estratégia <span class="violet">maior.</span>', { cls: 'h-l', y: 1420, style: 'blur' }, [46.87, 47.12, 47.76], 48.25, 'blur');
  sfx('shimmer', v(47.76), { gain: 0.14, dur: 2.0 });
  sfx('thump', v(47.76), { gain: 0.6 });

  /* ================= 06 · O CUSTO ================= */
  tl.set(S, { opacity: 0 }, v(48.3));
  tl.set(pu.uOpacity, { value: 0.1 }, v(48.3));
  tl.set(pu.uSize, { value: 1 }, v(48.3));
  tl.set(pu.uSwirl, { value: 0 }, v(48.3));
  tl.set(pw, { galaxy: 0, cloud: 1 }, v(48.3));
  tl.set(P, { bgIntensity: 0.35, desat: 0.35 }, v(48.3));
  camSet(v(48.3), { x: 0, y: 0, z: 8.5, tx: 0, ty: -0.6, tz: 0, fov: 58 });
  camTo(v(48.3), 2.6, { z: 7.4 }, 'power1.inOut');
  const lone = s3.lone;
  lone.position.set(0, 0.5, 0);
  tl.set(lone.userData, { opacity: 0, glow: 0.1 }, 0);
  tl.to(lone.userData, { opacity: 0.85, duration: 0.6, ease: 'power2.out' }, v(48.35));
  tl.fromTo(lone.rotation, { y: -0.5, z: 0.08 }, { y: 0.4, z: -0.04, duration: 3, ease: 'none', immediateRender: false }, v(48.35));
  tl.to(lone.userData, { opacity: 0, duration: 0.4 }, v(50.7));
  sfx('thump', v(48.35), { gain: 0.5 });
  say('Ficar sem estrutura', { cls: 'h-s dim', y: 1300 }, [48.35, 48.71, 48.82], 50.85, 'blur');
  say('também é uma <span class="violet">escolha.</span>', { cls: 'h-m', y: 1395 }, [49.29, 49.58, 49.8, 50.14], 50.85, 'blur');
  for (let t = 48.35; t < 52.9; t += 0.5) sfx('tick', v(t), { gain: 0.32, freq: 3000 });

  say('Ela não aparece na planilha…', { cls: 'h-s', y: 480 }, [50.96, 51.35, 51.54, 51.99, 52.14], 52.92, 'up');
  tl.fromTo(hud.v, { sheet: 0 }, { sheet: 1, duration: 1.2, ease: 'power1.out', immediateRender: false }, v(50.96));
  sfx('type', v(50.96), { count: 18, dur: 1.1, gain: 0.1 });
  tl.fromTo(hud.v, { sheetHi: 0 }, { sheetHi: 1, duration: 0.2, ease: 'none', immediateRender: false }, v(52.99));
  sfx('blip', v(52.99), { freq: 220, gain: 0.25, dur: 0.25, type: 'square' });
  say('<span class="signal">até aparecer.</span>', { cls: 'h-l', y: 470, style: 'stamp' }, [52.99, 53.24], 54.2, 'scatter');
  tl.fromTo(hud.v, { sheetBreak: 0 }, { sheetBreak: 1, duration: 0.75, ease: 'expo.in', immediateRender: false }, v(53.45));
  tl.set(hud.v, { sheet: 0, sheetHi: 0, sheetBreak: 0 }, v(54.25));
  sfx('hit', v(53.24), { gain: 0.8, verb: 0.4 });
  sfx('glitch', v(53.24), { dur: 0.5, gain: 0.32, seed: 33 });
  glitch(v(53.24), 1, 0.55);
  flash(v(53.24), 0.35, 0.4);
  shake(v(53.24), 1, 0.6);

  /* ================= 07 · A EVOLUÇÃO ================= */
  tl.set(P, { desat: 0 }, v(54.3));
  tl.set(pw, { cloud: 0, shell: 1 }, v(54.3));
  tl.set(S, { opacity: 0, mods: 1, spin: 0, lift: 0 }, v(54.3));
  tl.set(M, { traffic: 1, site: 1, sys: 1, app: 1, core: 1 }, v(54.3));
  tl.to(S, { opacity: 1, duration: 0.8, ease: 'power2.out' }, v(54.35));
  tl.to(pu.uOpacity, { value: 0.28, duration: 0.8 }, v(54.35));
  tl.set(pu.uSize, { value: 0.75 }, v(54.3));
  tl.to(P, { bgIntensity: 0.7, floor: 0.4, duration: 1 }, v(54.35));
  camSet(v(54.3), { x: 21, y: -1.6, z: 18, tx: 0, ty: 0.4, tz: 0 });
  camTo(v(54.3), 4.6, { x: -6, y: 2, z: 24 }, 'power1.inOut');
  tl.to(S, { spin: 0.9, duration: 6.3, ease: 'none' }, v(54.35));
  sfx('whoosh', v(54.3), { dur: 0.8, gain: 0.35, pan: -0.6 });
  say('Não construímos apenas', { cls: 'h-s dim', y: 1330 }, [54.35, 54.52, 55.06], 56.75);
  say('soluções digitais.', { cls: 'h-m', y: 1425 }, [55.6, 56.13], 56.75);

  say('Construímos <span class="violet">estruturas</span>', { cls: 'h-l', y: 400 }, [56.84, 57.34], 60.55, 'blur');
  say('com potencial para', { cls: 'h-xs', y: 510 }, [58.12, 58.27, 58.7], 60.55, 'blur');
  say('alavancar negócios.', { cls: 'h-l grad', y: 1420, style: 'chars' }, [59.08, 59.88], 60.55, 'blur');
  sfx('thump', v(56.84), { gain: 0.7 });
  // lift on "alavancar"
  tl.to(S, { lift: 3.2, duration: 1.4, ease: 'expo.inOut' }, v(59.0));
  camTo(v(58.9), 1.8, { y: -2.5, z: 21, ty: 3.5 }, 'expo.inOut');
  tl.to(bu.uOpacity, { value: 1, duration: 0.2 }, v(59.08));
  tl.fromTo(bu.uLen, { value: 0 }, { value: 1, duration: 0.8, ease: 'expo.out', immediateRender: false }, v(59.08));
  sfx('whoosh', v(59.0), { dur: 0.9, gain: 0.45, pan: 0.3 });
  sfx('thump', v(59.88), { gain: 0.8 });
  flash(v(59.88), 0.3, 0.4);
  sfx('riser', v(57.8), { dur: v(60.78) - v(57.8), gain: 0.4 });
  music.push({ type: 'roll', start: v(59.4), end: v(60.75) });

  // final collapse into the mark: "Opus."
  tl.to(S, { opacity: 0, duration: 0.2, ease: 'power2.in' }, v(60.55));
  tl.to(bu.uOpacity, { value: 0, duration: 0.2 }, v(60.55));
  tl.to(P, { floor: 0, duration: 0.2 }, v(60.55));
  tl.fromTo(pu.uCollapse, { value: 0 }, { value: 1, duration: 0.22, ease: 'expo.in', immediateRender: false }, v(60.56));
  tl.set(pw, { shell: 0, text: 1 }, v(60.77));
  camSet(v(60.77), { x: 0, y: -1.5, z: 17.5, tx: 0, ty: -1.5, tz: 0 });
  camTo(v(60.78), 5.8, { z: 16.2 }, 'power1.out');
  tl.fromTo(pu.uCollapse, { value: 1 }, { value: 0, duration: 1.1, ease: 'expo.out', immediateRender: false }, v(60.78));
  tl.fromTo(pu.uExplode, { value: 5 }, { value: 0, duration: 1.5, ease: 'expo.out', immediateRender: false }, v(60.78));
  tl.to(pu.uOpacity, { value: 1, duration: 0.1 }, v(60.78));
  flash(v(60.78), 0.9, 0.5);
  shake(v(60.78), 1.5, 1.0);
  tl.fromTo(P, { bloom: 2.8 }, { bloom: 1.25, duration: 1.4, ease: 'power2.out', immediateRender: false }, v(60.78));
  sfx('hit', v(60.78), { gain: 1.35 });

  say('Sua próxima evolução', { cls: 'h-s', y: 1150 }, [61.63, 61.72, 62.19], null);
  say('começa <span class="violet">aqui.</span>', { cls: 'h-l', y: 1265, style: 'chars' }, [63.05, 63.52], null);
  sfx('blip', v(62.19), { freq: 784, gain: 0.12 });
  sfx('shimmer', v(63.05), { gain: 0.16, dur: 3 });
  sfx('thump', v(63.52), { gain: 0.6 });
  decode('Tecnologia · Marketing · Estratégia', { cls: 'mono', y: 1420 }, 64.2, null, 0.8);
  tl.to(hud.v, { wave: 0, duration: 0.6 }, v(64.2));
  tl.to(P, { fade: 1, duration: 1.4, ease: 'power2.in' }, v(65.2));
  tl.to(typeRoot, { opacity: 0, duration: 1.2, ease: 'power2.in' }, v(65.3));
  tl.to(hud.v, { chrome: 0, duration: 1.2 }, v(65.3));
  tl.set(typeRoot, { opacity: 1 }, 0);

  /* ================= MUSIC ================= */
  const GRID = v(21.43); // the drop lands on "Opus"
  const Cm = [65.41, 51.91, 77.78, 58.27];
  music.push(
    { type: 'drone', start: 0.1, end: v(15.3), gain: 0.28, notes: [32.7, 49], fadeIn: 2, fadeOut: 0.2 },
    { type: 'beat', bpm: 120, grid: GRID, start: v(0), end: v(15.1), kick: 'x.......x.......', kickGain: 0.6 },
    { type: 'beat', bpm: 120, grid: GRID, start: v(5.35), end: v(15.1), hat: '..x...x...x...X.' },
    { type: 'beat', bpm: 120, grid: GRID, start: v(9.8), end: v(15.1), bass: [32.7, 32.7, 38.89, 36.71], bassPat: 'x.....x.....x...' },
    { type: 'drone', start: v(15.24), end: v(21.4), gain: 0.22, notes: [38.89, 58.27], fadeIn: 0.3, fadeOut: 0.3, cut: 380 },
    { type: 'beat', bpm: 120, grid: GRID, start: v(21.43), end: v(48.3), kick: 'x...x...x...x...', hat: '..x...x...x...X.', clap: '....x.......x...', bass: Cm, bassPat: 'x.x.x.x.x.x.x.xx' },
    { type: 'beat', bpm: 120, grid: GRID, start: v(27.77), end: v(48.3), hat: '.x.x.x.x.x.x.x.x' },
    { type: 'pad', start: v(21.43), end: v(48.4), notes: [130.81, 155.56, 196, 293.66], gain: 0.06, fadeOut: 0.3 },
    { type: 'drone', start: v(48.35), end: v(54.3), gain: 0.32, notes: [32.7, 38.89], fadeIn: 0.4, fadeOut: 0.3, cut: 220 },
    { type: 'beat', bpm: 120, grid: GRID, start: v(54.35), end: v(60.7), kick: 'x.......x.......', hat: '..x...x...x...x.', bass: [51.91, 58.27, 65.41], bassPat: 'x.x.x.x.x.x.x.x.' },
    { type: 'beat', bpm: 120, grid: GRID, start: v(56.84), end: v(60.7), kick: '....x.......x...', clap: '....x.......x...' },
    { type: 'pad', start: v(54.35), end: v(60.75), notes: [103.83, 130.81, 155.56, 233.08], gain: 0.05, fadeIn: 2, fadeOut: 0.1 },
    { type: 'pad', start: v(60.78), end: DURATION, notes: [130.81, 196, 261.63, 311.13, 392, 587.33], gain: 0.07, fadeIn: 0.05, fadeOut: 3, cut: 2600 },
    { type: 'drone', start: v(60.78), end: DURATION, gain: 0.2, notes: [32.7, 65.41], fadeIn: 0.05, fadeOut: 3 },
  );
  const automation = [{ t: v(40.19), freq: 650 }, { t: v(42.85), freq: 18000, tc: 0.15 }];

  const chapters = [
    { t: 0, n: '00', label: 'OPUS' },
    { t: v(0), n: '01', label: 'O PROBLEMA' },
    { t: v(15.22), n: '02', label: 'NOVA PERSPECTIVA' },
    { t: v(21.43), n: '03', label: 'OPUS' },
    { t: v(27.6), n: '04', label: 'A ESTRUTURA' },
    { t: v(40.19), n: '05', label: 'O DIFERENCIAL' },
    { t: v(48.3), n: '06', label: 'O CUSTO' },
    { t: v(54.3), n: '07', label: 'A EVOLUÇÃO' },
  ];

  tl.set({}, {}, DURATION);
  return { tl, fx: fx.sort((a, b) => a.t - b.t), music, hooks, chapters, automation };
}
