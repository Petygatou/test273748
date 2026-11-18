// Estúdio de produto analítico: três softboxes e um fundo quase preto, avaliados na direção do reflexo.
// A rugosidade amacia as bordas das caixas (reflexo nítido no verniz, borrado no acetato cru).
// Usado pela armação, pelas lentes e pelo estojo, então os três refletem o mesmo estúdio.

export const glslLuz = /* glsl */ `
vec3 caixaLuz(vec3 r, vec3 eixo, vec3 cima, vec2 ext, float suave, vec3 cor) {
  float c = dot(r, eixo);
  if (c <= 0.0) return vec3(0.0);
  vec3 u = normalize(cross(cima, eixo)), v = cross(eixo, u);
  vec2 q = vec2(dot(r, u), dot(r, v)) / c;
  vec2 e = ext + suave;
  vec2 m = 1.0 - smoothstep(ext - suave, e, abs(q));
  return cor * m.x * m.y * (ext.x * ext.y) / (e.x * e.y);
}
uniform float uLuzGiro;
vec3 ambiente(vec3 r, float rug) {
  float s = 0.012 + rug * rug * 1.1;
  float cg = cos(uLuzGiro), sg = sin(uLuzGiro);
  r.xz = mat2(cg, -sg, sg, cg) * r.xz;
  vec3 c = vec3(0.0);
  c += caixaLuz(r, normalize(vec3(-0.22, 0.88, 0.42)), vec3(0.0, 0.0, -1.0), vec2(0.78, 0.24), s, vec3(13.0, 12.7, 12.3));
  c += caixaLuz(r, normalize(vec3(-0.92, 0.18, 0.34)), vec3(0.0, 1.0, 0.0), vec2(0.11, 0.85), s, vec3(7.2, 7.4, 7.7));
  c += caixaLuz(r, normalize(vec3(0.86, 0.32, -0.4)), vec3(0.0, 1.0, 0.0), vec2(0.09, 0.7), s, vec3(9.5, 9.0, 8.3));
  c += caixaLuz(r, normalize(vec3(0.35, 0.05, 1.0)), vec3(0.0, 1.0, 0.0), vec2(0.42, 0.3), s * 1.5 + 0.08, vec3(0.9));
  c += mix(vec3(0.01), vec3(0.06, 0.058, 0.055), smoothstep(-0.35, 0.7, r.y));
  return c;
}
vec3 irradiancia(vec3 n) {
  return ambiente(n, 1.0) * 0.32 + mix(vec3(0.01), vec3(0.045, 0.043, 0.04), n.y * 0.5 + 0.5);
}
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
vec3 srgb(vec3 c) { c = clamp(c, 0.0, 1.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
`;
