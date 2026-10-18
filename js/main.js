import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { initAssets, loadHDRI } from './assets.js';
import { Audio } from './audio.js';
import { Physics } from './physics.js';
import { Particles, makeLabel, clamp } from './util.js';
import { PORTALS, HAPPINESS_PER_MALLOW, RIDES } from './config.js';

const WORLDS = {
  hub: () => import('./worlds/hub.js'),
  bricks: () => import('./worlds/bricks.js'),
  park: () => import('./worlds/park.js'),
  beach: () => import('./worlds/beach.js'),
  snow: () => import('./worlds/snow.js'),
};
const SAVE_KEY = 'happy-clouds-save-v1';

class Game {
  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.xr.enabled = true;
    this.renderer.xr.setFoveation(1);
    document.body.appendChild(this.renderer.domElement);
    initAssets(this.renderer);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 3000);
    this.rig = new THREE.Group();
    this.rig.add(this.camera);
    this.camera.position.y = 1.6;
    this.scene.add(this.rig);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x886677, 0.4);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.5);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera; sc.left = sc.bottom = -30; sc.right = sc.top = 30; sc.near = 1; sc.far = 200;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.hemi, this.sun, this.sun.target);

    this.audio = new Audio();
    this.physics = new Physics(this);
    this.particles = new Particles(this.scene, 800);
    this.clock = new THREE.Clock();

    this.player = {
      feet: this.rig.position, vel: new THREE.Vector3(), vy: 0, grounded: true, speed: 0, yaw: 0, pitch: 0,
      ride: 'walk', vehicle: null, heading: 0, prevGround: 0,
    };
    this.keys = {};
    this.interactables = new Map();   // object -> def
    this.collectibles = new Set();
    this.pointers = [];
    this.held = new Map();             // pointer -> body
    this.load();
    this.setupDesktopInput();
    this.setupXR();
    this.setupHud();
    this.setupFade();
    addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    });
    this.renderer.setAnimationLoop(() => this.frame());
  }

  get isVR() { return this.renderer.xr.isPresenting; }

  // ---------- Save data ----------
  load() {
    try { this.state = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch { this.state = null; }
    this.state = Object.assign({ mallows: 0, happiness: 0, unlocked: [], visited: [] }, this.state || {});
  }
  save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.state)); } catch { /* storage unavailable */ } }

  addMallows(n, at) {
    this.state.mallows += n; this.save(); this.updateHud();
    if (at) this.floatText(`+${n} 🍡`, at);
  }
  addHappiness(n, at) {
    const before = this.state.happiness;
    this.state.happiness += n; this.save(); this.updateHud();
    if (at) this.floatText(`+${n} 😊`, at, '#ff6a88');
    for (const p of PORTALS) {
      if (before < p.cost && this.state.happiness >= p.cost && !this.state.unlocked.includes(p.id)) {
        this.state.unlocked.push(p.id); this.save();
        this.audio.unlock();
        this.toast(`${p.icon} The ${p.name} portal is open!`, 4000);
        this.world?.onUnlock?.(p.id);
      }
    }
  }
  redeem() {
    const n = this.state.mallows;
    if (!n) return 0;
    this.state.mallows = 0;
    this.addHappiness(n * HAPPINESS_PER_MALLOW);
    return n;
  }

  // ---------- HUD ----------
  setupHud() {
    this.dom = {
      hud: document.getElementById('hud'), mallows: document.getElementById('hud-mallows'), happy: document.getElementById('hud-happy'),
      goal: document.getElementById('hud-goal'), bar: document.getElementById('hud-bar'), extra: document.getElementById('hud-extra'),
      cross: document.getElementById('crosshair'), prompt: document.getElementById('prompt'), toasts: document.getElementById('toasts'),
    };
    // VR wrist panel.
    this.vrHudCanvas = document.createElement('canvas');
    this.vrHudCanvas.width = 512; this.vrHudCanvas.height = 300;
    this.vrHudTex = new THREE.CanvasTexture(this.vrHudCanvas);
    this.vrHudTex.colorSpace = THREE.SRGBColorSpace;
    this.vrHud = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.117), new THREE.MeshBasicMaterial({ map: this.vrHudTex, transparent: true, depthTest: false }));
    this.vrHud.renderOrder = 10;
    this.vrToast = makeLabel(' ', { size: 0.9, font: 56 });
    this.vrToast.material.depthTest = false; this.vrToast.renderOrder = 11;
    this.vrToast.position.set(0, -0.25, -1.4); this.vrToast.visible = false;
    this.camera.add(this.vrToast);
    this.vrPrompt = makeLabel(' ', { size: 0.5, font: 52, bg: 'rgba(40,20,50,0.75)', color: '#ffffff' });
    this.vrPrompt.material.depthTest = false; this.vrPrompt.renderOrder = 11; this.vrPrompt.visible = false;
    this.scene.add(this.vrPrompt);
    this.updateHud();
  }

  nextPortal() { return PORTALS.find((p) => this.state.happiness < p.cost); }

  setExtraHud(text) { this.extraHud = text; this.updateHud(); }

  updateHud() {
    const s = this.state, next = this.nextPortal();
    if (!this.dom) return;
    this.dom.mallows.textContent = s.mallows;
    this.dom.happy.textContent = s.happiness;
    let prev = 0;
    for (const p of PORTALS) { if (s.happiness >= p.cost) prev = p.cost; }
    const pct = next ? (s.happiness - prev) / (next.cost - prev) : 1;
    this.dom.goal.textContent = next ? `${next.icon} ${next.cost - s.happiness} to go` : 'All portals open! 🌈';
    this.dom.bar.style.width = `${clamp(pct, 0, 1) * 100}%`;
    this.dom.extra.textContent = this.extraHud || '';

    const g = this.vrHudCanvas.getContext('2d');
    g.clearRect(0, 0, 512, 300);
    g.fillStyle = 'rgba(255,246,240,0.92)'; g.beginPath(); g.roundRect(4, 4, 504, 292, 40); g.fill();
    g.fillStyle = '#3b2340'; g.font = 'bold 54px "Trebuchet MS", sans-serif'; g.textBaseline = 'middle';
    g.fillText(`🍡 ${s.mallows}`, 30, 60); g.fillText(`😊 ${s.happiness}`, 270, 60);
    g.font = 'bold 34px "Trebuchet MS", sans-serif';
    g.fillText(next ? `${next.icon} ${next.name}: ${next.cost - s.happiness} to go` : 'All portals open! 🌈', 30, 140);
    g.fillStyle = 'rgba(0,0,0,0.12)'; g.beginPath(); g.roundRect(30, 172, 452, 26, 13); g.fill();
    const grd = g.createLinearGradient(30, 0, 482, 0); grd.addColorStop(0, '#ff7a8a'); grd.addColorStop(1, '#ffb36b');
    g.fillStyle = grd; g.beginPath(); g.roundRect(30, 172, Math.max(26, 452 * clamp(pct, 0, 1)), 26, 13); g.fill();
    g.fillStyle = '#3b2340'; g.font = 'bold 32px "Trebuchet MS", sans-serif';
    if (this.extraHud) g.fillText(this.extraHud, 30, 250);
    this.vrHudTex.needsUpdate = true;
  }

  toast(text, ms = 2500) {
    const el = document.createElement('div');
    el.className = 'toast'; el.textContent = text;
    this.dom.toasts.appendChild(el);
    while (this.dom.toasts.children.length > 3) this.dom.toasts.firstChild.remove();
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 500); }, ms);
    this.vrToast.userData.draw([text]);
    this.vrToast.visible = this.isVR;
    clearTimeout(this._vrToastT);
    this._vrToastT = setTimeout(() => { this.vrToast.visible = false; }, ms);
  }

  // Short-lived floating "+5" text in the world.
  floatText(text, at, color = '#3b2340') {
    const s = makeLabel(text, { size: 0.6, font: 72, color, bg: 'rgba(255,255,255,0.85)', width: 512 });
    s.position.copy(at);
    s.userData.life = 1.4;
    this.scene.add(s);
    (this.floaters ||= []).push(s);
  }

  // ---------- Fade ----------
  setupFade() {
    this.dom.fade = document.getElementById('fade');
    this.fadeSphere = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), new THREE.MeshBasicMaterial({ color: 0x1a0f24, side: THREE.BackSide, transparent: true, opacity: 0, depthTest: false }));
    this.fadeSphere.renderOrder = 100;
    this.camera.add(this.fadeSphere);
    this.fadeTarget = 0;
  }
  fade(to) {
    this.fadeTarget = to;
    this.dom.fade.style.opacity = String(to);
    return new Promise((r) => setTimeout(r, 480));
  }

  // ---------- Interaction registry ----------
  interact(obj, def) { this.interactables.set(obj, { distance: 6, ...def }); }
  uninteract(obj) { this.interactables.delete(obj); }

  // Collectible: auto-collected on touch; with magnet, pointing + trigger pulls it to you.
  collectible(obj, { radius = 0.5, magnet = true, label = 'Collect', onCollect } = {}) {
    const c = { obj, radius, onCollect, flying: false };
    obj.userData.collectible = c;
    this.collectibles.add(c);
    if (magnet) this.interact(obj, { label, distance: 30, onSelect: () => { c.flying = true; this.audio.pop(); } });
    return c;
  }

  haptic(pointer, strength = 0.5, ms = 60) {
    const gp = pointer?.source?.gamepad;
    const act = gp?.hapticActuators?.[0];
    if (act?.pulse) act.pulse(strength, ms);
  }
  hapticAll(strength, ms) { this.pointers.forEach((p) => this.haptic(p, strength, ms)); }

  // ---------- Desktop input ----------
  setupDesktopInput() {
    const canvas = this.renderer.domElement;
    this.desktopPointer = { id: 'desktop', ray: new THREE.Raycaster(), hover: null, source: null, isDesktop: true };
    addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (!this.started || this.isVR) return;
      if (e.code === 'Space') this.jump();
      if (e.code === 'KeyE') this.grabOrRelease(this.desktopPointer);
      if (e.code === 'KeyF') this.secondary(this.desktopPointer);
      if (e.code === 'KeyR') this.world?.onCycle?.();
      if (e.code === 'KeyM') { this.audio.musicOn = !this.audio.musicOn; this.toast(this.audio.musicOn ? '🎵 Music on' : '🔇 Music off'); }
    });
    addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    canvas.addEventListener('click', () => { if (this.started && !this.isVR && document.pointerLockElement !== canvas) canvas.requestPointerLock()?.catch?.(() => {}); });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('mousedown', (e) => {
      if (document.pointerLockElement !== canvas) return;
      if (e.button === 0) this.select(this.desktopPointer);
      if (e.button === 2) this.secondary(this.desktopPointer);
    });
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== canvas) return;
      this.player.yaw -= e.movementX * 0.0022;
      this.player.pitch = clamp(this.player.pitch - e.movementY * 0.0022, -1.45, 1.45);
    });
  }

  // ---------- XR input ----------
  setupXR() {
    const factory = new XRControllerModelFactory();
    const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
    for (let i = 0; i < 2; i++) {
      const ctrl = this.renderer.xr.getController(i);
      const grip = this.renderer.xr.getControllerGrip(i);
      grip.add(factory.createControllerModel(grip));
      const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 }));
      line.scale.z = 4;
      ctrl.add(line);
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff7a8a }));
      dot.visible = false;
      this.scene.add(dot);
      const p = { id: i, ctrl, grip, line, dot, ray: new THREE.Raycaster(), hover: null, source: null, buttons: [], hist: [] };
      ctrl.addEventListener('connected', (e) => {
        p.source = e.data; p.hand = e.data.handedness;
        if (p.hand === 'left') grip.add(this.vrHud), this.vrHud.position.set(0, 0.06, 0.04), this.vrHud.rotation.set(-Math.PI / 2.6, 0, 0);
      });
      ctrl.addEventListener('disconnected', () => { p.source = null; });
      ctrl.addEventListener('selectstart', () => this.select(p));
      ctrl.addEventListener('squeezestart', () => this.grabOrRelease(p, true));
      ctrl.addEventListener('squeezeend', () => { if (this.held.has(p)) this.release(p); });
      this.rig.add(ctrl, grip);
      this.pointers.push(p);
    }
    this.renderer.xr.addEventListener('sessionstart', () => {
      this.camera.position.set(0, 0, 0); this.camera.rotation.set(0, 0, 0);
      this.dom.hud.classList.add('hidden'); this.dom.cross.classList.add('hidden');
      // Shadows are expensive on standalone headsets.
      this.sun.shadow.mapSize.set(1024, 1024); this.sun.shadow.map?.dispose(); this.sun.shadow.map = null;
      this.rig.rotation.y = this.player.yaw;
      if (!this.started) this.begin();
    });
    this.renderer.xr.addEventListener('sessionend', () => {
      this.camera.position.set(0, 1.6, 0);
      this.dom.hud.classList.remove('hidden'); this.dom.cross.classList.remove('hidden');
      this.player.yaw = this.rig.rotation.y;
    });
  }

  pollGamepads(dt) {
    let move = new THREE.Vector2();
    for (const p of this.pointers) {
      const gp = p.source?.gamepad;
      if (!gp) continue;
      const ax = gp.axes.length >= 4 ? [gp.axes[2], gp.axes[3]] : [gp.axes[0] || 0, gp.axes[1] || 0];
      const pressed = (i) => gp.buttons[i]?.pressed && !p.buttons[i];
      if (p.hand === 'left') {
        move.set(ax[0], ax[1]);
        if (pressed(4)) this.world?.onCycle?.();
        if (pressed(5)) this.secondary(p);
      } else {
        if (Math.abs(ax[0]) > 0.7) {
          if (!p.turned) { this.snapTurn(-Math.sign(ax[0]) * Math.PI / 6); p.turned = true; }
        } else if (Math.abs(ax[0]) < 0.3) p.turned = false;
        if (pressed(4)) this.jump();
        if (pressed(5)) this.secondary(p);
      }
      p.buttons = gp.buttons.map((b) => b.pressed);
    }
    if (move.length() < 0.15) move.set(0, 0);
    return move;
  }

  snapTurn(angle) {
    const head = this.camera.getWorldPosition(new THREE.Vector3());
    this.rig.rotation.y += angle;
    this.rig.updateMatrixWorld(true);
    const after = this.camera.getWorldPosition(new THREE.Vector3());
    this.rig.position.x += head.x - after.x; this.rig.position.z += head.z - after.z;
  }

  // ---------- Actions ----------
  pointerRay(p) {
    if (p.isDesktop) {
      p.ray.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    } else {
      const m = p.ctrl.matrixWorld;
      p.ray.ray.origin.setFromMatrixPosition(m);
      p.ray.ray.direction.set(0, 0, -1).transformDirection(m);
    }
    return p.ray;
  }

  findHover(p) {
    const ray = this.pointerRay(p);
    ray.far = 30;
    const objs = [...this.interactables.keys()];
    for (const b of this.physics.bodies) if (b.grabbable && !b.held) objs.push(b.mesh);
    const hits = ray.intersectObjects(objs, true);
    outer: for (const h of hits) {
      let o = h.object;
      while (o) {
        if (o.userData.body && o.userData.body.grabbable) {
          if (h.distance > (p.isDesktop ? 4 : 6)) break;
          return { kind: 'grab', body: o.userData.body, hit: h, label: o.userData.body.label };
        }
        const def = this.interactables.get(o);
        if (def) {
          if (h.distance > def.distance) break;
          if (def.enabled && !def.enabled()) continue outer;
          return { kind: 'use', obj: o, def, hit: h, label: typeof def.label === 'function' ? def.label() : def.label };
        }
        o = o.parent;
      }
      return null; // nearest object blocks the ray
    }
    return null;
  }

  select(p) {
    this.audio.start();
    if (this.held.has(p)) { this.throwHeld(p); return; }
    const h = p.hover;
    if (h?.kind === 'grab') { this.grab(p, h.body); return; }
    if (h?.kind === 'use') { h.def.onSelect?.(h.hit, p); this.haptic(p, 0.4, 40); return; }
    this.world?.onSelectEmpty?.(p);
  }

  secondary(p) {
    if (this.player.vehicle) { this.dismount(); return; }
    const h = p.hover;
    if (h?.kind === 'use' && h.def.onSecondary) { h.def.onSecondary(h.hit, p); return; }
    this.world?.onSecondary?.(p);
  }

  grabOrRelease(p, nearOnly = false) {
    if (this.held.has(p)) { this.release(p); return; }
    let body = null;
    if (!p.isDesktop) {
      // Grip grabs the nearest body within reach of the hand first.
      const hand = p.grip.getWorldPosition(new THREE.Vector3());
      let best = 0.35;
      for (const b of this.physics.bodies) {
        if (!b.grabbable || b.held) continue;
        const d = b.mesh.position.distanceTo(hand) - b.radius;
        if (d < best) { best = d; body = b; }
      }
    }
    if (!body && p.hover?.kind === 'grab') body = p.hover.body;
    if (!body && !nearOnly && p.hover?.kind === 'use') { this.select(p); return; }
    if (!body) { body = this.world?.onGrabEmpty?.(p); }
    if (body) this.grab(p, body);
  }

  grab(p, body) {
    for (const [q, b] of this.held) if (b === body) this.held.delete(q);
    body.held = true; body.vel.set(0, 0, 0);
    this.held.set(p, body);
    p.hist = [];
    this.audio.pop();
    this.haptic(p, 0.6, 50);
    body.userData.onGrab?.(body);
  }

  release(p) {
    const body = this.held.get(p);
    if (!body) return;
    this.held.delete(p);
    body.held = false;
    if (!p.isDesktop && p.hist.length > 2) {
      const a = p.hist[0], b = p.hist[p.hist.length - 1];
      const dt = Math.max(0.016, (b.t - a.t) / 1000);
      body.vel.copy(b.p).sub(a.p).divideScalar(dt).multiplyScalar(1.3);
    }
    body.userData.onThrow?.(body);
  }

  throwHeld(p) {
    const body = this.held.get(p);
    if (!body) return;
    this.held.delete(p);
    body.held = false;
    const dir = this.pointerRay(p).ray.direction.clone();
    body.vel.copy(dir.multiplyScalar(11)).add(new THREE.Vector3(0, 2.5, 0)).add(this.player.vel);
    this.audio.whoosh();
    body.userData.onThrow?.(body);
  }

  updateHeld() {
    const now = performance.now();
    for (const [p, body] of this.held) {
      if (p.isDesktop) {
        const fwd = new THREE.Vector3(0.25, -0.25, -0.8).applyQuaternion(this.camera.getWorldQuaternion(new THREE.Quaternion()));
        body.mesh.position.copy(this.camera.getWorldPosition(new THREE.Vector3())).add(fwd);
      } else {
        const pos = p.grip.getWorldPosition(new THREE.Vector3());
        const dir = new THREE.Vector3(0, -0.02, -0.06).applyQuaternion(p.grip.getWorldQuaternion(new THREE.Quaternion()));
        body.mesh.position.copy(pos).add(dir);
        p.hist.push({ p: pos.clone(), t: now });
        while (p.hist.length > 6) p.hist.shift();
      }
    }
  }

  // ---------- Rides ----------
  mount(name, mesh, onDismount) {
    if (this.player.vehicle) this.dismount();
    this.player.ride = name;
    this.player.vehicle = { name, mesh, onDismount };
    this.player.vel.set(0, 0, 0);
    this.player.heading = this.headYaw();
    this.audio.happy();
    this.toast(`${RIDES[name].name}! ${this.isVR ? 'Press B' : 'Press F'} to hop off`);
  }
  dismount() {
    const v = this.player.vehicle;
    if (!v) return;
    this.player.vehicle = null;
    this.player.ride = 'walk';
    v.onDismount?.();
  }

  headYaw() {
    const q = this.camera.getWorldQuaternion(new THREE.Quaternion());
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
    return Math.atan2(-f.x, -f.z);
  }

  jump() {
    const pl = this.player, r = RIDES[this.currentRide()];
    if (pl.grounded && r.jump > 0) { pl.vy = r.jump; pl.grounded = false; this.audio.tone(300, { dur: 0.15, slide: 1.8, vol: 0.12 }); }
  }
  launch(vy) { this.player.vy = vy; this.player.grounded = false; }

  currentRide() {
    const pl = this.player;
    if (pl.ride === 'walk' && this.world?.surfaceAt?.(pl.feet.x, pl.feet.z) === 'ice') return 'ice';
    return pl.ride;
  }

  updatePlayer(dt, stick) {
    const pl = this.player, w = this.world;
    const r = RIDES[this.currentRide()];
    // Desktop look.
    if (!this.isVR) {
      this.rig.rotation.y = pl.yaw;
      this.camera.rotation.set(pl.pitch, 0, 0, 'YXZ');
    }
    // Input direction relative to where you are looking.
    const input = new THREE.Vector2();
    if (this.isVR) input.set(stick.x, stick.y);
    else {
      if (this.keys.KeyW || this.keys.ArrowUp) input.y -= 1;
      if (this.keys.KeyS || this.keys.ArrowDown) input.y += 1;
      if (this.keys.KeyA || this.keys.ArrowLeft) input.x -= 1;
      if (this.keys.KeyD || this.keys.ArrowRight) input.x += 1;
      if (input.length() > 1) input.normalize();
    }
    const yaw = this.headYaw();
    const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const run = !this.isVR && (this.keys.ShiftLeft || this.keys.ShiftRight) && r.run ? r.run : r.speed;
    const target = new THREE.Vector3().addScaledVector(fwd, -input.y * run).addScaledVector(right, input.x * run);

    if (r.accel === 0) {
      pl.vel.x = target.x; pl.vel.z = target.z;
    } else if (input.lengthSq() > 0.01 && r.steer && Math.hypot(pl.vel.x, pl.vel.z) > r.speed) {
      // Steer without braking (sledding downhill).
      const sp = Math.hypot(pl.vel.x, pl.vel.z), tl = target.length() || 1;
      pl.vel.x += ((target.x / tl) * sp - pl.vel.x) * Math.min(1, r.accel * dt);
      pl.vel.z += ((target.z / tl) * sp - pl.vel.z) * Math.min(1, r.accel * dt);
    } else if (input.lengthSq() > 0.01) {
      pl.vel.x += (target.x - pl.vel.x) * Math.min(1, r.accel * dt);
      pl.vel.z += (target.z - pl.vel.z) * Math.min(1, r.accel * dt);
    } else {
      pl.vel.x *= Math.max(0, 1 - r.friction * dt);
      pl.vel.z *= Math.max(0, 1 - r.friction * dt);
    }
    // Downhill pull (sledding, ramps).
    if (r.slope && pl.grounded && w) {
      const e = 0.3, x = pl.feet.x, z = pl.feet.z, y = pl.feet.y + 0.5;
      const gx = (w.getGround(x + e, z, y) - w.getGround(x - e, z, y)) / (2 * e);
      const gz = (w.getGround(x, z + e, y) - w.getGround(x, z - e, y)) / (2 * e);
      if (Math.abs(gx) < 3 && Math.abs(gz) < 3) { pl.vel.x -= gx * 9.8 * r.slope * dt; pl.vel.z -= gz * 9.8 * r.slope * dt; }
    }
    const maxV = r.max ?? r.speed * 1.8;
    const hv = Math.hypot(pl.vel.x, pl.vel.z);
    if (hv > maxV) { pl.vel.x *= maxV / hv; pl.vel.z *= maxV / hv; }
    pl.speed = Math.hypot(pl.vel.x, pl.vel.z);

    if (!w) return;
    // Horizontal move with step-up limits (axis-separated so you slide along walls).
    const baseStep = Math.max(r.step, w.step ?? 0);
    const step = pl.grounded ? baseStep : baseStep + 0.3;
    const tryMove = (dx, dz) => {
      const nx = pl.feet.x + dx, nz = pl.feet.z + dz;
      const g = w.getGround(nx, nz, pl.feet.y + step + r.hover);
      if (g - (pl.feet.y - r.hover) > step) return false;
      if (w.blocked?.(nx, nz, pl.feet.y)) return false;
      pl.feet.x = nx; pl.feet.z = nz; return true;
    };
    if (!tryMove(pl.vel.x * dt, 0)) pl.vel.x *= -0.2;
    if (!tryMove(0, pl.vel.z * dt)) pl.vel.z *= -0.2;
    const lim = w.radius ?? 60, rr = Math.hypot(pl.feet.x, pl.feet.z);
    if (rr > lim) { pl.feet.x *= lim / rr; pl.feet.z *= lim / rr; }

    // Vertical.
    pl.vy += -9.8 * r.gravity * dt;
    pl.feet.y += pl.vy * dt;
    const ground = w.getGround(pl.feet.x, pl.feet.z, pl.feet.y + 0.4 + r.hover) + r.hover;
    const groundRate = (ground - pl.prevGround) / dt;
    if (pl.feet.y <= ground) {
      if (!pl.grounded && pl.vy < -3) { this.audio.thud(); this.hapticAll(0.3, 40); }
      pl.feet.y = ground;
      pl.vy = r.launch > 0 && groundRate > 0 ? Math.min(groundRate * r.launch, 9) : 0;
      if (!pl.grounded) w.onLand?.(pl);
      pl.grounded = true;
    } else if (pl.grounded && pl.vy <= 0.5 && pl.feet.y - ground < 0.3) {
      pl.feet.y = ground; pl.vy = 0; // stick to gentle downhills
    } else {
      pl.grounded = false;
    }
    pl.prevGround = ground;
    if (pl.feet.y < (w.killY ?? -40)) {
      pl.feet.copy(w.spawn.pos); pl.vy = 0; pl.vel.set(0, 0, 0);
      this.toast(w.respawnText || 'Whoops! Back you go');
    }

    // Ride mesh follows your feet.
    const v = pl.vehicle;
    if (v?.mesh) {
      if (pl.speed > 0.5) pl.heading = Math.atan2(-pl.vel.x, -pl.vel.z);
      v.mesh.position.set(pl.feet.x, pl.feet.y - r.hover, pl.feet.z);
      if (this.isVR) {
        const off = new THREE.Vector3().setFromMatrixPosition(this.camera.matrix).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.rig.rotation.y);
        v.mesh.position.x += off.x; v.mesh.position.z += off.z;
      }
      v.mesh.rotation.y = pl.heading;
      if (r.hover) v.mesh.position.y += r.hover * 0.6 + Math.sin(this.time * 3) * 0.03;
      v.mesh.userData.animate?.(dt, pl.speed);
    }
  }

  // ---------- Collectibles ----------
  updateCollectibles(dt) {
    const head = this.camera.getWorldPosition(new THREE.Vector3());
    const feet = this.player.feet;
    const hands = this.isVR ? this.pointers.filter((p) => p.source).map((p) => p.grip.getWorldPosition(new THREE.Vector3())) : [];
    const seg = new THREE.Line3(new THREE.Vector3(feet.x, feet.y + 0.2, feet.z), head);
    const tmp = new THREE.Vector3();
    for (const c of [...this.collectibles]) {
      const pos = c.obj.getWorldPosition(tmp);
      if (c.flying) {
        const to = head.clone().add(new THREE.Vector3(0, -0.3, 0)).sub(pos);
        const d = to.length();
        const step = Math.min(d, (6 + 14 / Math.max(d, 0.5)) * dt);
        c.obj.position.addScaledVector(to.normalize(), step);
      }
      let d = seg.closestPointToPoint(pos, true, new THREE.Vector3()).distanceTo(pos);
      for (const h of hands) d = Math.min(d, h.distanceTo(pos));
      if (d < c.radius) {
        this.collectibles.delete(c);
        this.uninteract(c.obj);
        this.particles.burst(pos.clone(), { count: 24 });
        this.hapticAll(0.5, 50);
        c.onCollect?.(c.obj, pos.clone());
      }
    }
  }

  // ---------- Hover visuals ----------
  updatePointers() {
    const active = this.isVR ? this.pointers.filter((p) => p.source) : (document.pointerLockElement ? [this.desktopPointer] : []);
    let promptHover = null;
    for (const p of this.pointers) { if (!p.source) { p.dot.visible = false; p.line.visible = false; } }
    for (const p of active) {
      p.hover = this.held.has(p) ? null : this.findHover(p);
      if (this.held.has(p)) p.hover = { label: this.isVR ? 'Let go of grip or pull trigger to throw' : 'Click to throw · E to drop' };
      if (!p.isDesktop) {
        p.line.visible = true;
        const dist = p.hover?.hit ? p.hover.hit.distance : 4;
        p.line.scale.z = dist;
        p.line.material.color.set(p.hover?.hit ? 0xff7a8a : 0xffffff);
        p.dot.visible = !!p.hover?.hit;
        if (p.hover?.hit) p.dot.position.copy(p.hover.hit.point);
      }
      if (p.hover?.label && (!promptHover || p.hand === 'right')) promptHover = { ...p.hover, p };
    }
    if (!this.isVR) {
      this.dom.cross.classList.toggle('active', !!promptHover?.hit);
      this.dom.prompt.classList.toggle('hidden', !promptHover?.label);
      if (promptHover?.label) this.dom.prompt.textContent = promptHover.label;
      this.vrPrompt.visible = false;
    } else {
      if (promptHover?.label && promptHover.hit) {
        if (this.vrPrompt.userData.text !== promptHover.label) { this.vrPrompt.userData.draw([promptHover.label]); this.vrPrompt.userData.text = promptHover.label; }
        const at = promptHover.hit.point.clone();
        const head = this.camera.getWorldPosition(new THREE.Vector3());
        const d = at.distanceTo(head);
        at.lerp(head, 0.15).add(new THREE.Vector3(0, 0.12 * Math.max(1, d * 0.4), 0));
        this.vrPrompt.position.copy(at);
        const s = 0.25 * Math.max(1, d * 0.35);
        this.vrPrompt.scale.set(s, s * this.vrPrompt.material.map.image.height / this.vrPrompt.material.map.image.width, 1);
        this.vrPrompt.visible = true;
      } else this.vrPrompt.visible = false;
    }
  }

  // ---------- Worlds ----------
  async goTo(name) {
    if (this.loading) return;
    this.loading = true;
    this.audio.whoosh();
    await this.fade(1);
    this.dismount();
    for (const p of [...this.held.keys()]) this.held.delete(p);
    if (this.world) {
      this.world.dispose?.();
      this.world.group.removeFromParent();
      this.world.group.traverse((o) => { if (o.isMesh && o.geometry && !o.userData.shared) o.geometry.dispose(); });
    }
    this.world = null;
    this.interactables.clear(); this.collectibles.clear(); this.physics.clear();
    this.audio.stopBoombox();
    this.extraHud = ''; this.updateHud();

    const mod = await WORLDS[name]();
    const world = new mod.default(this);
    world.group = new THREE.Group();
    this.scene.add(world.group);
    await world.build();
    const env = await loadHDRI(world.hdri);
    // Worlds can ask for the sky to be turned so the sun sits in a chosen direction.
    if (world.sunYaw !== undefined) world.backgroundRotation = world.sunYaw - Math.atan2(env.sun.x, env.sun.z);
    this.scene.background = env.background;
    this.scene.environment = env.env;
    this.scene.backgroundIntensity = world.backgroundIntensity ?? 1;
    this.scene.environmentIntensity = world.environmentIntensity ?? 1;
    this.scene.backgroundRotation.set(0, world.backgroundRotation ?? 0, 0);
    this.scene.environmentRotation.set(0, world.backgroundRotation ?? 0, 0);
    this.scene.fog = world.fog || null;
    const sunDir = env.sun.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), world.backgroundRotation ?? 0);
    this.sunDir = sunDir;
    this.sun.color.set(world.sunColor ?? 0xffffff);
    this.sun.intensity = world.sunIntensity ?? 2.5;
    this.hemi.color.set(world.skyColor ?? 0xffffff);
    this.hemi.groundColor.set(world.groundColor ?? 0x886677);
    this.renderer.toneMappingExposure = world.exposure ?? 1;
    world.onSun?.(sunDir);

    this.world = world;
    this.worldName = name;
    this.player.feet.copy(world.spawn.pos);
    this.player.vel.set(0, 0, 0); this.player.vy = 0; this.player.prevGround = world.spawn.pos.y;
    this.player.yaw = world.spawn.yaw ?? 0;
    this.rig.rotation.y = this.player.yaw;
    this.player.pitch = 0;
    if (!this.state.visited.includes(name)) { this.state.visited.push(name); this.save(); }
    this.audio.playMusic(name);
    await this.fade(0);
    if (world.welcome) this.toast(world.welcome, 4500);
    this.loading = false;
  }

  async begin() {
    this.started = true;
    this.audio.start();
    document.getElementById('start').classList.add('hidden');
    if (!this.isVR) { this.dom.hud.classList.remove('hidden'); this.dom.cross.classList.remove('hidden'); try { this.renderer.domElement.requestPointerLock?.()?.catch?.(() => {}); } catch { /* needs a click */ } }
  }

  frame() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.time = (this.time || 0) + dt;
    const stick = this.pollGamepads(dt);
    if (this.world && !this.loading) {
      this.updatePlayer(dt, stick);
      this.world.update?.(dt, this.time);
      this.physics.update(dt);
      this.updateHeld();
      this.updateCollectibles(dt);
      this.updatePointers();
    }
    this.particles.update(dt);
    if (this.floaters) {
      this.floaters = this.floaters.filter((s) => {
        s.userData.life -= dt; s.position.y += dt * 0.6;
        s.material.opacity = Math.min(1, s.userData.life * 2);
        if (s.userData.life <= 0) { s.removeFromParent(); s.material.map.dispose(); s.material.dispose(); return false; }
        return true;
      });
    }
    // Fade sphere for VR.
    const fm = this.fadeSphere.material;
    fm.opacity += (this.fadeTarget - fm.opacity) * Math.min(1, dt * 8);
    this.fadeSphere.visible = fm.opacity > 0.01;
    // Shadow camera follows the player.
    if (this.sunDir) {
      const f = this.player.feet;
      this.sun.target.position.set(f.x, f.y, f.z);
      this.sun.position.copy(this.sun.target.position).addScaledVector(this.sunDir, 80);
    }
    this.renderer.render(this.scene, this.camera);
  }
}

// ---------- Boot ----------
const game = new Game();
window.game = game;
const btn = document.getElementById('btn-desktop');
const loadingEl = document.getElementById('loading');
const vrBtn = VRButton.createButton(game.renderer, { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] });
document.getElementById('vr-slot').appendChild(vrBtn);
document.getElementById('btn-reset').addEventListener('click', () => {
  localStorage.removeItem(SAVE_KEY); game.load(); game.updateHud(); game.toast('Progress reset');
  if (game.world) game.goTo('hub');
});
btn.addEventListener('click', () => game.begin());
game.goTo('hub').then(() => {
  btn.disabled = false;
  loadingEl.textContent = 'Ready! Put on your headset and press Enter VR, or play on screen.';
}).catch((e) => {
  console.error(e);
  loadingEl.textContent = 'Something went wrong loading the game. Please run it from a local web server (see README).';
});
