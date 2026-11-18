// Os óculos ao vivo: a armação é desenhada por raymarching (a frente é a extrusão arredondada do campo de
// distância de cada modelo; hastes, blocos e rebites são formas analíticas), e cada lente é uma malha
// curva cujo shader lê a camada de leitura nítida com refração, ampliação e franja de cor.
import * as THREE from 'three';
import { MODELOS, centroLente, dobradica, raioLente, RET } from './modelos.js';
import { glslLuz } from './luz.js';
import { glslDesfoque, glslExpo } from '../shaders.js';

export const CORES = {
  tartaruga: { alb: [1, 1, 1], tex: 1, tint: [1, 1, 1], transp: 0, rug: 0.34, sub: 1 },
  preto: { alb: [0.0105, 0.0098, 0.0092], tex: 0, tint: [1, 1, 1], transp: 0, rug: 0.24, sub: 0 },
  verde: { alb: [0.006, 0.03, 0.017], tex: 0, tint: [0.16, 0.42, 0.27], transp: 0.66, rug: 0.2, sub: 0.25 },
  cristal: { alb: [0.004, 0.004, 0.004], tex: 0, tint: [0.9, 0.885, 0.85], transp: 0.95, rug: 0.1, sub: 0 },
};

const glslCampo = /* glsl */ `
uniform sampler2D uCampoA, uCampoB;
uniform float uMorph;
uniform vec4 uRet;
vec4 campo(vec2 q) {
  vec2 uv = (q - uRet.xy) / uRet.zw;
  return mix(texture(uCampoA, uv), texture(uCampoB, uv), uMorph);
}
// B-spline cúbica com 4 leituras: só para a normal, que precisa ser lisa (a marcha usa a bilinear)
vec4 bs4(sampler2D t, vec2 uv, vec2 tam) {
  vec2 p = uv * tam - 0.5;
  vec2 i = floor(p), f = fract(p);
  vec2 f2 = f * f, f3 = f2 * f;
  vec2 w0 = (-f3 + 3.0 * f2 - 3.0 * f + 1.0) / 6.0, w1 = (3.0 * f3 - 6.0 * f2 + 4.0) / 6.0;
  vec2 w2 = (-3.0 * f3 + 3.0 * f2 + 3.0 * f + 1.0) / 6.0, w3 = f3 / 6.0;
  vec2 g0 = w0 + w1, g1 = w2 + w3;
  vec2 h0 = (i - 0.5 + w1 / g0) / tam, h1 = (i + 1.5 + w3 / g1) / tam;
  return g0.y * (g0.x * texture(t, vec2(h0.x, h0.y)) + g1.x * texture(t, vec2(h1.x, h0.y)))
       + g1.y * (g0.x * texture(t, vec2(h0.x, h1.y)) + g1.x * texture(t, vec2(h1.x, h1.y)));
}
vec4 campoSuave(vec2 q) {
  vec2 uv = (q - uRet.xy) / uRet.zw;
  vec2 tam = vec2(textureSize(uCampoA, 0));
  return mix(bs4(uCampoA, uv, tam), bs4(uCampoB, uv, tam), uMorph);
}
`;

const vertArmacao = /* glsl */ `
out vec3 vMundo;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vMundo = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const fragArmacao = /* glsl */ `
in vec3 vMundo;
out vec4 cor;
uniform mat4 uInv, uMod, uProj;
${glslCampo}
uniform float uEsp, uCurva, uRaio;
uniform vec3 uDob;
uniform vec3 uBlocoC, uBlocoH;
uniform vec3 uRebite;
uniform float uHaste;
uniform vec2 uDobra;
uniform vec3 uCxMin, uCxMax;
uniform float uPix;
uniform vec4 uMatA[3], uMatB[3];
uniform float uVarre;
uniform sampler2D uTartaruga, uGravura;
uniform vec2 uGrav;
uniform sampler2D uFundo;
uniform vec2 uRes;
uniform float uOpac;
${glslLuz}

mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
float sdCaixa(vec3 p, vec3 b, float r) { vec3 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r; }
float sdCil(vec3 p, float r, float h) { vec2 d = abs(vec2(length(p.xy), p.z)) - vec2(r, h); return min(max(d.x, d.y), 0.0) + length(max(d, 0.0)); }
float smin(float a, float b, float k) { float h = max(k - abs(a - b), 0.0) / k; return min(a, b) - h * h * k * 0.25; }

