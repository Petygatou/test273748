// Offline renderer: drives index.html?render=1 frame by frame in headless Chromium,
// renders the full sound mix with OfflineAudioContext and muxes everything with ffmpeg.
//   node tools/render.mjs                      -> renders out/opus.mp4 (1080x1920, 9:16 Reels)
//   node tools/render.mjs --fps 60 --out x.mp4
//   node tools/render.mjs --stills 3.2,10,22   -> PNG stills into out/
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const fps = Number(arg('fps', 30));
const outDir = path.join(root, 'out'); fs.mkdirSync(outDir, { recursive: true });
const out = path.resolve(arg('out', path.join(outDir, 'opus.mp4')));
const stills = arg('stills', null);
const from = Number(arg('from', 0));
const to = arg('to', null);

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
}).listen(0);
const port = server.address().port;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('[page]', m.text()); });
page.on('pageerror', e => console.log('[pageerror]', e.message));
await page.goto(`http://localhost:${port}/index.html?render=1`);
await page.waitForFunction(() => window.OPUS_READY === true, null, { timeout: 120000 });
const duration = await page.evaluate(() => window.OPUS.duration);
const clip = { x: 0, y: 0, width: 1080, height: 1920 };

if (stills) {
  for (const s of stills.split(',').map(Number)) {
    await page.evaluate(t => window.OPUS.renderAt(t), s);
    await page.screenshot({ path: path.join(outDir, `still_${s.toFixed(2)}.png`), clip });
    console.log('still', s);
  }
  await browser.close(); server.close(); process.exit(0);
}

console.log('rendering audio…');
const stem = arg('stem', 'mix');
const wavB64 = await page.evaluate(s => window.OPUS.renderAudio(s), stem);
const wavPath = path.join(outDir, stem === 'mix' ? 'mix.wav' : `stem_${stem}.wav`);
fs.writeFileSync(wavPath, Buffer.from(wavB64, 'base64'));
if (process.argv.includes('--audio-only')) { await browser.close(); server.close(); console.log('audio ->', wavPath); process.exit(0); }

const end = to ? Number(to) : duration;
const n = Math.round((end - from) * fps);
const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-',
  '-ss', String(from), '-i', wavPath, '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '256k', '-shortest', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
const t0 = Date.now();
for (let i = 0; i < n; i++) {
  const t = from + i / fps;
  // render twice for the first frame so that every lazy shader is compiled
  await page.evaluate(t => window.OPUS.renderAt(t), t);
  const buf = await page.screenshot({ type: 'jpeg', quality: 95, clip });
  if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
  if (i % 30 === 0) {
    const el = (Date.now() - t0) / 1000;
    console.log(`frame ${i}/${n}  t=${t.toFixed(2)}s  ${(el / (i + 1)).toFixed(2)}s/frame  eta ${Math.round(el / (i + 1) * (n - i))}s`);
  }
}
ff.stdin.end();
await new Promise(r => ff.on('close', r));
await browser.close(); server.close();
console.log('done ->', out);
