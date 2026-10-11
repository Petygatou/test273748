import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const W = 1080, H = 1920;
export const FOV = 58;
const C = {
  void: new THREE.Color('#040208'), deep: new THREE.Color('#12062b'), royal: new THREE.Color('#3b0f8c'),
  electric: new THREE.Color('#7c3aff'), lilac: new THREE.Color('#b9a2ff'), white: new THREE.Color('#f4f0ff'),
  signal: new THREE.Color('#e8ff5a'),
};

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

const NOISE = /* glsl */`
vec3 hash3(vec3 p){ p = vec3(dot(p,vec3(127.1,311.7,74.7)), dot(p,vec3(269.5,183.3,246.1)), dot(p,vec3(113.5,271.9,124.6))); return -1.0 + 2.0*fract(sin(p)*43758.5453123); }
float noise(vec3 p){ vec3 i=floor(p); vec3 f=fract(p); vec3 u=f*f*(3.0-2.0*f);
  return mix(mix(mix(dot(hash3(i+vec3(0,0,0)),f-vec3(0,0,0)),dot(hash3(i+vec3(1,0,0)),f-vec3(1,0,0)),u.x),
                 mix(dot(hash3(i+vec3(0,1,0)),f-vec3(0,1,0)),dot(hash3(i+vec3(1,1,0)),f-vec3(1,1,0)),u.x),u.y),
             mix(mix(dot(hash3(i+vec3(0,0,1)),f-vec3(0,0,1)),dot(hash3(i+vec3(1,0,1)),f-vec3(1,0,1)),u.x),
                 mix(dot(hash3(i+vec3(0,1,1)),f-vec3(0,1,1)),dot(hash3(i+vec3(1,1,1)),f-vec3(1,1,1)),u.x),u.y),u.z); }
float fbm(vec3 p){ float a=0.5, s=0.0; for(int i=0;i<5;i++){ s+=a*noise(p); p*=2.03; a*=0.5; } return s; }
`;

/* ---------------- canvas textures for the UI panels ---------------- */
function panelTexture(kind) {
  const cv = document.createElement('canvas'); cv.width = 640; cv.height = 400;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, 640, 400);
  const line = 'rgba(185,162,255,0.9)', soft = 'rgba(185,162,255,0.35)', fill = 'rgba(124,58,255,0.35)';
  g.strokeStyle = line; g.fillStyle = line; g.lineWidth = 2;
  g.font = '500 20px "JetBrains Mono"'; g.textBaseline = 'top';
  const label = { site: 'SITE.html', ads: 'CAMPANHA.ads', sys: 'SISTEMA.db', sheet: 'PLANILHA.xls', crm: 'CONTATOS.csv', app: 'APP.ios' }[kind] || '';
  g.fillText(label, 30, 26);
  g.strokeStyle = soft; g.beginPath(); g.moveTo(30, 62); g.lineTo(610, 62); g.stroke();
  g.strokeStyle = line;
  const r = rng(kind.length * 99);
  if (kind === 'site') {
    [0, 1, 2].forEach(i => { g.beginPath(); g.arc(560 + i * 18, 36, 5, 0, 7); g.stroke(); });
    g.fillStyle = fill; g.fillRect(30, 90, 580, 120);
    g.fillStyle = line; g.fillRect(56, 120, 300, 22); g.fillRect(56, 156, 200, 12);
    g.strokeRect(56, 230, 150, 44); g.fillStyle = 'rgba(244,240,255,0.9)'; g.fillRect(70, 247, 120, 10);
    g.fillStyle = soft; for (let i = 0; i < 3; i++) g.fillRect(30 + i * 197, 300, 180, 70);
  } else if (kind === 'ads') {
    g.fillStyle = soft; g.fillRect(30, 90, 260, 280);
    g.fillStyle = line; g.font = '500 54px "JetBrains Mono"'; g.fillText('2.4%', 330, 96);
    g.font = '400 18px "JetBrains Mono"'; g.fillText('CTR · ISOLADO', 330, 160);
    for (let i = 0; i < 9; i++) { const h = 30 + r() * 140; g.fillStyle = i === 6 ? line : soft; g.fillRect(330 + i * 30, 370 - h, 20, h); }
  } else if (kind === 'sys' || kind === 'sheet' || kind === 'crm') {
    const cols = kind === 'crm' ? 2 : 5, rows = 7;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const cw = 580 / cols;
      g.strokeStyle = soft; g.strokeRect(30 + x * cw, 86 + y * 42, cw, 42);
      g.fillStyle = y === 0 ? line : soft; g.fillRect(42 + x * cw, 100 + y * 42, (cw - 30) * (0.3 + r() * 0.6), 12);
    }
  } else if (kind === 'app') {
    g.strokeRect(250, 80, 140, 290); g.fillStyle = fill; g.fillRect(262, 110, 116, 80);
    g.fillStyle = soft; for (let i = 0; i < 4; i++) g.fillRect(262, 204 + i * 36, 116, 24);
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

/* ---------------- materials ---------------- */
function glassMaterial(tex) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uTex: { value: tex }, uGlow: { value: 0.25 }, uOpacity: { value: 1 }, uTint: { value: C.electric.clone() } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying vec2 vUv; varying vec3 vP;
      void main(){ vUv=uv; vP=position; vec4 mv=modelViewMatrix*vec4(position,1.); vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `uniform sampler2D uTex; uniform float uGlow; uniform float uOpacity; uniform vec3 uTint;
      varying vec3 vN; varying vec3 vV; varying vec2 vUv; varying vec3 vP;
      void main(){
        float fr = pow(1.0-abs(dot(normalize(vN),normalize(vV))), 2.2);
        vec3 base = vec3(0.035,0.012,0.08);
        vec3 col = base + uTint*fr*(0.6+uGlow*1.6);
        float front = step(0.5, abs(vN.z));
        vec4 tx = texture2D(uTex, vUv);
        col += tx.rgb*tx.a*front*(0.25+uGlow*1.4);
        float a = (0.55 + fr*0.45)*uOpacity;
        gl_FragColor = vec4(col, a);
      }`,
  });
}

