import { Scene3D } from './scene3d.js';
import { HUD } from './overlay.js';
import { buildTimeline, VO_OFFSET, DURATION } from './timeline.js';
import { SoundEngine, encodeWav } from './audio.js';

const params = new URLSearchParams(location.search);
const RENDER = params.has('render');
const ENV_RATE = 50;

const stage = document.getElementById('stage');
const startEl = document.getElementById('start');
const dev = document.getElementById('dev');
const scrub = document.getElementById('scrub');
const devtime = document.getElementById('devtime');
if (RENDER) document.body.classList.add('render');

function fit() {
  const s = RENDER ? 1 : Math.min(innerWidth / 1080, innerHeight / 1920);
  stage.style.transform = `scale(${s})`;
}
addEventListener('resize', fit); fit();

await Promise.all([
  document.fonts.load('800 100px "Inter Tight"'), document.fonts.load('700 100px "Inter Tight"'),
  document.fonts.load('500 100px "Inter Tight"'), document.fonts.load('300 100px "Inter Tight"'),
  document.fonts.load('400 20px "JetBrains Mono"'), document.fonts.load('500 20px "JetBrains Mono"'),
]);

const env = await (await fetch('data/env.json')).json();
const voBytes = await (await fetch('audio/vo.mp3')).arrayBuffer();

const s3 = new Scene3D(document.getElementById('gl'));
const hud = new HUD(document.getElementById('hud'), s3, { env, envRate: ENV_RATE, voOffset: VO_OFFSET, duration: DURATION, chapters: [] });
const T = buildTimeline({ s3, hud, typeRoot: document.getElementById('type'), cover: document.getElementById('cover') });
hud.chapters = T.chapters;

function envAt(t) {
  const i = Math.floor((t - VO_OFFSET) * ENV_RATE);
  return i >= 0 && i < env.length ? env[i] : 0;
}

function frame(t) {
  t = Math.max(0, Math.min(DURATION, t));
  T.tl.time(t, true);
  for (const h of T.hooks) h(t);
  s3.update(t, envAt(t));
  hud.draw(t);
  s3.render();
}

async function decodeVO(ctx) {
  return await ctx.decodeAudioData(voBytes.slice(0));
}

/* ---------------- export mode (driven by tools/render.mjs) ---------------- */
if (RENDER) {
  window.OPUS = {
    duration: DURATION,
    renderAt(t) { frame(t); return true; },
    async renderAudio(stem = 'mix') {
      const sr = 48000;
      const ctx = new OfflineAudioContext(2, Math.ceil(sr * DURATION), sr);
      const engine = new SoundEngine(ctx, { voBuffer: stem === 'bed' ? null : await decodeVO(ctx), voOffset: VO_OFFSET, env, envRate: ENV_RATE });
      engine.automation = T.automation;
      engine.start(0, stem === 'vo' ? [] : T.fx, stem === 'vo' ? [] : T.music);
      const buf = await ctx.startRendering();
      const wav = new Uint8Array(encodeWav(buf));
      let s = ''; const CH = 0x8000;
      for (let i = 0; i < wav.length; i += CH) s += String.fromCharCode.apply(null, wav.subarray(i, i + CH));
      return btoa(s);
    },
  };
  frame(0);
  window.OPUS_READY = true;
} else {
  /* ---------------- live playback ---------------- */
  let ctx = null, engine = null, playing = false, from = 0, devMode = false;
  frame(0);

  async function play(at = 0) {
    if (engine) { try { await ctx.close(); } catch (e) {} }
    ctx = new AudioContext({ latencyHint: 'playback' });
    engine = new SoundEngine(ctx, { voBuffer: await decodeVO(ctx), voOffset: VO_OFFSET, env, envRate: ENV_RATE });
    engine.automation = T.automation;
    from = at;
    engine.start(at, T.fx, T.music);
    playing = true;
  }
  const now = () => (playing && ctx ? from + (ctx.currentTime - engine.t0) - (ctx.outputLatency || 0) : from);

  function loop() {
    const t = now();
    if (playing && t >= DURATION) playing = false;
    frame(t);
    if (devMode) { scrub.value = String(t / DURATION); devtime.textContent = t.toFixed(2); }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  document.getElementById('play').addEventListener('click', () => { startEl.classList.add('hide'); play(0); });
  addEventListener('keydown', e => {
    if (e.key === 'f' || e.key === 'F') { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(); }
    if (e.key === 'r' || e.key === 'R') { startEl.classList.add('hide'); play(0); }
    if (e.key === 'd' || e.key === 'D') { devMode = !devMode; dev.hidden = !devMode; }
    if (e.key === ' ' && devMode) { e.preventDefault(); if (playing) { from = now(); playing = false; ctx.close(); engine = null; } else play(from); }
  });
  scrub.addEventListener('input', () => {
    if (playing) { playing = false; ctx && ctx.close(); engine = null; }
    from = Number(scrub.value) * DURATION;
  });
}
