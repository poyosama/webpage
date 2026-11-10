"use client";

import { useState } from "react";
import { type ArtistProfile, type Project, type ProjectType, type Track } from "@/lib/mock";
import { sfx } from "@/lib/sfx";

type DraftTrack = {
  id: string;
  title: string;
  bpm: number;
  key: string;
  duration: string;
  durationSec: number;
  customAudioUrl?: string;
};

function parseUntitledFallbackClient(rawUrl: string) {
  let slug = "proyecto-untitled";
  try {
    const parsed = new URL(rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`);
    const parts = parsed.pathname.split("/").filter(Boolean);
    slug = parts[parts.length - 1] || "proyecto-untitled";
  } catch {
    const parts = rawUrl.split("/").filter(Boolean);
    slug = parts[parts.length - 1] || "proyecto-untitled";
  }

  const cleanTitle = slug
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();

  return {
    title: cleanTitle.toUpperCase() || "PROYECTO UNTITLED",
    description: `Importado desde [untitled] (${rawUrl})`,
    tracks: [
      { title: `${cleanTitle} - Track 01`, bpm: 142, key: "F#m", duration: "2:18", durationSec: 138 },
      { title: `${cleanTitle} - Track 02`, bpm: 138, key: "Cm", duration: "2:34", durationSec: 154 },
      { title: `${cleanTitle} - Track 03`, bpm: 146, key: "Am", duration: "2:09", durationSec: 129 },
    ],
  };
}

const PROJECT_TYPES: ProjectType[] = [
  "Mixtape",
  "EP",
  "LP",
  "Album",
  "Single",
  "Beatpost",
  "Soundkit",
  "Drumkit",
  "Loopkit",
  "Catálogo de Beats",
  "WIP",
];

export default function UntitledImporter({
  meProfile,
  existingCount,
  onImportProject,
}: {
  meProfile: ArtistProfile;
  existingCount: number;
  onImportProject: (project: Project) => void;
}) {
  const [urlInput, setUrlInput] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [previewReady, setPreviewReady] = useState<boolean>(false);

  const [projTitle, setProjTitle] = useState<string>("");
  const [projType, setProjType] = useState<ProjectType>("Mixtape");
  const [projDesc, setProjDesc] = useState<string>("");
  const [projColor, setProjColor] = useState<string>("#e11d48");
  const [draftTracks, setDraftTracks] = useState<DraftTrack[]>([]);
  const [newTrackTitle, setNewTrackTitle] = useState<string>("");

  const fetchFromUntitled = async (targetUrl?: string) => {
    const finalUrl = (targetUrl ?? urlInput).trim();
    if (!finalUrl) {
      setErrorMsg("Pegá el link de tu proyecto en [untitled] o subí tus WAV/MP3.");
      return;
    }
    sfx.tap();
    setLoading(true);
    setErrorMsg(null);
    if (targetUrl) setUrlInput(targetUrl);

    try {
      let data: {
        title?: string;
        description?: string;
        tracks?: {
          title?: string;
          bpm?: number;
          key?: string;
          duration?: string;
          durationSec?: number;
          audioUrl?: string;
        }[];
        error?: string;
      };

      try {
        const res = await fetch("/api/import-untitled", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: finalUrl }),
        });
        if (res.ok) {
          data = await res.json();
        } else {
          data = parseUntitledFallbackClient(finalUrl);
        }
      } catch {
        // Fallback automático cuando corre como bundle nativo iOS en Capacitor sin servidor Node local
        data = parseUntitledFallbackClient(finalUrl);
      }

      setProjTitle(data.title || "PROYECTO UNTITLED");
      setProjDesc(
        data.description || `Importado desde [untitled] (${finalUrl})`
      );
      if (finalUrl.toLowerCase().includes("drumkit")) setProjType("Drumkit");
      else if (finalUrl.toLowerCase().includes("loopkit")) setProjType("Loopkit");
      else if (finalUrl.toLowerCase().includes("ep")) setProjType("EP");
      else setProjType("Mixtape");

      const mapped: DraftTrack[] = (data.tracks || []).map((t, i: number) => ({
        id: `unt-tr-${Date.now()}-${i}`,
        title: t.title || `Track 0${i + 1}`,
        bpm: t.bpm || 140,
        key: t.key || "F#m",
        duration: t.duration || "2:24",
        durationSec: t.durationSec || 144,
        customAudioUrl: t.audioUrl,
      }));
      setDraftTracks(mapped);
      setPreviewReady(true);
      sfx.open();
    } catch (err) {
      setErrorMsg(String(err instanceof Error ? err.message : err));
    } finally {
      setLoading(false);
    }
  };

  const handleBulkAudioFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    sfx.tap();

    const fileTracks: DraftTrack[] = files.map((f, idx) => {
      const clean = f.name.replace(/\.[^/.]+$/, "");
      return {
        id: `unt-file-${Date.now()}-${idx}`,
        title: clean,
        bpm: 140,
        key: "F#m",
        duration: "2:20",
        durationSec: 140,
        customAudioUrl: URL.createObjectURL(f),
      };
    });

    if (!previewReady) {
      setProjTitle(files[0].name.replace(/\.[^/.]+$/, "").toUpperCase());
      setProjDesc("Importado desde archivos locales de [untitled].");
      setPreviewReady(true);
    }
    setDraftTracks((prev) => [...prev, ...fileTracks]);
  };

  const handleDeleteDraftTrack = (id: string) => {
    sfx.tap();
    setDraftTracks((prev) => prev.filter((t) => t.id !== id));
  };

  const handleAddDraftTrack = () => {
    const clean = newTrackTitle.trim();
    if (!clean) return;
    sfx.tap();
    setDraftTracks((prev) => [
      ...prev,
      {
        id: `unt-manual-${Date.now()}`,
        title: clean,
        bpm: 142,
        key: "Am",
        duration: "2:15",
        durationSec: 135,
      },
    ]);
    setNewTrackTitle("");
  };

  const handleCommitImport = () => {
    const cleanTitle = (projTitle.trim() || "UNTITLED IMPORT").toUpperCase();
    const idSlug = `${cleanTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now().toString().slice(-3)}`;

    const ringAngle = (existingCount * 1.35) % (Math.PI * 2);
    const blockPos: [number, number, number] = [
      Math.cos(ringAngle) * 1.45,
      ((existingCount % 3) - 1) * 0.85,
      Math.sin(ringAngle) * 0.75,
    ];

    const finalTracks: Track[] = (
      draftTracks.length > 0
        ? draftTracks
        : [
            {
              id: `unt-def-${Date.now()}`,
              title: `${cleanTitle} (01)`,
              bpm: 140,
              key: "F#m",
              duration: "2:20",
              durationSec: 140,
            },
          ]
    ).map((dt, idx) => ({
      id: dt.id,
      title: dt.title,
      artist: meProfile.name,
      prod: meProfile.name,
      bpm: dt.bpm,
      key: dt.key,
      duration: dt.duration,
      durationSec: dt.durationSec,
      version: 1,
      note: "Importado desde [untitled]",
      c1: "#121216",
      c2: projColor,
      accent: projColor,
      glyph: String(idx + 1).padStart(2, "0"),
      audioFreq: 116.5 + (idx % 5) * 12,
      customAudioUrl: dt.customAudioUrl,
    }));

    const newProject: Project = {
      id: idSlug,
      title: cleanTitle,
      artist: meProfile.name,
      artistId: meProfile.id,
      type: projType,
      status: "Publicado",
      year: "2026",
      dateLabel: "[untitled] · IMPORT",
      zone: "Mendoza",
      attributes: ["[untitled]", "Mendoza", "2026", projType],
      targetTrackCount: finalTracks.length,
      c1: "#121216",
      c2: projColor,
      accent: projColor,
      tagGlyph: `0${existingCount + 1} // ${projType.slice(0, 3).toUpperCase()}`,
      description:
        projDesc.trim() ||
        `Proyecto importado desde [untitled] por ${meProfile.name}.`,
      plays: "NUEVO",
      blockPos,
      blockSize: [1.55, 1.45, 1.55],
      videos: [
        {
          id: `v-unt-1-${Date.now()}`,
          label: `${idSlug}_canvas_01.mp4 (4s)`,
          kind: "procedural",
          stylePreset: "vhs-grain",
          c1: "#121216",
          c2: projColor,
        },
        {
          id: `v-unt-2-${Date.now()}`,
          label: `${idSlug}_loop_02.gif (3s)`,
          kind: "procedural",
          stylePreset: "kinetic-type",
          c1: projColor,
          c2: "#121216",
        },
      ],
      tracks: finalTracks,
    };

    sfx.drop();
    onImportProject(newProject);
    setPreviewReady(false);
    setUrlInput("");
  };

  return (
    <section className="untitled-importer-card">
      <div className="untitled-importer-head">
        <div className="untitled-brand-badge">
          <span className="untitled-disc-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>
          </span>
          <div>
            <span className="mono-tag">PUENTE DIRECTO // [untitled] → EL TABLERO</span>
            <h2>Importar proyecto desde [untitled]</h2>
            <p>
              Pegá el link de tu proyecto en <code>untitled.stream</code> o arrastrá tus WAV/MP3 exportados para armar el cubo 3D y el vinilo automáticamente.
            </p>
          </div>
        </div>

        <label className="apple-btn ghost untitled-wav-btn">
          <span>Subir carpeta WAV / MP3 de [untitled]</span>
          <input
            type="file"
            accept=".wav,.mp3,.m4a,.flac,.aac,.ogg,.aiff,.alac,.opus,audio/wav,audio/x-wav,audio/wave,audio/mpeg,audio/mp3,audio/mp4,audio/x-m4a,audio/aac,audio/flac,application/octet-stream"
            multiple
            hidden
            onChange={handleBulkAudioFiles}
          />
        </label>
      </div>

      <div className="untitled-url-bar">
        <input
          type="text"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          placeholder="https://untitled.stream/library/project/..."
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              fetchFromUntitled();
            }
          }}
        />
        <button
          type="button"
          className="apple-btn primary"
          disabled={loading}
          onClick={() => fetchFromUntitled()}
        >
          {loading ? "Leyendo [untitled]..." : "Extraer de [untitled]"}
        </button>
      </div>

      <div className="untitled-notice-box">
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2, color: "var(--ink)" }}>
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="16" x2="12" y2="12"/>
            <line x1="12" y1="8" x2="12.01" y2="8"/>
          </svg>
          <div style={{ fontSize: "0.78rem", lineHeight: 1.45, color: "var(--ink-secondary)" }}>
            <b style={{ color: "var(--ink)", display: "block", marginBottom: 2 }}>
              ¿Por qué no se bajan los archivos WAV automáticamente al pegar el link?
            </b>
            <span>
              <b>[untitled]</b> protege el streaming de audio con tokens de sesión y seguridad CORS en sus servidores de AWS. Por seguridad de tus tracks, ninguna web externa puede descargar tus WAVs crudos automáticamente (incluso si tenés la opción de &quot;downloads&quot; activada dentro de la app de untitled).<br />
              <b>Solución directa:</b> El link extrae al instante el <b>nombre del proyecto, portada y lista de canciones</b>; para que suenen en el reproductor de El tablero, exportá la carpeta con los <b>WAVs / MP3s</b> desde [untitled] y tocalas con el botón de arriba <b>&quot;Subir carpeta WAV / MP3&quot;</b> (o adjuntalas individualmente a cada track).
            </span>
          </div>
        </div>
      </div>

      {errorMsg && <div className="untitled-error-banner">{errorMsg}</div>}

      {previewReady && (
        <div className="untitled-preview-drawer">
          <div className="untitled-preview-top">
            <div className="dmg-field">
              <span>TÍTULO DEL PROYECTO IMPORTADO</span>
              <input
                value={projTitle}
                onChange={(e) => setProjTitle(e.target.value)}
              />
            </div>

            <div className="dmg-field">
              <span>FORMATO / TIPO</span>
              <select
                className="apple-select"
                value={projType}
                onChange={(e) => setProjType(e.target.value as ProjectType)}
              >
                {PROJECT_TYPES.map((pt) => (
                  <option key={pt} value={pt}>
                    {pt}
                  </option>
                ))}
              </select>
            </div>

            <div className="dmg-field">
              <span>COLOR DEL SELLO</span>
              <div className="color-dots">
                {["#e11d48", "#0284c7", "#ca8a04", "#65a30d", "#7e22ce", "#ea580c"].map(
                  (c) => (
                    <button
                      key={c}
                      type="button"
                      style={{ background: c }}
                      className={projColor === c ? "on" : ""}
                      onClick={() => {
                        sfx.tap();
                        setProjColor(c);
                      }}
                    />
                  )
                )}
              </div>
            </div>
          </div>

          <div className="untitled-tracks-editor">
            <div className="card-head">
              <span className="mono-tag">
                {draftTracks.length} TRACKS DETECTADOS EN [untitled] (TOCÁ EL TACHO PARA QUITAR CUALQUIERA)
              </span>
            </div>

            <div className="untitled-track-list">
              {draftTracks.map((tr, i) => (
                <div key={tr.id} className="untitled-track-row">
                  <span className="row-num">{String(i + 1).padStart(2, "0")}</span>
                  <input
                    className="untitled-track-title-input"
                    value={tr.title}
                    onChange={(e) => {
                      const val = e.target.value;
                      setDraftTracks((prev) =>
                        prev.map((item) =>
                          item.id === tr.id ? { ...item, title: val } : item
                        )
                      );
                    }}
                  />
                  <span className="meta-chip">{tr.bpm} BPM</span>
                  <span className="meta-chip">{tr.key}</span>
                  <label
                    className="meta-chip"
                    title="Adjuntar archivo WAV/MP3 para esta canción"
                    style={{
                      cursor: "pointer",
                      background: tr.customAudioUrl ? "rgba(34,197,94,0.15)" : undefined,
                      color: tr.customAudioUrl ? "#16a34a" : undefined,
                      borderColor: tr.customAudioUrl ? "rgba(34,197,94,0.4)" : undefined,
                      fontWeight: 600,
                    }}
                  >
                    <span>{tr.customAudioUrl ? "✓ WAV listo" : "+ WAV/MP3"}</span>
                    <input
                      type="file"
                      accept=".wav,.mp3,.m4a,.flac,.aac,.ogg,.aiff,.alac,.opus,audio/wav,audio/x-wav,audio/wave,audio/mpeg,audio/mp3,audio/x-m4a,audio/aac,audio/flac,audio/ogg"
                      hidden
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) {
                          const customAudioUrl = URL.createObjectURL(f);
                          setDraftTracks((prev) =>
                            prev.map((item) =>
                              item.id === tr.id ? { ...item, customAudioUrl } : item
                            )
                          );
                          sfx.tap();
                        }
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    className="trash-icon-btn"
                    onClick={() => handleDeleteDraftTrack(tr.id)}
                    title="Eliminar track"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  </button>
                </div>
              ))}
            </div>

            <div className="untitled-add-track-inline">
              <input
                value={newTrackTitle}
                onChange={(e) => setNewTrackTitle(e.target.value)}
                placeholder="+ Agregar otro track manual..."
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddDraftTrack();
                  }
                }}
              />
              <button
                type="button"
                className="apple-btn ghost"
                onClick={handleAddDraftTrack}
              >
                + Sumar track
              </button>
            </div>
          </div>

          <div className="untitled-preview-actions">
            <button
              type="button"
              className="apple-btn ghost"
              onClick={() => setPreviewReady(false)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="apple-btn primary"
              onClick={handleCommitImport}
            >
              Importar &ldquo;{projTitle || "Proyecto"}&rdquo; a mi Biblioteca 3D →
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
