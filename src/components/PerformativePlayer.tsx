"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { type Project, type ProjectVideoClip, type Track } from "@/lib/mock";
import { sfx } from "@/lib/sfx";
import TrackStudioEditModal from "./TrackStudioEditModal";

export type RepeatMode = "off" | "all" | "one";

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// 1. 36.000 PARTÍCULAS ALGORÍTMICAS DE BAJA LATENCIA CON LATIDO ELÁSTICO 808
function HighResFlowParticles({
  accent,
  c2,
  impulseSignal,
  isDarkStage,
  seed,
}: {
  accent: string;
  c2: string;
  impulseSignal: number;
  isDarkStage: boolean;
  seed: number;
}) {
  const pointsRef = useRef<THREE.Points>(null!);
  const matRef = useRef<THREE.PointsMaterial>(null!);
  const count = useMemo(() => {
    if (typeof window !== "undefined" && window.innerWidth <= 720) return 8000;
    return 16000;
  }, []);
  const lastImpulseRef = useRef(0);
  const dispRef = useRef(0);
  const velRef = useRef(0);
  const lastDispRef = useRef(-1);

  const circleSprite = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 32;
    c.height = 32;
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(16, 16, 2, 16, 16, 15);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.65, "rgba(255,255,255,0.85)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 32, 32);
    const tex = new THREE.CanvasTexture(c);
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    return tex;
  }, []);

  const { renderPositions, homePositions, scatterDirs, colors, phases } = useMemo(() => {
    const renderPos = new Float32Array(count * 3);
    const homePos = new Float32Array(count * 3);
    const scatter = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const ph = new Float32Array(count);

    const getContrastColor = (hex: string, fallbackDark: string) => {
      try {
        const c = new THREE.Color(hex);
        const lum = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
        if (!isDarkStage) {
          if (lum > 0.55) return new THREE.Color(fallbackDark);
        } else {
          if (lum < 0.18) return new THREE.Color("#e4e4e7");
        }
        return c;
      } catch {
        return new THREE.Color(isDarkStage ? "#ffffff" : fallbackDark);
      }
    };

    const cA = getContrastColor(accent, "#09090b");
    const cB = getContrastColor(c2, "#27272a");
    const cInk = new THREE.Color(isDarkStage ? "#ffffff" : "#09090b");

    for (let i = 0; i < count; i++) {
      const ix = i * 3;
      const u = (i / count) * Math.PI * 28;
      const stream = i % 6;
      const r = 0.55 + (i / count) * 2.45;
      const shape = ((seed % 4) + 4) % 4;
      const f = i / count;
      const jit = () => (Math.random() - 0.5) * 0.24;
      let hx: number, hy: number, hz: number;
      if (shape === 1) {
        const tt = f * Math.PI * 2 * 6 + stream * 0.05;
        hx = (Math.sin(tt) + 2 * Math.sin(2 * tt)) * 0.62 + jit();
        hy = (Math.cos(tt) - 2 * Math.cos(2 * tt)) * 0.62 + jit();
        hz = -Math.sin(3 * tt) * 1.1 + jit();
      } else if (shape === 2) {
        const a = f * Math.PI * 2 * 7 + (i % 2) * Math.PI;
        hx = Math.cos(a) * 1.35 + jit();
        hz = Math.sin(a) * 1.35 + jit();
        hy = (f * 2 - 1) * 2.5 + jit();
      } else if (shape === 3) {
        const phi = Math.acos(1 - 2 * f);
        const th = Math.PI * (1 + Math.sqrt(5)) * i;
        const rr = 2 + Math.sin(phi * 6 + stream) * 0.18;
        hx = Math.sin(phi) * Math.cos(th) * rr + jit();
        hy = Math.cos(phi) * rr + jit();
        hz = Math.sin(phi) * Math.sin(th) * rr + jit();
      } else {
        hx = Math.cos(u + stream) * r + jit();
        hy = Math.sin(u * 1.5 - stream) * r * 0.65 + jit();
        hz = Math.sin(u * 0.7 + stream) * 1.65 + jit();
      }

      homePos[ix] = hx;
      homePos[ix + 1] = hy;
      homePos[ix + 2] = hz;

      renderPos[ix] = hx;
      renderPos[ix + 1] = hy;
      renderPos[ix + 2] = hz;

      const len = Math.hypot(hx, hy, hz) || 1;
      const rx = hx / len + (Math.random() - 0.5) * 1.35;
      const ry = hy / len + (Math.random() - 0.5) * 1.35;
      const rz = hz / len + (Math.random() - 0.5) * 1.35;
      const rLen = Math.hypot(rx, ry, rz) || 1;
      const burstStrength = 0.22 + Math.pow(Math.random(), 0.7) * 0.45;
      scatter[ix] = (rx / rLen) * burstStrength;
      scatter[ix + 1] = (ry / rLen) * burstStrength;
      scatter[ix + 2] = (rz / rLen) * burstStrength;

      ph[i] = Math.random() * Math.PI * 2;

      const tMix = (i % 100) / 100;
      const chosen = i % 3 === 0 ? cA.clone().lerp(cB, tMix) : i % 3 === 1 ? cB : cInk;
      col[ix] = chosen.r;
      col[ix + 1] = chosen.g;
      col[ix + 2] = chosen.b;
    }
    return {
      renderPositions: renderPos,
      homePositions: homePos,
      scatterDirs: scatter,
      colors: col,
      phases: ph,
    };
  }, [accent, c2, isDarkStage, seed]);

  useFrame(({ clock, pointer, size }, dt) => {
    const mobileScale = size.width <= 720 ? 0.38 : 1;
    const { eightOhEight } = sfx.sampleReactiveLevels();
    const clampedDt = Math.min(0.033, dt);
    const t = clock.elapsedTime;

    if (impulseSignal !== lastImpulseRef.current) {
      lastImpulseRef.current = impulseSignal;
      dispRef.current += 0.22 * mobileScale;
    }

    const MAX_DISP = 0.34 * mobileScale;
    const hitTarget = Math.pow(eightOhEight, 0.9) * MAX_DISP;

    const springStiffness = 28.0;
    const damping = 8.2;
    const springAccel = -springStiffness * (dispRef.current - hitTarget) - damping * velRef.current;
    velRef.current += springAccel * clampedDt;
    dispRef.current += velRef.current * clampedDt;
    if (dispRef.current < 0) {
      dispRef.current = 0;
      velRef.current = 0;
    }

    const pulseDisp = dispRef.current;
    if (matRef.current) {
      const baseSize = isDarkStage ? 0.032 : 0.038;
      matRef.current.size = baseSize * (1 + pulseDisp * 0.28 * mobileScale);
    }

    const lastDisp = lastDispRef.current;
    if (Math.abs(pulseDisp - lastDisp) > 0.0015 || (pulseDisp === 0 && lastDisp !== 0)) {
      const geo = pointsRef.current?.geometry;
      if (geo) {
        const attr = geo.getAttribute("position") as THREE.BufferAttribute;
        if (attr) {
          const arr = attr.array as Float32Array;
          for (let i = 0; i < count; i++) {
            const ix = i * 3;
            arr[ix] = homePositions[ix] + scatterDirs[ix] * pulseDisp;
            arr[ix + 1] = homePositions[ix + 1] + scatterDirs[ix + 1] * pulseDisp;
            arr[ix + 2] = homePositions[ix + 2] + scatterDirs[ix + 2] * pulseDisp;
          }
          attr.needsUpdate = true;
          lastDispRef.current = pulseDisp;
        }
      }
    }

    if (pointsRef.current) {
      pointsRef.current.rotation.y += clampedDt * 0.035;
      pointsRef.current.rotation.x = Math.sin(t * 0.1) * 0.025 - pointer.y * 0.05;
      pointsRef.current.rotation.z = pointer.x * 0.04;
      const breathe = 1 + Math.sin(t * 0.8) * 0.014;
      pointsRef.current.scale.set(breathe, breathe, breathe);
    }
  });

  return (
    <points ref={pointsRef} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[renderPositions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        ref={matRef}
        map={circleSprite}
        size={isDarkStage ? 0.026 : 0.034}
        vertexColors
        transparent
        alphaTest={0.02}
        opacity={isDarkStage ? 0.92 : 0.96}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
}

export type QueueEntry = {
  track: Track;
  project: Project;
};

export default function PerformativePlayer({
  track,
  project,
  allProjects,
  isPlaying,
  volume,
  muted,
  shuffle,
  repeatMode,
  likedTrackIds,
  userQueue,
  onTogglePlay,
  onNext,
  onPrev,
  onSelectTrack,
  onToggleShuffle,
  onCycleRepeat,
  onToggleLike,
  onAddToQueue,
  onRemoveFromQueue,
  onClearQueue,
  onVolumeChange,
  onToggleMute,
  onClose,
  onJumpToProject,
  onOpenEditTrack,
  onOpenArtist,
  onSaveTrack,
  theme,
  onToggleTheme,
}: {
  track: Track;
  project: Project;
  allProjects: Project[];
  isPlaying: boolean;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeatMode: RepeatMode;
  likedTrackIds: string[];
  userQueue: QueueEntry[];
  onTogglePlay: () => void;
  onNext: () => void;
  onPrev: () => void;
  onSelectTrack: (t: Track, p: Project) => void;
  onToggleShuffle: () => void;
  onCycleRepeat: () => void;
  onToggleLike: (trackId: string) => void;
  onAddToQueue: (t: Track, p: Project) => void;
  onRemoveFromQueue: (index: number) => void;
  onClearQueue: () => void;
  onVolumeChange: (v: number) => void;
  onToggleMute: () => void;
  onClose: () => void;
  onJumpToProject: (projectId: string) => void;
  onOpenEditTrack: () => void;
  /** Tocar un nombre abre el perfil de ese artista */
  onOpenArtist?: (name: string) => void;
  onSaveTrack?: (updatedTrack: Track, updatedClip?: ProjectVideoClip) => void;
  theme?: "dark" | "light";
  onToggleTheme?: () => void;
}) {
  const [darkStage, setDarkStage] = useState(theme ? theme === "dark" : true);
  const [studioModalOpen, setStudioModalOpen] = useState(false);
  // La escena 3D se crea cuando terminó la animación de subida (si no, traba el slide)
  const [sceneReady, setSceneReady] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setSceneReady(true), 380);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    sfx.initTrackModifiers(track.pitchShift ?? 0, track.tempoMultiplier ?? 1.0);
  }, [track.id, track.pitchShift, track.tempoMultiplier]);

  useEffect(() => {
    if (theme) {
      setDarkStage(theme === "dark");
    }
  }, [theme]);

  // on = partículas + canvas · off = solo partículas · cine = solo canvas (sin partículas)
  const [canvasMode, setCanvasMode] = useState<"on" | "off" | "cine">("on");
  const [impulseSignal, setImpulseSignal] = useState(0);
  const [seed, setSeed] = useState(0);
  const [queueOpen, setQueueOpen] = useState(false);
  const [optionsSheetOpen, setOptionsSheetOpen] = useState(false);
  const [shareFeedback, setShareFeedback] = useState("");
  const [showRemaining, setShowRemaining] = useState(false);

  const liveProject = useMemo(() => {
    return (
      allProjects.find((p) => p.id === project.id) ||
      allProjects.find((p) => p.tracks.some((t) => t.id === track.id)) ||
      project
    );
  }, [allProjects, project, track.id]);

  const activeCanvasClip = useMemo(() => {
    const fromLive = liveProject.videos?.find((v) => Boolean(v.url));
    if (fromLive) return fromLive;
    const fromProp = project.videos?.find((v) => Boolean(v.url));
    if (fromProp) return fromProp;
    if (liveProject.id === "standby-project") {
      const fromAny = allProjects
        .find((p) => p.videos?.some((v) => Boolean(v.url)))
        ?.videos?.find((v) => Boolean(v.url));
      return fromAny || null;
    }
    return null;
  }, [liveProject.id, liveProject.videos, project.videos, allProjects]);

  const activeCoverUrl = track.coverUrl || liveProject.coverUrl || project.coverUrl;

  const [currentSec, setCurrentSec] = useState(0);
  const [durationSec, setDurationSec] = useState(track.durationSec || 174);
  const hasEnteredBodyRef = useRef(false);

  useEffect(() => {
    sfx.setTrackDuration(track.durationSec || 174);
    setDurationSec(track.durationSec || 174);
  }, [track.id, track.durationSec]);

  useEffect(() => {
    if (!isPlaying) {
      const st = sfx.getPlaybackState();
      setCurrentSec(st.currentSec);
      return;
    }
    const id = window.setInterval(() => {
      const st = sfx.getPlaybackState();
      setCurrentSec((prev) => (Math.abs(prev - st.currentSec) < 0.25 ? prev : st.currentSec));
      setDurationSec((prev) => {
        const d = st.durationSec || track.durationSec || 174;
        return prev === d ? prev : d;
      });
    }, 250);
    return () => clearInterval(id);
  }, [isPlaying, track.durationSec]);

  const progressPct = durationSec > 0 ? Math.min(100, (currentSec / durationSec) * 100) : 0;
  const isLiked = likedTrackIds.includes(track.id);
  const isStandby = track.id === "standby-track";

  const projectNextTracks = useMemo(() => {
    const idx = liveProject.tracks.findIndex((t) => t.id === track.id);
    if (idx === -1) return liveProject.tracks;
    return [...liveProject.tracks.slice(idx + 1), ...liveProject.tracks.slice(0, idx)];
  }, [liveProject.tracks, track.id]);

  const isCinemaActive = canvasMode !== "off" && Boolean(activeCanvasClip?.url || activeCoverUrl);
  // Cine: solo el canvas; si el track no tiene canvas ni portada, quedan las partículas
  const hideParticles = canvasMode === "cine" && isCinemaActive;
  const isImageCanvas = Boolean(
    activeCanvasClip?.url &&
      (activeCanvasClip.mediaType === "image" ||
        /^data:image\//i.test(activeCanvasClip.url) ||
        /\.(gif|png|jpe?g|webp|avif)(\?|$)/i.test(activeCanvasClip.url) ||
        /\.(gif|png|jpe?g|webp|avif)$/i.test(activeCanvasClip.label || ""))
  );

  const isDarkStage = darkStage;

  return (
    <div
      className={`perf-player font-skin-sf ${
        isDarkStage ? "stage-dark" : "stage-light"
      } ${isCinemaActive ? "has-cinema-canvas" : ""}`}
      onPointerMove={(e) => {
        if (e.clientY > 90) {
          hasEnteredBodyRef.current = true;
        } else if (hasEnteredBodyRef.current && e.clientY <= 6) {
          hasEnteredBodyRef.current = false;
          sfx.close();
          onClose();
        }
      }}
    >
      {/* Zona superior de cierre rápido al subir el cursor o tocar */}
      <div
        className="perf-top-edge-sensor"
        title="Subí el cursor al borde superior o tocá para minimizar"
        onClick={() => {
          sfx.close();
          onClose();
        }}
      >
        <span className="perf-grabber-bar" />
      </div>

      {/* Fondo Canvas en Modo Cine detrás de las 36.000 partículas */}
      {isCinemaActive && (
        <div className="perf-cinema-backdrop" aria-hidden>
          {activeCanvasClip?.url ? (
            isImageCanvas ? (
              <img
                src={activeCanvasClip.url}
                alt=""
                className="perf-cinema-media"
              />
            ) : (
              <video
                key={activeCanvasClip.url}
                src={activeCanvasClip.url}
                className="perf-cinema-media"
                autoPlay
                loop
                muted
                playsInline
                disablePictureInPicture
                onLoadedMetadata={(e) => {
                  e.currentTarget.play().catch(() => {});
                }}
              />
            )
          ) : activeCoverUrl ? (
            <img
              src={activeCoverUrl}
              alt=""
              className="perf-cinema-media is-cover-ambient"
            />
          ) : null}
          <div className="perf-cinema-vignette" />
        </div>
      )}

      {/* Canvas 3D performativo a pantalla completa (36.000 partículas reactivas al 808) */}
      <div
        className="perf-canvas-wrap"
        onClick={() => {
          setImpulseSignal((n) => n + 1);
          setSeed((n) => n + 1);
          sfx.tap();
        }}
      >
        {sceneReady && !hideParticles && (
        <Canvas
          camera={{ position: [0, 0, 5.2], fov: 42 }}
          dpr={[1, 1.25]}
          gl={{ alpha: true, antialias: false, powerPreference: "high-performance" }}
        >
          <ambientLight intensity={isDarkStage ? 1.15 : 1.7} />
          <directionalLight position={[4, 6, 5]} intensity={isDarkStage ? 1.85 : 2.4} />
          <pointLight position={[-4, -3, 3]} color={isDarkStage ? track.c2 : "#27272a"} intensity={isDarkStage ? 6 : 4} />

          <HighResFlowParticles
            accent={track.accent}
            c2={track.c2}
            impulseSignal={impulseSignal}
            seed={seed}
            isDarkStage={isDarkStage}
          />
        </Canvas>
        )}
      </div>

      {/* Top HUD — Apple Music / iOS Liquid Glass (Minimizar · Proyecto · Opciones •••) */}
      <header className="perf-topbar">
        <button
          type="button"
          className="pill-control perf-minimize-btn"
          onMouseEnter={() => sfx.hover()}
          onClick={() => {
            sfx.close();
            onClose();
          }}
          aria-label="Minimizar reproductor"
          title="Minimizar reproductor"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M6 9l6 6 6-6" />
          </svg>
          <span className="perf-btn-label">Minimizar</span>
        </button>

        <div className="perf-badges">
          <button
            type="button"
            className="mono-badge clickable-badge perf-project-pill"
            onMouseEnter={() => sfx.hover()}
            onClick={() => {
              sfx.nav();
              onJumpToProject(liveProject.id);
            }}
            title={`Abrir proyecto ${liveProject.title}`}
          >
            <span className="perf-project-pill-text">{liveProject.title}</span>
            <span className="perf-project-pill-arrow" aria-hidden>↗</span>
          </button>
        </div>

        <div className="perf-top-actions">
          <button
            type="button"
            className="pill-control perf-options-btn"
            onMouseEnter={() => sfx.hover()}
            onClick={() => {
              sfx.tap();
              setOptionsSheetOpen(true);
            }}
            aria-label="Más opciones"
            title="Opciones del track"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <circle cx="5" cy="12" r="2.2" />
              <circle cx="12" cy="12" r="2.2" />
              <circle cx="19" cy="12" r="2.2" />
            </svg>
          </button>
        </div>
      </header>

      {/* Overlay tipográfico central en SF Display (Jerarquía Apple Music: Tapa -> Título -> Artista/Prod) */}
      <div className="perf-center-typo">
        <div
          className="perf-artwork-card"
          style={{
            background: activeCoverUrl
              ? `url(${activeCoverUrl}) center / cover no-repeat`
              : `linear-gradient(135deg, ${track.c1}, ${track.c2})`,
          }}
        >
          {!activeCoverUrl && <span>{track.glyph}</span>}
        </div>
        <h1 className="perf-title">{track.title}</h1>
        {!isStandby && (
          <p className="perf-kicker">
            {[track.artist, track.feat].filter(Boolean).map((n, i) => (
              <span key={i}>
                {i > 0 ? " feat. " : ""}
                <button type="button" className="perf-artist-link" onClick={() => onOpenArtist?.(n as string)}>
                  {n}
                </button>
              </span>
            ))}
            {" — prod. "}
            <button type="button" className="perf-artist-link" onClick={() => onOpenArtist?.(track.prod || track.artist)}>
              {track.prod || track.artist}
            </button>
          </p>
        )}
        {isStandby && <p className="perf-kicker">Elegí un track de tu biblioteca para escucharlo acá</p>}
      </div>

      {/* PANEL LATERAL DE COLA DE REPRODUCCIÓN (QUEUE ESTILO SPOTIFY) */}
      {queueOpen && (
        <aside className="spotify-queue-drawer" onClick={(e) => e.stopPropagation()}>
          <div className="queue-drawer-head">
            <div>
              <span className="mono-tag">REPRODUCTOR // COLA</span>
              <h3>Cola de reproducción</h3>
            </div>
            <button
              type="button"
              className="apple-btn ghost"
              onClick={() => setQueueOpen(false)}
            >
              ✕
            </button>
          </div>

          <div className="queue-section">
            <span className="queue-sec-label">SONANDO AHORA</span>
            <div className="queue-item active">
              <div
                className="queue-item-art"
                style={{
                  background: project.coverUrl
                    ? `url(${project.coverUrl}) center / cover no-repeat`
                    : `linear-gradient(135deg, ${track.c1}, ${track.c2})`,
                }}
              >
                {!project.coverUrl && track.glyph}
              </div>
              <div className="queue-item-meta">
                <b>{track.title}</b>
                <span>
                  {track.artist} · {project.title}
                </span>
              </div>
              <span className="queue-item-dur">{track.duration}</span>
            </div>
          </div>

          {userQueue.length > 0 && (
            <div className="queue-section">
              <div className="queue-sec-row">
                <span className="queue-sec-label">SIGUIENTE EN LA COLA ({userQueue.length})</span>
                <button
                  type="button"
                  className="queue-clear-btn"
                  onClick={() => {
                    sfx.tap();
                    onClearQueue();
                  }}
                >
                  Borrar cola
                </button>
              </div>
              {userQueue.map((item, idx) => (
                <div
                  key={`${item.track.id}-${idx}`}
                  className="queue-item"
                  onClick={() => {
                    onRemoveFromQueue(idx);
                    onSelectTrack(item.track, item.project);
                  }}
                >
                  <div
                    className="queue-item-art"
                    style={{
                      background: item.project.coverUrl
                        ? `url(${item.project.coverUrl}) center / cover no-repeat`
                        : `linear-gradient(135deg, ${item.track.c1}, ${item.track.c2})`,
                    }}
                  >
                    {!item.project.coverUrl && item.track.glyph}
                  </div>
                  <div className="queue-item-meta">
                    <b>{item.track.title}</b>
                    <span>
                      {item.track.artist} · {item.project.title}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="queue-item-action"
                    title="Quitar de la cola"
                    onClick={(e) => {
                      e.stopPropagation();
                      sfx.tap();
                      onRemoveFromQueue(idx);
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="queue-section">
            <span className="queue-sec-label">SIGUIENTE DE: {project.title}</span>
            {projectNextTracks.map((t) => (
              <div
                key={t.id}
                className="queue-item"
                onClick={() => onSelectTrack(t, project)}
              >
                <div
                  className="queue-item-art"
                  style={{
                    background: project.coverUrl
                      ? `url(${project.coverUrl}) center / cover no-repeat`
                      : `linear-gradient(135deg, ${t.c1}, ${t.c2})`,
                  }}
                >
                  {!project.coverUrl && t.glyph}
                </div>
                <div className="queue-item-meta">
                  <b>{t.title}</b>
                  <span>{t.artist}</span>
                </div>
                <span className="queue-item-dur">{t.duration}</span>
                <button
                  type="button"
                  className="queue-item-action"
                  title="Agregar a la cola"
                  onClick={(e) => {
                    e.stopPropagation();
                    sfx.tap();
                    onAddToQueue(t, project);
                  }}
                >
                  + Cola
                </button>
              </div>
            ))}
          </div>

          <div className="queue-section">
            <span className="queue-sec-label">AGREGAR DE OTROS PROYECTOS</span>
            {allProjects
              .filter((p) => p.id !== project.id)
              .slice(0, 3)
              .flatMap((p) => p.tracks.slice(0, 2).map((t) => ({ t, p })))
              .map(({ t, p }) => (
                <div
                  key={t.id}
                  className="queue-item"
                  onClick={() => onSelectTrack(t, p)}
                >
                  <div
                    className="queue-item-art"
                    style={{
                      background: p.coverUrl
                        ? `url(${p.coverUrl}) center / cover no-repeat`
                        : `linear-gradient(135deg, ${t.c1}, ${t.c2})`,
                    }}
                  >
                    {!p.coverUrl && t.glyph}
                  </div>
                  <div className="queue-item-meta">
                    <b>{t.title}</b>
                    <span>
                      {t.artist} · {p.title}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="queue-item-action"
                    onClick={(e) => {
                      e.stopPropagation();
                      sfx.tap();
                      onAddToQueue(t, p);
                    }}
                  >
                    + Cola
                  </button>
                </div>
              ))}
          </div>
        </aside>
      )}

      {/* DOCK INFERIOR COMPLETO ESTILO SPOTIFY (CENTRADO Y ANCLADO AL FONDO) */}
      <footer className="perf-dock spotify-full-dock">
        <div className="spotify-dock-grid">
          {/* IZQUIERDA (Desktop): Track actual + Artista + Favorito */}
          <div className="spotify-now-playing">
            <div
              className="spotify-now-art"
              style={{
                background: project.coverUrl
                  ? `url(${project.coverUrl}) center / cover no-repeat`
                  : `linear-gradient(135deg, ${track.c1}, ${track.c2})`,
              }}
              onClick={() => onJumpToProject(project.id)}
              title={`Ir a ${project.title}`}
            >
              {!project.coverUrl && <span>{track.glyph}</span>}
            </div>
            <div className="spotify-now-meta">
              <b>{track.title}</b>
              <span>
                {track.artist} {track.feat ? `feat. ${track.feat}` : ""}
              </span>
            </div>
            <button
              type="button"
              className={`spotify-like-btn ${isLiked ? "liked" : ""}`}
              onClick={() => {
                sfx.tap();
                onToggleLike(track.id);
              }}
              aria-label="Guardar en tus me gusta"
              title={isLiked ? "Quitar de Me gusta" : "Guardar en Me gusta"}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill={isLiked ? "currentColor" : "none"}
                stroke="currentColor"
                strokeWidth="2.1"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            </button>
          </div>

          {/* CENTRO: Controles de transporte geométricos + Barra de progreso */}
          <div className="spotify-center-console">
            <div className="spotify-transport-buttons">
              <button
                type="button"
                className={`spotify-icon-btn ${shuffle ? "active" : ""}`}
                onClick={() => {
                  sfx.tap();
                  onToggleShuffle();
                }}
                title="Aleatorio (Shuffle)"
                aria-label="Aleatorio"
              >
                <svg
                  width="17"
                  height="17"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.1"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="16 3 21 3 21 8" />
                  <line x1="4" y1="20" x2="21" y2="3" />
                  <polyline points="21 16 21 21 16 21" />
                  <line x1="15" y1="15" x2="21" y2="21" />
                  <line x1="4" y1="4" x2="9" y2="9" />
                </svg>
                {shuffle && <i className="spotify-active-dot" />}
              </button>

              <button
                type="button"
                className="spotify-icon-btn"
                onClick={() => {
                  if (currentSec > 3) {
                    sfx.seek(0);
                    setCurrentSec(0);
                  } else {
                    onPrev();
                  }
                }}
                title="Anterior"
                aria-label="Anterior"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 5h2.4v14H6V5zm3.8 7 9.2 6.5V5.5L9.8 12z" />
                </svg>
              </button>

              <button
                type="button"
                className="spotify-play-circle"
                onClick={onTogglePlay}
                title={isPlaying ? "Pausar" : "Reproducir"}
                aria-label={isPlaying ? "Pausar" : "Reproducir"}
              >
                {isPlaying ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="5" width="4.2" height="14" rx="1.2" />
                    <rect x="13.8" y="5" width="4.2" height="14" rx="1.2" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: 2 }}>
                    <path d="M7.5 4.8v14.4L19.2 12 7.5 4.8z" />
                  </svg>
                )}
              </button>

              <button
                type="button"
                className="spotify-icon-btn"
                onClick={onNext}
                title="Siguiente"
                aria-label="Siguiente"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M5 18.5 14.2 12 5 5.5v13zM15.6 5H18v14h-2.4V5z" />
                </svg>
              </button>

              <button
                type="button"
                className={`spotify-icon-btn ${repeatMode !== "off" ? "active" : ""}`}
                onClick={() => {
                  sfx.tap();
                  onCycleRepeat();
                }}
                title={
                  repeatMode === "off"
                    ? "Repetir desactivado"
                    : repeatMode === "all"
                    ? "Repetir proyecto"
                    : "Repetir este track (1)"
                }
                aria-label="Repetir"
              >
                <svg
                  width="17"
                  height="17"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.1"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="17 1 21 5 17 9" />
                  <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                  <polyline points="7 23 3 19 7 15" />
                  <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                </svg>
                {repeatMode === "one" && (
                  <span
                    style={{
                      position: "absolute",
                      fontSize: "0.52rem",
                      fontWeight: 800,
                      lineHeight: 1,
                    }}
                  >
                    1
                  </span>
                )}
                {repeatMode !== "off" && <i className="spotify-active-dot" />}
              </button>
            </div>

            <div className="spotify-progress-row">
              <span className="spotify-time-label">{formatTime(currentSec)}</span>
              <div className="spotify-progress-bar-wrap">
                <div
                  className="spotify-progress-fill"
                  style={{ width: `${progressPct}%` }}
                />
                <input
                  type="range"
                  min={0}
                  max={Math.max(1, durationSec)}
                  step={0.2}
                  value={Math.min(durationSec, currentSec)}
                  onChange={(e) => {
                    const nextSec = Number(e.target.value);
                    setCurrentSec(nextSec);
                    sfx.seek(nextSec);
                  }}
                  className="spotify-progress-input"
                  aria-label="Progreso de la canción"
                />
              </div>
              <button
                type="button"
                className="spotify-time-label clickable"
                onClick={() => setShowRemaining((v) => !v)}
                title="Alternar duración total / tiempo restante"
              >
                {showRemaining
                  ? `-${formatTime(Math.max(0, durationSec - currentSec))}`
                  : formatTime(durationSec)}
              </button>
            </div>
          </div>

          {/* DERECHA / UTILIDADES (Key & BPM + Like Móvil + Cola + Volumen) */}
          <div className="spotify-right-utilities">
            {/* Like móvil visible en pantalla de celular */}
            <button
              type="button"
              className={`spotify-like-btn spotify-mobile-like ${isLiked ? "liked" : ""}`}
              onClick={() => {
                sfx.tap();
                onToggleLike(track.id);
              }}
              aria-label="Guardar en tus me gusta"
              title={isLiked ? "Quitar de Me gusta" : "Guardar en Me gusta"}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill={isLiked ? "currentColor" : "none"}
                stroke="currentColor"
                strokeWidth="2.1"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            </button>

            <button
              type="button"
              className={`spotify-util-btn ${queueOpen ? "active" : ""}`}
              onClick={() => {
                sfx.tap();
                setQueueOpen((v) => !v);
              }}
              title="Cola de reproducción (Queue)"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4, verticalAlign: "middle" }}>
                <line x1="8" y1="6" x2="21" y2="6" />
                <line x1="8" y1="12" x2="21" y2="12" />
                <line x1="8" y1="18" x2="21" y2="18" />
                <line x1="3" y1="6" x2="3.01" y2="6" />
                <line x1="3" y1="12" x2="3.01" y2="12" />
                <line x1="3" y1="18" x2="3.01" y2="18" />
              </svg>
              <span>Cola {userQueue.length > 0 ? `(${userQueue.length})` : ""}</span>
            </button>

            <div className="spotify-volume-group">
              <button
                type="button"
                className="spotify-util-btn"
                onClick={onToggleMute}
                title={muted ? "Activar sonido" : "Silenciar"}
                aria-label={muted ? "Activar sonido" : "Silenciar"}
              >
                {muted || volume === 0 ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" />
                    <line x1="23" y1="9" x2="17" y2="15" />
                    <line x1="17" y1="9" x2="23" y2="15" />
                  </svg>
                ) : volume < 0.5 ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" />
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" />
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                  </svg>
                )}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={muted ? 0 : volume}
                onChange={(e) => onVolumeChange(Number(e.target.value))}
                className="apple-volume-slider perf-volume-slider"
                style={{ ["--fill" as string]: `${(muted ? 0 : volume) * 100}%` }}
                aria-label="Volumen"
              />
            </div>
          </div>
        </div>
      </footer>

      {/* SPOTIFY-STYLE OPTIONS SHEET MODAL (•••) */}
      {optionsSheetOpen && (
        <div
          className="spotify-options-backdrop"
          onClick={() => setOptionsSheetOpen(false)}
        >
          <div
            className="spotify-options-sheet"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="spotify-sheet-grabber" />

            {/* Header: Cover thumbnail + Track + Artist/Project */}
            <div className="spotify-sheet-header">
              <div
                className="spotify-sheet-art"
                style={{
                  background: activeCoverUrl
                    ? `url(${activeCoverUrl}) center / cover no-repeat`
                    : `linear-gradient(135deg, ${track.c1}, ${track.c2})`,
                }}
              >
                {!activeCoverUrl && <span>{track.glyph}</span>}
              </div>
              <div className="spotify-sheet-meta">
                <h4>{track.title}</h4>
                <p>
                  {track.artist} • {liveProject.title}
                </p>
              </div>
            </div>

            {shareFeedback && (
              <div className="spotify-sheet-toast">
                <span>✓ {shareFeedback}</span>
              </div>
            )}

            {/* Opciones estilo Spotify (IMG_3924.png) */}
            <div className="spotify-sheet-list">
              <button
                type="button"
                className="spotify-sheet-item"
                onClick={async () => {
                  sfx.tap();
                  const shareData = {
                    title: `${track.title} - ${track.artist}`,
                    text: `Escuchá "${track.title}" de ${track.artist} en El tablero`,
                    url: typeof window !== "undefined" ? window.location.href : "",
                  };
                  if (typeof navigator !== "undefined" && navigator.share) {
                    try {
                      await navigator.share(shareData);
                      setOptionsSheetOpen(false);
                    } catch {
                      // user dismissed
                    }
                  } else if (typeof navigator !== "undefined" && navigator.clipboard) {
                    await navigator.clipboard.writeText(window.location.href);
                    setShareFeedback("Enlace copiado al portapapeles");
                    setTimeout(() => {
                      setShareFeedback("");
                      setOptionsSheetOpen(false);
                    }, 1200);
                  }
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                  <polyline points="16 6 12 2 8 6" />
                  <line x1="12" y1="2" x2="12" y2="15" />
                </svg>
                <span>Compartir</span>
              </button>

              <button
                type="button"
                className={`spotify-sheet-item ${isLiked ? "is-liked" : ""}`}
                onClick={() => {
                  sfx.tap();
                  onToggleLike(track.id);
                }}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill={isLiked ? "#22c55e" : "none"}
                  stroke={isLiked ? "#22c55e" : "currentColor"}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
                <span>{isLiked ? "Quitar de Tus me gusta" : "Agregar a Tus me gusta"}</span>
              </button>

              <button
                type="button"
                className="spotify-sheet-item"
                onClick={() => {
                  sfx.nav();
                  setOptionsSheetOpen(false);
                  onJumpToProject(liveProject.id);
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <circle cx="12" cy="12" r="3" />
                  <circle cx="12" cy="12" r="1" fill="currentColor" />
                </svg>
                <span>Ir al proyecto ({liveProject.title})</span>
              </button>

              <button
                type="button"
                className="spotify-sheet-item"
                onClick={() => {
                  sfx.tap();
                  onAddToQueue(track, liveProject);
                  setShareFeedback("Agregado a la fila");
                  setTimeout(() => setShareFeedback(""), 1200);
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="8" y1="6" x2="21" y2="6" />
                  <line x1="8" y1="12" x2="21" y2="12" />
                  <line x1="8" y1="18" x2="15" y2="18" />
                  <line x1="3" y1="6" x2="3.01" y2="6" />
                  <line x1="3" y1="12" x2="3.01" y2="12" />
                  <line x1="3" y1="18" x2="3.01" y2="18" />
                  <line x1="19" y1="15" x2="19" y2="21" />
                  <line x1="16" y1="18" x2="22" y2="18" />
                </svg>
                <span>Agregar a la fila</span>
              </button>

              <button
                type="button"
                className="spotify-sheet-item"
                onClick={() => {
                  sfx.tap();
                  setOptionsSheetOpen(false);
                  setQueueOpen(true);
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="8" y1="6" x2="21" y2="6" />
                  <line x1="8" y1="12" x2="21" y2="12" />
                  <line x1="8" y1="18" x2="21" y2="18" />
                  <line x1="3" y1="6" x2="3.01" y2="6" />
                  <line x1="3" y1="12" x2="3.01" y2="12" />
                  <line x1="3" y1="18" x2="3.01" y2="18" />
                </svg>
                <span>Ir a la fila ({userQueue.length})</span>
              </button>

              <button
                type="button"
                className="spotify-sheet-item"
                onClick={async () => {
                  sfx.tap();
                  if (typeof navigator !== "undefined" && navigator.clipboard) {
                    await navigator.clipboard.writeText(window.location.href);
                    setShareFeedback("Enlace copiado");
                    setTimeout(() => {
                      setShareFeedback("");
                      setOptionsSheetOpen(false);
                    }, 1200);
                  }
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
                <span>Copiar enlace de la canción</span>
              </button>

              <button
                type="button"
                className="spotify-sheet-item"
                onClick={() => {
                  sfx.tap();
                  setCanvasMode((m) => (m === "on" ? "off" : m === "off" ? "cine" : "on"));
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="4" width="20" height="16" rx="3" />
                  <path d="M2 8h20M7 4v4M12 4v4M17 4v4" />
                </svg>
                <span>
                  Canvas: {canvasMode === "on" ? "on" : canvasMode === "off" ? "off" : "cine"}
                  <small style={{ display: "block", opacity: 0.6, fontSize: "0.78em", fontWeight: 400 }}>
                    {canvasMode === "on" ? "Partículas + canvas" : canvasMode === "off" ? "Solo partículas" : "Solo canvas"}
                  </small>
                </span>
              </button>

              <button
                type="button"
                className="spotify-sheet-item"
                onClick={() => {
                  sfx.tap();
                  setDarkStage((d) => !d);
                  onToggleTheme?.();
                }}
              >
                {darkStage ? (
                  <>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="5" />
                      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                    </svg>
                    <span>Cambiar a Modo Claro</span>
                  </>
                ) : (
                  <>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                    </svg>
                    <span>Cambiar a Modo Oscuro</span>
                  </>
                )}
              </button>

              {!isStandby && (
                <button
                  type="button"
                  className="spotify-sheet-item"
                  onClick={() => {
                    sfx.open();
                    setOptionsSheetOpen(false);
                    onOpenEditTrack();
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                  <span>Editar track</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* STUDIO // MENÚ DE EDICIÓN DEL TRACK (PITCH, TEMPO, KEY, VIDEO TRIMMER) */}
      {studioModalOpen && (
        <TrackStudioEditModal
          track={track}
          project={liveProject}
          activeCanvasClip={activeCanvasClip}
          onClose={() => setStudioModalOpen(false)}
          onSaveTrack={(updatedTrack, updatedClip) => {
            onSaveTrack?.(updatedTrack, updatedClip);
            setStudioModalOpen(false);
          }}
        />
      )}
    </div>
  );
}