float sdFrente(vec3 p) {
  vec3 u = p; u.z += uCurva * p.x * p.x;
  vec2 q = vec2(abs(u.x), u.y);
  vec4 c = campo(q);
  vec2 lim = uRet.xy + uRet.zw;
  vec2 fo = max(vec2(q.x - lim.x, max(q.y - lim.y, uRet.y - q.y)), 0.0);
  float d2 = c.x + length(fo);
  float h = uEsp * 0.5;
  vec2 w = vec2(d2 + uRaio, abs(u.z) - h + uRaio);
  return min(max(w.x, w.y), 0.0) + length(max(w, 0.0)) - uRaio;
}
float sdBloco(vec3 p) { return sdCaixa(vec3(abs(p.x), p.y, p.z) - uBlocoC, uBlocoH, 1.25); }
float sdHaste(vec3 v) {
  float zb = max(-v.z - (uHaste - 36.0), 0.0);
  v.y += 0.0046 * zb * zb;
  float t = clamp((-v.z - 6.0) / 85.0, 0.0, 1.0);
  vec3 b = vec3(mix(2.1, 1.75, t), mix(3.3, 2.15, t), uHaste * 0.5);
  return sdCaixa(v - vec3(0.0, 0.0, -uHaste * 0.5), b, 1.5) * 0.92;
}
vec3 localHaste(vec3 p, float lado) {
  float a = lado > 0.0 ? uDobra.y : uDobra.x;
  vec3 q = vec3(p.x * lado, p.y, p.z) - uDob;
  vec3 v = rotY(-(a - 0.055)) * q;
  if (lado < 0.0) v.y += 4.2 * smoothstep(0.7, 1.45, a);
  return v;
}
// rebite: um domo baixo de metal (calota de esfera saindo da superfície)
float sdDomo(vec3 p, float r, float h) { return max(length(p - vec3(0.0, 0.0, h - r)) - r, -p.z - 0.4); }
float sdRebites(vec3 p, vec3 vD, vec3 vE) {
  vec3 q = vec3(abs(p.x), p.y, p.z);
  float d = min(sdDomo(q - vec3(uRebite.x, uRebite.y + 2.2, uRebite.z - 0.15), 0.95, 0.42),
                sdDomo(q - vec3(uRebite.x, uRebite.y - 2.2, uRebite.z - 0.15), 0.95, 0.42));
  for (int i = 0; i < 2; i++) {
    vec3 v = i == 0 ? vD : vE;
    vec3 a = v - vec3(1.85, 1.6, -6.8), b = v - vec3(1.85, -1.6, -6.8);
    d = min(d, min(sdDomo(a.yzx, 0.8, 0.36), sdDomo(b.yzx, 0.8, 0.36)));
  }
  return d;
}
// distância e material: 1 frente, 2 haste, 3 metal
vec2 mapa(vec3 p) {
  float f = smin(sdFrente(p), sdBloco(p), 1.4);
  vec3 vD = localHaste(p, 1.0), vE = localHaste(p, -1.0);
  vec2 r = vec2(f, 1.0);
  float h = min(sdHaste(vD), sdHaste(vE));
  if (h < r.x) r = vec2(h, 2.0);
  float m = sdRebites(p, vD, vE);
  if (m < r.x) r = vec2(m, 3.0);
  return r;
}
float dist(vec3 p) { return mapa(p).x; }

