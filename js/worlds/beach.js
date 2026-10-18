// Sunny Beach: sandcastles, beach balls, shells, treasure and floating ducks.
import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';
import { loadModel, fitModel, texturedMaterial, loadTexture } from '../assets.js';
import { makeTerrain, makeLabel, rand, pick, fbm } from '../util.js';
import { makeReturnPortal, spawnBonusMallow, animateAll, celebrate } from './common.js';

// Sand slopes down into the sea toward -z.
function sandHeight(x, z) {
  let h = 0.6 + (fbm(x * 0.08, z * 0.08, 3) - 0.5) * 0.5;
  if (z > 10) h += (z - 10) * 0.12 + (fbm(x * 0.05, z * 0.05, 3) - 0.4) * Math.min((z - 10) * 0.25, 4); // dunes
  if (z < -4) h -= (-4 - z) * 0.16;
  return h;
}

export default class Beach {
  constructor(game) {
    this.game = game;
    this.hdri = 'spiaggia_di_mondello';
    this.exposure = 1.0;
    this.sunIntensity = 3;
    this.sunColor = 0xfff0d0;
    this.sunYaw = 0; // lines the photo's open sea up with our ocean
    this.spawn = { pos: new THREE.Vector3(0, 0, 12), yaw: 0 };
    this.radius = 45;
    this.waterLevel = 0;
    this.fog = new THREE.Fog(0xd8e8f0, 90, 400);
    this.welcome = '🏖️ Sunny Beach! Build sandcastles, find shells, and look for treasure';
    this.castles = 0;
    this.shells = 0;
    this.floaters = [];
  }

  // You can wade out until the water is about chest deep.
  getGround(x, z) { return Math.max(sandHeight(x, z), -1.1); }

