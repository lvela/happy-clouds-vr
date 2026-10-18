import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Small deterministic value noise for terrain and puffs.
function hash(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
export function noise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, y, oct = 4) {
  let v = 0, amp = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { v += amp * noise2(x * f, y * f); f *= 2; amp *= 0.5; }
  return v;
}

// Text on a canvas, shown as a camera-facing sprite.
export function makeLabel(lines, { size = 1, color = '#3b2340', bg = 'rgba(255,246,240,0.92)', font = 64, width = 1024 } = {}) {
  if (!Array.isArray(lines)) lines = [lines];
  const lineH = font * 1.25;
  const c = document.createElement('canvas');
  c.width = width; c.height = Math.ceil(lineH * lines.length + font * 0.8);
  const g = c.getContext('2d');
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
  sprite.userData.draw = (ls) => {
    g.clearRect(0, 0, c.width, c.height);
    if (bg) {
      g.fillStyle = bg;
      const r = font * 0.6;
      g.beginPath(); g.roundRect(4, 4, c.width - 8, c.height - 8, r); g.fill();
    }
    g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
    ls.forEach((l, i) => {
      g.font = `bold ${i === 0 ? font : Math.round(font * 0.75)}px "Trebuchet MS", sans-serif`;
      g.fillText(l, c.width / 2, font * 0.4 + lineH * (i + 0.5));
    });
    if (sprite.material.map) sprite.material.map.needsUpdate = true;
  };
  sprite.material.map = new THREE.CanvasTexture(c);
  sprite.material.map.colorSpace = THREE.SRGBColorSpace;
  sprite.userData.draw(lines);
  sprite.scale.set(size, size * c.height / c.width, 1);
  sprite.renderOrder = 5;
  return sprite;
}

