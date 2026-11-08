"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Html, OrbitControls, RoundedBox } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { type Project, type ProjectVideoClip } from "@/lib/mock";
import { sfx } from "@/lib/sfx";

// Genera una textura de video en vivo (60fps) o usa el archivo MP4/WebM subido por el usuario
function useClipTexture(clip: ProjectVideoClip, projectTitle: string) {
  const canvas = useMemo(() => {
    if (typeof document === "undefined") return null;
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 512;
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

    // Fondo luminoso editorial estilo manifold.art (gif1.gif)
    g.fillStyle = clip.c1;
    g.fillRect(0, 0, 512, 512);

    if (clip.stylePreset === "vhs-grain") {
      for (let i = 0; i < 8; i++) {
        const y = ((t * 85 + i * 68) % 560) - 48;
        g.fillStyle = i % 2 === 0 ? clip.c2 : "#f8fafc";
        g.fillRect(24, y, 464, 38);
      }
      g.fillStyle = "#09090b";
      g.beginPath();
      g.arc(256 + Math.sin(t * 2.2) * 110, 256 + Math.cos(t * 1.7) * 90, 86, 0, Math.PI * 2);
      g.fill();
    } else if (clip.stylePreset === "thermal-wave") {
      g.fillStyle = "#f8fafc";
      g.fillRect(0, 0, 512, 512);
      for (let x = 0; x < 512; x += 32) {
        const h = 160 + Math.sin(t * 3 + x * 0.025) * 140;
        g.fillStyle = x % 64 === 0 ? clip.c2 : clip.c1;
        g.fillRect(x, 512 - h, 28, h);
      }
      g.fillStyle = clip.c2;
      g.beginPath();
      g.arc(256, 170 + Math.sin(t * 3.5) * 35, 72, 0, Math.PI * 2);
      g.fill();
    } else if (clip.stylePreset === "kinetic-type") {
      g.fillStyle = clip.c2;
      g.fillRect(24, 24, 464, 464);
      g.fillStyle = clip.c1;
      g.font = "800 78px Inter, sans-serif";
      const offset = (t * 110) % 512;
      g.fillText(projectTitle.toUpperCase(), -offset, 180);
      g.fillText(projectTitle.toUpperCase(), 512 - offset, 180);
      g.fillStyle = "#ffffff";
      g.fillText("0261 // VIDEO", -offset * 0.7, 340);
    } else if (clip.stylePreset === "liquid-ink") {
      for (let i = 0; i < 6; i++) {
        g.fillStyle = i % 2 === 0 ? clip.c2 : "#ffffff";
        g.beginPath();
        const rx = 256 + Math.sin(t * 1.6 + i * 1.3) * 140;
        const ry = 256 + Math.cos(t * 2.1 + i * 1.7) * 140;
        g.arc(rx, ry, 72 + Math.sin(t * 3 + i) * 24, 0, Math.PI * 2);
        g.fill();
      }
    } else if (clip.stylePreset === "strobe-cut") {
      const cell = 64;
      for (let y = 0; y < 512; y += cell) {
        for (let x = 0; x < 512; x += cell) {
          const v = Math.sin(x * 0.02 + y * 0.02 + t * 4.5);
          g.fillStyle = v > 0.15 ? clip.c2 : v < -0.2 ? "#ffffff" : clip.c1;
          g.fillRect(x, y, cell - 4, cell - 4);
        }
      }
    } else {
      g.fillStyle = "#f8fafc";
      g.fillRect(0, 0, 512, 512);
      g.fillStyle = clip.c2;
      for (let y = 32; y < 512; y += 48) {
        for (let x = 32; x < 512; x += 48) {
          const r = Math.max(4, 20 + Math.sin(t * 3.2 + (x + y) * 0.015) * 16);
          g.beginPath();
          g.arc(x, y, r, 0, Math.PI * 2);
          g.fill();
        }
      }
    }

    // Título grande legible en la lámina/cara
    g.fillStyle = "rgba(9,9,11,0.82)";
    g.fillRect(20, 412, 472, 78);
    g.fillStyle = "#ffffff";
    g.font = "700 30px Inter, sans-serif";
    g.fillText(projectTitle.toUpperCase(), 38, 452);
    g.fillStyle = "rgba(255,255,255,0.72)";
    g.font = "600 18px monospace";
    g.fillText(`▶ ${clip.label.slice(0, 28)}`, 38, 478);

    texture.needsUpdate = true;
  });

  return texture;
}

