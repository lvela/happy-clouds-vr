// Outdoor Play Park: ride bikes, hoverboards, skateboards and skates; play soccer, basketball and more.
import * as THREE from 'three';
import { loadModel, fitModel, texturedMaterial } from '../assets.js';
import { makeTerrain, makeLabel, rand, fbm, decal } from '../util.js';
import { makePalm } from '../palm.js';
import { makeReturnPortal, spawnBonusMallow, animateAll, celebrate } from './common.js';

const SK = { x: -16, z: -6, half: 11 };          // skatepark
const SOCCER = { x: 14, z: -8, hx: 11, hz: 7 };   // soccer pitch
const HOOP = new THREE.Vector3(16, 2.7, 14);
const UPRIGHTS = { x: 0, z: -28, bar: 3, half: 2.8 };
const TARGET = new THREE.Vector3(-14, 1.8, 18);
const RING_R = [36, 39.5];

function grassHeight(x, z) {
  // Perfectly flat where the courts, skate park and bike loop sit, so nothing pokes through
  // them (that flicker is very noticeable in VR). Rolling hills start beyond the bike loop.
  const r = Math.hypot(x, z);
  if (r <= 42) return 0;
  const k = Math.min((r - 42) / 10, 1);
  return k * (Math.min((r - 42) * 0.15, 3) + (fbm(x * 0.012, z * 0.012, 3) - 0.3) * Math.min((r - 42) * 0.3, 14));
}

// Skatepark height in its local coordinates.
function skateHeight(lx, lz) {
  let h = 0;
  const qp = (d) => { d = Math.min(Math.max(d, 0), 2.85); return 3 - Math.sqrt(9 - d * d); };
  if (lx > 7.5) h = Math.max(h, qp(lx - 7.5));
  if (lx < -7.5) h = Math.max(h, qp(-7.5 - lx));
  // Fun box with sloped sides.
  const fb = Math.min(0.9, (4 - Math.abs(lx)) * 0.45, (2.5 - Math.abs(lz)) * 0.45);
  if (fb > 0) h = Math.max(h, fb);
  // Kicker ramp.
  if (lz > 5 && lz < 8 && Math.abs(lx) < 2) h = Math.max(h, (lz - 5) * 0.35);
  // Little mini-ramp on the other side.
  if (lz < -5.5 && lz > -9 && Math.abs(lx) < 3) h = Math.max(h, 0.6 - Math.abs(lz + 7.25) * 0.34);
  return h;
}

export default class Park {
  constructor(game) {
    this.game = game;
    this.hdri = 'kloppenheim_06_puresky';
    this.exposure = 0.95;
    this.sunIntensity = 3;
    this.sunColor = 0xfff1d6;
    this.sunYaw = -Math.PI * 0.75;
    this.spawn = { pos: new THREE.Vector3(0, 0, 8), yaw: 0 };
    this.radius = 52;
    this.fog = new THREE.Fog(0xcfdfea, 70, 260);
    this.welcome = '🛹 Outdoor Play Park! Grab a ride from the rack, or go play some sports';
    this.rides = [];
    this.balls = [];
    this.colliders = [];
    this.rideDist = 0;
    this.air = 0;
  }

  getGround(x, z) {
    let h = grassHeight(x, z);
    const lx = x - SK.x, lz = z - SK.z;
    if (Math.abs(lx) < SK.half && Math.abs(lz) < SK.half) h = Math.max(h, skateHeight(lx, lz) + 0.03);
    return h;
  }

