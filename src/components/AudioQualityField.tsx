"use client";

/** Cuenta: calidad de reproducción (WAV original o MP3 320). Se guarda en este dispositivo. */
import { useEffect, useState } from "react";
import { getAudioQuality, setAudioQuality, type AudioQuality } from "@/lib/supabase";

export default function AudioQualityField() {
  const [q, setQ] = useState<AudioQuality | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => setQ(getAudioQuality()), []);
  const pick = (v: AudioQuality) => {
    setQ(v);
    setAudioQuality(v);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  };
  return (
    <div className="modal-field play-counts-field">
      <span>CALIDAD DE REPRODUCCIÓN (EN ESTE DISPOSITIVO)</span>
      <div className="dm-policy-opts">
        <button type="button" className={q === "wav" ? "on" : ""} onClick={() => pick("wav")}>
          WAV (máxima)
        </button>
        <button type="button" className={q === "mp3" ? "on" : ""} onClick={() => pick("mp3")}>
          MP3 320 (ahorra datos)
        </button>
      </div>
      <small>
        {saved
          ? "Guardado ✓ (se aplica desde el próximo track)"
          : "En WAV suena el archivo original cuando existe; si la conexión no da, pasa solo al MP3 320."}
      </small>
    </div>
  );
}
