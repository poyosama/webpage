"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Html, OrbitControls, RoundedBox } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { type Project, type ProjectVideoClip } from "@/lib/mock";
import { sfx } from "@/lib/sfx";

// Crea una textura animada en vivo (60fps) o un VideoTexture real si el clip fue subido por el usuario (.mp4/.webm)
function useClipTexture(clip: ProjectVideoClip, projectTitle: string) {
  const canvas = useMemo(() => {
    if (typeof document === "undefined") return null;
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 256;
    return c;
  }, []);

  const videoEl = useMemo(() => {
    if (typeof document === "undefined" || !clip.url) return null;
    const v = document.createElement("video");
    v.src = clip.url;
    v.loop = true;
    v.muted = true;
    v.playsInline = true;
    v.crossOrigin = "anonymous";
    v.play().catch(() => {});
    return v;
  }, [clip.url]);

  const texture = useMemo(() => {
    if (videoEl) {
      const vt = new THREE.VideoTexture(videoEl);
      vt.colorSpace = THREE.SRGBColorSpace;
      return vt;
    }
    if (!canvas) return new THREE.Texture();
    const ct = new THREE.CanvasTexture(canvas);
    ct.colorSpace = THREE.SRGBColorSpace;
    return ct;
  }, [canvas, videoEl]);

  useEffect(() => {
    return () => {
      if (videoEl) {
        videoEl.pause();
        videoEl.src = "";
      }
      texture.dispose();
    };
  }, [videoEl, texture]);

  useFrame(({ clock }) => {
    if (videoEl || !canvas) return;
    const g = canvas.getContext("2d");
    if (!g) return;
    const t = clock.elapsedTime;

    // Fondo base
    g.fillStyle = clip.c1;
    g.fillRect(0, 0, 256, 256);

    if (clip.stylePreset === "vhs-grain") {
      // Barras cromáticas en movimiento estilo arte galería de gif1.gif
      for (let i = 0; i < 8; i++) {
        const y = ((t * 48 + i * 36) % 280) - 24;
        g.fillStyle = i % 2 === 0 ? clip.c2 : "#ffffff";
        g.globalAlpha = 0.78;
        g.fillRect(0, y, 256, 22);
      }
      g.globalAlpha = 1;
      // Círculo oscilante
      g.fillStyle = "#09090b";
      g.beginPath();
      g.arc(128 + Math.sin(t * 2.2) * 54, 128 + Math.cos(t * 1.7) * 44, 42, 0, Math.PI * 2);
      g.fill();
    } else if (clip.stylePreset === "thermal-wave") {
      for (let x = 0; x < 256; x += 16) {
        const h = 80 + Math.sin(t * 3 + x * 0.05) * 70;
        g.fillStyle = x % 32 === 0 ? clip.c2 : "#fef08a";
        g.fillRect(x, 256 - h, 14, h);
      }
      g.fillStyle = "rgba(255,255,255,0.9)";
      g.beginPath();
      g.arc(128, 92 + Math.sin(t * 4) * 18, 36, 0, Math.PI * 2);
      g.fill();
    } else if (clip.stylePreset === "kinetic-type") {
      g.fillStyle = clip.c2;
      g.fillRect(16, 16, 224, 224);
      g.fillStyle = clip.c1;
      g.font = "700 42px Inter, sans-serif";
      const offset = (t * 60) % 256;
      g.fillText(projectTitle.toUpperCase(), -offset, 96);
      g.fillText(projectTitle.toUpperCase(), 256 - offset, 96);
      g.fillStyle = "#ffffff";
      g.fillText("0261 // LOOP", -offset * 0.7, 178);
    } else if (clip.stylePreset === "liquid-ink") {
      for (let i = 0; i < 5; i++) {
        g.fillStyle = i % 2 === 0 ? clip.c2 : "#ffffff";
        g.beginPath();
        const rx = 128 + Math.sin(t * 1.6 + i * 1.3) * 70;
        const ry = 128 + Math.cos(t * 2.1 + i * 1.7) * 70;
        g.arc(rx, ry, 34 + Math.sin(t * 3 + i) * 12, 0, Math.PI * 2);
        g.fill();
      }
    } else if (clip.stylePreset === "strobe-cut") {
      const cell = 32;
      for (let y = 0; y < 256; y += cell) {
        for (let x = 0; x < 256; x += cell) {
          const v = Math.sin(x * 0.04 + y * 0.04 + t * 4.5);
          g.fillStyle = v > 0.15 ? clip.c2 : v < -0.2 ? "#ffffff" : clip.c1;
          g.fillRect(x, y, cell - 2, cell - 2);
        }
      }
    } else {
      // halftone-cam
      g.fillStyle = "#f8fafc";
      g.fillRect(0, 0, 256, 256);
      g.fillStyle = clip.c1;
      for (let y = 16; y < 256; y += 24) {
        for (let x = 16; x < 256; x += 24) {
          const r = Math.max(2, 10 + Math.sin(t * 3.2 + (x + y) * 0.03) * 8);
          g.beginPath();
          g.arc(x, y, r, 0, Math.PI * 2);
          g.fill();
        }
      }
    }

    // Etiqueta de clip abajo
    g.fillStyle = "rgba(9,9,11,0.78)";
    g.fillRect(10, 214, 236, 30);
    g.fillStyle = "#ffffff";
    g.font = "600 13px monospace";
    g.fillText(`▶ ${clip.label.slice(0, 24)}`, 18, 234);

    texture.needsUpdate = true;
  });

  return texture;
}

