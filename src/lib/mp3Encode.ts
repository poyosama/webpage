"use client";

/**
 * Conversión a MP3 en el navegador para que los tracks se escuchen bien con mala señal.
 * Un WAV de 3 min pesa ~30 MB (1.411 kbps); el MP3 de 192 kbps ~4 MB.
 * El original se sigue guardando aparte para descargar.
 */

const LOSSLESS_EXT = /\.(wav|wave|aif|aiff|aifc|flac|alac|caf)$/i;
const LOSSLESS_MIME = /(wav|wave|aiff|flac|alac|x-caf)/i;
export const STREAM_KBPS = 192;

/** ¿Conviene convertir este archivo? (lossless, o cualquier audio muy pesado) */
export function shouldTranscodeAudio(file: Blob & { name?: string }): boolean {
  const name = file.name || "";
  if (LOSSLESS_EXT.test(name) || LOSSLESS_MIME.test(file.type || "")) return true;
  // MP3/M4A/OGG gigantes (más de ~320 kbps de promedio en temas normales)
  return file.size > 14 * 1024 * 1024;
}

const yieldToUi = () => new Promise<void>((r) => setTimeout(r, 0));

function floatTo16(src: Float32Array, from: number, to: number): Int16Array {
  const out = new Int16Array(to - from);
  for (let i = from, j = 0; i < to; i++, j++) {
    const s = Math.max(-1, Math.min(1, src[i]));
    out[j] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

/**
 * Devuelve un File .mp3 (192 kbps) o null si no se pudo (navegador sin soporte, archivo raro, etc.).
 * `onProgress` va de 0 a 1.
 */
export async function encodeAudioToMp3(
  file: Blob & { name?: string },
  onProgress?: (p: number) => void
): Promise<File | null> {
  if (typeof window === "undefined") return null;
  let ctx: AudioContext | null = null;
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    ctx = new Ctx();
    const raw = await file.arrayBuffer();
    const audio: AudioBuffer = await new Promise((resolve, reject) => {
      // Safari viejo solo tiene la versión con callbacks
      const p = ctx!.decodeAudioData(raw, resolve, reject);
      if (p && typeof (p as Promise<AudioBuffer>).then === "function") (p as Promise<AudioBuffer>).then(resolve, reject);
    });
    if (!audio || audio.duration > 20 * 60) return null; // más de 20 min: no vale la pena en el teléfono

    const { Mp3Encoder } = await import("@breezystack/lamejs");
    const channels = Math.min(2, audio.numberOfChannels);
    const rate = audio.sampleRate;
    if (![32000, 44100, 48000, 22050, 24000, 16000].includes(rate)) return null;
    const enc = new Mp3Encoder(channels, rate, STREAM_KBPS);
    const left = audio.getChannelData(0);
    const right = channels > 1 ? audio.getChannelData(1) : undefined;
    const total = left.length;
    const BLOCK = 1152 * 20; // ~0,5 s por vuelta
    const parts: BlobPart[] = [];
    let lastYield = performance.now();
    for (let i = 0; i < total; i += BLOCK) {
      const end = Math.min(total, i + BLOCK);
      const l = floatTo16(left, i, end);
      const out = right ? enc.encodeBuffer(l, floatTo16(right, i, end)) : enc.encodeBuffer(l);
      if (out.length) parts.push(new Uint8Array(out));
      if (performance.now() - lastYield > 30) {
        onProgress?.(end / total);
        await yieldToUi(); // no congelar la pantalla
        lastYield = performance.now();
      }
    }
    const tail = enc.flush();
    if (tail.length) parts.push(new Uint8Array(tail));
    onProgress?.(1);
    const base = (file.name || "track").replace(/\.[^/.]+$/, "");
    return new File(parts, `${base}.mp3`, { type: "audio/mpeg" });
  } catch (err) {
    console.warn("No se pudo convertir a MP3 (se sube el original):", err);
    return null;
  } finally {
    try {
      void ctx?.close();
    } catch {}
  }
}
