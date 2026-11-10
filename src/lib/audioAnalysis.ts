"use client";

export type AudioAnalysisResult = {
  bpm: number;
  key: string;
  durationSec: number;
  duration: string;
  cleanTitle: string;
};

const PITCH_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// Perfiles armónicos de Krumhansl-Kessler para detección de tonalidad Mayor y Menor
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

export function formatDurationLabel(sec: number): string {
  const safe = Math.max(1, Math.round(sec || 0));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Extrae BPM o Key si ya vienen escritos en el nombre del archivo
 * (ej: "wildcard - a#min + 152bpm - @2ounces.wav" o "beat amin 140.mp3")
 */
function parseFilenameHints(rawName: string): { bpm?: number; key?: string } {
  const base = rawName.replace(/\.[^/.]+$/, "");
  let bpm: number | undefined;
  let key: string | undefined;

  // 1. Buscar explícito "152bpm" o "152 bpm"
  const explicitBpm = base.match(/\b(\d{2,3})\s*bpm\b/i);
  if (explicitBpm) {
    const val = parseInt(explicitBpm[1], 10);
    if (val >= 60 && val <= 220) bpm = val;
  } else {
    // Buscar número suelto típico de BPM (70..195)
    const nums = base.match(/\b(7\d|8\d|9\d|1\d\d)\b/g);
    if (nums && nums.length > 0) {
      const candidate = parseInt(nums[nums.length - 1], 10);
      if (candidate >= 70 && candidate <= 195) bpm = candidate;
    }
  }

  // 2. Buscar tonalidad musical (ej: a#min, amin, f#m, cmaj, d#m, ebm, gm)
  const keyMatch = base.match(
    /(?:^|[\s\-_+([\]])([A-G])(#|b)?\s*(min|maj|minor|major|m)(?=$|[\s\-_+)[\]])/i
  );
  if (keyMatch) {
    const rootRaw = keyMatch[1].toUpperCase();
    const accidental = keyMatch[2] || "";
    const qualityRaw = keyMatch[3].toLowerCase();
    const isMinor = qualityRaw === "m" || qualityRaw.startsWith("min");

    // Normalizar bemoles a sostenidos equivalentes
    const flatToSharp: Record<string, string> = {
      DB: "C#",
      EB: "D#",
      GB: "F#",
      AB: "G#",
      BB: "A#",
    };
    const combined = `${rootRaw}${accidental.toUpperCase()}`;
    const normalizedRoot = flatToSharp[combined] || (accidental === "#" ? `${rootRaw}#` : rootRaw);
    key = `${normalizedRoot}${isMinor ? "m" : ""}`;
  }

  return { bpm, key };
}

/**
 * Estima el BPM real a partir de la envolvente de energía rítmica (autocorrelación de ataques/onsets)
 */
function detectBpmFromSamples(channelData: Float32Array, sampleRate: number): number {
  const hop = Math.max(128, Math.floor(sampleRate / 200)); // ~200 Hz envelope rate
  const envRate = sampleRate / hop;

  // Analizar hasta 28 segundos del centro del track (donde suele estar el drop/batería)
  const maxSamples = Math.min(channelData.length, Math.floor(sampleRate * 28));
  const startOffset = Math.max(0, Math.floor((channelData.length - maxSamples) * 0.35));
  const numFrames = Math.floor(maxSamples / hop);
  if (numFrames < 80) return 140;

  const onsetEnv = new Float32Array(numFrames);
  let prevEnergy = 0;

  for (let f = 0; f < numFrames; f++) {
    const baseIdx = startOffset + f * hop;
    let sum = 0;
    for (let j = 0; j < hop; j++) {
      const s = channelData[baseIdx + j] || 0;
      sum += s * s;
    }
    const rms = Math.sqrt(sum / hop);
    const flux = Math.max(0, rms - prevEnergy);
    onsetEnv[f] = flux;
    prevEnergy = rms * 0.85 + prevEnergy * 0.15;
  }

  // Evaluar candidatos entre 78 BPM y 178 BPM
  let bestBpm = 140;
  let bestScore = -1;

  for (let bpm = 78; bpm <= 178; bpm += 1) {
    const lag = Math.round((60 / bpm) * envRate);
    if (lag <= 2 || lag >= numFrames / 2) continue;

    let corr = 0;
    const limit = numFrames - lag * 2;
    for (let i = 0; i < limit; i++) {
      corr += onsetEnv[i] * (onsetEnv[i + lag] + 0.5 * onsetEnv[i + lag * 2]);
    }
    corr /= Math.max(1, limit);

    // Prioridad suave para el rango urbano / trap / hip-hop (115–165 BPM)
    const prior = bpm >= 115 && bpm <= 165 ? 1.08 : 1.0;
    const score = corr * prior;
    if (score > bestScore) {
      bestScore = score;
      bestBpm = bpm;
    }
  }

  // Si dio la mitad (ej. 70-82 BPM en un doble-tiempo trap), doblar si tiene sentido
  if (bestBpm < 84) bestBpm *= 2;
  return Math.round(bestBpm);
}

/**
 * Estima la tonalidad musical (Key) proyectando la energía espectral en las 12 clases de altura (Chroma)
 * y correlacionando contra los perfiles de Krumhansl-Kessler.
 */
function detectKeyFromSamples(channelData: Float32Array, sampleRate: number): string {
  const chroma = new Float64Array(12);

  // Tomar 16 ventanas distribuidas a lo largo del track
  const windowSize = 4096;
  const numWindows = 16;
  const usableLen = Math.max(0, channelData.length - windowSize);
  if (usableLen <= 0) return "F#m";

  // Precalcular frecuencias de las notas desde C2 (MIDI 36) hasta B5 (MIDI 83)
  for (let w = 0; w < numWindows; w++) {
    const offset = Math.floor(((w + 1) / (numWindows + 2)) * usableLen);

    for (let midi = 36; midi <= 83; midi++) {
      const pitchClass = midi % 12;
      const freq = 440 * Math.pow(2, (midi - 69) / 12);
      const omega = (2 * Math.PI * freq) / sampleRate;
      const coeff = 2 * Math.cos(omega);

      // Filtro de Goertzel sobre la ventana con ventana Hanning implícita cada 2 muestras para velocidad
      let s1 = 0;
      let s2 = 0;
      const step = 2;
      const coeffStep = 2 * Math.cos(omega * step);
      for (let i = 0; i < windowSize; i += step) {
        const sample = channelData[offset + i];
        const s0 = sample + coeffStep * s1 - s2;
        s2 = s1;
        s1 = s0;
      }
      const power = s1 * s1 + s2 * s2 - coeff * s1 * s2;
      if (power > 0) {
        chroma[pitchClass] += Math.sqrt(power);
      }
    }
  }

  let bestKey = "F#m";
  let bestCorr = -Infinity;

  for (let root = 0; root < 12; root++) {
    let majScore = 0;
    let minScore = 0;
    for (let i = 0; i < 12; i++) {
      const val = chroma[(root + i) % 12];
      majScore += val * MAJOR_PROFILE[i];
      minScore += val * MINOR_PROFILE[i];
    }
    // En hip-hop/trap/underground las escalas menores son predominantes (~1.03x)
    minScore *= 1.03;

    if (minScore > bestCorr) {
      bestCorr = minScore;
      bestKey = `${PITCH_NAMES[root]}m`;
    }
    if (majScore > bestCorr) {
      bestCorr = majScore;
      bestKey = PITCH_NAMES[root];
    }
  }

  return bestKey;
}

/**
 * Analiza un archivo de audio (WAV, MP3, M4A, FLAC, etc.) y detecta automáticamente su Key, BPM y Duración.
 */
export async function analyzeAudioFile(file: File): Promise<AudioAnalysisResult> {
  const cleanTitle = file.name.replace(/\.[^/.]+$/, "");
  const hints = parseFilenameHints(file.name);

  if (typeof window === "undefined") {
    return {
      bpm: hints.bpm || 140,
      key: hints.key || "F#m",
      durationSec: 150,
      duration: "2:30",
      cleanTitle,
    };
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    try {
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
      const durationSec = Math.max(1, Math.round(audioBuffer.duration || 150));
      const channelData = audioBuffer.getChannelData(0);
      const sampleRate = audioBuffer.sampleRate;

      const detectedBpm = hints.bpm || detectBpmFromSamples(channelData, sampleRate);
      const detectedKey = hints.key || detectKeyFromSamples(channelData, sampleRate);

      await ctx.close().catch(() => {});
      return {
        bpm: detectedBpm,
        key: detectedKey,
        durationSec,
        duration: formatDurationLabel(durationSec),
        cleanTitle,
      };
    } catch {
      await ctx.close().catch(() => {});
    }
  } catch {
    // Fallback si el navegador no pudo decodificar el contenedor
  }

  return {
    bpm: hints.bpm || 140,
    key: hints.key || "F#m",
    durationSec: 150,
    duration: "2:30",
    cleanTitle,
  };
}

/**
 * Descarga un track a disco en 1 click (si tiene audio real descarga el archivo original;
 * si es un track demo sintetizado genera un WAV limpio al vuelo).
 */
export async function downloadTrackAudio(
  title: string,
  artist: string,
  audioUrl?: string
): Promise<void> {
  const safeName = `${artist ? `${artist} - ` : ""}${title}`
    .replace(/[<>:"/\\|?*]+/g, "")
    .trim() || "track";

  if (audioUrl) {
    try {
      const res = await fetch(audioUrl);
      const blob = await res.blob();
      const mime = blob.type || "";
      const ext = mime.includes("wav")
        ? "wav"
        : mime.includes("ogg")
        ? "ogg"
        : mime.includes("flac")
        ? "flac"
        : mime.includes("mp4") || mime.includes("m4a")
        ? "m4a"
        : "mp3";
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = `${safeName}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(objUrl), 4000);
      return;
    } catch {
      const a = document.createElement("a");
      a.href = audioUrl;
      a.download = `${safeName}.mp3`;
      a.target = "_blank";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }
  }

  // Si es un track demo sin archivo subido, sintetizar un preview WAV limpio de 4 segundos para que descargue siempre
  const sampleRate = 44100;
  const seconds = 4;
  const numSamples = sampleRate * seconds;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + numSamples * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, numSamples * 2, true);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const beat = (t * 2.2) % 1;
    const env = Math.exp(-beat * 6.5);
    const freq = 55 + 90 * Math.exp(-beat * 18);
    const sample = Math.tanh(Math.sin(2 * Math.PI * freq * t) * env * 1.8) * 0.75;
    view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, sample)) * 32767, true);
  }

  const wavBlob = new Blob([buffer], { type: "audio/wav" });
  const objUrl = URL.createObjectURL(wavBlob);
  const a = document.createElement("a");
  a.href = objUrl;
  a.download = `${safeName}.wav`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(objUrl), 4000);
}
