// Generador de audio procedural para tracks de demo sin archivo subido.
// Renderiza un loop de trap/808 en OfflineAudioContext y genera un WAV Blob nativo
// para que en iOS / Android / Safari siga sonando en segundo plano y pantalla bloqueada.

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

function bufferToWaveBlob(abuffer: AudioBuffer): Blob {
  const numOfChan = abuffer.numberOfChannels;
  const length = abuffer.length * numOfChan * 2 + 44;
  const out = new ArrayBuffer(length);
  const view = new DataView(out);
  const channels: Float32Array[] = [];
  let sampleRate = abuffer.sampleRate;
  let offset = 0;
  let pos = 0;

  // RIFF identifier
  writeString(view, pos, "RIFF");
  pos += 4;
  // file length minus RIFF identifier & length
  view.setUint32(pos, length - 8, true);
  pos += 4;
  // RIFF type & format chunk identifier
  writeString(view, pos, "WAVE");
  pos += 4;
  writeString(view, pos, "fmt ");
  pos += 4;
  // format chunk length
  view.setUint32(pos, 16, true);
  pos += 4;
  // sample format (raw PCM = 1)
  view.setUint16(pos, 1, true);
  pos += 2;
  // channel count
  view.setUint16(pos, numOfChan, true);
  pos += 2;
  // sample rate
  view.setUint32(pos, sampleRate, true);
  pos += 4;
  // byte rate (sample rate * block align)
  view.setUint32(pos, sampleRate * numOfChan * 2, true);
  pos += 4;
  // block align (channel count * bytes per sample)
  view.setUint16(pos, numOfChan * 2, true);
  pos += 2;
  // bits per sample
  view.setUint16(pos, 16, true);
  pos += 2;
  // data chunk identifier
  writeString(view, pos, "data");
  pos += 4;
  // data chunk length
  view.setUint32(pos, length - pos - 4, true);
  pos += 4;

  for (let i = 0; i < numOfChan; i++) {
    channels.push(abuffer.getChannelData(i));
  }

  while (offset < abuffer.length) {
    for (let i = 0; i < numOfChan; i++) {
      let sample = Math.max(-1, Math.min(1, channels[i][offset]));
      // escala a 16-bit con dither mínimo
      sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
      view.setInt16(pos, sample, true);
      pos += 2;
    }
    offset++;
  }

  return new Blob([out], { type: "audio/wav" });
}

const proceduralCache = new Map<string, string>();

