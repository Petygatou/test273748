// GLSL da cadeia do palco: placa nítida → pirâmide de desfoque → composição → tela.

export const vertTela = /* glsl */ `
out vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

// redução de 13 amostras (filtro de Jimenez): cada nível tem metade do tamanho do anterior
export const fragReduz = /* glsl */ `
in vec2 vUv;
out vec4 cor;
uniform sampler2D uFonte;
uniform vec2 uTexel;
vec4 a(vec2 o) { return texture(uFonte, vUv + uTexel * o); }
void main() {
  vec4 c = a(vec2(0.0)) * 0.125;
  c += (a(vec2(-2.0, 2.0)) + a(vec2(2.0, 2.0)) + a(vec2(-2.0, -2.0)) + a(vec2(2.0, -2.0))) * 0.03125;
  c += (a(vec2(0.0, 2.0)) + a(vec2(-2.0, 0.0)) + a(vec2(2.0, 0.0)) + a(vec2(0.0, -2.0))) * 0.0625;
  c += (a(vec2(-1.0, 1.0)) + a(vec2(1.0, 1.0)) + a(vec2(-1.0, -1.0)) + a(vec2(1.0, -1.0))) * 0.125;
  cor = c;
}
`;

// amostra de qualquer nível da pirâmide com B-spline cúbica (4 leituras bilineares): o desfoque
// sai liso, sem o quadriculado dos níveis pequenos. Usado pela composição, pela lente e pela armação.
export const glslDesfoque = /* glsl */ `
uniform sampler2D uN0, uN1, uN2, uN3, uN4, uN5, uN6;
uniform vec2 uTam[7];
vec3 bspline(sampler2D t, vec2 uv, vec2 tam) {
  vec2 p = uv * tam - 0.5;
  vec2 i = floor(p), f = fract(p);
  vec2 f2 = f * f, f3 = f2 * f;
  vec2 w0 = (-f3 + 3.0 * f2 - 3.0 * f + 1.0) / 6.0;
  vec2 w1 = (3.0 * f3 - 6.0 * f2 + 4.0) / 6.0;
  vec2 w2 = (-3.0 * f3 + 3.0 * f2 + 3.0 * f + 1.0) / 6.0;
  vec2 w3 = f3 / 6.0;
  vec2 g0 = w0 + w1, g1 = w2 + w3;
  vec2 h0 = (i - 0.5 + w1 / g0) / tam, h1 = (i + 1.5 + w3 / g1) / tam;
  return g0.y * (g0.x * texture(t, vec2(h0.x, h0.y)).rgb + g1.x * texture(t, vec2(h1.x, h0.y)).rgb)
       + g1.y * (g0.x * texture(t, vec2(h0.x, h1.y)).rgb + g1.x * texture(t, vec2(h1.x, h1.y)).rgb);
}
vec3 nivel(int n, vec2 uv) {
  if (n <= 0) return texture(uN0, uv).rgb;
  if (n == 1) return bspline(uN1, uv, uTam[1]);
  if (n == 2) return bspline(uN2, uv, uTam[2]);
  if (n == 3) return bspline(uN3, uv, uTam[3]);
  if (n == 4) return bspline(uN4, uv, uTam[4]);
  if (n == 5) return bspline(uN5, uv, uTam[5]);
  return bspline(uN6, uv, uTam[6]);
}
vec3 desfoque(vec2 uv, float b) {
  b = clamp(b, 0.0, 5.999);
  int n = int(floor(b));
  float f = smoothstep(0.0, 1.0, fract(b));
  if (f < 0.002) return nivel(n, uv);
  return mix(nivel(n, uv), nivel(n + 1, uv), f);
}
`;

// exposição do sol: sobe a partir de um centro (a lente) até cobrir a tela; a lente usa a mesma conta
export const glslExpo = /* glsl */ `
uniform vec4 uExpo;   // centro (uv), raio da frente de luz (em alturas de tela), força (multiplicador da luz)
uniform float uAspecto;
float exposicao(vec2 uv) {
  vec2 d = (uv - uExpo.xy) * vec2(uAspecto, 1.0);
  float frente = 1.0 - smoothstep(uExpo.z - 0.55, uExpo.z, length(d));
  return 1.0 + (uExpo.w - 1.0) * frente;
}
`;

export const fragComposicao = /* glsl */ `
in vec2 vUv;
out vec4 cor;
${glslDesfoque}
${glslExpo}
uniform float uDesfoque;          // nível global (0 = nítido, 6 = névoa)
uniform vec4 uFaixa[8];           // tabela de exame: y0, y1 (uv), nitidez, desfoque próprio
uniform int uNFaixas;
uniform vec4 uPainel[2];          // vidro fosco: x0, y0, x1, y1 (uv)
uniform vec4 uPainelInfo[2];      // raio (px), opacidade, nível do desfoque, brilho
uniform vec2 uRes;                // tamanho da tela (px de desenho)
uniform float uDpr;

