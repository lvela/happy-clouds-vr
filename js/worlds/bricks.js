// Happy Land: a giant brick world where you build alongside the Master Builders.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeLabel, rand, pick } from '../util.js';
import { makeReturnPortal, spawnBonusMallow, animateAll, celebrate } from './common.js';

const U = 0.8;          // one stud cell
const H = 0.96;         // brick height
const N = 56;           // baseplate is N x N cells
const HALF = N / 2;
const COLORS = [
  ['Red', 0xe3262b], ['Yellow', 0xffcd1f], ['Blue', 0x1e6fd9], ['Green', 0x2ea64a], ['White', 0xf4f4f4],
  ['Orange', 0xff8a1f], ['Purple', 0x8d4bd6], ['Pink', 0xff7ab8], ['Lime', 0xa5d82b], ['Black', 0x2b2b2b], ['Brown', 0x7a4a26], ['Sky', 0x6fd0ff],
];
const C = Object.fromEntries(COLORS.map(([n, c]) => [n.toLowerCase(), c]));

const LINES = [
  'Let\'s build something amazing!', 'Every brick counts!', 'You\'re a natural Master Builder!', 'Try stacking a tower to the sky!',
  'Build first, plan later!', 'What a great idea!', 'Colors make everything better!', 'High five, builder buddy!',
];
const NAMES = ['Brickley', 'Studs McGee', 'Captain Clutch', 'Rosie Ramp', 'Professor Plate'];

function brickGeometry(w, d) {
  const parts = [new THREE.BoxGeometry(w * U - 0.02, H - 0.01, d * U - 0.02)];
  parts[0].translate(0, H / 2, 0);
  for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) {
    const s = new THREE.CylinderGeometry(0.24, 0.24, 0.17, 16);
    s.translate((i - (w - 1) / 2) * U, H + 0.085, (j - (d - 1) / 2) * U);
    parts.push(s);
  }
  // Strip uvs so all parts share attributes.
  parts.forEach((p) => { p.deleteAttribute('uv'); });
  return mergeGeometries(parts);
}

export default class Bricks {
  constructor(game) {
    this.game = game;
    this.hdri = 'kloofendal_43d_clear_puresky';
    this.exposure = 0.9;
    this.sunIntensity = 2.8;
    this.sunColor = 0xfff3dd;
    this.spawn = { pos: new THREE.Vector3(3, 0, 12), yaw: 0 };
    this.radius = HALF * U - 1;
    this.welcome = '🧱 Welcome to Happy Land! Point and pull the trigger / click to build. Jump to climb bricks';
    this.cells = new Map();    // "i,k,j" -> record
    this.colTop = new Map();   // "i,j" -> highest layer + 1
    this.records = { s: [], b: [] };
    this.dropping = [];
    this.queue = [];
    this.colorIndex = 0;
    this.builders = [];
  }

