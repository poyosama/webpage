"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { type Project, type ProjectVideoClip } from "@/lib/mock";
import { sfx } from "@/lib/sfx";

// Shader GLSL 100% en GPU (0% uso de CPU por frame, corre a 120 FPS)
const faceVertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const faceFragmentShader = `
  uniform float uTime;
  uniform vec3 uColor1;
  uniform vec3 uColor2;
  uniform int uMode;
  uniform sampler2D uOverlayTex;
  varying vec2 vUv;

  void main() {
    vec2 uv = vUv;
    vec3 col = uColor1;

    if (uMode == 0) {
      // Barras cromáticas + círculo en movimiento (estilo galería manifold)
      float stripe = step(0.5, fract(uv.y * 5.0 - uTime * 0.45));
      col = mix(uColor1, uColor2, stripe * 0.85);
      vec2 center = vec2(0.5 + 0.22 * sin(uTime * 1.6), 0.54 + 0.18 * cos(uTime * 1.3));
      float d = length(uv - center);
      col = mix(col, vec3(0.06, 0.06, 0.08), smoothstep(0.22, 0.20, d));
    } else if (uMode == 1) {
      // Onda térmica / ecualizador líquido
      float wave = 0.42 + 0.28 * sin(uv.x * 10.0 + uTime * 2.4) * cos(uv.x * 4.0 - uTime);
      col = mix(vec3(0.97, 0.97, 0.96), uColor2, step(uv.y, wave));
      float sun = length(uv - vec2(0.5, 0.72 + 0.06 * sin(uTime * 2.0)));
      col = mix(col, uColor1, smoothstep(0.16, 0.14, sun));
    } else if (uMode == 2) {
      // Grilla estroboscópica suave
      vec2 grid = floor(uv * 6.0);
      float v = sin(grid.x * 1.2 + grid.y * 1.4 + uTime * 3.0);
      col = v > 0.2 ? uColor2 : (v < -0.25 ? vec3(0.96) : uColor1);
    } else {
      // Tinta líquida / blobs orgánicos en GPU
      float b1 = length(uv - vec2(0.5 + 0.25 * sin(uTime * 1.3), 0.5 + 0.25 * cos(uTime * 1.7)));
      float b2 = length(uv - vec2(0.5 - 0.25 * cos(uTime * 1.5), 0.5 + 0.22 * sin(uTime * 1.1)));
      float m = smoothstep(0.38, 0.12, b1) + smoothstep(0.36, 0.12, b2);
      col = mix(uColor1, uColor2, clamp(m, 0.0, 1.0));
    }

    // Capa estática cacheada con el título y nombre del clip (se dibuja 1 sola vez al montar)
    vec4 overlay = texture2D(uOverlayTex, uv);
    col = mix(col, overlay.rgb, overlay.a);

    gl_FragColor = vec4(col, 1.0);
  }
`;

// Textura de overlay estática (se genera UNA SOLA VEZ en useMemo, cero costo por frame)
function createStaticLabelOverlay(projectTitle: string, clipLabel: string, pillTag: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, 256, 256);

  // Etiqueta superior tipo píldora inclinada impresa en alta definición
  g.save();
  g.translate(82, 48);
  g.rotate(-0.24);
  g.fillStyle = "rgba(241, 245, 249, 0.94)";
  g.beginPath();
  g.roundRect(-68, -15, 136, 30, 15);
  g.fill();
  g.lineWidth = 2;
  g.strokeStyle = "rgba(15, 15, 17, 0.35)";
  g.stroke();
  g.fillStyle = "#09090b";
  g.font = "700 13px Inter, sans-serif";
  g.textAlign = "center";
  g.fillText(projectTitle.slice(0, 15), 0, 4);
  g.restore();

  // Zócalo inferior oscuro con metadata del video de 3-5s
  g.fillStyle = "rgba(9, 9, 11, 0.84)";
  g.fillRect(10, 202, 236, 44);
  g.fillStyle = "#ffffff";
  g.font = "700 15px Inter, sans-serif";
  g.fillText(projectTitle.toUpperCase().slice(0, 18), 18, 222);
  g.fillStyle = "rgba(255, 255, 255, 0.72)";
  g.font = "500 11px monospace";
  g.fillText(`▶ ${clipLabel.slice(0, 24)} · ${pillTag}`, 18, 238);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const PRESET_TO_INT: Record<ProjectVideoClip["stylePreset"], number> = {
  "vhs-grain": 0,
  "thermal-wave": 1,
  "kinetic-type": 2,
  "strobe-cut": 2,
  "liquid-ink": 3,
  "halftone-cam": 3,
};

