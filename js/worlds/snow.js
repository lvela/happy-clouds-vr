// Snow Day Wonderland: sledding, snowmen, snowball targets and ice skating.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { texturedMaterial, loadModel, fitModel } from '../assets.js';
import { makeTerrain, makeLabel, rand, fbm, getDotTexture } from '../util.js';
import { makeReturnPortal, spawnBonusMallow, animateAll, celebrate } from './common.js';

const HILL = { x: 0, z: -34, r: 28, h: 13 };
const RINK = { x: 20, z: 6, r: 8 };

function snowHeight(x, z) {
  let h = (fbm(x * 0.06, z * 0.06, 3) - 0.5) * 0.8;
  const d = Math.hypot(x - HILL.x, (z - HILL.z) * 0.85);
  if (d < HILL.r) h += HILL.h * (0.5 + 0.5 * Math.cos((Math.PI * d) / HILL.r));
  const rd = Math.hypot(x - RINK.x, z - RINK.z);
  if (rd < RINK.r + 2) h *= Math.min(1, Math.max(0, (rd - RINK.r) / 2));
  const r = Math.hypot(x, z);
  if (r > 46) h += Math.min((r - 46) * 0.25, 4) + (fbm(x * 0.015, z * 0.015, 3) - 0.3) * Math.min((r - 46) * 0.4, 18);
  return h;
}

export default class Snow {
  constructor(game) {
    this.game = game;
    this.hdri = 'snowy_park_01';
    this.exposure = 0.85;
    this.sunIntensity = 2.2;
    this.sunColor = 0xfff4e8;
    this.skyColor = 0xdde8ff; this.groundColor = 0xffffff;
    this.spawn = { pos: new THREE.Vector3(0, 0, 14), yaw: 0 };
    this.radius = 50;
    this.fog = new THREE.Fog(0xe4ebf2, 50, 220);
    this.welcome = '⛄ Snow Day! Squeeze grip / click the snow to make snowballs, build snowmen, and go sledding';
    this.snowballs = [];
    this.snowmen = [];
    this.targets = [];
    this.skateDist = 0;
  }

  getGround(x, z) { return snowHeight(x, z); }
  surfaceAt(x, z) { return Math.hypot(x - RINK.x, z - RINK.z) < RINK.r ? 'ice' : 'snow'; }

  async build() {
    const g = this.group;
    this.snowMat = texturedMaterial('snow_02', 120, { color: 0xffffff, roughness: 0.9 });
    const terrain = makeTerrain(400, 200, snowHeight, this.snowMat);
    g.add(terrain);
    this.game.interact(terrain, {
      label: () => (this.game.isVR ? 'Squeeze grip to make a snowball' : 'Click to make a snowball'), distance: 5, heightfield: snowHeight,
      onSelect: (_hit, p) => { const b = this.makeSnowball(p); if (b) this.game.grab(p, b); },
    });

    // Frozen pond.
    const ice = new THREE.Mesh(new THREE.CircleGeometry(RINK.r, 64), new THREE.MeshPhysicalMaterial({ color: 0xbfe6ff, roughness: 0.05, metalness: 0.1, clearcoat: 1, transparent: true, opacity: 0.9 }));
    ice.rotation.x = -Math.PI / 2; ice.position.set(RINK.x, 0.02, RINK.z); ice.receiveShadow = true;
    g.add(ice);
    const rinkSign = makeLabel(['⛸️ Ice Pond', 'Glide around!'], { size: 3.2, font: 60 });
    rinkSign.position.set(RINK.x, 3, RINK.z - RINK.r - 0.5); g.add(rinkSign);

    this.buildTrees();
    this.buildSledding();
    this.buildSnowmanSpots();
    this.buildTargets();
    this.buildSnowfall();
    await this.buildCocoaStand();
    this.portal = makeReturnPortal(this, new THREE.Vector3(-5, snowHeight(-5, 18), 18), Math.PI * 0.9);

    // Marshmallows down the sled run and up on the hill.
    for (let i = 0; i < 8; i++) {
      const z = HILL.z + 6 + i * 3.5;
      spawnBonusMallow(this, new THREE.Vector3(Math.sin(i) * 2, snowHeight(Math.sin(i) * 2, z) + 1.1, z), { respawn: 20000 });
    }
    spawnBonusMallow(this, new THREE.Vector3(HILL.x + 3, HILL.h + 1.4, HILL.z), { golden: true, respawn: 40000 });
    spawnBonusMallow(this, new THREE.Vector3(RINK.x, 1.2, RINK.z), { golden: true, respawn: 30000 });
  }