  async build() {
    const g = this.group;
    this.plastic = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0 });

    // Baseplate with real studs.
    const plateMat = new THREE.MeshStandardMaterial({ color: 0x3fae49, roughness: 0.4 });
    const plate = new THREE.Mesh(new THREE.BoxGeometry(N * U, 0.3, N * U), plateMat);
    plate.position.y = -0.15; plate.receiveShadow = true;
    g.add(plate);
    this.plate = plate;
    const studGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.17, 12);
    const studs = new THREE.InstancedMesh(studGeo, plateMat, N * N);
    const m4 = new THREE.Matrix4();
    let n = 0;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      m4.makeTranslation((i - HALF + 0.5) * U, 0.085, (j - HALF + 0.5) * U);
      studs.setMatrixAt(n++, m4);
    }
    studs.receiveShadow = true;
    studs.raycast = () => {}; // aim at the plate underneath instead; testing 3000 studs per frame is slow on a headset
    g.add(studs);

    // Endless studded "water" plate beyond the build area.
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#2f7fe0'; ctx.fillRect(0, 0, 64, 64);
    const grd = ctx.createRadialGradient(28, 28, 2, 32, 32, 16);
    grd.addColorStop(0, '#7fbfff'); grd.addColorStop(1, '#2a72cc');
    ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(32, 32, 15, 0, Math.PI * 2); ctx.fill();
    const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(1000, 1000); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4 }));
    sea.rotation.x = -Math.PI / 2; sea.position.y = -0.4;
    g.add(sea);

    // Brick meshes: 1x1 for scenery voxels, 2x2 for what you place.
    this.meshes = {
      s: new THREE.InstancedMesh(brickGeometry(1, 1), this.plastic, 6000),
      b: new THREE.InstancedMesh(brickGeometry(2, 2), this.plastic, 3000),
    };
    for (const k of ['s', 'b']) {
      const m = this.meshes[k];
      m.count = 0; m.castShadow = true; m.receiveShadow = true;
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(m.instanceMatrix.count * 3), 3);
      m.frustumCulled = false;
      g.add(m);
    }

    this.buildScenery();

    // Interactions: place on the plate or any brick; remove with secondary.
    const place = (hit, p) => this.placeFromHit(hit);
    this.game.interact(plate, { label: () => `Place ${COLORS[this.colorIndex][0]} brick`, distance: 9, onSelect: place });
    for (const k of ['s', 'b']) {
      this.game.interact(this.meshes[k], {
        label: () => `Place brick · ${this.game.isVR ? 'B' : 'right click'} removes`, distance: 9, onSelect: place,
        onSecondary: (hit) => this.removeFromHit(hit, k),
      });
    }

    // Ghost preview of where the brick will land.
    this.ghost = new THREE.Mesh(this.meshes.b.geometry, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false }));
    this.ghost.visible = false;
    g.add(this.ghost);

    this.portal = makeReturnPortal(this, new THREE.Vector3(0, 0, 19), Math.PI);

    // Sign.
    const sign = makeLabel(['🧱 Happy Land', 'Build anything! Ask a Master Builder for help'], { size: 6, font: 64 });
    sign.position.set(0, 5.5, 4);
    g.add(sign);

    this.buildBuilders();
    this.updateColorHud();
  }

  // ---------- voxel bookkeeping ----------
  key(i, k, j) { return `${i},${k},${j}`; }
  cellOf(x) { return Math.floor(x / U); }

  addBrick(type, i, k, j, color, drop = false) {
    const w = type === 'b' ? 2 : 1;
    for (let a = 0; a < w; a++) for (let b = 0; b < w; b++) {
      if (this.cells.has(this.key(i + a, k, j + b))) return null;
      if (Math.abs(i + a + 0.5) > HALF || Math.abs(j + b + 0.5) > HALF) return null;
    }
    const mesh = this.meshes[type];
    if (mesh.count >= mesh.instanceMatrix.count) return null;
    const rec = { type, i, k, j, color, idx: mesh.count, w };
    mesh.count++;
    this.records[type][rec.idx] = rec;
    for (let a = 0; a < w; a++) for (let b = 0; b < w; b++) {
      this.cells.set(this.key(i + a, k, j + b), rec);
      const ck = `${i + a},${j + b}`;
      this.colTop.set(ck, Math.max(this.colTop.get(ck) || 0, k + 1));
    }
    mesh.setColorAt(rec.idx, new THREE.Color(color));
    mesh.instanceColor.needsUpdate = true;
    this.writeMatrix(rec, drop ? 3 : 0);
    // three.js caches the bounds it uses to aim at instances; reset them so new bricks can be pointed at.
    mesh.boundingSphere = null; mesh.boundingBox = null;
    if (drop) this.dropping.push({ rec, t: 0 });
    return rec;
  }

  writeMatrix(rec, lift = 0) {
    const m = new THREE.Matrix4().makeTranslation((rec.i + rec.w / 2) * U, rec.k * H + lift, (rec.j + rec.w / 2) * U);
    const mesh = this.meshes[rec.type];
    mesh.setMatrixAt(rec.idx, m);
    // Upload only this brick, not the whole buffer.
    mesh.instanceMatrix.addUpdateRange(rec.idx * 16, 16);
    mesh.instanceMatrix.needsUpdate = true;
  }

  removeBrick(rec) {
    const mesh = this.meshes[rec.type], list = this.records[rec.type];
    const last = list[mesh.count - 1];
    for (let a = 0; a < rec.w; a++) for (let b = 0; b < rec.w; b++) this.cells.delete(this.key(rec.i + a, rec.k, rec.j + b));
    if (last !== rec) {
      last.idx = rec.idx; list[rec.idx] = last;
      this.writeMatrix(last);
      mesh.setColorAt(last.idx, new THREE.Color(last.color));
      mesh.instanceColor.needsUpdate = true;
    }
    list.length = mesh.count - 1;
    mesh.count--;
    mesh.boundingSphere = null; mesh.boundingBox = null;
    this.dropping = this.dropping.filter((d) => d.rec !== rec);
    for (let a = 0; a < rec.w; a++) for (let b = 0; b < rec.w; b++) {
      const ci = rec.i + a, cj = rec.j + b;
      let top = 0;
      for (let k = 40; k >= 0; k--) if (this.cells.has(this.key(ci, k, cj))) { top = k + 1; break; }
      this.colTop.set(`${ci},${cj}`, top);
    }
  }

  // Where a 2x2 brick would go for a pointer hit.
  targetFromHit(hit) {
    if (!hit) return null;
    const n = hit.face ? hit.face.normal.clone() : new THREE.Vector3(0, 1, 0);
    const p = hit.point.clone();
    let k = 0;
    if (hit.object === this.meshes.s || hit.object === this.meshes.b) {
      const rec = this.records[hit.object === this.meshes.s ? 's' : 'b'][hit.instanceId];
      if (!rec) return null;
      if (n.y > 0.5) k = rec.k + 1;
      else if (n.y < -0.5) k = Math.max(0, rec.k - 1);
      else { k = rec.k; p.addScaledVector(n, U * 0.9); }
    }
    const i = Math.round(p.x / U - 1), j = Math.round(p.z / U - 1);
    // Rise until there is room.
    for (let kk = k; kk < 40; kk++) {
      let free = true;
      for (let a = 0; a < 2 && free; a++) for (let b = 0; b < 2; b++) if (this.cells.has(this.key(i + a, kk, j + b))) { free = false; break; }
      if (free) return { i, j, k: kk };
    }
    return null;
  }

  placeFromHit(hit) {
    const t = this.targetFromHit(hit);
    if (!t) return;
    const rec = this.addBrick('b', t.i, t.k, t.j, COLORS[this.colorIndex][1], true);
    if (!rec) { this.game.toast('No room there!'); return; }
    this.game.audio.click();
    this.placed = (this.placed || 0) + 1;
    if (this.placed % 5 === 0) this.game.addHappiness(1, new THREE.Vector3((t.i + 1) * U, (t.k + 1.5) * H, (t.j + 1) * U));
    if (this.placed === 10) celebrate(this, this.game.camera.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.3, -1)), 5, '🏅 10 bricks! You\'re becoming a Master Builder');
    if (this.placed === 50) celebrate(this, this.game.camera.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.3, -1)), 15, '🏆 50 bricks! True Master Builder!');
    if (t.k >= 9 && !this.towerAward) { this.towerAward = true; celebrate(this, new THREE.Vector3((t.i + 1) * U, (t.k + 1) * H, (t.j + 1) * U), 10, '🗼 Sky-high tower! +10'); }
  }

  removeFromHit(hit, type) {
    const rec = this.records[type][hit.instanceId];
    if (!rec) return;
    this.removeBrick(rec);
    this.game.audio.pop();
    this.game.particles.burst(hit.point, { count: 12, colors: [rec.color], speed: 2 });
  }

  onCycle() {
    this.colorIndex = (this.colorIndex + 1) % COLORS.length;
    this.game.audio.click();
    this.updateColorHud();
  }
  updateColorHud() {
    this.game.setExtraHud(`🧱 ${COLORS[this.colorIndex][0]} (${this.game.isVR ? 'X' : 'R'} = next color)`);
    if (this.ghost) this.ghost.material.color.set(COLORS[this.colorIndex][1]);
  }

  // ---------- scenery ----------
  fill(i0, k0, j0, w, h, d, color, hollow = false) {
    for (let i = 0; i < w; i++) for (let k = 0; k < h; k++) for (let j = 0; j < d; j++) {
      if (hollow && i > 0 && i < w - 1 && j > 0 && j < d - 1) continue;
      this.addBrick('s', i0 + i, k0 + k, j0 + j, typeof color === 'function' ? color(i, k, j) : color);
    }
  }

  house(i0, j0, w, d, wall, roof, doorSide = 'z') {
    const h = 5;
    for (let k = 0; k < h; k++) for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) {
      const edge = i === 0 || i === w - 1 || j === 0 || j === d - 1;
      if (!edge) continue;
      const mid = doorSide === 'z' ? (j === d - 1 && Math.abs(i - (w - 1) / 2) < 1) : (i === 0 && Math.abs(j - (d - 1) / 2) < 1);
      if (mid && k < 3) continue; // door
      const win = k >= 2 && k <= 3 && ((i === 0 || i === w - 1) ? j % 3 === 1 : i % 3 === 1);
      this.addBrick('s', i0 + i, k, j0 + j, win ? C.sky : wall);
    }
    // Stepped roof.
    for (let s = 0; s < Math.ceil(Math.min(w, d) / 2) + 1; s++) {
      const ww = w + 2 - s * 2, dd = d + 2 - s * 2;
      if (ww <= 0 || dd <= 0) break;
      this.fill(i0 - 1 + s, h + s, j0 - 1 + s, ww, 1, dd, roof, true);
    }
    return { x: (i0 + w / 2) * U, z: (j0 + d / 2) * U, top: (h + Math.ceil(Math.min(w, d) / 2) + 1) * H };
  }

  tree(i0, j0) {
    this.fill(i0, 0, j0, 1, 4, 1, C.brown);
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) for (let k = 3; k <= 6; k++) {
      const r = Math.hypot(i, j, (k - 4.5) * 1.2);
      if (r < 2.6 && Math.random() > 0.08) this.addBrick('s', i0 + i, k, j0 + j, Math.random() < 0.15 ? C.lime : C.green);
    }
  }

  buildScenery() {
    const houses = [
      this.house(-20, -22, 8, 7, C.white, C.red),
      this.house(-8, -24, 7, 7, C.yellow, C.blue),
      this.house(6, -23, 9, 7, C.pink, C.purple),
      this.house(16, -10, 7, 8, C.orange, C.green, 'x'),
    ];
    // Striped lighthouse tower.
    for (let k = 0; k < 14; k++) {
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
        if (Math.abs(i) + Math.abs(j) === 2 && k < 13) continue;
        this.addBrick('s', -22 + i, k, 10 + j, k % 2 ? C.red : C.white);
      }
    }
    // Climbable staircase to a lookout.
    for (let s = 0; s < 8; s++) this.fill(-14 + s, 0, 16, 1, s + 1, 3, s % 2 ? C.yellow : C.orange);
    this.fill(-6, 0, 15, 4, 8, 5, C.blue);
    [[-24, -6], [22, 8], [12, 18], [-2, -12], [20, -24], [-25, 22]].forEach(([i, j]) => this.tree(i, j));
    // Flower beds.
    for (let f = 0; f < 30; f++) {
      const i = Math.floor(rand(-26, 26)), j = Math.floor(rand(-6, 26));
      if (Math.abs(i) < 3 && j > 12) continue;
      this.addBrick('s', i, 0, j, pick([C.red, C.yellow, C.pink, C.white, C.purple, C.orange]));
    }
    // Community build: a growing rainbow tower the Master Builders work on.
    this.community = { i: 8, j: 6, k: 0, step: 0 };

    // Decorative rainbow arch (not walkable).
    const rainbow = new THREE.Group();
    [C.red, C.orange, C.yellow, C.green, C.blue, C.purple].forEach((c, i) => {
      const m = new THREE.Mesh(new THREE.TorusGeometry(9 - i * 0.6, 0.3, 8, 40, Math.PI), new THREE.MeshStandardMaterial({ color: c, roughness: 0.3 }));
      rainbow.add(m);
    });
    rainbow.position.set(0, 0, -8);
    this.group.add(rainbow);

    // Golden marshmallows on rooftops and up high.
    houses.forEach((h) => spawnBonusMallow(this, new THREE.Vector3(h.x, h.top + 0.9, h.z), { golden: true }));
    spawnBonusMallow(this, new THREE.Vector3(-22 * U + U / 2, 14 * H + 1, 10 * U + U / 2), { golden: true });
    spawnBonusMallow(this, new THREE.Vector3(-4 * U, 8 * H + 1, 17.5 * U), { golden: true });
    for (let i = 0; i < 6; i++) spawnBonusMallow(this, new THREE.Vector3(rand(-18, 18), 1.3, rand(-4, 16)), { respawn: 20000 });
  }

  // ---------- Master Builders ----------
  makeBuilder(colors) {
    const g = new THREE.Group();
    const mat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.3 });
    const skin = mat(0xffd21f);
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.5, 0.26), mat(colors.legs)); legL.geometry.translate(0, -0.25, 0); legL.position.set(-0.12, 0.55, 0);
    const legR = legL.clone(); legR.position.x = 0.12;
    const hips = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.1, 0.26), mat(colors.legs)); hips.position.y = 0.6;
    const torsoGeo = new THREE.CylinderGeometry(0.2, 0.28, 0.5, 4, 1); torsoGeo.rotateY(Math.PI / 4); torsoGeo.scale(1.1, 1, 0.6);
    const torso = new THREE.Mesh(torsoGeo, mat(colors.body)); torso.position.y = 0.9;
    const armGeo = new THREE.CylinderGeometry(0.06, 0.07, 0.42, 10); armGeo.translate(0, -0.2, 0);
    const armL = new THREE.Mesh(armGeo, mat(colors.body)); armL.position.set(-0.3, 1.1, 0); armL.rotation.z = -0.25;
    const armR = armL.clone(); armR.position.x = 0.3; armR.rotation.z = 0.25;
    const handGeo = new THREE.TorusGeometry(0.06, 0.03, 8, 12, Math.PI * 1.5);
    const handL = new THREE.Mesh(handGeo, skin); handL.position.y = -0.45; handL.rotation.x = Math.PI / 2; armL.add(handL);
    const handR = handL.clone(); armR.add(handR);
    // Head with a painted smile.
    const fc = document.createElement('canvas'); fc.width = 256; fc.height = 128;
    const f = fc.getContext('2d');
    f.fillStyle = '#ffd21f'; f.fillRect(0, 0, 256, 128);
    f.fillStyle = '#222'; f.beginPath(); f.arc(108, 50, 9, 0, 7); f.arc(148, 50, 9, 0, 7); f.fill();
    f.strokeStyle = '#222'; f.lineWidth = 6; f.beginPath(); f.arc(128, 62, 26, 0.2 * Math.PI, 0.8 * Math.PI); f.stroke();
    const ft = new THREE.CanvasTexture(fc); ft.colorSpace = THREE.SRGBColorSpace; ft.offset.x = 0.25;
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.3, 24), [new THREE.MeshStandardMaterial({ map: ft, roughness: 0.3 }), skin, skin]);
    head.position.y = 1.32;
    const stud = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.08, 16), skin); stud.position.y = 0.19; head.add(stud);
    // Hair, cap or hard hat.
    let hat;
    if (colors.hat === 'hardhat') { hat = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xffb000)); hat.position.y = 0.1; }
    else if (colors.hat === 'cap') { hat = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.1, 20), mat(colors.hatColor)); hat.position.y = 0.17; const brim = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.02, 0.15), mat(colors.hatColor)); brim.position.set(0, -0.04, 0.17); hat.add(brim); }
    else { hat = new THREE.Mesh(new THREE.SphereGeometry(0.18, 20, 10, 0, Math.PI * 2, 0, Math.PI / 1.8), mat(colors.hatColor)); hat.position.y = 0.06; }
    head.add(hat);
    g.add(legL, legR, hips, torso, armL, armR, head);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    g.scale.setScalar(1.15);
    return { g, legL, legR, armL, armR, head };
  }

  buildBuilders() {
    const outfits = [
      { body: C.orange, legs: C.blue, hat: 'hardhat' },
      { body: C.red, legs: 0x333333, hat: 'hair', hatColor: 0x5a3b1f },
      { body: C.green, legs: C.brown, hat: 'cap', hatColor: C.blue },
      { body: C.purple, legs: C.white, hat: 'hair', hatColor: 0xff9ad5 },
      { body: C.sky, legs: C.yellow, hat: 'cap', hatColor: C.red },
    ];
    outfits.forEach((o, n) => {
      const b = this.makeBuilder(o);
      const pos = new THREE.Vector3(rand(-12, 12), 0, rand(-6, 12));
      b.g.position.copy(pos);
      b.name = NAMES[n];
      b.target = pos.clone();
      b.state = 'walk';
      b.timer = rand(2, 6);
      b.bubble = makeLabel([b.name, pick(LINES)], { size: 2.4, font: 56 });
      b.bubble.position.y = 2.15; b.bubble.visible = false;
      b.g.add(b.bubble);
      this.group.add(b.g);
      this.builders.push(b);
      this.game.interact(b.g, {
        label: `Ask ${b.name} to build something`, distance: 6,
        onSelect: () => this.askBuilder(b),
      });
    });
  }

  say(b, text, secs = 3) {
    b.bubble.userData.draw([b.name, text]);
    b.bubble.visible = true;
    b.sayT = secs;
  }

  askBuilder(b) {
    const now = this.game.time;
    if (b.lastAsk && now - b.lastAsk < 6) { this.say(b, 'Give me a sec, still building!'); return; }
    b.lastAsk = now;
    const what = pick(Object.keys(BLUEPRINTS));
    this.say(b, `Watch this, I'll build a ${what}!`, 4);
    this.game.audio.happy();
    // Build it near the player, in front of them.
    const yaw = this.game.headYaw();
    const fx = this.game.player.feet.x - Math.sin(yaw) * 5, fz = this.game.player.feet.z - Math.cos(yaw) * 5;
    this.queueBlueprint(what, this.cellOf(fx), this.cellOf(fz), () => {
      celebrate(this, new THREE.Vector3(fx, 2, fz), 3, `✨ ${b.name} built a ${what}!`);
    });
    b.state = 'build'; b.timer = 4;
    b.target.set(fx + 1.2, 0, fz + 1.2);
  }

  queueBlueprint(name, i0, j0, done) {
    const bp = BLUEPRINTS[name];
    // Sit on top of whatever is already there.
    let base = 0;
    for (const [di, , dj] of bp) base = Math.max(base, this.colTop.get(`${i0 + di},${j0 + dj}`) || 0);
    bp.forEach(([di, dk, dj, col], n) => this.queue.push({ at: this.game.time + n * 0.07, i: i0 + di, k: base + dk, j: j0 + dj, col, done: n === bp.length - 1 ? done : null }));
  }

  getGround(x, z) {
    const i = this.cellOf(x), j = this.cellOf(z);
    if (Math.abs(i + 0.5) > HALF || Math.abs(j + 0.5) > HALF) return -0.4;
    return (this.colTop.get(`${i},${j}`) || 0) * H;
  }

  update(dt, t) {
    this.portal.update(t);
    animateAll(this, t);

    // Bricks dropping into place.
    this.dropping = this.dropping.filter((d) => {
      d.t += dt * 4;
      const k = Math.min(1, d.t);
      this.writeMatrix(d.rec, (1 - k * k) * 3);
      if (k >= 1) { this.meshes[d.rec.type].boundingSphere = null; this.game.audio.tone(1200 + Math.random() * 400, { dur: 0.04, type: 'square', vol: 0.05 }); return false; }
      return true;
    });
    // Queued master-builds.
    while (this.queue.length && this.queue[0].at <= t) {
      const q = this.queue.shift();
      this.addBrick('s', q.i, q.k, q.j, q.col, true);
      q.done?.();
    }

    // Ghost preview.
    const ptr = this.game.isVR ? this.game.pointers.find((p) => p.hand === 'right' && p.source) || this.game.pointers.find((p) => p.source) : this.game.desktopPointer;
    const hov = ptr?.hover;
    const target = hov?.kind === 'use' && (hov.obj === this.plate || hov.obj.isInstancedMesh) ? this.targetFromHit(hov.hit) : null;
    this.ghost.visible = !!target;
    if (target) this.ghost.position.set((target.i + 1) * U, target.k * H + 0.01, (target.j + 1) * U);

    // Community tower grows slowly.
    this.commT = (this.commT || 0) + dt;
    if (this.commT > 1.2 && this.community.k < 22) {
      this.commT = 0;
      const c = this.community;
      const ring = [[0, 0], [1, 0], [1, 1], [0, 1]];
      const [a, b] = ring[c.step % 4];
      const col = [C.red, C.orange, C.yellow, C.green, C.blue, C.purple][c.k % 6];
      if (this.addBrick('s', c.i + a, c.k, c.j + b, col, true)) { /* placed */ }
      c.step++;
      if (c.step % 4 === 0) c.k++;
    }

    // Builders wander, chat and help.
    const feet = this.game.player.feet;
    for (const b of this.builders) {
      const p = b.g.position;
      b.timer -= dt;
      if (b.sayT !== undefined) { b.sayT -= dt; if (b.sayT <= 0) { b.bubble.visible = false; b.sayT = undefined; } }
      const toPlayer = Math.hypot(feet.x - p.x, feet.z - p.z);
      if (toPlayer < 3.5 && !b.bubble.visible && (!b.greetT || t - b.greetT > 12)) { b.greetT = t; this.say(b, pick(LINES)); }
      const to = b.target.clone().sub(p); to.y = 0;
      const dist = to.length();
      let walking = false;
      if (b.state === 'walk' && dist > 0.3) {
        to.normalize();
        const nx = p.x + to.x * dt * 1.3, nz = p.z + to.z * dt * 1.3;
        if (this.getGround(nx, nz) - p.y > 1.0) { b.target.set(rand(-14, 14), 0, rand(-8, 14)); }
        else { p.x = nx; p.z = nz; walking = true; }
        b.g.rotation.y = Math.atan2(to.x, to.z);
      } else if (b.timer <= 0) {
        b.state = 'walk';
        b.target.set(rand(-14, 14), 0, rand(-8, 14));
        b.timer = rand(5, 10);
      }
      if (b.state === 'walk' && dist <= 0.3 && b.timer > 0 && Math.random() < dt * 0.15) {
        // Spontaneous little build.
        b.state = 'build'; b.timer = 3;
        const what = pick(['flower', 'flower', 'duck', 'heart']);
        this.queueBlueprint(what, this.cellOf(p.x + Math.sin(b.g.rotation.y) * 1.6), this.cellOf(p.z + Math.cos(b.g.rotation.y) * 1.6));
      }
      if (b.state === 'build' && b.timer <= 0) b.state = 'walk';
      p.y += (this.getGround(p.x, p.z) - p.y) * Math.min(1, dt * 10);
      const swing = walking ? Math.sin(t * 8 + b.name.length) * 0.6 : 0;
      b.legL.rotation.x = swing; b.legR.rotation.x = -swing;
      b.armL.rotation.x = -swing * 0.8;
      b.armR.rotation.x = b.state === 'build' ? -1.2 + Math.sin(t * 14) * 0.5 : swing * 0.8;
      if (b.bubble.visible && toPlayer < 4) b.armL.rotation.z = -0.25 - Math.abs(Math.sin(t * 6)) * 0.8; // wave
      else b.armL.rotation.z = -0.25;
    }
  }

  dispose() { this.game.setExtraHud(''); }
}