vec3 normalFrente(vec3 p) {
  vec3 u = p; u.z += uCurva * p.x * p.x;
  vec4 c = campoSuave(vec2(abs(u.x), u.y));
  vec2 g = normalize(c.yz + 1e-6); g.x *= sign(u.x);
  float h = uEsp * 0.5;
  vec2 w = vec2(c.x + uRaio, abs(u.z) - h + uRaio);
  vec3 n;
  if (w.x > 0.0 && w.y > 0.0) { vec2 wn = normalize(w); n = vec3(g * wn.x, sign(u.z) * wn.y); }
  else if (w.x > w.y) n = vec3(g, 0.0);
  else n = vec3(0.0, 0.0, sign(u.z));
  n.x += 2.0 * uCurva * p.x * n.z;
  return normalize(n);
}
vec3 normalFD(vec3 p) {
  const vec2 e = vec2(1.0, -1.0) * 0.035;
  return normalize(e.xyy * dist(p + e.xyy) + e.yyx * dist(p + e.yyx) + e.yxy * dist(p + e.yxy) + e.xxx * dist(p + e.xxx));
}
float oclusao(vec3 p, vec3 n) {
  float o = 0.0, s = 1.0;
  for (int i = 1; i <= 4; i++) { float h = 0.45 + 1.15 * float(i); o += (h - dist(p + n * h)) * s; s *= 0.6; }
  return clamp(1.0 - 0.085 * o, 0.25, 1.0);
}
vec2 caixa(vec3 ro, vec3 rd) {
  vec3 ir = 1.0 / rd;
  vec3 t0 = (uCxMin - ro) * ir, t1 = (uCxMax - ro) * ir;
  vec3 tmin = min(t0, t1), tmax = max(t0, t1);
  return vec2(max(max(tmin.x, tmin.y), tmin.z), min(min(tmax.x, tmax.y), tmax.z));
}
float tPlano(vec3 ro, vec3 rd) {
  if (abs(rd.z) < 1e-5) return -1.0;
  float t = -ro.z / rd.z;
  for (int i = 0; i < 3; i++) { float x = ro.x + rd.x * t; t = (-uCurva * x * x - ro.z) / rd.z; }
  return t;
}

vec3 sombreia(vec3 p, float id) {
  float dB = sdBloco(p);
  vec3 n = (id < 1.5 && dB > 1.8) ? normalFrente(p) : normalFD(p);
  vec3 pw = (uMod * vec4(p, 1.0)).xyz;
  vec3 nw = normalize(mat3(uMod) * n);
  vec3 vw = normalize(cameraPosition - pw);
  float NoV = clamp(dot(nw, vw), 0.0, 1.0);
  vec3 R = reflect(-vw, nw);
  float fr = pow(1.0 - NoV, 5.0);
  float F = 0.04 + 0.62 * fr;
  float ao = oclusao(p, n);

  if (id > 2.5) {
    vec3 m = vec3(0.92, 0.9, 0.86);
    return (ambiente(R, 0.08) * (m + (1.0 - m) * fr) * 1.1 + irradiancia(nw) * 0.1 + m * 0.035) * ao;
  }
  vec3 vD = localHaste(p, 1.0), vE = localHaste(p, -1.0);
  bool dir = sdHaste(vD) < sdHaste(vE);
  vec3 v = dir ? vD : vE;
  vec2 uvT; float d;
  if (id < 1.5) { uvT = p.xy / 66.0 + vec2(0.5, 0.37); d = length(p.xy); }
  else { uvT = vec2(-v.z, v.y) / 66.0 + (dir ? vec2(0.11, 0.73) : vec2(0.47, 0.21)); d = uDob.x + 6.0 - v.z; }
  // a textura do Codex é mais alaranjada que a hero: fundo mais marrom, manchas de mel mantidas
  vec3 tex = pow(texture(uTartaruga, uvT).rgb, vec3(1.32)) * vec3(0.98, 0.9, 0.84);
  float lum = dot(tex, vec3(0.3, 0.55, 0.15));
  float k = 1.0 - smoothstep(uVarre - 6.0, uVarre + 6.0, d + (lum - 0.12) * 40.0);
  vec4 m0 = mix(uMatA[0], uMatB[0], k), m1 = mix(uMatA[1], uMatB[1], k), m2 = mix(uMatA[2], uMatB[2], k);
  vec3 alb = mix(m0.rgb, tex, m0.a);
  float transp = m1.a, rug = m2.x, sub = m2.y;

  vec3 dif = alb * irradiancia(nw);
  vec3 esp = ambiente(R, rug) * F * 0.55;
  vec3 cc = ambiente(R, 0.03) * F;
  float claro = smoothstep(0.02, 0.22, dot(alb, vec3(0.33)));
  vec3 sss = alb * (0.35 + alb) * claro * sub * (0.55 + 1.1 * pow(1.0 - NoV, 2.0)) * 0.5;
  vec3 c = (dif + sss) * ao + esp * ao + cc * (0.4 + 0.6 * ao);

  if (transp > 0.0) {
    vec2 suv = gl_FragCoord.xy / uRes;
    vec3 nv = normalize((viewMatrix * vec4(nw, 0.0)).xyz);
    vec2 off = nv.xy * (0.012 + 0.035 * (1.0 - NoV));
    vec3 bg = vec3(texture(uFundo, suv - off * 1.07).r, texture(uFundo, suv - off).g, texture(uFundo, suv - off * 0.93).b);
    float borda = 1.0 - NoV;
    vec3 t = bg * m1.rgb * (1.0 - F) * (1.0 - 0.82 * pow(borda, 1.4)) + alb * irradiancia(nw);
    c = mix(c, t + esp * 0.8 + cc, transp);
  }

  // gravação na face de dentro das hastes: modelo e medida numa, marca na outra
  if (id > 1.5) {
    vec3 nl = rotY(-((dir ? uDobra.y : uDobra.x) - 0.055)) * vec3(n.x * (dir ? 1.0 : -1.0), n.y, n.z);
    vec2 g = vec2((-v.z - 21.0) / 76.0, (v.y + 1.75) / 3.5);
    if (nl.x < -0.55 && g.x > 0.0 && g.x < 1.0 && g.y > 0.0 && g.y < 1.0) {
      float linha = dir ? 4.0 : uGrav.x;
      float a = texture(uGravura, vec2(g.x, (linha + g.y) / 5.0)).a;
      vec3 tinta = vec3(0.78, 0.66, 0.44);
      c = mix(c, tinta * (irradiancia(nw) * 0.9 + ambiente(R, 0.35) * 0.35), a * 0.92);
    }
  }
  return c;
}