  async build() {
    const g = this.group;
    const grass = texturedMaterial('grass_path_2', 220, { color: 0xc8e6a0 });
    g.add(makeTerrain(520, 180, grassHeight, grass));

    // Skatepark.
    const concrete = decal(texturedMaterial('asphalt_02', 6, { color: 0xd8d4cc, roughness: 0.8 }), 1);
    const sk = makeTerrain(SK.half * 2, 110, (x, z) => skateHeight(x - SK.x, z - SK.z) + 0.03, concrete, SK.x, SK.z);
    g.add(sk);
    // Rails on the quarter-pipe decks.
    const metal = new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.9, roughness: 0.25 });
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, SK.half * 2, 8), metal);
      rail.rotation.x = Math.PI / 2;
      rail.position.set(SK.x + side * 10.37, skateHeight(side * 10.37, 0) + 0.06, SK.z);
      g.add(rail);
    }
    const skSign = makeLabel(['🛹 Skate Park', 'Ride up the ramps for big air!'], { size: 4.5, font: 60 });
    skSign.position.set(SK.x, 4.5, SK.z + SK.half);
    g.add(skSign);

    // Bike path loop.
    const asphalt = texturedMaterial('asphalt_02', 1, { color: 0x9a9a9a });
    const ringGeo = new THREE.RingGeometry(RING_R[0], RING_R[1], 160, 3);
    ringGeo.rotateX(-Math.PI / 2);
    const rp = ringGeo.attributes.position, uv = ringGeo.attributes.uv;
    for (let i = 0; i < rp.count; i++) {
      const x = rp.getX(i), z = rp.getZ(i);
      rp.setY(i, grassHeight(x, z) + 0.04);
      uv.setXY(i, Math.atan2(z, x) * 30, Math.hypot(x, z) * 0.3);
    }
    ringGeo.computeVertexNormals();
    const ring = new THREE.Mesh(ringGeo, decal(asphalt, 1)); ring.receiveShadow = true;
    g.add(ring);
    // Dashed center line.
    const dash = decal(new THREE.MeshBasicMaterial({ color: 0xfff3a0 }), 3);
    for (let i = 0; i < 80; i++) {
      const a = (i / 80) * Math.PI * 2, r = (RING_R[0] + RING_R[1]) / 2;
      const d = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 1.2), dash);
      d.rotation.set(-Math.PI / 2, 0, -a);
      d.position.set(Math.cos(a) * r, grassHeight(Math.cos(a) * r, Math.sin(a) * r) + 0.06, Math.sin(a) * r);
      g.add(d);
    }

    await Promise.all([this.buildSoccer(), this.buildHoop(), this.buildUprights(), this.buildTarget(), this.buildDecor()]);
    this.buildRides();
    this.portal = makeReturnPortal(this, new THREE.Vector3(0, grassHeight(0, 13), 13), Math.PI);

    // Marshmallows: on the decks, above the kicker, around the bike loop.
    spawnBonusMallow(this, new THREE.Vector3(SK.x + 10.5, 3.4, SK.z - 4), { golden: true, respawn: 30000 });
    spawnBonusMallow(this, new THREE.Vector3(SK.x - 10.5, 3.4, SK.z + 4), { golden: true, respawn: 30000 });
    spawnBonusMallow(this, new THREE.Vector3(SK.x, 3.2, SK.z + 9.5), { golden: true, respawn: 20000 });
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2, r = (RING_R[0] + RING_R[1]) / 2;
      spawnBonusMallow(this, new THREE.Vector3(Math.cos(a) * r, grassHeight(Math.cos(a) * r, Math.sin(a) * r) + 1.3, Math.sin(a) * r), { respawn: 25000 });
    }
  }

  addBall(mesh, radius, opts = {}) {
    mesh.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.group.add(mesh);
    const b = this.game.physics.add(mesh, { radius, ...opts });
    b.home = mesh.position.clone();
    this.balls.push(b);
    return b;
  }

  async buildSoccer() {
    const g = this.group;
    const { x, z, hx, hz } = SOCCER;
    const line = decal(new THREE.MeshBasicMaterial({ color: 0xffffff }), 3);
    const strip = (w, d, px, pz) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), line); m.rotation.x = -Math.PI / 2; m.position.set(px, grassHeight(px, pz) + 0.05, pz); g.add(m); };
    strip(hx * 2, 0.1, x, z - hz); strip(hx * 2, 0.1, x, z + hz); strip(0.1, hz * 2, x - hx, z); strip(0.1, hz * 2, x + hx, z); strip(0.1, hz * 2, x, z);
    const circle = new THREE.Mesh(new THREE.RingGeometry(1.95, 2.05, 48), line); circle.rotation.x = -Math.PI / 2; circle.position.set(x, grassHeight(x, z) + 0.05, z); g.add(circle);
    const post = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
    const net = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, side: THREE.DoubleSide, wireframe: true });
    this.goals = [];
    for (const side of [-1, 1]) {
      const gx = x + side * hx, gy = grassHeight(gx, z);
      const grp = new THREE.Group(); grp.position.set(gx, gy, z);
      const mk = (geo, px, py, pz, rx = 0, rz = 0) => { const m = new THREE.Mesh(geo, post); m.position.set(px, py, pz); m.rotation.set(rx, 0, rz); m.castShadow = true; grp.add(m); };
      mk(new THREE.CylinderGeometry(0.06, 0.06, 2), 0, 1, -2); mk(new THREE.CylinderGeometry(0.06, 0.06, 2), 0, 1, 2);
      mk(new THREE.CylinderGeometry(0.06, 0.06, 4.1), 0, 2, 0, Math.PI / 2);
      const n = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2, 4, 6, 10, 20), net); n.position.set(side * 0.6, 1, 0); grp.add(n);
      g.add(grp);
      this.goals.push({ x: gx, z, side, y: gy });
      // Back and side of the net stop the ball.
      this.colliders.push({ min: new THREE.Vector3(Math.min(gx, gx + side * 1.3), gy, z - 2.1), max: new THREE.Vector3(Math.max(gx, gx + side * 1.3), gy + 2, z - 2) });
      this.colliders.push({ min: new THREE.Vector3(Math.min(gx, gx + side * 1.3), gy, z + 2), max: new THREE.Vector3(Math.max(gx, gx + side * 1.3), gy + 2, z + 2.1) });
      this.colliders.push({ min: new THREE.Vector3(gx + side * 1.2 - 0.05, gy, z - 2), max: new THREE.Vector3(gx + side * 1.2 + 0.05, gy + 2, z + 2) });
      this.colliders.push({ min: new THREE.Vector3(Math.min(gx, gx + side * 1.2), gy + 2, z - 2), max: new THREE.Vector3(Math.max(gx, gx + side * 1.2), gy + 2.1, z + 2) });
    }
    const sign = makeLabel(['⚽ Soccer', 'Walk into the ball to dribble, click / trigger to grab & kick'], { size: 5.5, font: 56 });
    sign.position.set(x, 3.8, z - hz - 1); g.add(sign);
    const ball = fitModel(await loadModel('football'), 0.32);
    // Re-center so the ball rotates around its middle.
    ball.children[0].position.y -= 0.16;
    ball.position.set(x, grassHeight(x, z) + 0.5, z);
    this.soccerBall = this.addBall(ball, 0.16, { bounce: 0.55, friction: 0.35, label: 'Pick up soccer ball' });
  }

  async buildHoop() {
    const g = this.group;
    const gy = grassHeight(HOOP.x, HOOP.z);
    const court = new THREE.Mesh(new THREE.PlaneGeometry(10, 9), decal(new THREE.MeshStandardMaterial({ color: 0xd2733c, roughness: 0.7 }), 2));
    court.rotation.x = -Math.PI / 2; court.position.set(HOOP.x, gy + 0.03, HOOP.z - 3.5); court.receiveShadow = true;
    g.add(court);
    const key = new THREE.Mesh(new THREE.RingGeometry(2.9, 3.0, 40, 1, 0, Math.PI), decal(new THREE.MeshBasicMaterial({ color: 0xffffff }), 3));
    key.rotation.x = -Math.PI / 2; key.position.set(HOOP.x, gy + 0.05, HOOP.z); g.add(key);
    const metal = new THREE.MeshStandardMaterial({ color: 0x3a6ccf, metalness: 0.5, roughness: 0.4 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, HOOP.y + 0.6), metal);
    pole.position.set(HOOP.x, gy + (HOOP.y + 0.6) / 2, HOOP.z + 0.9); pole.castShadow = true; g.add(pole);
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.1, 0.05), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, roughness: 0.1 }));
    board.position.set(HOOP.x, gy + HOOP.y + 0.4, HOOP.z + 0.45); g.add(board);
    const square = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.45), new THREE.MeshBasicMaterial({ color: 0xff4040, wireframe: true }));
    square.position.set(HOOP.x, gy + HOOP.y + 0.25, HOOP.z + 0.42); square.rotation.y = Math.PI; g.add(square);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.02, 8, 32), new THREE.MeshStandardMaterial({ color: 0xff5a1f, metalness: 0.6, roughness: 0.3 }));
    rim.rotation.x = Math.PI / 2; rim.position.set(HOOP.x, gy + HOOP.y, HOOP.z); g.add(rim);
    const netMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.18, 0.45, 16, 4, true), new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.7 }));
    netMesh.position.set(HOOP.x, gy + HOOP.y - 0.23, HOOP.z); g.add(netMesh);
    this.hoopY = gy + HOOP.y;
    this.colliders.push({ min: new THREE.Vector3(HOOP.x - 0.9, gy + HOOP.y - 0.15, HOOP.z + 0.42), max: new THREE.Vector3(HOOP.x + 0.9, gy + HOOP.y + 0.95, HOOP.z + 0.48) });
    const sign = makeLabel(['🏀 Hoops', 'Grab the ball and shoot!'], { size: 3.5, font: 60 });
    sign.position.set(HOOP.x, gy + 4.7, HOOP.z + 0.5); g.add(sign);

    // Basketball with seams drawn on a canvas.
    const c = document.createElement('canvas'); c.width = 512; c.height = 256;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#e8701f'; ctx.fillRect(0, 0, 512, 256);
    for (let i = 0; i < 3000; i++) { ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`; ctx.fillRect(Math.random() * 512, Math.random() * 256, 2, 2); }
    ctx.strokeStyle = '#2a1408'; ctx.lineWidth = 6;
    [0, 128, 256, 384].forEach((x) => { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 256); ctx.stroke(); });
    ctx.beginPath(); ctx.moveTo(0, 128); ctx.lineTo(512, 128); ctx.stroke();
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    for (let i = 0; i < 2; i++) {
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.15, 32, 20), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }));
      ball.position.set(HOOP.x - 1 + i * 2, gy + 0.3, HOOP.z - 3);
      const b = this.addBall(ball, 0.15, { bounce: 0.75, friction: 0.3, label: 'Pick up basketball' });
      b.userData.basket = true;
    }
  }

  async buildUprights() {
    const g = this.group;
    const { x, z, bar, half } = UPRIGHTS;
    const gy = grassHeight(x, z);
    const yel = new THREE.MeshStandardMaterial({ color: 0xffd400, roughness: 0.4 });
    const add = (geo, px, py, pz, rz = 0) => { const m = new THREE.Mesh(geo, yel); m.position.set(px, py, pz); m.rotation.z = rz; m.castShadow = true; g.add(m); };
    add(new THREE.CylinderGeometry(0.1, 0.1, bar), x, gy + bar / 2, z);
    add(new THREE.CylinderGeometry(0.08, 0.08, half * 2), x, gy + bar, z, Math.PI / 2);
    add(new THREE.CylinderGeometry(0.07, 0.07, 6), x - half, gy + bar + 3, z);
    add(new THREE.CylinderGeometry(0.07, 0.07, 6), x + half, gy + bar + 3, z);
    const sign = makeLabel(['🏈 Field Goal', 'Throw the football between the posts!'], { size: 4.5, font: 58 });
    sign.position.set(x, gy + 7.5, z); g.add(sign);
    this.uprightsY = gy;
    for (let i = 0; i < 2; i++) {
      const fb = fitModel(await loadModel('american_football'), 0.36);
      fb.children[0].position.y -= 0.1;
      fb.position.set(x - 1 + i * 2, gy + 0.4, z + 10);
      const b = this.addBall(fb, 0.12, { bounce: 0.4, friction: 0.6, label: 'Pick up football' });
      b.userData.football = true;
    }
  }

  async buildTarget() {
    const g = this.group;
    const gy = grassHeight(TARGET.x, TARGET.z);
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const ctx = c.getContext('2d');
    ['#ff4040', '#ffffff', '#ff4040', '#ffffff', '#ffd400'].forEach((col, i) => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(128, 128, 128 - i * 25, 0, 7); ctx.fill(); });
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const board = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.1, 40), [new THREE.MeshStandardMaterial({ color: 0x8b5a2b }), new THREE.MeshStandardMaterial({ map: tex }), new THREE.MeshStandardMaterial({ map: tex })]);
    board.rotation.x = Math.PI / 2;
    board.position.set(TARGET.x, gy + TARGET.y, TARGET.z);
    board.castShadow = true;
    g.add(board);
    this.targetBoard = board;
    this.colliders.push({ min: new THREE.Vector3(TARGET.x - 1, gy + TARGET.y - 1, TARGET.z - 0.05), max: new THREE.Vector3(TARGET.x + 1, gy + TARGET.y + 1, TARGET.z + 0.05) });
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.1, TARGET.y, 0.1), new THREE.MeshStandardMaterial({ color: 0x8b5a2b }));
    legs.position.set(TARGET.x, gy + TARGET.y / 2, TARGET.z - 0.1); g.add(legs);
    const sign = makeLabel(['⚾ Target Toss', 'Hit the bullseye!'], { size: 3.5, font: 60 });
    sign.position.set(TARGET.x, gy + 3.6, TARGET.z); g.add(sign);
    for (let i = 0; i < 3; i++) {
      const bb = fitModel(await loadModel('baseball_01'), 0.15);
      bb.children[0].position.y -= 0.075;
      bb.position.set(TARGET.x - 1 + i, gy + 0.3, TARGET.z - 8);
      const b = this.addBall(bb, 0.075, { bounce: 0.5, friction: 0.6, label: 'Pick up baseball' });
      b.userData.baseball = true;
    }
  }

  async buildDecor() {
    const g = this.group;
    const place = async (name, size, x, z, rotY = rand(0, 6.28), axis) => {
      const m = fitModel(await loadModel(name), size, axis);
      m.position.set(x, grassHeight(x, z), z); m.rotation.y = rotY;
      // Big background props don't need to cast shadows (saves a lot of GPU in VR).
      if (name === 'shrub_02' || name === 'boulder_01') m.traverse((o) => { o.castShadow = false; });
      g.add(m); return m;
    };
    const jobs = [];
    for (let i = 0; i < 8; i++) {
      const a = rand(0, 6.28), r = rand(43, 50);
      jobs.push(place('shrub_02', rand(2, 3.2), Math.cos(a) * r, Math.sin(a) * r));
    }
    [[-4, -16], [24, 6], [-28, 10], [8, 24], [-30, -20]].forEach(([x, z], i) => {
      const palm = makePalm(i); palm.position.set(x, grassHeight(x, z), z); palm.rotation.y = rand(0, 6.28); g.add(palm);
    });
    [[30, -24], [-24, 28], [6, -40]].forEach(([x, z]) => jobs.push(place('boulder_01', rand(2, 3.5), x, z)));
    jobs.push(place('garden_gnome', 0.6, -3, 4, 0.4));
    jobs.push(place('garden_gnome', 0.6, 5.5, -2, -0.6));
    const table = await place('wooden_picnic_table', 3, -6, 6, 0.3);
    await Promise.all(jobs);
    // Boombox on the picnic table.
    const boom = fitModel(await loadModel('boombox'), 0.7);
    boom.position.set(-6, grassHeight(-6, 6) + 0.76, 6); boom.rotation.y = 0.3 + Math.PI;
    g.add(boom);
    this.boombox = boom;
    this.game.interact(boom, {
      label: () => (this.game.audio.boomTimer ? 'Stop the music' : 'Play some tunes!'), distance: 5,
      onSelect: () => { const on = this.game.audio.toggleBoombox(); this.game.toast(on ? '📻 Party time!' : '📻 Music off'); if (on && !this.danced) { this.danced = true; this.game.addHappiness(2, boom.position.clone().add(new THREE.Vector3(0, 1, 0))); } },
    });
    void table;
  }

  // ---------- Rides ----------
  makeSkateboard() {
    const g = new THREE.Group();
    const deck = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.6, 4, 12), new THREE.MeshStandardMaterial({ color: 0xff4f8b, roughness: 0.5 }));
    deck.rotation.set(Math.PI / 2, 0, 0); deck.scale.set(1, 1, 0.12); deck.position.y = 0.09;
    const wheels = [];
    const wm = new THREE.MeshStandardMaterial({ color: 0xfff0a0, roughness: 0.4 });
    for (const dz of [-0.28, 0.28]) for (const dx of [-0.09, 0.09]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.04, 12), wm);
      w.rotation.z = Math.PI / 2; w.position.set(dx, 0.035, dz); g.add(w); wheels.push(w);
    }
    g.add(deck);
    g.userData.animate = (dt, speed) => wheels.forEach((w) => { w.rotation.x += (speed / 0.035) * dt; });
    return g;
  }

  makeHoverboard() {
    const g = new THREE.Group();
    const board = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.7, 4, 16), new THREE.MeshPhysicalMaterial({ color: 0x7a5cff, metalness: 0.3, roughness: 0.2, clearcoat: 1 }));
    board.rotation.set(Math.PI / 2, 0, 0); board.scale.set(1, 1, 0.15); board.position.y = 0.05;
    const glow = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 8, 32), new THREE.MeshBasicMaterial({ color: 0x5ff6ff }));
    glow.rotation.x = Math.PI / 2; glow.scale.set(1, 2.4, 1); glow.position.y = 0.01;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.01, 0.9), new THREE.MeshBasicMaterial({ color: 0xff7af0 }));
    stripe.position.y = 0.085;
    g.add(board, glow, stripe);
    g.userData.animate = () => { glow.material.color.setHSL((performance.now() / 3000) % 1, 0.9, 0.65); };
    return g;
  }

  makeBike() {
    const g = new THREE.Group();
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x2fb5ff, metalness: 0.4, roughness: 0.3 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });
    const wheels = [];
    for (const z of [-0.55, 0.5]) {
      const w = new THREE.Group();
      const tire = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.03, 8, 32), dark);
      tire.rotation.y = Math.PI / 2; w.add(tire);
      for (let s = 0; s < 6; s++) { const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.64), frameMat); sp.rotation.x = (s / 6) * Math.PI; w.add(sp); }
      w.position.set(0, 0.36, z); g.add(w); wheels.push(w);
    }
    const tube = (a, b) => {
      const d = new THREE.Vector3().subVectors(b, a);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, d.length(), 8), frameMat);
      m.position.copy(a).add(b).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
      g.add(m);
    };
    const P = (x, y, z) => new THREE.Vector3(x, y, z);
    const crank = P(0, 0.38, 0.05), seat = P(0, 0.85, 0.2), head = P(0, 0.9, -0.45), fork = P(0, 0.36, -0.55), rear = P(0, 0.36, 0.5);
    tube(crank, seat); tube(crank, head); tube(seat, head); tube(head, fork); tube(crank, rear); tube(seat, rear);
    tube(head, P(0, 1.05, -0.42));
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.6, 8), dark); bar.rotation.z = Math.PI / 2; bar.position.set(0, 1.05, -0.42); g.add(bar);
    const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 0.26), dark); saddle.position.set(0, 0.89, 0.22); g.add(saddle);
    const basket = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.22), new THREE.MeshStandardMaterial({ color: 0xc9a06a, roughness: 1 })); basket.position.set(0, 0.95, -0.62); g.add(basket);
    g.userData.animate = (dt, speed) => wheels.forEach((w) => { w.rotation.x -= (speed / 0.33) * dt; });
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return g;
  }

  makeSkates() {
    const g = new THREE.Group();
    const boots = [];
    for (const x of [-0.13, 0.13]) {
      const s = new THREE.Group();
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.16, 0.26), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }));
      boot.position.y = 0.14;
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.14, 12), new THREE.MeshStandardMaterial({ color: 0xff6ab0 }));
      cuff.position.set(0, 0.26, 0.05);
      s.add(boot, cuff);
      for (const z of [-0.09, -0.03, 0.03, 0.09]) {
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 10), new THREE.MeshStandardMaterial({ color: 0xffe14d }));
        w.rotation.z = Math.PI / 2; w.position.set(0, 0.03, z); s.add(w);
      }
      s.position.x = x; g.add(s); boots.push(s);
    }
    let ph = 0;
    g.userData.animate = (dt, speed) => { ph += dt * speed * 1.2; boots[0].position.z = Math.sin(ph) * 0.18; boots[1].position.z = -Math.sin(ph) * 0.18; };
    return g;
  }

  buildRides() {
    const g = this.group;
    const defs = [
      { id: 'bike', make: () => this.makeBike(), icon: '🚲' },
      { id: 'hoverboard', make: () => this.makeHoverboard(), icon: '🛸' },
      { id: 'skateboard', make: () => this.makeSkateboard(), icon: '🛹' },
      { id: 'skates', make: () => this.makeSkates(), icon: '🛼' },
    ];
    const rack = new THREE.Mesh(new THREE.BoxGeometry(9, 0.15, 2), new THREE.MeshStandardMaterial({ color: 0xffc94d, roughness: 0.6 }));
    rack.position.set(5.5, grassHeight(5.5, 4) + 0.07, 4); rack.receiveShadow = true;
    g.add(rack);
    const sign = makeLabel(['🎢 Ride Rack', 'Pick a ride! Hop off with F / B'], { size: 4, font: 60 });
    sign.position.set(5.5, 3, 3.2); g.add(sign);
    defs.forEach((d, i) => {
      const mesh = d.make();
      const home = new THREE.Vector3(2.5 + i * 2, rack.position.y + 0.08, 4);
      const ride = { ...d, mesh, home };
      const park = () => { mesh.position.copy(home); mesh.rotation.y = Math.PI / 2; mesh.visible = true; ride.inUse = false; };
      park();
      g.add(mesh);
      const label = makeLabel(`${d.icon} ${{ bike: 'Bike', hoverboard: 'Hoverboard', skateboard: 'Skateboard', skates: 'Skates' }[d.id]}`, { size: 1.5, font: 64, width: 640 });
      label.position.set(home.x, home.y + 1.5, home.z); g.add(label);
      this.game.interact(mesh, {
        label: `Ride the ${d.id}`, distance: 6,
        enabled: () => !ride.inUse,
        onSelect: () => {
          ride.inUse = true;
          this.game.mount(d.id, mesh, park);
          if (d.id === 'bike' && !this.bikeHint) { this.bikeHint = true; setTimeout(() => this.game.toast('Try the bike path loop around the park! 🚲'), 2500); }
        },
      });
      this.rides.push(ride);
    });
  }

  // ---------- Game logic ----------
  resetBall(b) {
    b.mesh.position.copy(b.home); b.vel.set(0, 0, 0);
  }

  update(dt, t) {
    const game = this.game, pl = game.player;
    this.portal.update(t);
    animateAll(this, t);

    // Distance and air time on rides earn happiness.
    if (pl.vehicle) {
      this.rideDist += pl.speed * dt;
      if (this.rideDist > 120) { this.rideDist = 0; game.addHappiness(2, pl.feet.clone().add(new THREE.Vector3(0, 2, 0))); }
      if (!pl.grounded) this.air += dt;
      else {
        if (this.air > 0.9) {
          const pts = this.air > 1.6 ? 5 : 2;
          celebrate(this, pl.feet.clone().add(new THREE.Vector3(0, 1.5, 0)), pts, this.air > 1.6 ? '🔥 HUGE AIR!' : '✨ Nice air!');
        }
        this.air = 0;
      }
    } else this.air = 0;

    for (const b of this.balls) {
      const p = b.mesh.position;
      // One score per throw: after scoring, a ball can't score again for a moment.
      const canScore = !b.cool || t > b.cool;
      const scored = () => { b.cool = t + 2; };
      // Soccer goals.
      if (b === this.soccerBall && !b.held && canScore) {
        for (const goal of this.goals) {
          const past = (p.x - goal.x) * goal.side;
          if (past > 0.2 && past < 1.2 && Math.abs(p.z - goal.z) < 2 && p.y < goal.y + 2) {
            scored();
            celebrate(this, p.clone().add(new THREE.Vector3(0, 1, 0)), 5, '⚽ GOOOAL! +5');
            setTimeout(() => this.resetBall(b), 1200);
            b.vel.set(0, 0, 0); p.x = goal.x + goal.side * 0.7;
          }
        }
      }
      // Basketball through the hoop, falling downward.
      if (b.userData.basket && !b.held) {
        const prevY = b.prevY ?? p.y;
        if (canScore && prevY >= this.hoopY && p.y < this.hoopY && Math.hypot(p.x - HOOP.x, p.z - HOOP.z) < 0.26) {
          scored();
          celebrate(this, new THREE.Vector3(HOOP.x, this.hoopY + 0.5, HOOP.z), 5, '🏀 Swish! +5');
          b.vel.x *= 0.2; b.vel.z *= 0.2;
        }
        // Rim bounce.
        const rd = Math.hypot(p.x - HOOP.x, p.z - HOOP.z);
        if (Math.abs(p.y - this.hoopY) < 0.15 && Math.abs(rd - 0.28) < 0.15) {
          const n = new THREE.Vector3(p.x - HOOP.x, 0, p.z - HOOP.z).normalize().multiplyScalar(rd > 0.28 ? 1 : -1);
          const vn = b.vel.dot(n);
          if (vn < 0) b.vel.addScaledVector(n, -vn * 1.6);
        }
        b.prevY = p.y;
      }
      // Field goal.
      if (b.userData.football && !b.held) {
        const prevZ = b.prevZ ?? p.z;
        if (canScore && prevZ > UPRIGHTS.z && p.z <= UPRIGHTS.z && Math.abs(p.x - UPRIGHTS.x) < UPRIGHTS.half && p.y > this.uprightsY + UPRIGHTS.bar) {
          scored();
          celebrate(this, p.clone(), 5, '🏈 It\'s good! +5');
        }
        b.prevZ = p.z;
        // Footballs point along their flight.
        if (b.vel.lengthSq() > 4) b.mesh.lookAt(p.clone().add(b.vel)), b.mesh.rotateY(Math.PI / 2);
      }
      // Bullseye.
      if (b.userData.baseball && !b.held) {
        const prevZ = b.prevZ ?? p.z;
        const ty = this.targetBoard.position.y;
        if (canScore && prevZ < TARGET.z - 0.05 && p.z >= TARGET.z - 0.2 && Math.hypot(p.x - TARGET.x, p.y - ty) < 1) {
          const d = Math.hypot(p.x - TARGET.x, p.y - ty);
          const pts = d < 0.25 ? 5 : d < 0.6 ? 3 : 1;
          scored();
          celebrate(this, p.clone(), pts, d < 0.25 ? '🎯 BULLSEYE! +5' : `⚾ Hit! +${pts}`);
          b.vel.z = -Math.abs(b.vel.z) * 0.4;
          p.z = TARGET.z - 0.2;
        }
        b.prevZ = p.z;
      }
      // Bring lost balls home.
      if (!b.held && (p.y < -5 || Math.hypot(p.x, p.z) > 50)) this.resetBall(b);
    }
  }

  dispose() { this.game.audio.stopBoombox(); }
}