function ProjectVideoCube({
  project,
  isSelected,
  isPopped,
  onSelect,
}: {
  project: Project;
  isSelected: boolean;
  isPopped: boolean;
  onSelect: (p: Project) => void;
}) {
  const groupRef = useRef<THREE.Group>(null!);
  const [hovered, setHovered] = useState(false);

  const clips = project.videos.length > 0
    ? project.videos
    : [
        {
          id: "fallback",
          label: "loop.mp4",
          kind: "procedural" as const,
          stylePreset: "vhs-grain" as const,
          c1: project.c1,
          c2: project.c2,
        },
      ];

  const tex0 = useClipTexture(clips[0 % clips.length], project.title);
  const tex1 = useClipTexture(clips[1 % clips.length], project.title);
  const tex2 = useClipTexture(clips[2 % clips.length], project.title);

  // Cuando el proyecto está seleccionado o "popeado" (por ejemplo en Subir Tema), sale hacia afuera de la unidad arquitectónica
  useFrame((_, dt) => {
    const [bx, by, bz] = project.blockPos;
    const popFactor = isPopped ? 0.65 : isSelected ? 0.35 : hovered ? 0.16 : 0;
    const dir = new THREE.Vector3(bx, by + 0.4, bz).normalize();
    const tx = bx + dir.x * popFactor;
    const ty = by + dir.y * popFactor;
    const tz = bz + dir.z * popFactor;

    groupRef.current.position.x = THREE.MathUtils.damp(groupRef.current.position.x, tx, 9, dt);
    groupRef.current.position.y = THREE.MathUtils.damp(groupRef.current.position.y, ty, 9, dt);
    groupRef.current.position.z = THREE.MathUtils.damp(groupRef.current.position.z, tz, 9, dt);

    const targetScale = isPopped ? 1.12 : isSelected ? 1.05 : hovered ? 1.02 : 1;
    const s = THREE.MathUtils.damp(groupRef.current.scale.x, targetScale, 9, dt);
    groupRef.current.scale.setScalar(s);
  });

  const [w, h, d] = project.blockSize;

  return (
    <group
      ref={groupRef}
      position={project.blockPos}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
        sfx.hover();
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        setHovered(false);
        document.body.style.cursor = "";
      }}
      onClick={(e) => {
        e.stopPropagation();
        sfx.tap();
        onSelect(project);
      }}
    >
      {/* Cubo 3D con un video/loop distinto en cada par de caras como en gif1.gif */}
      <mesh castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial attach="material-0" map={tex0} roughness={0.25} />
        <meshStandardMaterial attach="material-1" map={tex1} roughness={0.25} />
        <meshStandardMaterial attach="material-2" map={tex2} roughness={0.2} />
        <meshStandardMaterial attach="material-3" map={tex0} roughness={0.3} />
        <meshStandardMaterial attach="material-4" map={tex1} roughness={0.22} />
        <meshStandardMaterial attach="material-5" map={tex2} roughness={0.25} />
      </mesh>

      {/* Borde arquitectónico nítido cuando está activo */}
      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(w + 0.01, h + 0.01, d + 0.01)]} />
        <lineBasicMaterial color={isSelected || isPopped ? "#09090b" : "#cbd5e1"} />
      </lineSegments>

      {/* Píldora flotante inclinada exactamente como en gif1.gif (manifold.art) */}
      <Html
        position={[-w * 0.35, h * 0.42, d * 0.45]}
        center
        distanceFactor={8}
        zIndexRange={[10, 0]}
      >
        <button
          type="button"
          className={`manifold-3d-pill ${isSelected || isPopped ? "active" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            sfx.tap();
            onSelect(project);
          }}
        >
          <span>{project.title}</span>
          <small>{project.videos.length}v · {project.tracks.length}t</small>
        </button>
      </Html>
    </group>
  );
}

// Vista alternativa: Hilera diagonal 3D de proyectos (como al principio en el primer prototipo que le gustó a Juani)
function DiagonalProjectPlate({
  project,
  index,
  offsetRef,
  isSelected,
  onSelect,
  movedRef,
}: {
  project: Project;
  index: number;
  offsetRef: React.RefObject<{ off: number; vel: number; dragging: boolean }>;
  isSelected: boolean;
  onSelect: (p: Project) => void;
  movedRef: React.RefObject<boolean>;
}) {
  const groupRef = useRef<THREE.Group>(null!);
  const [hovered, setHovered] = useState(false);
  const lift = useRef(0);
  const clip = project.videos[0] || {
    id: "f",
    label: "loop",
    kind: "procedural" as const,
    stylePreset: "vhs-grain" as const,
    c1: project.c1,
    c2: project.c2,
  };
  const tex = useClipTexture(clip, project.title);

  useFrame((_, dt) => {
    const d = index - offsetRef.current.off;
    lift.current = THREE.MathUtils.damp(lift.current, hovered || isSelected ? 1 : 0, 10, dt);
    const g = groupRef.current;
    g.position.set(
      d * 1.05 - lift.current * 0.38,
      d * 0.48 + lift.current * 0.18,
      -d * 1.15 + lift.current * 0.75
    );
    g.rotation.set(0, -0.72 + lift.current * 0.28, 0);
  });

  return (
    <group ref={groupRef}>
      <RoundedBox
        args={[2.25, 2.25, 0.05]}
        radius={0.03}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          sfx.hover();
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = "";
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (!movedRef.current) {
            sfx.tap();
            onSelect(project);
          }
        }}
      >
        <meshPhysicalMaterial
          map={tex}
          roughness={0.15}
          metalness={0.08}
          clearcoat={1}
        />
      </RoundedBox>
    </group>
  );
}

function DiagonalRowPhysics({
  total,
  offsetRef,
}: {
  total: number;
  offsetRef: React.RefObject<{ off: number; vel: number; dragging: boolean }>;
}) {
  useFrame((_, dt) => {
    const s = offsetRef.current;
    if (!s.dragging) {
      s.off += s.vel * dt;
      s.vel *= Math.pow(0.05, dt);
      const target = Math.round(s.off);
      if (Math.abs(s.vel) < 1.2) s.off = THREE.MathUtils.damp(s.off, target, 8, dt);
      s.off = THREE.MathUtils.clamp(s.off, -0.3, Math.max(0, total - 0.7));
    }
  });
  return null;
}

export default function ManifoldLibrary3D({
  projects,
  selectedProjectId,
  poppedProjectId,
  viewMode = "manifold",
  onSelectProject,
  onUploadProjectVideo,
  compact = false,
}: {
  projects: Project[];
  selectedProjectId: string;
  poppedProjectId?: string | null;
  viewMode?: "manifold" | "disc-row";
  onSelectProject: (p: Project) => void;
  onUploadProjectVideo?: (projectId: string, file: File) => void;
  compact?: boolean;
}) {
  const activeProject =
    projects.find((p) => p.id === selectedProjectId) || projects[0];

  // Estado para el arrastre de la vista de hilera diagonal
  const rowDragRef = useRef({ off: 0, vel: 0, dragging: false });
  const movedRef = useRef(false);
  const startRef = useRef({ x: 0, off: 0, t: 0, lx: 0 });

  return (
    <div className={`manifold-3d-wrapper ${compact ? "is-compact" : ""}`}>
      {viewMode === "manifold" ? (
        <div className="manifold-3d-canvas-stage">
          <div className="manifold-stage-overlay-top">
            <div>
              <span className="mono-tag">ENTORNO 3D // MANIFOLD CLUSTER</span>
              <h3>Arrastrá para orbitar la unidad 3D · Tocá un bloque para que popee</h3>
            </div>
            <span className="mono-tag">VIDEOS 3–5S EN CARAS 3D</span>
          </div>

          <Canvas
            orthographic
            camera={{ position: [7.5, 6.8, 7.5], zoom: compact ? 64 : 74, near: -50, far: 100 }}
            dpr={[1, 2]}
          >
            <ambientLight intensity={1.35} />
            <directionalLight position={[8, 14, 10]} intensity={1.55} />
            <directionalLight position={[-8, -6, -6]} intensity={0.55} color="#cbd5e1" />

            <group position={[0, 0.15, 0]}>
              {projects.map((p) => (
                <ProjectVideoCube
                  key={p.id}
                  project={p}
                  isSelected={p.id === selectedProjectId}
                  isPopped={p.id === poppedProjectId}
                  onSelect={onSelectProject}
                />
              ))}
            </group>

            <OrbitControls
              enableZoom={false}
              enablePan={false}
              rotateSpeed={0.65}
              minPolarAngle={0.45}
              maxPolarAngle={1.35}
            />
          </Canvas>
        </div>
      ) : (
        /* Vista alternativa: Hilera de discos 3D apilados en perspectiva como al principio */
        <div
          className="manifold-3d-canvas-stage"
          onPointerDown={(e) => {
            (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
            rowDragRef.current.dragging = true;
            movedRef.current = false;
            startRef.current = {
              x: e.clientX,
              off: rowDragRef.current.off,
              t: performance.now(),
              lx: e.clientX,
            };
          }}
          onPointerMove={(e) => {
            if (!rowDragRef.current.dragging) return;
            const dx = e.clientX - startRef.current.x;
            if (Math.abs(dx) > 5) movedRef.current = true;
            const now = performance.now();
            const dt = Math.max(1, now - startRef.current.t) / 1000;
            rowDragRef.current.vel = -((e.clientX - startRef.current.lx) / 130) / dt;
            startRef.current.t = now;
            startRef.current.lx = e.clientX;
            rowDragRef.current.off = startRef.current.off - dx / 130;
          }}
          onPointerUp={() => {
            rowDragRef.current.dragging = false;
          }}
          onPointerLeave={() => {
            rowDragRef.current.dragging = false;
          }}
        >
          <div className="manifold-stage-overlay-top">
            <div>
              <span className="mono-tag">VISTA HILERA 3D // PROYECTOS APILADOS</span>
              <h3>Arrastrá con click para correr la hilera · Tocá una lámina para abrir</h3>
            </div>
            <span className="mono-tag">{projects.length} PROYECTOS</span>
          </div>

          <Canvas camera={{ position: [0, 0.55, 6.6], fov: 40 }} dpr={[1, 2]}>
            <ambientLight intensity={1.35} />
            <directionalLight position={[4, 6, 5]} intensity={1.6} />
            <group position={[-1.1, -0.5, 0]}>
              {projects.map((p, i) => (
                <DiagonalProjectPlate
                  key={p.id}
                  project={p}
                  index={i}
                  offsetRef={rowDragRef}
                  isSelected={p.id === selectedProjectId}
                  onSelect={onSelectProject}
                  movedRef={movedRef}
                />
              ))}
            </group>
            <DiagonalRowPhysics total={projects.length} offsetRef={rowDragRef} />
          </Canvas>
        </div>
      )}

      {/* Barra de la Carpetita de Videos (3-5s) del proyecto seleccionado */}
      {activeProject && onUploadProjectVideo && (
        <div className="project-video-folder-bar">
          <div className="video-folder-left">
            <span className="folder-icon">📁</span>
            <div>
              <b>
                Carpeta de Videos (3–5s) · {activeProject.title}
              </b>
              <span>
                Estos {activeProject.videos.length} clips se proyectan en las caras 3D del bloque de{" "}
                {activeProject.title}
              </span>
            </div>
          </div>

          <div className="video-folder-clips">
            {activeProject.videos.map((v) => (
              <span key={v.id} className="video-clip-pill">
                <i style={{ background: v.c2 }} />
                {v.label}
              </span>
            ))}
          </div>

          <label className="apple-btn primary upload-video-btn" onMouseEnter={() => sfx.hover()}>
            <span>+ Subir video 3–5s / GIF al bloque</span>
            <input
              type="file"
              accept="video/mp4,video/webm,image/gif,video/*"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  sfx.drop();
                  onUploadProjectVideo(activeProject.id, file);
                }
              }}
            />
          </label>
        </div>
      )}
    </div>
  );
}
