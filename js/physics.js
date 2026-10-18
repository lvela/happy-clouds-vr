// Tiny sphere physics for balls, snowballs and other throwables.
import * as THREE from 'three';

export class Physics {
  constructor(game) {
    this.game = game;
    this.bodies = [];
  }

  // mesh: the visual. opts: radius, bounce, friction, gravity, onHit(body, what), onGround(body, speed)
  add(mesh, opts = {}) {
    const body = {
      mesh, radius: opts.radius ?? 0.12, vel: new THREE.Vector3(), bounce: opts.bounce ?? 0.6, friction: opts.friction ?? 0.4,
      gravity: opts.gravity ?? -9.8, drag: opts.drag ?? 0.05, held: false, sleeping: false, grabbable: opts.grabbable ?? true,
      onGround: opts.onGround, onUpdate: opts.onUpdate, floats: opts.floats ?? false, kickable: opts.kickable ?? true, spin: opts.spin ?? true,
      label: opts.label ?? 'Grab',
      userData: opts.userData ?? {},
    };
    mesh.userData.body = body;
    this.bodies.push(body);
    return body;
  }

  remove(body) {
    const i = this.bodies.indexOf(body);
    if (i >= 0) this.bodies.splice(i, 1);
    body.mesh.removeFromParent();
  }

  clear() { this.bodies.length = 0; }

  update(dt) {
    const world = this.game.world;
    if (!world) return;
    const player = this.game.player;
    const feet = player.feet;
    const tmp = new THREE.Vector3();
    for (const b of this.bodies) {
      if (b.held) continue;
      const p = b.mesh.position;
      b.vel.y += b.gravity * dt;
      b.vel.multiplyScalar(1 - b.drag * dt);
      p.addScaledVector(b.vel, dt);

      // Water floating.
      if (b.floats && world.waterLevel !== undefined && p.y < world.waterLevel) {
        b.vel.y += (world.waterLevel - p.y) * 30 * dt;
        b.vel.multiplyScalar(1 - 1.5 * dt);
      }

      const ground = world.getGround(p.x, p.z, p.y + b.radius);
      if (p.y - b.radius < ground) {
        p.y = ground + b.radius;
        const impact = -b.vel.y;
        if (b.vel.y < 0) b.vel.y = impact > 1 ? impact * b.bounce : 0;
        b.vel.x *= 1 - b.friction * dt * 4;
        b.vel.z *= 1 - b.friction * dt * 4;
        if (impact > 1.5 && b.onGround) b.onGround(b, impact);
      }

      // Solid colliders (boxes) supplied by the world.
      if (world.colliders) {
        for (const c of world.colliders) {
          tmp.set(THREE.MathUtils.clamp(p.x, c.min.x, c.max.x), THREE.MathUtils.clamp(p.y, c.min.y, c.max.y), THREE.MathUtils.clamp(p.z, c.min.z, c.max.z));
          const d = p.distanceTo(tmp);
          if (d < b.radius && d > 1e-5) {
            const n = p.clone().sub(tmp).divideScalar(d);
            p.addScaledVector(n, b.radius - d);
            const vn = b.vel.dot(n);
            if (vn < 0) b.vel.addScaledVector(n, -vn * (1 + b.bounce));
          }
        }
      }

      // Keep inside the world.
      const lim = world.radius ?? 60;
      const r = Math.hypot(p.x, p.z);
      if (r > lim) { p.x *= lim / r; p.z *= lim / r; b.vel.x *= -0.5; b.vel.z *= -0.5; }

      // The player's body nudges balls (kick by walking into them).
      if (b.kickable) {
        const dx = p.x - feet.x, dz = p.z - feet.z;
        const dist = Math.hypot(dx, dz);
        const reach = b.radius + 0.35;
        if (dist < reach && p.y < feet.y + 1.2 && dist > 1e-4) {
          const nx = dx / dist, nz = dz / dist;
          p.x = feet.x + nx * reach; p.z = feet.z + nz * reach;
          const push = Math.max(2.5, player.speed * 1.4);
          b.vel.x = nx * push; b.vel.z = nz * push; b.vel.y = Math.max(b.vel.y, 1.5);
          if (!b._kickT || performance.now() - b._kickT > 300) { this.game.audio.thud(); b._kickT = performance.now(); }
        }
      }

      if (b.spin) {
        const speed = Math.hypot(b.vel.x, b.vel.z);
        if (speed > 0.01) {
          const axis = tmp.set(b.vel.z, 0, -b.vel.x).normalize();
          b.mesh.rotateOnWorldAxis(axis, (speed / b.radius) * dt);
        }
      }
      if (b.onUpdate) b.onUpdate(b, dt);
    }
  }
}
