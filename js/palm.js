// Lightweight palm trees built in code (~1k triangles each, versus ~1M for the scanned model).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

let barkMat = null, leafMat = null, nutMat = null;
const variants = [];

function materials() {
  if (barkMat) return;
  // Bark with ring segments.
  const c = document.createElement('canvas'); c.width = 64; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#8a6a48'; g.fillRect(0, 0, 64, 256);
  for (let y = 0; y < 256; y += 16) {
    g.fillStyle = '#5e4630'; g.fillRect(0, y, 64, 4);
    g.fillStyle = '#a3825d'; g.fillRect(0, y + 5, 64, 3);
    for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(40,25,10,${Math.random() * 0.3})`; g.fillRect(Math.random() * 64, y + Math.random() * 16, 3, 1); }
  }
  const bark = new THREE.CanvasTexture(c);
  bark.wrapS = bark.wrapT = THREE.RepeatWrapping; bark.colorSpace = THREE.SRGBColorSpace;
  barkMat = new THREE.MeshStandardMaterial({ map: bark, roughness: 0.95 });

  // Frond: a midrib with many leaflets, drawn with transparency.
  const lc = document.createElement('canvas'); lc.width = 128; lc.height = 512;
  const l = lc.getContext('2d');
  l.lineCap = 'round';
  for (let i = 0; i < 46; i++) {
    const y = 20 + i * 10.5, t = i / 46;
    const len = 58 * Math.sin(Math.PI * (0.15 + t * 0.85)) + 6;
    for (const side of [-1, 1]) {
      l.strokeStyle = `hsl(${95 + Math.random() * 25}, ${45 + Math.random() * 15}%, ${26 + Math.random() * 12}%)`;
      l.lineWidth = 5 - t * 2;
      l.beginPath(); l.moveTo(64, y); l.quadraticCurveTo(64 + side * len * 0.5, y + 6, 64 + side * len, y + 22); l.stroke();
    }
  }
  l.strokeStyle = '#6b7f35'; l.lineWidth = 5; l.beginPath(); l.moveTo(64, 0); l.lineTo(64, 512); l.stroke();
  const leaf = new THREE.CanvasTexture(lc); leaf.colorSpace = THREE.SRGBColorSpace;
  leafMat = new THREE.MeshStandardMaterial({ map: leaf, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8 });
  nutMat = new THREE.MeshStandardMaterial({ color: 0x5a3d1e, roughness: 0.7 });
}

function buildVariant(seed) {
  const rnd = (() => { let s = seed * 9301 + 49297; return () => ((s = (s * 9301 + 49297) % 233280) / 233280); })();
  const height = 6 + rnd() * 3, lean = 0.6 + rnd() * 1.4;
  const pts = [];
  for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push(new THREE.Vector3(lean * t * t, height * t, 0)); }
  const curve = new THREE.CatmullRomCurve3(pts);
  const trunk = new THREE.TubeGeometry(curve, 14, 0.2, 8, false);
  // Taper toward the top.
  const p = trunk.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = p.getY(i) / height;
    const c = curve.getPoint(Math.min(1, Math.max(0, t)));
    const k = 1.25 - t * 0.5;
    p.setX(i, c.x + (p.getX(i) - c.x) * k); p.setZ(i, c.z + (p.getZ(i) - c.z) * k);
  }
  const uv = trunk.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i), uv.getX(i) * 6); // rings run around the trunk

  const top = curve.getPoint(1);
  const fronds = [];
  const count = 9 + Math.floor(rnd() * 4);
  for (let f = 0; f < count; f++) {
    const len = 2.8 + rnd() * 1.2, segs = 8;
    const geo = new THREE.PlaneGeometry(1.1, len, 1, segs);
    geo.translate(0, len / 2, 0);
    const droop = 0.9 + rnd() * 0.6;
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i), t = y / len;
      // Arch up, then droop down along the frond.
      pos.setZ(i, Math.sin(t * Math.PI * 0.5) * 0.2 - pos.getX(i) * pos.getX(i) * 0.25);
      pos.setY(i, y * Math.cos(t * droop) );
      pos.setZ(i, pos.getZ(i) - y * Math.sin(t * droop) * 0.9);
    }
    geo.rotateX(-Math.PI / 2 + 0.5);
    geo.rotateY((f / count) * Math.PI * 2 + rnd() * 0.3);
    geo.translate(top.x, top.y, top.z);
    fronds.push(geo);
  }
  const leaves = mergeGeometries(fronds.map((g) => { g.computeVertexNormals(); return g; }));
  const nuts = [];
  for (let i = 0; i < 4; i++) {
    const s = new THREE.SphereGeometry(0.14, 8, 6);
    const a = (i / 4) * Math.PI * 2;
    s.translate(top.x + Math.cos(a) * 0.22, top.y - 0.2, top.z + Math.sin(a) * 0.22);
    nuts.push(s);
  }
  return { trunk, leaves, nuts: mergeGeometries(nuts) };
}

export function makePalm(seed = Math.floor(Math.random() * 1000)) {
  materials();
  if (!variants.length) for (let i = 0; i < 5; i++) variants.push(buildVariant(i + 1));
  const v = variants[seed % variants.length];
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(v.trunk, barkMat);
  const leaves = new THREE.Mesh(v.leaves, leafMat);
  const nuts = new THREE.Mesh(v.nuts, nutMat);
  trunk.castShadow = leaves.castShadow = true;
  trunk.receiveShadow = leaves.receiveShadow = true;
  [trunk, leaves, nuts].forEach((m) => { m.userData.shared = true; g.add(m); });
  return g;
}