// Material de cara 3D ultra rápido (Shader GPU o textura nativa de Video/GIF si el usuario subió un archivo)
function useFastFaceMaterial(clip: ProjectVideoClip, projectTitle: string, pillTag: string, timeOffset: number) {
  const overlayTex = useMemo(
    () => createStaticLabelOverlay(projectTitle, clip.label, pillTag),
    [projectTitle, clip.label, pillTag]
  );

  const isImageOrGif =
    clip.mediaType === "image" ||
    Boolean(clip.url && /\.(gif|png|jpe?g|webp|avif)$/i.test(clip.label));

  const videoTex = useMemo(() => {
    if (typeof document === "undefined" || !clip.url || isImageOrGif) return null;
    const v = document.createElement("video");
    v.src = clip.url;
    v.loop = true;
    v.muted = true;
    v.playsInline = true;
    v.crossOrigin = "anonymous";
    v.play().catch(() => {});
    const vt = new THREE.VideoTexture(v);
    vt.colorSpace = THREE.SRGBColorSpace;
    return { video: v, tex: vt };
  }, [clip.url, isImageOrGif]);

  const imageTex = useMemo(() => {
    if (typeof document === "undefined" || !clip.url || !isImageOrGif) return null;
    const tex = new THREE.TextureLoader().load(clip.url);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, [clip.url, isImageOrGif]);

  const material = useMemo(() => {
    if (videoTex) {
      return new THREE.MeshBasicMaterial({ map: videoTex.tex });
    }
    if (imageTex) {
      return new THREE.MeshBasicMaterial({ map: imageTex });
    }
    return new THREE.ShaderMaterial({
      vertexShader: faceVertexShader,
      fragmentShader: faceFragmentShader,
      uniforms: {
        uTime: { value: timeOffset },
        uColor1: { value: new THREE.Color(clip.c1) },
        uColor2: { value: new THREE.Color(clip.c2) },
        uMode: { value: PRESET_TO_INT[clip.stylePreset] ?? 0 },
        uOverlayTex: { value: overlayTex },
      },
    });
  }, [clip.c1, clip.c2, clip.stylePreset, overlayTex, timeOffset, videoTex, imageTex]);

  useEffect(() => {
    return () => {
      if (videoTex) {
        videoTex.video.pause();
        videoTex.video.src = "";
        videoTex.tex.dispose();
      }
      if (imageTex) {
        imageTex.dispose();
      }
      overlayTex.dispose();
      material.dispose();
    };
  }, [videoTex, imageTex, overlayTex, material]);

  useFrame(({ clock }) => {
    if (material instanceof THREE.ShaderMaterial) {
      material.uniforms.uTime.value = clock.elapsedTime + timeOffset;
    }
  });

  return material;
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

  const pillTag = `${project.tracks.length}T`;
  const mat0 = useFastFaceMaterial(clips[0 % clips.length], project.title, pillTag, 0.0);
  const mat1 = useFastFaceMaterial(clips[1 % clips.length], project.title, pillTag, 2.1);
  const mat2 = useFastFaceMaterial(clips[2 % clips.length], project.title, pillTag, 4.3);

  const materials = useMemo(
    () => [mat0, mat1, mat2, mat0, mat1, mat2],
    [mat0, mat1, mat2]
  );

  const [w, h, d] = project.blockSize;
  const boxGeo = useMemo(() => new THREE.BoxGeometry(w, h, d), [w, h, d]);
  const edgesGeo = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(w + 0.012, h + 0.012, d + 0.012)), [w, h, d]);

  const popDir = useMemo(
    () => new THREE.Vector3(project.blockPos[0], project.blockPos[1] + 0.5, project.blockPos[2]).normalize(),
    [project.blockPos]
  );

  useFrame((_, dt) => {
    const [bx, by, bz] = project.blockPos;
    const popFactor = isPopped ? 0.85 : isSelected ? 0.45 : hovered ? 0.18 : 0;
    const tx = bx + popDir.x * popFactor;
    const ty = by + popDir.y * popFactor;
    const tz = bz + popDir.z * popFactor;

    const g = groupRef.current;
    g.position.x = THREE.MathUtils.damp(g.position.x, tx, 10, dt);
    g.position.y = THREE.MathUtils.damp(g.position.y, ty, 10, dt);
    g.position.z = THREE.MathUtils.damp(g.position.z, tz, 10, dt);

    const targetScale = isPopped ? 1.1 : isSelected ? 1.04 : hovered ? 1.015 : 1;
    const s = THREE.MathUtils.damp(g.scale.x, targetScale, 10, dt);
    g.scale.setScalar(s);
  });

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
      onPointerDown={(e) => {
        e.stopPropagation();
        sfx.press();
      }}
      onPointerUp={(e) => {
        e.stopPropagation();
        sfx.release();
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(project);
      }}
    >
      <mesh geometry={boxGeo} material={materials} />
      <lineSegments geometry={edgesGeo}>
        <lineBasicMaterial color={isSelected || isPopped ? "#09090b" : "#94a3b8"} />
      </lineSegments>
    </group>
  );
}

