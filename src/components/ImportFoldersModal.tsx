"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ArtistProfile, Project, Track } from "@/lib/mock";
import { analyzeAudioFile } from "@/lib/audioAnalysis";
import {
  buildImportDrafts,
  entriesFromDataTransfer,
  entriesFromFileList,
  type ImportEntry,
  type ImportProjectDraft,
} from "@/lib/importFolders";
import { sfx } from "@/lib/sfx";

const uid = (p: string) =>
  typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const autoType = (n: number): Project["type"] => (n <= 1 ? "Single" : n <= 6 ? "EP" : "LP");

export default function ImportFoldersModal({
  meProfile,
  existingCount,
  onClose,
  onImport,
}: {
  meProfile: ArtistProfile;
  existingCount: number;
  onClose: () => void;
  onImport: (projects: Project[]) => void;
}) {
  const [drafts, setDrafts] = useState<ImportProjectDraft[]>([]);
  const [reading, setReading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState("");
  const [canPickFolder, setCanPickFolder] = useState(true);
  const folderInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // iPhone/iPad no deja elegir carpetas: ahí se usan .zip o varios archivos
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    setCanPickFolder(!ios);
    if (folderInputRef.current) folderInputRef.current.setAttribute("webkitdirectory", "");
  }, []);

  const addEntries = async (entries: ImportEntry[]) => {
    if (!entries.length) return;
    setReading(true);
    setError("");
    try {
      const next = await buildImportDrafts(entries);
      if (!next.length) {
        setError("No encontré audios (WAV, MP3, M4A, FLAC, AIFF…) en lo que elegiste.");
      } else {
        sfx.drop();
        setDrafts((prev) => {
          const keys = new Set(prev.map((d) => d.key));
          return [...prev, ...next.filter((d) => !keys.has(d.key))];
        });
      }
    } catch (e) {
      setError("No pude leer esos archivos. Probá de nuevo o con un .zip.");
      console.warn(e);
    } finally {
      setReading(false);
    }
  };

  const chosen = drafts.filter((d) => d.include && d.tracks.length);
  const totalTracks = useMemo(() => chosen.reduce((a, d) => a + d.tracks.length, 0), [chosen]);
  const busy = reading || progress !== null;

  const runImport = async () => {
    if (!chosen.length) return;
    setProgress({ done: 0, total: totalTracks });
    let done = 0;
    const created: Project[] = [];
    for (let pi = 0; pi < chosen.length; pi++) {
      const d = chosen[pi];
      const color = "#e11d48";
      const tracks: Track[] = [];
      for (let i = 0; i < d.tracks.length; i++) {
        const t = d.tracks[i];
        const info = await analyzeAudioFile(t.file); // BPM, key y duración del archivo
        tracks.push({
          id: `tr-imp-${Date.now()}-${pi}-${i}-${Math.random().toString(36).slice(2, 6)}`,
          title: t.title,
          artist: meProfile.name || meProfile.handle,
          prod: meProfile.name || meProfile.handle,
          bpm: info.bpm,
          key: info.key,
          duration: info.duration,
          durationSec: info.durationSec,
          version: 1,
          c1: "#111111",
          c2: color,
          accent: color,
          glyph: String(i + 1).padStart(2, "0"),
          audioFreq: 130.8,
          customAudioUrl: URL.createObjectURL(t.file),
        });
        done++;
        setProgress({ done, total: totalTracks });
      }
      const idx = existingCount + pi;
      const angle = (idx * 1.35) % (Math.PI * 2);
      const type = autoType(tracks.length);
      created.push({
        id: uid("proj"),
        title: d.title.trim() || `Proyecto ${idx + 1}`,
        artist: meProfile.name,
        artistId: meProfile.id,
        type,
        status: "Publicado",
        visibility: "private",
        createdAt: new Date(Date.now() - pi * 1000).toISOString(),
        year: String(new Date().getFullYear()),
        dateLabel: "HOY",
        zone: meProfile.zone || "",
        attributes: [],
        coverUrl: d.cover ? URL.createObjectURL(d.cover) : undefined,
        c1: "#111111",
        c2: color,
        accent: color,
        tagGlyph: `0${idx + 1} // ${type.toUpperCase()}`,
        description: "",
        plays: "0",
        blockPos: [Math.cos(angle) * 1.25, ((idx % 3) - 1) * 0.85, Math.sin(angle) * 0.95],
        blockSize: [1.55, 1.45, 1.55],
        videos: [],
        tracks,
      });
    }
    sfx.drop();
    onImport(created);
  };

  const update = (key: string, patch: Partial<ImportProjectDraft>) =>
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));

  return (
    <div className="apple-modal-backdrop imp-backdrop" onClick={() => !busy && onClose()}>
      <div className="apple-modal-card imp-card" role="dialog" aria-modal="true" aria-label="Importar proyectos" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <span className="mono-tag">IMPORTAR</span>
            <h3>Traé tus proyectos</h3>
          </div>
          <button type="button" className="apple-btn ghost" onClick={onClose} disabled={busy}>
            Cerrar
          </button>
        </div>

        {progress ? (
          <div className="imp-progress">
            <p>
              Analizando tracks (BPM y key)… <b>{progress.done}</b> de {progress.total}
            </p>
            <div className="imp-bar">
              <span style={{ width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%` }} />
            </div>
          </div>
        ) : (
          <>
            <div
              className={`imp-drop ${dragOver ? "is-over" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={async (e) => {
                e.preventDefault();
                setDragOver(false);
                await addEntries(await entriesFromDataTransfer(e.dataTransfer));
              }}
            >
              <p className="imp-drop-title">{reading ? "Leyendo archivos…" : "Soltá acá tus carpetas o .zip"}</p>
              <p className="imp-drop-sub">
                Cada carpeta con audios es un proyecto. Los archivos son los tracks, y si hay una imagen se usa de portada. El BPM y la key se detectan solos.
              </p>
              <div className="imp-drop-actions">
                {canPickFolder && (
                  <label className="apple-btn primary">
                    Elegir carpeta
                    <input
                      ref={folderInputRef}
                      type="file"
                      multiple
                      hidden
                      onChange={async (e) => {
                        if (e.target.files) await addEntries(entriesFromFileList(e.target.files));
                        e.target.value = "";
                      }}
                    />
                  </label>
                )}
                <label className={`apple-btn ${canPickFolder ? "ghost" : "primary"}`}>
                  {canPickFolder ? ".zip o archivos" : "Elegir .zip o archivos"}
                  <input
                    type="file"
                    multiple
                    hidden
                    accept=".zip,application/zip,audio/*,.wav,.mp3,.m4a,.flac,.aif,.aiff,image/*"
                    onChange={async (e) => {
                      if (e.target.files) await addEntries(entriesFromFileList(e.target.files));
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
            </div>

            {error && <p className="imp-error">{error}</p>}

            {drafts.length > 0 && (
              <ul className="imp-list">
                {drafts.map((d) => (
                  <li key={d.key} className={d.include ? "" : "is-off"}>
                    <div className="imp-cover">
                      {d.coverPreview ? <img src={d.coverPreview} alt="" /> : <span>♪</span>}
                    </div>
                    <div className="imp-info">
                      <input
                        className="imp-title"
                        value={d.title}
                        onChange={(e) => update(d.key, { title: e.target.value })}
                        aria-label="Nombre del proyecto"
                      />
                      <span className="imp-meta">
                        {d.tracks.length} {d.tracks.length === 1 ? "track" : "tracks"} · {autoType(d.tracks.length)}
                      </span>
                      <details>
                        <summary>Ver tracks</summary>
                        <ol>
                          {d.tracks.map((t) => (
                            <li key={t.order}>{t.title}</li>
                          ))}
                        </ol>
                      </details>
                    </div>
                    <label className="imp-toggle" title={d.include ? "Se importa" : "No se importa"}>
                      <input type="checkbox" checked={d.include} onChange={(e) => update(d.key, { include: e.target.checked })} />
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        <div className="modal-foot">
          <span className="imp-foot-note">Se importan privados. Después elegís a quién mostrarlos.</span>
          <button type="button" className="apple-btn primary" disabled={!chosen.length || busy} onClick={runImport}>
            {chosen.length
              ? `Importar ${chosen.length} ${chosen.length === 1 ? "proyecto" : "proyectos"} (${totalTracks} tracks)`
              : "Importar"}
          </button>
        </div>
      </div>
    </div>
  );
}
