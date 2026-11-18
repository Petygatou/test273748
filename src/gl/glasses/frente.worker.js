// Campo de distância da frente da armação, um por modelo, fora da thread principal.
// Desenha a frente inteira num canvas (aros, ponte, orelhas), arredonda os cantos de dentro (fechamento
// morfológico), recorta as lentes e devolve a metade direita como RGBA half-float:
// R = distância à borda do acetato (mm, negativa dentro), G/B = gradiente, A = distância à borda da lente
// (negativa dentro do furo). O shader da armação extruda esse campo com as bordas arredondadas.
import { MODELOS, raioLente, larguraAro, centroLente, RET } from './modelos.js';

const MM = 0.1; // mm por texel
const W = Math.round((RET.x1 * 2) / MM) + 1;
const H = Math.round((RET.y1 - RET.y0) / MM) + 1;
const X0 = -RET.x1, Y1 = RET.y1;
const INF = 1e20;

const ctx = new OffscreenCanvas(W, H).getContext('2d', { willReadFrequently: true });
const px = x => (x - X0) / MM;
const py = y => (Y1 - y) / MM;

function contorno(m, lado, raio) {
  const cx = centroLente(m) * lado;
  ctx.beginPath();
  for (let i = 0; i <= 720; i++) {
    const t = (i / 720) * Math.PI * 2;
    const r = raio(t);
    const x = cx + lado * Math.cos(t) * r, y = Math.sin(t) * r;
    i ? ctx.lineTo(px(x), py(y)) : ctx.moveTo(px(x), py(y));
  }
  ctx.closePath();
  ctx.fill();
}

function retArred(x0, y0, x1, y1, r) {
  ctx.beginPath();
  ctx.roundRect(px(x0), py(y1), (x1 - x0) / MM, (y1 - y0) / MM, r / MM);
  ctx.fill();
}

function silhueta(m) {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#fff';
  for (const lado of [1, -1]) {
    contorno(m, lado, t => raioLente(m, t) + larguraAro(m, t));
    const cx = centroLente(m);
    const borda = cx + raioLente(m, 0) + larguraAro(m, 0);
    const o = m.orelha;
    const xa = lado > 0 ? borda - 4 : -(borda + o.fora);
    retArred(xa, o.y - o.alto / 2, xa + 4 + o.fora, o.y + o.alto / 2, 2.2);
  }
  // ponte: topo quase reto, base em arco (mais alta no meio)
  const p = m.ponte, cx = centroLente(m);
  const xb = cx - raioLente(m, Math.PI) + 3.5;
  ctx.beginPath();
  ctx.moveTo(px(-xb), py(p.topo));
  for (let i = 0; i <= 40; i++) { const x = -xb + (2 * xb * i) / 40; ctx.lineTo(px(x), py(p.topo + 0.35 * (1 - (x / xb) ** 2))); }
  for (let i = 40; i >= 0; i--) { const x = -xb + (2 * xb * i) / 40; ctx.lineTo(px(x), py(p.base + p.arco * (1 - (x / xb) ** 2))); }
  ctx.closePath();
  ctx.fill();
  return cobertura();
}

function furos(m) {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#fff';
  for (const lado of [1, -1]) contorno(m, lado, t => raioLente(m, t));
  return cobertura();
}

function cobertura() {
  const d = ctx.getImageData(0, 0, W, H).data;
  const a = new Float32Array(W * H);
  for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3] / 255;
  return a;
}

// transformada de distância euclidiana exata (Felzenszwalb e Huttenlocher), com a borda suavizada pela cobertura
const f = new Float64Array(Math.max(W, H)), v = new Uint32Array(Math.max(W, H)), z = new Float64Array(Math.max(W, H) + 1);
function edt1d(g, off, stride, n) {
  for (let q = 0; q < n; q++) f[q] = g[off + q * stride];
  v[0] = 0; z[0] = -INF; z[1] = INF;
  for (let q = 1, k = 0; q < n; q++) {
    let s;
    do { const r = v[k]; s = (f[q] - f[r] + q * q - r * r) / (q - r) / 2; } while (s <= z[k] && --k > -1);
    k++; v[k] = q; z[k] = s; z[k + 1] = INF;
  }
  for (let q = 0, k = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const r = v[k];
    g[off + q * stride] = f[r] + (q - r) * (q - r);
  }
}
function edt(g) {
  for (let x = 0; x < W; x++) edt1d(g, x, W, H);
  for (let y = 0; y < H; y++) edt1d(g, y * W, 1, W);
}
/** distância com sinal, em mm (positiva fora) */
function distancia(cob) {
  const fora = new Float64Array(W * H), dentro = new Float64Array(W * H);
  for (let i = 0; i < cob.length; i++) {
    const a = cob[i];
    fora[i] = a === 1 ? 0 : a === 0 ? INF : Math.max(0, 0.5 - a) ** 2;
    dentro[i] = a === 1 ? INF : a === 0 ? 0 : Math.max(0, a - 0.5) ** 2;
  }
  edt(fora); edt(dentro);
  const d = new Float32Array(W * H);
  for (let i = 0; i < d.length; i++) d[i] = (Math.sqrt(fora[i]) - Math.sqrt(dentro[i])) * MM;
  return d;
}

