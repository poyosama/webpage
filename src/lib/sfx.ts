"use client";

import { getProceduralTrackAudioUrl } from "./proceduralAudio";

const isIOS =
  typeof navigator !== "undefined" &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && (navigator.maxTouchPoints || 0) > 1));

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      const c = ac();
      if (c && c.state === "suspended" && virtualPlaying) {
        c.resume().catch(() => {});
      }
    }
  });
}

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let muted = false;
let volume = 0.85;

let beatTimer: number | null = null;
let currentAudioEl: HTMLAudioElement | null = null;
let mediaSourceNode: MediaElementAudioSourceNode | null = null;
let analyserNode: AnalyserNode | null = null;
let subFilterNode: BiquadFilterNode | null = null;
let subAnalyserNode: AnalyserNode | null = null;
let freqData: Uint8Array<ArrayBuffer> | null = null;
let subTimeData: Float32Array<ArrayBuffer> | null = null;
const connectedElements = new WeakSet<HTMLAudioElement>();

let beatEnergy = 0;
let subBassEnergy = 0;
let highHatEnergy = 0;
let eightOhEightEnergy = 0;
let subFloor = 0.04;
let endedConsumed = false;

// Seguimiento de progreso para canciones con o sin audio subido
let virtualCurrentSec = 0;
let virtualDurationSec = 174;
let virtualPlaying = false;
let lastProgressTick = 0;
let playbackRate = 1.0;
let currentPitchSemitones = 0;
let currentTempoMultiplier = 1.0;