  async build() {
    const g = this.group;
    this.sandMat = texturedMaterial('coast_sand_01', 40, { color: 0xfff6e6 });
    const sand = makeTerrain(240, 200, sandHeight, this.sandMat, 0, 40);
    g.add(sand);
    this.sand = sand;
    this.game.interact(sand, {
      label: 'Build a sandcastle tower', distance: 7,
      enabled: () => true,
      onSelect: (hit) => this.buildCastle(hit.point),
    });

    // Ocean.
    const normals = loadTexture('waternormals.jpg', 1, false);
    this.water = new Water(new THREE.PlaneGeometry(2000, 2000), {
      textureWidth: 512, textureHeight: 512, waterNormals: normals,
      sunDirection: new THREE.Vector3(0, 1, -1), sunColor: 0xffffff, waterColor: 0x0a6f86, distortionScale: 2.2, fog: true,
    });
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.y = 0;
    this.water.material.uniforms.size.value = 4;
    g.add(this.water);
    // Foamy shoreline.
    const foam = new THREE.Mesh(new THREE.PlaneGeometry(240, 2.5), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, depthWrite: false }));
    foam.rotation.x = -Math.PI / 2; foam.position.set(0, 0.03, -3.4);
    g.add(foam); this.foam = foam;

    await Promise.all([this.buildDecor(), this.buildToys()]);
    this.portal = makeReturnPortal(this, new THREE.Vector3(-6, sandHeight(-6, 16), 16), Math.PI * 0.85);

    const sign = makeLabel(['🏖️ Sunny Beach', 'Point at the sand to build sandcastles!'], { size: 5, font: 60 });
    sign.position.set(0, 4.2, 6); g.add(sign);

    for (let i = 0; i < 6; i++) spawnBonusMallow(this, new THREE.Vector3(rand(-25, 25), 1.8, rand(0, 14)).setY(sandHeight(0, 5) + 1.3), { respawn: 25000 });
    spawnBonusMallow(this, new THREE.Vector3(14, 0.6, -14), { golden: true, respawn: 40000 }); // out on the water
  }

  onSun(dir) { this.water.material.uniforms.sunDirection.value.copy(dir); }

  async buildDecor() {
    const g = this.group;
    const at = (x, z) => new THREE.Vector3(x, sandHeight(x, z), z);
    const palmSpots = [[-14, 8], [-18, 14], [12, 10], [18, 6], [22, 16], [-24, 4], [4, 20], [-8, 22], [28, 3], [-30, 12]];
    await Promise.all(palmSpots.map(async ([x, z]) => {
      const p = fitModel(await loadModel('island_tree_02'), rand(7, 10), 'y');
      p.position.copy(at(x, z)); p.rotation.y = rand(0, 6.28);
      g.add(p);
    }));
    for (let i = 0; i < 6; i++) {
      const r = fitModel(await loadModel('boulder_01'), rand(1.5, 4));
      const x = pick([-1, 1]) * rand(26, 40), z = rand(-10, 4);
      r.position.copy(at(x, z)).add(new THREE.Vector3(0, -0.3, 0)); r.rotation.y = rand(0, 6.28);
      g.add(r);
    }
    const table = fitModel(await loadModel('wooden_picnic_table'), 3);
    table.position.copy(at(8, 14)); table.rotation.y = 0.4; g.add(table);
    const buoy = fitModel(await loadModel('lifebuoy'), 0.8);
    buoy.position.copy(at(-3, 5)).add(new THREE.Vector3(0, 0, 0)); buoy.rotation.set(-Math.PI / 2 + 0.2, 0, 0.3);
    g.add(buoy);
    const bucket = fitModel(await loadModel('wooden_bucket_01'), 0.4);
    bucket.position.copy(at(2, 4)); g.add(bucket);

    // Beach umbrellas and towels.
    const colors = [[0xff5a7a, 0xffffff], [0x3bb0ff, 0xfff27a], [0x6ad66a, 0xffffff], [0xffa53b, 0xff5ab0]];
    colors.forEach(([a, b], i) => {
      const x = -10 + i * 7, z = 3 + (i % 2) * 2.5;
      const c = document.createElement('canvas'); c.width = 256; c.height = 32;
      const ctx = c.getContext('2d');
      for (let k = 0; k < 8; k++) { ctx.fillStyle = '#' + new THREE.Color(k % 2 ? a : b).getHexString(); ctx.fillRect(k * 32, 0, 32, 32); }
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
      const um = new THREE.Group();
      const top = new THREE.Mesh(new THREE.ConeGeometry(1.6, 0.6, 16, 1, true), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.7 }));
      top.position.y = 2.3; top.castShadow = true;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.4), new THREE.MeshStandardMaterial({ color: 0xffffff }));
      pole.position.y = 1.2;
      um.add(top, pole); um.position.copy(at(x, z)); um.rotation.z = rand(-0.1, 0.1);
      g.add(um);
      const towel = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.8), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
      towel.rotation.set(-Math.PI / 2, 0, rand(-0.4, 0.4)); towel.position.copy(at(x + 1.2, z + 0.5)).add(new THREE.Vector3(0, 0.05, 0));
      g.add(towel);
    });

    // Seagulls circling overhead.
    this.gulls = [];
    const gullMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    for (let i = 0; i < 7; i++) {
      const gull = new THREE.Group();
      const wingGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.6, 0.1, 0.1), new THREE.Vector3(0, 0, 0.25)]);
      const l = new THREE.Mesh(wingGeo, gullMat), r = new THREE.Mesh(wingGeo, gullMat);
      r.scale.x = -1;
      gull.add(l, r);
      gull.userData = { l, r, a: rand(0, 6.28), rad: rand(8, 25), y: rand(8, 16), speed: rand(0.15, 0.3), cx: rand(-10, 10), cz: rand(-20, 0) };
      g.add(gull); this.gulls.push(gull);
    }
  }

  async buildToys() {
    const g = this.group;
    const physics = this.game.physics;
    // Giant beach balls.
    const c = document.createElement('canvas'); c.width = 512; c.height = 256;
    const ctx = c.getContext('2d');
    ['#ff4b5c', '#ffffff', '#ffd23f', '#ffffff', '#3b8bff', '#ffffff'].forEach((col, i) => { ctx.fillStyle = col; ctx.fillRect(i * 512 / 6, 0, 512 / 6 + 1, 256); });
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 512, 18); ctx.fillRect(0, 238, 512, 18);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    this.beachBalls = [];
    for (let i = 0; i < 3; i++) {
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.45, 32, 20), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.35 }));
      ball.castShadow = true;
      ball.position.set(-4 + i * 4, sandHeight(-4 + i * 4, 7) + 1, 7);
      g.add(ball);
      const b = physics.add(ball, { radius: 0.45, bounce: 0.8, friction: 0.15, gravity: -4, drag: 0.4, floats: true, label: 'Grab the beach ball' });
      b.userData.beachBall = true;
      this.beachBalls.push(b);
    }

    // Rubber ducks bobbing in the shallows.
    for (let i = 0; i < 8; i++) {
      const d = fitModel(await loadModel('rubber_duck_toy'), 0.5);
      d.position.set(rand(-18, 18), 0, rand(-14, -5));
      d.rotation.y = rand(0, 6.28);
      d.userData.phase = rand(0, 6);
      g.add(d); this.floaters.push(d);
      this.game.interact(d, { label: 'Squeak the duck', distance: 6, onSelect: () => {
        this.game.audio.tone(1400, { dur: 0.15, slide: 0.6, type: 'square', vol: 0.12 });
        d.userData.hop = 1;
        if (!d.userData.squeaked) { d.userData.squeaked = true; this.game.addHappiness(1, d.position.clone().add(new THREE.Vector3(0, 0.8, 0))); }
      } });
    }

    // Seashells to collect.
    this.shellSpots = [];
    for (let i = 0; i < 12; i++) this.shellSpots.push(new THREE.Vector3(rand(-28, 28), 0, rand(-3, 10)));
    for (const s of this.shellSpots) this.spawnShell(s);

    // Treasure chest half-buried in the dunes.
    const chest = fitModel(await loadModel('treasure_chest'), 1.1);
    chest.position.set(20, sandHeight(20, 20) - 0.15, 20); chest.rotation.y = -0.7;
    g.add(chest);
    this.chest = chest;
    const hint = makeLabel('❓', { size: 0.8, font: 80, width: 256 });
    hint.position.set(20, sandHeight(20, 20) + 1.6, 20);
    g.add(hint); this.chestHint = hint;
    this.game.interact(chest, {
      label: () => (this.chestOpened ? 'Already opened (come back later!)' : 'Open the treasure chest!'), distance: 5,
      onSelect: () => this.openChest(),
    });
  }

  spawnShell(spot) {
    loadModel('lambis_shell').then((m) => {
      if (!this.group.parent) return;
      const shell = fitModel(m, 0.35);
      spot.y = sandHeight(spot.x, spot.z) + 0.02;
      shell.position.copy(spot); shell.rotation.y = rand(0, 6.28);
      this.group.add(shell);
      // A soft glint so you can spot them.
      const glint = makeLabel('✨', { size: 0.35, font: 80, width: 256, bg: null });
      glint.position.y = 0.4; shell.add(glint);
      this.game.collectible(shell, {
        radius: 0.8, label: 'Pick up seashell',
        onCollect: (_o, at) => {
          shell.removeFromParent();
          this.shells++;
          this.game.audio.collect(this.shells);
          this.game.addHappiness(2, at.add(new THREE.Vector3(0, 0.6, 0)));
          this.game.setExtraHud(`🐚 Shells: ${this.shells}`);
          if (this.shells === 10) celebrate(this, at, 10, '🐚 Shell collector! +10');
          setTimeout(() => { if (this.group.parent) this.spawnShell(new THREE.Vector3(rand(-28, 28), 0, rand(-3, 10))); }, 15000);
        },
      });
    });
  }

  openChest() {
    if (this.chestOpened) { this.game.toast('The chest is empty... for now!'); return; }
    this.chestOpened = true;
    this.chestHint.visible = false;
    const top = this.chest.position.clone().add(new THREE.Vector3(0, 1.2, 0));
    celebrate(this, top, 10, '💰 Treasure! Golden marshmallows burst out!');
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      spawnBonusMallow(this, top.clone().add(new THREE.Vector3(Math.cos(a) * 1.5, 0.5, Math.sin(a) * 1.5)), { golden: true });
    }
    setTimeout(() => { this.chestOpened = false; if (this.chestHint) this.chestHint.visible = true; }, 120000);
  }

  buildCastle(point) {
    if (point.y < 0.05) { this.game.toast('Too wet! Build on dry sand'); return; }
    const g = new THREE.Group();
    const mat = this.sandMat;
    // Stack onto an existing castle if you point at one nearby.
    const near = (this.castleList ||= []).find((c) => Math.hypot(c.x - point.x, c.z - point.z) < 0.6);
    const level = near ? near.level + 1 : 0;
    const r = Math.max(0.18, 0.42 - level * 0.08);
    const h = 0.45;
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.9, r, h, 16), mat);
    tower.position.y = h / 2; tower.castShadow = true; tower.receiveShadow = true;
    g.add(tower);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      const cren = new THREE.Mesh(new THREE.BoxGeometry(r * 0.35, 0.12, r * 0.35), mat);
      cren.position.set(Math.cos(a) * r * 0.75, h + 0.06, Math.sin(a) * r * 0.75); cren.castShadow = true;
      g.add(cren);
    }
    const baseY = near ? near.top : point.y;
    const x = near ? near.x : point.x, z = near ? near.z : point.z;
    g.position.set(x, baseY, z);
    g.scale.setScalar(0.01);
    g.userData.grow = 0;
    this.group.add(g);
    (this.growing ||= []).push(g);
    if (near) { near.level = level; near.top = baseY + h + 0.06; near.flag?.position.setY(near.top + 0.35 - near.base); }
    else {
      const rec = { x, z, level, top: baseY + h + 0.06, base: baseY, group: g };
      // Flag on every new castle.
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.5), new THREE.MeshStandardMaterial({ color: 0x8b5a2b }));
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.14), new THREE.MeshStandardMaterial({ color: pick([0xff4b5c, 0x3b8bff, 0xffd23f, 0x6ad66a]), side: THREE.DoubleSide }));
      flag.position.set(0.11, 0.18, 0); pole.add(flag);
      pole.position.y = h + 0.3;
      g.add(pole); rec.flag = pole; pole.userData.flagMesh = flag;
      this.castleList.push(rec);
      // The flag must ride on top of the stack, so it lives on the base group in local coordinates.
    }
    this.game.audio.tone(180, { dur: 0.2, type: 'sine', vol: 0.25, slide: 0.7 });
    this.game.audio.noise(0.15, 0.08, 800);
    this.game.particles.burst(point, { count: 14, colors: [0xffe2b0, 0xf3d090], speed: 1.5 });
    this.castles++;
    if (this.castles % 3 === 0) this.game.addHappiness(1, point.clone().add(new THREE.Vector3(0, 1, 0)));
    if (level === 3) celebrate(this, new THREE.Vector3(x, baseY + 1, z), 5, '🏰 Grand sandcastle! +5');
    if (this.castles === 15) celebrate(this, point.clone().add(new THREE.Vector3(0, 1, 0)), 8, '🏰 Sandcastle kingdom! +8');
  }

  update(dt, t) {
    const game = this.game;
    this.portal.update(t);
    animateAll(this, t);
    this.water.material.uniforms.time.value += dt * 0.6;
    this.foam.material.opacity = 0.3 + Math.sin(t * 0.8) * 0.15;
    this.foam.position.z = -3.4 + Math.sin(t * 0.8) * 0.6;

    for (const d of this.floaters) {
      d.position.y = Math.sin(t * 1.5 + d.userData.phase) * 0.06 - 0.12;
      if (d.userData.hop) { d.userData.hop = Math.max(0, d.userData.hop - dt * 2); d.position.y += Math.sin(d.userData.hop * Math.PI) * 0.6; }
      d.rotation.z = Math.sin(t + d.userData.phase) * 0.1;
    }
    for (const gl of this.gulls) {
      const u = gl.userData; u.a += u.speed * dt;
      gl.position.set(u.cx + Math.cos(u.a) * u.rad, u.y + Math.sin(t + u.a) * 0.8, u.cz + Math.sin(u.a) * u.rad);
      gl.rotation.y = -u.a;
      const flap = Math.sin(t * 6 + u.rad) * 0.5;
      u.l.rotation.z = flap; u.r.rotation.z = -flap;
    }
    if (this.growing) {
      this.growing = this.growing.filter((g) => {
        g.userData.grow = Math.min(1, g.userData.grow + dt * 4);
        const k = g.userData.grow;
        g.scale.setScalar(k < 1 ? 1 + Math.sin(k * Math.PI) * 0.15 : 1);
        if (k < 0.3) g.scale.setScalar(k / 0.3);
        return k < 1;
      });
    }
    // Bop beach balls with your hands in VR.
    if (game.isVR) {
      for (const p of game.pointers) {
        if (!p.source) continue;
        const hand = p.grip.getWorldPosition(new THREE.Vector3());
        const last = p.lastHand; p.lastHand = hand.clone();
        if (!last) continue;
        const hv = hand.clone().sub(last).divideScalar(Math.max(dt, 0.001));
        for (const b of this.beachBalls) {
          if (b.held) continue;
          if (b.mesh.position.distanceTo(hand) < b.radius + 0.1 && hv.length() > 1) {
            b.vel.copy(hv).multiplyScalar(1.3).add(new THREE.Vector3(0, 2, 0));
            game.audio.thud(); game.haptic(p, 0.6, 50);
          }
        }
      }
    }
    // Keep beach balls from escaping to sea forever.
    for (const b of this.beachBalls) {
      const p = b.mesh.position;
      if (p.z < -30 || Math.hypot(p.x, p.z) > 44) { p.set(rand(-6, 6), 3, 6); b.vel.set(0, 0, 0); }
      if (p.y < 0.6 && p.z < -3 && !b.splashed) { b.splashed = true; game.audio.splash(); game.particles.burst(p.clone(), { count: 20, colors: [0xffffff, 0xbfe8ff], speed: 2 }); }
      if (p.y > 1.2) b.splashed = false;
    }
  }
}