  buildTrees() {
    // Procedural snowy pines, instanced.
    const trunk = new THREE.CylinderGeometry(0.15, 0.22, 1.2, 8); trunk.translate(0, 0.6, 0);
    const greenParts = [], snowParts = [];
    [[1.6, 2, 1.0], [1.25, 1.8, 2.2], [0.9, 1.6, 3.3], [0.5, 1.3, 4.3]].forEach(([r, h, y]) => {
      const c = new THREE.ConeGeometry(r, h, 10); c.translate(0, y + h / 2, 0); greenParts.push(c);
      const s = new THREE.ConeGeometry(r * 0.75, h * 0.45, 10); s.translate(0, y + h * 0.78, 0); snowParts.push(s);
    });
    const green = mergeGeometries(greenParts), snow = mergeGeometries(snowParts);
    const spots = [];
    for (let i = 0; i < 400 && spots.length < 90; i++) {
      const a = rand(0, Math.PI * 2), r = rand(12, 60);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (Math.abs(x - HILL.x) < 6 && z > HILL.z - 4 && z < 10) continue;     // keep the sled run clear
      if (Math.hypot(x - RINK.x, z - RINK.z) < RINK.r + 2) continue;
      if (Math.hypot(x, z - 14) < 8) continue;
      spots.push([x, z, rand(0.8, 1.6)]);
    }
    const meshes = [
      new THREE.InstancedMesh(trunk, new THREE.MeshStandardMaterial({ color: 0x5a3b22, roughness: 1 }), spots.length),
      new THREE.InstancedMesh(green, new THREE.MeshStandardMaterial({ color: 0x1f5a3a, roughness: 0.9 }), spots.length),
      new THREE.InstancedMesh(snow, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }), spots.length),
    ];
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    spots.forEach(([x, z, sc], i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand(0, 6.28));
      s.setScalar(sc); p.set(x, snowHeight(x, z) - 0.1, z);
      m4.compose(p, q, s);
      meshes.forEach((m) => m.setMatrixAt(i, m4));
    });
    meshes.forEach((m) => { m.castShadow = true; m.receiveShadow = true; this.group.add(m); });
  }

  makeSled() {
    const g = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0xd2332f, roughness: 0.5 });
    const metal = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.9, roughness: 0.3 });
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.05, 1.1), wood); seat.position.y = 0.18;
    g.add(seat);
    for (const x of [-0.25, 0.25]) {
      const runner = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.015, 6, 16, Math.PI), metal);
      runner.rotation.y = Math.PI / 2; runner.position.set(x, 0.12, -0.5); g.add(runner);
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.1), metal);
      rail.rotation.x = Math.PI / 2; rail.position.set(x, 0.02, 0.05); g.add(rail);
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.16, 0.03), metal); leg.position.set(x, 0.1, 0.3); g.add(leg);
    }
    const rope = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.012, 6, 16, Math.PI), new THREE.MeshStandardMaterial({ color: 0xf0d090 }));
    rope.position.set(0, 0.2, -0.6); rope.rotation.x = -Math.PI / 2; g.add(rope);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return g;
  }

  buildSledding() {
    const g = this.group;
    const top = new THREE.Vector3(HILL.x, HILL.h, HILL.z + 3);
    const bottom = new THREE.Vector3(HILL.x - 5, snowHeight(HILL.x - 5, 6), 6);
    this.sledTop = top;
    // Magic lift pad at the bottom takes you to the top.
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.15, 32), new THREE.MeshStandardMaterial({ color: 0x7ad0ff, emissive: 0x3aa0ff, emissiveIntensity: 0.6 }));
    pad.position.copy(bottom).add(new THREE.Vector3(0, 0.08, 0));
    g.add(pad);
    this.liftPad = pad;
    const liftSign = makeLabel(['🚡 Magic Lift', 'Stand here or click to zoom up the hill'], { size: 3.5, font: 56 });
    liftSign.position.copy(bottom).add(new THREE.Vector3(0, 2.6, 0)); g.add(liftSign);
    this.game.interact(pad, { label: 'Ride the magic lift', distance: 8, onSelect: () => this.lift() });
    // Sleds waiting at the top.
    this.sleds = [];
    for (let i = 0; i < 3; i++) {
      const sled = this.makeSled();
      const home = new THREE.Vector3(top.x - 2 + i * 2, 0, top.z + 1.5);
      home.y = snowHeight(home.x, home.z);
      const ride = { mesh: sled, home, inUse: false };
      const park = () => { sled.position.copy(ride.home); sled.rotation.set(0, Math.PI, 0); ride.inUse = false; };
      park();
      g.add(sled);
      this.game.interact(sled, {
        label: 'Hop on the sled!', distance: 6, enabled: () => !ride.inUse,
        onSelect: () => {
          ride.inUse = true;
          this.game.mount('sled', sled, () => { ride.home.set(top.x - 2 + i * 2, 0, top.z + 1.5); ride.home.y = snowHeight(ride.home.x, ride.home.z); park(); });
          this.game.player.vel.set(0, 0, 2.5); // a little push downhill
          this.runStart = this.game.time;
          this.runMax = 0;
        },
      });
      this.sleds.push(ride);
    }
    const topSign = makeLabel(['🛷 Sled Hill', 'Grab a sled and whoosh down!'], { size: 4, font: 60 });
    topSign.position.copy(top).add(new THREE.Vector3(0, 3, -1)); g.add(topSign);
    // Orange flags marking the run.
    const flagMat = new THREE.MeshStandardMaterial({ color: 0xff7a1f });
    for (let i = 0; i < 8; i++) {
      for (const side of [-4, 4]) {
        const z = HILL.z + 6 + i * 4, x = HILL.x + side;
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.4), flagMat);
        pole.position.set(x, snowHeight(x, z) + 0.7, z); g.add(pole);
      }
    }
  }

  lift() {
    const game = this.game;
    if (game.player.vehicle) game.dismount();
    game.audio.whoosh();
    game.fade(1).then(() => {
      game.player.feet.copy(this.sledTop).add(new THREE.Vector3(0, 0.2, -0.5));
      game.player.vel.set(0, 0, 0); game.player.vy = 0;
      game.player.yaw = 0; game.rig.rotation.y = 0;
      game.fade(0);
      game.toast('Grab a sled and point it downhill! 🛷');
    });
  }

  buildSnowmanSpots() {
    const spots = [[-10, 6], [-14, 12], [8, 18]];
    spots.forEach(([x, z]) => {
      const y = snowHeight(x, z);
      const grp = new THREE.Group(); grp.position.set(x, y, z);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.05, 32), new THREE.MeshBasicMaterial({ color: 0x7ad0ff, transparent: true, opacity: 0.7 }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; grp.add(ring);
      const label = makeLabel(['⛄ Build a snowman!', 'Click / trigger to add the next part'], { size: 3, font: 56 });
      label.position.y = 3.3; grp.add(label);
      const hit = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 2.4, 16), new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.y = 1.2; grp.add(hit);
      this.group.add(grp);
      const sm = { grp, ring, label, stage: 0, parts: [], wave: 0 };
      this.snowmen.push(sm);
      this.game.interact(hit, {
        label: () => ['Roll the big bottom ball', 'Add the middle ball', 'Add the head', 'Give them a face', 'Add a hat & scarf', 'Say hi to your snowman!', 'Start a new snowman'][sm.stage] || 'Snowman!',
        distance: 5, onSelect: () => this.buildSnowman(sm),
      });
    });
  }

  buildSnowman(sm) {
    const snow = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
    const add = (m) => { m.castShadow = true; sm.grp.add(m); sm.parts.push(m); m.userData.pop = 0; return m; };
    const s = sm.stage;
    const game = this.game;
    if (s === 0) add(new THREE.Mesh(new THREE.SphereGeometry(0.6, 24, 16), snow)).position.y = 0.5;
    else if (s === 1) add(new THREE.Mesh(new THREE.SphereGeometry(0.44, 24, 16), snow)).position.y = 1.3;
    else if (s === 2) { const head = add(new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 16), snow)); head.position.y = 1.9; sm.head = head; }
    else if (s === 3) {
      const coal = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 });
      const face = new THREE.Group(); face.position.y = 1.9;
      for (const x of [-0.1, 0.1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), coal); e.position.set(x, 0.07, 0.27); face.add(e); }
      for (let k = 0; k < 5; k++) { const a = -0.6 + k * 0.3; const m = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 4), coal); m.position.set(Math.sin(a) * 0.13, -0.08 - Math.cos(a) * 0.04 + 0.04, 0.27); face.add(m); }
      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.25, 10), new THREE.MeshStandardMaterial({ color: 0xff7a1f })); nose.rotation.x = Math.PI / 2; nose.position.set(0, 0, 0.38); face.add(nose);
      for (let k = 0; k < 3; k++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), coal); b.position.set(0, 1.15 + k * 0.15 - 1.9, 0.42 - Math.abs(k - 1) * 0.02); face.add(b); }
      add(face);
      // Stick arms.
      const stick = new THREE.MeshStandardMaterial({ color: 0x5a3b22 });
      sm.arms = [];
      for (const side of [-1, 1]) {
        const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.8, 6), stick);
        arm.geometry.translate(0, 0.4, 0);
        arm.position.set(side * 0.38, 1.35, 0); arm.rotation.z = -side * 1.0;
        add(arm); sm.arms.push(arm);
      }
    } else if (s === 4) {
      const hatMat = new THREE.MeshStandardMaterial({ color: 0x222233, roughness: 0.6 });
      const hat = new THREE.Group(); hat.position.y = 2.15;
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.03, 20), hatMat);
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.3, 20), hatMat); crown.position.y = 0.16;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.195, 0.195, 0.06, 20), new THREE.MeshStandardMaterial({ color: 0xe0303a })); band.position.y = 0.05;
      hat.add(brim, crown, band); add(hat);
      const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.06, 8, 24), new THREE.MeshStandardMaterial({ color: [0xe0303a, 0x3a7aff, 0x3bbf6a][this.snowmen.indexOf(sm)] }));
      scarf.rotation.x = Math.PI / 2; scarf.position.y = 1.65; add(scarf);
      sm.ring.visible = false;
      sm.label.userData.draw(['⛄ Snowman built!', 'Hooray!']);
      celebrate(this, sm.grp.position.clone().add(new THREE.Vector3(0, 2.5, 0)), 10, '⛄ You built a snowman! +10');
      sm.wave = 4;
    } else if (s === 5) {
      sm.wave = 3;
      game.audio.happy();
      sm.label.userData.draw(['⛄ "Hi friend!"', 'Snowmen love hugs!']);
      sm.stage++;
      return;
    } else {
      // Knock it down and start over.
      sm.parts.forEach((p) => p.removeFromParent());
      sm.parts = []; sm.arms = null; sm.head = null;
      sm.stage = 0; sm.ring.visible = true;
      sm.label.userData.draw(['⛄ Build a snowman!', 'Click / trigger to add the next part']);
      game.particles.burst(sm.grp.position.clone().add(new THREE.Vector3(0, 1, 0)), { count: 40, colors: [0xffffff, 0xe0f0ff], speed: 3 });
      game.audio.noise(0.4, 0.2, 900);
      return;
    }
    game.audio.tone(160, { dur: 0.25, type: 'sine', vol: 0.3, slide: 0.6 }); game.audio.noise(0.2, 0.1, 700);
    game.particles.burst(sm.grp.position.clone().add(new THREE.Vector3(0, 1, 0)), { count: 16, colors: [0xffffff, 0xe0f0ff], speed: 2 });
    sm.stage++;
  }

  buildTargets() {
    // Floating rings to throw snowballs through, and snowmen with hats to knock off.
    const ringSpots = [[6, 3, -4], [-6, 4, -6], [0, 5.5, -10]];
    ringSpots.forEach(([x, y, z], i) => {
      const gy = snowHeight(x, z);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.08, 10, 32), new THREE.MeshStandardMaterial({ color: [0xff4d6d, 0x3bceac, 0xffd23f][i], emissive: [0xff4d6d, 0x3bceac, 0xffd23f][i], emissiveIntensity: 0.4 }));
      ring.position.set(x, gy + y, z);
      this.group.add(ring);
      this.targets.push({ ring, center: ring.position.clone(), r: 0.75, pts: 3 + i, phase: rand(0, 6) });
    });
    const sign = makeLabel(['❄️ Snowball Toss', 'Throw snowballs through the rings!'], { size: 4, font: 58 });
    sign.position.set(0, snowHeight(0, -2) + 3.2, -2); this.group.add(sign);
  }

  makeSnowball(p) {
    const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.09, 2), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }));
    ball.castShadow = true;
    const at = p?.isDesktop ? this.game.camera.getWorldPosition(new THREE.Vector3()) : p.grip.getWorldPosition(new THREE.Vector3());
    ball.position.copy(at);
    this.group.add(ball);
    const body = this.game.physics.add(ball, {
      radius: 0.09, bounce: 0.1, friction: 2, kickable: false, label: 'Pick up snowball',
      onGround: (b) => this.splat(b),
    });
    body.userData.onThrow = (b) => { b.thrown = true; b.prev = b.mesh.position.clone(); };
    this.snowballs.push(body);
    if (this.snowballs.length > 10) this.removeSnowball(this.snowballs[0]);
    this.game.audio.noise(0.15, 0.1, 1200);
    return body;
  }

  removeSnowball(b) {
    this.game.physics.remove(b);
    this.snowballs.splice(this.snowballs.indexOf(b), 1);
  }

  splat(b) {
    if (!b.thrown) return;
    this.game.particles.burst(b.mesh.position.clone(), { count: 14, colors: [0xffffff, 0xe8f4ff], speed: 1.8 });
    this.game.audio.noise(0.12, 0.15, 1500);
    this.removeSnowball(b);
  }

  // VR: squeezing grip with an empty hand scoops a snowball.
  onGrabEmpty(p) { return p.isDesktop ? null : this.makeSnowball(p); }

  buildSnowfall() {
    const n = 2500, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) pos.set([rand(-30, 30), rand(0, 20), rand(-30, 30)], i * 3);
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.snowfall = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.07, map: getDotTexture(), color: 0xffffff, transparent: true, depthWrite: false, opacity: 0.9 }));
    this.snowfall.frustumCulled = false;
    this.group.add(this.snowfall);
  }

  async buildCocoaStand() {
    const g = this.group;
    const x = 10, z = 16, y = snowHeight(x, z);
    const wood = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.9 });
    const counter = new THREE.Mesh(new THREE.BoxGeometry(3, 1.1, 1), wood); counter.position.set(x, y + 0.55, z); counter.castShadow = true; g.add(counter);
    const c = document.createElement('canvas'); c.width = 256; c.height = 32;
    const ctx = c.getContext('2d');
    for (let k = 0; k < 8; k++) { ctx.fillStyle = k % 2 ? '#e0303a' : '#ffffff'; ctx.fillRect(k * 32, 0, 32, 32); }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.1, 1.6), new THREE.MeshStandardMaterial({ map: tex })); roof.position.set(x, y + 2.5, z); roof.rotation.x = 0.15; g.add(roof);
    for (const dx of [-1.5, 1.5]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.5), wood); post.position.set(x + dx, y + 1.25, z - 0.4); g.add(post); }
    const sign = makeLabel(['☕ Hot Cocoa', 'Free marshmallows!'], { size: 2.6, font: 60 });
    sign.position.set(x, y + 3.3, z); g.add(sign);
    const bucket = fitModel(await loadModel('wooden_bucket_01'), 0.4);
    bucket.position.set(x - 0.9, y + 1.1, z); g.add(bucket);
    spawnBonusMallow(this, new THREE.Vector3(x, y + 1.5, z - 0.2), { respawn: 15000 });
    spawnBonusMallow(this, new THREE.Vector3(x + 0.8, y + 1.5, z - 0.2), { respawn: 15000 });
  }

  update(dt, t) {
    const game = this.game, pl = game.player;
    this.portal.update(t);
    animateAll(this, t);

    // Snowfall follows you.
    const sp = this.snowfall.geometry.attributes.position;
    for (let i = 0; i < sp.count; i++) {
      let y = sp.getY(i) - dt * 1.2;
      if (y < pl.feet.y - 2) y += 22;
      sp.setY(i, y);
      sp.setX(i, sp.getX(i) + Math.sin(t + i) * dt * 0.2);
    }
    sp.needsUpdate = true;
    this.snowfall.position.set(Math.round(pl.feet.x / 60) * 60 * 0 + pl.feet.x, 0, pl.feet.z);

    // Magic lift by standing on it.
    if (!game.loading && !pl.vehicle && pl.feet.distanceTo(this.liftPad.position) < 1.3 && !this.lifting) {
      this.lifting = true; this.lift(); setTimeout(() => { this.lifting = false; }, 2500);
    }

    // Sled runs.
    if (pl.ride === 'sled') {
      this.runMax = Math.max(this.runMax || 0, pl.speed);
      if (pl.feet.z > HILL.z + 26 && pl.speed < 1.5 && !this.runDone) {
        this.runDone = true;
        if (this.runMax > 6) celebrate(this, pl.feet.clone().add(new THREE.Vector3(0, 2, 0)), 4, `🛷 Wheee! Top speed ${Math.round(this.runMax * 3.6)} km/h! +4`);
        setTimeout(() => game.toast('Hop off (F / B) and take the 🚡 magic lift back up!'), 1500);
      }
    } else this.runDone = false;

    // Skating earns happiness.
    if (this.surfaceAt(pl.feet.x, pl.feet.z) === 'ice' && !pl.vehicle) {
      this.skateDist += pl.speed * dt;
      if (this.skateDist > 60) { this.skateDist = 0; game.addHappiness(2, pl.feet.clone().add(new THREE.Vector3(0, 2, 0))); game.toast('⛸️ Graceful gliding! +2'); }
    }

    // Ring targets.
    for (const tg of this.targets) {
      tg.ring.position.y = tg.center.y + Math.sin(t + tg.phase) * 0.3;
      tg.ring.rotation.y = Math.sin(t * 0.5 + tg.phase) * 0.6;
      tg.flash = Math.max(0, (tg.flash || 0) - dt);
      tg.ring.material.emissiveIntensity = 0.4 + tg.flash * 2;
    }
    for (const b of [...this.snowballs]) {
      if (!b.thrown || b.held) continue;
      const p = b.mesh.position;
      for (const tg of this.targets) {
        const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(tg.ring.quaternion);
        const d0 = b.prev.clone().sub(tg.ring.position).dot(normal), d1 = p.clone().sub(tg.ring.position).dot(normal);
        if (d0 * d1 < 0) {
          const k = d0 / (d0 - d1);
          const cross = b.prev.clone().lerp(p, k);
          if (cross.distanceTo(tg.ring.position) < tg.r) {
            tg.flash = 1;
            celebrate(this, tg.ring.position.clone(), tg.pts, `❄️ Through the ring! +${tg.pts}`);
          }
        }
      }
      // Bonk a finished snowman.
      for (const sm of this.snowmen) {
        if (sm.head && p.distanceTo(sm.head.getWorldPosition(new THREE.Vector3())) < 0.4) {
          sm.wave = 2; game.audio.tone(600, { dur: 0.2, slide: 0.5, vol: 0.15 });
          sm.label.userData.draw(['⛄ "Hey! Hehe!"', 'Snowball fight!']);
          if (!sm.bonked) { sm.bonked = true; game.addHappiness(1, p.clone()); }
          this.splat(b);
          break;
        }
      }
      b.prev = p.clone();
      if (p.y < -10) this.removeSnowball(b);
    }

    // Snowmen wave their stick arms.
    for (const sm of this.snowmen) {
      if (!sm.arms) continue;
      sm.wave = Math.max(0, sm.wave - dt);
      const w = sm.wave > 0 ? Math.sin(t * 10) * 0.5 : 0;
      sm.arms[0].rotation.z = 1.0 + w; sm.arms[1].rotation.z = -1.0 - w * 0.3;
    }
  }
}
