// The sunset cloud hub: collect marshmallows, cash them in at the cocoa mug, open portals.
import * as THREE from 'three';
import { makeCloudGeometry, cloudMaterial, getMarshmallowGeometry, getMarshmallowMaterial, makeLabel, makePortalMaterial, getPuffTexture, rand, pick } from '../util.js';
import { PORTALS, HAPPINESS_PER_MALLOW } from '../config.js';

const ISLAND_R = 22;

export default class Hub {
  constructor(game) {
    this.game = game;
    this.hdri = 'belfast_sunset_puresky';
    this.exposure = 0.7;
    this.sunYaw = Math.PI; // sunset behind the portals
    this.sunColor = 0xffb27a;
    this.sunIntensity = 2.6;
    this.skyColor = 0xffd0c0; this.groundColor = 0x9a6fa0;
    this.spawn = { pos: new THREE.Vector3(0, 0, 9), yaw: 0 };
    this.radius = 200;
    this.killY = -25;
    this.respawnText = '☁️ Whee! The clouds caught you';
    this.welcome = 'Welcome to Happy Clouds! Collect marshmallows 🍡 and drop them in the cocoa mug ☕';
    this.platforms = [];
    this.bouncers = [];
    this.portals = [];
    this.mallowSpots = [];
    this.time = 0;
  }

  async build() {
    const g = this.group;
    const mat = cloudMaterial();

    // Main walkable cloud island.
    const puffs = [];
    for (let r = 0; r <= ISLAND_R; r += 2.6) {
      const n = Math.max(1, Math.round((2 * Math.PI * r) / 2.8));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rand(-0.2, 0.2);
        const edge = r > ISLAND_R - 3;
        const pr = edge ? rand(2.8, 3.8) : rand(2.2, 3);
        puffs.push({ x: Math.cos(a) * r, y: -pr * 0.72 + rand(0.05, 0.35) - (edge ? 0.6 : 0), z: Math.sin(a) * r, r: pr });
      }
    }
    // Underside so it looks like a floating island from the platforms.
    for (let i = 0; i < 40; i++) {
      const a = rand(0, Math.PI * 2), r = rand(0, ISLAND_R - 4);
      puffs.push({ x: Math.cos(a) * r, y: rand(-6, -3), z: Math.sin(a) * r, r: rand(3, 5) });
    }
    const island = new THREE.Mesh(makeCloudGeometry(puffs), mat);
    island.receiveShadow = true;
    g.add(island);