function edgeMaterial() {
  return new THREE.LineBasicMaterial({ color: C.lilac.clone(), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
}

/* ---------------- panel object ---------------- */
function makePanel(kind, w = 3.2, h = 2) {
  const group = new THREE.Group();
  const geo = new RoundedBoxGeometry(w, h, 0.07, 3, 0.08);
  const mat = glassMaterial(panelTexture(kind));
  const mesh = new THREE.Mesh(geo, mat);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, 0.07)), edgeMaterial());
  group.add(mesh, edges);
  group.userData = { kind, mat, edges, glow: 0.2, opacity: 0 };
  group.visible = false;
  return group;
}

/* ---------------- tube with draw-on + traveling pulse ---------------- */
function makeTube(points, radius = 0.025, color = C.electric) {
  const curve = new THREE.CatmullRomCurve3(points);
  const geo = new THREE.TubeGeometry(curve, 80, radius, 6, false);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uDraw: { value: 0 }, uPulse: { value: -1 }, uOpacity: { value: 1 }, uColor: { value: color.clone() }, uFlicker: { value: 0 }, uTime: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `uniform float uDraw,uPulse,uOpacity,uFlicker,uTime; uniform vec3 uColor; varying vec2 vUv;
      void main(){
        float x=vUv.x; if(x>uDraw) discard;
        float head = smoothstep(uDraw-0.08, uDraw, x)*step(uDraw,0.999);
        float pulse = exp(-pow((x-uPulse)*18.0,2.0));
        float fl = 1.0 - uFlicker*step(0.5, fract(sin(floor(uTime*30.0)*12.9898)*43758.5));
        vec3 c = uColor*(0.55+head*2.0) + vec3(1.0)*pulse*1.6;
        gl_FragColor=vec4(c, uOpacity*fl*(0.75+pulse));
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData = { mat, curve };
  return mesh;
}

/* ---------------- particle cloud with morph targets ---------------- */
function sampleText(text, count, width, r) {
  const cv = document.createElement('canvas'); cv.width = 1400; cv.height = 420;
  const g = cv.getContext('2d');
  g.fillStyle = '#fff'; g.font = '800 360px "Inter Tight"'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.letterSpacing = '-10px';
  g.fillText(text, 700, 220);
  const d = g.getImageData(0, 0, 1400, 420).data;
  const pts = [];
  for (let y = 0; y < 420; y += 2) for (let x = 0; x < 1400; x += 2) if (d[(y * 1400 + x) * 4 + 3] > 140) pts.push([x, y]);
  // measure bounds to center
  let minx = 1e9, maxx = -1e9; pts.forEach(p => { minx = Math.min(minx, p[0]); maxx = Math.max(maxx, p[0]); });
  const sc = width / (maxx - minx), cx = (minx + maxx) / 2;
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const p = pts[Math.floor(r() * pts.length)] || [700, 210];
    out[i * 3] = (p[0] - cx + (r() - 0.5) * 2) * sc;
    out[i * 3 + 1] = -(p[1] - 220 + (r() - 0.5) * 2) * sc;
    out[i * 3 + 2] = (r() - 0.5) * 0.35;
  }
  return out;
}

function makeParticles(count) {
  const r = rng(42);
  const geo = new THREE.BufferGeometry();
  const cloud = new Float32Array(count * 3), rings = new Float32Array(count * 3), shell = new Float32Array(count * 3), galaxy = new Float32Array(count * 3);
  const rnd = new Float32Array(count * 4);
  // galaxy clusters
  const clusters = [];
  for (let i = 0; i < 70; i++) {
    const a = r() * Math.PI * 2, d = i === 0 ? 0 : 10 + Math.pow(r(), 0.7) * 70;
    clusters.push([Math.cos(a) * d, (r() - 0.5) * 6, Math.sin(a) * d, i === 0 ? 3.2 : 0.6 + r() * 1.6]);
  }
  for (let i = 0; i < count; i++) {
    const u = r(), v = r(), w = r();
    // cloud: wide shell volume
    const th = u * Math.PI * 2, ph = Math.acos(2 * v - 1), rad = 8 + w * 26;
    cloud[i * 3] = Math.sin(ph) * Math.cos(th) * rad * 1.6;
    cloud[i * 3 + 1] = Math.cos(ph) * rad * 0.7;
    cloud[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * rad - 6;
    // three rings
    const k = i % 3, a = r() * Math.PI * 2, rr = 3.4 + (r() - 0.5) * 0.18;
    let p = new THREE.Vector3(Math.cos(a) * rr, Math.sin(a) * rr, (r() - 0.5) * 0.12);
    p.applyEuler(new THREE.Euler([1.2, -0.5, 0.3][k], [0.3, 1.0, -0.9][k], [0, 0.6, 1.2][k]));
    rings.set([p.x, p.y, p.z], i * 3);
    // structure shell (sphere surface + equator lattice)
    const sth = r() * Math.PI * 2, sph = Math.acos(2 * r() - 1), sr = i % 5 === 0 ? 1.0 + r() * 0.8 : 1.85;
    shell.set([Math.sin(sph) * Math.cos(sth) * sr, Math.cos(sph) * sr, Math.sin(sph) * Math.sin(sth) * sr], i * 3);
    // galaxy
    const c = clusters[i % 7 === 0 ? 0 : 1 + Math.floor(r() * (clusters.length - 1))];
    const gr = Math.pow(r(), 1.6) * c[3];
    const gth = r() * Math.PI * 2, gph = Math.acos(2 * r() - 1);
    galaxy.set([c[0] + Math.sin(gph) * Math.cos(gth) * gr, c[1] + Math.cos(gph) * gr * 0.6, c[2] + Math.sin(gph) * Math.sin(gth) * gr], i * 3);
    rnd.set([r(), r(), r(), r()], i * 4);
  }
  const text = sampleText('OPUS', count, 7.6, r);
  geo.setAttribute('position', new THREE.BufferAttribute(cloud, 3));
  geo.setAttribute('aText', new THREE.BufferAttribute(text, 3));
  geo.setAttribute('aRings', new THREE.BufferAttribute(rings, 3));
  geo.setAttribute('aShell', new THREE.BufferAttribute(shell, 3));
  geo.setAttribute('aGalaxy', new THREE.BufferAttribute(galaxy, 3));
  geo.setAttribute('aRnd', new THREE.BufferAttribute(rnd, 4));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 }, uW: { value: [1, 0, 0, 0, 0] }, uCollapse: { value: 0 }, uExplode: { value: 0 },
      uSize: { value: 1 }, uOpacity: { value: 0 }, uSwirl: { value: 0 }, uPix: { value: 1 },
      uC1: { value: C.electric.clone() }, uC2: { value: C.lilac.clone() }, uC3: { value: C.white.clone() },
    },
    vertexShader: NOISE + `
      attribute vec3 aText; attribute vec3 aRings; attribute vec3 aShell; attribute vec3 aGalaxy; attribute vec4 aRnd;
      uniform float uTime, uW[5], uCollapse, uExplode, uSize, uSwirl, uPix;
      varying float vA; varying vec4 vR;
      mat2 rot(float a){ float c=cos(a), s=sin(a); return mat2(c,-s,s,c); }
      void main(){
        vR = aRnd;
        float t = uTime;
        vec3 cl = position; cl.xz *= rot(t*0.02*(0.5+aRnd.x)); cl.y += sin(t*0.3+aRnd.y*6.28)*0.6;
        vec3 rg = aRings; rg.xy *= rot(t*0.35*(aRnd.z>0.5?1.:-1.)); rg.yz *= rot(t*0.12);
        vec3 sh = aShell; sh.xz *= rot(t*0.25);
        vec3 gx = aGalaxy; gx.xz *= rot(t*0.01);
        vec3 tx = aText + vec3(noise(aText*0.8+t*0.4), noise(aText*0.8+t*0.4+9.), 0.)*0.06;
        vec3 p = cl*uW[0] + tx*uW[1] + rg*uW[2] + sh*uW[3] + gx*uW[4];
        float wsum = uW[0]+uW[1]+uW[2]+uW[3]+uW[4]; p /= max(wsum, 0.0001);
        // transitional turbulence: particles fly loose while between shapes
        float trans = 1.0 - max(max(max(uW[0],uW[1]),max(uW[2],uW[3])),uW[4]) / max(wsum,0.0001);
        vec3 nz = vec3(noise(p*0.25+aRnd.xyz*4.+t*0.5), noise(p*0.25+aRnd.yzx*4.+t*0.5+3.), noise(p*0.25+aRnd.zxy*4.+t*0.5+7.));
        p += nz*trans*6.0;
        p.xz *= rot(uSwirl*(1.0+aRnd.x)*(1.0/(1.0+length(p.xz)*0.2)));
        p += normalize(p+0.001)*uExplode*(0.4+aRnd.w*1.6) + nz*uExplode*0.8;
        p = mix(p, nz*0.15, uCollapse);
        vec4 mv = modelViewMatrix*vec4(p,1.);
        gl_Position = projectionMatrix*mv;
        float sz = (0.6+aRnd.w*aRnd.w*2.6)*uSize;
        gl_PointSize = sz*uPix*(36.0/-mv.z);
        vA = 0.55+0.45*sin(t*2.0+aRnd.x*40.0);
      }`,
    fragmentShader: `uniform float uOpacity; uniform vec3 uC1,uC2,uC3; varying float vA; varying vec4 vR;
      void main(){ vec2 c=gl_PointCoord-0.5; float d=length(c); if(d>0.5) discard;
        float a = smoothstep(0.5,0.0,d); a*=a;
        vec3 col = vR.x<0.55 ? uC1 : (vR.x<0.9 ? uC2 : uC3);
        gl_FragColor = vec4(col*1.25, a*vA*uOpacity); }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

/* stream particles: funnel converging into a point along +x */
function makeStream(count) {
  const r = rng(7);
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3), rnd = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) rnd.set([r(), r(), r(), r()], i * 4);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aRnd', new THREE.BufferAttribute(rnd, 4));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 }, uLen: { value: 9 }, uMouth: { value: 3.5 }, uPix: { value: 1 }, uSpeed: { value: 0.35 } },
    vertexShader: `attribute vec4 aRnd; uniform float uTime,uLen,uMouth,uPix,uSpeed; varying float vF; varying vec4 vR;
      void main(){ vR=aRnd; float p=fract(aRnd.x + uTime*uSpeed*(0.6+aRnd.y*0.8));
        float rad = uMouth*pow(1.0-p, 1.6) + 0.04;
        float a = aRnd.z*6.2831 + p*3.0;
        vec3 pos = vec3(-uLen*(1.0-p), cos(a)*rad, sin(a)*rad);
        vF = smoothstep(0.0,0.15,p)*(1.0-smoothstep(0.92,1.0,p));
        vec4 mv=modelViewMatrix*vec4(pos,1.); gl_Position=projectionMatrix*mv;
        gl_PointSize=(0.8+aRnd.w*2.2)*uPix*(30.0/-mv.z)*(0.6+p); }`,
    fragmentShader: `uniform float uOpacity; varying float vF; varying vec4 vR;
      void main(){ float d=length(gl_PointCoord-0.5); if(d>0.5) discard; float a=pow(smoothstep(0.5,0.,d),2.);
        vec3 c = mix(vec3(0.49,0.23,1.0), vec3(0.95,0.93,1.0), step(0.8,vR.y));
        gl_FragColor=vec4(c*1.3, a*vF*uOpacity); }`,
  });
  const p = new THREE.Points(geo, mat); p.frustumCulled = false;
  return p;
}

