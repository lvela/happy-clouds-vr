// All sound is synthesized with WebAudio, so there are no audio files to license.
const SCALES = {
  hub:    { root: 62, steps: [0, 2, 4, 7, 9, 12, 14, 16], tempo: 0.62, wave: 'sine' },
  bricks: { root: 60, steps: [0, 2, 4, 5, 7, 9, 11, 12], tempo: 0.32, wave: 'triangle' },
  park:   { root: 65, steps: [0, 2, 4, 7, 9, 12, 14], tempo: 0.28, wave: 'square' },
  beach:  { root: 57, steps: [0, 3, 5, 7, 10, 12, 15], tempo: 0.42, wave: 'triangle' },
  snow:   { root: 69, steps: [0, 2, 4, 7, 9, 12, 16, 19], tempo: 0.5, wave: 'sine' },
};
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

export class Audio {
  constructor() {
    this.ctx = null;
    this.musicTimer = null;
    this.musicOn = true;
  }

  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    // Soft feedback delay acts as a cheap reverb.
    const delay = this.ctx.createDelay();
    delay.delayTime.value = 0.28;
    const fb = this.ctx.createGain(); fb.gain.value = 0.35;
    const wet = this.ctx.createGain(); wet.gain.value = 0.3;
    this.master.connect(this.ctx.destination);
    this.master.connect(delay); delay.connect(fb); fb.connect(delay); delay.connect(wet); wet.connect(this.ctx.destination);
    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = 0.18;
    this.musicBus.connect(this.master);
  }

  tone(freq, { dur = 0.25, type = 'sine', vol = 0.3, when = 0, slide = 0, bus = null } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus || this.master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  noise(dur = 0.3, vol = 0.2, filterFreq = 1200) {
    if (!this.ctx) return;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filterFreq;
    const g = this.ctx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.master); src.start();
  }

  collect(combo = 0) {
    const base = 76 + (combo % 8);
    this.tone(midi(base), { dur: 0.18, type: 'triangle', vol: 0.25 });
    this.tone(midi(base + 7), { dur: 0.3, type: 'sine', vol: 0.2, when: 0.07 });
  }
  pop() { this.tone(520, { dur: 0.12, type: 'sine', vol: 0.3, slide: 2.2 }); }
  click() { this.tone(900, { dur: 0.05, type: 'square', vol: 0.08 }); }
  thud() { this.tone(140, { dur: 0.15, type: 'sine', vol: 0.35, slide: 0.5 }); this.noise(0.08, 0.1, 600); }
  whoosh() { this.noise(0.9, 0.25, 900); this.tone(220, { dur: 0.9, type: 'sine', vol: 0.15, slide: 3 }); }
  splash() { this.noise(0.5, 0.25, 2500); }
  happy() { [72, 76, 79, 84].forEach((n, i) => this.tone(midi(n), { dur: 0.35, type: 'triangle', vol: 0.22, when: i * 0.09 })); }
  fanfare() { [67, 72, 76, 79, 84, 88].forEach((n, i) => this.tone(midi(n), { dur: 0.5, type: 'triangle', vol: 0.22, when: i * 0.12 })); }
  unlock() { [60, 64, 67, 72, 76, 79, 84].forEach((n, i) => this.tone(midi(n), { dur: 0.8, type: 'sine', vol: 0.2, when: i * 0.07 })); }

  // Gentle generative music: a pad chord plus a wandering melody on the world's scale.
  playMusic(world) {
    this.stopMusic();
    if (!this.ctx) return;
    const s = SCALES[world] || SCALES.hub;
    let step = 0;
    const tick = () => {
      if (this.musicOn) {
        const bar = Math.floor(step / 8);
        const chordRoot = s.root + [0, 5, -3, 7][bar % 4];
        if (step % 8 === 0) {
          [0, 4, 7].forEach((iv) => this.tone(midi(chordRoot - 12 + iv), { dur: s.tempo * 8, type: 'sine', vol: 0.12, bus: this.musicBus }));
        }
        if (Math.random() < 0.7) {
          const n = s.root + s.steps[Math.floor(Math.random() * s.steps.length)];
          this.tone(midi(n), { dur: s.tempo * 1.6, type: s.wave, vol: s.wave === 'square' ? 0.05 : 0.14, bus: this.musicBus });
        }
      }
      step++;
    };
    this.musicTimer = setInterval(tick, s.tempo * 1000);
  }
  stopMusic() { if (this.musicTimer) clearInterval(this.musicTimer); this.musicTimer = null; }

  // Upbeat loop for the boombox.
  toggleBoombox() {
    if (this.boomTimer) { clearInterval(this.boomTimer); this.boomTimer = null; return false; }
    let i = 0;
    const bass = [45, 45, 52, 50, 48, 48, 55, 52];
    const mel = [69, 72, 76, 74, 72, 76, 79, 76];
    this.boomTimer = setInterval(() => {
      const b = i % 16;
      if (b % 4 === 0) this.tone(70, { dur: 0.15, type: 'sine', vol: 0.4, slide: 0.4 });
      if (b % 4 === 2) this.noise(0.08, 0.12, 6000);
      if (b % 2 === 0) this.tone(midi(bass[(i >> 1) % 8]), { dur: 0.2, type: 'sawtooth', vol: 0.06 });
      if (b % 2 === 1 && Math.random() < 0.8) this.tone(midi(mel[(i >> 1) % 8]), { dur: 0.18, type: 'square', vol: 0.04 });
      i++;
    }, 140);
    return true;
  }
  stopBoombox() { if (this.boomTimer) { clearInterval(this.boomTimer); this.boomTimer = null; } }
}
