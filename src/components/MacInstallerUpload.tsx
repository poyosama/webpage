"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { type Project, type Track, ME_PROFILE } from "@/lib/mock";
import { sfx } from "@/lib/sfx";
import DiscSpinner3D from "./DiscSpinner3D";

export default function MacInstallerUpload({
  projects,
  onAddTrackToProject,
  onPlayTrack,
}: {
  projects: Project[];
  onAddTrackToProject: (
    projectId: string,
    track: Track,
    insertIndex: number,
    customAudioUrl?: string
  ) => void;
  onPlayTrack: (track: Track, project: Project) => void;
}) {
  // Paso 1: Crear el prop (título, bpm, key, color, archivo de audio opcional)
  const [title, setTitle] = useState("mendoza_snippet_v1.wav");
  const [bpm, setBpm] = useState(138);
  const [musicalKey, setMusicalKey] = useState("F#m");
  const [color, setColor] = useState("#e11d48");
  const [audioObjectUrl, setAudioObjectUrl] = useState<string | undefined>(undefined);
  const [fileName, setFileName] = useState<string>("demo_stem_808.wav");

  // Flujo DMG: "prop-ready" -> "zoomed-library" -> "wheel-place" -> "installed"
  const [step, setStep] = useState<"prop-ready" | "zoomed-library" | "wheel-place" | "installed">(
    "prop-ready"
  );
  const [hoverTarget, setHoverTarget] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(projects[0]?.id || "fuego-lento");
  const [wheelSlot, setWheelSlot] = useState<number>(0);

  const profileSocketRef = useRef<HTMLDivElement>(null);
  const projectRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const targetProject =
    projects.find((p) => p.id === selectedProjectId) || projects[0];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    sfx.tap();
    setFileName(file.name);
    const clean = file.name.replace(/\.[^/.]+$/, "");
    setTitle(clean);
    const url = URL.createObjectURL(file);
    setAudioObjectUrl(url);
  };

  // Chequea si el drag soltó encima del socket de perfil (Paso 1 -> Paso 2)
  const handlePropDragEnd = (_: unknown, info: { point: { x: number; y: number } }) => {
    if (step === "prop-ready" && profileSocketRef.current) {
      const rect = profileSocketRef.current.getBoundingClientRect();
      const inside =
        info.point.x >= rect.left - 45 &&
        info.point.x <= rect.right + 45 &&
        info.point.y >= rect.top - 45 &&
        info.point.y <= rect.bottom + 45;
      if (inside) {
        sfx.drop();
        setStep("zoomed-library");
        return;
      }
    }

    if (step === "zoomed-library") {
      for (const p of projects) {
        const el = projectRefs.current[p.id];
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (
          info.point.x >= rect.left - 25 &&
          info.point.x <= rect.right + 25 &&
          info.point.y >= rect.top - 25 &&
          info.point.y <= rect.bottom + 25
        ) {
          sfx.drop();
          setSelectedProjectId(p.id);
          setWheelSlot(p.tracks.length);
          setStep("wheel-place");
          return;
        }
      }
    }
  };

  const commitInstall = () => {
    if (!targetProject) return;
    const newTrack: Track = {
      id: `custom-${Date.now()}`,
      title: title.trim() || "Untitled Cut",
      artist: ME_PROFILE.name,
      prod: ME_PROFILE.name,
      bpm: Number(bpm) || 130,
      key: musicalKey || "Am",
      duration: "2:14",
      durationSec: 134,
      version: 1,
      note: `Subido vía DMG Prop (${fileName})`,
      c1: "#111111",
      c2: color,
      accent: color,
      glyph: String(wheelSlot + 1).padStart(2, "0"),
      audioFreq: 130.8,
    };
    sfx.drop();
    onAddTrackToProject(targetProject.id, newTrack, wheelSlot, audioObjectUrl);
    setStep("installed");
  };

  return (
    <section className="dmg-section">
      <div className="section-header-row">
        <div>
          <span className="mono-tag">MACOS DMG WORKFLOW // SUBIR CORTES</span>
          <h1 className="editorial-h1">Instalar nuevo corte en tu Biblioteca</h1>
        </div>
        <div className="dmg-steps-indicator">
          <button
            type="button"
            className={step === "prop-ready" ? "on" : ""}
            onClick={() => {
              sfx.tap();
              setStep("prop-ready");
            }}
          >
            1. Prop → Perfil
          </button>
          <span>→</span>
          <button
            type="button"
            className={step === "zoomed-library" ? "on" : ""}
            onClick={() => {
              sfx.tap();
              setStep("zoomed-library");
            }}
          >
            2. Zoom Biblioteca
          </button>
          <span>→</span>
          <button
            type="button"
            className={step === "wheel-place" || step === "installed" ? "on" : ""}
            onClick={() => {
              sfx.tap();
              setStep("wheel-place");
            }}
          >
            3. Ruedita de Temas
          </button>
        </div>
      </div>

      {/* Ventana estilo instalador .DMG de macOS */}
      <div className="dmg-window">
        <div className="dmg-titlebar">
          <div className="traffic-lights">
            <i className="tl-red" />
            <i className="tl-yellow" />
            <i className="tl-green" />
          </div>
          <span className="dmg-window-title">
            {title || "nuevo_tema"}.dmg — Instalador de Prop 0261
          </span>
          <span className="mono-tag">ARRASTRÁ EL PROP O USÁ CLICK DIRECTO</span>
        </div>

        {/* Configuración rápida del Prop */}
        <div className="dmg-inspector">
          <label className="dmg-file-btn" onMouseEnter={() => sfx.hover()}>
            <span>📎 Elegir WAV / MP3 ({fileName})</span>
            <input type="file" accept="audio/*" onChange={handleFileChange} hidden />
          </label>

          <div className="dmg-field">
            <span>NOMBRE DEL TEMA</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="nombre del corte..."
            />
          </div>

          <div className="dmg-field small">
            <span>BPM</span>
            <input
              type="number"
              value={bpm}
              onChange={(e) => setBpm(Number(e.target.value))}
            />
          </div>

          <div className="dmg-field small">
            <span>KEY</span>
            <input
              value={musicalKey}
              onChange={(e) => setMusicalKey(e.target.value)}
            />
          </div>

          <div className="dmg-field small">
            <span>SELLO / COLOR</span>
            <div className="color-dots">
              {["#e11d48", "#0284c7", "#ca8a04", "#65a30d", "#7e22ce"].map((c) => (
                <button
                  key={c}
                  type="button"
                  style={{ background: c }}
                  className={color === c ? "on" : ""}
                  onClick={() => {
                    sfx.tap();
                    setColor(c);
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* PASO 1: Arrastrar el Prop al Perfil (como instalar una app en Applications) */}
        <AnimatePresence mode="wait">
          {step === "prop-ready" && (
            <motion.div
              key="step1"
              className="dmg-stage"
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.06 }}
              transition={{ duration: 0.32 }}
            >
              <div className="dmg-arena">
                {/* El Prop físico arrastrable */}
                <div className="dmg-slot">
                  <motion.div
                    drag
                    dragSnapToOrigin
                    whileDrag={{ scale: 1.12, rotate: -4, zIndex: 40 }}
                    whileHover={{ scale: 1.04 }}
                    onDragStart={() => sfx.tap()}
                    onDragEnd={handlePropDragEnd}
                    className="track-prop-card"
                    style={{ "--prop-accent": color } as React.CSSProperties}
                  >
                    <div className="prop-disc-visual">
                      <div className="prop-disc-ring" style={{ background: color }} />
                      <div className="prop-disc-hole" />
                    </div>
                    <div className="prop-card-meta">
                      <b>{title}</b>
                      <span>
                        {bpm} BPM · {musicalKey} · PROP 3D
                      </span>
                    </div>
                  </motion.div>
                  <small className="dmg-hint">1. Arrastrá este Prop hacia tu Perfil →</small>
                </div>

                {/* Flecha punteada estilo macOS DMG */}
                <div className="dmg-arrow">
                  <div className="dmg-chevron">»</div>
                  <span>DROP TO INSTALL</span>
                </div>

                {/* Socket de tu Perfil */}
                <div
                  ref={profileSocketRef}
                  className={`dmg-profile-socket ${hoverTarget === "profile" ? "hovered" : ""}`}
                  onMouseEnter={() => {
                    setHoverTarget("profile");
                    sfx.hover();
                  }}
                  onMouseLeave={() => setHoverTarget(null)}
                  onClick={() => {
                    sfx.drop();
                    setStep("zoomed-library");
                  }}
                >
                  <div className="socket-avatar">
                    <span>🍇</span>
                  </div>
                  <b>{ME_PROFILE.handle}</b>
                  <small>Soltá acá o tocá para hacer Zoom a tu Biblioteca</small>
                </div>
              </div>
            </motion.div>
          )}

          {/* PASO 2: Hizo zoom al perfil y te abre los módulos de proyectos de tu biblioteca */}
          {step === "zoomed-library" && (
            <motion.div
              key="step2"
              className="dmg-stage"
              initial={{ opacity: 0, scale: 0.88 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              transition={{ type: "spring", stiffness: 260, damping: 26 }}
            >
              <div className="dmg-zoom-header">
                <div>
                  <span className="mono-tag">ZOOM EN {ME_PROFILE.handle.toUpperCase()} // BIBLIOTECA ABIERTA</span>
                  <h3>Ahora arrastrá el Prop sobre el módulo del proyecto donde querés meterlo</h3>
                </div>
                <button
                  type="button"
                  className="apple-btn ghost"
                  onClick={() => setStep("prop-ready")}
                >
                  ← Volver atrás
                </button>
              </div>

              <div className="dmg-library-drop-layout">
                <div className="dmg-floating-prop-column">
                  <motion.div
                    drag
                    dragSnapToOrigin
                    whileDrag={{ scale: 1.1, rotate: 4, zIndex: 50 }}
                    onDragStart={() => sfx.tap()}
                    onDragEnd={handlePropDragEnd}
                    className="track-prop-card compact"
                    style={{ "--prop-accent": color } as React.CSSProperties}
                  >
                    <div className="prop-disc-visual">
                      <div className="prop-disc-ring" style={{ background: color }} />
                      <div className="prop-disc-hole" />
                    </div>
                    <div className="prop-card-meta">
                      <b>{title}</b>
                      <span>{bpm} BPM · {musicalKey}</span>
                    </div>
                  </motion.div>
                  <small className="dmg-hint">Arrastralo a un proyecto a la derecha →</small>
                </div>

                <div className="dmg-projects-grid">
                  {projects.map((p) => (
                    <div
                      key={p.id}
                      ref={(el) => {
                        projectRefs.current[p.id] = el;
                      }}
                      className="dmg-project-module"
                      onMouseEnter={() => sfx.hover()}
                      onClick={() => {
                        sfx.drop();
                        setSelectedProjectId(p.id);
                        setWheelSlot(p.tracks.length);
                        setStep("wheel-place");
                      }}
                    >
                      <div
                        className="dmg-proj-swatch"
                        style={{ background: `linear-gradient(135deg, ${p.c1}, ${p.c2})` }}
                      >
                        <span>{p.tracks.length} DISCOS</span>
                      </div>
                      <div>
                        <span className="mono-tag">{p.type} · {p.artist}</span>
                        <h4>{p.title}</h4>
                        <small>Soltar Prop acá para abrir ruedita →</small>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* PASO 3: Ruedita de temas del proyecto para elegir en qué posición queda */}
          {(step === "wheel-place" || step === "installed") && targetProject && (
            <motion.div
              key="step3"
              className="dmg-stage"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <div className="dmg-zoom-header">
                <div>
                  <span className="mono-tag">
                    PROYECTO ABIERTO // {targetProject.title} ({targetProject.tracks.length} DISCOS)
                  </span>
                  <h3>
                    {step === "installed"
                      ? `¡Listo! "${title}" ya es un disco más en la ruedita de ${targetProject.title}`
                      : "Elegí en qué lugar de la ruedita de temas querés acomodar el corte"}
                  </h3>
                </div>
                <div className="row-actions">
                  <button
                    type="button"
                    className="apple-btn ghost"
                    onClick={() => setStep("zoomed-library")}
                  >
                    Cambiar proyecto
                  </button>
                  {step !== "installed" && (
                    <button
                      type="button"
                      className="apple-btn primary"
                      onClick={commitInstall}
                    >
                      ✓ Confirmar e instalar en posición #{wheelSlot + 1}
                    </button>
                  )}
                </div>
              </div>

              {/* Selector táctil de posición en la ruedita */}
              {step !== "installed" && (
                <div className="wheel-slot-selector">
                  {Array.from({ length: targetProject.tracks.length + 1 }, (_, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className={`wheel-slot-pill ${wheelSlot === idx ? "on" : ""}`}
                      onMouseEnter={() => sfx.hover()}
                      onClick={() => {
                        sfx.tick();
                        setWheelSlot(idx);
                      }}
                    >
                      <span>POSICIÓN #{idx + 1}</span>
                      <b>
                        {idx === wheelSlot
                          ? `★ ${title} (NUEVO)`
                          : targetProject.tracks[idx]?.title || "Final del proyecto"}
                      </b>
                    </button>
                  ))}
                </div>
              )}

              {/* Ruedita 3D en vivo mostrando todos los discos del proyecto */}
              <DiscSpinner3D
                project={targetProject}
                onPlayTrack={onPlayTrack}
                compact
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}
