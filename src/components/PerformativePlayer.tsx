"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { type Project, type Track } from "@/lib/mock";
import { sfx } from "@/lib/sfx";

export type VisualMode = "boids" | "ferro";
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
}: {
  accent: string;
  c2: string;
  impulseSignal: number;
  isDarkStage: boolean;
}) {
  const pointsRef = useRef<THREE.Points>(null!);
  const matRef = useRef<THREE.PointsMaterial>(null!);
  // Duplicamos a 36.000 partículas y las hacemos 50% más pequeñas con sprite liviano 16x16 sin mipmaps para 0 lag
  const count = 36000;
  const lastImpulseRef = useRef(0);
  const dispRef = useRef(0);
  const velRef = useRef(0);

  const circleSprite = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 16;
    c.height = 16;
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(8, 8, 1, 8, 8, 7.5);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.55, "rgba(255,255,255,0.8)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 16, 16);
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
    const cA = new THREE.Color(accent);
    const cB = new THREE.Color(c2);
    const cInk = new THREE.Color(isDarkStage ? "#ffffff" : "#18181b");

    for (let i = 0; i < count; i++) {
      const ix = i * 3;
      const u = (i / count) * Math.PI * 28;
      const stream = i % 6;
      const r = 0.55 + (i / count) * 2.45;
      const hx = Math.cos(u + stream) * r + (Math.random() - 0.5) * 0.24;
      const hy = Math.sin(u * 1.5 - stream) * r * 0.65 + (Math.random() - 0.5) * 0.24;
      const hz = Math.sin(u * 0.7 + stream) * 1.65 + (Math.random() - 0.5) * 0.24;

      homePos[ix] = hx;
      homePos[ix + 1] = hy;
      homePos[ix + 2] = hz;

      renderPos[ix] = hx;
      renderPos[ix + 1] = hy;
      renderPos[ix + 2] = hz;

      // Vector de explosión/latido 808 para que salten para todos lados y vuelvan a su posición exacta
      const len = Math.hypot(hx, hy, hz) || 1;
      const rx = hx / len + (Math.random() - 0.5) * 1.35;
      const ry = hy / len + (Math.random() - 0.5) * 1.35;
      const rz = hz / len + (Math.random() - 0.5) * 1.35;
      const rLen = Math.hypot(rx, ry, rz) || 1;
      // Magnitud variable por partícula para que el estallido del 808 tenga profundidad volumétrica
      const burstStrength = 0.45 + Math.pow(Math.random(), 0.7) * 1.65;
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
  }, [accent, c2, isDarkStage]);

  const targetRef = useRef(0);

  useFrame(({ clock, pointer }, dt) => {
    // Señal pura de 808 (< 90Hz filtrada por hardware low-pass + detector de golpe sub-grave)
    const { eightOhEight } = sfx.sampleReactiveLevels();
    const clampedDt = Math.min(0.033, dt);
    const t = clock.elapsedTime;

    // Click del usuario: mini pulso manual
    if (impulseSignal !== lastImpulseRef.current) {
      lastImpulseRef.current = impulseSignal;
      targetRef.current = Math.max(targetRef.current, 0.55);
    }

    // Alta sensibilidad exclusiva para los 808: salta fuerte en cada golpe y vuelve limpio al terminar
    const MAX_DISP = 1.28;
    const hitTarget = Math.pow(eightOhEight, 0.82) * MAX_DISP;
    if (hitTarget > targetRef.current) targetRef.current = hitTarget;
    // Decay elástico entre golpes de 808
    targetRef.current *= Math.exp(-clampedDt * 7.8);
    if (targetRef.current < 0.002) targetRef.current = 0;

    // Suavizado attack ultra rápido (golpe de 808) / retorno elástico limpio a su lugar original (0)
    const cur = dispRef.current;
    const k = targetRef.current > cur ? 38 : 9.5;
    let next = cur + (targetRef.current - cur) * Math.min(1, clampedDt * k);
    if (targetRef.current === 0 && next < 0.003) next = 0;
    dispRef.current = next;
    velRef.current = 0;

    const pulseDisp = dispRef.current;
    if (matRef.current) {
      matRef.current.size = 0.025 * (1 + pulseDisp * 0.48);
    }

    const step = clampedDt * 0.95;
    const geo = pointsRef.current.geometry;
    const attr = geo.getAttribute("position") as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;

    const bParam = 0.19;
    const mx = pointer.x * 2.2;
    const my = pointer.y * 1.5;

    for (let i = 0; i < count; i++) {
      const ix = i * 3;
      let hx = homePositions[ix];
      let hy = homePositions[ix + 1];
      let hz = homePositions[ix + 2];

      // Flujo suave de base (posición madre a la que siempre vuelven después del 808)
      const vx = Math.sin(hy * 1.55 + t * 0.65) - bParam * hx + (mx - hx) * 0.12;
      const vy = Math.sin(hz * 1.55 - t * 0.48) - bParam * hy + (my - hy) * 0.12;
      const vz = Math.sin(hx * 1.55 + phases[i] * 0.2) - bParam * hz;

      hx += vx * step * 1.25;
      hy += vy * step * 1.25;
      hz += vz * step * 1.25;

      if (hx * hx + hy * hy + hz * hz > 18) {
        const a = phases[i] + t;
        hx = Math.cos(a) * 0.45;
        hy = Math.sin(a) * 0.45;
        hz = Math.sin(a * 2) * 0.45;
      }

      homePositions[ix] = hx;
      homePositions[ix + 1] = hy;
      homePositions[ix + 2] = hz;

      // Posición renderizada = Posición madre + Desplazamiento explosivo del 808 (cuando pulseDisp -> 0, vuelven exacto a homePositions)
      arr[ix] = hx + scatterDirs[ix] * pulseDisp;
      arr[ix + 1] = hy + scatterDirs[ix + 1] * pulseDisp;
      arr[ix + 2] = hz + scatterDirs[ix + 2] * pulseDisp;
    }
    attr.needsUpdate = true;
    pointsRef.current.rotation.y += clampedDt * 0.07;
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
        size={0.025}
        vertexColors
        transparent
        alphaTest={0.04}
        opacity={0.9}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
}

// 2. FERROFLUIDO 3D ESCULTABLE HD (3X MÁS POLÍGONOS + ACELERACIÓN GPU 60 FPS)
function SculptableFerrofluid({ accent, c2 }: { accent: string; c2: string }) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const uniformsRef = useRef({
    uTime: { value: 0 },
    uBass: { value: 0 },
    uBeat: { value: 0 },
    uHoverDir: { value: new THREE.Vector3(0, 0, 1) },
    uHoverStrength: { value: 0 },
  });

  // 3x más resolución poligonal que antes (Icosahedron detail 64 = 40.962 vértices, 81.920 triángulos)
  const highPolyGeo = useMemo(() => new THREE.IcosahedronGeometry(0.96, 64), []);

  const material = useMemo(() => {
    const mat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color("#16141c"),
      emissive: new THREE.Color(accent),
      emissiveIntensity: 0.16,
      metalness: 0.88,
      roughness: 0.12,
      clearcoat: 1.0,
      clearcoatRoughness: 0.06,
      iridescence: 0.95,
      iridescenceIOR: 1.6,
    });

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uniformsRef.current.uTime;
      shader.uniforms.uBass = uniformsRef.current.uBass;
      shader.uniforms.uBeat = uniformsRef.current.uBeat;
      shader.uniforms.uHoverDir = uniformsRef.current.uHoverDir;
      shader.uniforms.uHoverStrength = uniformsRef.current.uHoverStrength;

      shader.vertexShader = `
        uniform float uTime;
        uniform float uBass;
        uniform float uBeat;
        uniform vec3 uHoverDir;
        uniform float uHoverStrength;
        ${shader.vertexShader}
      `;

      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        `
        #include <begin_vertex>
        vec3 ox = position;
        float n = sin(ox.x * 4.2 + uTime * 2.4) * cos(ox.y * 4.2 - uTime * 2.0) * sin(ox.z * 4.2 + uTime * 1.7);
        float spikeAmp = 0.18 + uBass * 0.35 + uBeat * 0.16;
        float s = 1.0 + n * spikeAmp;
        if (uHoverStrength > 0.005) {
          float dotVal = dot(normalize(ox), uHoverDir);
          if (dotVal > 0.6) {
            s += (dotVal - 0.6) * 0.55 * uHoverStrength;
          }
        }
        transformed = ox * s;
        `
      );
    };

    return mat;
  }, [accent]);

  const hoverDirRef = useRef<THREE.Vector3 | null>(null);

  useFrame(({ clock }) => {
    const { beat, bass } = sfx.sampleReactiveLevels();
    const t = clock.elapsedTime;
    uniformsRef.current.uTime.value = t;
    uniformsRef.current.uBass.value = bass;
    uniformsRef.current.uBeat.value = beat;

    if (hoverDirRef.current) {
      uniformsRef.current.uHoverDir.value.lerp(hoverDirRef.current, 0.18);
      uniformsRef.current.uHoverStrength.value = THREE.MathUtils.lerp(
        uniformsRef.current.uHoverStrength.value,
        1.0,
        0.15
      );
    } else {
      uniformsRef.current.uHoverStrength.value = THREE.MathUtils.lerp(
        uniformsRef.current.uHoverStrength.value,
        0.0,
        0.08
      );
    }
  });

  return (
    <group>
      <pointLight position={[3, 4, 4]} color="#ffffff" intensity={25} />
      <pointLight position={[-4, -3, 3]} color={c2} intensity={18} />
      <pointLight position={[0, 4, -4]} color={accent} intensity={16} />
      <mesh
        ref={meshRef}
        geometry={highPolyGeo}
        material={material}
        onPointerMove={(e) => {
          e.stopPropagation();
          const localPt = meshRef.current.worldToLocal(e.point.clone()).normalize();
          hoverDirRef.current = localPt;
        }}
        onPointerOut={() => {
          hoverDirRef.current = null;
        }}
      />
      <OrbitControls
        enableZoom={true}
        minDistance={2.6}
        maxDistance={10}
        enablePan={false}
        rotateSpeed={0.75}
      />
    </group>
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
}) {
  // Default en "boids" (36K Partículas con reacción 808) como pidió Juani
  const [mode, setMode] = useState<VisualMode>("boids");
  const [snippetClean, setSnippetClean] = useState(false);
  const [darkStage, setDarkStage] = useState(false);
  const [cinemaMode, setCinemaMode] = useState(true);
  const [impulseSignal, setImpulseSignal] = useState(0);
  const [queueOpen, setQueueOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
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
    const fromAny = allProjects
      .find((p) => p.videos?.some((v) => Boolean(v.url)))
      ?.videos?.find((v) => Boolean(v.url));
    return fromAny || null;
  }, [liveProject.videos, project.videos, allProjects]);

  const activeCoverUrl = track.coverUrl || liveProject.coverUrl || project.coverUrl;

  const [currentSec, setCurrentSec] = useState(0);
  const [durationSec, setDurationSec] = useState(track.durationSec || 174);
  const hasEnteredBodyRef = useRef(false);

  useEffect(() => {
    sfx.setTrackDuration(track.durationSec || 174);
    setDurationSec(track.durationSec || 174);
  }, [track.id, track.durationSec]);

  useEffect(() => {
    const id = window.setInterval(() => {
      const st = sfx.getPlaybackState();
      setCurrentSec(st.currentSec);
      setDurationSec(st.durationSec || track.durationSec || 174);
    }, 120);
    return () => clearInterval(id);
  }, [track.durationSec]);

  const progressPct = durationSec > 0 ? Math.min(100, (currentSec / durationSec) * 100) : 0;
  const isLiked = likedTrackIds.includes(track.id);

  // Siguientes del proyecto actual (como "Siguiente de: <Proyecto>" en Spotify)
  const projectNextTracks = useMemo(() => {
    const idx = liveProject.tracks.findIndex((t) => t.id === track.id);
    if (idx === -1) return liveProject.tracks;
    return [...liveProject.tracks.slice(idx + 1), ...liveProject.tracks.slice(0, idx)];
  }, [liveProject.tracks, track.id]);

  const isCinemaActive = cinemaMode && Boolean(activeCanvasClip?.url || activeCoverUrl);
  const isImageCanvas = Boolean(
    activeCanvasClip?.url &&
      (activeCanvasClip.mediaType === "image" ||
        /^data:image\//i.test(activeCanvasClip.url) ||
        /\.(gif|png|jpe?g|webp|avif)(\?|$)/i.test(activeCanvasClip.url) ||
        /\.(gif|png|jpe?g|webp|avif)$/i.test(activeCanvasClip.label || ""))
  );

  return (
    <div
      className={`perf-player font-skin-sf ${
        darkStage || isCinemaActive ? "stage-dark" : "stage-light"
      } ${isCinemaActive ? "has-cinema-canvas" : ""} ${
        snippetClean ? "snippet-clean" : ""
      }`}
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
      {/* Zona superior de cierre rápido al subir el cursor */}
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

      {/* Canvas 3D performativo a pantalla completa (DPR optimizado a 1.25 en partículas para 60fps clavados con 36K partículas) */}
      <div
        className="perf-canvas-wrap"
        onClick={() => {
          if (mode === "boids") {
            setImpulseSignal((n) => n + 1);
            sfx.tap();
          }
        }}
      >
        <Canvas
          camera={{ position: [0, 0, 5.2], fov: 42 }}
          dpr={mode === "boids" ? [1, 1.25] : [1, 1.5]}
          gl={{ alpha: true, antialias: mode !== "boids", powerPreference: "high-performance" }}
        >
          <ambientLight intensity={darkStage || isCinemaActive ? 1.15 : 1.45} />
          <directionalLight position={[4, 6, 5]} intensity={1.85} />
          <pointLight position={[-4, -3, 3]} color={track.c2} intensity={6} />

          {mode === "boids" && (
            <HighResFlowParticles
              accent={track.accent}
              c2={track.c2}
              impulseSignal={impulseSignal}
              isDarkStage={darkStage || isCinemaActive}
            />
          )}
          {mode === "ferro" && <SculptableFerrofluid accent={track.accent} c2={track.c2} />}
        </Canvas>
      </div>

      {/* Top HUD */}
      <header className="perf-topbar">
        <button
          type="button"
          className="pill-control"
          onMouseEnter={() => sfx.hover()}
          onClick={() => {
            sfx.close();
            onClose();
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M6 9l6 6 6-6" />
          </svg>
          <span>Minimizar</span>
        </button>

        <div className="perf-badges">
          <button
            type="button"
            className="mono-badge clickable-badge"
            onMouseEnter={() => sfx.hover()}
            onClick={() => {
              sfx.open();
              onOpenEditTrack();
            }}
          >
            Editar track ({track.bpm} BPM · {track.key} · v{track.version})
          </button>

          <button
            type="button"
            className="mono-badge clickable-badge"
            onMouseEnter={() => sfx.hover()}
            onClick={() => {
              sfx.nav();
              onJumpToProject(project.id);
            }}
          >
            {project.title} ↗
          </button>
        </div>

        <div className="perf-top-actions">
          <button
            type="button"
            className={`pill-control ${cinemaMode ? "active" : ""}`}
            onMouseEnter={() => sfx.hover()}
            onClick={() => {
              sfx.tap();
              setCinemaMode((c) => !c);
            }}
            title="Integrar Canvas del proyecto de fondo con las partículas en Modo Cine"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="2" y="4" width="20" height="16" rx="3" />
              <path d="M2 8h20M7 4v4M12 4v4M17 4v4" />
            </svg>
            <span>{cinemaMode ? "Modo Cine ON" : "Modo Cine"}</span>
          </button>
          <button
            type="button"
            className={`pill-control ${darkStage ? "active" : ""}`}
            onMouseEnter={() => sfx.hover()}
            onClick={() => {
              sfx.tap();
              setDarkStage((d) => !d);
            }}
          >
            {darkStage ? (
              <>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <circle cx="12" cy="12" r="5" />
                  <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                </svg>
                <span>Claro</span>
              </>
            ) : (
              <>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
                <span>Oscuro</span>
              </>
            )}
          </button>
          <button
            type="button"
            className={`pill-control ${snippetClean ? "active" : ""}`}
            onMouseEnter={() => sfx.hover()}
            onClick={() => {
              sfx.tap();
              setSnippetClean((v) => !v);
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="3" y="5" width="18" height="14" rx="3" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            <span>{snippetClean ? "Salir Snippet" : "Modo Snippet"}</span>
          </button>
        </div>
      </header>

      {/* Overlay tipográfico central en SF Display */}
      <div className="perf-center-typo">
        <div
          className="perf-artwork-card"
          style={{
            background: project.coverUrl
              ? `url(${project.coverUrl}) center / cover no-repeat`
              : `linear-gradient(135deg, ${track.c1}, ${track.c2})`,
          }}
        >
          {!project.coverUrl && <span>{track.glyph}</span>}
          <small>{project.type}</small>
        </div>
        <p className="perf-kicker">
          {track.artist} {track.feat ? `feat. ${track.feat}` : ""} — prod.{" "}
          {track.prod || track.artist}
        </p>
        <h1 className="perf-title">{track.title}</h1>
        {notesOpen && (
          <span className="perf-note">
            “{track.note || `Sesión de ${project.title} · ${track.bpm} BPM · Tonalidad ${track.key}`}”
          </span>
        )}
      </div>

      {/* PANEL LATERAL DE COLA DE REPRODUCCIÓN (QUEUE ESTILO SPOTIFY) */}
      {queueOpen && !snippetClean && (
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

      {/* DOCK INFERIOR COMPLETO ESTILO SPOTIFY CON ICONOS GEOMÉTRICOS PUROS (CERO EMOJIS) */}
      {!snippetClean && (
        <footer className="perf-dock spotify-full-dock">
          <div className="spotify-dock-grid">
            {/* IZQUIERDA: Track actual + Artista + Favorito (Like geométrico) */}
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

            {/* CENTRO: Controles de transporte geométricos (Shuffle, Prev, Play/Pause, Next, Repeat) + Barra de progreso */}
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

            {/* DERECHA: Visual Engine + Notas/Lyrics + Cola (Queue) + Volumen con Slider (Iconos SVG) */}
            <div className="spotify-right-utilities">
              <select
                id="visual-engine-select"
                className="apple-select compact-select"
                value={mode}
                onChange={(e) => {
                  sfx.tap();
                  setMode(e.target.value as VisualMode);
                }}
                aria-label="Visual Engine"
              >
                <option value="boids">36K Partículas (808 Pulse)</option>
                <option value="ferro">Ferrofluido 3D (Escultable HD)</option>
              </select>

              <button
                type="button"
                className={`spotify-util-btn ${notesOpen ? "active" : ""}`}
                onClick={() => {
                  sfx.tap();
                  setNotesOpen((v) => !v);
                }}
                title="Notas de sesión / Lyrics"
                aria-label="Notas de sesión"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="22" />
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
                  className="apple-volume-slider"
                  aria-label="Volumen"
                />
              </div>
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}