// Vista alternativa: Hilera diagonal 3D ultra liviana (zoom out + vista desde arriba, 100% GPU)
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
  const meshRef = useRef<THREE.Mesh>(null!);
  const [hovered, setHovered] = useState(false);
  const lift = useRef(0);
  const clip = project.videos[0] || {
    id: "f",
    label: "loop.mp4",
    kind: "procedural" as const,
    stylePreset: "vhs-grain" as const,
    c1: project.c1,
    c2: project.c2,
  };
  const mat = useFastFaceMaterial(clip, project.title, `${project.tracks.length} DISCOS`, index * 1.3);

  useFrame((_, dt) => {
    const d = index - offsetRef.current.off;
    lift.current = THREE.MathUtils.damp(lift.current, hovered || isSelected ? 1 : 0, 10, dt);
    const m = meshRef.current;

    m.position.set(
      d * 1.28 - lift.current * 0.35,
      d * 0.32 + lift.current * 0.28,
      -d * 1.05 + lift.current * 0.65
    );
    m.rotation.set(-0.14 + lift.current * 0.08, -0.42 + lift.current * 0.22, 0);
  });

  return (
    <mesh
      ref={meshRef}
      material={mat}
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
      onPointerDown={(e) => {
        e.stopPropagation();
        sfx.press();
      }}
      onPointerUp={(e) => {
        e.stopPropagation();
        sfx.release();
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (!movedRef.current) {
          onSelect(project);
        }
      }}
    >
      <boxGeometry args={[2.35, 2.35, 0.045]} />
    </mesh>
  );
}