/* background nebula drawn as a clip-space quad */
function makeBackground() {
  const mat = new THREE.ShaderMaterial({
    depthTest: false, depthWrite: false,
    uniforms: { uTime: { value: 0 }, uIntensity: { value: 0.0 }, uHue: { value: 0 }, uAspect: { value: W / H }, uPulse: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.9999,1.); }`,
    fragmentShader: NOISE + `uniform float uTime,uIntensity,uHue,uAspect,uPulse; varying vec2 vUv;
      void main(){ vec2 p=(vUv-0.5)*vec2(uAspect,1.);
        float n = fbm(vec3(p*1.6, uTime*0.04));
        float n2 = fbm(vec3(p*3.2+n, uTime*0.06+4.));
        vec3 deep=vec3(0.07,0.024,0.17), royal=vec3(0.23,0.06,0.55), elec=vec3(0.49,0.23,1.0);
        float m = smoothstep(-0.2,0.6,n2)*smoothstep(1.3,0.1,length(p*vec2(0.8,1.2)));
        vec3 col = mix(vec3(0.016,0.008,0.03), deep, m) + royal*pow(m,3.)*0.6 + elec*pow(max(n2,0.),4.)*0.25;
        col *= uIntensity*(1.0+uPulse*0.6);
        gl_FragColor=vec4(col,1.); }`,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  m.frustumCulled = false; m.renderOrder = -10;
  return m;
}

function makeFloor() {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uOpacity: { value: 0 }, uScan: { value: -100 }, uTime: { value: 0 } },
    vertexShader: `varying vec3 vW; void main(){ vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform float uOpacity,uScan,uTime; varying vec3 vW;
      void main(){ vec2 g=vW.xz/1.5; vec2 f=abs(fract(g-0.5)-0.5)/fwidth(g); float l=1.0-min(min(f.x,f.y),1.0);
        vec2 g2=vW.xz/7.5; vec2 f2=abs(fract(g2-0.5)-0.5)/fwidth(g2); float l2=1.0-min(min(f2.x,f2.y),1.0);
        float fade = exp(-length(vW.xz)*0.035);
        float scan = exp(-pow((vW.x-uScan)*0.6,2.));
        vec3 c = vec3(0.49,0.23,1.0)*(l*0.35+l2*0.6) + vec3(0.9,0.85,1.0)*scan*(l+l2)*1.2;
        gl_FragColor=vec4(c, (l*0.35+l2*0.6+scan*l*0.8)*fade*uOpacity); }`,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), mat);
  m.rotation.x = -Math.PI / 2;
  return m;
}

/* ---------------- the integrated structure (core + 4 modules) ---------------- */
function makeCore() {
  const g = new THREE.Group();
  const ico = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(1.9, 1)),
    new THREE.LineBasicMaterial({ color: C.lilac.clone(), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
  const inner = new THREE.Mesh(new THREE.IcosahedronGeometry(1.1, 4), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uGlow: { value: 0.6 }, uOpacity: { value: 1 }, uTime: { value: 0 } },
    vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vec4 mv=modelViewMatrix*vec4(position,1.); vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `uniform float uGlow,uOpacity; varying vec3 vN; varying vec3 vV;
      void main(){ float f=dot(normalize(vN),normalize(vV)); vec3 c=mix(vec3(0.49,0.23,1.0), vec3(1.0), pow(f,6.)); gl_FragColor=vec4(c*uGlow*(0.25+pow(f,3.)*1.2), uOpacity); }`,
  }));
  const ringGeo = new THREE.TorusGeometry(2.7, 0.012, 6, 160);
  const ringMat = new THREE.MeshBasicMaterial({ color: C.electric.clone(), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
  const ring1 = new THREE.Mesh(ringGeo, ringMat), ring2 = new THREE.Mesh(ringGeo, ringMat);
  ring1.rotation.x = Math.PI / 2; ring2.rotation.set(Math.PI / 2.6, 0.5, 0);
  g.add(ico, inner, ring1, ring2);
  g.userData = { ico, inner, ring1, ring2, ringMat };
  return g;
}

function makeCubes() {
  const g = new THREE.Group();
  const n = 16, r = rng(3);
  const geo = new RoundedBoxGeometry(0.55, 0.55, 0.55, 2, 0.06);
  const cubes = [];
  for (let i = 0; i < n; i++) {
    const mat = glassMaterial(null);
    mat.fragmentShader = mat.fragmentShader.replace('vec4 tx = texture2D(uTex, vUv);', 'vec4 tx = vec4(0.);');
    const m = new THREE.Mesh(geo, mat);
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.55, 0.55, 0.55)), edgeMaterial());
    m.add(e);
    const gx = (i % 4) - 1.5, gy = Math.floor(i / 4) - 1.5;
    m.userData = {
      grid: new THREE.Vector3(gx * 0.72, gy * 0.72, 0),
      chaos: new THREE.Vector3((r() - 0.5) * 6, (r() - 0.5) * 4, (r() - 0.5) * 4),
      rot: new THREE.Euler(r() * 6, r() * 6, r() * 6), e,
    };
    cubes.push(m); g.add(m);
  }
  g.userData = { cubes, order: 0 };
  return g;
}

function makePhone() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new RoundedBoxGeometry(1.5, 3, 0.16, 4, 0.22), glassMaterial(panelTexture('app')));
  // remap: use a plain texture-less look but glowing edges
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new RoundedBoxGeometry(1.5, 3, 0.16, 2, 0.22), 30), edgeMaterial());
  const rings = [];
  for (let i = 0; i < 3; i++) {
    const rm = new THREE.Mesh(new THREE.RingGeometry(1, 1.03, 96), new THREE.MeshBasicMaterial({ color: C.lilac.clone(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    rings.push(rm); g.add(rm);
  }
  g.add(body, edges);
  g.userData = { body, edges, rings };
  return g;
}

export class Scene3D {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(W, H, false);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(FOV, W / H, 0.1, 600);
    // the camera rig: tweened by the timeline
    this.cam = { x: 0, y: 0, z: 18, tx: 0, ty: 0, tz: 0, roll: 0, fov: FOV, shake: 0 };

    this.bg = makeBackground(); this.scene.add(this.bg);
    this.floor = makeFloor(); this.floor.position.y = -3.2; this.scene.add(this.floor);

    this.particles = makeParticles(26000); this.scene.add(this.particles);
    this.pw = { cloud: 1, text: 0, rings: 0, shell: 0, galaxy: 0 };

    // scene B: isolated tools
    this.panels = {};
    const defs = [['site', -1.2, 4.6, 0], ['ads', -0.8, -1.2, 0], ['sys', 1.0, 1.7, -2], ['sheet', -3.4, -5.2, -7], ['crm', 3.6, 8.2, -8], ['app', 3.2, -4.4, -5]];
    defs.forEach(([k, x, y, z]) => {
      const p = makePanel(k); p.position.set(x, y, z); p.userData.home = new THREE.Vector3(x, y, z);
      this.panels[k] = p; this.scene.add(p);
    });
    // failed connection attempt
    const attempt = (a, b, bend) => {
      const A = this.panels[a].userData.home, B = this.panels[b].userData.home;
      const d = B.clone().sub(A).normalize();
      const s = A.clone().add(d.clone().multiplyScalar(1.1)), e = B.clone().sub(d.clone().multiplyScalar(0.9));
      const m = s.clone().add(e).multiplyScalar(0.5).add(new THREE.Vector3(bend, 0, 0.6));
      return makeTube([s, m, e], 0.03);
    };
    this.brokenA = attempt('site', 'sys', 1.4);
    this.brokenB = attempt('ads', 'sys', -1.6);
    [this.brokenA, this.brokenB].forEach(b => { b.visible = false; this.scene.add(b); });

    // scene C: pile of tools (instanced glass tiles)
    this.pile = this.makePile(42); this.scene.add(this.pile);

    // structure
    this.structure = new THREE.Group(); this.scene.add(this.structure);
    this.core = makeCore(); this.structure.add(this.core);
    this.modules = {};
    const R = 7.5;
    const ang = { traffic: Math.PI, site: Math.PI * 1.5, sys: 0, app: Math.PI * 0.5 };
    this.modPos = {};
    for (const k in ang) this.modPos[k] = new THREE.Vector3(Math.cos(ang[k]) * R, 0, Math.sin(ang[k]) * R);
    // traffic: wire cone + stream
    const traffic = new THREE.Group();
    const cone = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.ConeGeometry(1.2, 2.6, 12, 1, true)), edgeMaterial());
    cone.rotation.z = -Math.PI / 2; cone.position.x = -1.3;
    this.stream = makeStream(2600);
    traffic.add(cone, this.stream);
    traffic.userData = { cone };
    const site = makePanel('site', 3.6, 2.25); site.visible = true;
    const sys = makeCubes();
    const app = makePhone();
    this.modules = { traffic, site, sys, app };
    for (const k in this.modules) {
      const m = this.modules[k]; m.position.copy(this.modPos[k]);
      m.lookAt(0, 0, 0); m.rotateY(Math.PI);
      this.structure.add(m);
    }
    // traffic stream should point toward the site module: orient the group so +x looks at core
    traffic.lookAt(0, 0, 0); traffic.rotateY(-Math.PI / 2);
    this.modState = { traffic: 0, site: 0, sys: 0, app: 0, core: 0 };
    // links core <-> modules and ring connections between modules
    this.links = [];
    for (const k in this.modPos) {
      const p = this.modPos[k];
      const mid = p.clone().multiplyScalar(0.5); mid.y = 1.4;
      const t = makeTube([new THREE.Vector3(0, 0, 0), mid, p.clone().multiplyScalar(0.86)], 0.03);
      t.userData.key = k; this.links.push(t); this.structure.add(t);
    }
    const order = ['traffic', 'site', 'sys', 'app'];
    this.chain = [];
    for (let i = 0; i < 4; i++) {
      const a = this.modPos[order[i]], b = this.modPos[order[(i + 1) % 4]];
      const mid = a.clone().add(b).multiplyScalar(0.5).multiplyScalar(1.18); mid.y = -0.4;
      const t = makeTube([a.clone().multiplyScalar(0.92), mid, b.clone().multiplyScalar(0.92)], 0.022);
      this.chain.push(t); this.structure.add(t);
    }
    // beam for "aponta" / "alavancar"
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.22, 60, 16, 1, true), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uOpacity: { value: 0 }, uLen: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: `uniform float uOpacity,uLen; varying vec2 vUv; void main(){ if(vUv.y>uLen) discard; float e=pow(1.0-abs(vUv.x-0.5)*2.0, 3.0); gl_FragColor=vec4(vec3(0.75,0.6,1.0)*1.6, e*uOpacity*(1.0-vUv.y*0.6)); }`,
    }));
    this.beam.position.y = 30; this.structure.add(this.beam);
    this.structureState = { opacity: 0, mods: 0, lift: 0, spin: 0, pulse: 0 };

    // lone fragment for the "cost" scene
    this.lone = makePanel('crm', 2.6, 1.6); this.scene.add(this.lone);

    this.setupPost();
    this.tmp = new THREE.Vector3();
  }

  makePile(n) {
    const g = new THREE.Group();
    const r = rng(77);
    const kinds = ['site', 'ads', 'sys', 'sheet', 'crm', 'app'];
    const texes = kinds.map(k => panelTexture(k));
    for (let i = 0; i < n; i++) {
      const mat = glassMaterial(texes[i % texes.length]);
      const w = 1.1 + r() * 0.5;
      const m = new THREE.Mesh(new RoundedBoxGeometry(w, w * 0.62, 0.05, 2, 0.04), mat);
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w, w * 0.62, 0.05)), edgeMaterial());
      m.add(e);
      const col = i % 5, row = Math.floor(i / 5);
      m.userData = {
        sky: new THREE.Vector3((r() - 0.5) * 6, 11 + r() * 9, (r() - 0.5) * 4),
        heap: new THREE.Vector3((r() - 0.5) * 4.2 * (1 - row / 10), -3.2 + row * 0.42 + r() * 0.5, (r() - 0.5) * 3),
        heapRot: new THREE.Euler((r() - 0.5) * 2.4, (r() - 0.5) * 2.4, (r() - 0.5) * 2.4),
        grid: new THREE.Vector3((col - 2) * 1.8, (4 - row) * 1.08 + 0.6, -1),
        delay: r(), e,
      };
      g.add(m);
    }
    g.userData = { fall: 0, align: 0, opacity: 0, suck: 0 };
    g.visible = false;
    return g;
  }

  setupPost() {
    const composer = new EffectComposer(this.renderer);
    composer.setPixelRatio(1); composer.setSize(W, H);
    composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 1.0, 0.7, 0.2);
    composer.addPass(this.bloom);
    this.final = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null }, uTime: { value: 0 }, uCA: { value: 0.0015 }, uGrain: { value: 0.06 }, uVig: { value: 1.0 },
        uFlash: { value: 0 }, uFlashCol: { value: new THREE.Color('#d9ccff') }, uGlitch: { value: 0 }, uDesat: { value: 0 }, uFade: { value: 0 },
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime,uCA,uGrain,uVig,uFlash,uGlitch,uDesat,uFade; uniform vec3 uFlashCol; varying vec2 vUv;
        float h(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
        const vec2 RES = vec2(1080.0, 1920.0);
        void main(){
          vec2 uv=vUv;
          if(uGlitch>0.0){ float row=floor(uv.y*48.0); float r=h(vec2(row, floor(uTime*24.0)));
            if(r<uGlitch*0.7) uv.x += (h(vec2(row,floor(uTime*31.0)))-0.5)*0.12*uGlitch; }
          vec2 d=uv-0.5; float ca=uCA*(1.0+uGlitch*6.0)*length(d)*2.0;
          vec3 c; c.r=texture2D(tDiffuse, uv-d*ca).r; c.g=texture2D(tDiffuse, uv).g; c.b=texture2D(tDiffuse, uv+d*ca).b;
          float lum=dot(c,vec3(0.299,0.587,0.114)); c=mix(c, vec3(lum)*vec3(0.9,0.85,1.05), uDesat);
          c += uFlashCol*uFlash;
          float v = smoothstep(1.15, 0.35, length(d*vec2(0.85,1.0))*1.25); c *= mix(1.0, v, uVig);
          c += (h(uv*RES+fract(uTime*13.7))-0.5)*uGrain;
          c *= 1.0-uFade;
          gl_FragColor=vec4(c,1.); }`,
    });
    composer.addPass(this.final);
    composer.addPass(new OutputPass());
    this.composer = composer;
    this.post = { bloom: 1.1, ca: 0.0015, flash: 0, glitch: 0, desat: 0, fade: 0, bgIntensity: 0, bgPulse: 0, floor: 0, floorScan: -100 };
  }

  // project a world-space point (or object) to stage pixels
  project(v) {
    const p = this.tmp.copy(v).project(this.camera);
    return { x: (p.x * 0.5 + 0.5) * W, y: (-p.y * 0.5 + 0.5) * H, behind: p.z > 1 };
  }
  worldOf(obj, offset) {
    const v = new THREE.Vector3(); obj.updateWorldMatrix(true, false);
    v.copy(offset || new THREE.Vector3()); return obj.localToWorld(v);
  }

  update(t, env) {
    const c = this.cam;
    // deterministic handheld shake
    const sh = c.shake;
    const sx = (Math.sin(t * 37.1) + Math.sin(t * 53.7) * 0.6) * sh * 0.08;
    const sy = (Math.sin(t * 41.3 + 1) + Math.sin(t * 61.1) * 0.6) * sh * 0.08;
    const drift = 0.06;
    this.camera.position.set(c.x + sx + Math.sin(t * 0.31) * drift, c.y + sy + Math.sin(t * 0.23) * drift, c.z);
    this.camera.up.set(Math.sin(c.roll), Math.cos(c.roll), 0);
    this.camera.lookAt(c.tx, c.ty, c.tz);
    if (this.camera.fov !== c.fov) { this.camera.fov = c.fov; this.camera.updateProjectionMatrix(); }
    this.camera.updateMatrixWorld();

    // particles
    const pu = this.particles.material.uniforms;
    pu.uTime.value = t;
    const w = this.pw; pu.uW.value = [w.cloud, w.text, w.rings, w.shell, w.galaxy];
    this.particles.visible = pu.uOpacity.value > 0.001;

    // background
    const P = this.post;
    this.bg.material.uniforms.uTime.value = t;
    this.bg.material.uniforms.uIntensity.value = P.bgIntensity;
    this.bg.material.uniforms.uPulse.value = P.bgPulse + env * 0.25;
    this.floor.material.uniforms.uOpacity.value = P.floor;
    this.floor.material.uniforms.uScan.value = P.floorScan;
    this.floor.visible = P.floor > 0.001;

    // panels
    for (const k in this.panels) this.syncPanel(this.panels[k], t);
    this.syncPanel(this.lone, t);
    [this.brokenA, this.brokenB].forEach(b => { b.material.uniforms.uTime.value = t; b.visible = b.material.uniforms.uDraw.value > 0.001 && b.material.uniforms.uOpacity.value > 0.001; });

    // pile
    const pile = this.pile, pd = pile.userData;
    pile.visible = pd.opacity > 0.001;
    if (pile.visible) {
      pile.children.forEach((m, i) => {
        const u = m.userData;
        const f = Math.min(1, Math.max(0, (pd.fall * 1.6 - u.delay * 0.6)));
        const fe = 1 - Math.pow(1 - f, 3);
        const bounce = f < 1 ? Math.sin(f * Math.PI) * 0.3 * (1 - f) : 0;
        const p = new THREE.Vector3().lerpVectors(u.sky, u.heap, fe); p.y += bounce;
        const a = Math.min(1, Math.max(0, pd.align * 1.5 - u.delay * 0.5));
        const ae = a < 0.5 ? 4 * a * a * a : 1 - Math.pow(-2 * a + 2, 3) / 2;
        p.lerp(u.grid, ae);
        p.multiplyScalar(1 - pd.suck);
        m.position.copy(p);
        m.rotation.set(u.heapRot.x * (1 - ae) + t * 0.2 * (1 - fe) * u.delay, u.heapRot.y * (1 - ae), u.heapRot.z * (1 - ae));
        m.scale.setScalar(1 - pd.suck * 0.9);
        m.material.uniforms.uOpacity.value = pd.opacity;
        m.material.uniforms.uGlow.value = 0.15 + ae * 0.5 + pd.suck;
        u.e.material.opacity = pd.opacity * (0.25 + ae * 0.6);
      });
    }

    // structure
    const S = this.structureState;
    this.structure.visible = S.opacity > 0.001;
    if (this.structure.visible) {
      this.structure.position.y = S.lift;
      this.structure.rotation.y = S.spin;
      const core = this.core.userData;
      core.ico.rotation.y = t * 0.3; core.ico.rotation.x = t * 0.17;
      core.ico.material.opacity = S.opacity * (0.35 + this.modState.core * 0.65);
      core.inner.material.uniforms.uGlow.value = (0.12 + this.modState.core * 0.38) * S.opacity;
      core.inner.material.uniforms.uOpacity.value = S.opacity;
      core.ringMat.opacity = S.opacity * (0.25 + this.modState.core * 0.6);
      core.ring1.rotation.z = t * 0.4; core.ring2.rotation.z = -t * 0.3;
      this.core.scale.setScalar(1 + this.modState.core * 0.15 + env * 0.05);
      // modules
      const M = this.modules, st = this.modState, MO = S.opacity * S.mods;
      for (const k in M) M[k].visible = MO > 0.001;
      M.traffic.userData.cone.material.opacity = MO * (0.2 + st.traffic * 0.7);
      this.stream.material.uniforms.uTime.value = t;
      this.stream.material.uniforms.uOpacity.value = MO * (0.15 + st.traffic * 0.85);
      M.site.userData.opacity = MO; M.site.userData.glow = 0.15 + st.site * 0.9;
      const cubes = M.sys.userData.cubes;
      cubes.forEach((cb, i) => {
        const u = cb.userData;
        const o = Math.min(1, Math.max(0, M.sys.userData.order * 1.8 - i / 16 * 0.8));
        const e = o < 0.5 ? 4 * o * o * o : 1 - Math.pow(-2 * o + 2, 3) / 2;
        cb.position.lerpVectors(u.chaos, u.grid, e);
        cb.rotation.set(u.rot.x * (1 - e) + t * 0.3 * (1 - e), u.rot.y * (1 - e), u.rot.z * (1 - e));
        cb.material.uniforms.uOpacity.value = MO;
        cb.material.uniforms.uGlow.value = 0.1 + st.sys * 0.8 * e;
        u.e.material.opacity = MO * (0.2 + st.sys * 0.7);
      });
      const app = M.app.userData;
      M.app.rotation.y += 0; app.body.rotation.y = Math.sin(t * 0.8) * 0.35;
      app.edges.rotation.y = app.body.rotation.y;
      app.body.material.uniforms.uOpacity.value = MO; app.body.material.uniforms.uGlow.value = 0.1 + st.app * 0.9;
      app.edges.material.opacity = MO * (0.25 + st.app * 0.7);
      app.rings.forEach((rm, i) => {
        const ph = ((t * 0.7 + i / 3) % 1);
        rm.scale.setScalar(0.6 + ph * 2.6); rm.material.opacity = MO * st.app * (1 - ph) * 0.3;
      });
      this.links.concat(this.chain).forEach(l => { l.material.uniforms.uTime.value = t; l.material.uniforms.uOpacity.value = MO; l.visible = l.material.uniforms.uDraw.value > 0.001 && MO > 0.001; });
      if (S.pulse > 0) this.links.concat(this.chain).forEach((l, i) => { l.material.uniforms.uPulse.value = ((t * 0.9 + i * 0.37) % 1.3) - 0.15; });
      else this.links.concat(this.chain).forEach(l => { l.material.uniforms.uPulse.value = -1; });
      this.beam.visible = this.beam.material.uniforms.uOpacity.value > 0.001;
      this.syncPanel(this.modules.site, t);
    }

    // post
    this.bloom.strength = P.bloom;
    const fu = this.final.uniforms;
    fu.uTime.value = t; fu.uCA.value = P.ca; fu.uFlash.value = P.flash; fu.uGlitch.value = P.glitch; fu.uDesat.value = P.desat; fu.uFade.value = P.fade;
  }

  syncPanel(p, t) {
    const u = p.userData;
    p.visible = u.opacity > 0.001;
    if (!p.visible) return;
    u.mat.uniforms.uOpacity.value = u.opacity;
    u.mat.uniforms.uGlow.value = u.glow;
    const ph = u.kind.length * 1.7;
    p.children[0].rotation.set(Math.sin(t * 0.6 + ph) * 0.06, Math.sin(t * 0.45 + ph * 2) * 0.08, 0);
    p.children[1].rotation.copy(p.children[0].rotation);
    u.edges.material.opacity = u.opacity * (0.25 + u.glow * 0.75);
  }

  render() { this.composer.render(); }
}
