// Asset loading with caching. All assets live in /assets and are CC0 (see assets/CREDITS.md).
import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const hdrLoader = new RGBELoader();
const gltfLoader = new GLTFLoader();
const texLoader = new THREE.TextureLoader();

const hdrCache = new Map();
const gltfCache = new Map();
const texCache = new Map();

let pmrem = null;
export function initAssets(renderer) {
  pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
}

// Finds the brightest pixel of an equirect HDR and returns it as a world direction (the sun).
function findSunDirection(tex) {
  const { data, width, height } = tex.image;
  const isHalf = data instanceof Uint16Array;
  const f = isHalf ? THREE.DataUtils.fromHalfFloat : (v) => v;
  let best = -1, bx = 0, by = 0;
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const i = (y * width + x) * 4;
      const l = f(data[i]) * 0.2126 + f(data[i + 1]) * 0.7152 + f(data[i + 2]) * 0.0722;
      if (l > best) { best = l; bx = x; by = y; }
    }
  }
  const u = (bx + 0.5) / width;
  const v = 1 - (by + 0.5) / height;
  const lat = (v - 0.5) * Math.PI;
  const lon = (u - 0.5) * Math.PI * 2;
  const dir = new THREE.Vector3(Math.cos(lon) * Math.cos(lat), Math.sin(lat), Math.sin(lon) * Math.cos(lat));
  if (dir.y < 0) dir.y = -dir.y;
  dir.y = Math.max(dir.y, 0.12);
  return dir.normalize();
}

export function loadHDRI(name) {
  if (!hdrCache.has(name)) {
    hdrCache.set(name, hdrLoader.loadAsync(`assets/hdri/${name}.hdr`).then((tex) => {
      tex.mapping = THREE.EquirectangularReflectionMapping;
      const sun = findSunDirection(tex);
      const env = pmrem.fromEquirectangular(tex).texture;
      return { background: tex, env, sun };
    }));
  }
  return hdrCache.get(name);
}

export function releaseHDRI(name) {
  const p = hdrCache.get(name);
  if (!p) return;
  hdrCache.delete(name);
  p.then(({ background, env }) => { background.dispose(); env.dispose(); });
}

export function loadModel(name) {
  if (!gltfCache.has(name)) {
    gltfCache.set(name, gltfLoader.loadAsync(`assets/models/${name}.gltf`).then((g) => {
      g.scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.userData.cached = true; } });
      return g.scene;
    }));
  }
  // Clones share geometry and materials, so many copies are cheap.
  return gltfCache.get(name).then((s) => s.clone(true));
}

export function loadTexture(file, repeat = 1, srgb = true) {
  const key = `${file}|${repeat}`;
  if (!texCache.has(key)) {
    const t = texLoader.load(`assets/textures/${file}`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    texCache.set(key, t);
  }
  return texCache.get(key);
}

// Texture set (diffuse + normal) as a standard material.
export function texturedMaterial(name, repeat, extra = {}) {
  return new THREE.MeshStandardMaterial({
    map: loadTexture(`${name}_diff.jpg`, repeat),
    normalMap: loadTexture(`${name}_nor.jpg`, repeat, false),
    roughness: 0.95,
    ...extra,
  });
}

// Scale a model so its largest dimension equals `size`, and sit it on y = 0.
export function fitModel(obj, size, axis = 'max') {
  const box = new THREE.Box3().setFromObject(obj);
  const dims = box.getSize(new THREE.Vector3());
  const ref = axis === 'y' ? dims.y : Math.max(dims.x, dims.y, dims.z);
  const s = size / ref;
  obj.scale.multiplyScalar(s);
  const wrap = new THREE.Group();
  obj.position.y -= box.min.y * s;
  const c = box.getCenter(new THREE.Vector3()).multiplyScalar(s);
  obj.position.x -= c.x; obj.position.z -= c.z;
  wrap.add(obj);
  return wrap;
}
