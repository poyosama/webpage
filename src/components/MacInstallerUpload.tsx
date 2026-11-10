"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { type Project, type Track, type ArtistProfile } from "@/lib/mock";
import { sfx } from "@/lib/sfx";
import { uploadMediaToSupabase } from "@/lib/supabase";

export type BatchTrackDraft = {
  id: string;
  file?: File;
  fileName: string;
  title: string;
  prod: string;
  bpm: number;
  musicalKey: string;
  color: string;
  audioObjectUrl?: string;
  durationSec: number;
  duration: string;
};

const PALETTE = ["#e11d48", "#0284c7", "#ca8a04", "#65a30d", "#7e22ce", "#14b8a6", "#ec4899", "#f97316"];
const KEYS = ["Am", "Cm", "F#m", "Em", "Dm", "Gm", "Bm", "C#m"];

export default function MacInstallerUpload({
  meProfile,
  projects,
  onAddTrackToProject,
  onPlayTrack,
  onOpenCreateProject,
  onGoToProject,
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
  onGoToProject?: (projectId: string) => void;
}) {
  const [selectedProjectId, setSelectedProjectId] = useState<string>(projects[0]?.id || "");
  const [batchItems, setBatchItems] = useState<BatchTrackDraft[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [activeVinilitoIdx, setActiveVinilitoIdx] = useState(0);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [installedCount, setInstalledCount] = useState<number | null>(null);
  const [globalProd, setGlobalProd] = useState("");
  const [cloudFailCount, setCloudFailCount] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const targetProject =
    projects.find((p) => p.id === selectedProjectId) || projects[0] || null;

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    sfx.tap();
    const newDrafts: BatchTrackDraft[] = Array.from(files).map((file, i) => {
      const clean = file.name.replace(/\.[^/.]+$/, "");
      const col = PALETTE[(batchItems.length + i) % PALETTE.length];
      const k = KEYS[(batchItems.length + i) % KEYS.length];
      const url = URL.createObjectURL(file);
      return {
        id: `batch-${Date.now()}-${i}`,
        file,
        fileName: file.name,
        title: clean,
        prod: globalProd.trim() || "",
        bpm: 130 + ((i * 4) % 24),
        musicalKey: k,
        color: col,
        audioObjectUrl: url,
        durationSec: 145,
        duration: "2:25",
      };
    });

    setBatchItems((prev) => [...prev, ...newDrafts]);
    setInstalledCount(null);
  };

  const updateDraft = (id: string, patch: Partial<BatchTrackDraft>) => {
    setBatchItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  };

  const removeDraft = (id: string) => {
    sfx.tap();
    setBatchItems((prev) => {
      const next = prev.filter((item) => item.id !== id);
      if (activeVinilitoIdx >= next.length) {
        setActiveVinilitoIdx(Math.max(0, next.length - 1));
      }
      return next;
    });
  };

  const handleInstallAll = async () => {
    if (!targetProject) {
      onOpenCreateProject();
      return;
    }
    if (batchItems.length === 0) return;

    sfx.drop();
    setIsUploading(true);
    const startIdx = targetProject.tracks.length;
    let failed = 0;
    setCloudFailCount(0);

    for (let idx = 0; idx < batchItems.length; idx++) {
      const item = batchItems[idx];
      let finalAudioUrl = item.audioObjectUrl;
      if (item.file) {
        let ok = false;
        try {
          const cloudUrl = await uploadMediaToSupabase(item.file, "tracks");
          if (cloudUrl && !cloudUrl.startsWith("blob:")) {
            finalAudioUrl = cloudUrl;
            ok = true;
          }
        } catch (e) {
          console.warn("Storage upload warn:", e);
        }
        if (!ok) failed++;
      }

      const newTrack: Track = {
        id: `custom-track-${Date.now()}-${idx}`,
        title: item.title.trim() || `Track #${startIdx + idx + 1}`,
        artist: meProfile.name,
        prod: item.prod.trim() || undefined,
        bpm: item.bpm,
        key: item.musicalKey,
        duration: item.duration,
        durationSec: item.durationSec,
        version: 1,
        note: `Subido vía Batch WAV (${item.fileName})`,
        c1: "#111111",
        c2: item.color,
        accent: item.color,
        glyph: String(startIdx + idx + 1).padStart(2, "0"),
        audioFreq: 120 + ((idx * 8) % 40),
        customAudioUrl: finalAudioUrl,
      };

      onAddTrackToProject(
        targetProject.id,
        newTrack,
        startIdx + idx,
        finalAudioUrl
      );
    }

    setCloudFailCount(failed);
    setInstalledCount(batchItems.length);
    setBatchItems([]);
    setIsUploading(false);
  };

  return (
    <section className="dmg-section">
      <div className="section-header-row">
        <div>
          <span className="mono-tag">SUBIR BATCH // EL TABLERO</span>
          <h1 className="editorial-h1">Subir Archivos WAV a tu Proyecto</h1>
          <p style={{ color: "var(--ink-secondary)", fontSize: "0.88rem", marginTop: 4 }}>
            Arrastrá uno o muchos archivos de audio. Se arman los vinilitos y los instalás con un solo gesto hacia arriba.
          </p>
        </div>

        <div className="row-actions">
          {projects.length > 0 && (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <span className="mono-tag" style={{ fontSize: "0.72rem" }}>PROYECTO DESTINO:</span>
              <select
                className="apple-select compact-select"
                value={selectedProjectId || projects[0]?.id}
                onChange={(e) => {
                  sfx.tap();
                  setSelectedProjectId(e.target.value);
                }}
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title} ({p.tracks.length} tracks)
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            type="button"
            className="apple-btn ghost"
            onClick={() => {
              sfx.open();
              onOpenCreateProject();
            }}
          >
            + Crear Nuevo Proyecto
          </button>
        </div>
      </div>

      {/* DROPZONE GRANDE PARA ARRASTRAR MULTIPLES ARCHIVOS */}
      <div
        className={`batch-dropzone-hero ${isDraggingOver ? "is-dragover" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDraggingOver(true);
        }}
        onDragLeave={() => setIsDraggingOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDraggingOver(false);
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".wav,.mp3,.m4a,.flac,.aac,.ogg,.aiff,.alac,.opus,audio/wav,audio/x-wav,audio/wave,audio/mpeg,audio/mp3,audio/mp4,audio/x-m4a,audio/aac,audio/flac,application/octet-stream"
          style={{ display: "none" }}
          onChange={(e) => handleFiles(e.target.files)}
        />
        <div className="batch-dropzone-icon">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </div>
        <div style={{ textAlign: "center" }}>
          <b style={{ fontSize: "1.05rem", display: "block", marginBottom: 4 }}>
            Arrastrá acá tus WAVs o MP3s (podés soltar de a muchos juntos)
          </b>
          <span style={{ color: "var(--ink-secondary)", fontSize: "0.82rem" }}>
            O hacé click para seleccionar canciones desde tu explorador de archivos
          </span>
        </div>
        <div className="batch-dropzone-badge">
          <span>{batchItems.length} {batchItems.length === 1 ? "vinilito listo" : "vinilitos listos"}</span>
        </div>
      </div>

      {cloudFailCount > 0 && (
        <p role="alert" style={{ color: "#ff6b6b", fontSize: "0.8rem", margin: "8px 0" }}>
          No se pudo guardar en la nube
        </p>
      )}

      {/* RESULTADO DE INSTALACIÓN EXITOSA */}
      {installedCount !== null && (
        <motion.div
          className="batch-installed-card"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span className="batch-installed-check">✓</span>
            <div>
              <b style={{ fontSize: "1rem" }}>¡{installedCount} canciones instaladas con éxito!</b>
              <p style={{ margin: "2px 0 0", color: "var(--ink-secondary)", fontSize: "0.82rem" }}>
                Ya podés verlas en el Spinner 3D y reproducirlas en el proyecto <b>{targetProject?.title}</b>.
              </p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              className="apple-btn primary"
              onClick={() => {
                if (targetProject && targetProject.tracks[0]) {
                  onPlayTrack(targetProject.tracks[targetProject.tracks.length - 1] || targetProject.tracks[0], targetProject);
                }
              }}
            >
              ▶ Escuchar ahora
            </button>
            {onGoToProject && targetProject && (
              <button
                type="button"
                className="apple-btn secondary"
                onClick={() => onGoToProject(targetProject.id)}
              >
                Ir al proyecto →
              </button>
            )}
          </div>
        </motion.div>
      )}

      {/* MAZO DE VINILITOS SWIPEABLES */}
      {batchItems.length > 0 && (
        <div className="vinilitos-workspace">
          <div className="vinilitos-head">
            <div>
              <span className="mono-tag">MAZO DE VINILITOS // {batchItems.length} DISCOS</span>
              <h3>Swipeá entre las canciones para revisar o editar</h3>
            </div>
            <div className="vinilitos-global-prod">
              <span>Productor común (opcional):</span>
              <input
                type="text"
                value={globalProd}
                placeholder="ej. dorkke, Gonza2k..."
                onChange={(e) => {
                  const val = e.target.value;
                  setGlobalProd(val);
                  setBatchItems((prev) => prev.map((item) => ({ ...item, prod: val })));
                }}
              />
            </div>
          </div>

          {/* Carrusel de Vinilitos */}
          <div className="vinilitos-carousel-track">
            {batchItems.map((item, idx) => {
              const isSelected = activeVinilitoIdx === idx;
              return (
                <motion.div
                  key={item.id}
                  className={`vinilito-card ${isSelected ? "active" : ""}`}
                  onClick={() => {
                    sfx.tap();
                    setActiveVinilitoIdx(idx);
                  }}
                  whileHover={{ y: -4 }}
                  transition={{ type: "spring", stiffness: 300, damping: 25 }}
                >
                  {/* Disco de vinilo 3D estilizado que sobresale del sobre */}
                  <div className="vinilito-disc-preview">
                    <div className="vinilito-grooves" />
                    <div
                      className="vinilito-label"
                      style={{ background: item.color }}
                    >
                      <span className="vinilito-label-hole" />
                      <small>{String(idx + 1).padStart(2, "0")}</small>
                    </div>
                  </div>

                  {/* Sobre del disco */}
                  <div className="vinilito-sleeve">
                    <div className="vinilito-sleeve-header">
                      <span className="mono-tag">#{String(idx + 1).padStart(2, "0")} · WAV</span>
                      <button
                        type="button"
                        className="vinilito-remove"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeDraft(item.id);
                        }}
                        title="Quitar este disco"
                      >
                        ✕
                      </button>
                    </div>

                    <div className="vinilito-fields">
                      <label>
                        <span>TÍTULO DEL TRACK</span>
                        <input
                          value={item.title}
                          onChange={(e) => updateDraft(item.id, { title: e.target.value })}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </label>

                      <label>
                        <span>PRODUCTOR (OPCIONAL)</span>
                        <input
                          value={item.prod}
                          placeholder="ej. dorkke"
                          onChange={(e) => updateDraft(item.id, { prod: e.target.value })}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </label>

                      <div style={{ display: "flex", gap: 8 }}>
                        <label style={{ flex: 1 }}>
                          <span>BPM</span>
                          <input
                            type="number"
                            value={item.bpm}
                            onChange={(e) => updateDraft(item.id, { bpm: Number(e.target.value) })}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </label>
                        <label style={{ flex: 1 }}>
                          <span>KEY</span>
                          <input
                            value={item.musicalKey}
                            onChange={(e) => updateDraft(item.id, { musicalKey: e.target.value })}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </label>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* ==================== EL GESTO: SWIPE ARRIBA PARA DROPEAR E INSTALAR ==================== */}
          <div className="swipe-up-installer-wrap">
            <div className="swipe-up-label-top">
              <span>↑ DESLIZÁ HACIA ARRIBA EL CONTROL O TOCÁ EL BOTÓN PARA DROPEAR TODO</span>
            </div>

            <motion.div
              className="swipe-up-handle-card"
              drag="y"
              dragConstraints={{ top: -110, bottom: 0 }}
              dragElastic={0.15}
              onDragEnd={(_, info) => {
                if (info.offset.y < -65 || info.velocity.y < -150) {
                  handleInstallAll();
                }
              }}
            >
              <div className="swipe-up-grabber" />
              <div className="swipe-up-body">
                <div className="swipe-arrow-anim">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="18 15 12 9 6 15" />
                  </svg>
                </div>
                <div>
                  <b>Swipe arriba para dropear e instalar</b>
                  <p>
                    Se instalarán los {batchItems.length} vinilitos en el proyecto{" "}
                    <b>{targetProject ? targetProject.title : "(creá un proyecto primero)"}</b>
                  </p>
                </div>
                <button
                  type="button"
                  className="apple-btn primary"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleInstallAll();
                  }}
                  style={{ marginLeft: "auto" }}
                >
                  Instalar todos ({batchItems.length})
                </button>
              </div>
            </motion.div>
          </div>
        </div>
      )}
    </section>
  );
}
