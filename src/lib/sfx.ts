"use client";

// Ear candy estilo iOS haptic + sintetizador de loop musical real para que el reproductor tenga pulso y audio reactivo
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;

// Estado del loop musical generativo (para cuando reproducís un track sin archivo externo o con archivo subido)
let beatTimer: number | null = null;
let currentAudioEl: HTMLAudioElement | null = null;
let beatEnergy = 0;
let subBassEnergy = 0;
let highHatEnergy = 0;

function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AudioCtx();
    master = ctx.createGain();
    master.gain.value = 0.22;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function tone(
  freq: number,
  dur: number,
  type: OscillatorType = "sine",
  vol = 0.35,
  slideTo?: number,
  delay = 0
) {
  const c = ac();
  if (!c || !master || muted) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.015);
}

let lastHover = 0;

export const sfx = {
  hover() {
    const n = performance.now();
    if (n - lastHover < 45) return;
    lastHover = n;
    tone(1950, 0.022, "sine", 0.06, 2200);
  },
  tap() {
    tone(420, 0.035, "triangle", 0.2, 180);
    tone(1480, 0.018, "sine", 0.08);
  },
  tick() {
    tone(1320, 0.018, "sine", 0.09, 980);
  },
  nav() {
    tone(520, 0.06, "sine", 0.16, 780);
    tone(1040, 0.08, "sine", 0.08, undefined, 0.03);
  },
  open() {
    tone(440, 0.12, "sine", 0.18, 880);
    tone(1320, 0.14, "triangle", 0.08, undefined, 0.04);
  },
  close() {
    tone(680, 0.1, "sine", 0.16, 340);
  },
  drop() {
    // sonido tipo macOS installer drop
    tone(320, 0.09, "sine", 0.25, 640);
    tone(640, 0.12, "triangle", 0.2, 960, 0.06);
    tone(1280, 0.18, "sine", 0.14, 1560, 0.12);
  },
  play() {
    tone(587.33, 0.08, "triangle", 0.2);
    tone(880, 0.12, "sine", 0.18, undefined, 0.05);
  },
  pause() {
    tone(784, 0.07, "sine", 0.16);
    tone(523.25, 0.1, "sine", 0.15, undefined, 0.05);
  },
  setMuted(m: boolean) {
    muted = m;
    if (currentAudioEl) currentAudioEl.muted = m;
    if (!m) tone(880, 0.08, "sine", 0.18);
  },
  isMuted() {
    return muted;
  },
  // Motor de beat sintético suave o reproducción de archivo real subido por el usuario
  startGroove(bpm: number, rootFreq: number, customObjectUrl?: string) {
    this.stopGroove();
    if (customObjectUrl && typeof window !== "undefined") {
      currentAudioEl = new Audio(customObjectUrl);
      currentAudioEl.loop = true;
      currentAudioEl.muted = muted;
      currentAudioEl.volume = 0.75;
      currentAudioEl.play().catch(() => {});
    }
    const stepMs = (60 / Math.max(68, Math.min(165, bpm)) / 2) * 1000;
    let step = 0;
    const scale = [1, 1.189, 1.335, 1.498, 1.782]; // menor pentatónica
    const tickStep = () => {
      const isKick = step % 8 === 0 || step % 8 === 3 || step % 16 === 10;
      const isSnare = step % 8 === 4;
      const isHat = step % 2 === 0 || step % 4 === 3;

      if (isKick) {
        beatEnergy = 1.0;
        subBassEnergy = 1.0;
        if (!customObjectUrl) {
          tone(rootFreq * 0.9, 0.18, "sine", 0.28, 36);
        }
      }
      if (isSnare) {
        beatEnergy = Math.max(beatEnergy, 0.75);
        if (!customObjectUrl) {
          tone(240, 0.09, "triangle", 0.14, 110);
        }
      }
      if (isHat) {
        highHatEnergy = 0.85;
        if (!customObjectUrl) {
          tone(3800 + (step % 3) * 600, 0.02, "square", 0.022);
        }
      }
      if (!customObjectUrl && (step % 4 === 0 || step % 16 === 14)) {
        const ratio = scale[(step / 2) % scale.length | 0];
        tone(rootFreq * 2 * ratio, 0.24, "triangle", 0.075);
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
