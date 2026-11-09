"use client";

// Micro-haptics táctiles estilo Taptic Engine de iPhone + Motor de Audio Reactivo (Detector 808 real)
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let muted = false;
let volume = 0.85;

let beatTimer: number | null = null;
let currentAudioEl: HTMLAudioElement | null = null;
let mediaSourceNode: MediaElementAudioSourceNode | null = null;
let analyserNode: AnalyserNode | null = null;
let freqData: Uint8Array<ArrayBuffer> | null = null;
const connectedElements = new WeakSet<HTMLAudioElement>();

let beatEnergy = 0;
let subBassEnergy = 0;
let highHatEnergy = 0;
let eightOhEightEnergy = 0;

// Seguimiento de progreso para canciones con o sin audio subido
let virtualCurrentSec = 0;
let virtualDurationSec = 174;
let virtualPlaying = false;
let lastProgressTick = 0;
let playbackRate = 1.0;

function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AudioCtx();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : volume * 0.35;
    master.connect(ctx.destination);

    analyserNode = ctx.createAnalyser();
    analyserNode.fftSize = 1024;
    analyserNode.smoothingTimeConstant = 0.65;
    freqData = new Uint8Array(analyserNode.frequencyBinCount);

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
  press() {
    const n = performance.now();
    if (n - lastPress < 25) return;
    lastPress = n;
    hapticPulse(92, 30, 0.011, 0.24, 0.085);
  },
  release() {
    hapticPulse(112, 46, 0.007, 0.13, 0.04);
  },
  tap() {
    const n = performance.now();
    if (n - lastPress < 35) return;
    hapticPulse(86, 34, 0.009, 0.2, 0.07);
  },
  tick() {
    const n = performance.now();
    if (n - lastTick < 22) return;
    lastTick = n;
    hapticPulse(105, 48, 0.005, 0.11, 0.045);
  },
  nav() {
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
    hapticPulse(64, 24, 0.013, 0.2, 0.06);
  },
  drop() {
    hapticPulse(76, 26, 0.016, 0.28, 0.1);
    setTimeout(() => {
      hapticPulse(104, 40, 0.009, 0.18, 0.05);
    }, 32);
  },
  play() {
    hapticPulse(88, 34, 0.012, 0.24, 0.08);
  },
  pause() {
    hapticPulse(66, 26, 0.011, 0.2, 0.06);
  },
  setMuted(m: boolean) {
    muted = m;
    if (currentAudioEl) currentAudioEl.muted = m;
    if (master && ctx) {
      master.gain.setValueAtTime(m ? 0 : volume * 0.35, ctx.currentTime);
    }
    if (!m) hapticPulse(84, 34, 0.01, 0.22, 0.07);
  },
  isMuted() {
    return muted;
  },
  setVolume(v: number) {
    volume = Math.max(0, Math.min(1, v));
    if (volume > 0 && muted) {
      muted = false;
      if (currentAudioEl) currentAudioEl.muted = false;
    }
    if (currentAudioEl) {
      currentAudioEl.volume = volume;
    }
    if (master && ctx) {
      master.gain.setValueAtTime(muted ? 0 : volume * 0.35, ctx.currentTime);
    }
  },
  getVolume() {
    return muted ? 0 : volume;
  },
  setPlaybackRate(rate: number) {
    playbackRate = Math.max(0.5, Math.min(1.5, rate));
    if (currentAudioEl) {
      currentAudioEl.playbackRate = playbackRate;
    }
  },
  getPlaybackRate() {
    return playbackRate;
  },
  seek(sec: number) {
    const clamped = Math.max(0, Math.min(virtualDurationSec, sec));
    virtualCurrentSec = clamped;
    lastProgressTick = performance.now();
    if (currentAudioEl && !Number.isNaN(currentAudioEl.duration)) {
      currentAudioEl.currentTime = Math.min(currentAudioEl.duration, clamped);
    }
  },
  setTrackDuration(durationSec: number) {
    virtualDurationSec = Math.max(15, durationSec || 174);
  },
  getPlaybackState() {
    const now = performance.now();
    if (currentAudioEl && !Number.isNaN(currentAudioEl.duration) && currentAudioEl.duration > 0) {
      return {
        currentSec: currentAudioEl.currentTime,
        durationSec: currentAudioEl.duration,
        ended: currentAudioEl.ended,
      };
    }
    if (virtualPlaying && lastProgressTick > 0) {
      const dt = (now - lastProgressTick) / 1000;
      virtualCurrentSec += dt * playbackRate;
      lastProgressTick = now;
    }
    const ended = virtualPlaying && virtualCurrentSec >= virtualDurationSec;
    if (ended) {
      virtualCurrentSec = 0;
    }
    return {
      currentSec: Math.min(virtualDurationSec, virtualCurrentSec),
      durationSec: virtualDurationSec,
      ended,
    };
  },
  startGroove(bpm: number, rootFreq: number, customObjectUrl?: string, durationSec = 174, resetTime = false) {
    this.stopGroove();
    virtualDurationSec = Math.max(15, durationSec || 174);
    if (resetTime) {
      virtualCurrentSec = 0;
    }
    virtualPlaying = true;
    lastProgressTick = performance.now();

    const c = ac();

    if (customObjectUrl && typeof window !== "undefined") {
      currentAudioEl = new Audio(customObjectUrl);
      currentAudioEl.crossOrigin = "anonymous";
      currentAudioEl.loop = false;
      currentAudioEl.muted = muted;
      currentAudioEl.volume = volume;
      currentAudioEl.playbackRate = playbackRate;
      if (virtualCurrentSec > 0) {
        currentAudioEl.currentTime = virtualCurrentSec;
      }
      if (c && analyserNode && !connectedElements.has(currentAudioEl)) {
        try {
          mediaSourceNode = c.createMediaElementSource(currentAudioEl);
          mediaSourceNode.connect(analyserNode);
          analyserNode.connect(c.destination);
          connectedElements.add(currentAudioEl);
        } catch {
          // Fallback si ya estaba conectado
        }
      }
      currentAudioEl.play().catch(() => {});
    }

    const stepMs = (60 / Math.max(68, Math.min(165, bpm)) / 2) * 1000;
    let step = 0;
    const scale = [1, 1.189, 1.335, 1.498, 1.782];
    const tickStep = () => {
      const audioCtx = ac();
      // Patrón de 808 con distintas fuerzas para que se note el latido según la intensidad del 808
      const isHeavy808 = step % 16 === 0 || step % 16 === 6 || step % 16 === 10;
      const isGhost808 = step % 16 === 3 || step % 16 === 14;
      const isSnare = step % 8 === 4;
      const isHat = step % 2 === 0 || step % 4 === 3;

      if (isHeavy808 || isGhost808) {
        const hitStrength = isHeavy808 ? (step % 16 === 0 ? 1.0 : 0.86) : 0.58;
        beatEnergy = hitStrength;
        subBassEnergy = hitStrength;
        if (!customObjectUrl) {
          eightOhEightEnergy = Math.max(eightOhEightEnergy, hitStrength);
        }
        if (!customObjectUrl && audioCtx && master && !muted) {
          const t = audioCtx.currentTime;
          const o = audioCtx.createOscillator();
          const g = audioCtx.createGain();
          o.type = "sine";
          // 808 con pitch drop y sustain sub-grave
          const glideDur = isHeavy808 ? 0.34 : 0.2;
          o.frequency.setValueAtTime(rootFreq * (isHeavy808 ? 1.05 : 0.85), t);
          o.frequency.exponentialRampToValueAtTime(36, t + glideDur);
          g.gain.setValueAtTime(0.0001, t);
          g.gain.linearRampToValueAtTime(0.28 * hitStrength, t + 0.006);
          g.gain.exponentialRampToValueAtTime(0.0001, t + glideDur + 0.04);
          o.connect(g).connect(master);
          if (analyserNode) g.connect(analyserNode);
          o.start(t);
          o.stop(t + glideDur + 0.05);
        }
      }
      if (isSnare) {
        beatEnergy = Math.max(beatEnergy, 0.72);
        if (!customObjectUrl) softBrush(1100, 0.045, 0.08);
      }
      if (isHat) {
        highHatEnergy = 0.85;
        if (!customObjectUrl) softBrush(4200, 0.015, 0.03);
      }
      if (!customObjectUrl && audioCtx && master && !muted && (step % 4 === 0 || step % 16 === 14)) {
        const ratio = scale[(step / 2) % scale.length | 0];
        const t = audioCtx.currentTime;
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
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
    virtualPlaying = false;
    lastProgressTick = 0;
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
    // Si hay audio real o analyser activo, medimos la banda sub-grave del 808 (30Hz – 115Hz)
    if (analyserNode && freqData && currentAudioEl && !currentAudioEl.paused) {
      analyserNode.getByteFrequencyData(freqData);
      // Con sampleRate ~48000 y fftSize 1024, cada bin es ~46.8Hz -> bins 1, 2 y 3 cubren ~35Hz a ~140Hz (808 puro)
      const subBin1 = freqData[1] || 0;
      const subBin2 = freqData[2] || 0;
      const subBin3 = freqData[3] || 0;
      const midBin = (freqData[8] + freqData[12]) * 0.5;
      const rawSub = (subBin1 * 1.25 + subBin2 * 1.15 + subBin3 * 0.7) / (3.1 * 255);
      // Umbral para aislar el golpe real del 808 del piso de mezcla
      const gated808 = Math.max(0, (rawSub - 0.36) / 0.52);
      const shaped808 = Math.min(1.35, Math.pow(gated808, 1.35) * 1.45);
      eightOhEightEnergy = Math.max(eightOhEightEnergy * 0.82, shaped808);
      subBassEnergy = Math.max(subBassEnergy * 0.85, rawSub);
      beatEnergy = Math.max(beatEnergy * 0.86, midBin / 255);
    } else {
      beatEnergy *= 0.9;
      subBassEnergy *= 0.86;
      eightOhEightEnergy *= 0.84;
      highHatEnergy *= 0.85;
    }

    return {
      beat: beatEnergy,
      bass: subBassEnergy,
      hat: highHatEnergy,
      eightOhEight: eightOhEightEnergy,
    };
  },
};
