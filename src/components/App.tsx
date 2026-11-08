"use client";

import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import {
  INITIAL_PROJECTS,
  ME_PROFILE,
  SCENE_ARTISTS,
  type Project,
  type Track,
} from "@/lib/mock";
import { sfx } from "@/lib/sfx";
import MacInstallerUpload from "./MacInstallerUpload";

const DiscSpinner3D = dynamic(() => import("./DiscSpinner3D"), { ssr: false });
const PerformativePlayer = dynamic(() => import("./PerformativePlayer"), { ssr: false });

type ScreenTab = "inicio" | "biblioteca" | "subir" | "perfil";

export default function App() {
  const [tab, setTab] = useState<ScreenTab>("inicio");
  const [projects, setProjects] = useState<Project[]>(INITIAL_PROJECTS);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(INITIAL_PROJECTS[0].id);

  // Estado del reproductor persistente + pantalla completa
  const [currentTrack, setCurrentTrack] = useState<Track>(INITIAL_PROJECTS[0].tracks[1]);
  const [currentProject, setCurrentProject] = useState<Project>(INITIAL_PROJECTS[0]);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playerExpanded, setPlayerExpanded] = useState<boolean>(false);
  const [muted, setMuted] = useState<boolean>(false);
  const [customAudioMap, setCustomAudioMap] = useState<Record<string, string>>({});

  // Vista en Biblioteca: "isometric" (manifold.art) o "shelves" (hileras compactas de CDs)
  const [libraryMode, setLibraryMode] = useState<"isometric" | "shelves">("isometric");

  const activeProject =
    projects.find((p) => p.id === selectedProjectId) || projects[0];

  const playTrack = (track: Track, project: Project, openFull = false) => {
    setCurrentTrack(track);
    setCurrentProject(project);
    setIsPlaying(true);
    sfx.play();
    sfx.startGroove(track.bpm, track.audioFreq, customAudioMap[track.id]);
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
        customAudioMap[currentTrack.id]
      );
    }
  };

  const stepTrack = (dir: 1 | -1) => {
    const list = currentProject.tracks;
    const idx = list.findIndex((t) => t.id === currentTrack.id);
    const nextIdx = (idx + dir + list.length) % list.length;
    const nextTrack = list[nextIdx] || list[0];
    playTrack(nextTrack, currentProject, playerExpanded);
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

  const navigate = (nextTab: ScreenTab) => {
    if (nextTab === tab) return;
    sfx.nav();
    setTab(nextTab);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="apple-shell">
      {/* Capa de ruido / grano táctil sobre papel blanco */}
      <div className="paper-grain" aria-hidden />

      {/* Top Navigation Bar estilo Apple iOS / SecondStory */}
      <header className="ios-navbar">
        <div
          className="ios-brand"
          onMouseEnter={() => sfx.hover()}
          onClick={() => navigate("inicio")}
        >
          <span className="brand-sup">cerro² · 0261</span>
          <span className="brand-inline-links">
            <em className={tab === "inicio" ? "under" : ""}>Explorar</em>,{" "}
            <em className={tab === "biblioteca" ? "under" : ""}>Biblioteca</em>,{" "}
            <em className={tab === "subir" ? "under" : ""}>Subir</em>,{" "}
            <em className={tab === "perfil" ? "under" : ""}>Perfil</em>
          </span>
        </div>

        <nav className="ios-seg-control" aria-label="Navegación principal">
          {(
            [
              ["inicio", "Inicio"],
              ["biblioteca", "Biblioteca"],
              ["subir", "Subir Tema"],
              ["perfil", "@juani"],
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
              setPlayerExpanded(true);
            }}
          >
            🎛️ Studio Player
          </button>
          <button
            type="button"
            className="ios-icon-btn"
            onMouseEnter={() => sfx.hover()}
            onClick={() => {
              const next = !muted;
              setMuted(next);
              sfx.setMuted(next);
            }}
          >
            {muted ? "🔇 Mute" : "🔊 SFX"}
          </button>
        </div>
      </header>

      {/* Contenido principal con transiciones suaves */}
      <AnimatePresence mode="wait">
        <motion.main
          key={tab}
          className="ios-main"
          initial={{ opacity: 0, y: 14, filter: "blur(6px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -10, filter: "blur(6px)" }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* ==================== 1. INICIO (EXPLORAR) ==================== */}
          {tab === "inicio" && (
            <div className="explore-page">
              {/* Tira superior de mini-portadas estilo SecondStory (imagen3.png) */}
              <section className="secondstory-strip-card">
                <div className="strip-top-meta">
                  <span>08.11.26 · MENDOZA UNDERGROUND ARCHIVE</span>
                  <span>21:30—03:00 · CURADURÍA LOCAL</span>
                </div>

                <div className="filmstrip-row">
                  {projects.map((p, idx) => (
                    <motion.button
                      key={p.id}
                      type="button"
                      whileHover={{ y: -4, scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className="filmstrip-thumb"
                      onMouseEnter={() => sfx.hover()}
                      onClick={() => {
                        playTrack(p.tracks[0], p, false);
                      }}
                    >
                      <div
                        className="filmstrip-art"
                        style={{
                          background: `linear-gradient(145deg, ${p.c1} 0%, ${p.c2} 100%)`,
                        }}
                      >
                        <span className="thumb-index">0{idx + 1}</span>
                        <strong className="thumb-glyph">{p.tracks[0]?.glyph}</strong>
                        <small>{p.type}</small>
                      </div>
                      <div className="filmstrip-caption">
                        <b>{p.title}</b>
                        <span>{p.artist}</span>
                      </div>
                    </motion.button>
                  ))}
                </div>

                {/* Cluster central con ruido visual: tipografía gigante + recortes + stickers + espina verde neón (imagen1.jpg + imagen2.jpg) */}
                <div className="corecore-stage">
                  {/* Espina vertical verde neón de imagen1.jpg */}
                  <div className="neon-spine" aria-hidden>
                    <span className="spine-badge">cerro0261</span>
                  </div>

                  <div className="Roster-collage">
                    {/* Fila 1 */}
                    <div className="collage-line">
                      <span className="sticker- cluster-dots">
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
                      <span className="cutout-pill">🍇 Godoy Cruz</span>
                    </div>

                    {/* Fila 2 */}
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

                    {/* Fila 3 */}
                    <div className="collage-line">
                      <span className="pixel-tag">0261</span>
                      <button
                        type="button"
                        className="roster-word"
                        onMouseEnter={() => sfx.hover()}
                        onClick={() => playTrack(projects[3].tracks[0], projects[3], false)}
                      >
                        <span className="outline-letter">N</span>ahue
                        <span className="inline-swatch coral">B</span>
                        <sup className="sup-tag">studio</sup>
                      </button>
                      <span className="floating-emoji" aria-hidden>🎛️</span>
                      <button
                        type="button"
                        className="roster-word"
                        onMouseEnter={() => sfx.hover()}
                        onClick={() => playTrack(projects[2].tracks[0], projects[2], false)}
                      >
                        Tomi<span className="inline-swatch gold">261</span>
                        <sup className="sup-tag">dj</sup>
                      </button>
                    </div>

                    {/* Fila 4 */}
                    <div className="collage-line">
                      <button
                        type="button"
                        className="roster-word"
                        onMouseEnter={() => sfx.hover()}
                        onClick={() => playTrack(projects[5].tracks[0], projects[5], false)}
                      >
                        kali<span className="inline-swatch teal">.wav</span>
                        <sup className="sup-tag">mix</sup>
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
                        🎥 Abrir Reproductor Snippet →
                      </button>
                    </div>
                  </div>
                </div>

                {/* Mega título inferior estilo SecondStory (imagen3.png) */}
                <div className="secondstory-mega-footer">
                  <p className="micro-editorial-copy">
                    Plataforma abierta y archivo vivo para artistas y oyentes de Mendoza.
                    Sin algoritmos prestados, directo del estudio a la calle.
                  </p>
                  <h1 className="mega-display-title">ElCerroDeLaGloria</h1>
                </div>
              </section>

              {/* Grilla de cortes destacados y artistas de la escena */}
              <section className="explore-bottom-grid">
                <div className="apple-card">
                  <div className="card-head">
                    <span className="mono-tag">ROTACIÓN SEMANAL // MENDOZA</span>
                    <h3>Cortes recién subidos al archivo</h3>
                  </div>
                  <div className="track-list-clean">
                    {projects.flatMap((p) =>
                      p.tracks.slice(0, 2).map((t) => ({ track: t, proj: p }))
                    ).slice(0, 6).map(({ track, proj }, i) => {
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
                            <span className="meta-chip">v{track.version}</span>
                          </div>
                          <button
                            type="button"
                            className="row-snippet-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              playTrack(track, proj, true);
                            }}
                          >
                            Visual ↗
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="apple-card">
                  <div className="card-head">
                    <span className="mono-tag">DIRECTORIO // 0261</span>
                    <h3>Artistas activos esta semana</h3>
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
                          <b>{a.name} <em>{a.handle}</em></b>
                          <span>{a.role} · {a.zone}</span>
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

          {/* ==================== 2. BIBLIOTECA (ISOMÉTRICA + HILERA DE CDS + SPINNER DE N DISCOS) ==================== */}
          {tab === "biblioteca" && (
            <div className="library-page">
              <div className="section-header-row">
                <div>
                  <span className="mono-tag">ARCHIVE & GALLERIES // BIBLIOTECA</span>
                  <h1 className="editorial-h1">Proyectos & Discos por Corte</h1>
                </div>
                <div className="seg-pills">
                  <button
                    type="button"
                    className={libraryMode === "isometric" ? "on" : ""}
                    onClick={() => {
                      sfx.tap();
                      setLibraryMode("isometric");
                    }}
                  >
                    🧊 Cubos Isométricos (Manifold)
                  </button>
                  <button
                    type="button"
                    className={libraryMode === "shelves" ? "on" : ""}
                    onClick={() => {
                      sfx.tap();
                      setLibraryMode("shelves");
                    }}
                  >
                    💿 Hileras de CDs Compactos
                  </button>
                </div>
              </div>

              {/* Modo 1: Grilla arquitectónica isométrica inspirada en gif1.gif (manifold.art) */}
              {libraryMode === "isometric" ? (
                <section className="manifold-iso-section">
                  <div className="manifold-header">
                    <h2>manifold.0261 — Artists &amp; Projects</h2>
                    <span className="mono-tag">TOCÁ UN BLOQUE PARA ABRIR SU RUEDITA DE DISCOS</span>
                  </div>

                  <div className="manifold-iso-grid">
                    {projects.map((p) => {
                      const isSel = p.id === activeProject.id;
                      return (
                        <motion.div
                          key={p.id}
                          whileHover={{ y: -8 }}
                          className={`iso-room-card ${isSel ? "selected" : ""}`}
                          onMouseEnter={() => sfx.hover()}
                          onClick={() => {
                            sfx.open();
                            setSelectedProjectId(p.id);
                          }}
                        >
                          {/* Cubo arquitectónico isométrico con 3 caras */}
                          <div className="iso-cube-wrap">
                            <div
                              className="iso-face iso-top"
                              style={{ background: `linear-gradient(135deg, ${p.c2}, #ffffff)` }}
                            >
                              <span>{p.tagGlyph}</span>
                            </div>
                            <div
                              className="iso-face iso-left"
                              style={{ background: p.c1 }}
                            >
                              <strong className="iso-big-num">{p.tracks.length}</strong>
                              <small>DISCOS</small>
                            </div>
                            <div
                              className="iso-face iso-right"
                              style={{
                                background: `linear-gradient(160deg, ${p.c2}, ${p.c1})`,
                              }}
                            >
                              <div className="iso-mini-discs">
                                {p.tracks.map((t) => (
                                  <i key={t.id} title={t.title} />
                                ))}
                              </div>
                            </div>
                            {/* Píldora flotante inclinada exactamente como en gif1.gif */}
                            <span className="manifold-pill">{p.title}</span>
                          </div>

                          <div className="iso-card-foot">
                            <b>{p.artist} · {p.type}</b>
                            <span>{p.zone} · {p.tracks.length} temas</span>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </section>
              ) : (
                /* Modo 2: Varias hileras compactas de CDs que podés correr horizontalmente */
                <section className="cd-shelves-section">
                  {projects.map((p) => (
                    <div key={p.id} className="cd-shelf-row">
                      <div className="cd-shelf-meta">
                        <span className="mono-tag">{p.type} · {p.year}</span>
                        <h3>{p.title}</h3>
                        <p>{p.artist} — {p.tracks.length} discos en este proyecto</p>
                        <button
                          type="button"
                          className="apple-btn ghost"
                          onClick={() => {
                            sfx.tap();
                            setSelectedProjectId(p.id);
                          }}
                        >
                          Abrir en Spinner 3D ↓
                        </button>
                      </div>

                      <div className="cd-Cases-scroller">
                        {p.tracks.map((t, idx) => {
                          const playingThis = currentTrack.id === t.id && isPlaying;
                          return (
                            <motion.div
                              key={t.id}
                              whileHover={{ y: -6, rotateY: -8 }}
                              className={`mini-cd-case ${playingThis ? "playing" : ""}`}
                              onMouseEnter={() => sfx.hover()}
                              onClick={() => playTrack(t, p, false)}
                            >
                              <div
                                className="cd-sleeve"
                                style={{ background: `linear-gradient(135deg, ${t.c1}, ${t.c2})` }}
                              >
                                <span>{String(idx + 1).padStart(2, "0")}</span>
                                <b>{t.glyph}</b>
                              </div>
                              <div className="cd-peek-disc" style={{ borderColor: t.c2 }} />
                              <div className="cd-case-caption">
                                <b>{t.title}</b>
                                <small>{t.bpm} BPM · {t.key}</small>
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </section>
              )}

              {/* Detalle del proyecto seleccionado: Ruedita 3D de N discos exactos (video.gif) + Tracklist */}
              <section className="project-inspector-sheet">
                <div className="inspector-header">
                  <div>
                    <span className="mono-tag">
                      PROYECTO SELECCIONADO // {activeProject.type} · {activeProject.zone}
                    </span>
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
                      + Agregar corte con Prop
                    </button>
                    <button
                      type="button"
                      className="apple-btn primary"
                      onClick={() => playTrack(activeProject.tracks[0], activeProject, true)}
                    >
                      ▶ Abrir en Visual Player
                    </button>
                  </div>
                </div>

                <div className="inspector-split">
                  {/* El Spinner 3D estilo video.gif con exactamente la cantidad de discos que tiene el proyecto */}
                  <DiscSpinner3D
                    project={activeProject}
                    currentTrackId={currentTrack.id}
                    onPlayTrack={(tr, pr) => playTrack(tr, pr, false)}
                  />

                  {/* Lista detallada de los cortes de este proyecto */}
                  <div className="inspector-tracklist">
                    <div className="card-head">
                      <span className="mono-tag">
                        {activeProject.tracks.length} DISCOS EN ESTE PROYECTO
                      </span>
                      <h3>Lista de cortes &amp; versiones</h3>
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
                            <span className="meta-chip">{t.duration}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>
            </div>
          )}

          {/* ==================== 3. SUBIR TEMAS (INSTALADOR .DMG MACBOOK) ==================== */}
          {tab === "subir" && (
            <MacInstallerUpload
              projects={projects}
              onAddTrackToProject={handleAddTrackToProject}
              onPlayTrack={(tr, pr) => playTrack(tr, pr, false)}
            />
          )}

          {/* ==================== 4. PERFIL (@JUANI) ==================== */}
          {tab === "perfil" && (
            <div className="profile-page">
              <section className="profile-hero-card">
                <div className="profile-hero-top">
                  <div className="profile-avatar-large">
                    <span>🍇</span>
                  </div>
                  <div className="profile-main-copy">
                    <div className="profile-badges">
                      <span className="mono-tag">{ME_PROFILE.crew}</span>
                      <span className="mono-tag">{ME_PROFILE.zone}</span>
                    </div>
                    <h1>{ME_PROFILE.name} <em>{ME_PROFILE.handle}</em></h1>
                    <p>{ME_PROFILE.bio}</p>
                    <div className="profile-sticker-tray">
                      {ME_PROFILE.stickers.map((st, i) => (
                        <span key={i} className="sticker-chip">{st}</span>
                      ))}
                    </div>
                  </div>
                  <div className="profile-cta-col">
                    <button
                      type="button"
                      className="apple-btn primary"
                      onClick={() => navigate("subir")}
                    >
                      + Subir corte (DMG Prop)
                    </button>
                    <button
                      type="button"
                      className="apple-btn ghost"
                      onClick={() => {
                        sfx.open();
                        setPlayerExpanded(true);
                      }}
                    >
                      🎥 Grabar Snippet
                    </button>
                  </div>
                </div>

                <div className="profile-metrics-bar">
                  <div>
                    <b>{ME_PROFILE.tracksCount}</b>
                    <span>TRACKS SUBIDOS</span>
                  </div>
                  <div>
                    <b>{projects.filter((p) => p.artistId === "juani").length}</b>
                    <span>PROYECTOS ACTIVOS</span>
                  </div>
                  <div>
                    <b>{ME_PROFILE.friendsCount}</b>
                    <span>AMIGOS EN LA ESCENA</span>
                  </div>
                  <div>
                    <b>{ME_PROFILE.followersCount}</b>
                    <span>OYENTES / FOLLOWERS</span>
                  </div>
                  <div>
                    <b>{ME_PROFILE.playsTotal}</b>
                    <span>REPRODUCCIONES</span>
                  </div>
                </div>
              </section>

              <section className="explore-bottom-grid">
                <div className="apple-card">
                  <div className="card-head">
                    <span className="mono-tag">CATÁLOGO PROPIO // WORK IN PROGRESS &amp; PUBLICADOS</span>
                    <h3>Mis Proyectos en El Cerro</h3>
                  </div>
                  <div className="profile-projects-list">
                    {projects
                      .filter((p) => p.artistId === "juani")
                      .map((p) => (
                        <div
                          key={p.id}
                          className="profile-proj-row"
                          onMouseEnter={() => sfx.hover()}
                          onClick={() => {
                            setSelectedProjectId(p.id);
                            navigate("biblioteca");
                          }}
                        >
                          <div
                            className="proj-row-art"
                            style={{ background: `linear-gradient(135deg, ${p.c1}, ${p.c2})` }}
                          >
                            <span>{p.tracks.length}</span>
                          </div>
                          <div className="proj-row-info">
                            <b>{p.title}</b>
                            <span>
                              {p.type} · {p.status} · {p.tracks.length} discos en la ruedita
                            </span>
                          </div>
                          <button type="button" className="apple-btn ghost">
                            Abrir →
                          </button>
                        </div>
                      ))}
                  </div>
                </div>

                <div className="apple-card">
                  <div className="card-head">
                    <span className="mono-tag">CONEXIONES // TOP COLABORADORES</span>
                    <h3>Mi Red en Mendoza</h3>
                  </div>
                  <div className="top-friends-grid">
                    {SCENE_ARTISTS.slice(1).map((a) => (
                      <div
                        key={a.id}
                        className="friend-tile"
                        onMouseEnter={() => sfx.hover()}
                        onClick={() => sfx.tap()}
                      >
                        <div className="friend-dot" style={{ background: a.color }}>
                          {a.stickers[0]}
                        </div>
                        <b>{a.name}</b>
                        <small>{a.role}</small>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            </div>
          )}
        </motion.main>
      </AnimatePresence>

      {/* ==================== WIDGET REPRODUCTOR FLOTANTE (DYNAMIC ISLAND / APPLE MUSIC MINIPLAYER) ==================== */}
      <AnimatePresence>
        {!playerExpanded && (
          <motion.div
            className="ios-mini-player"
            initial={{ y: 90, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 90, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
          >
            <div
              className="mini-art"
              style={{
                background: `linear-gradient(135deg, ${currentTrack.c1}, ${currentTrack.c2})`,
              }}
              onClick={() => {
                sfx.open();
                setPlayerExpanded(true);
              }}
            >
              <span className={isPlaying ? "spin-slow" : ""}>{currentTrack.glyph}</span>
            </div>

            <div
              className="mini-meta"
              onClick={() => {
                sfx.open();
                setPlayerExpanded(true);
              }}
            >
              <b>{currentTrack.title}</b>
              <span>
                {currentTrack.artist} · {currentTrack.bpm} BPM · {currentTrack.key}
              </span>
            </div>

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

            <button
              type="button"
              className="mini-expand-pill"
              onMouseEnter={() => sfx.hover()}
              onClick={() => {
                sfx.open();
                setPlayerExpanded(true);
              }}
            >
              <span>✨ Visual Studio / Snippet</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ==================== PANTALLA DE REPRODUCCIÓN COMPLETA (CUSTOMIZABLE + 3D + FÍSICAS) ==================== */}
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
              isPlaying={isPlaying}
              onTogglePlay={togglePlay}
              onNext={() => stepTrack(1)}
              onPrev={() => stepTrack(-1)}
              onClose={() => setPlayerExpanded(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