// gaussiana separável (sigma de 4 texels): a transformada semeada pela cobertura do raster erra a borda
// num padrão que se repete conforme a inclinação da borda; no reflexo isso vira serrilha. Suavizar o
// campo tira essa ondulação sem mexer na forma (o deslocamento numa curva de raio R é ~ sigma²/2R).
const SIGMA = 4, RAIO = 12;
const KER = (() => { const k = []; let s = 0; for (let i = -RAIO; i <= RAIO; i++) { const v = Math.exp(-(i * i) / (2 * SIGMA * SIGMA)); k.push(v); s += v; } return k.map(v => v / s); })();
function suaviza(d) {
  const t = new Float32Array(W * H), o = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const row = y * W;
    for (let x = 0; x < W; x++) {
      let s = 0;
      for (let j = -RAIO; j <= RAIO; j++) s += KER[j + RAIO] * d[row + Math.min(W - 1, Math.max(0, x + j))];
      t[row + x] = s;
    }
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let s = 0;
      for (let j = -RAIO; j <= RAIO; j++) s += KER[j + RAIO] * t[Math.min(H - 1, Math.max(0, y + j)) * W + x];
      o[y * W + x] = s;
    }
  }
  return o;
}

// float32 -> half float
const fv = new Float32Array(1), iv = new Uint32Array(fv.buffer);
function half(val) {
  fv[0] = val; const x = iv[0];
  const s = (x >>> 16) & 0x8000; let e = ((x >>> 23) & 0xff) - 112; let m = x & 0x7fffff;
  if (e <= 0) { if (e < -10) return s; m |= 0x800000; return s | ((m >> (1 - e)) + 0x1000) >> 13; }
  if (e >= 31) return s | 0x7bff;
  return s | (e << 10) | ((m + 0x1000) >> 13);
}

function campo(m) {
  const FILETE = 2.6;
  const d1 = distancia(silhueta(m));
  const cob = new Float32Array(W * H);
  for (let i = 0; i < cob.length; i++) cob[i] = Math.min(1, Math.max(0, 0.5 - (d1[i] - FILETE) / MM));
  const d2 = distancia(cob);
  const dh = distancia(furos(m));
  let d = new Float32Array(W * H);
  for (let i = 0; i < d.length; i++) d[i] = Math.max(d2[i] + FILETE, -dh[i]);
  d = suaviza(d);

  // metade direita: colunas do centro (x = 0) à borda
  const c0 = Math.round(-X0 / MM), HW = W - c0;
  const out = new Uint16Array(HW * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < HW; x++) {
      const i = y * W + c0 + x;
      const xl = c0 + x > 0 ? i - 1 : i, xr = c0 + x < W - 1 ? i + 1 : i;
      const yu = y > 0 ? i - W : i, yd = y < H - 1 ? i + W : i;
      let gx = d[xr] - d[xl], gy = d[yu] - d[yd]; // y da textura cresce para baixo; o gradiente é em y para cima
      const l = Math.hypot(gx, gy) || 1; gx /= l; gy /= l;
      const o = ((H - 1 - y) * HW + x) * 4; // linha 0 da textura = y mais baixo
      out[o] = half(d[i]); out[o + 1] = half(gx); out[o + 2] = half(gy); out[o + 3] = half(dh[i]);
    }
  }
  return { largura: HW, altura: H, dados: out };
}

self.onmessage = () => {
  for (let i = 0; i < MODELOS.length; i++) {
    const c = campo(MODELOS[i]);
    self.postMessage({ i, ...c }, [c.dados.buffer]);
  }
};