void main() {
  vec3 ro = (uInv * vec4(cameraPosition, 1.0)).xyz;
  vec3 rd = normalize((uInv * vec4(vMundo - cameraPosition, 0.0)).xyz);
  vec2 tb = caixa(ro, rd);
  float t = max(tb.x, 0.0), tF = tb.y;
  if (tF < t) discard;
  bool furo = false;
  float tp = tPlano(ro, rd);
  if (tp > t && tp < tF) {
    vec3 pp = ro + rd * tp;
    if (campo(vec2(abs(pp.x), pp.y)).w < -0.9) { tF = tp; furo = true; }
  }
  float melhor = 1e9, tm = t, idm = 1.0;
  bool acerto = false;
  vec2 h = vec2(1.0);
  for (int i = 0; i < 120; i++) {
    vec3 p = ro + rd * t;
    h = mapa(p);
    float e = uPix * t;
    if (h.x < e * 0.35) { acerto = true; break; }
    float r = h.x / t;
    if (r < melhor) { melhor = r; tm = t; idm = h.y; }
    t += h.x * 0.88;
    if (t > tF) break;
  }
  float alfa = 1.0;
  vec3 p;
  float id;
  if (acerto) { p = ro + rd * t; id = h.y; }
  else {
    float cob = 1.0 - melhor / uPix;
    if (cob <= 0.0) discard;
    alfa = clamp(cob, 0.0, 1.0);
    p = ro + rd * tm; id = idm;
  }
  vec3 c = sombreia(p, id);
  c = srgb(neutro(c));
  alfa *= uOpac;
  vec4 clip = uProj * viewMatrix * uMod * vec4(p, 1.0);
  gl_FragDepth = clamp(clip.z / clip.w * 0.5 + 0.5, 0.0, 1.0);
  cor = vec4(c * alfa, alfa);
}
`;

const vertLente = /* glsl */ `
uniform float uCurva;
uniform float uCx;
out vec2 vLocal;
out vec3 vN;
out vec3 vMundo;
void main() {
  vec3 p = position;
  float dx = p.x - uCx;
  float r2 = dx * dx + p.y * p.y;
  const float R = 125.0;
  float s = sqrt(max(R * R - r2, 1.0));
  p.z = -uCurva * p.x * p.x + 0.9 + (s - R);
  vec3 n = normalize(vec3(2.0 * uCurva * p.x + dx / s, p.y / s, 1.0));
  vLocal = position.xy;
  vN = normalize(mat3(modelMatrix) * n);
  vec4 w = modelMatrix * vec4(p, 1.0);
  vMundo = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const fragLente = /* glsl */ `
in vec2 vLocal;
in vec3 vN;
in vec3 vMundo;
out vec4 cor;
${glslCampo}
${glslDesfoque}
${glslExpo}
${glslLuz}
uniform vec2 uRes;
uniform vec2 uCentro;      // centro da lente na tela (uv)
uniform float uCx;         // centro da lente no modelo (mm, com sinal)
uniform float uAmp;        // ampliação
uniform float uBarril;     // a ampliação cresce para a borda
uniform float uFranja;     // separação de cor na borda
uniform float uPrisma;     // desvio pela inclinação da lente
uniform float uFoco;       // desfoque dentro da lente (0 = nítido)
uniform float uTinta;      // 0 = incolor, 1 = G-15
uniform vec3 uG15;
uniform float uReflexo;
uniform float uMulti;      // corredor da multifocal
uniform float uFantasma;   // reflexos fortes de uma lente sem antirreflexo
uniform float uVarreAR;    // a varrida do antirreflexo (-0.2 a 1.3)
uniform float uGrosso;     // borda de lente grossa (fundo de garrafa)
uniform float uPolar;      // polarizada: tira o brilho da água
uniform vec4 uMira;        // hero: centro do título (uv), peso, ampliação (a lente mostra o título inteiro)
// a lente que encolhe (mira) enxerga além da borda da tela: ali a última linha esticaria em listras,
// então quanto mais fora, mais desfocado (uma continuação lisa, sem emenda)
float fora(vec2 uv) { vec2 f = max(-uv, uv - 1.0); return max(max(f.x, f.y), 0.0); }
// as últimas linhas da tela têm a borda escura da foto: a lente lê sempre um pouco para dentro,
// e mais para dentro quanto mais desfocado (o desfoque espalha essa borda)
vec2 dentro(vec2 uv, float r) { vec2 m = (3.0 + 90.0 * r) / uTam[0]; return clamp(uv, m, 1.0 - m); }
void main() {
  vec4 c = campo(vec2(abs(vLocal.x), vLocal.y));
  float dh = c.w;
  if (dh > 0.75) discard;
  vec2 suv = gl_FragCoord.xy / uRes;
  float rn = clamp(1.0 + dh / 21.0, 0.0, 1.0);
  vec2 lp = vec2((abs(vLocal.x) - abs(uCx)), vLocal.y) / 23.6;
  float fx = abs(lp.x);
  vec3 vw = normalize(cameraPosition - vMundo);
  vec3 n = normalize(vN);
  vec3 nv = normalize((viewMatrix * vec4(n, 0.0)).xyz);
  vec2 d = suv - uCentro;

  // multifocal: longe em cima, perto embaixo no meio (com mais aumento), laterais de baixo borradas
  float lateral = smoothstep(0.14, 0.48, fx) * smoothstep(0.22, -0.32, lp.y);
  float perto = smoothstep(-0.2, -0.52, lp.y) * (1.0 - smoothstep(0.16, 0.4, fx));
  float focoL = uFoco + uMulti * lateral * 3.4;
  // lente grossa: perto da borda a imagem encolhe, como fundo de garrafa
  float borda = smoothstep(0.5, 0.97, rn);
  float m = uAmp * (1.0 + uBarril * rn * rn) * (1.0 + uMulti * perto * 0.18) * mix(1.0, 0.56, uGrosso * borda);
  m *= mix(1.0, uMira.w / uAmp, uMira.z);
  vec2 o = mix(uCentro, uMira.xy, uMira.z);
  float ca = uFranja * rn * rn + uGrosso * borda * 0.05;
  vec2 pr = nv.xy * uPrisma * vec2(uRes.y / uRes.x, 1.0);
  vec3 col;
  float rf = smoothstep(0.0, 0.04, fora(o + d / m - pr));
  float focoF = focoL + 5.0 * rf;
  col.r = desfoque(dentro(o + d / (m * (1.0 - ca)) - pr, rf), focoF).r;
  col.g = desfoque(dentro(o + d / m - pr, rf), focoF).g;
  col.b = desfoque(dentro(o + d / (m * (1.0 + ca)) - pr, rf), focoF).b;
  col *= exposicao(suv);
  col *= mix(vec3(1.0), uG15, uTinta);
  // polarizada: o brilho do sol na água some
  col = mix(col, col / (1.0 + max(col - vec3(0.55), 0.0) * 2.6), uPolar);

  float NoV = clamp(dot(n, vw), 0.0, 1.0);
  float F = 0.03 + 0.97 * pow(1.0 - NoV, 5.0);
  vec3 R = reflect(-vw, n);
  col += ambiente(R, 0.06) * F * uReflexo;
  // sem antirreflexo: a janela do ambiente refletida na lente; a varrida limpa da esquerda para a direita
  float sujo = (1.0 - smoothstep(uVarreAR - 0.07, uVarreAR + 0.07, lp.x * 0.5 + 0.5 + lp.y * 0.16)) * uFantasma;
  vec3 jan = caixaLuz(R, normalize(vec3(-0.34, 0.2, 1.0)), vec3(0.0, 1.0, 0.0), vec2(0.16, 0.24), 0.03, vec3(1.0))
           + caixaLuz(R, normalize(vec3(0.02, 0.2, 1.0)), vec3(0.0, 1.0, 0.0), vec2(0.16, 0.24), 0.03, vec3(1.0))
           + caixaLuz(R, normalize(vec3(-0.15, -0.32, 1.0)), vec3(0.0, 1.0, 0.0), vec2(0.5, 0.04), 0.06, vec3(0.6));
  col = mix(col, vec3(0.42, 0.45, 0.47), 0.14 * sujo);
  col += jan * vec3(0.78, 0.84, 0.9) * 0.62 * sujo;
  // depois da varrida fica o reflexo residual esverdeado de toda lente com antirreflexo
  col += jan * vec3(0.12, 0.2, 0.12) * 0.12 * uFantasma * (1.0 - sujo);
  // anéis da borda grossa
  col += uGrosso * borda * pow(abs(sin((rn - 0.5) * 52.0)), 14.0) * vec3(0.55, 0.6, 0.66) * 0.45;

  float b = smoothstep(-0.75, -0.2, dh) * (1.0 - smoothstep(0.1, 0.45, dh));
  col += b * vec3(0.55, 0.68, 0.82) * 0.16;
  cor = vec4(srgb(neutro(col)), 1.0);
}
`;

function texGravura() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 320;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'middle';
  ctx.font = '500 34px Satoshi, sans-serif';
  ctx.letterSpacing = '4px';
  const linhas = [...MODELOS.map(m => `${m.nome.toUpperCase()}   ${m.medida}   ${m.haste}`), 'GRAU   ACETATO   FEITO À MÃO'];
  // linha 0 da textura fica embaixo (v = 0): desenha de baixo para cima
  linhas.forEach((t, i) => ctx.fillText(t, 8, c.height - (i + 0.5) * 64));
  const tx = new THREE.CanvasTexture(c);
  tx.colorSpace = THREE.NoColorSpace;
  tx.anisotropy = 8;
  return tx;
}

