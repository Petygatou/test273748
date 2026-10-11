// 2D layer: HUD canvas (lines that attach to 3D objects, data graphics) + kinetic DOM typography.

const MONO = '"JetBrains Mono", monospace';
const W = 1080, H = 1920;
// Reels safe area: keep chrome clear of the top bar and the caption/actions zone
const TOP = 190, BOTTOM = H - 330;
const LILAC = '185,162,255', ELEC = '124,58,255', WHITE = '244,240,255', SIGNAL = '232,255,90';

function hash(n) { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); }
const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%/<>*+=';

export function scramble(text, p, seed = 1, t = 0) {
  // deterministic decode: characters lock in left-to-right as p goes 0 -> 1
  let out = '';
  const n = text.length;
  for (let i = 0; i < n; i++) {
    const ch = text[i];
    if (ch === ' ') { out += ' '; continue; }
    const lock = (i / n) * 0.75 + 0.25;
    if (p >= lock) out += ch;
    else if (p > (i / n) * 0.75 - 0.1) out += GLYPHS[Math.floor(hash(i * 13 + seed + Math.floor(t * 24)) * GLYPHS.length)];
    else out += '';
  }
  return out;
}

export class HUD {
  constructor(canvas, scene3d, data) {
    this.cv = canvas; this.g = canvas.getContext('2d');
    this.s3 = scene3d;
    this.env = data.env; this.envRate = data.envRate; this.voOffset = data.voOffset;
    this.duration = data.duration;
    this.chapters = data.chapters;
    this.anchors = [];
    // values tweened by the timeline
    this.v = {
      chrome: 0, wave: 0, guides: 0,
      load: 0, loadP: 0,
      sheet: 0, sheetHi: 0, sheetBreak: 0,
      broken: 0, cross: 0,
      blueprint: 0,
    };
  }

  addAnchor(a) { a.alpha = 0; a.draw = 0; this.anchors.push(a); return a; }

  draw(t) {
    const g = this.g, v = this.v;
    g.clearRect(0, 0, W, H);
    if (v.chrome > 0) this.drawChrome(t);
    if (v.guides > 0) this.drawGuides(t);
    if (v.broken > 0) this.drawBroken(t);
    if (v.load > 0) this.drawLoad(t);
    if (v.sheet > 0) this.drawSheet(t);
    for (const a of this.anchors) if (a.alpha > 0.001) this.drawAnchor(a, t);
  }

  drawChrome(t) {
    const g = this.g, a = this.v.chrome;
    g.save(); g.globalAlpha = a;
    g.font = `500 14px ${MONO}`; g.textBaseline = 'middle';
    g.fillStyle = `rgba(${WHITE},.9)`; g.fillText('OPUS', 80, TOP);
    g.fillStyle = `rgba(${LILAC},.6)`; g.fillText('/  ESTRUTURA', 138, TOP);
    // chapter
    let ch = this.chapters[0];
    for (const c of this.chapters) if (t >= c.t) ch = c;
    g.textAlign = 'right';
    g.fillStyle = `rgba(${LILAC},.75)`; g.fillText(`${ch.n}  —  ${ch.label}`, W - 80, TOP);
    // timecode
    const tc = Math.max(0, t);
    const s = Math.floor(tc), f = Math.floor((tc - s) * 30);
    g.fillStyle = `rgba(${LILAC},.55)`;
    g.fillText(`${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}:${String(f).padStart(2, '0')}`, W - 80, BOTTOM);
    g.textAlign = 'left';
    // progress hairline
    g.fillStyle = `rgba(${LILAC},.18)`; g.fillRect(80, BOTTOM + 30, W - 160, 1);
    g.fillStyle = `rgba(${ELEC},.9)`; g.fillRect(80, BOTTOM + 30, (W - 160) * Math.min(1, tc / this.duration), 1);
    // voice waveform (live from the VO envelope)
    if (this.v.wave > 0) {
      g.globalAlpha = a * this.v.wave;
      const bars = 48;
      for (let i = 0; i < bars; i++) {
        const tt = t - (bars - i) * 0.03 - this.voOffset;
        const idx = Math.floor(tt * this.envRate);
        const e = idx >= 0 && idx < this.env.length ? this.env[idx] : 0;
        const h = 2 + e * 26;
        g.fillStyle = i > bars - 4 ? `rgba(${WHITE},.95)` : `rgba(${LILAC},${0.25 + i / bars * 0.5})`;
        g.fillRect(80 + i * 5, BOTTOM - h / 2, 2, h);
      }
      g.font = `400 12px ${MONO}`; g.fillStyle = `rgba(${LILAC},.5)`;
      g.fillText('VOZ  ·  PT-BR', 340, BOTTOM);
    }
    g.restore();
  }