function applyAudioPlaybackRateAndPitch() {
  const pitchRatio = Math.pow(2, currentPitchSemitones / 12);
  const totalRate = Math.max(0.3, Math.min(2.5, currentTempoMultiplier * pitchRatio));
  playbackRate = currentTempoMultiplier;

  if (currentAudioEl) {
    if (Math.abs(currentPitchSemitones) > 0.05) {
      // Varispeed pitch shift en tiempo real
      try {
        (currentAudioEl as unknown as { preservesPitch?: boolean }).preservesPitch = false;
        (currentAudioEl as unknown as { mozPreservesPitch?: boolean }).mozPreservesPitch = false;
        (currentAudioEl as unknown as { webkitPreservesPitch?: boolean }).webkitPreservesPitch = false;
      } catch {}
      currentAudioEl.playbackRate = totalRate;
    } else {
      // Solo cambio de tempo sin alterar el pitch
      try {
        (currentAudioEl as unknown as { preservesPitch?: boolean }).preservesPitch = true;
        (currentAudioEl as unknown as { mozPreservesPitch?: boolean }).mozPreservesPitch = true;
        (currentAudioEl as unknown as { webkitPreservesPitch?: boolean }).webkitPreservesPitch = true;
      } catch {}
      currentAudioEl.playbackRate = Math.max(0.5, Math.min(2.0, currentTempoMultiplier));
    }
  }
}

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
    analyserNode.fftSize = 2048;
    analyserNode.smoothingTimeConstant = 0.35;
    freqData = new Uint8Array(analyserNode.frequencyBinCount);

    // Filtro pasa-bajos dedicado exclusivamente a la banda de 808 (30Hz – 92Hz)
    subFilterNode = ctx.createBiquadFilter();
    subFilterNode.type = "lowpass";
    subFilterNode.frequency.value = 88;
    subFilterNode.Q.value = 1.4;

    subAnalyserNode = ctx.createAnalyser();
    subAnalyserNode.fftSize = 1024;
    subAnalyserNode.smoothingTimeConstant = 0.2;
    subTimeData = new Float32Array(subAnalyserNode.fftSize);

    subFilterNode.connect(subAnalyserNode);

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
    this.setTempoMultiplier(rate);
  },
  getPlaybackRate() {
    return currentTempoMultiplier;
  },
  setPitchSemitones(semitones: number) {
    currentPitchSemitones = Math.max(-12, Math.min(12, semitones));
    applyAudioPlaybackRateAndPitch();
    return currentPitchSemitones;
  },
  getPitchSemitones() {
    return currentPitchSemitones;
  },
  setTempoMultiplier(multiplier: number) {
    currentTempoMultiplier = Math.max(0.5, Math.min(2.0, multiplier));
    applyAudioPlaybackRateAndPitch();
    return currentTempoMultiplier;
  },
  getTempoMultiplier() {
    return currentTempoMultiplier;
  },
  initTrackModifiers(pitchShift = 0, tempoMultiplier = 1.0) {
    currentPitchSemitones = Math.max(-12, Math.min(12, pitchShift));
    currentTempoMultiplier = Math.max(0.5, Math.min(2.0, tempoMultiplier));
    applyAudioPlaybackRateAndPitch();
  },
  seek(sec: number) {
    const clamped = Math.max(0, Math.min(virtualDurationSec, sec));
    virtualCurrentSec = clamped;
    endedConsumed = false;
    lastProgressTick = performance.now();
    if (currentAudioEl && !Number.isNaN(currentAudioEl.duration)) {
      currentAudioEl.currentTime = Math.min(currentAudioEl.duration, clamped);
    }
  },
  seekGroove(sec: number) {
    return this.seek(sec);
  },
  setTrackDuration(durationSec: number) {
    virtualDurationSec = Math.max(15, durationSec || 174);
  },
  getPlaybackState() {
    const now = performance.now();
    if (currentAudioEl && !Number.isNaN(currentAudioEl.duration) && currentAudioEl.duration > 0) {
      const rawEnded =
        currentAudioEl.ended ||
        (virtualPlaying &&
          currentAudioEl.duration > 1 &&
          currentAudioEl.currentTime >= currentAudioEl.duration - 0.08);
      const fireEnded = rawEnded && !endedConsumed;
      if (fireEnded) {
        endedConsumed = true;
        virtualPlaying = false;
        if (beatTimer !== null) {
          clearInterval(beatTimer);
          beatTimer = null;
        }
      }
      return {
        currentSec: currentAudioEl.currentTime,
        durationSec: currentAudioEl.duration,
        ended: fireEnded,
      };
    }
    if (virtualPlaying && lastProgressTick > 0) {
      const dt = (now - lastProgressTick) / 1000;
      virtualCurrentSec += dt * playbackRate;
      lastProgressTick = now;
    }
    const rawEnded = virtualPlaying && virtualCurrentSec >= virtualDurationSec;
    const fireEnded = rawEnded && !endedConsumed;
    if (fireEnded) {
      endedConsumed = true;
      virtualPlaying = false;
      virtualCurrentSec = 0;
      if (beatTimer !== null) {
        clearInterval(beatTimer);
        beatTimer = null;
      }
    }
    return {
      currentSec: Math.min(virtualDurationSec, virtualCurrentSec),
      durationSec: virtualDurationSec,
      ended: fireEnded,
    };
  },
  getGrooveProgress() {
    return this.getPlaybackState();
  },
  pauseGroove() {
    if (currentAudioEl && !Number.isNaN(currentAudioEl.currentTime)) {
      virtualCurrentSec = currentAudioEl.currentTime;
      currentAudioEl.pause();
    }
    virtualPlaying = false;
    lastProgressTick = 0;
    if (beatTimer !== null) {
      clearInterval(beatTimer);
      beatTimer = null;
    }
    return virtualCurrentSec;
  },
  resumeGroove(bpm: number, rootFreq: number, customObjectUrl?: string, durationSec = 174) {
    endedConsumed = false;
    return this.startGroove(bpm, rootFreq, customObjectUrl, durationSec, false);
  },
  startGroove(
    bpm: number,
    rootFreq: number,
    customObjectUrl?: string,
    durationSec = 174,
    resetTime = false
  ) {
    virtualDurationSec = Math.max(15, durationSec || 174);
    endedConsumed = false;
    if (resetTime) {
      virtualCurrentSec = 0;
    }

    if (beatTimer !== null) {
      clearInterval(beatTimer);
      beatTimer = null;
    }

    virtualPlaying = true;
    lastProgressTick = performance.now();

    const c = ac();

    const playNativeAudio = (audioUrl: string) => {
      let isSameSrc = false;
      if (currentAudioEl && typeof window !== "undefined") {
        try {
          const resolvedUrl = new URL(audioUrl, window.location.href).href;
          isSameSrc = currentAudioEl.src === resolvedUrl || currentAudioEl.src === audioUrl;
        } catch {
          isSameSrc = currentAudioEl.src === audioUrl;
        }
      }

      if (currentAudioEl && isSameSrc) {
        currentAudioEl.loop = false;
        currentAudioEl.muted = muted;
        currentAudioEl.volume = volume;
        applyAudioPlaybackRateAndPitch();
        if (resetTime || currentAudioEl.ended) {
          currentAudioEl.currentTime = 0;
        } else if (virtualCurrentSec > 0 && !Number.isNaN(virtualCurrentSec) && currentAudioEl.paused) {
          currentAudioEl.currentTime = virtualCurrentSec;
        }
        if (currentAudioEl.paused) {
          currentAudioEl.play().catch(() => {});
        }
      } else {
        if (currentAudioEl) {
          currentAudioEl.pause();
        }
        currentAudioEl = new Audio(audioUrl);
        currentAudioEl.crossOrigin = "anonymous";
        currentAudioEl.setAttribute("playsinline", "true");
        currentAudioEl.setAttribute("webkit-playsinline", "true");
        currentAudioEl.preload = "auto";
        currentAudioEl.loop = false;
        currentAudioEl.muted = muted;
        currentAudioEl.volume = volume;
        applyAudioPlaybackRateAndPitch();
        if (virtualCurrentSec > 0 && !resetTime) {
          currentAudioEl.currentTime = virtualCurrentSec;
        }
        // En iOS WebKit: NO pasar por createMediaElementSource para evitar que iOS mutee el audio al bloquear pantalla.
        // En desktop/Chrome: conectar para alimentar el analizador FFT de hardware.
        if (!isIOS && c && analyserNode && !connectedElements.has(currentAudioEl)) {
          try {
            mediaSourceNode = c.createMediaElementSource(currentAudioEl);
            mediaSourceNode.connect(analyserNode);
            if (subFilterNode) {
              mediaSourceNode.connect(subFilterNode);
            }
            analyserNode.connect(c.destination);
            connectedElements.add(currentAudioEl);
          } catch {
            // Fallback si ya estaba conectado
          }
        }
        currentAudioEl.play().catch(() => {});
      }
    };

    if (customObjectUrl && typeof window !== "undefined") {
      playNativeAudio(customObjectUrl);
    } else if (typeof window !== "undefined") {
      // Para tracks demo sin archivo de audio subido, generar y reproducir WAV nativo procedural
      void getProceduralTrackAudioUrl(bpm, rootFreq).then((procUrl) => {
        if (procUrl && virtualPlaying) {
          playNativeAudio(procUrl);
        }
      });
    }

    const stepMs = (60 / Math.max(68, Math.min(165, bpm)) / 2) * 1000;
    let step = 0;
    const scale = [1, 1.189, 1.335, 1.498, 1.782];
    const tickStep = () => {
      const audioCtx = ac();
      const isHeavy808 = step % 16 === 0 || step % 16 === 6 || step % 16 === 10;
      const isGhost808 = step % 16 === 3 || step % 16 === 14;
      const isSnare = step % 8 === 4;
      const isHat = step % 2 === 0 || step % 4 === 3;

      if (isHeavy808 || isGhost808) {
        const hitStrength = isHeavy808 ? (step % 16 === 0 ? 1.0 : 0.88) : 0.62;
        beatEnergy = hitStrength;
        subBassEnergy = hitStrength;
        eightOhEightEnergy = Math.max(eightOhEightEnergy, hitStrength);
        if (!currentAudioEl && !customObjectUrl && audioCtx && master && !muted) {
          const t = audioCtx.currentTime;
          const o = audioCtx.createOscillator();
          const g = audioCtx.createGain();
          o.type = "sine";
          const glideDur = isHeavy808 ? 0.34 : 0.2;
          o.frequency.setValueAtTime(rootFreq * (isHeavy808 ? 1.05 : 0.85), t);
          o.frequency.exponentialRampToValueAtTime(36, t + glideDur);
          g.gain.setValueAtTime(0.0001, t);
          g.gain.linearRampToValueAtTime(0.28 * hitStrength, t + 0.006);
          g.gain.exponentialRampToValueAtTime(0.0001, t + glideDur + 0.04);
          o.connect(g).connect(master);
          if (analyserNode) g.connect(analyserNode);
          if (subFilterNode) g.connect(subFilterNode);
          o.start(t);
          o.stop(t + glideDur + 0.05);
        }
      }
      if (isSnare) {
        beatEnergy = Math.max(beatEnergy, 0.72);
        if (!currentAudioEl && !customObjectUrl) softBrush(1100, 0.045, 0.08);
      }
      if (isHat) {
        highHatEnergy = 0.85;
        if (!currentAudioEl && !customObjectUrl) softBrush(4200, 0.015, 0.03);
      }
      if (!currentAudioEl && !customObjectUrl && audioCtx && master && !muted && (step % 4 === 0 || step % 16 === 14)) {
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
  stopGroove(reset = true) {
    if (currentAudioEl && !Number.isNaN(currentAudioEl.currentTime)) {
      virtualCurrentSec = currentAudioEl.currentTime;
    }
    virtualPlaying = false;
    lastProgressTick = 0;
    if (beatTimer !== null) {
      clearInterval(beatTimer);
      beatTimer = null;
    }
    if (currentAudioEl) {
      currentAudioEl.pause();
      if (reset) {
        currentAudioEl = null;
      }
    }
    if (reset) {
      virtualCurrentSec = 0;
    }
  },
  sampleReactiveLevels() {
    // Detección de 808 real aislada por filtro pasa-bajos de hardware (< 88Hz) + FFT sub-grave
    if (analyserNode && freqData && currentAudioEl && !currentAudioEl.paused) {
      analyserNode.getByteFrequencyData(freqData);
      const volNorm = Math.max(0.22, muted ? 0.5 : volume);

      // Con fftSize 2048 (~23.4Hz por bin): bins 1, 2, 3 y 4 cubren ~23Hz a ~94Hz (808 puro)
      const b1 = freqData[1] || 0;
      const b2 = freqData[2] || 0;
      const b3 = freqData[3] || 0;
      const b4 = freqData[4] || 0;
      const fftSub = (b1 * 1.15 + b2 * 1.35 + b3 * 1.2 + b4 * 0.7) / (4.4 * 255);

      // Medición de amplitud real en dominio del tiempo después del filtro pasa-bajos de 88Hz
      let subPeak = 0;
      let subRms = 0;
      if (subAnalyserNode && subTimeData) {
        subAnalyserNode.getFloatTimeDomainData(subTimeData);
        let sumSq = 0;
        for (let i = 0; i < subTimeData.length; i++) {
          const s = Math.abs(subTimeData[i]) / volNorm;
          if (s > subPeak) subPeak = s;
          sumSq += s * s;
        }
        subRms = Math.sqrt(sumSq / subTimeData.length);
      }

      // Energía combinada del 808 (pico sub-grave filtrado + energía FFT < 94Hz)
      const combinedSub = Math.max(subPeak * 1.45, subRms * 2.4, fftSub);

      // Piso dinámico lento para detectar tanto el golpe (kick/attack del 808) como el sustain profundo del 808
      subFloor = subFloor * 0.965 + combinedSub * 0.035;
      const transientDelta = Math.max(0, combinedSub - subFloor * 1.04);
      const absoluteBoom = Math.max(0, combinedSub - 0.22);

      const raw808 = Math.min(
        1.25,
        transientDelta * 2.8 + Math.pow(absoluteBoom, 1.35) * 1.35
      );

      eightOhEightEnergy =
        raw808 > eightOhEightEnergy
          ? eightOhEightEnergy * 0.3 + raw808 * 0.7
          : eightOhEightEnergy * 0.82;

      subBassEnergy = Math.max(subBassEnergy * 0.84, Math.min(1, combinedSub));

      const midBin = ((freqData[12] || 0) + (freqData[18] || 0)) * 0.5;
      beatEnergy = Math.max(beatEnergy * 0.86, midBin / 255);
    } else {
      beatEnergy *= 0.88;
      subBassEnergy *= 0.84;
      eightOhEightEnergy *= 0.82;
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