// Little creations, as [di, dk, dj, color] 1x1 bricks.
const BLUEPRINTS = {
  flower: [[0, 0, 0, C.green], [0, 1, 0, C.green], [0, 2, 0, C.yellow], [1, 2, 0, C.pink], [-1, 2, 0, C.pink], [0, 2, 1, C.pink], [0, 2, -1, C.pink], [0, 3, 0, C.pink]],
  car: (() => {
    const b = [];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) b.push([i, 1, j, C.red]);
    [[0, 0, -1], [3, 0, -1], [0, 0, 2], [3, 0, 2]].forEach(([i, k, j]) => b.push([i, k, j, 0x222222]));
    for (let j = 0; j < 2; j++) { b.push([1, 2, j, C.sky]); b.push([2, 2, j, C.red]); b.push([1, 3, j, C.red]); b.push([2, 3, j, C.red]); }
    b.push([3, 2, 0, C.yellow], [3, 2, 1, C.yellow]);
    return b;
  })(),
  rocket: (() => {
    const b = [];
    for (let k = 0; k < 6; k++) b.push([0, k + 1, 0, k === 3 ? C.sky : C.white]);
    b.push([0, 7, 0, C.red], [0, 8, 0, C.red], [1, 0, 0, C.red], [-1, 0, 0, C.red], [0, 0, 1, C.red], [0, 0, -1, C.red], [1, 1, 0, C.orange], [-1, 1, 0, C.orange], [0, 0, 0, C.orange]);
    return b;
  })(),
  heart: (() => {
    const rows = ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'];
    const b = [];
    rows.forEach((r, n) => [...r].forEach((ch, i) => { if (ch === 'X') b.push([i - 3, rows.length - 1 - n, 0, C.red]); }));
    return b.sort((a, c) => a[1] - c[1]);
  })(),
  duck: [[0, 0, 0, C.yellow], [1, 0, 0, C.yellow], [-1, 0, 0, C.yellow], [0, 0, 1, C.yellow], [0, 0, -1, C.yellow], [1, 1, 0, C.yellow], [0, 1, 0, C.yellow], [1, 2, 0, C.yellow], [2, 2, 0, C.orange], [-1, 1, 0, C.yellow]],
  castle: (() => {
    const b = [];
    for (let k = 0; k < 4; k++) for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
      if (i > 0 && i < 4 && j > 0 && j < 4) continue;
      if (k === 3 && (i + j) % 2) continue;
      if (k < 2 && j === 0 && i === 2) continue;
      b.push([i - 2, k, j - 2, 0xb0b0b0]);
    }
    b.push([2, 4, 2, C.blue], [-2, 4, -2, C.blue], [2, 4, -2, C.blue], [-2, 4, 2, C.blue]);
    return b.sort((a, c) => a[1] - c[1]);
  })(),
};
