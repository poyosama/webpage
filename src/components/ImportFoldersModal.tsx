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
  remote,
}: {
  meProfile: ArtistProfile;
  existingCount: number;
  /** "untitled": llegan los proyectos desde el favorito de [untitled] (otra pestaña) */
  remote?: "untitled";
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
  const [remoteStatus, setRemoteStatus] = useState<"waiting" | "receiving" | "done" | null>(remote ? "waiting" : null);

  // Proyectos que manda el favorito de [untitled] desde su pestaña (postMessage con los archivos)
  useEffect(() => {
    if (!remote) return;
    const opener = window.opener as Window | null;
    const allowed = (o: string) => o === "https://untitled.stream" || (location.hostname === "localhost" && /^http:\/\/localhost:\d+$/.test(o));
    const onMsg = (ev: MessageEvent) => {
      if (!allowed(ev.origin) || !ev.data || typeof ev.data !== "object") return;
      const data = ev.data as { type?: string; project?: { title: string; cover?: File | null; tracks: { file: File; title: string; bpm?: number | null; key?: string | null; durationSec?: number | null; uploader?: string | null }[] } };
      if (data.type === "et-project" && data.project) {
        const pr = data.project;
        const key = `untitled:${pr.title}:${Date.now()}`;
        setRemoteStatus("receiving");
        setDrafts((prev) => [
          ...prev,
          {
            key,
            title: pr.title || "Proyecto de [untitled]",
            cover: pr.cover || undefined,
            coverPreview: pr.cover ? URL.createObjectURL(pr.cover) : undefined,
            include: true,
            tracks: pr.tracks.map((t, i) => ({
              file: t.file,
              title: t.title,
              order: i,
              bpm: t.bpm,
              key: t.key,
              durationSec: t.durationSec,
              note: t.uploader ? `Subido por @${t.uploader} en [untitled]` : undefined,
            })),
          },
        ]);
        (ev.source as Window | null)?.postMessage({ type: "et-ack" }, ev.origin);
      } else if (data.type === "et-done") {
        setRemoteStatus("done");
        sfx.drop();
      }
    };
    window.addEventListener("message", onMsg);
    // Avisar a la pestaña de [untitled] que estamos listos (se repite por si todavía no escuchaba)
    const hello = () => {
      try {
        opener?.postMessage({ type: "et-ready" }, location.hostname === "localhost" ? "*" : "https://untitled.stream");
      } catch {}
    };
    hello();
    const t = window.setInterval(hello, 1500);
    return () => {
      window.removeEventListener("message", onMsg);
      window.clearInterval(t);
    };
  }, [remote]);

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
        // BPM, key y duración: si vienen de [untitled] se usan; si no, se analizan del archivo
        const known = t.bpm && t.key && t.durationSec;
        const info = known
          ? {
              bpm: Math.round(t.bpm as number),
              key: t.key as string,
              durationSec: Math.round(t.durationSec as number),
              duration: `${Math.floor((t.durationSec as number) / 60)}:${String(Math.round(t.durationSec as number) % 60).padStart(2, "0")}`,
            }
          : await analyzeAudioFile(t.file);
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
          note: t.note,
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
            <span className="mono-tag">{remote ? "IMPORTAR DESDE [UNTITLED]" : "IMPORTAR"}</span>
            <h3>{remote ? "Tus proyectos de [untitled]" : "Traé tus proyectos"}</h3>
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
            {remote && (
              <div className="imp-remote">
                {remoteStatus === "waiting" && (
                  <p>Esperando a [untitled]… Volvé a la pestaña de [untitled]: el cartelito ya está mandando tus proyectos.</p>
                )}
                {remoteStatus === "receiving" && (
                  <p>
                    Recibiendo… <b>{drafts.length}</b> {drafts.length === 1 ? "proyecto" : "proyectos"} hasta ahora. Podés ir revisándolos.
                  </p>
                )}
                {remoteStatus === "done" && <p>✓ Llegó todo. Revisá y tocá Importar.</p>}
              </div>
            )}
            {!remote && (
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
            )}

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
