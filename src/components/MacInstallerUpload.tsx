"use client";

import dynamic from "next/dynamic";
import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { type Project, type Track, type ArtistProfile } from "@/lib/mock";
import { sfx } from "@/lib/sfx";
import DiscSpinner3D from "./DiscSpinner3D";

const ManifoldLibrary3D = dynamic(() => import("./ManifoldLibrary3D"), { ssr: false });

export default function MacInstallerUpload({
  meProfile,
  projects,
  onAddTrackToProject,
  onPlayTrack,
  onOpenCreateProject,
}: {
  meProfile: ArtistProfile;
  projects: Project[];
  onAddTrackToProject: (
    projectId: string,
    track: Track,
    insertIndex: number,
    customAudioUrl?: string
  ) => void;
  onPlayTrack: (track: Track, project: Project) => void;
  onOpenCreateProject: () => void;
}) {
  const [title, setTitle] = useState("mendoza_snippet_v1.wav");
  const [bpm, setBpm] = useState(138);
  const [musicalKey, setMusicalKey] = useState("F#m");
  const [color, setColor] = useState("#e11d48");
  const [audioObjectUrl, setAudioObjectUrl] = useState<string | undefined>(undefined);
  const [fileName, setFileName] = useState<string>("demo_stem_808.wav");

  // Flujo DMG: "prop-ready" -> "zoomed-library" (Manifold 3D con pop-out) -> "wheel-place" -> "installed"
  const [step, setStep] = useState<"prop-ready" | "zoomed-library" | "wheel-place" | "installed">(
    "prop-ready"
  );
  const [hoverTarget, setHoverTarget] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(projects[0]?.id || "fuego-lento");
  const [poppedProjectId, setPoppedProjectId] = useState<string | null>(projects[0]?.id || "fuego-lento");
  const [wheelSlot, setWheelSlot] = useState<number>(0);

  const profileSocketRef = useRef<HTMLDivElement>(null);
  const poppedDropZoneRef = useRef<HTMLDivElement>(null);

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

    if (step === "zoomed-library" && poppedDropZoneRef.current && targetProject) {
      const rect = poppedDropZoneRef.current.getBoundingClientRect();
      const inside =
        info.point.x >= rect.left - 35 &&
        info.point.x <= rect.right + 35 &&
        info.point.y >= rect.top - 35 &&
        info.point.y <= rect.bottom + 35;
      if (inside) {
        sfx.drop();
        setWheelSlot(targetProject.tracks.length);
        setStep("wheel-place");
      }
    }
  };

  const commitInstall = () => {
    if (!targetProject) return;
    const newTrack: Track = {
      id: `custom-${Date.now()}`,
      title: title.trim() || "Untitled Cut",
      artist: meProfile.name,
      prod: meProfile.name,
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
      customAudioUrl: audioObjectUrl,
    };
    sfx.drop();
    onAddTrackToProject(targetProject.id, newTrack, wheelSlot, audioObjectUrl);
    setStep("installed");
  };

  return (
    <section className="dmg-section">
      <div className="section-header-row">
        <div>
          <span className="mono-tag">SUBIR // EL TABLERO</span>
          <h1 className="editorial-h1">Subir a tu Biblioteca 3D</h1>
        </div>
        <div className="row-actions">
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
              2. Mis Proyectos (Pop-out)
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
              3. Spinner
            </button>
          </div>
          <button
            type="button"
            className="apple-btn primary"
            onClick={() => {
              sfx.open();
              onOpenCreateProject();
            }}
          >
            + Crear Proyecto
          </button>
        </div>
      </div>

      <div className="dmg-window">
        <div className="dmg-titlebar">
          <div className="traffic-lights">
            <i className="tl-red" />
            <i className="tl-yellow" />
            <i className="tl-green" />
          </div>
          <span className="dmg-window-title">
            {title || "nuevo_track"}.dmg — Subir a Proyecto · El tablero
          </span>
          <span className="mono-tag">ARRASTRÁ EL PROP O TOCÁ CADA PASO</span>
        </div>

        <div className="dmg-inspector">
          <label className="dmg-file-btn" onMouseEnter={() => sfx.hover()}>
            <span>📎 Elegir WAV / MP3 ({fileName})</span>
            <input type="file" accept="audio/*" onChange={handleFileChange} hidden />
          </label>

          <div className="dmg-field">
            <span>NOMBRE DEL TRACK</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="nombre del track..."
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

        <AnimatePresence mode="wait">
          {/* PASO 1: Prop -> Perfil */}
          {step === "prop-ready" && (
            <motion.div
              key="step1"
              className="dmg-stage"
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.06 }}
              transition={{ duration: 0.28 }}
            >
              <div className="dmg-arena">
                <div className="dmg-slot">
                  <motion.div
                    drag
                    dragSnapToOrigin
                    whileDrag={{ scale: 1.12, rotate: -4, zIndex: 40 }}
                    whileHover={{ scale: 1.03 }}
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

                <div className="dmg-arrow">
                  <div className="dmg-chevron">»</div>
                  <span>DROP TO INSTALL</span>
                </div>

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
                    <span>{meProfile.stickers[0] || "🍇"}</span>
                  </div>
                  <b>{meProfile.handle}</b>
                  <small>Soltá acá para hacer Zoom a tu Biblioteca 3D</small>
                </div>
              </div>
            </motion.div>
          )}

          {/* PASO 2: Abre la Biblioteca 3D tal cual aparece; tocás un proyecto, popea de la unidad y le arrastrás el Prop */}
          {step === "zoomed-library" && targetProject && (
            <motion.div
              key="step2"
              className="dmg-stage"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.04 }}
              transition={{ type: "spring", stiffness: 260, damping: 26 }}
            >
              <div className="dmg-zoom-header">
                <div>
                  <span className="mono-tag">
                    ZOOM EN {meProfile.handle.toUpperCase()} // BIBLIOTECA 3D MANIFOLD
                  </span>
                  <h3>
                    Tocá un cubo en la Biblioteca 3D para que popee de la unidad y arrastrá el Prop al proyecto popeado
                  </h3>
                </div>
                <button
                  type="button"
                  className="apple-btn ghost"
                  onClick={() => setStep("prop-ready")}
                >
                  ← Volver al Paso 1
                </button>
              </div>

              <div className="dmg-manifold-install-split">
                {/* Columna izquierda: El Prop listo + el dock del Proyecto que popeó */}
                <div className="dmg-pop-sidebar">
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
                    <small className="dmg-hint">↓ Arrastrá el Prop al proyecto popeado acá abajo</small>
                  </div>

                  {/* Tarjeta del proyecto que acaba de popear del bloque 3D */}
                  <div
                    ref={poppedDropZoneRef}
                    className="popped-project-dropzone"
                    onClick={() => {
                      sfx.drop();
                      setWheelSlot(targetProject.tracks.length);
                      setStep("wheel-place");
                    }}
                  >
                    <span className="mono-tag">BLOQUE POPEADO EN 3D</span>
                    <h4>{targetProject.title}</h4>
                    <p>
                      {targetProject.artist} · {targetProject.tracks.length} discos actuales ·{" "}
                      {targetProject.videos.length} videos
                    </p>
                    <span className="popped-cta">
                      Soltá el Prop acá o tocá para abrir la ruedita de temas →
                    </span>
                  </div>
                </div>

                {/* Derecha: La Biblioteca 3D tal cual aparece, con el bloque seleccionado popeando hacia afuera */}
                <ManifoldLibrary3D
                  projects={projects}
                  selectedProjectId={selectedProjectId}
                  poppedProjectId={poppedProjectId}
                  viewMode="manifold"
                  compact
                  onSelectProject={(proj) => {
                    setSelectedProjectId(proj.id);
                    setPoppedProjectId(proj.id);
                  }}
                  onOpenCreateProject={onOpenCreateProject}
                />
              </div>
            </motion.div>
          )}

          {/* PASO 3: Ruedita 3D de temas del proyecto */}
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
                      ? `¡Listo! "${title}" ya está en el Spinner de ${targetProject.title}`
                      : "Ubicá el nuevo track en el Spinner del proyecto"}
                  </h3>
                </div>
                <div className="row-actions">
                  <button
                    type="button"
                    className="apple-btn ghost"
                    onClick={() => setStep("zoomed-library")}
                  >
                    ← Volver a la Biblioteca 3D
                  </button>
                  {step !== "installed" && (
                    <button
                      type="button"
                      className="apple-btn primary"
                      onClick={commitInstall}
                    >
                      ✓ Confirmar en posición #{wheelSlot + 1}
                    </button>
                  )}
                </div>
              </div>

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
