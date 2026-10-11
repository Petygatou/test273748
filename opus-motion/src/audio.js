// Procedural sound design + VO mix. Works on AudioContext (live) and OfflineAudioContext (export).
// Every event is scheduled at an absolute film time; `from` lets playback start mid-film.

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
}

export class SoundEngine {
  constructor(ctx, { voBuffer, voOffset, env, envRate }) {
    this.ctx = ctx;
    this.voBuffer = voBuffer;
    this.voOffset = voOffset;
    this.env = env;
    this.envRate = envRate;
    const r = rng(7);
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = this.noise.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = r() * 2 - 1;
    }
    this.buildBus();
  }

  buildBus() {
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.92;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 8; comp.ratio.value = 3.5;
    comp.attack.value = 0.004; comp.release.value = 0.18;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -2.5; limiter.knee.value = 0; limiter.ratio.value = 20;
    limiter.attack.value = 0.001; limiter.release.value = 0.08;
    this.master.connect(comp).connect(limiter).connect(ctx.destination);

    // reverb with procedural impulse response
    this.verb = ctx.createConvolver();
    const sr = ctx.sampleRate, n = Math.floor(sr * 3.6);
    const ir = ctx.createBuffer(2, n, sr);
    const r = rng(11);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < n; i++) d[i] = (r() * 2 - 1) * Math.pow(1 - i / n, 3.2);
    }
    this.verb.buffer = ir;
    this.verbOut = ctx.createGain(); this.verbOut.gain.value = 0.55;
    this.verb.connect(this.verbOut).connect(this.master);

    // music bus (ducked under the voice) and sfx bus
    this.music = ctx.createGain(); this.music.gain.value = 0.16;
    this.duck = ctx.createGain();
    this.musicFilter = ctx.createBiquadFilter(); this.musicFilter.type = 'lowpass'; this.musicFilter.frequency.value = 18000;
    this.music.connect(this.musicFilter).connect(this.duck).connect(this.master);
    this.sfx = ctx.createGain(); this.sfx.gain.value = 0.5;
    this.sfx.connect(this.master);

    this.vo = ctx.createGain(); this.vo.gain.value = 1.05;
    const voHp = ctx.createBiquadFilter(); voHp.type = 'highpass'; voHp.frequency.value = 70;
    const voPresence = ctx.createBiquadFilter(); voPresence.type = 'peaking'; voPresence.frequency.value = 3200; voPresence.gain.value = 2.5; voPresence.Q.value = 0.9;
    this.vo.connect(voHp).connect(voPresence).connect(this.master);
    const voSend = ctx.createGain(); voSend.gain.value = 0.06;
    voPresence.connect(voSend).connect(this.verb);
  }

  // map film time -> context time
  at(t) { return this.t0 + (t - this.from); }

  start(from = 0, events, music) {
    const ctx = this.ctx;
    this.from = from;
    this.t0 = ctx.currentTime + 0.06;

    // voice
    if (this.voBuffer) {
      const src = ctx.createBufferSource();
      src.buffer = this.voBuffer;
      src.connect(this.vo);
      const voStart = this.voOffset;
      if (from < voStart) src.start(this.at(voStart));
      else if (from < voStart + this.voBuffer.duration) src.start(this.t0, from - voStart);
      this.voSrc = src;
    }
    this.scheduleDuck(from);

    for (const e of events) {
      if (e.t < from - 0.01) continue;
      const fn = this[e.type];
      if (fn) fn.call(this, this.at(e.t), e.p || {});
    }
    for (const m of music) this.playMusic(m, from);
    this.automate(from);
  }

  scheduleDuck(from) {
    // sidechain-style ducking driven by the precomputed VO envelope
    const env = this.env; if (!env) return;
    const rate = this.envRate;
    const startIdx = Math.max(0, Math.floor((from - this.voOffset) * rate));
    const smooth = new Float32Array(env.length);
    let s = 0;
    for (let i = 0; i < env.length; i++) {
      const target = env[i];
      s += (target - s) * (target > s ? 0.5 : 0.08);
      smooth[i] = s;
    }
    const curve = new Float32Array(Math.max(2, env.length - startIdx));
    for (let i = 0; i < curve.length; i++) curve[i] = 1 - 0.55 * Math.min(1, smooth[i + startIdx] * 1.4 || 0);
    const when = Math.max(this.t0, this.at(this.voOffset + startIdx / rate));
    this.duck.gain.setValueAtTime(1, this.t0);
    this.duck.gain.setValueCurveAtTime(curve, when, curve.length / rate);
  }

  automate(from) {
    // music filter sweeps for sections
    const f = this.musicFilter.frequency;
    const A = this.automation || [];
    f.setValueAtTime(18000, this.t0);
    for (const a of A) {
      if (a.t < from) { continue; }
      f.setTargetAtTime(a.freq, this.at(a.t), a.tc || 0.05);
    }
  }

  noiseSrc(when, dur, offset = 0) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise; s.loop = true;
    s.start(when, offset % 1.5); s.stop(when + dur + 0.05);
    return s;
  }

  adsr(g, when, a, peak, d, end = 0.0001) {
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(peak, when + a);
    g.gain.exponentialRampToValueAtTime(Math.max(end, 0.0001), when + a + d);
  }

  /* ---------- SFX ---------- */

  hit(when, { gain = 1, low = 34, verb = 0.7 } = {}) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(110, when);
    o.frequency.exponentialRampToValueAtTime(low, when + 0.45);
    const g = ctx.createGain(); this.adsr(g, when, 0.004, 1.1 * gain, 1.6);
    o.connect(g).connect(this.sfx); o.start(when); o.stop(when + 2);
    // transient + body
    const n = this.noiseSrc(when, 1.4);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(6000, when); lp.frequency.exponentialRampToValueAtTime(180, when + 1.2);
    const ng = ctx.createGain(); this.adsr(ng, when, 0.002, 0.55 * gain, 1.2);
    n.connect(lp).connect(ng).connect(this.sfx);
    const send = ctx.createGain(); send.gain.value = verb * gain;
    ng.connect(send).connect(this.verb);
    // metallic ring
    const r = ctx.createOscillator(); r.type = 'triangle'; r.frequency.value = 196;
    const rg = ctx.createGain(); this.adsr(rg, when, 0.002, 0.1 * gain, 2.2);
    r.connect(rg).connect(this.verb); r.start(when); r.stop(when + 2.5);
  }

  thump(when, { gain = 0.7 } = {}) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(160, when); o.frequency.exponentialRampToValueAtTime(48, when + 0.18);
    const g = ctx.createGain(); this.adsr(g, when, 0.003, gain, 0.5);
    o.connect(g).connect(this.sfx); o.start(when); o.stop(when + 0.7);
  }

  riser(when, { dur = 3, gain = 0.5 } = {}) {
    const ctx = this.ctx;
    const n = this.noiseSrc(when, dur);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 2.5;
    bp.frequency.setValueAtTime(250, when); bp.frequency.exponentialRampToValueAtTime(9000, when + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain, when + dur * 0.97); g.gain.linearRampToValueAtTime(0.0001, when + dur + 0.02);
    n.connect(bp).connect(g).connect(this.sfx);
    const s = ctx.createGain(); s.gain.value = 0.4; g.connect(s).connect(this.verb);
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(70, when); o.frequency.exponentialRampToValueAtTime(560, when + dur);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(300, when); lp.frequency.exponentialRampToValueAtTime(4000, when + dur);
    const og = ctx.createGain(); og.gain.setValueAtTime(0.0001, when);
    og.gain.exponentialRampToValueAtTime(gain * 0.35, when + dur * 0.97); og.gain.linearRampToValueAtTime(0.0001, when + dur + 0.02);
    o.connect(lp).connect(og).connect(this.sfx); o.start(when); o.stop(when + dur + 0.05);
  }

  whoosh(when, { dur = 0.6, gain = 0.45, pan = 1 } = {}) {
    const ctx = this.ctx;
    const n = this.noiseSrc(when, dur, when * 0.37);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(350, when);
    bp.frequency.exponentialRampToValueAtTime(3200, when + dur * 0.55);
    bp.frequency.exponentialRampToValueAtTime(500, when + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain, when + dur * 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    const p = ctx.createStereoPanner();
    p.pan.setValueAtTime(-pan, when); p.pan.linearRampToValueAtTime(pan, when + dur);
    n.connect(bp).connect(g).connect(p).connect(this.sfx);
    const s = ctx.createGain(); s.gain.value = 0.25; p.connect(s).connect(this.verb);
  }

  blip(when, { freq = 880, gain = 0.22, dur = 0.16, type = 'sine' } = {}) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = freq * 2.005;
    const g = ctx.createGain(); this.adsr(g, when, 0.003, gain, dur);
    const g2 = ctx.createGain(); g2.gain.value = 0.35;
    o.connect(g); o2.connect(g2).connect(g);
    g.connect(this.sfx);
    const s = ctx.createGain(); s.gain.value = 0.35; g.connect(s).connect(this.verb);
    o.start(when); o2.start(when); o.stop(when + dur + 0.1); o2.stop(when + dur + 0.1);
  }

  tick(when, { gain = 0.25, freq = 5000 } = {}) {
    const ctx = this.ctx;
    const n = this.noiseSrc(when, 0.03, when * 0.91);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = freq;
    const g = ctx.createGain(); this.adsr(g, when, 0.0008, gain, 0.025);
    n.connect(hp).connect(g).connect(this.sfx);
  }

  glitch(when, { dur = 0.4, gain = 0.3, seed = 3 } = {}) {
    const ctx = this.ctx; const r = rng(seed);
    const crush = ctx.createWaveShaper();
    const c = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const x = i / 128 - 1; c[i] = Math.round(x * 4) / 4; }
    crush.curve = c;
    const out = ctx.createGain(); out.gain.value = gain;
    crush.connect(out).connect(this.sfx);
    let t = when;
    while (t < when + dur) {
      const len = 0.015 + r() * 0.05;
      const o = ctx.createOscillator(); o.type = r() > 0.5 ? 'square' : 'sawtooth';
      o.frequency.value = 80 + r() * 1800;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.8, t); g.gain.setValueAtTime(0, t + len);
      o.connect(g).connect(crush); o.start(t); o.stop(t + len + 0.01);
      if (r() > 0.5) {
        const n = this.noiseSrc(t, len, r());
        const ng = ctx.createGain(); ng.gain.setValueAtTime(0.5, t); ng.gain.setValueAtTime(0, t + len);
        n.connect(ng).connect(crush);
      }
      t += len + r() * 0.03;
    }
  }

  suck(when, { dur = 0.9, gain = 0.6 } = {}) {
    const ctx = this.ctx;
    const n = this.noiseSrc(when, dur);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(400, when); lp.frequency.exponentialRampToValueAtTime(7000, when + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain, when + dur); g.gain.linearRampToValueAtTime(0.0001, when + dur + 0.015);
    n.connect(lp).connect(g).connect(this.sfx);
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(40, when); o.frequency.exponentialRampToValueAtTime(220, when + dur);
    const og = ctx.createGain(); og.gain.setValueAtTime(0.0001, when);
    og.gain.exponentialRampToValueAtTime(gain * 0.6, when + dur); og.gain.linearRampToValueAtTime(0.0001, when + dur + 0.015);
    o.connect(og).connect(this.sfx); o.start(when); o.stop(when + dur + 0.05);
  }

  shimmer(when, { gain = 0.18, dur = 2.5, base = 1046.5 } = {}) {
    const ctx = this.ctx;
    [1, 1.5, 2, 2.996, 4].forEach((m, i) => {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = base * m;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, when + i * 0.04);
      g.gain.exponentialRampToValueAtTime(gain / (i + 1), when + i * 0.04 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      o.connect(g); g.connect(this.verb); const d = ctx.createGain(); d.gain.value = 0.3; g.connect(d).connect(this.sfx);
      o.start(when); o.stop(when + dur + 0.1);
    });
  }

  clatter(when, { dur = 1.2, count = 18, gain = 0.4, seed = 5 } = {}) {
    const r = rng(seed);
    for (let i = 0; i < count; i++) {
      const t = when + Math.pow(r(), 0.8) * dur;
      if (r() > 0.4) this.tick(t, { gain: gain * (0.4 + r() * 0.6), freq: 1500 + r() * 4000 });
      else this.thump(t, { gain: gain * 0.6 });
    }
  }

  snap(when, { freq = 660, gain = 0.25 } = {}) {
    this.tick(when, { gain: gain * 1.2, freq: 2500 });
    this.blip(when, { freq, gain: gain * 0.7, dur: 0.09, type: 'triangle' });
  }

  type(when, { count = 10, dur = 0.5, gain = 0.12, seed = 9 } = {}) {
    const r = rng(seed);
    for (let i = 0; i < count; i++) this.tick(when + (i / count) * dur + r() * 0.01, { gain, freq: 3000 + r() * 3000 });
  }

  /* ---------- Music ---------- */

  playMusic(m, from) {
    if (m.end <= from) return;
    const fn = this['m_' + m.type];
    if (fn) fn.call(this, m, from);
  }

  // continuous drone with slow movement
  m_drone(m, from) {
    const ctx = this.ctx;
    const s = Math.max(m.start, from), w0 = this.at(s), w1 = this.at(m.end);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, w0); g.gain.exponentialRampToValueAtTime(m.gain || 0.3, w0 + (m.fadeIn || 1.5));
    g.gain.setValueAtTime(m.gain || 0.3, w1 - (m.fadeOut || 1)); g.gain.exponentialRampToValueAtTime(0.0001, w1);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = m.cut || 260; lp.Q.value = 4;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.13; const lg = ctx.createGain(); lg.gain.value = 90;
    lfo.connect(lg).connect(lp.frequency); lfo.start(w0); lfo.stop(w1);
    (m.notes || [32.7, 49]).forEach((f, i) => {
      [-7, 6].forEach(cents => {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = cents + i * 2;
        o.connect(lp); o.start(w0); o.stop(w1 + 0.1);
      });
    });
    lp.connect(g).connect(this.music);
  }

  m_pad(m, from) {
    const ctx = this.ctx;
    const s = Math.max(m.start, from), w0 = this.at(s), w1 = this.at(m.end);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, w0); g.gain.exponentialRampToValueAtTime(m.gain || 0.12, w0 + (m.fadeIn || 0.8));
    g.gain.setValueAtTime(m.gain || 0.12, Math.max(w0 + 0.9, w1 - (m.fadeOut || 2))); g.gain.exponentialRampToValueAtTime(0.0001, w1);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = m.cut || 1800;
    m.notes.forEach((f, i) => {
      [-9, 0, 9].forEach(c => {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = c + i;
        o.connect(lp); o.start(w0); o.stop(w1 + 0.1);
      });
    });
    lp.connect(g); g.connect(this.music);
    const sg = ctx.createGain(); sg.gain.value = 0.8; g.connect(sg).connect(this.verb);
  }

  // drum machine on a grid: patterns are 16-step strings per bar
  m_beat(m, from) {
    const step = 60 / m.bpm / 4;
    const first = Math.ceil((Math.max(m.start, from) - m.grid) / step - 1e-6);
    const last = Math.floor((m.end - m.grid) / step - 1e-6);
    const roots = m.bass || null;
    for (let i = first; i <= last; i++) {
      const t = m.grid + i * step;
      if (t < m.start - 1e-4 || t < from) continue;
      const k = ((i % 16) + 16) % 16;
      const w = this.at(t);
      if (m.kick && m.kick[k] === 'x') this.kick(w, m.kickGain || 0.9);
      if (m.hat && m.hat[k] !== '.') this.hat(w, m.hat[k] === 'X' ? 0.22 : 0.12);
      if (m.clap && m.clap[k] === 'x') this.clap(w, 0.32);
      if (roots && m.bassPat && m.bassPat[k] === 'x') {
        const bar = Math.floor(i / 16);
        const f = roots[((bar % roots.length) + roots.length) % roots.length];
        this.bass(w, f, step * 1.6);
      }
    }
  }

  // accelerating snare roll into a cue
  m_roll(m, from) {
    let t = m.start, n = 0;
    while (t < m.end) {
      const p = (t - m.start) / (m.end - m.start);
      if (t >= from) this.clap(this.at(t), 0.08 + p * 0.25, 0.06);
      t += 0.25 * Math.pow(1 - p, 1.4) + 0.045; n++;
    }
  }

  kick(when, gain = 0.9) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(150, when); o.frequency.exponentialRampToValueAtTime(44, when + 0.11);
    const g = ctx.createGain(); this.adsr(g, when, 0.002, gain, 0.38);
    o.connect(g).connect(this.music); o.start(when); o.stop(when + 0.45);
    const n = this.noiseSrc(when, 0.01, when);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3000;
    const ng = ctx.createGain(); this.adsr(ng, when, 0.0005, gain * 0.25, 0.01);
    n.connect(hp).connect(ng).connect(this.music);
  }

  hat(when, gain = 0.12) {
    const ctx = this.ctx;
    const n = this.noiseSrc(when, 0.06, when * 1.3);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 8000;
    const g = ctx.createGain(); this.adsr(g, when, 0.001, gain, 0.045);
    n.connect(hp).connect(g).connect(this.music);
  }

  clap(when, gain = 0.3, decay = 0.18) {
    const ctx = this.ctx;
    const n = this.noiseSrc(when, decay + 0.05, when * 0.7);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1600; bp.Q.value = 0.9;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    [0, 0.011, 0.022].forEach(o => { g.gain.setValueAtTime(gain, when + o); g.gain.exponentialRampToValueAtTime(gain * 0.2, when + o + 0.009); });
    g.gain.setValueAtTime(gain * 0.8, when + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, when + 0.03 + decay);
    n.connect(bp).connect(g).connect(this.music);
    const s = ctx.createGain(); s.gain.value = 0.35; g.connect(s).connect(this.verb);
  }

  bass(when, f, len) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
    const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = f / 2;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 6;
    lp.frequency.setValueAtTime(900, when); lp.frequency.exponentialRampToValueAtTime(140, when + len);
    const g = ctx.createGain(); this.adsr(g, when, 0.004, 0.26, len);
    const g2 = ctx.createGain(); g2.gain.value = 0.5;
    o.connect(lp); o2.connect(g2).connect(lp); lp.connect(g).connect(this.music);
    o.start(when); o2.start(when); o.stop(when + len + 0.05); o2.stop(when + len + 0.05);
  }
}

// Encode an AudioBuffer as 16-bit PCM WAV (used by the exporter)
export function encodeWav(buf) {
  const ch = buf.numberOfChannels, sr = buf.sampleRate, n = buf.length;
  const data = new DataView(new ArrayBuffer(44 + n * ch * 2));
  const w = (o, s) => { for (let i = 0; i < s.length; i++) data.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); data.setUint32(4, 36 + n * ch * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, ch, true);
  data.setUint32(24, sr, true); data.setUint32(28, sr * ch * 2, true); data.setUint16(32, ch * 2, true);
  data.setUint16(34, 16, true); w(36, 'data'); data.setUint32(40, n * ch * 2, true);
  const chans = []; for (let c = 0; c < ch; c++) chans.push(buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) {
    const v = Math.max(-1, Math.min(1, chans[c][i]));
    data.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true); o += 2;
  }
  return data.buffer;
}