const vec4s = () => [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()];
function poeCor(alvo, nome) {
  const c = CORES[nome];
  alvo[0].set(...c.alb, c.tex);
  alvo[1].set(...c.tint, c.transp);
  alvo[2].set(c.rug, c.sub, 0, 0);
}

export class Oculos {
  constructor({ tartaruga, fundo, desfoque }) {
    this.grupo = new THREE.Group();
    this.campos = [];
    this.estado = { a: 0, b: 0, morph: 0, corA: 'tartaruga', corB: 'tartaruga', varre: 999, dobraE: 0, dobraD: 0, tinta: 0, foco: 0, opac: 1 };
    // demonstrações da cena Lentes e do Sol (animadas por tempo nos módulos das cenas)
    this.demo = { multi: 0, fantasma: 0, varreAR: -0.3, grosso: 0, polar: 0, franja: 1 };
    this.inv = new THREE.Matrix4();
    this.mira = new THREE.Vector4(0.5, 0.5, 0, 1);

    const comum = {
      uCampoA: { value: null }, uCampoB: { value: null }, uMorph: { value: 0 },
      uRet: { value: new THREE.Vector4(RET.x0, RET.y0, RET.x1 - RET.x0, RET.y1 - RET.y0) },
      uCurva: { value: 0.0013 }, uLuzGiro: { value: 0 },
    };
    this.comum = comum;

    this.armacao = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: vertArmacao,
        fragmentShader: fragArmacao,
        side: THREE.BackSide,
        transparent: true,
        depthWrite: true,
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
        uniforms: {
          ...comum,
          uInv: { value: new THREE.Matrix4() }, uMod: { value: new THREE.Matrix4() }, uProj: { value: new THREE.Matrix4() },
          uEsp: { value: 5.6 }, uRaio: { value: 1.5 },
          uDob: { value: new THREE.Vector3() }, uBlocoC: { value: new THREE.Vector3() }, uBlocoH: { value: new THREE.Vector3() },
          uRebite: { value: new THREE.Vector3() }, uHaste: { value: 145 }, uDobra: { value: new THREE.Vector2() },
          uCxMin: { value: new THREE.Vector3(-84, -40, -172) }, uCxMax: { value: new THREE.Vector3(84, 40, 14) },
          uPix: { value: 0.001 }, uMatA: { value: vec4s() }, uMatB: { value: vec4s() }, uVarre: { value: 999 },
          uTartaruga: { value: tartaruga }, uGravura: { value: texGravura() }, uGrav: { value: new THREE.Vector2() },
          uFundo: { value: fundo }, uRes: { value: new THREE.Vector2(1, 1) }, uOpac: { value: 1 },
        },
      }),
    );
    // a caixa que limita o raymarching, em mm (a escala do grupo põe em unidades da cena)
    this.armacao.geometry.scale(168, 80, 186).translate(0, 0, -79);
    this.armacao.frustumCulled = false;
    this.armacao.renderOrder = 2;
    this.grupo.add(this.armacao);

    // lentes: uma malha curva por lado, grande o bastante para os quatro modelos; o furo recorta no shader
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const m of MODELOS) {
      const cx = centroLente(m);
      for (let i = 0; i < 360; i++) {
        const t = (i / 360) * Math.PI * 2, r = raioLente(m, t) + 1.2;
        x0 = Math.min(x0, cx + Math.cos(t) * r); x1 = Math.max(x1, cx + Math.cos(t) * r);
        y0 = Math.min(y0, Math.sin(t) * r); y1 = Math.max(y1, Math.sin(t) * r);
      }
    }
    const geo = new THREE.PlaneGeometry(x1 - x0, y1 - y0, 56, 48).translate((x0 + x1) / 2, (y0 + y1) / 2, 0);
    this.lentes = [1, -1].map(lado => {
      const g = geo.clone();
      if (lado < 0) { g.scale(-1, 1, 1); const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) [ix[i + 1], ix[i + 2]] = [ix[i + 2], ix[i + 1]]; }
      const mat = new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: vertLente,
        fragmentShader: fragLente,
        uniforms: {
          ...comum,
          ...desfoque,
          uCx: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) }, uCentro: { value: new THREE.Vector2(0.5, 0.5) },
          uAmp: { value: 1.17 }, uBarril: { value: 0.12 }, uFranja: { value: 0.035 }, uPrisma: { value: 0.03 },
          uFoco: { value: 0 }, uTinta: { value: 0 }, uG15: { value: new THREE.Vector3(0.1, 0.125, 0.092) },
          uReflexo: { value: 0.1 }, uLado: { value: lado },
          uMulti: { value: 0 }, uFantasma: { value: 0 }, uVarreAR: { value: -0.3 }, uGrosso: { value: 0 }, uPolar: { value: 0 },
          uMira: { value: this.mira },
        },
      });
      const me = new THREE.Mesh(g, mat);
      me.frustumCulled = false;
      me.renderOrder = 1;
      this.grupo.add(me);
      return me;
    });
  }

  /** recebe os campos de distância do worker */
  carregaCampos() {
    return new Promise(res => {
      const w = new Worker(new URL('./frente.worker.js', import.meta.url), { type: 'module' });
      let n = 0;
      w.onmessage = ({ data }) => {
        const tx = new THREE.DataTexture(data.dados, data.largura, data.altura, THREE.RGBAFormat, THREE.HalfFloatType);
        tx.minFilter = tx.magFilter = THREE.LinearFilter;
        tx.wrapS = tx.wrapT = THREE.ClampToEdgeWrapping;
        tx.needsUpdate = true;
        this.campos[data.i] = tx;
        if (++n === MODELOS.length) { w.terminate(); this.aplica(); res(); }
      };
      w.postMessage(0);
    });
  }

  /** escreve o estado (modelos, morph, cores, dobra) nos uniforms */
  aplica() {
    const e = this.estado, u = this.armacao.material.uniforms;
    const A = MODELOS[e.a], B = MODELOS[e.b], k = e.morph;
    const mix = (a, b) => a + (b - a) * k;
    this.comum.uCampoA.value = this.campos[e.a] ?? null;
    this.comum.uCampoB.value = this.campos[e.b] ?? null;
    this.comum.uMorph.value = k;
    this.comum.uCurva.value = mix(A.curva, B.curva);
    const esp = mix(A.espessura, B.espessura), h = esp / 2;
    u.uEsp.value = esp;
    const dA = dobradica(A), dB = dobradica(B);
    const dx = mix(dA.x, dB.x), dy = mix(dA.y, dB.y);
    const curva = this.comum.uCurva.value;
    const zFrente = -h + 1.6 - curva * dx * dx, zTras = -h - 5.6 - curva * dx * dx;
    u.uBlocoC.value.set(dx - 1.3, dy, (zFrente + zTras) / 2);
    u.uBlocoH.value.set(2.6, mix(A.orelha.alto, B.orelha.alto) * 0.4, (zFrente - zTras) / 2);
    u.uDob.value.set(dx - 1.1, dy, zTras + 0.6);
    u.uRebite.value.set(dx - 3.4, dy, h - curva * (dx - 3.4) ** 2 + 0.05);
    u.uHaste.value = mix(A.haste, B.haste);
    u.uDobra.value.set(e.dobraE, e.dobraD);
    poeCor(u.uMatA.value, e.corA);
    poeCor(u.uMatB.value, e.corB);
    u.uVarre.value = e.varre;
    u.uGrav.value.set(k < 0.5 ? e.a : e.b, 0);
    u.uOpac.value = e.opac;
    const cA = centroLente(A), cB = centroLente(B), cx = mix(cA, cB);
    this.lentes[0].material.uniforms.uCx.value = cx;
    this.lentes[1].material.uniforms.uCx.value = -cx;
    const dm = this.demo;
    for (const l of this.lentes) {
      const lu = l.material.uniforms;
      lu.uTinta.value = e.tinta;
      lu.uMulti.value = dm.multi; lu.uFantasma.value = dm.fantasma; lu.uVarreAR.value = dm.varreAR;
      lu.uGrosso.value = dm.grosso; lu.uPolar.value = dm.polar;
    }
    this.cx = cx;
  }

  /** chamado a cada quadro, depois que a pose do grupo foi atualizada */
  quadro(camera, largura, altura, dprAltura) {
    this.grupo.updateMatrixWorld(true);
    const u = this.armacao.material.uniforms;
    u.uMod.value.copy(this.armacao.matrixWorld);
    u.uInv.value.copy(this.armacao.matrixWorld).invert();
    u.uProj.value.copy(camera.projectionMatrix);
    u.uPix.value = (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / dprAltura;
    u.uRes.value.set(largura, altura);
    const v = new THREE.Vector3();
    const lt = this.lenteNaTela(camera, 1);
    const rPx = Math.max(20, lt.r * altura);
    for (const l of this.lentes) {
      const lado = l.material.uniforms.uLado.value;
      v.set(this.cx * lado, 0, 0.9).applyMatrix4(this.grupo.matrixWorld).project(camera);
      l.material.uniforms.uCentro.value.set(v.x * 0.5 + 0.5, v.y * 0.5 + 0.5);
      l.material.uniforms.uRes.value.set(largura, altura);
      // a franja fica com ~6 px de desenho na borda, qualquer que seja o tamanho da lente na tela
      l.material.uniforms.uFranja.value = Math.min(0.035, (6 / rPx)) * this.demo.franja;
    }
  }

  /** centro (uv da tela) e raio aproximado (fração da altura) de uma lente: 1 = direita da tela */
  lenteNaTela(camera, lado = 1) {
    const m = MODELOS[this.estado.morph < 0.5 ? this.estado.a : this.estado.b];
    const c = new THREE.Vector3(this.cx * lado, 0, 0.9).applyMatrix4(this.grupo.matrixWorld).project(camera);
    const b = new THREE.Vector3(this.cx * lado, raioLente(m, Math.PI / 2), 0.9).applyMatrix4(this.grupo.matrixWorld).project(camera);
    return { x: c.x * 0.5 + 0.5, y: c.y * 0.5 + 0.5, r: Math.hypot(b.x - c.x, b.y - c.y) * 0.5 };
  }
}