    // Floating cloud platforms with golden marshmallows on top, reached by bouncy clouds.
    const platDefs = [
      { a: 0.5, d: 12, h: 5 }, { a: 1.9, d: 26, h: 7 }, { a: 2.9, d: 13, h: 9 },
      { a: 4.1, d: 27, h: 6 }, { a: 5.3, d: 14, h: 11 }, { a: 3.5, d: 33, h: 4 },
    ];
    for (const pd of platDefs) {
      const x = Math.cos(pd.a) * pd.d, z = Math.sin(pd.a) * pd.d, r = 3.2;
      const pp = [];
      for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; pp.push({ x: Math.cos(a) * 1.8, y: -1.4, z: Math.sin(a) * 1.8, r: rand(1.5, 2.1) }); }
      pp.push({ x: 0, y: -1.2, z: 0, r: 2.2 }, { x: 0, y: -2.4, z: 0, r: 1.8 });
      const m = new THREE.Mesh(makeCloudGeometry(pp), mat);
      m.position.set(x, pd.h, z);
      m.castShadow = true; m.receiveShadow = true;
      g.add(m);
      const plat = { x, z, r, top: pd.h, mesh: m, baseY: pd.h, phase: rand(0, 6) };
      this.platforms.push(plat);
      for (let k = 0; k < 2; k++) this.mallowSpots.push({ platform: plat, ox: rand(-1.2, 1.2), oz: rand(-1.2, 1.2), golden: true });
    }

    // Bouncy pink clouds near the edge of the island launch you up to the platforms.
    const bounceMat = cloudMaterial();
    bounceMat.emissive.set(0xff6aa0); bounceMat.emissiveIntensity = 0.25;
    for (const p of this.platforms) {
      let bx, bz;
      const d = Math.hypot(p.x, p.z);
      if (d < ISLAND_R - 2) { bx = p.x * 0.6; bz = p.z * 0.6; } else { bx = (p.x / d) * (ISLAND_R - 3); bz = (p.z / d) * (ISLAND_R - 3); }
      const pp = [{ x: 0, y: -0.5, z: 0, r: 1 }, { x: 0.7, y: -0.6, z: 0.2, r: 0.7 }, { x: -0.6, y: -0.6, z: -0.3, r: 0.75 }];
      const geo = makeCloudGeometry(pp, { top: 0xffd6ec, bottom: 0xff8fc6, warm: 0xffb0a0 });
      const m = new THREE.Mesh(geo, bounceMat);
      m.position.set(bx, 0.35, bz);
      g.add(m);
      const label = makeLabel('Bounce!', { size: 0.9, font: 60 });
      label.position.set(bx, 1.9, bz);
      g.add(label);
      // Aim: velocity needed to land on the platform.
      const dx = p.x - bx, dz = p.z - bz, horiz = Math.hypot(dx, dz);
      const vy = Math.sqrt(2 * 9.8 * (p.top + 2.5));
      const tUp = vy / 9.8, tDown = Math.sqrt((2 * 2.5) / 9.8);
      const vh = horiz / (tUp + tDown);
      this.bouncers.push({ x: bx, z: bz, r: 1.1, mesh: m, vy, vx: (dx / horiz) * vh, vz: (dz / horiz) * vh, squish: 0 });
    }

    this.buildMug();
    this.buildPortals();
    this.buildSky();

    // Marshmallow spots on the main island.
    for (let i = 0; i < 34; i++) {
      const a = rand(0, Math.PI * 2), r = rand(3.5, ISLAND_R - 2);
      this.mallowSpots.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, y: rand(0.9, 1.7) });
    }
    // A loop of sky marshmallows to collect mid-bounce.
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      this.mallowSpots.push({ x: Math.cos(a) * 9, z: Math.sin(a) * 9, y: 4.5 + Math.sin(a * 3) * 1.5 });
    }
    for (const s of this.mallowSpots) this.spawnMallow(s);

    // Ambient sparkles.
    this.sparkles = this.makeSparkles();
    g.add(this.sparkles);
  }

  spawnMallow(spot) {
    const golden = !!spot.golden;
    const kind = golden ? 'golden' : pick(['white', 'white', 'white', 'pink', 'blue', 'mint']);
    const m = new THREE.Mesh(getMarshmallowGeometry(), getMarshmallowMaterial(kind));
    m.userData.shared = true;
    const s = golden ? 1.6 : 1.25;
    m.scale.setScalar(s);
    m.castShadow = true;
    m.rotation.set(rand(-0.4, 0.4), rand(0, 6), rand(-0.4, 0.4));
    spot.mesh = m;
    spot.phase = rand(0, Math.PI * 2);
    this.placeSpot(spot, 0);
    this.group.add(m);
    this.game.collectible(m, {
      radius: 0.55, label: golden ? 'Golden marshmallow (worth 3)!' : 'Grab marshmallow',
      onCollect: (_obj, at) => {
        m.removeFromParent();
        spot.mesh = null;
        this.combo = (this.combo || 0) + 1;
        clearTimeout(this.comboT); this.comboT = setTimeout(() => { this.combo = 0; }, 1500);
        this.game.audio.collect(this.combo);
        this.game.addMallows(golden ? 3 : 1, at.add(new THREE.Vector3(0, 0.4, 0)));
        if (this.game.state.mallows === 1 && !this.hinted) { this.hinted = true; this.game.toast('Yum! Bring them to the giant cocoa mug ☕ in the middle'); }
        setTimeout(() => { if (this.group.parent) this.spawnMallow(spot); }, rand(12000, 20000));
      },
    });
  }

  placeSpot(spot, t) {
    const m = spot.mesh;
    if (!m || m.userData.collectible?.flying) return;
    if (spot.platform) m.position.set(spot.platform.x + spot.ox, spot.platform.top + 1.1 + Math.sin(t * 2 + spot.phase) * 0.12, spot.platform.z + spot.oz);
    else m.position.set(spot.x, spot.y + Math.sin(t * 1.6 + spot.phase) * 0.15, spot.z);
    m.rotation.y = t * 0.8 + spot.phase;
  }

  buildMug() {
    const g = new THREE.Group();
    const pts = [];
    const R = 2.2, H = 2.6;
    pts.push(new THREE.Vector2(0, 0), new THREE.Vector2(R - 0.1, 0), new THREE.Vector2(R, 0.1), new THREE.Vector2(R + 0.1, H * 0.5), new THREE.Vector2(R + 0.15, H),
      new THREE.Vector2(R - 0.1, H + 0.05), new THREE.Vector2(R - 0.18, H * 0.5), new THREE.Vector2(R - 0.25, 0.25), new THREE.Vector2(0, 0.25));
    const mugMat = new THREE.MeshPhysicalMaterial({ color: 0xff7f9e, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1 });
    const body = new THREE.Mesh(new THREE.LatheGeometry(pts, 48), mugMat);
    body.castShadow = true; body.receiveShadow = true;
    g.add(body);
    // Polka dots.
    const dotMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.3, clearcoat: 1 });
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2 + (i % 2) * 0.17, y = i % 2 ? 0.8 : 1.8;
      const dot = new THREE.Mesh(new THREE.CircleGeometry(0.22, 20), dotMat);
      const r = R + 0.13 + (y / H) * 0.05;
      dot.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
      dot.lookAt(Math.cos(a) * 10, y, Math.sin(a) * 10);
      g.add(dot);
    }
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.22, 16, 32, Math.PI * 1.2), mugMat);
    handle.position.set(R + 0.25, H * 0.5, 0); handle.rotation.z = -Math.PI * 0.6;
    g.add(handle);
    const cocoa = new THREE.Mesh(new THREE.CircleGeometry(R - 0.12, 48), new THREE.MeshStandardMaterial({ color: 0x5a2e1a, roughness: 0.25, metalness: 0.1 }));
    cocoa.rotation.x = -Math.PI / 2; cocoa.position.y = H - 0.25;
    g.add(cocoa);
    // Floating marshmallows already in the cocoa.
    this.cocoaMallows = [];
    for (let i = 0; i < 9; i++) {
      const m = new THREE.Mesh(getMarshmallowGeometry(), getMarshmallowMaterial(pick(['white', 'pink', 'white'])));
      m.userData.shared = true;
      const a = rand(0, 6.28), r = rand(0.2, 1.6);
      m.position.set(Math.cos(a) * r, H - 0.22, Math.sin(a) * r); m.rotation.set(Math.PI / 2, 0, rand(0, 6)); m.scale.setScalar(1.6);
      g.add(m); this.cocoaMallows.push(m);
    }
    // Steam.
    this.steam = [];
    const steamMat = new THREE.SpriteMaterial({ map: getPuffTexture(), color: 0xffffff, transparent: true, opacity: 0.4, depthWrite: false });
    for (let i = 0; i < 10; i++) {
      const s = new THREE.Sprite(steamMat.clone());
      s.userData.phase = i / 10;
      g.add(s); this.steam.push(s);
    }
    this.mugLabel = makeLabel(['☕ Happiness Cocoa', 'Drop marshmallows in!'], { size: 3.2, font: 64 });
    this.mugLabel.position.set(0, H + 2.4, 0);
    g.add(this.mugLabel);
    g.position.set(0, 0, 0);
    this.group.add(g);
    this.mug = g;
    this.mugTop = H;
    this.game.interact(body, { label: () => `Drop in ${this.game.state.mallows} marshmallows`, distance: 8, onSelect: () => this.redeem() });
  }

  redeem() {
    const game = this.game;
    const n = game.state.mallows;
    if (!n) { game.toast('Collect some floating marshmallows first 🍡'); return; }
    const from = game.camera.getWorldPosition(new THREE.Vector3());
    const visual = Math.min(n, 15);
    for (let i = 0; i < visual; i++) {
      const m = new THREE.Mesh(getMarshmallowGeometry(), getMarshmallowMaterial(pick(['white', 'pink', 'blue', 'mint'])));
      m.userData.shared = true;
      m.scale.setScalar(1.3);
      m.position.copy(from).add(new THREE.Vector3(rand(-0.3, 0.3), -0.3, rand(-0.3, 0.3)));
      m.userData.fly = { t: -i * 0.08, from: m.position.clone(), to: new THREE.Vector3(rand(-1, 1), this.mugTop - 0.1, rand(-1, 1)) };
      this.group.add(m);
      (this.flying ||= []).push(m);
    }
    setTimeout(() => {
      game.redeem();
      game.audio.fanfare();
      game.particles.burst(new THREE.Vector3(0, this.mugTop + 0.5, 0), { count: 80, speed: 6, colors: [0xff6a88, 0xffd36b, 0xffffff, 0x9ad0ff, 0xc6ff9a] });
      game.toast(`+${n * HAPPINESS_PER_MALLOW} happiness! 😊`);
    }, 900);
  }

  buildPortals() {
    const R = 16.5;
    PORTALS.forEach((p, i) => {
      const a = Math.PI + (i - 1.5) * 0.62;
      const x = Math.sin(a) * R, z = Math.cos(a) * R;
      const grp = new THREE.Group();
      grp.position.set(x, 0, z);
      grp.lookAt(0, 0, 0);
      const frameMat = new THREE.MeshStandardMaterial({ color: p.c1, emissive: p.c1, emissiveIntensity: 0.4, roughness: 0.3, metalness: 0.2 });
      const frame = new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.18, 20, 64), frameMat);
      frame.position.y = 2.2; frame.castShadow = true;
      grp.add(frame);
      const discMat = makePortalMaterial(p.c1, p.c2);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(1.62, 48), discMat);
      disc.position.y = 2.2;
      grp.add(disc);
      // Little orbiting gems around the frame.
      const gems = [];
      for (let k = 0; k < 8; k++) {
        const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.12), new THREE.MeshStandardMaterial({ color: p.c2, emissive: p.c2, emissiveIntensity: 0.6 }));
        grp.add(gem); gems.push(gem);
      }
      const base = new THREE.Mesh(makeCloudGeometry([{ x: 0, y: 0, z: 0, r: 1.2 }, { x: 1, y: -0.1, z: 0, r: 0.9 }, { x: -1, y: -0.1, z: 0, r: 0.9 }]), cloudMaterial());
      base.position.y = 0.2;
      grp.add(base);
      const label = makeLabel(this.portalText(p), { size: 5, font: 64 });
      label.position.y = 5.2;
      grp.add(label);
      this.group.add(grp);
      const portal = { def: p, grp, disc, discMat, frame, gems, label, unlocked: this.game.state.happiness >= p.cost };
      discMat.uniforms.locked.value = portal.unlocked ? 0 : 1;
      frameMat.emissiveIntensity = portal.unlocked ? 0.8 : 0.15;
      this.portals.push(portal);
      this.game.interact(disc, {
        distance: 12,
        label: () => (portal.unlocked ? `Enter ${p.name}` : `Needs ${p.cost} 😊 (you have ${this.game.state.happiness})`),
        onSelect: () => {
          if (portal.unlocked) this.game.goTo(p.id);
          else this.game.toast(`${p.icon} ${p.name} opens at ${p.cost} happiness`);
        },
      });
    });
  }

  portalText(p) {
    const open = this.game.state.happiness >= p.cost;
    return [`${p.icon} ${p.name}`, open ? 'Open! Walk in ✨' : `🔒 Needs ${p.cost} 😊`];
  }

  onUnlock(id) {
    const portal = this.portals.find((p) => p.def.id === id);
    if (!portal) return;
    portal.unlocked = true;
    portal.unlocking = 0;
    portal.frame.material.emissiveIntensity = 0.8;
    portal.label.userData.draw(this.portalText(portal.def));
    this.game.particles.burst(portal.grp.position.clone().add(new THREE.Vector3(0, 2.2, 0)), { count: 120, speed: 7, colors: [portal.def.c1, portal.def.c2, 0xffffff] });
  }

  buildSky() {
    const g = this.group;
    // Sea of clouds far below, drawn with a noise shader that fades into the HDRI horizon.
    this.seaMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { t: { value: 0 }, sunDir: { value: new THREE.Vector3(1, 0.2, 0) } },
      vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `
        varying vec3 vW; uniform float t; uniform vec3 sunDir;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
        float fbm(vec2 p){ float v = 0.0, a = 0.5; for(int i=0;i<5;i++){ v += a*n(p); p *= 2.03; a *= 0.5; } return v; }
        void main(){
          vec2 p = vW.xz * 0.012 + vec2(t*0.01, t*0.004);
          float c = fbm(p) * 0.7 + fbm(p*3.0 + 4.0) * 0.3;
          vec2 sd = normalize(sunDir.xz);
          float toward = dot(normalize(vW.xz), sd) * 0.5 + 0.5;
          vec3 shadow = vec3(0.62, 0.48, 0.70);
          vec3 lit = mix(vec3(1.0, 0.80, 0.72), vec3(1.0, 0.62, 0.38), toward);
          vec3 col = mix(shadow, lit, smoothstep(0.35, 0.75, c));
          col += vec3(1.0,0.55,0.3) * pow(toward, 6.0) * 0.35;
          float d = length(vW.xz);
          float a = smoothstep(1400.0, 500.0, d) * smoothstep(0.25, 0.5, c + 0.15);
          gl_FragColor = vec4(col, a);
        }`,
    });
    const sea = new THREE.Mesh(new THREE.CircleGeometry(1500, 64), this.seaMat);
    sea.rotation.x = -Math.PI / 2; sea.position.y = -45;
    g.add(sea);

    // Big billboard clouds all around for depth.
    this.billboards = [];
    const tex = getPuffTexture();
    for (let i = 0; i < 70; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, color: 0xffffff, opacity: rand(0.6, 0.95), fog: false }));
      const a = rand(0, Math.PI * 2), d = rand(70, 420);
      s.position.set(Math.cos(a) * d, rand(-35, 25), Math.sin(a) * d);
      const sc = rand(30, 110) * (d / 200 + 0.4);
      s.scale.set(sc, sc * 0.55, 1);
      s.userData.a = a;
      g.add(s); this.billboards.push(s);
    }

    // Rainbow arch behind the portals.
    const colors = [0xff4d4d, 0xff9a3d, 0xffe14d, 0x5fd35f, 0x4db8ff, 0x6f6bff, 0xb06bff];
    const rainbow = new THREE.Group();
    colors.forEach((c, i) => {
      const m = new THREE.Mesh(new THREE.TorusGeometry(40 - i * 1.4, 0.7, 8, 96, Math.PI), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.5, depthWrite: false }));
      rainbow.add(m);
    });
    rainbow.position.set(0, -12, -55);
    g.add(rainbow);

    // Hot air balloons drifting by.
    this.balloons = [];
    const stripes = [[0xff6a88, 0xffe08a], [0x7ad0ff, 0xffffff], [0xb48cff, 0xffb3e6], [0x6be3a8, 0xfff2a8]];
    stripes.forEach((pair, i) => {
      const c = document.createElement('canvas'); c.width = 256; c.height = 64;
      const ctx = c.getContext('2d');
      for (let k = 0; k < 8; k++) { ctx.fillStyle = '#' + new THREE.Color(pair[k % 2]).getHexString(); ctx.fillRect(k * 32, 0, 32, 64); }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      const b = new THREE.Group();
      const env = new THREE.Mesh(new THREE.SphereGeometry(3, 32, 20), new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 }));
      env.scale.set(1, 1.2, 1);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(1.8, 2.4, 24, 1, true), new THREE.MeshStandardMaterial({ map: t, roughness: 0.6, side: THREE.DoubleSide }));
      cone.rotation.x = Math.PI; cone.position.y = -3.6;
      const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.6, 0.8, 12), new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 1 }));
      basket.position.y = -5.6;
      b.add(env, cone, basket);
      b.userData = { a: (i / 4) * Math.PI * 2, d: rand(45, 80), y: rand(2, 18), speed: rand(0.01, 0.025) * (i % 2 ? 1 : -1) };
      g.add(b); this.balloons.push(b);
    });
  }

  makeSparkles() {
    const n = 300, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const a = rand(0, 6.28), r = rand(0, 30); pos.set([Math.cos(a) * r, rand(0.3, 12), Math.sin(a) * r], i * 3); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.08, color: 0xffe0b0, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
  }

  onSun(dir) {
    this.seaMat.uniforms.sunDir.value.copy(dir);
    const warm = new THREE.Color(0xffb38a), cool = new THREE.Color(0xd7b8e0), c = new THREE.Color();
    const sd = new THREE.Vector2(dir.x, dir.z).normalize();
    for (const s of this.billboards) {
      const k = (Math.cos(s.userData.a) * sd.x + Math.sin(s.userData.a) * sd.y) * 0.5 + 0.5;
      s.material.color.copy(c.copy(cool).lerp(warm, k));
    }
  }

  getGround(x, z, y) {
    let g = Math.hypot(x, z) < ISLAND_R + 0.5 ? 0 : -1000;
    for (const p of this.platforms) {
      if (Math.hypot(x - p.x, z - p.z) < p.r && y >= p.top - 0.5) g = Math.max(g, p.top);
    }
    return g;
  }

  // Can't walk through the mug.
  blocked(x, z, y) { return y < this.mugTop && Math.hypot(x, z) < 2.7; }

  update(dt, t) {
    const game = this.game, pl = game.player;
    this.time = t;
    for (const s of this.mallowSpots) this.placeSpot(s, t);

    // Platforms bob gently (and carry you with them).
    for (const p of this.platforms) {
      const prev = p.top;
      p.top = p.baseY + Math.sin(t * 0.5 + p.phase) * 0.3;
      p.mesh.position.y = p.top;
      if (pl.grounded && Math.abs(pl.feet.y - prev) < 0.05 && Math.hypot(pl.feet.x - p.x, pl.feet.z - p.z) < p.r) pl.feet.y = p.top;
    }

    // Bouncers.
    for (const b of this.bouncers) {
      b.squish = Math.max(0, b.squish - dt * 3);
      const s = 1 + Math.sin(b.squish * 12) * b.squish * 0.3;
      b.mesh.scale.set(s, 2 - s, s);
      if (pl.grounded && pl.feet.y < 0.5 && Math.hypot(pl.feet.x - b.x, pl.feet.z - b.z) < b.r) {
        game.launch(b.vy);
        this.carry = { vx: b.vx, vz: b.vz, age: 0 };
        b.squish = 1;
        game.audio.tone(200, { dur: 0.5, slide: 4, vol: 0.25, type: 'sine' });
        game.hapticAll(0.8, 120);
      }
    }
    // Walking has no momentum, so carry the bouncer's sideways push until you land.
    if (this.carry) {
      this.carry.age += dt;
      if (pl.grounded && this.carry.age > 0.2) this.carry = null;
      else { pl.feet.x += this.carry.vx * dt; pl.feet.z += this.carry.vz * dt; }
    }

    // Portals.
    const head = game.camera.getWorldPosition(new THREE.Vector3());
    for (const p of this.portals) {
      p.discMat.uniforms.t.value = t;
      if (p.unlocking !== undefined) { p.unlocking += dt; p.discMat.uniforms.locked.value = Math.max(0, 1 - p.unlocking); }
      p.gems.forEach((gem, k) => {
        const a = t * (p.unlocked ? 1.2 : 0.3) + (k / p.gems.length) * Math.PI * 2;
        gem.position.set(Math.cos(a) * 2.05, 2.2 + Math.sin(a) * 2.05, 0);
        gem.rotation.y = t * 2;
      });
      const local = p.grp.worldToLocal(head.clone());
      if (Math.abs(local.z) < 0.45 && Math.hypot(local.x, local.y - 2.2) < 1.6) {
        if (p.unlocked) game.goTo(p.def.id);
        else if (!this.lockToastT || t - this.lockToastT > 3) { this.lockToastT = t; game.toast(`${p.def.icon} Needs ${p.def.cost} happiness. Keep collecting!`); }
      }
    }

    // Mug steam and bobbing marshmallows.
    this.steam.forEach((s) => {
      const k = (t * 0.25 + s.userData.phase) % 1;
      s.position.set(Math.sin(k * 6 + s.userData.phase * 20) * 0.8, this.mugTop + k * 4, Math.cos(k * 5 + s.userData.phase * 10) * 0.8);
      const sc = 1 + k * 2.5; s.scale.set(sc, sc, 1);
      s.material.opacity = 0.35 * Math.sin(k * Math.PI);
    });
    this.cocoaMallows.forEach((m, i) => { m.position.y = this.mugTop - 0.22 + Math.sin(t * 1.5 + i) * 0.03; m.rotation.z += dt * 0.1; });
    if (this.flying) {
      this.flying = this.flying.filter((m) => {
        const f = m.userData.fly;
        f.t += dt * 1.4;
        const k = Math.max(0, Math.min(1, f.t));
        m.position.lerpVectors(f.from, f.to, k);
        m.position.y += Math.sin(k * Math.PI) * 3;
        m.rotation.x += dt * 6;
        if (k >= 1) { m.removeFromParent(); game.audio.pop(); return false; }
        return true;
      });
    }

    this.seaMat.uniforms.t.value = t;
    for (const b of this.balloons) {
      const u = b.userData; u.a += u.speed * dt;
      b.position.set(Math.cos(u.a) * u.d, u.y + Math.sin(t * 0.3 + u.d) * 1.5, Math.sin(u.a) * u.d);
    }
    this.sparkles.rotation.y = t * 0.02;
    this.sparkles.material.opacity = 0.5 + Math.sin(t * 2) * 0.3;
  }
}