// Cuarto/Bloque arquitectónico 3D estilo gif1.gif (manifold.art) con caras de video auto-iluminadas
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

  const clips =
    project.videos.length > 0
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

  // Materiales auto-iluminados (meshBasicMaterial) para que los videos siempre se vean brillantes a todo color como en gif1.gif y NUNCA negros
  const materials = useMemo(
    () => [
      new THREE.MeshBasicMaterial({ map: tex0 }),
      new THREE.MeshBasicMaterial({ map: tex1 }),
      new THREE.MeshBasicMaterial({ map: tex2 }),
      new THREE.MeshBasicMaterial({ map: tex0 }),
      new THREE.MeshBasicMaterial({ map: tex1 }),
      new THREE.MeshBasicMaterial({ map: tex2 }),
    ],
    [tex0, tex1, tex2]
  );

  useFrame((_, dt) => {
    const [bx, by, bz] = project.blockPos;
    const popFactor = isPopped ? 0.85 : isSelected ? 0.45 : hovered ? 0.2 : 0;
    const dir = new THREE.Vector3(bx, by + 0.5, bz).normalize();
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
      <mesh material={materials}>
        <boxGeometry args={[w, h, d]} />
      </mesh>

      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(w + 0.015, h + 0.015, d + 0.015)]} />
        <lineBasicMaterial color={isSelected || isPopped ? "#09090b" : "#94a3b8"} />
      </lineSegments>

      {/* Píldora flotante inclinada SIN distanceFactor (evita el bug de escala gigante en cámaras) */}
      <Html
        position={[-w * 0.35, h * 0.45, d * 0.45]}
        center
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
          <small>
            {project.videos.length}v · {project.tracks.length}t
          </small>
        </button>
      </Html>
    </group>
  );
}

// Vista alternativa: Hilera diagonal 3D con ZOOM OUT y vista MÁS DESDE ARRIBA para que las láminas se vean amplias y claras
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

    // Espaciado diagonal amplio como el primer prototipo pero visto desde más arriba y con ángulo abierto (-0.42 rad en Y)
    g.position.set(
      d * 1.25 - lift.current * 0.35,
      d * 0.32 + lift.current * 0.28,
      -d * 1.05 + lift.current * 0.65
    );
    g.rotation.set(-0.14 + lift.current * 0.08, -0.42 + lift.current * 0.22, 0);
  });

  return (
    <group ref={groupRef}>
      <RoundedBox
        args={[2.35, 2.35, 0.05]}
        radius={0.04}
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
        {/* Material auto-iluminado para que el arte/video de cada lámina nunca se vea oscuro */}
        <meshBasicMaterial map={tex} />
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

  const rowDragRef = useRef({ off: 1.5, vel: 0, dragging: false });
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

          {/* Cámara en perspectiva isométrica limpia (fov 30 alejada y desde arriba) */}
          <Canvas
            camera={{ position: [6.8, 6.2, 7.2], fov: 32 }}
            dpr={[1, 2]}
          >
            <ambientLight intensity={1.6} />
            <directionalLight position={[8, 14, 10]} intensity={1.5} />

            <group position={[0, 0.25, 0]}>
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
        /* Vista alternativa: Hilera de láminas 3D con ZOOM OUT y cámara MÁS DESDE ARRIBA */
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

          <Canvas camera={{ position: [0.8, 2.65, 9.6], fov: 36 }} dpr={[1, 2]}>
            <ambientLight intensity={1.5} />
            <directionalLight position={[4, 8, 6]} intensity={1.6} />
            <group position={[-0.4, -0.35, 0]}>
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
              <b>Carpeta de Videos (3–5s) · {activeProject.title}</b>
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