function DiagonalRowPhysics({
  total,
  offsetRef,
}: {
  total: number;
  offsetRef: React.RefObject<{ off: number; vel: number; dragging: boolean }>;
}) {
  const lastSnap = useRef(1);
  useFrame((_, dt) => {
    const s = offsetRef.current;
    if (!s.dragging) {
      s.off += s.vel * dt;
      s.vel *= Math.pow(0.05, dt);
      const target = Math.round(s.off);
      if (Math.abs(s.vel) < 1.2) s.off = THREE.MathUtils.damp(s.off, target, 8, dt);
      s.off = THREE.MathUtils.clamp(s.off, -0.3, Math.max(0, total - 0.7));
    }
    const cur = Math.round(s.off);
    if (cur !== lastSnap.current) {
      lastSnap.current = cur;
      sfx.tick();
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
  onRemoveProjectVideo,
  compact = false,
}: {
  projects: Project[];
  selectedProjectId: string;
  poppedProjectId?: string | null;
  viewMode?: "manifold" | "disc-row";
  onSelectProject: (p: Project) => void;
  onUploadProjectVideo?: (projectId: string, file: File) => void;
  onRemoveProjectVideo?: (projectId: string, clipId: string) => void;
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
              <span className="mono-tag">ENTORNO 3D GPU // MANIFOLD CLUSTER</span>
              <h3>Arrastrá para orbitar la unidad 3D · Tocá un bloque para que popee</h3>
            </div>
            <div className="manifold-quick-pills">
              {projects.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`quick-proj-pill ${p.id === selectedProjectId ? "on" : ""}`}
                  onClick={() => {
                    sfx.tap();
                    onSelectProject(p);
                  }}
                >
                  {p.title}
                </button>
              ))}
            </div>
          </div>

          <Canvas
            camera={{ position: [6.8, 6.2, 7.2], fov: 32 }}
            dpr={[1, 1.5]}
            gl={{ antialias: true, powerPreference: "high-performance" }}
          >
            <group position={[0, 0.2, 0]}>
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
              enableZoom={true}
              minDistance={5.5}
              maxDistance={15}
              enablePan={false}
              rotateSpeed={0.7}
              minPolarAngle={0.4}
              maxPolarAngle={1.38}
            />
          </Canvas>
        </div>
      ) : (
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

          <Canvas
            camera={{ position: [0.8, 2.65, 9.6], fov: 36 }}
            dpr={[1, 1.5]}
            gl={{ antialias: true, powerPreference: "high-performance" }}
          >
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

      {activeProject && onUploadProjectVideo && (
        <div className="project-video-folder-bar">
          <div className="video-folder-left">
            <span className="folder-icon">📁</span>
            <div>
              <b>Carpeta de Videos / GIFs (3–5s) · {activeProject.title}</b>
              <span>
                {activeProject.videos.length > 0
                  ? `Estos ${activeProject.videos.length} clips se proyectan en las caras 3D del bloque de ${activeProject.title}`
                  : `Sin clips cargados en ${activeProject.title} — subí tus videos o GIFs`}
              </span>
            </div>
          </div>

          <div className="video-folder-clips">
            {activeProject.videos.length === 0 ? (
              <span className="video-clip-empty">0 clips activos (loop base por defecto)</span>
            ) : (
              activeProject.videos.map((v) => (
                <span key={v.id} className="video-clip-pill">
                  <i style={{ background: v.c2 }} />
                  <span className="video-clip-label">{v.label}</span>
                  {onRemoveProjectVideo && (
                    <button
                      type="button"
                      className="video-clip-remove-btn"
                      title={`Quitar ${v.label} del bloque`}
                      aria-label={`Quitar ${v.label}`}
                      onMouseEnter={() => sfx.hover()}
                      onClick={(e) => {
                        e.stopPropagation();
                        sfx.tap();
                        onRemoveProjectVideo(activeProject.id, v.id);
                      }}
                    >
                      ✕
                    </button>
                  )}
                </span>
              ))
            )}
          </div>

          <label className="apple-btn primary upload-video-btn" onMouseEnter={() => sfx.hover()}>
            <span>+ Subir video 3–5s / GIF al bloque</span>
            <input
              type="file"
              accept="video/mp4,video/webm,image/gif,image/*,video/*"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  sfx.drop();
                  onUploadProjectVideo(activeProject.id, file);
                  e.target.value = "";
                }
              }}
            />
          </label>
        </div>
      )}
    </div>
  );
}
