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
    master.gain.value = 0.28;
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

// Pulso de presión tipo Force Touch / Taptic Engine de MacBook & iPhone:
// combina el golpe sub-grave de masa lineal (95->32Hz) con un micro-impulso seco de 3ms en 320Hz
// para que se sienta el "hundimiento" físico del botón sin sonar a consola.
function hapticPulse(freq = 88, endFreq = 32, dur = 0.011, gain = 0.22, transientGain = 0.07) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator && !muted) {
    try {
      navigator.vibrate(4);
    } catch {
      // Ignore on unsupported browsers
    }
  }
  const c = ac();
  if (!c || !master || muted) return;
  const t = c.currentTime;

  // 1. Masa lineal grave (el golpe físico)
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.0012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.003);

  // 2. Micro-transiente mecánico seco (2.5ms) para que se sienta la presión en parlantes chicos también
  if (transientGain > 0 && noiseBuf) {
    const src = c.createBufferSource();
    src.buffer = noiseBuf;
    const lp = c.createBiquadFilter();
    lp.type = "bandpass";
    lp.frequency.setValueAtTime(340, t);
    lp.Q.setValueAtTime(2.2, t);
    const ng = c.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.linearRampToValueAtTime(transientGain, t + 0.0008);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.004);
    src.connect(lp).connect(ng).connect(master);
    src.start(t);
    src.stop(t + 0.005);
  }
}

// Roce micro-texturado de 6ms
function softBrush(cutoff = 780, dur = 0.007, gain = 0.055) {
  const c = ac();
  if (!c || !master || !noiseBuf || muted) return;
  const t = c.currentTime;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  const filter = c.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(cutoff, t);
  filter.Q.setValueAtTime(2.0, t);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.001);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(g).connect(master);
  src.start(t);
  src.stop(t + dur + 0.002);
}

let lastHover = 0;
let lastPress = 0;
let lastTick = 0;

export const sfx = {
  hover() {
    const n = performance.now();
    if (n - lastHover < 45) return;
    lastHover = n;
    softBrush(680, 0.006, 0.045);
  },
  // Presión hacia abajo (cuando apretás el click/dedo sobre cualquier botón o menú)
  press() {
    const n = performance.now();
    if (n - lastPress < 25) return;
    lastPress = n;
    hapticPulse(92, 30, 0.011, 0.24, 0.085);
  },
  // Retorno al soltar la presión (como el trackpad Force Touch de MacBook)
  release() {
    hapticPulse(112, 46, 0.007, 0.13, 0.04);
  },
  tap() {
    const n = performance.now();
    if (n - lastPress < 35) return; // Si ya sonó press(), no duplicar encima
    hapticPulse(86, 34, 0.009, 0.20, 0.07);
  },
  tick() {
    const n = performance.now();
    if (n - lastTick < 22) return;
    lastTick = n;
    hapticPulse(105, 48, 0.005, 0.11, 0.045);
  },
  nav() {
    // Doble escalón sutil de menú principal (hundimiento + encastre)
    hapticPulse(80, 30, 0.012, 0.24, 0.08);
    setTimeout(() => {
      hapticPulse(108, 44, 0.007, 0.14, 0.04);
    }, 22);
  },
  open() {
    hapticPulse(72, 28, 0.014, 0.25, 0.08);
    setTimeout(() => {
      hapticPulse(98, 42, 0.008, 0.15, 0.045);
    }, 28);
  },
  close() {
    hapticPulse(64, 24, 0.013, 0.20, 0.06);
  },
  drop() {
    hapticPulse(76, 26, 0.016, 0.28, 0.10);
    setTimeout(() => {
      hapticPulse(104, 40, 0.009, 0.18, 0.05);
    }, 32);
  },
  play() {
    hapticPulse(88, 34, 0.012, 0.24, 0.08);
  },
  pause() {
    hapticPulse(66, 26, 0.011, 0.20, 0.06);
  },
  setMuted(m: boolean) {
    muted = m;
    if (currentAudioEl) currentAudioEl.muted = m;
    if (!m) hapticPulse(84, 34, 0.010, 0.22, 0.07);
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
