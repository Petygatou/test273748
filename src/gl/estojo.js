// O estojo: casco arredondado em duas metades, tampa articulada na borda de trás, forro de feltro cor de mel
// e a marca em folha dourada na tampa. Raymarching como a armação, com o mesmo estúdio de luz.
import * as THREE from 'three';
import { glslLuz } from './glasses/luz.js';

const vert = /* glsl */ `
out vec3 vMundo;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vMundo = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const frag = /* glsl */ `
in vec3 vMundo;
out vec4 cor;
uniform mat4 uInv, uMod, uProj;
uniform float uTampa;       // ângulo de abertura (rad)
uniform float uPix;
uniform float uOpac;
uniform sampler2D uMarca;
${glslLuz}

const vec3 B = vec3(79.0, 21.0, 30.0);
const float R = 19.5, E = 2.3;
float sdCaixa(vec3 p, vec3 b, float r) { vec3 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r; }
mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
vec3 naTampa(vec3 p) { vec3 h = vec3(0.0, 0.0, -B.z + 3.0); return rotX(uTampa) * (p - h) + h; }
// distância e material: 1 casco, 2 feltro, 3 borda
vec2 metade(vec3 p, float lado) {
  float fora = sdCaixa(p, B, R);
  float dentro = sdCaixa(p, B - E, R - E);
  float casca = max(fora, -dentro);
  float d = max(casca, lado * p.y);
  float id = abs(dentro) < abs(fora) ? 2.0 : 1.0;
  if (abs(p.y) < 0.35 && casca < 0.0) id = 3.0;
  return vec2(d, id);
}
vec2 mapa(vec3 p) {
  vec2 a = metade(p, 1.0);
  vec2 b = metade(naTampa(p), -1.0);
  return a.x < b.x ? a : b;
}
float dist(vec3 p) { return mapa(p).x; }
vec3 normal(vec3 p) {
  const vec2 e = vec2(1.0, -1.0) * 0.05;
  return normalize(e.xyy * dist(p + e.xyy) + e.yyx * dist(p + e.yyx) + e.yxy * dist(p + e.yxy) + e.xxx * dist(p + e.xxx));
}
float oclusao(vec3 p, vec3 n) {
  float o = 0.0, s = 1.0;
  for (int i = 1; i <= 5; i++) { float h = 1.0 + 3.0 * float(i); o += (h - dist(p + n * h)) * s; s *= 0.62; }
  return clamp(1.0 - 0.03 * o, 0.15, 1.0);
}
vec2 caixa(vec3 ro, vec3 rd, vec3 mn, vec3 mx) {
  vec3 ir = 1.0 / rd, t0 = (mn - ro) * ir, t1 = (mx - ro) * ir;
  vec3 a = min(t0, t1), b = max(t0, t1);
  return vec2(max(max(a.x, a.y), a.z), min(min(b.x, b.y), b.z));
}
void main() {
  vec3 ro = (uInv * vec4(cameraPosition, 1.0)).xyz;
  vec3 rd = normalize((uInv * vec4(vMundo - cameraPosition, 0.0)).xyz);
  vec2 tb = caixa(ro, rd, vec3(-84.0, -26.0, -96.0), vec3(84.0, 96.0, 36.0));
  float t = max(tb.x, 0.0), tF = tb.y;
  if (tF < t) discard;
  bool acerto = false;
  float melhor = 1e9, tm = t;
  vec2 h;
  for (int i = 0; i < 110; i++) {
    vec3 p = ro + rd * t;
    h = mapa(p);
    if (h.x < uPix * t * 0.35) { acerto = true; break; }
    if (h.x / t < melhor) { melhor = h.x / t; tm = t; }
    t += h.x * 0.9;
    if (t > tF) break;
  }
  float alfa = 1.0;
  if (!acerto) {
    alfa = 1.0 - melhor / uPix;
    if (alfa <= 0.0) discard;
    t = tm; h = mapa(ro + rd * t);
  }
  vec3 p = ro + rd * t;
  vec3 n = normal(p);
  vec3 pw = (uMod * vec4(p, 1.0)).xyz;
  vec3 nw = normalize(mat3(uMod) * n);
  vec3 vw = normalize(cameraPosition - pw);
  float NoV = clamp(dot(nw, vw), 0.0, 1.0);
  vec3 R = reflect(-vw, nw);
  float fr = pow(1.0 - NoV, 5.0);
  float ao = oclusao(p, n);
  vec3 c;
  if (h.y > 1.5 && h.y < 2.5) {
    // feltro: difuso quente com brilho de fibra na borda (sheen)
    vec3 mel = vec3(0.42, 0.21, 0.07);
    c = mel * irradiancia(nw) * 1.4 + mel * pow(1.0 - NoV, 3.0) * 0.5 * irradiancia(nw);
    c *= ao;
  } else {
    // casco preto aveludado, com a marca em folha dourada na tampa
    vec3 alb = vec3(0.016, 0.0145, 0.013);
    float rug = 0.48;
    vec3 q = naTampa(p);
    float marca = 0.0;
    if (q.y > 0.0 && dot(normalize((rotX(uTampa) * n)), vec3(0.0, 1.0, 0.0)) > 0.7) {
      vec2 uv = vec2(q.x / 110.0 + 0.5, 0.5 - q.z / 44.0);
      if (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) marca = texture(uMarca, uv).a;
    }
    float F = 0.04 + 0.5 * fr;
    c = alb * irradiancia(nw) + ambiente(R, rug) * F * 0.5;
    vec3 ouro = vec3(0.95, 0.72, 0.38);
    vec3 cm = ambiente(R, 0.22) * ouro * 0.7 + ouro * irradiancia(nw) * 0.12;
    c = mix(c, cm, marca);
    c *= ao;
  }
  c = srgb(neutro(c));
  alfa *= uOpac;
  vec4 clip = uProj * viewMatrix * vec4(pw, 1.0);
  gl_FragDepth = clamp(clip.z / clip.w * 0.5 + 0.5, 0.0, 1.0);
  cor = vec4(c * alfa, alfa);
}
`;

function texMarca() {
  const c = document.createElement('canvas');
  c.width = 880; c.height = 352;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.strokeStyle = '#fff';
  g.lineWidth = 13;
  g.lineCap = 'round';
  // símbolo à esquerda e o nome
  const cy = 176;
  g.beginPath(); g.arc(250, cy, 34, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(340, cy, 34, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.moveTo(282, cy - 6); g.quadraticCurveTo(295, cy - 18, 308, cy - 6); g.stroke();
  g.font = '700 118px Satoshi, sans-serif';
  g.letterSpacing = '-4px';
  g.textBaseline = 'middle';
  g.fillText('Grau', 404, cy + 6);
  const tx = new THREE.CanvasTexture(c);
  tx.colorSpace = THREE.NoColorSpace;
  tx.anisotropy = 8;
  return tx;
}

export class Estojo {
  constructor() {
    this.grupo = new THREE.Group();
    this.estado = { tampa: 1.9, opac: 1 };
    this.mesh = new THREE.Mesh(
      new THREE.BoxGeometry(170, 124, 134).translate(0, 35, -30),
      new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: vert,
        fragmentShader: frag,
        side: THREE.BackSide,
        transparent: true,
        depthWrite: true,
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
        uniforms: {
          uInv: { value: new THREE.Matrix4() }, uMod: { value: new THREE.Matrix4() }, uProj: { value: new THREE.Matrix4() },
          uTampa: { value: 1.9 }, uPix: { value: 0.001 }, uOpac: { value: 1 }, uMarca: { value: texMarca() }, uLuzGiro: { value: 0 },
        },
      }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.grupo.add(this.mesh);
    this.grupo.visible = false;
  }

  quadro(camera, dprAltura) {
    if (!this.grupo.visible) return;
    this.grupo.updateMatrixWorld(true);
    const u = this.mesh.material.uniforms;
    u.uMod.value.copy(this.mesh.matrixWorld);
    u.uInv.value.copy(this.mesh.matrixWorld).invert();
    u.uProj.value.copy(camera.projectionMatrix);
    u.uPix.value = (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / dprAltura;
    u.uTampa.value = this.estado.tampa;
    u.uOpac.value = this.estado.opac;
  }
}