export async function getProceduralTrackAudioUrl(
  bpm: number,
  rootFreq: number
): Promise<string> {
  const clampedBpm = Math.max(68, Math.min(165, bpm || 140));
  const clampedFreq = Math.max(38, Math.min(160, rootFreq || 55));
  const key = `${clampedBpm}_${clampedFreq.toFixed(1)}`;
  if (proceduralCache.has(key)) {
    return proceduralCache.get(key)!;
  }

  if (typeof window === "undefined") return "";

  const OfflineCtxClass =
    window.OfflineAudioContext ||
    (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext })
      .webkitOfflineAudioContext;

  if (!OfflineCtxClass) return "";

  // Loop de 4 compases (16 tiempos = 32 steps)
  const secondsPerBeat = 60 / clampedBpm;
  const loopDuration = Math.min(16, secondsPerBeat * 16);
  const sampleRate = 44100;

  try {
    const offlineCtx = new OfflineCtxClass(2, Math.floor(sampleRate * loopDuration), sampleRate);
    const masterGain = offlineCtx.createGain();
    masterGain.gain.value = 0.55;
    masterGain.connect(offlineCtx.destination);

    const stepDuration = secondsPerBeat / 2;
    const totalSteps = 32;
    const scale = [1, 1.189, 1.335, 1.498, 1.782];

    for (let step = 0; step < totalSteps; step++) {
      const stepTime = step * stepDuration;
      if (stepTime >= loopDuration) break;

      const isHeavy808 = step % 16 === 0 || step % 16 === 6 || step % 16 === 10;
      const isGhost808 = step % 16 === 3 || step % 16 === 14;
      const isSnare = step % 8 === 4;
      const isHat = step % 2 === 0 || step % 4 === 3;

      // 808 Sub-bass con glide descendente
      if (isHeavy808 || isGhost808) {
        const hit = isHeavy808 ? (step % 16 === 0 ? 1.0 : 0.88) : 0.6;
        const glideDur = isHeavy808 ? 0.36 : 0.22;
        const osc = offlineCtx.createOscillator();
        const gain = offlineCtx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(clampedFreq * (isHeavy808 ? 1.08 : 0.9), stepTime);
        osc.frequency.exponentialRampToValueAtTime(36, Math.min(loopDuration, stepTime + glideDur));

        gain.gain.setValueAtTime(0.0001, stepTime);
        gain.gain.linearRampToValueAtTime(0.38 * hit, stepTime + 0.006);
        gain.gain.exponentialRampToValueAtTime(
          0.0001,
          Math.min(loopDuration, stepTime + glideDur + 0.04)
        );

        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(stepTime);
        osc.stop(Math.min(loopDuration, stepTime + glideDur + 0.05));
      }

      // Snare / Clap de trap
      if (isSnare) {
        const noiseLen = 0.09;
        const noiseBuf = offlineCtx.createBuffer(1, Math.floor(sampleRate * noiseLen), sampleRate);
        const data = noiseBuf.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sampleRate * 0.025));
        }
        const noiseSrc = offlineCtx.createBufferSource();
        noiseSrc.buffer = noiseBuf;

        const filter = offlineCtx.createBiquadFilter();
        filter.type = "bandpass";
        filter.frequency.setValueAtTime(1150, stepTime);
        filter.Q.value = 2.2;

        const sGain = offlineCtx.createGain();
        sGain.gain.setValueAtTime(0.0001, stepTime);
        sGain.gain.linearRampToValueAtTime(0.26, stepTime + 0.002);
        sGain.gain.exponentialRampToValueAtTime(0.0001, Math.min(loopDuration, stepTime + noiseLen));

        noiseSrc.connect(filter);
        filter.connect(sGain);
        sGain.connect(masterGain);
        noiseSrc.start(stepTime);
      }

      // Hi-Hats rápidos y nítidos
      if (isHat) {
        const hatLen = 0.035;
        const hatBuf = offlineCtx.createBuffer(1, Math.floor(sampleRate * hatLen), sampleRate);
        const data = hatBuf.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sampleRate * 0.008));
        }
        const hatSrc = offlineCtx.createBufferSource();
        hatSrc.buffer = hatBuf;

        const hFilter = offlineCtx.createBiquadFilter();
        hFilter.type = "highpass";
        hFilter.frequency.setValueAtTime(4500, stepTime);

        const hGain = offlineCtx.createGain();
        hGain.gain.setValueAtTime(0.0001, stepTime);
        hGain.gain.linearRampToValueAtTime(0.12, stepTime + 0.001);
        hGain.gain.exponentialRampToValueAtTime(0.0001, Math.min(loopDuration, stepTime + hatLen));

        hatSrc.connect(hFilter);
        hFilter.connect(hGain);
        hGain.connect(masterGain);
        hatSrc.start(stepTime);
      }

      // Melodía oscura estilo trap subterráneo
      if (step % 4 === 0 || step % 16 === 14) {
        const ratio = scale[(step / 2) % scale.length | 0];
        const mOsc = offlineCtx.createOscillator();
        const mGain = offlineCtx.createGain();
        mOsc.type = "triangle";
        mOsc.frequency.setValueAtTime(clampedFreq * 2 * ratio, stepTime);
        mGain.gain.setValueAtTime(0.0001, stepTime);
        mGain.gain.linearRampToValueAtTime(0.07, stepTime + 0.012);
        mGain.gain.exponentialRampToValueAtTime(0.0001, Math.min(loopDuration, stepTime + 0.28));

        mOsc.connect(mGain);
        mGain.connect(masterGain);
        mOsc.start(stepTime);
        mOsc.stop(Math.min(loopDuration, stepTime + 0.3));
      }
    }

    const rendered = await offlineCtx.startRendering();
    const blob = bufferToWaveBlob(rendered);
    const url = URL.createObjectURL(blob);
    proceduralCache.set(key, url);
    return url;
  } catch (err) {
    console.warn("Fallo generar audio procedural nativo:", err);
    return "";
  }
}