  drawGuides(t) {
    const g = this.g, a = this.v.guides;
    g.save(); g.globalAlpha = a * 0.5;
    g.strokeStyle = `rgba(${LILAC},.35)`; g.lineWidth = 1;
    g.beginPath(); g.moveTo(W / 2 - 14, H / 2); g.lineTo(W / 2 + 14, H / 2); g.moveTo(W / 2, H / 2 - 14); g.lineTo(W / 2, H / 2 + 14); g.stroke();
    g.setLineDash([2, 10]);
    g.beginPath(); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.moveTo(W / 2, 0); g.lineTo(W / 2, H); g.stroke();
    g.restore();
  }

  // red-free "×" markers where the connection attempts fail
  drawBroken(t) {
    const g = this.g, s3 = this.s3, a = this.v.broken;
    const pts = [s3.brokenA, s3.brokenB].map(b => {
      const c = b.userData.curve; const u = Math.max(0.02, Math.min(1, b.material.uniforms.uDraw.value));
      return s3.project(c.getPoint(u));
    });
    g.save(); g.globalAlpha = a;
    pts.forEach((p, i) => {
      const s = 12 + Math.sin(t * 20 + i) * 1.5;
      g.strokeStyle = `rgba(${WHITE},.95)`; g.lineWidth = 2;
      g.beginPath(); g.moveTo(p.x - s, p.y - s); g.lineTo(p.x + s, p.y + s); g.moveTo(p.x + s, p.y - s); g.lineTo(p.x - s, p.y + s); g.stroke();
      g.font = `500 13px ${MONO}`; g.fillStyle = `rgba(${LILAC},.9)`; g.textBaseline = 'middle';
      g.fillText(i ? 'SEM INTEGRAÇÃO' : 'SEM CONEXÃO', p.x + 22, p.y);
    });
    g.restore();
  }

  drawLoad(t) {
    const g = this.g, a = this.v.load, p = this.v.loadP;
    const x = 200, y = 1060, w = 600;
    g.save(); g.globalAlpha = a;
    g.strokeStyle = `rgba(${LILAC},.8)`; g.lineWidth = 1.5; g.strokeRect(x, y, w, 12);
    g.fillStyle = `rgba(${ELEC},.12)`; g.fillRect(x, y, w, 12);
    g.fillStyle = `rgba(${ELEC},1)`; g.shadowColor = `rgba(${ELEC},1)`; g.shadowBlur = 20;
    g.fillRect(x + 3, y + 3, (w - 6) * p, 6); g.shadowBlur = 0;
    g.font = `500 18px ${MONO}`; g.fillStyle = `rgba(${WHITE},.95)`; g.textBaseline = 'top';
    g.fillText(`${Math.round(p * 100)}%`, x, y + 24);
    const dots = '.'.repeat(1 + Math.floor(t * 3) % 3);
    g.textAlign = 'right'; g.fillText(`AGUARDANDO${dots}`.padEnd(13, ' '), x + w, y + 24);
    // spinner
    g.translate(x + w + 40, y + 5); g.rotate(t * 5);
    g.strokeStyle = `rgba(${WHITE},.9)`; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, 9, 0, Math.PI * 1.4); g.stroke();
    g.restore();
  }

  drawSheet(t) {
    const g = this.g, v = this.v, a = v.sheet;
    const cols = 4, rows = 9, cw = 225, rh = 58, x0 = W / 2 - cols * cw / 2, y0 = 640;
    const brk = v.sheetBreak;
    g.save(); g.globalAlpha = Math.min(1, a);
    g.font = `400 18px ${MONO}`; g.textBaseline = 'middle';
    const heads = ['MÊS', 'RECEITA', 'LEADS', 'STATUS'];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const k = r * cols + c;
      const appear = Math.min(1, Math.max(0, a * 2.2 - (r + c) / (rows + cols) * 1.2));
      if (appear <= 0) continue;
      let x = x0 + c * cw, y = y0 + r * rh;
      if (brk > 0) {
        const dx = (hash(k) - 0.5) * 1100, dy = (hash(k + 99) - 0.3) * 1500;
        x += dx * brk * brk; y += dy * brk * brk;
      }
      g.globalAlpha = appear * (1 - brk);
      const hi = r === 6 && v.sheetHi > 0;
      g.strokeStyle = hi ? `rgba(${SIGNAL},${0.5 + v.sheetHi * 0.5})` : `rgba(${LILAC},.22)`;
      g.lineWidth = 1; g.strokeRect(x, y, cw, rh);
      if (hi) { g.fillStyle = `rgba(${SIGNAL},${0.12 * v.sheetHi})`; g.fillRect(x, y, cw, rh); }
      let txt;
      if (r === 0) txt = heads[c];
      else if (c === 0) txt = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO'][r - 1];
      else if (c === 3) txt = r === 6 && v.sheetHi > 0.5 ? 'PERDIDA' : 'OK';
      else if (c === 1) txt = 'R$ ' + (hash(k * 7) * 80 + 40).toFixed(0) + 'k';
      else txt = (hash(k * 7) * 900 + 300).toFixed(0);
      if (r === 6 && c > 0 && c < 3 && v.sheetHi > 0.5) txt = '—';
      g.fillStyle = r === 0 ? `rgba(${LILAC},.95)` : hi ? `rgba(${SIGNAL},1)` : `rgba(${WHITE},.75)`;
      g.font = (r === 0 ? '500 17px ' : (c === 3 && hi ? '500 18px ' : '400 21px ')) + MONO;
      g.fillText(txt, x + 16, y + rh / 2);
    }
    g.restore();
  }

  drawAnchor(a, t) {
    const g = this.g, s3 = this.s3;
    const wp = a.world();
    const p = s3.project(wp);
    if (p.behind) return;
    const dx = a.dx ?? 140, dy = a.dy ?? -110;
    let ex = p.x + dx, ey = p.y + dy;
    const d = Math.min(1, a.draw);
    g.save(); g.globalAlpha = a.alpha;
    g.strokeStyle = `rgba(${LILAC},.8)`; g.lineWidth = 1;
    // dot at the object
    g.fillStyle = `rgba(${WHITE},1)`; g.beginPath(); g.arc(p.x, p.y, 3.5, 0, 7); g.fill();
    g.strokeStyle = `rgba(${ELEC},.9)`; g.beginPath(); g.arc(p.x, p.y, 9 + Math.sin(t * 4) * 1.5, 0, 7); g.stroke();
    // elbow leader
    const mx = p.x + dx * 0.35, my = ey;
    g.strokeStyle = `rgba(${LILAC},.8)`;
    g.beginPath(); g.moveTo(p.x, p.y);
    const seg1 = Math.min(1, d * 2), seg2 = Math.max(0, d * 2 - 1);
    g.lineTo(p.x + (mx - p.x) * seg1, p.y + (my - p.y) * seg1);
    if (seg2 > 0) g.lineTo(mx + (ex - mx) * seg2, my);
    g.stroke();
    if (d >= 1) {
      const right = dx >= 0;
      g.font = `600 26px "Inter Tight"`;
      const tw = Math.max(g.measureText(a.sub || '').width, a.label.length * 9) + 10;
      ex = right ? Math.min(ex, W - 50 - tw) : Math.max(ex, 50 + tw);
      g.beginPath(); g.moveTo(mx + (p.x + dx - mx), my); g.lineTo(ex, ey); g.stroke();
      g.textAlign = right ? 'left' : 'right';
      g.textBaseline = 'bottom';
      g.font = `500 14px ${MONO}`; g.fillStyle = `rgba(${LILAC},.9)`;
      const tp = Math.min(1, a.textP ?? 1);
      g.fillText(scramble(a.label, tp, a.label.length, t), ex + (right ? 6 : -6), ey - 8);
      if (a.sub) {
        g.textBaseline = 'top'; g.font = `600 26px "Inter Tight"`; g.fillStyle = `rgba(${WHITE},1)`;
        g.fillText(scramble(a.sub, tp, 3, t), ex + (right ? 6 : -6), ey + 8);
      }
    }
    g.restore();
  }
}

