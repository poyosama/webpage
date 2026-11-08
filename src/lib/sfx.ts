"use client";

// Micro-haptics táctiles estilo Taptic Engine de iPhone:
// pulsos de baja frecuencia de 4–9ms + roce de aire filtrado, casi imperceptibles, cero "puck" de consola.
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let muted = false;

let beatTimer: number | null = null;
let currentAudioEl: HTMLAudioElement | null = null;
let beatEnergy = 0;
let subBassEnergy = 0;
let highHatEnergy = 0;

function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AudioCtx();
    master = ctx.createGain();
    master.gain.value = 0.14;
    master.connect(ctx.destination);

    // Buffer corto de ruido rosa suave para textura táctil de papel/vidrio
    const len = Math.floor(ctx.sampleRate * 0.04);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      data[i] = (last + 0.08 * white) / 1.08;
      last = data[i];
    }
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

// Pulso sub-táctil (como el motor lineal de un iPhone, sin tono musical)
function hapticPulse(freq = 68, dur = 0.009, gain = 0.09) {
  const c = ac();
  if (!c || !master || muted) return;
  const t = c.currentTime;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(28, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.0015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.003);
}

// Roce micro-texturado de 6ms
function softBrush(cutoff = 900, dur = 0.008, gain = 0.04) {
  const c = ac();
  if (!c || !master || !noiseBuf || muted) return;
  const t = c.currentTime;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  const filter = c.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(cutoff, t);
  filter.Q.setValueAtTime(1.8, t);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.001);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(g).connect(master);
  src.start(t);
  src.stop(t + dur + 0.002);
}

let lastHover = 0;

export const sfx = {
  hover() {
    const n = performance.now();
    if (n - lastHover < 60) return;
    lastHover = n;
    softBrush(720, 0.006, 0.025);
  },
  tap() {
    hapticPulse(74, 0.008, 0.08);
  },
  tick() {
    softBrush(640, 0.005, 0.032);
  },
  nav() {
    hapticPulse(62, 0.011, 0.075);
  },
  open() {
    hapticPulse(58, 0.014, 0.085);
  },
  close() {
    hapticPulse(52, 0.012, 0.07);
  },
  drop() {
    hapticPulse(64, 0.016, 0.11);
  },
  play() {
    hapticPulse(72, 0.01, 0.09);
  },
  pause() {
    hapticPulse(54, 0.01, 0.075);
  },
  setMuted(m: boolean) {
    muted = m;
    if (currentAudioEl) currentAudioEl.muted = m;
    if (!m) hapticPulse(70, 0.009, 0.08);
  },
  isMuted() {
    return muted;
  },
  startGroove(bpm: number, rootFreq: number, customObjectUrl?: string) {
    this.stopGroove();
    if (customObjectUrl && typeof window !== "undefined") {
      currentAudioEl = new Audio(customObjectUrl);
      currentAudioEl.loop = true;
      currentAudioEl.muted = muted;
      currentAudioEl.volume = 0.8;
      currentAudioEl.play().catch(() => {});
    }
    const stepMs = (60 / Math.max(68, Math.min(165, bpm)) / 2) * 1000;
    let step = 0;
    const scale = [1, 1.189, 1.335, 1.498, 1.782];
    const tickStep = () => {
      const c = ac();
      const isKick = step % 8 === 0 || step % 8 === 3 || step % 16 === 10;
      const isSnare = step % 8 === 4;
      const isHat = step % 2 === 0 || step % 4 === 3;

      if (isKick) {
        beatEnergy = 1.0;
        subBassEnergy = 1.0;
        if (!customObjectUrl && c && master && !muted) {
          const t = c.currentTime;
          const o = c.createOscillator();
          const g = c.createGain();
          o.type = "sine";
          o.frequency.setValueAtTime(rootFreq * 0.85, t);
          o.frequency.exponentialRampToValueAtTime(34, t + 0.19);
          g.gain.setValueAtTime(0.0001, t);
          g.gain.linearRampToValueAtTime(0.24, t + 0.005);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
          o.connect(g).connect(master);
          o.start(t);
          o.stop(t + 0.21);
        }
      }
      if (isSnare) {
        beatEnergy = Math.max(beatEnergy, 0.75);
        if (!customObjectUrl) softBrush(1100, 0.045, 0.08);
      }
      if (isHat) {
        highHatEnergy = 0.85;
        if (!customObjectUrl) softBrush(4200, 0.015, 0.03);
      }
      if (!customObjectUrl && c && master && !muted && (step % 4 === 0 || step % 16 === 14)) {
        const ratio = scale[(step / 2) % scale.length | 0];
        const t = c.currentTime;
        const o = c.createOscillator();
        const g = c.createGain();
        o.type = "triangle";
        o.frequency.setValueAtTime(rootFreq * 2 * ratio, t);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.055, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
        o.connect(g).connect(master);
        o.start(t);
        o.stop(t + 0.26);
      }
      step = (step + 1) % 16;
    };
    tickStep();
    beatTimer = window.setInterval(tickStep, stepMs);
  },
  stopGroove() {
    if (beatTimer !== null) {
      clearInterval(beatTimer);
      beatTimer = null;
    }
    if (currentAudioEl) {
      currentAudioEl.pause();
      currentAudioEl = null;
    }
  },
  sampleReactiveLevels() {
    beatEnergy *= 0.91;
    subBassEnergy *= 0.88;
    highHatEnergy *= 0.85;
    return {
      beat: beatEnergy,
      bass: subBassEnergy,
      hat: highHatEnergy,
    };
  },
};
