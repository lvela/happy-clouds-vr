// Portals out of the cloud hub. `cost` is the happiness needed to open each one.
export const PORTALS = [
  { id: 'bricks', name: 'Happy Land', sub: 'Bricks & Master Builders', icon: '🧱', cost: 20, c1: 0xff3b3b, c2: 0xffd400 },
  { id: 'park', name: 'Outdoor Play Park', sub: 'Bikes, boards, skates & sports', icon: '🛹', cost: 60, c1: 0x35d45a, c2: 0x2fa4ff },
  { id: 'beach', name: 'Sunny Beach', sub: 'Sandcastles, waves & treasure', icon: '🏖️', cost: 120, c1: 0x00c8e0, c2: 0xffe08a },
  { id: 'snow', name: 'Snow Day Wonderland', sub: 'Sledding, snowmen & skating', icon: '⛄', cost: 200, c1: 0xbfe8ff, c2: 0xffffff },
];

export const HAPPINESS_PER_MALLOW = 2;

// Movement styles. speed m/s, accel 0 = instant (no glide), friction = glide decay,
// launch = how much ramps throw you into the air, slope = downhill pull, hover = float height.
export const RIDES = {
  walk:       { speed: 3.2, run: 5.5, accel: 0, friction: 8, jump: 4.6, gravity: 1, hover: 0, launch: 0, slope: 0, step: 0.6 },
  skates:     { name: 'Roller Skates', speed: 6.5, accel: 2.5, friction: 0.5, jump: 4.6, gravity: 1, hover: 0, launch: 0.6, slope: 0.5, step: 0.3 },
  skateboard: { name: 'Skateboard', speed: 8, accel: 3, friction: 0.35, jump: 5.2, gravity: 1, hover: 0, launch: 1.0, slope: 0.7, step: 0.25 },
  bike:       { name: 'Bike', speed: 11, accel: 3.5, friction: 0.6, jump: 3.8, gravity: 1, hover: 0, launch: 0.8, slope: 0.4, step: 0.3 },
  hoverboard: { name: 'Hoverboard', speed: 12, accel: 2.5, friction: 0.3, jump: 7.5, gravity: 0.45, hover: 0.45, launch: 1.2, slope: 0.2, step: 1.5 },
  sled:       { name: 'Sled', max: 16, steer: true, speed: 3, accel: 1.2, friction: 0.6, jump: 0, gravity: 1, hover: 0, launch: 0.9, slope: 1.3, step: 0.35 },
  ice:        { speed: 5, accel: 1.6, friction: 0.25, jump: 4.6, gravity: 1, hover: 0, launch: 0, slope: 0.3, step: 0.6 },
};