/* ---------------- kinetic typography ---------------- */
// Builds an absolutely positioned text element split into words and chars.
export function makeText(root, html, { cls = 'h-m', x = 540, y = 960, align = 'center', id } = {}) {
  const el = document.createElement('div');
  el.className = 't ' + cls;
  if (id) el.id = id;
  // tokens: allow <em class=..>word</em> segments
  const tmp = document.createElement('div'); tmp.innerHTML = html;
  const words = [];
  const walk = (node, extra) => {
    node.childNodes.forEach(n => {
      if (n.nodeType === 3) {
        n.textContent.split(/(\s+)/).forEach(tok => {
          if (!tok) return;
          if (/^\s+$/.test(tok)) { el.appendChild(Object.assign(document.createElement('span'), { className: 'sp' })); return; }
          const w = document.createElement('span'); w.className = 'w';
          const wi = document.createElement('span'); wi.className = 'wi' + (extra ? ' ' + extra : '');
          [...tok].forEach(ch => { const c = document.createElement('span'); c.className = 'c'; c.textContent = ch; wi.appendChild(c); });
          w.appendChild(wi); el.appendChild(w); words.push(wi);
        });
      } else if (n.nodeType === 1) {
        if (n.tagName === 'BR') { el.appendChild(document.createElement('br')); return; }
        walk(n, n.className || '');
      }
    });
  };
  walk(tmp, '');
  root.appendChild(el);
  // auto-fit: never wider than the vertical safe width
  const maxW = arguments[2]?.maxW ?? 930;
  const w0 = el.offsetWidth;
  if (w0 > maxW) el.style.fontSize = (parseFloat(getComputedStyle(el).fontSize) * maxW / w0) + 'px';
  el.style.left = x + 'px'; el.style.top = y + 'px';
  gsap.set(el, { xPercent: align === 'center' ? -50 : align === 'right' ? -100 : 0, yPercent: -50 });
  return { el, words, chars: [...el.querySelectorAll('.c')] };
}
