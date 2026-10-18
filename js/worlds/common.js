// Pieces shared by the portal worlds.
import * as THREE from 'three';
import { makeLabel, makePortalMaterial, getMarshmallowGeometry, getMarshmallowMaterial, rand } from '../util.js';

// True when the player walks through a portal ring: either their head or their feet is inside the
// ring's footprint, or they crossed its plane since last frame (fast movers). Works at any height,
// so it doesn't matter how tall you are or whether you're standing or seated in VR.
export function touchesPortal(game, grp, state, halfWidth) {
  let hit = false;
  const points = [game.camera.getWorldPosition(new THREE.Vector3()), game.player.feet.clone()];
  points.forEach((pt, i) => {
    const l = grp.worldToLocal(pt);
    const prev = state[i];
    if (Math.abs(l.x) < halfWidth && (Math.abs(l.z) < 0.6 || (prev && Math.sign(prev.z) !== Math.sign(l.z) && Math.abs(prev.z) < 2))) hit = true;
    state[i] = l;
  });
  return hit;
}

// A portal back to the cloud hub. Call portal.update(t) every frame.
export function makeReturnPortal(world, pos, yaw = 0) {
  const game = world.game;
  const grp = new THREE.Group();
  grp.position.copy(pos);
  grp.rotation.y = yaw;
  const frame = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.16, 16, 48),
    new THREE.MeshStandardMaterial({ color: 0xffb3c8, emissive: 0xff7aa0, emissiveIntensity: 0.6, roughness: 0.3 }));
  frame.position.y = 2; frame.castShadow = true;
  const mat = makePortalMaterial(0xffa58a, 0xc89bff);
  mat.uniforms.locked.value = 0;
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.42, 48), mat);
  disc.position.y = 2;
  const label = makeLabel(['☁️ Back to the Clouds', 'Walk in to return'], { size: 3, font: 60 });
  label.position.y = 4.2;
  grp.add(frame, disc, label);
  world.group.add(grp);
  game.interact(disc, { label: 'Return to Happy Clouds', distance: 12, onSelect: () => game.goTo('hub') });
  let armed = false; // only after you've stepped away from it once
  const state = [];
  return {
    grp,
    update(t) {
      mat.uniforms.t.value = t;
      const near = touchesPortal(game, grp, state, 1.4);
      const local = grp.worldToLocal(game.player.feet.clone());
      if (!near && Math.hypot(local.x, local.z) > 3) armed = true;
      if (near && armed) game.goTo('hub');
    },
  };
}

// A floating bonus marshmallow. golden = worth 3.
export function spawnBonusMallow(world, pos, { golden = false, respawn = 0 } = {}) {
  const game = world.game;
  const m = new THREE.Mesh(getMarshmallowGeometry(), getMarshmallowMaterial(golden ? 'golden' : 'pink'));
  m.userData.shared = true;
  m.scale.setScalar(golden ? 1.6 : 1.3);
  m.position.copy(pos);
  m.castShadow = true;
  const phase = rand(0, 6);
  m.userData.animate = (t) => {
    if (m.userData.collectible?.flying) return;
    m.position.y = pos.y + Math.sin(t * 2 + phase) * 0.12;
    m.rotation.y = t + phase;
  };
  world.group.add(m);
  (world.animated ||= []).push(m);
  game.collectible(m, {
    radius: 0.6, label: golden ? 'Golden marshmallow!' : 'Marshmallow',
    onCollect: (_o, at) => {
      m.removeFromParent();
      world.animated.splice(world.animated.indexOf(m), 1);
      game.audio.collect(2);
      game.addMallows(golden ? 3 : 1, at.add(new THREE.Vector3(0, 0.4, 0)));
      if (respawn) setTimeout(() => { if (world.group.parent) spawnBonusMallow(world, pos, { golden, respawn }); }, respawn);
    },
  });
  return m;
}

export function animateAll(world, t) {
  if (world.animated) for (const m of world.animated) m.userData.animate(t);
}

// Celebrate a goal or achievement.
export function celebrate(world, at, happiness, text) {
  const game = world.game;
  game.particles.burst(at, { count: 90, speed: 6, colors: [0xff4d6d, 0xffd23f, 0x3bceac, 0x4d96ff, 0xb15eff, 0xffffff] });
  game.audio.fanfare();
  game.hapticAll(0.8, 150);
  if (text) game.toast(text);
  if (happiness) game.addHappiness(happiness, at.clone().add(new THREE.Vector3(0, 0.5, 0)));
}