float caixaArred(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r; }

void main() {
  float b = uDesfoque;
  // faixas da tabela de exame: cada linha com a própria nitidez (as bordas da faixa são suaves)
  for (int i = 0; i < 8; i++) {
    if (i >= uNFaixas) break;
    vec4 f = uFaixa[i];
    float dentro = smoothstep(f.x - 0.012, f.x + 0.004, vUv.y) * (1.0 - smoothstep(f.y - 0.004, f.y + 0.012, vUv.y));
    b = mix(b, f.w * (1.0 - f.z), dentro);
  }
  vec3 c = desfoque(vUv, b);
  c *= exposicao(vUv);

  // vidro fosco: desfoque fundo, um véu claro, borda de luz de 1 px
  for (int i = 0; i < 2; i++) {
    vec4 inf = uPainelInfo[i];
    if (inf.y <= 0.0) continue;
    vec4 r = uPainel[i];
    vec2 px = vUv * uRes;
    vec2 c0 = (r.xy + r.zw) * 0.5 * uRes, h = abs(r.zw - r.xy) * 0.5 * uRes;
    float d = caixaArred(px - c0, h, inf.x * uDpr);
    float m = (1.0 - smoothstep(-0.75, 0.75, d)) * inf.y;
    if (m <= 0.0) continue;
    vec3 v = desfoque(vUv, inf.z) * exposicao(vUv);
    v = v * 0.4 + vec3(0.03, 0.029, 0.027);
    float borda = (1.0 - smoothstep(0.0, 1.6 * uDpr, abs(d + 0.8 * uDpr))) * inf.w;
    float topo = smoothstep(h.y, h.y - 80.0 * uDpr, abs((px.y - c0.y) - h.y)) ;
    v += borda * 0.18 + topo * 0.012;
    c = mix(c, v, m);
  }
  cor = vec4(c, 1.0);
}
`;

// composição → tela: mapeamento de tons neutro (o mesmo do 3D), sRGB e grão leve contra faixas no degradê
export const fragTela = /* glsl */ `
in vec2 vUv;
out vec4 cor;
uniform sampler2D uFonte;
uniform float uGrao;
uniform float uSemente;
float hash(vec2 p) { p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
vec3 neutro(vec3 c) {
  const float ini = 0.8 - 0.04, des = 0.15;
  float x = min(c.r, min(c.g, c.b));
  float off = x < 0.08 ? x - 6.25 * x * x : 0.04;
  c -= off;
  float pico = max(c.r, max(c.g, c.b));
  if (pico < ini) return c;
  float d = 1.0 - ini;
  float novo = 1.0 - d * d / (pico + d - ini);
  c *= novo / pico;
  float g = 1.0 - 1.0 / (des * (pico - novo) + 1.0);
  return mix(c, vec3(novo), g);
}
vec3 srgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
void main() {
  vec3 c = texture(uFonte, vUv).rgb;
  c = srgb(clamp(neutro(max(c, 0.0)), 0.0, 1.0));
  float n = hash(gl_FragCoord.xy + uSemente * 97.0) - 0.5;
  c += n * (1.5 / 255.0 + uGrao);
  cor = vec4(c, 1.0);
}
`;
