"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { type Project, type ProjectVideoClip, type Track } from "@/lib/mock";
import { sfx } from "@/lib/sfx";

const CHROMATIC_NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

const PITCH_PRESETS = [
  { label: "-12 st", value: -12, desc: "Octava -1" },
  { label: "-5 st", value: -5, desc: "4ta justa" },
  { label: "-2 st", value: -2, desc: "1 tono abajo" },
  { label: "-1 st", value: -1, desc: "Semilt" },
  { label: "0 st", value: 0, desc: "Original" },
  { label: "+1 st", value: 1, desc: "Semilt" },
  { label: "+2 st", value: 2, desc: "1 tono arriba" },
  { label: "+5 st", value: 5, desc: "4ta arriba" },
  { label: "+12 st", value: 12, desc: "Octava +1" },
];

const TEMPO_PRESETS = [
  { label: "0.80x", value: 0.8, desc: "Slowed" },
  { label: "0.90x", value: 0.9, desc: "Down" },
  { label: "1.00x", value: 1.0, desc: "Original" },
  { label: "1.10x", value: 1.1, desc: "Up" },
  { label: "1.25x", value: 1.25, desc: "Speed Up" },
  { label: "1.35x", value: 1.35, desc: "Nightcore" },
];

function formatTimecode(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "00:00.0";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 10);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${ms}`;
}

export type TrackStudioEditModalProps = {
  track: Track;
  project: Project;
  activeCanvasClip?: ProjectVideoClip | null;
  onClose: () => void;
  onSaveTrack: (updatedTrack: Track, updatedClip?: ProjectVideoClip) => void;
};

export default function TrackStudioEditModal({
  track,
  project,
  activeCanvasClip,
  onClose,
  onSaveTrack,
}: TrackStudioEditModalProps) {
  // 1. Pitch en tiempo real (-12 a +12 semitonos)
  const initialPitch = track.pitchShift ?? sfx.getPitchSemitones() ?? 0;
  const [pitchSemitones, setPitchSemitones] = useState<number>(initialPitch);

  // 2. Tempo en tiempo real (0.6x a 1.4x)
  const initialTempo = track.tempoMultiplier ?? sfx.getTempoMultiplier() ?? 1.0;
  const [tempoMultiplier, setTempoMultiplier] = useState<number>(initialTempo);

  // 3. Key guardada (edición por si está mal)
  const [musicalKey, setMusicalKey] = useState<string>(track.key || "C");

  // Parsear nota raíz y escala (Mayor / Menor)
  const parsedKey = useMemo(() => {
    const raw = (musicalKey || "").trim();
    const match = raw.match(/^([A-G][#b]?)(.*)$/i);
    if (!match) return { root: "C", isMinor: false, suffix: "" };
    const rootUpper = match[1].toUpperCase();
    const rest = match[2].toLowerCase();
    const isMinor = rest.includes("m") || rest.includes("min");
    return { root: rootUpper, isMinor, suffix: match[2] };
  }, [musicalKey]);

  // 4. Video Canvas Trimming (Recorte de entrada y salida)
  const initialVideoUrl: string =
    track.videoUrl ||
    (activeCanvasClip?.mediaType === "video" || activeCanvasClip?.url?.match(/\.(mp4|webm|mov)(\?|$)/i)
      ? activeCanvasClip?.url || ""
      : project.videos?.find((v) => v.url && v.mediaType === "video")?.url || "");

  const [videoUrl, setVideoUrl] = useState<string>(initialVideoUrl);
  const [videoDuration, setVideoDuration] = useState<number>(15);
  const [currentVideoTime, setCurrentVideoTime] = useState<number>(0);

  const initialTrimStart = track.videoTrimStart ?? activeCanvasClip?.trimStartSec ?? 0;
  const initialTrimEnd = track.videoTrimEnd ?? activeCanvasClip?.trimEndSec ?? 15;

  const [trimStart, setTrimStart] = useState<number>(initialTrimStart);
  const [trimEnd, setTrimEnd] = useState<number>(initialTrimEnd);
  const [isVideoPlaying, setIsVideoPlaying] = useState<boolean>(true);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Manejo de pitch en tiempo real
  const handlePitchChange = (semitones: number) => {
    setPitchSemitones(semitones);
    sfx.setPitchSemitones(semitones);
  };

  // Manejo de tempo en tiempo real
  const handleTempoChange = (multiplier: number) => {
    setTempoMultiplier(multiplier);
    sfx.setTempoMultiplier(multiplier);
  };

  // Manejo de notas raíz
  const handleRootNoteSelect = (note: string) => {
    const isMin = parsedKey.isMinor;
    const newKey = isMin ? `${note}m` : `${note} Maj`;
    setMusicalKey(newKey);
    sfx.tap();
  };

  const handleToggleMinorMajor = (makeMinor: boolean) => {
    const root = parsedKey.root || "C";
    const newKey = makeMinor ? `${root}m` : `${root} Maj`;
    setMusicalKey(newKey);
    sfx.tap();
  };

  // Video loaded metadata
  const handleVideoLoadedMetadata = () => {
    if (videoRef.current) {
      const dur = videoRef.current.duration;
      if (Number.isFinite(dur) && dur > 0) {
        setVideoDuration(dur);
        if (trimEnd === 15 || trimEnd > dur) {
          setTrimEnd(dur);
        }
      }
      videoRef.current.currentTime = trimStart;
      videoRef.current.play().catch(() => {});
    }
  };

  // Video time update con looping restringido entre [trimStart, trimEnd]
  const handleVideoTimeUpdate = () => {
    if (!videoRef.current) return;
    const ct = videoRef.current.currentTime;
    setCurrentVideoTime(ct);

    const safeEnd = trimEnd > trimStart ? trimEnd : videoDuration;
    if (ct >= safeEnd || ct < trimStart) {
      videoRef.current.currentTime = Math.max(0, trimStart);
    }
  };

  // Fijar In Point con la posición actual del video
  const handleSetInCurrent = () => {
    if (videoRef.current) {
      const ct = Math.min(videoRef.current.currentTime, Math.max(0, trimEnd - 0.2));
      setTrimStart(Number(ct.toFixed(2)));
      sfx.tick();
    }
  };

  // Fijar Out Point con la posición actual del video
  const handleSetOutCurrent = () => {
    if (videoRef.current) {
      const ct = Math.max(videoRef.current.currentTime, trimStart + 0.2);
      setTrimEnd(Number(ct.toFixed(2)));
      sfx.tick();
    }
  };

  // Resetear recorte a duración completa
  const handleResetTrim = () => {
    setTrimStart(0);
    setTrimEnd(videoDuration);
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
    }
    sfx.tick();
  };

  // Calcular BPM resultante con el tempoMultiplier
  const effectiveBpm = Math.round(track.bpm * tempoMultiplier);

  // Guardar cambios aplicados
  const handleSave = () => {
    sfx.press();

    const updatedTrack: Track = {
      ...track,
      pitchShift: pitchSemitones,
      tempoMultiplier: tempoMultiplier,
      key: musicalKey.trim() || track.key,
      videoTrimStart: trimStart,
      videoTrimEnd: trimEnd,
      videoUrl: videoUrl || track.videoUrl,
    };

    let updatedClip: ProjectVideoClip | undefined = undefined;
    if (activeCanvasClip) {
      updatedClip = {
        ...activeCanvasClip,
        trimStartSec: trimStart,
        trimEndSec: trimEnd,
        url: videoUrl || activeCanvasClip.url,
      };
    } else if (videoUrl) {
      updatedClip = {
        id: `clip-${track.id}-${Date.now()}`,
        label: `${track.title} Canvas`,
        kind: "uploaded",
        stylePreset: "liquid-ink",
        url: videoUrl,
        mediaType: "video",
        trimStartSec: trimStart,
        trimEndSec: trimEnd,
        c1: track.c1,
        c2: track.c2,
      };
    }

    setSaveSuccess(true);
    setTimeout(() => {
      onSaveTrack(updatedTrack, updatedClip);
    }, 280);
  };

  // Descartar y restaurar audio si cancela
  const handleClose = () => {
    sfx.close();
    // Restaurar pitch y tempo originales guardados en el track
    sfx.setPitchSemitones(track.pitchShift ?? 0);
    sfx.setTempoMultiplier(track.tempoMultiplier ?? 1.0);
    onClose();
  };

  return (
    <div className="track-studio-modal-backdrop" onClick={handleClose}>
      <div
        className="track-studio-modal-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Menú de edición del track"
      >
        {/* HEADER APPLE STUDIO GLOSS */}
        <div className="track-studio-header">
          <div className="track-studio-title-group">
            <span className="track-studio-kicker">STUDIO // EDICIÓN DEL TRACK</span>
            <h2 className="track-studio-heading">
              {track.title}
              <span className="track-studio-subtag">{project.title}</span>
            </h2>
          </div>
          <button
            type="button"
            className="apple-btn ghost track-studio-close-btn"
            onClick={handleClose}
            aria-label="Cerrar menú de edición"
            title="Cerrar (Esc)"
          >
            ✕
          </button>
        </div>

        <div className="track-studio-body">
          {/* SECCIÓN 1: PITCH & TEMPO EN TIEMPO REAL */}
          <div className="track-studio-section">
            <div className="track-studio-section-head">
              <div>
                <span className="track-studio-sec-tag">AUDIO // TIEMPO REAL</span>
                <h3>Pitch Shifter & Tempo</h3>
              </div>
              <div className="track-studio-live-pill">
                <span className="live-dot" />
                <span>Audición en vivo</span>
              </div>
            </div>

            <div className="track-studio-controls-grid">
              {/* CAMBIAR PITCH */}
              <div className="track-studio-box">
                <div className="track-studio-box-head">
                  <label htmlFor="pitch-slider">Pitch Shifter</label>
                  <span className="track-studio-val-badge">
                    {pitchSemitones > 0 ? `+${pitchSemitones} st` : pitchSemitones < 0 ? `${pitchSemitones} st` : "0 st (Original)"}
                  </span>
                </div>
                <p className="track-studio-hint">
                  Afiná el track hacia arriba o hacia abajo en semitonos en tiempo real con motor varispeed.
                </p>

                <div className="track-studio-slider-row">
                  <span className="slider-edge-label">-12</span>
                  <input
                    id="pitch-slider"
                    type="range"
                    min={-12}
                    max={12}
                    step={1}
                    value={pitchSemitones}
                    onChange={(e) => handlePitchChange(Number(e.target.value))}
                    className="track-studio-range"
                  />
                  <span className="slider-edge-label">+12</span>
                </div>

                <div className="track-studio-chips-row">
                  {PITCH_PRESETS.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      className={`track-studio-chip ${pitchSemitones === p.value ? "active" : ""}`}
                      onClick={() => handlePitchChange(p.value)}
                      title={p.desc}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* CAMBIAR TEMPO */}
              <div className="track-studio-box">
                <div className="track-studio-box-head">
                  <label htmlFor="tempo-slider">Tempo & BPM</label>
                  <span className="track-studio-val-badge">
                    {effectiveBpm} BPM ({tempoMultiplier.toFixed(2)}x)
                  </span>
                </div>
                <p className="track-studio-hint">
                  Acelerá o desacelerá el groove en vivo (Slowed / Speed up) sincronizado con el reproductor.
                </p>

                <div className="track-studio-slider-row">
                  <span className="slider-edge-label">0.6x</span>
                  <input
                    id="tempo-slider"
                    type="range"
                    min={0.65}
                    max={1.35}
                    step={0.01}
                    value={tempoMultiplier}
                    onChange={(e) => handleTempoChange(Number(e.target.value))}
                    className="track-studio-range"
                  />
                  <span className="slider-edge-label">1.35x</span>
                </div>

                <div className="track-studio-chips-row">
                  {TEMPO_PRESETS.map((t) => (
                    <button
                      key={t.label}
                      type="button"
                      className={`track-studio-chip ${Math.abs(tempoMultiplier - t.value) < 0.02 ? "active" : ""}`}
                      onClick={() => handleTempoChange(t.value)}
                      title={t.desc}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* SECCIÓN 2: EDITAR LA KEY GUARDADA */}
          <div className="track-studio-section">
            <div className="track-studio-section-head">
              <div>
                <span className="track-studio-sec-tag">METADATA // TONALIDAD</span>
                <h3>Editar Key guardada</h3>
              </div>
              <div className="track-studio-current-key-display">
                <span>Key actual:</span>
                <strong>{musicalKey}</strong>
              </div>
            </div>
            <p className="track-studio-hint">
              Corregí la nota raíz o modalidad guardada si el analizador automático no la acertó con exactitud.
            </p>

            <div className="track-studio-key-editor">
              <div className="track-studio-root-chips">
                {CHROMATIC_NOTES.map((note) => (
                  <button
                    key={note}
                    type="button"
                    className={`key-note-chip ${parsedKey.root === note ? "active" : ""}`}
                    onClick={() => handleRootNoteSelect(note)}
                  >
                    {note}
                  </button>
                ))}
              </div>

              <div className="track-studio-mode-row">
                <div className="track-studio-mode-toggle">
                  <button
                    type="button"
                    className={`mode-btn ${parsedKey.isMinor ? "active" : ""}`}
                    onClick={() => handleToggleMinorMajor(true)}
                  >
                    Menor (m)
                  </button>
                  <button
                    type="button"
                    className={`mode-btn ${!parsedKey.isMinor ? "active" : ""}`}
                    onClick={() => handleToggleMinorMajor(false)}
                  >
                    Mayor (Maj)
                  </button>
                </div>

                <div className="track-studio-custom-key-input">
                  <label htmlFor="custom-key-input">Texto libre:</label>
                  <input
                    id="custom-key-input"
                    type="text"
                    value={musicalKey}
                    onChange={(e) => setMusicalKey(e.target.value)}
                    placeholder="ej. F#m, Db Maj, C#..."
                  />
                </div>
              </div>
            </div>
          </div>

          {/* SECCIÓN 3: ACORTAR DURACIÓN DEL VIDEO CANVAS (IN / OUT TRIMMER) */}
          <div className="track-studio-section">
            <div className="track-studio-section-head">
              <div>
                <span className="track-studio-sec-tag">CANVAS // EDICIÓN DE VIDEO</span>
                <h3>Recortar Video Canvas (In / Out Trimmer)</h3>
              </div>
              <div className="track-studio-timecode-badge">
                <span>In: {formatTimecode(trimStart)}</span>
                <span>·</span>
                <span>Out: {formatTimecode(trimEnd)}</span>
                <span>·</span>
                <b>Loop: {Math.max(0, trimEnd - trimStart).toFixed(1)}s</b>
              </div>
            </div>
            <p className="track-studio-hint">
              Recortá la duración del video desde adelante y atrás como en Final Cut o Premiere para que loopee perfecto con el drop.
            </p>

            {videoUrl ? (
              <div className="track-studio-video-suite">
                {/* PREVIEW DEL VIDEO LOOPEANDO ENTRE [trimStart, trimEnd] */}
                <div className="track-studio-video-player-wrap">
                  <video
                    ref={videoRef}
                    src={videoUrl}
                    className="track-studio-preview-video"
                    autoPlay
                    loop
                    muted
                    playsInline
                    onLoadedMetadata={handleVideoLoadedMetadata}
                    onTimeUpdate={handleVideoTimeUpdate}
                  />
                  <div className="video-player-overlay">
                    <button
                      type="button"
                      className="video-play-toggle"
                      onClick={() => {
                        if (videoRef.current) {
                          if (videoRef.current.paused) {
                            videoRef.current.play().catch(() => {});
                            setIsVideoPlaying(true);
                          } else {
                            videoRef.current.pause();
                            setIsVideoPlaying(false);
                          }
                        }
                      }}
                    >
                      {isVideoPlaying ? "Pausar" : "Play"}
                    </button>
                    <span className="video-live-time">{formatTimecode(currentVideoTime)}</span>
                  </div>
                </div>

                {/* TIMELINE DE RECORTE DUAL (IN / OUT PUNTOS) */}
                <div className="track-studio-timeline-container">
                  <div className="timeline-filmstrip-bar">
                    {/* ZONA INACTIVA ANTERIOR A TRIM START */}
                    <div
                      className="timeline-shade shade-left"
                      style={{ width: `${videoDuration > 0 ? (trimStart / videoDuration) * 100 : 0}%` }}
                    />
                    {/* ZONA ACTIVA REPRODUCIÉNDOSE */}
                    <div
                      className="timeline-active-slice"
                      style={{
                        left: `${videoDuration > 0 ? (trimStart / videoDuration) * 100 : 0}%`,
                        width: `${videoDuration > 0 ? ((Math.max(0, trimEnd - trimStart)) / videoDuration) * 100 : 100}%`,
                      }}
                    >
                      {/* CABEZA DE REPRODUCCIÓN EN VIVO */}
                      <div
                        className="timeline-playhead-needle"
                        style={{
                          left: `${
                            trimEnd > trimStart
                              ? ((currentVideoTime - trimStart) / (trimEnd - trimStart)) * 100
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                    {/* ZONA INACTIVA POSTERIOR A TRIM END */}
                    <div
                      className="timeline-shade shade-right"
                      style={{
                        width: `${videoDuration > 0 ? Math.max(0, 100 - (trimEnd / videoDuration) * 100) : 0}%`,
                      }}
                    />
                  </div>

                  {/* SLIDERS DE PUNTO IN Y PUNTO OUT */}
                  <div className="trimmer-sliders-grid">
                    <div className="trimmer-slider-field">
                      <div className="trimmer-field-label">
                        <span>Punto IN (Inicio):</span>
                        <b>{formatTimecode(trimStart)}</b>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={Math.max(0, trimEnd - 0.2)}
                        step={0.1}
                        value={trimStart}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setTrimStart(val);
                          if (videoRef.current) videoRef.current.currentTime = val;
                        }}
                        className="track-studio-range in-handle"
                      />
                    </div>

                    <div className="trimmer-slider-field">
                      <div className="trimmer-field-label">
                        <span>Punto OUT (Final):</span>
                        <b>{formatTimecode(trimEnd)}</b>
                      </div>
                      <input
                        type="range"
                        min={trimStart + 0.2}
                        max={Math.max(trimStart + 0.5, videoDuration)}
                        step={0.1}
                        value={trimEnd}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setTrimEnd(val);
                          if (videoRef.current) videoRef.current.currentTime = Math.max(trimStart, val - 0.5);
                        }}
                        className="track-studio-range out-handle"
                      />
                    </div>
                  </div>

                  {/* BOTONES DE EDICIÓN RÁPIDA ESTILO NLE (PREMIERE / FINAL CUT) */}
                  <div className="trimmer-quick-actions">
                    <button type="button" className="trimmer-quick-btn" onClick={handleSetInCurrent}>
                      [ Fijar In en posición actual
                    </button>
                    <button type="button" className="trimmer-quick-btn" onClick={handleSetOutCurrent}>
                      Fijar Out en posición actual ]
                    </button>
                    <button type="button" className="trimmer-quick-btn reset" onClick={handleResetTrim}>
                      ↺ Resetear recorte
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="track-studio-no-video">
                <p>Este proyecto todavía no tiene video canvas asociado.</p>
                <label className="apple-btn outline upload-video-label">
                  <span>+ Subir video de Canvas (MP4 / WebM)</span>
                  <input
                    type="file"
                    accept="video/mp4,video/webm,video/quicktime"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        const blobUrl = URL.createObjectURL(f);
                        setVideoUrl(blobUrl);
                        sfx.open();
                      }
                    }}
                  />
                </label>
              </div>
            )}
          </div>
        </div>

        {/* FOOTER ACTIONS */}
        <div className="track-studio-footer">
          <button type="button" className="apple-btn ghost" onClick={handleClose}>
            Descartar
          </button>
          <button
            type="button"
            className={`apple-btn solid track-studio-save-btn ${saveSuccess ? "success" : ""}`}
            onClick={handleSave}
          >
            {saveSuccess ? "✓ Guardado con éxito" : "Guardar Cambios"}
          </button>
        </div>
      </div>
    </div>
  );
}
