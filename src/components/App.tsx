"use client";

import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import {
  INITIAL_ME_PROFILE,
  INITIAL_PROJECTS,
  SCENE_ARTISTS,
  type ArtistProfile,
  type Project,
  type ProjectType,
  type ProjectVideoClip,
  type Track,
} from "@/lib/mock";
import { sfx } from "@/lib/sfx";
import MacInstallerUpload from "./MacInstallerUpload";
import type { QueueEntry, RepeatMode } from "./PerformativePlayer";

const DiscSpinner3D = dynamic(() => import("./DiscSpinner3D"), { ssr: false });
const PerformativePlayer = dynamic(() => import("./PerformativePlayer"), { ssr: false });
const ManifoldLibrary3D = dynamic(() => import("./ManifoldLibrary3D"), { ssr: false });

type ScreenTab = "inicio" | "biblioteca" | "subir" | "perfil";

const PROJECT_TYPES: ProjectType[] = [
  "Album",
  "EP",
  "Mixtape",
  "Single",
  "LP",
  "Beat Tape",
  "WIP",
];

export default function App() {
  const [tab, setTab] = useState<ScreenTab>("inicio");
  const [meProfile, setMeProfile] = useState<ArtistProfile>(INITIAL_ME_PROFILE);
  const [projects, setProjects] = useState<Project[]>(INITIAL_PROJECTS);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(INITIAL_PROJECTS[0].id);

  // Estado del reproductor persistente + pantalla completa (con funciones completas de Spotify)
  const [currentTrack, setCurrentTrack] = useState<Track>(INITIAL_PROJECTS[0].tracks[1]);
  const [currentProject, setCurrentProject] = useState<Project>(INITIAL_PROJECTS[0]);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playerExpanded, setPlayerExpanded] = useState<boolean>(false);
  const [muted, setMuted] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(0.85);
  const [shuffle, setShuffle] = useState<boolean>(false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>("off");
  const [likedTrackIds, setLikedTrackIds] = useState<string[]>(["fl-2", "ac-1"]);
  const [userQueue, setUserQueue] = useState<QueueEntry[]>([]);
  const [customAudioMap, setCustomAudioMap] = useState<Record<string, string>>({});

  // Input temporal para agregar atributos personalizados a un proyecto en Biblioteca
  const [newAttrInput, setNewAttrInput] = useState<string>("");

  // Vista en Biblioteca: "manifold" (Bloques) o "disc-row" (Vinilos)
  const [libraryViewMode, setLibraryViewMode] = useState<"manifold" | "disc-row">("manifold");

  // Modales: Editar Track, Editar Perfil y Login/Register con Google
  const [editingTrack, setEditingTrack] = useState<Track | null>(null);
  const [editProfileOpen, setEditProfileOpen] = useState<boolean>(false);
  const [authModalOpen, setAuthModalOpen] = useState<boolean>(false);
  const [googleConnected, setGoogleConnected] = useState<boolean>(true);

  const activeProject =
    projects.find((p) => p.id === selectedProjectId) || projects[0];

  const playTrack = (track: Track, project: Project, openFull = false) => {
    setCurrentTrack(track);
    setCurrentProject(project);
    setIsPlaying(true);
    sfx.play();
    sfx.startGroove(
      track.bpm,
      track.audioFreq,
      track.customAudioUrl || customAudioMap[track.id],
      track.durationSec,
      true
    );
    if (openFull) setPlayerExpanded(true);
  };

  const togglePlay = () => {
    if (isPlaying) {
      setIsPlaying(false);
      sfx.pause();
      sfx.stopGroove();
    } else {
      setIsPlaying(true);
      sfx.play();
      sfx.startGroove(
        currentTrack.bpm,
        currentTrack.audioFreq,
        currentTrack.customAudioUrl || customAudioMap[currentTrack.id],
        currentTrack.durationSec,
        false
      );
    }
  };

  const handleVolumeChange = (nextVol: number) => {
    const clamped = Math.max(0, Math.min(1, nextVol));
    setVolume(clamped);
    if (clamped > 0 && muted) {
      setMuted(false);
      sfx.setMuted(false);
    }
    sfx.setVolume(clamped);
  };

  const handleToggleMute = () => {
    const next = !muted;
    setMuted(next);
    sfx.setMuted(next);
  };

  const togglePlayRef = useRef(togglePlay);
  togglePlayRef.current = togglePlay;

  useEffect(() => {
    const INTERACTIVE_SELECTOR =
      'button, a, label, select, summary, input[type="range"], input[type="color"], [role="button"], .clean-track-row, .artist-dir-item, .filmstrip-thumb, .mini-art, .mini-meta, .prop-card, .upload-dropzone, .quick-proj-pill, .video-clip-remove-btn, .ios-seg-control button, .seg-pills button, .ios-icon-btn, .apple-btn, .mini-btn, .mini-play-btn';

    let pressedEl: Element | null = null;
    let hoveredEl: Element | null = null;

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) {
        return;
      }
      if (e.code === "Space" || e.key === " ") {
        e.preventDefault();
        sfx.press();
        togglePlayRef.current();
      } else if (e.key === "Escape") {
        sfx.close();
        setEditingTrack(null);
        setEditProfileOpen(false);
        setAuthModalOpen(false);
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      const match = target?.closest?.(INTERACTIVE_SELECTOR) || null;
      if (match) {
        pressedEl = match;
        sfx.press();
      }
    };

    const onPointerUp = () => {
      if (pressedEl) {
        pressedEl = null;
        sfx.release();
      }
    };

    const onPointerOver = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      const match = target?.closest?.(INTERACTIVE_SELECTOR) || null;
      if (match && match !== hoveredEl) {
        hoveredEl = match;
        sfx.hover();
      } else if (!match) {
        hoveredEl = null;
      }
    };

    const onInputOrChange = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (
        target.tagName === "SELECT" ||
        (target.tagName === "INPUT" && (target as HTMLInputElement).type === "range")
      ) {
        sfx.tick();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown, { capture: true });
    window.addEventListener("pointerup", onPointerUp, { capture: true });
    window.addEventListener("pointerover", onPointerOver, { passive: true });
    window.addEventListener("input", onInputOrChange, { passive: true });
    window.addEventListener("change", onInputOrChange, { passive: true });
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown, { capture: true });
      window.removeEventListener("pointerup", onPointerUp, { capture: true });
      window.removeEventListener("pointerover", onPointerOver);
      window.removeEventListener("input", onInputOrChange);
      window.removeEventListener("change", onInputOrChange);
    };
  }, []);

  const stepTrack = (dir: 1 | -1) => {
    // Si va hacia adelante y hay canciones en la cola del usuario, reproducir la primera de la cola
    if (dir === 1 && userQueue.length > 0) {
      const [nextItem, ...rest] = userQueue;
      setUserQueue(rest);
      playTrack(nextItem.track, nextItem.project, playerExpanded);
      return;
    }

    const list = currentProject.tracks;
    if (shuffle && list.length > 1) {
      const candidates = list.filter((t) => t.id !== currentTrack.id);
      const randomTrack = candidates[Math.floor(Math.random() * candidates.length)] || list[0];
      playTrack(randomTrack, currentProject, playerExpanded);
      return;
    }

    const idx = list.findIndex((t) => t.id === currentTrack.id);
    const nextIdx = (idx + dir + list.length) % list.length;
    const nextTrack = list[nextIdx] || list[0];
    playTrack(nextTrack, currentProject, playerExpanded);
  };

  // Actualizar metadata completable del proyecto (tipo, atributos, zona, año, estado, etc.)
  const updateProjectMeta = (projectId: string, patch: Partial<Project>) => {
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== projectId) return p;
        const updated = { ...p, ...patch };
        if (currentProject.id === p.id) setCurrentProject(updated);
        return updated;
      })
    );
  };

  const handleAddAttribute = (projectId: string, rawAttr: string) => {
    const clean = rawAttr.trim();
    if (!clean) return;
    const target = projects.find((p) => p.id === projectId);
    if (!target) return;
    const existing = target.attributes || [target.zone, target.year];
    if (existing.includes(clean)) return;
    updateProjectMeta(projectId, { attributes: [...existing, clean] });
    setNewAttrInput("");
    sfx.tap();
  };

  const handleRemoveAttribute = (projectId: string, attrToRemove: string) => {
    const target = projects.find((p) => p.id === projectId);
    if (!target) return;
    const existing = target.attributes || [target.zone, target.year];
    updateProjectMeta(projectId, {
      attributes: existing.filter((a) => a !== attrToRemove),
    });
    sfx.tap();
  };

  const handleAddTrackToProject = (
    projectId: string,
    newTrack: Track,
    insertIndex: number,
    customAudioUrl?: string
  ) => {
    if (customAudioUrl) {
      setCustomAudioMap((prev) => ({ ...prev, [newTrack.id]: customAudioUrl }));
    }
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== projectId) return p;
        const copy = [...p.tracks];
        const safeIdx = Math.max(0, Math.min(copy.length, insertIndex));
        copy.splice(safeIdx, 0, newTrack);
        const updated = { ...p, tracks: copy };
        if (currentProject.id === p.id) setCurrentProject(updated);
        return updated;
      })
    );
    setSelectedProjectId(projectId);
  };

  const handleUploadProjectVideo = (projectId: string, file: File) => {
    const url = URL.createObjectURL(file);
    const isImage =
      file.type.startsWith("image/") || /\.(gif|png|jpe?g|webp|avif)$/i.test(file.name);
    const newClip: ProjectVideoClip = {
      id: `clip-${Date.now()}`,
      label: file.name,
      kind: "uploaded",
      stylePreset: "vhs-grain",
      url,
      mediaType: isImage ? "image" : "video",
      c1: "#111111",
      c2: "#e11d48",
    };
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== projectId) return p;
        return { ...p, videos: [newClip, ...p.videos] };
      })
    );
  };

  const handleRemoveProjectVideo = (projectId: string, clipId: string) => {
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== projectId) return p;
        return {
          ...p,
          videos: p.videos.filter((v) => v.id !== clipId),
        };
      })
    );
  };

  const handleSaveEditedTrack = (updatedTrack: Track) => {
    setProjects((prev) =>
      prev.map((p) => {
        const hasTrack = p.tracks.some((t) => t.id === updatedTrack.id);
        if (!hasTrack) return p;
        const nextTracks = p.tracks.map((t) => (t.id === updatedTrack.id ? updatedTrack : t));
        const nextProj = { ...p, tracks: nextTracks };
        if (currentProject.id === p.id) setCurrentProject(nextProj);
        return nextProj;
      })
    );
    if (currentTrack.id === updatedTrack.id) {
      setCurrentTrack(updatedTrack);
      if (isPlaying) {
        sfx.startGroove(
          updatedTrack.bpm,
          updatedTrack.audioFreq,
          updatedTrack.customAudioUrl || customAudioMap[updatedTrack.id],
          updatedTrack.durationSec,
          false
        );
      }
    }
    setEditingTrack(null);
    sfx.drop();
  };

  const navigate = (nextTab: ScreenTab) => {
    if (nextTab === tab) return;
    sfx.nav();
    setTab(nextTab);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const myProjects = projects.filter((p) => p.artistId === meProfile.id);
  const activeAttributes = activeProject.attributes || [
    activeProject.zone,
    activeProject.year,
  ];

  return (
    <div className="apple-shell">
      <div className="paper-grain" aria-hidden />

      {/* Top Navigation Bar */}
      <header className="ios-navbar">
        <button
          type="button"
          className="ios-brand-title"
          onMouseEnter={() => sfx.hover()}
          onClick={() => navigate("inicio")}
        >
          <span className="brand-dot" />
          <strong>El tablero</strong>
          <small>0261</small>
        </button>

        <nav className="ios-seg-control" aria-label="Navegación principal">
          {(
            [
              ["inicio", "Inicio"],
              ["biblioteca", "Biblioteca"],
              ["subir", "Subir"],
              ["perfil", meProfile.handle],
            ] as [ScreenTab, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={tab === id ? "active" : ""}
              onMouseEnter={() => sfx.hover()}
              onClick={() => navigate(id)}
            >
              {tab === id && (
                <motion.span
                  layoutId="iosSegPill"
                  className="seg-pill-bg"
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                />
              )}
              <span className="seg-label">{label}</span>
            </button>
          ))}
        </nav>

        <div className="ios-nav-right">
          <button
            type="button"
            className="ios-icon-btn"
            onMouseEnter={() => sfx.hover()}
            onClick={() => {
              sfx.open();
              setAuthModalOpen(true);
            }}
          >
            {googleConnected ? `🟢 ${meProfile.handle}` : "🔑 Iniciar con Google"}
          </button>
          <button
            type="button"
            className="ios-icon-btn"
            onMouseEnter={() => sfx.hover()}
            onClick={() => {
              sfx.open();
              setPlayerExpanded(true);
            }}
          >
            🎛️ Reproductor
          </button>
          <button
            type="button"
            className="ios-icon-btn"
            onMouseEnter={() => sfx.hover()}
            onClick={handleToggleMute}
          >
            {muted ? "🔇" : "🔊"}
          </button>
        </div>
      </header>

      <AnimatePresence mode="wait">
        <motion.main
          key={tab}
          className="ios-main"
          initial={{ opacity: 0, y: 12, filter: "blur(5px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -8, filter: "blur(5px)" }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* ==================== 1. INICIO ==================== */}
          {tab === "inicio" && (
            <div className="explore-page">
              <section className="secondstory-strip-card">
                <div className="strip-top-meta">
                  <span>EL TABLERO // UG BOARD</span>
                </div>

                {/* 1º: EL RUIDO EN EL MEDIO DE LA PANTALLA */}
                <div className="corecore-stage">
                  <div className="neon-spine" aria-hidden>
                    <span className="spine-badge">@quetablero</span>
                  </div>

                  <div className="Roster-collage">
                    <div className="collage-line">
                      <span className="cluster-dots">
                        <i style={{ background: "#e11d48" }} />
                        <i style={{ background: "#0284c7" }} />
                        <i style={{ background: "#ca8a04" }} />
                      </span>
                      <button
                        type="button"
                        className="roster-word"
                        onMouseEnter={() => sfx.hover()}
                        onClick={() => playTrack(projects[0].tracks[1], projects[0], false)}
                      >
                        <span className="gothic-drop">F</span>uego
                        <span className="inline-swatch blue">L</span>ento
                        <sup className="sup-tag">ep</sup>
                      </button>
                      <span className="cutout-pill">📌 Mendoza</span>
                    </div>

                    <div className="collage-line">
                      <span className="floating-emoji" aria-hidden>🌹</span>
                      <button
                        type="button"
                        className="roster-word"
                        onMouseEnter={() => sfx.hover()}
                        onClick={() => playTrack(projects[1].tracks[0], projects[1], false)}
                      >
                        L<span className="inline-swatch cyan">u</span>zMala
                        <span className="mesh-badge">〰</span>
                        <sup className="sup-tag">live</sup>
                      </button>
                      <span className="cutout-pill dark">★ 134 BPM</span>
                    </div>

                    <div className="collage-line">
                      <span className="pixel-tag">PIN #04</span>
                      <button
                        type="button"
                        className="roster-word"
                        onMouseEnter={() => sfx.hover()}
                        onClick={() => playTrack(projects[3].tracks[0], projects[3], false)}
                      >
                        <span className="outline-letter">N</span>ahue
                        <span className="inline-swatch coral">B</span>
                        <sup className="sup-tag">lp</sup>
                      </button>
                      <span className="floating-emoji" aria-hidden>🎛️</span>
                      <button
                        type="button"
                        className="roster-word"
                        onMouseEnter={() => sfx.hover()}
                        onClick={() => playTrack(projects[2].tracks[0], projects[2], false)}
                      >
                        Tomi<span className="inline-swatch gold">261</span>
                        <sup className="sup-tag">tape</sup>
                      </button>
                    </div>

                    <div className="collage-line">
                      <button
                        type="button"
                        className="roster-word"
                        onMouseEnter={() => sfx.hover()}
                        onClick={() => playTrack(projects[5].tracks[0], projects[5], false)}
                      >
                        kali<span className="inline-swatch teal">.wav</span>
                        <sup className="sup-tag">subsuelo</sup>
                      </button>
                      <span className="star-stickers" aria-hidden>
                        <b className="star-blue">★</b>
                        <b className="star-gold">⭐</b>
                        <b className="star-black">★</b>
                      </span>
                      <button
                        type="button"
                        className="collage-cta-pill"
                        onMouseEnter={() => sfx.hover()}
                        onClick={() => {
                          sfx.open();
                          setPlayerExpanded(true);
                        }}
                      >
                        🎥 Abrir Snippet Studio →
                      </button>
                    </div>
                  </div>
                </div>

                {/* 2º: NOMBRE DE LA WEB ("El tablero") */}
                <div className="secondstory-mega-footer">
                  <p className="micro-editorial-copy">
                    Tus proyectos. Tu identidad. Tu gente. Tu música.
                  </p>
                  <h1 className="mega-display-title">El tablero</h1>
                </div>

                {/* 3º: TIRA HORIZONTAL DE MINIPORTADAS (sin scrollbar fantasma) */}
                <div className="filmstrip-row">
                  {projects.map((p, idx) => (
                    <motion.button
                      key={p.id}
                      type="button"
                      whileHover={{ y: -3, scale: 1.01 }}
                      whileTap={{ scale: 0.985 }}
                      className="filmstrip-thumb"
                      onMouseEnter={() => sfx.hover()}
                      onClick={() => playTrack(p.tracks[0], p, false)}
                    >
                      <div
                        className="filmstrip-art"
                        style={{
                          background: `linear-gradient(145deg, ${p.c1} 0%, ${p.c2} 100%)`,
                        }}
                      >
                        <span className="thumb-index">0{idx + 1}</span>
                        <strong className="thumb-glyph">{p.tracks[0]?.glyph}</strong>
                        <small>{p.type} · {p.videos.length} videos</small>
                      </div>
                      <div className="filmstrip-caption">
                        <b>{p.title}</b>
                        <span>{p.artist}</span>
                      </div>
                    </motion.button>
                  ))}
                </div>
              </section>

              {/* Grilla inferior de proyectos y artistas */}
              <section className="explore-bottom-grid">
                <div className="apple-card">
                  <div className="card-head">
                    <span className="mono-tag">PROYECTOS // ROTACIÓN DEL TABLERO</span>
                    <h3>Proyectos fijados</h3>
                  </div>
                  <div className="track-list-clean">
                    {projects
                      .flatMap((p) => p.tracks.slice(0, 2).map((t) => ({ track: t, proj: p })))
                      .slice(0, 6)
                      .map(({ track, proj }, i) => {
                        const active = currentTrack.id === track.id;
                        return (
                          <div
                            key={track.id}
                            className={`clean-track-row ${active ? "is-playing" : ""}`}
                            onMouseEnter={() => sfx.hover()}
                            onClick={() => playTrack(track, proj, false)}
                          >
                            <span className="row-num">{String(i + 1).padStart(2, "0")}</span>
                            <div
                              className="row-swatch"
                              style={{ background: `linear-gradient(135deg, ${track.c1}, ${track.c2})` }}
                            >
                              {active && isPlaying ? "❚❚" : "▶"}
                            </div>
                            <div className="row-main">
                              <b>{track.title}</b>
                              <span>
                                {track.artist} {track.feat ? `feat. ${track.feat}` : ""} · {proj.title}
                              </span>
                            </div>
                            <div className="row-pills">
                              <span className="meta-chip">{track.bpm} BPM</span>
                              <span className="meta-chip">{track.key}</span>
                            </div>
                            <button
                              type="button"
                              className="row-snippet-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingTrack(track);
                              }}
                            >
                              ✎ Editar
                            </button>
                          </div>
                        );
                      })}
                  </div>
                </div>

                <div className="apple-card">
                  <div className="card-head">
                    <span className="mono-tag">ARTISTAS // ROTACIÓN DEL TABLERO</span>
                    <h3>Artistas en El Tablero</h3>
                  </div>
                  <div className="artist-directory-list">
                    {SCENE_ARTISTS.map((a) => (
                      <div
                        key={a.id}
                        className="artist-dir-item"
                        onMouseEnter={() => sfx.hover()}
                        onClick={() => {
                          const found = projects.find((p) => p.artistId === a.id);
                          if (found) {
                            setSelectedProjectId(found.id);
                            navigate("biblioteca");
                          }
                        }}
                      >
                        <div className="artist-dir-avatar" style={{ background: a.color }}>
                          {a.stickers[0]}
                        </div>
                        <div className="artist-dir-info">
                          <b>
                            {a.name} <em>{a.handle}</em>
                          </b>
                          <span>
                            {a.role} · {a.zone}
                          </span>
                        </div>
                        <div className="artist-dir-stats">
                          <b>{a.tracksCount}</b>
                          <small>tracks</small>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            </div>
          )}

          {/* ==================== 2. BIBLIOTECA ==================== */}
          {tab === "biblioteca" && (
            <div className="library-page">
              <div className="section-header-row">
                <div>
                  <span className="mono-tag">BIBLIOTECA 3D // EL TABLERO</span>
                  <h1 className="editorial-h1">Mis Proyectos</h1>
                </div>
                <div className="seg-pills">
                  <button
                    type="button"
                    className={libraryViewMode === "manifold" ? "on" : ""}
                    onClick={() => {
                      sfx.tap();
                      setLibraryViewMode("manifold");
                    }}
                  >
                    🧊 Bloques
                  </button>
                  <button
                    type="button"
                    className={libraryViewMode === "disc-row" ? "on" : ""}
                    onClick={() => {
                      sfx.tap();
                      setLibraryViewMode("disc-row");
                    }}
                  >
                    💿 Vinilos
                  </button>
                </div>
              </div>

              <ManifoldLibrary3D
                projects={projects}
                selectedProjectId={activeProject.id}
                viewMode={libraryViewMode}
                onSelectProject={(proj) => setSelectedProjectId(proj.id)}
                onUploadProjectVideo={handleUploadProjectVideo}
                onRemoveProjectVideo={handleRemoveProjectVideo}
              />

              {/* Inspector del proyecto seleccionado con Metadata completable por el usuario y Spinner 3D */}
              <section className="project-inspector-sheet">
                <div className="inspector-header">
                  <div className="inspector-meta-builder">
                    {/* Metadata completable por el usuario: Tipo de Proyecto, Cantidad de Canciones, Estado y Atributos */}
                    <div className="project-editable-meta-bar">
                      <label className="meta-pill-select">
                        <span>TIPO</span>
                        <select
                          value={activeProject.type}
                          onChange={(e) => {
                            sfx.tick();
                            updateProjectMeta(activeProject.id, {
                              type: e.target.value as ProjectType,
                            });
                          }}
                        >
                          {PROJECT_TYPES.map((pt) => (
                            <option key={pt} value={pt}>
                              {pt}
                            </option>
                          ))}
                        </select>
                      </label>

                      <div className="meta-pill-static">
                        <span>CANCIONES</span>
                        <b>{activeProject.tracks.length} tracks</b>
                      </div>

                      <label className="meta-pill-select">
                        <span>ESTADO</span>
                        <select
                          value={activeProject.status}
                          onChange={(e) => {
                            sfx.tick();
                            updateProjectMeta(activeProject.id, {
                              status: e.target.value as Project["status"],
                            });
                          }}
                        >
                          <option value="Publicado">Publicado</option>
                          <option value="En mezcla">En mezcla</option>
                          <option value="Master">Master</option>
                          <option value="WIP">WIP</option>
                          <option value="Privado">Privado</option>
                        </select>
                      </label>

                      {activeAttributes.map((attr) => (
                        <span key={attr} className="meta-user-attr-pill">
                          {attr}
                          <button
                            type="button"
                            onClick={() => handleRemoveAttribute(activeProject.id, attr)}
                            title="Quitar atributo"
                          >
                            ✕
                          </button>
                        </span>
                      ))}

                      <form
                        className="meta-add-attr-form"
                        onSubmit={(e) => {
                          e.preventDefault();
                          handleAddAttribute(activeProject.id, newAttrInput);
                        }}
                      >
                        <input
                          value={newAttrInput}
                          onChange={(e) => setNewAttrInput(e.target.value)}
                          placeholder="+ Atributo (ej. Trap, 2026...)"
                        />
                        {newAttrInput.trim() && (
                          <button type="submit" className="meta-attr-submit">
                            +
                          </button>
                        )}
                      </form>
                    </div>

                    <h2>
                      {activeProject.title} — <em>{activeProject.artist}</em>
                    </h2>
                    <p>{activeProject.description}</p>
                  </div>

                  <div className="row-actions">
                    <button
                      type="button"
                      className="apple-btn ghost"
                      onClick={() => navigate("subir")}
                    >
                      + Subir track al proyecto
                    </button>
                    <button
                      type="button"
                      className="apple-btn primary"
                      onClick={() => playTrack(activeProject.tracks[0], activeProject, true)}
                    >
                      ▶ Abrir en Reproductor 3D
                    </button>
                  </div>
                </div>

                <div className="inspector-split">
                  <DiscSpinner3D
                    project={activeProject}
                    currentTrackId={currentTrack.id}
                    onPlayTrack={(tr, pr) => playTrack(tr, pr, false)}
                  />

                  <div className="inspector-tracklist">
                    <div className="card-head">
                      <span className="mono-tag">
                        {activeProject.tracks.length} CANCIONES EN ESTE PROYECTO
                      </span>
                      <h3>Tracks del proyecto (tocá ✎ para editar track)</h3>
                    </div>
                    {activeProject.tracks.map((t, idx) => {
                      const isCurrent = currentTrack.id === t.id;
                      return (
                        <div
                          key={t.id}
                          className={`clean-track-row ${isCurrent ? "is-playing" : ""}`}
                          onMouseEnter={() => sfx.hover()}
                          onClick={() => playTrack(t, activeProject, false)}
                        >
                          <span className="row-num">{String(idx + 1).padStart(2, "0")}</span>
                          <div className="row-main">
                            <b>{t.title}</b>
                            <span>
                              {t.artist} {t.feat ? `feat. ${t.feat}` : ""} {t.note ? `· ${t.note}` : ""}
                            </span>
                          </div>
                          <div className="row-pills">
                            <span className="meta-chip">{t.bpm} BPM</span>
                            <span className="meta-chip">{t.key}</span>
                            <span className="meta-chip">v{t.version}</span>
                          </div>
                          <button
                            type="button"
                            className="row-snippet-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingTrack(t);
                            }}
                          >
                            ✎ Editar track
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>
            </div>
          )}

          {/* ==================== 3. SUBIR ==================== */}
          {tab === "subir" && (
            <MacInstallerUpload
              meProfile={meProfile}
              projects={projects}
              onAddTrackToProject={handleAddTrackToProject}
              onPlayTrack={(tr, pr) => playTrack(tr, pr, false)}
            />
          )}

          {/* ==================== 4. PERFIL ==================== */}
          {tab === "perfil" && (
            <div className="profile-page">
              <section className="profile-hero-card">
                <div className="profile-hero-top">
                  <div
                    className="profile-avatar-large"
                    style={{ background: meProfile.color }}
                  >
                    <span>{meProfile.stickers[0] || "🍇"}</span>
                  </div>
                  <div className="profile-main-copy">
                    <div className="profile-badges">
                      <span className="mono-tag">{meProfile.crew}</span>
                      <span className="mono-tag">{meProfile.zone}</span>
                      {googleConnected && (
                        <span className="mono-tag google-verified">
                          ✓ Google: {meProfile.email}
                        </span>
                      )}
                    </div>
                    <h1>
                      {meProfile.name} <em>{meProfile.handle}</em>
                    </h1>
                    <p>{meProfile.bio}</p>
                    <div className="profile-sticker-tray">
                      {meProfile.stickers.map((st, i) => (
                        <span key={i} className="sticker-chip">
                          {st}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="profile-cta-col">
                    <button
                      type="button"
                      className="apple-btn primary"
                      onClick={() => {
                        sfx.open();
                        setEditProfileOpen(true);
                      }}
                    >
                      ✎ Editar Perfil &amp; Identidad
                    </button>
                    <button
                      type="button"
                      className="apple-btn ghost"
                      onClick={() => {
                        sfx.open();
                        setAuthModalOpen(true);
                      }}
                    >
                      🔑 Cuenta / Google Sign-In
                    </button>
                  </div>
                </div>

                <div className="profile-metrics-bar">
                  <div>
                    <b>{meProfile.tracksCount}</b>
                    <span>TRACKS SUBIDOS</span>
                  </div>
                  <div>
                    <b>{myProjects.length}</b>
                    <span>PROYECTOS EN 3D</span>
                  </div>
                  <div>
                    <b>{meProfile.friendsCount}</b>
                    <span>AMIGOS EN LA ESCENA</span>
                  </div>
                  <div>
                    <b>{meProfile.followersCount}</b>
                    <span>OYENTES / FOLLOWERS</span>
                  </div>
                  <div>
                    <b>{meProfile.playsTotal}</b>
                    <span>REPRODUCCIONES</span>
                  </div>
                </div>
              </section>

              <section className="profile-manifold-showcase">
                <div className="section-header-row">
                  <div>
                    <span className="mono-tag">
                      IDENTIDAD VISUAL // BIBLIOTECA 3D DE {meProfile.handle.toUpperCase()}
                    </span>
                    <h2 className="editorial-h2">
                      Mis Proyectos &amp; Canvas
                    </h2>
                  </div>
                  <button
                    type="button"
                    className="apple-btn ghost"
                    onClick={() => navigate("subir")}
                  >
                    + Subir con Prop
                  </button>
                </div>

                <ManifoldLibrary3D
                  projects={myProjects.length > 0 ? myProjects : projects}
                  selectedProjectId={selectedProjectId}
                  viewMode="manifold"
                  onSelectProject={(proj) => setSelectedProjectId(proj.id)}
                  onUploadProjectVideo={handleUploadProjectVideo}
                />
              </section>
            </div>
          )}
        </motion.main>
      </AnimatePresence>

      {/* ==================== DYNAMIC ISLAND REPRODUCTOR (CONTROLES 100% CENTRADOS + SOLO TRACK/ARTISTA + SLIDER DE VOLUMEN) ==================== */}
      <AnimatePresence>
        {!playerExpanded && (
          <div className="ios-mini-player-dock">
            <motion.div
              className="ios-mini-player"
              initial={{ y: 80, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 80, opacity: 0 }}
              transition={{ type: "spring", stiffness: 320, damping: 28 }}
            >
              {/* Columna Izquierda: Portada + Nombre del Track y Artista (sin BPM ni Key) */}
              <div
                className="mini-left"
                onClick={() => {
                  sfx.open();
                  setPlayerExpanded(true);
                }}
              >
                <div
                  className="mini-art"
                  style={{
                    background: `linear-gradient(135deg, ${currentTrack.c1}, ${currentTrack.c2})`,
                  }}
                >
                  <span className={isPlaying ? "spin-slow" : ""}>{currentTrack.glyph}</span>
                </div>

                <div className="mini-meta">
                  <b>{currentTrack.title}</b>
                  <span>{currentTrack.artist}</span>
                </div>
              </div>

              {/* Columna Central: Controles Play / Skip perfectamente centrados en el eje del Dynamic Island */}
              <div className="mini-controls">
                <button
                  type="button"
                  className="mini-btn"
                  onClick={() => stepTrack(-1)}
                  aria-label="Anterior"
                >
                  ⏮
                </button>
                <button
                  type="button"
                  className="mini-play-btn"
                  onClick={togglePlay}
                  aria-label="Reproducir o pausar"
                >
                  {isPlaying ? "❚❚" : "▶"}
                </button>
                <button
                  type="button"
                  className="mini-btn"
                  onClick={() => stepTrack(1)}
                  aria-label="Siguiente"
                >
                  ⏭
                </button>
              </div>

              {/* Columna Derecha: Slider de Volumen en lugar del botón Abrir Reproductor */}
              <div className="mini-volume-wrap">
                <button
                  type="button"
                  className="mini-vol-btn"
                  onClick={handleToggleMute}
                  aria-label={muted ? "Activar sonido" : "Silenciar"}
                >
                  {muted || volume === 0 ? "🔇" : volume < 0.5 ? "🔉" : "🔊"}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={muted ? 0 : volume}
                  onChange={(e) => handleVolumeChange(Number(e.target.value))}
                  className="apple-volume-slider"
                  aria-label="Volumen"
                />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ==================== PANTALLA REPRODUCTOR 3D COMPLETA ==================== */}
      <AnimatePresence>
        {playerExpanded && (
          <motion.div
            className="perf-modal-layer"
            initial={{ opacity: 0, y: "100%" }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: "100%" }}
            transition={{ type: "spring", stiffness: 280, damping: 30 }}
          >
            <PerformativePlayer
              track={currentTrack}
              project={currentProject}
              allProjects={projects}
              isPlaying={isPlaying}
              volume={volume}
              muted={muted}
              shuffle={shuffle}
              repeatMode={repeatMode}
              likedTrackIds={likedTrackIds}
              userQueue={userQueue}
              onTogglePlay={togglePlay}
              onNext={() => stepTrack(1)}
              onPrev={() => stepTrack(-1)}
              onSelectTrack={(t, p) => playTrack(t, p, true)}
              onToggleShuffle={() => setShuffle((s) => !s)}
              onCycleRepeat={() =>
                setRepeatMode((m) => (m === "off" ? "all" : m === "all" ? "one" : "off"))
              }
              onToggleLike={(id) =>
                setLikedTrackIds((prev) =>
                  prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
                )
              }
              onAddToQueue={(t, p) => setUserQueue((prev) => [...prev, { track: t, project: p }])}
              onRemoveFromQueue={(idx) =>
                setUserQueue((prev) => prev.filter((_, i) => i !== idx))
              }
              onClearQueue={() => setUserQueue([])}
              onVolumeChange={handleVolumeChange}
              onToggleMute={handleToggleMute}
              onClose={() => setPlayerExpanded(false)}
              onJumpToProject={(projId) => {
                setPlayerExpanded(false);
                setSelectedProjectId(projId);
                setTab("biblioteca");
              }}
              onOpenEditTrack={() => setEditingTrack(currentTrack)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ==================== PANTALLA / MODAL "EDITAR TRACK" ==================== */}
      <AnimatePresence>
        {editingTrack && (
          <EditTrackModal
            track={editingTrack}
            onClose={() => setEditingTrack(null)}
            onSave={handleSaveEditedTrack}
          />
        )}
      </AnimatePresence>

      {/* ==================== MODAL "EDITAR PERFIL" ==================== */}
      <AnimatePresence>
        {editProfileOpen && (
          <EditProfileModal
            profile={meProfile}
            onClose={() => setEditProfileOpen(false)}
            onSave={(updated) => {
              setMeProfile(updated);
              setEditProfileOpen(false);
              sfx.drop();
            }}
          />
        )}
      </AnimatePresence>

      {/* ==================== MODAL CUENTAS / LOGIN & REGISTER CON GOOGLE ==================== */}
      <AnimatePresence>
        {authModalOpen && (
          <GoogleAuthModal
            profile={meProfile}
            connected={googleConnected}
            onClose={() => setAuthModalOpen(false)}
            onSignInGoogle={(email, name, handle) => {
              setGoogleConnected(true);
              setMeProfile((prev) => ({
                ...prev,
                email,
                name: name || prev.name,
                handle: handle.startsWith("@") ? handle : `@${handle}`,
              }));
              setAuthModalOpen(false);
              sfx.drop();
            }}
            onSignOut={() => {
              setGoogleConnected(false);
              setAuthModalOpen(false);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ==================== COMPONENTE: PANTALLA EDITAR TRACK ==================== */
function EditTrackModal({
  track,
  onClose,
  onSave,
}: {
  track: Track;
  onClose: () => void;
  onSave: (t: Track) => void;
}) {
  const [title, setTitle] = useState(track.title);
  const [artist, setArtist] = useState(track.artist);
  const [feat, setFeat] = useState(track.feat || "");
  const [prod, setProd] = useState(track.prod || "");
  const [bpm, setBpm] = useState(track.bpm);
  const [musicalKey, setMusicalKey] = useState(track.key);
  const [version, setVersion] = useState(track.version);
  const [note, setNote] = useState(track.note || "");
  const [c2, setC2] = useState(track.c2);
  const [customAudioUrl, setCustomAudioUrl] = useState<string | undefined>(track.customAudioUrl);

  return (
    <motion.div
      className="apple-modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="apple-modal-card"
        initial={{ scale: 0.94, y: 16 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.94, y: 16 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <span className="mono-tag">STUDIO INSPECTOR // EDITAR TRACK</span>
            <h3>Editar metadata y versión del track</h3>
          </div>
          <button type="button" className="apple-btn ghost" onClick={onClose}>
            ✕ Cerrar
          </button>
        </div>

        <div className="modal-form-grid">
          <label className="modal-field">
            <span>TÍTULO DEL TRACK</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="modal-field">
            <span>ARTISTA PRINCIPAL</span>
            <input value={artist} onChange={(e) => setArtist(e.target.value)} />
          </label>
          <label className="modal-field">
            <span>FEATURING (OPCIONAL)</span>
            <input value={feat} onChange={(e) => setFeat(e.target.value)} placeholder="ej. LUZ MALA" />
          </label>
          <label className="modal-field">
            <span>PRODUCTOR / MIX</span>
            <input value={prod} onChange={(e) => setProd(e.target.value)} placeholder="ej. Nahue B" />
          </label>
          <label className="modal-field">
            <span>BPM</span>
            <input type="number" value={bpm} onChange={(e) => setBpm(Number(e.target.value))} />
          </label>
          <label className="modal-field">
            <span>KEY (TONALIDAD)</span>
            <input value={musicalKey} onChange={(e) => setMusicalKey(e.target.value)} placeholder="ej. F#m" />
          </label>
          <label className="modal-field">
            <span>NÚMERO DE VERSIÓN</span>
            <input type="number" value={version} onChange={(e) => setVersion(Number(e.target.value))} />
          </label>
          <label className="modal-field">
            <span>COLOR DEL DISCO / SELLO</span>
            <div className="color-dots">
              {["#e11d48", "#0284c7", "#ca8a04", "#65a30d", "#7e22ce", "#14b8a6"].map((col) => (
                <button
                  key={col}
                  type="button"
                  style={{ background: col }}
                  className={c2 === col ? "on" : ""}
                  onClick={() => setC2(col)}
                />
              ))}
            </div>
          </label>
          <label className="modal-field full">
            <span>NOTAS DE SESIÓN / CAMBIOS DE MEZCLA</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="ej. sub más seco, falta automatizar delay del outro..."
            />
          </label>
          <label className="modal-field full">
            <span>REEMPLAZAR ARCHIVO DE AUDIO (WAV / MP3)</span>
            <input
              type="file"
              accept="audio/*"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setCustomAudioUrl(URL.createObjectURL(f));
              }}
            />
          </label>
        </div>

        <div className="modal-foot">
          <button type="button" className="apple-btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="apple-btn primary"
            onClick={() =>
              onSave({
                ...track,
                title,
                artist,
                feat: feat.trim() || undefined,
                prod: prod.trim() || undefined,
                bpm: Number(bpm) || track.bpm,
                key: musicalKey || track.key,
                version: Number(version) || track.version,
                note: note.trim() || undefined,
                c2,
                accent: c2,
                customAudioUrl,
              })
            }
          >
            ✓ Guardar cambios en el track
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ==================== COMPONENTE: MODAL EDITAR PERFIL ==================== */
function EditProfileModal({
  profile,
  onClose,
  onSave,
}: {
  profile: ArtistProfile;
  onClose: () => void;
  onSave: (p: ArtistProfile) => void;
}) {
  const [name, setName] = useState(profile.name);
  const [handle, setHandle] = useState(profile.handle);
  const [role, setRole] = useState(profile.role);
  const [zone, setZone] = useState(profile.zone);
  const [crew, setCrew] = useState(profile.crew);
  const [bio, setBio] = useState(profile.bio);
  const [color, setColor] = useState(profile.color);
  const [stickersText, setStickersText] = useState(profile.stickers.join(" "));

  return (
    <motion.div
      className="apple-modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="apple-modal-card"
        initial={{ scale: 0.94, y: 16 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.94, y: 16 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <span className="mono-tag">PERFIL // EL TABLERO</span>
            <h3>Editar identidad del artista</h3>
          </div>
          <button type="button" className="apple-btn ghost" onClick={onClose}>
            ✕ Cerrar
          </button>
        </div>

        <div className="modal-form-grid">
          <label className="modal-field">
            <span>NOMBRE ARTÍSTICO</span>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="modal-field">
            <span>USUARIO (@HANDLE)</span>
            <input value={handle} onChange={(e) => setHandle(e.target.value)} />
          </label>
          <label className="modal-field">
            <span>ROL EN LA ESCENA</span>
            <input value={role} onChange={(e) => setRole(e.target.value)} />
          </label>
          <label className="modal-field">
            <span>ZONA / DEPARTAMENTO</span>
            <input value={zone} onChange={(e) => setZone(e.target.value)} />
          </label>
          <label className="modal-field">
            <span>CREW / SELLO</span>
            <input value={crew} onChange={(e) => setCrew(e.target.value)} />
          </label>
          <label className="modal-field">
            <span>COLOR DE AVATAR</span>
            <div className="color-dots">
              {["#111111", "#e11d48", "#1d4ed8", "#0f766e", "#ca8a04", "#7e22ce"].map((c) => (
                <button
                  key={c}
                  type="button"
                  style={{ background: c }}
                  className={color === c ? "on" : ""}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </label>
          <label className="modal-field full">
            <span>BIO / MANIFIESTO</span>
            <input value={bio} onChange={(e) => setBio(e.target.value)} />
          </label>
          <label className="modal-field full">
            <span>STICKERS / INSIGNIAS (SEPARADOS POR ESPACIO)</span>
            <input value={stickersText} onChange={(e) => setStickersText(e.target.value)} />
          </label>
        </div>

        <div className="modal-foot">
          <button type="button" className="apple-btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="apple-btn primary"
            onClick={() =>
              onSave({
                ...profile,
                name,
                handle: handle.startsWith("@") ? handle : `@${handle}`,
                role,
                zone,
                crew,
                bio,
                color,
                stickers: stickersText
                  .split(/\s+/)
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
          >
            ✓ Guardar Perfil
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ==================== COMPONENTE: MODAL LOGIN / REGISTER CON GOOGLE ==================== */
function GoogleAuthModal({
  profile,
  connected,
  onClose,
  onSignInGoogle,
  onSignOut,
}: {
  profile: ArtistProfile;
  connected: boolean;
  onClose: () => void;
  onSignInGoogle: (email: string, name: string, handle: string) => void;
  onSignOut: () => void;
}) {
  const [email, setEmail] = useState(profile.email || "juani@gmail.com");
  const [name, setName] = useState(profile.name);
  const [handle, setHandle] = useState(profile.handle);

  return (
    <motion.div
      className="apple-modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="apple-modal-card narrow"
        initial={{ scale: 0.94, y: 16 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.94, y: 16 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <span className="mono-tag">AUTENTICACIÓN // EL TABLERO ID</span>
            <h3>Iniciar sesión o registrarse con Google</h3>
          </div>
          <button type="button" className="apple-btn ghost" onClick={onClose}>
            ✕
          </button>
        </div>

        <p className="modal-subcopy">
          Con tu cuenta de Google sincronizás tus bloques 3D, tus Canvas de videos 3–5s y tus
          links privados en Supabase Auth + Cloudflare R2.
        </p>

        <div className="modal-form-grid single-col">
          <label className="modal-field">
            <span>CORREO DE GOOGLE</span>
            <input value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="modal-field">
            <span>NOMBRE DE ARTISTA</span>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="modal-field">
            <span>@HANDLE EN EL TABLERO</span>
            <input value={handle} onChange={(e) => setHandle(e.target.value)} />
          </label>
        </div>

        <div className="google-auth-actions">
          <button
            type="button"
            className="google-oauth-btn"
            onClick={() => onSignInGoogle(email, name, handle)}
          >
            <span className="g-badge">G</span>
            <span>Continuar con Google ({email})</span>
          </button>

          {connected && (
            <button type="button" className="apple-btn ghost" onClick={onSignOut}>
              Cerrar sesión actual
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