// Soft round puff texture for distant billboard clouds and particles.
let puffTex = null;
export function getPuffTexture() {
  if (puffTex) return puffTex;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  for (let i = 0; i < 14; i++) {
    const x = 64 + rand(-26, 26), y = 70 + rand(-18, 14), r = rand(22, 40);
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(255,255,255,0.55)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  puffTex = new THREE.CanvasTexture(c);
  puffTex.colorSpace = THREE.SRGBColorSpace;
  return puffTex;
}

let dotTex = null;
export function getDotTexture() {
  if (dotTex) return dotTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.4, 'rgba(255,255,255,0.8)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  dotTex = new THREE.CanvasTexture(c);
  return dotTex;
}

// A fluffy cloud mesh: merged, noise-displaced spheres with sunset vertex colors.
export function makeCloudGeometry(puffs, { top = 0xfff1e6, bottom = 0xd9a8c8, warm = 0xffc49a } = {}) {
  const geos = [];
  const cTop = new THREE.Color(top), cBot = new THREE.Color(bottom), cWarm = new THREE.Color(warm);
  for (const p of puffs) {
    const g = new THREE.IcosahedronGeometry(p.r, 3);
    const pos = g.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const v = new THREE.Vector3(), col = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const n = v.clone().normalize();
      const k = 1 + 0.18 * (fbm(n.x * 2.3 + p.x, n.y * 2.3 + n.z * 1.7 + p.z, 3) - 0.5) * 2;
      v.multiplyScalar(k);
      v.y *= 0.72;
      pos.setXYZ(i, v.x + p.x, v.y + p.y, v.z + p.z);
      const t = clamp(n.y * 0.5 + 0.5, 0, 1);
      col.copy(cBot).lerp(cTop, t);
      col.lerp(cWarm, clamp(n.x * 0.5 + 0.2, 0, 1) * 0.35);
      colors.set([col.r, col.g, col.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geos.push(g);
  }
  // Keep the original sphere normals: they stay smooth, which reads as soft and fluffy.
  const merged = mergeGeometries(geos);
  geos.forEach((g) => g.dispose());
  return merged;
}

export const cloudMaterial = () => new THREE.MeshStandardMaterial({
  vertexColors: true, roughness: 1, metalness: 0, emissive: 0xff9e80, emissiveIntensity: 0.08, envMapIntensity: 0.9,
});

// Marshmallow: a soft rounded cylinder.
let mallowGeo = null;
export function getMarshmallowGeometry() {
  if (mallowGeo) return mallowGeo;
  const pts = [];
  const r = 0.16, h = 0.2, br = 0.05;
  pts.push(new THREE.Vector2(0, -h / 2));
  for (let i = 0; i <= 6; i++) { const a = -Math.PI / 2 + (i / 6) * (Math.PI / 2); pts.push(new THREE.Vector2(r - br + Math.cos(a) * br, -h / 2 + br + Math.sin(a) * br)); }
  for (let i = 0; i <= 6; i++) { const a = (i / 6) * (Math.PI / 2); pts.push(new THREE.Vector2(r - br + Math.cos(a) * br, h / 2 - br + Math.sin(a) * br)); }
  pts.push(new THREE.Vector2(0, h / 2));
  mallowGeo = new THREE.LatheGeometry(pts, 28);
  return mallowGeo;
}
const mallowMats = {};
export function getMarshmallowMaterial(kind = 'white') {
  if (!mallowMats[kind]) {
    const colors = { white: 0xfffaf3, pink: 0xffc6d9, blue: 0xc9e6ff, mint: 0xcff5dc, golden: 0xf0b45a };
    mallowMats[kind] = new THREE.MeshPhysicalMaterial({
      color: colors[kind], roughness: 0.75, sheen: 1, sheenColor: new THREE.Color(0xffffff), sheenRoughness: 0.6,
      emissive: colors[kind], emissiveIntensity: kind === 'golden' ? 0.35 : 0.12,
    });
  }
  return mallowMats[kind];
}

// Lightweight particle bursts (sparkles, confetti, snow puffs).
export class Particles {
  constructor(scene, max = 600) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.points = new THREE.Points(this.geo, new THREE.PointsMaterial({
      size: 0.12, map: getDotTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.points.frustumCulled = false;
    this.points.renderOrder = 4;
    scene.add(this.points);
    this.next = 0;
    for (let i = 0; i < max; i++) this.pos[i * 3 + 1] = -9999;
  }
  burst(at, { count = 30, colors = [0xffd1dc, 0xfff0a8, 0xffffff, 0xb8e0ff], speed = 3, gravity = -4, life = 1.2 } = {}) {
    const c = new THREE.Color();
    for (let n = 0; n < count; n++) {
      const i = this.next; this.next = (this.next + 1) % this.max;
      this.pos.set([at.x, at.y, at.z], i * 3);
      const d = new THREE.Vector3(rand(-1, 1), rand(-0.2, 1.2), rand(-1, 1)).normalize().multiplyScalar(speed * rand(0.4, 1));
      this.vel.set([d.x, d.y, d.z], i * 3);
      c.set(pick(colors)); this.col.set([c.r, c.g, c.b], i * 3);
      this.life[i] = life * rand(0.6, 1);
      this.gravity = gravity;
    }
  }
  update(dt) {
    const g = this.gravity ?? -4;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.pos[i * 3 + 1] = -9999; continue; }
      this.vel[i * 3 + 1] += g * dt;
      for (let k = 0; k < 3; k++) this.pos[i * 3 + k] += this.vel[i * 3 + k] * dt;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
  dispose() { this.points.removeFromParent(); this.geo.dispose(); this.points.material.dispose(); }
}

// Swirly portal surface shader.
export function makePortalMaterial(c1, c2) {
  return new THREE.ShaderMaterial({
    transparent: true, side: THREE.DoubleSide, depthWrite: false,
    uniforms: { t: { value: 0 }, c1: { value: new THREE.Color(c1) }, c2: { value: new THREE.Color(c2) }, locked: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `
      varying vec2 vUv; uniform float t; uniform vec3 c1; uniform vec3 c2; uniform float locked;
      void main(){
        vec2 p = vUv - 0.5; float r = length(p) * 2.0; float a = atan(p.y, p.x);
        float swirl = sin(a * 5.0 + r * 10.0 - t * 3.0) * 0.5 + 0.5;
        float ring = smoothstep(1.0, 0.85, r);
        vec3 col = mix(c1, c2, swirl);
        col += vec3(1.0) * pow(1.0 - r, 3.0) * 0.8;
        vec3 grey = vec3(dot(col, vec3(0.3, 0.5, 0.2))) * 0.6;
        col = mix(col, grey, locked);
        gl_FragColor = vec4(col, ring * mix(0.92, 0.55, locked));
      }`,
  });
}

// Terrain mesh built from a height function so visuals match walking height exactly.
export function makeTerrain(size, segments, heightFn, material, cx = 0, cz = 0) {
  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + cx, z = pos.getZ(i) + cz;
    pos.setXYZ(i, x, heightFn(x, z), z);
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, material);
  m.receiveShadow = true;
  return m;
}

// Confetti burst helper for scoring.
export const CONFETTI = [0xff4d6d, 0xffd23f, 0x3bceac, 0x4d96ff, 0xb15eff, 0xffffff];

// Flat overlays (lines, paths, courts) get pulled toward the camera in the depth test,
// so they never flicker against the ground underneath. Higher layer wins.
export function decal(material, layer = 1) {
  material.polygonOffset = true;
  material.polygonOffsetFactor = -layer;
  material.polygonOffsetUnits = -layer * 4;
  return material;
}
