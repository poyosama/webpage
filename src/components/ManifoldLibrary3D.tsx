"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { type Project, type ProjectVideoClip } from "@/lib/mock";
import { sfx } from "@/lib/sfx";

function ResponsiveSceneGroup({
  children,
  basePosition,
  mobileScale = 0.72,
  desktopScale = 0.94,
}: {
  children: React.ReactNode;
  basePosition: [number, number, number];
  mobileScale?: number;
  desktopScale?: number;
}) {
  const width = useThree((s) => s.size.width);
  const scale = width < 440 ? mobileScale : width < 640 ? 0.82 : desktopScale;
  return (
    <group position={basePosition} scale={scale}>
      {children}
    </group>
  );
}

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

// Efecto 3D: la cámara hace zoom hacia la cara del cubo mientras la cara se vuelve vóxeles blancos que se desintegran
function VoxelDivePortal({
  project,
  onComplete,
}: {
  project: Project;
  onComplete: (p: Project) => void;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null!);
  const progressRef = useRef(0);
  const doneRef = useRef(false);
  const { camera } = useThree();
  const startCamPos = useMemo(() => camera.position.clone(), [camera]);

  const gridN = 13;
  const totalVoxels = gridN * gridN;
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const colorObj = useMemo(() => new THREE.Color(), []);

  const voxelMeta = useMemo(() => {
    const [w, h, d] = project.blockSize;
    const cellW = w / gridN;
    const cellH = h / gridN;
    return Array.from({ length: totalVoxels }, (_, idx) => {
      const gx = (idx % gridN) - (gridN - 1) / 2;
      const gy = Math.floor(idx / gridN) - (gridN - 1) / 2;
      const lx = gx * cellW;
      const ly = gy * cellH;
      const lz = d * 0.5 + 0.04;
      const distFromCenter = Math.hypot(gx, gy) / (gridN * 0.7);
      const delay = distFromCenter * 0.28 + Math.random() * 0.14;
      const vel = new THREE.Vector3(
        gx * 0.22 + (Math.random() - 0.5) * 1.4,
        gy * 0.22 + (Math.random() - 0.5) * 1.4,
        1.15 + Math.random() * 1.85
      );
      return { lx, ly, lz, cellW, cellH, delay, vel };
    });
  }, [project.blockSize, totalVoxels]);

  useFrame((_, dt) => {
    if (doneRef.current) return;
    progressRef.current += Math.min(0.04, dt) * 1.22;
    const p = Math.min(1, progressRef.current);

    // Zoom de la cámara directo hacia adentro del cubo seleccionado
    const popDir = new THREE.Vector3(
      project.blockPos[0],
      project.blockPos[1] + 0.5,
      project.blockPos[2]
    ).normalize();
    const cubeCenter = new THREE.Vector3(
      project.blockPos[0] + popDir.x * 0.45,
      project.blockPos[1] + popDir.y * 0.45 + 0.15,
      project.blockPos[2] + popDir.z * 0.45
    );
    const ease = 1 - Math.pow(1 - p, 3);
    const targetCam = cubeCenter.clone().add(new THREE.Vector3(0.25, 0.2, 0.55));
    camera.position.lerpVectors(startCamPos, targetCam, ease);
    camera.lookAt(cubeCenter);

    const baseCol = new THREE.Color(project.c2);
    const whiteCol = new THREE.Color("#ffffff");

    for (let i = 0; i < totalVoxels; i++) {
      const v = voxelMeta[i];
      const localT = Math.max(0, (p - v.delay) / (1 - v.delay));

      // Primero se ponen bien blanquitos (0 -> 0.35) y después se desintegran flotando (0.35 -> 1.0)
      const whiteMix = Math.min(1, localT * 3.2);
      colorObj.copy(baseCol).lerp(whiteCol, whiteMix);
      meshRef.current.setColorAt(i, colorObj);

      const disintegrateT = Math.max(0, (localT - 0.22) / 0.78);
      const shrink = Math.max(0.001, 1 - Math.pow(disintegrateT, 1.4));

      dummy.position.set(
        cubeCenter.x + v.lx + v.vel.x * disintegrateT * 0.85,
        cubeCenter.y + v.ly + v.vel.y * disintegrateT * 0.85,
        cubeCenter.z + v.lz + v.vel.z * disintegrateT * 0.85
      );
      dummy.rotation.set(
        disintegrateT * 4.2,
        disintegrateT * 5.1,
        disintegrateT * 3.4
      );
      dummy.scale.set(
        v.cellW * 0.92 * shrink,
        v.cellH * 0.92 * shrink,
        v.cellW * 0.92 * shrink
      );
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }

    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) {
      meshRef.current.instanceColor.needsUpdate = true;
    }

    if (p >= 1 && !doneRef.current) {
      doneRef.current = true;
      onComplete(project);
    }
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, totalVoxels]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial color="#ffffff" toneMapped={false} />
    </instancedMesh>
  );
}

export default function ManifoldLibrary3D({
  projects,
  selectedProjectId,
  poppedProjectId,
  viewMode = "manifold",
  onChangeViewMode,
  onSelectProject,
  onDiveIntoProject,
  onOpenCreateProject,
  onDeleteProject,
  onUploadProjectVideo,
  onRemoveProjectVideo,
  compact = false,
}: {
  projects: Project[];
  selectedProjectId: string;
  poppedProjectId?: string | null;
  viewMode?: "manifold" | "disc-row";
  onChangeViewMode?: (mode: "manifold" | "disc-row") => void;
  onSelectProject: (p: Project) => void;
  onDiveIntoProject?: (p: Project) => void;
  onOpenCreateProject?: () => void;
  onDeleteProject?: (projectId: string) => void;
  onUploadProjectVideo?: (projectId: string, file: File) => void;
  onRemoveProjectVideo?: (projectId: string, clipId: string) => void;
  compact?: boolean;
}) {
  const activeProject =
    projects.find((p) => p.id === selectedProjectId) || projects[0];

  const [divingProject, setDivingProject] = useState<Project | null>(null);

  // Estado del abanico curvo fijo en modo Vinilos (estilo image.png, posición fija sin rotación 3D de cámara)
  const selectedIndex = Math.max(
    0,
    projects.findIndex((p) => p.id === selectedProjectId)
  );
  const [arcOffset, setArcOffset] = useState<number>(selectedIndex);
  const arcDragRef = useRef<{
    dragging: boolean;
    startY: number;
    startX: number;
    startOff: number;
    moved: boolean;
  }>({
    dragging: false,
    startY: 0,
    startX: 0,
    startOff: 0,
    moved: false,
  });

  useEffect(() => {
    const idx = projects.findIndex((p) => p.id === selectedProjectId);
    if (idx >= 0 && !arcDragRef.current.dragging) {
      setArcOffset(idx);
    }
  }, [selectedProjectId, projects]);

  const handleCubeOrPlateSelect = (proj: Project) => {
    onSelectProject(proj);
    if (onDiveIntoProject) {
      sfx.open();
      if (viewMode === "manifold") {
        setDivingProject(proj);
      } else {
        onDiveIntoProject(proj);
      }
    }
  };

  const stepVinylArc = (dir: -1 | 1) => {
    const nextIdx = Math.max(
      0,
      Math.min(projects.length - 1, Math.round(arcOffset) + dir)
    );
    sfx.tick();
    setArcOffset(nextIdx);
    const targetProj = projects[nextIdx];
    if (targetProj) {
      onSelectProject(targetProj);
    }
  };

  const renderQuickPills = () => (
    <div className="manifold-quick-pills">
      {projects.map((p) => (
        <div
          key={p.id}
          className={`quick-proj-pill-group ${p.id === selectedProjectId ? "on" : ""}`}
        >
          <button
            type="button"
            className={`quick-proj-pill ${p.id === selectedProjectId ? "on" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              sfx.tap();
              const idx = projects.findIndex((item) => item.id === p.id);
              if (idx >= 0) setArcOffset(idx);
              onSelectProject(p);
            }}
          >
            <span className="pill-dot" style={{ background: p.c2 }} />
            <b>{p.title}</b>
          </button>
          {onDeleteProject && projects.length > 1 && (
            <button
              type="button"
              className="pill-trash-btn"
              title={`Eliminar proyecto ${p.title}`}
              aria-label={`Eliminar proyecto ${p.title}`}
              onClick={(e) => {
                e.stopPropagation();
                sfx.tap();
                onDeleteProject(p.id);
              }}
            >
              🗑️
            </button>
          )}
        </div>
      ))}
      {onOpenCreateProject && (
        <button
          type="button"
          className="quick-proj-pill add-project-plus-pill"
          title="Crear nuevo proyecto"
          onClick={(e) => {
            e.stopPropagation();
            sfx.open();
            onOpenCreateProject();
          }}
        >
          +
        </button>
      )}
    </div>
  );

  return (
    <div className={`manifold-3d-wrapper ${compact ? "is-compact" : ""}`}>
      {viewMode === "manifold" ? (
        <div className="manifold-3d-canvas-stage">
          <div className="manifold-stage-overlay-top">
            <div className="manifold-title-and-switch">
              <div className="manifold-overlay-titles">
                <span className="mono-tag">MIS PROYECTOS // BLOQUES</span>
                <h3>Arrastrá para mover · Seleccioná un proyecto</h3>
              </div>

              {/* Switch Bloques / Vinilos justo a la derecha de "Arrastrá para mover" */}
              {onChangeViewMode && (
                <div className="seg-pills inline-view-switch">
                  <button
                    type="button"
                    className={viewMode === "manifold" ? "on" : ""}
                    onClick={(e) => {
                      e.stopPropagation();
                      sfx.tap();
                      onChangeViewMode("manifold");
                    }}
                  >
                    🧊 Bloques
                  </button>
                  <button
                    type="button"
                    className={(viewMode as string) === "disc-row" ? "on" : ""}
                    onClick={(e) => {
                      e.stopPropagation();
                      sfx.tap();
                      onChangeViewMode("disc-row");
                    }}
                  >
                    💿 Vinilos
                  </button>
                </div>
              )}
            </div>

            {renderQuickPills()}
          </div>

          <div className={`manifold-canvas-inner ${divingProject ? "is-diving" : ""}`}>
            <Canvas
              key="manifold-blocks-canvas"
              camera={{ position: [6.8, 6.2, 7.2], fov: 32 }}
              dpr={[1, 1.5]}
              gl={{ antialias: true, powerPreference: "high-performance" }}
            >
              <ResponsiveSceneGroup
                basePosition={[0, 0.15, 0]}
                mobileScale={0.7}
                desktopScale={compact ? 0.88 : 0.94}
              >
                {projects.map((p) => (
                  <ProjectVideoCube
                    key={p.id}
                    project={p}
                    isSelected={p.id === selectedProjectId}
                    isPopped={p.id === poppedProjectId}
                    onSelect={handleCubeOrPlateSelect}
                  />
                ))}

                {divingProject && (
                  <VoxelDivePortal
                    project={divingProject}
                    onComplete={(proj) => {
                      setDivingProject(null);
                      onDiveIntoProject?.(proj);
                    }}
                  />
                )}
              </ResponsiveSceneGroup>

              {!divingProject && (
                <OrbitControls
                  enableZoom={true}
                  minDistance={5.5}
                  maxDistance={15}
                  enablePan={false}
                  rotateSpeed={0.7}
                  minPolarAngle={0.4}
                  maxPolarAngle={1.38}
                />
              )}
            </Canvas>
          </div>
        </div>
      ) : (
        /* ==================== MODO VINILOS: ABANICO CURVO EN ARCO FIJO (ESTILO IMAGE.PNG, SIN ROTAR EN 3D) ==================== */
        <div className="manifold-3d-canvas-stage vinyl-arc-stage">
          <div className="manifold-stage-overlay-top">
            <div className="manifold-title-and-switch">
              <div className="manifold-overlay-titles">
                <span className="mono-tag">MIS PROYECTOS // VINILOS</span>
                <h3>Arrastrá para mover · Seleccioná un proyecto</h3>
              </div>

              {onChangeViewMode && (
                <div className="seg-pills inline-view-switch">
                  <button
                    type="button"
                    className={(viewMode as string) === "manifold" ? "on" : ""}
                    onClick={(e) => {
                      e.stopPropagation();
                      sfx.tap();
                      onChangeViewMode("manifold");
                    }}
                  >
                    🧊 Bloques
                  </button>
                  <button
                    type="button"
                    className={viewMode === "disc-row" ? "on" : ""}
                    onClick={(e) => {
                      e.stopPropagation();
                      sfx.tap();
                      onChangeViewMode("disc-row");
                    }}
                  >
                    💿 Vinilos
                  </button>
                </div>
              )}
            </div>

            {renderQuickPills()}
          </div>

          {/* Abanico Curvo Fijo (idéntico a image.png: arco en C sobre la izquierda con inclinación tangencial y vinilo asomando) */}
          <div
            className="vinyl-fan-arc-viewport"
            onPointerDown={(e) => {
              if ((e.target as HTMLElement).closest(".vinyl-fan-inspector-card, .vinyl-arc-step-controls")) {
                return;
              }
              arcDragRef.current = {
                dragging: true,
                startY: e.clientY,
                startX: e.clientX,
                startOff: arcOffset,
                moved: false,
              };
            }}
            onPointerMove={(e) => {
              if (!arcDragRef.current.dragging) return;
              const dy = e.clientY - arcDragRef.current.startY;
              const dx = e.clientX - arcDragRef.current.startX;
              const primaryDelta = Math.abs(dy) > Math.abs(dx) ? dy : dx;
              if (Math.abs(primaryDelta) > 8) {
                arcDragRef.current.moved = true;
              }
              if (arcDragRef.current.moved) {
                const nextOff = Math.max(
                  0,
                  Math.min(
                    projects.length - 1,
                    arcDragRef.current.startOff - primaryDelta / 85
                  )
                );
                setArcOffset(nextOff);
              }
            }}
            onPointerUp={() => {
              if (!arcDragRef.current.dragging) return;
              const wasMoved = arcDragRef.current.moved;
              arcDragRef.current.dragging = false;
              if (wasMoved) {
                const snapped = Math.max(
                  0,
                  Math.min(projects.length - 1, Math.round(arcOffset))
                );
                setArcOffset(snapped);
                const targetProj = projects[snapped];
                if (targetProj && targetProj.id !== selectedProjectId) {
                  sfx.tick();
                  onSelectProject(targetProj);
                }
              }
            }}
            onPointerLeave={() => {
              if (!arcDragRef.current.dragging) return;
              arcDragRef.current.dragging = false;
              const snapped = Math.max(
                0,
                Math.min(projects.length - 1, Math.round(arcOffset))
              );
              setArcOffset(snapped);
            }}
          >
            {/* Controles rápidos para girar el abanico de vinilos además del drag */}
            <div className="vinyl-arc-step-controls">
              <button
                type="button"
                className="vinyl-step-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  stepVinylArc(-1);
                }}
                disabled={Math.round(arcOffset) <= 0}
                title="Vinilo anterior"
              >
                ▲
              </button>
              <span>
                {Math.min(projects.length, Math.max(1, Math.round(arcOffset) + 1))}/{projects.length}
              </span>
              <button
                type="button"
                className="vinyl-step-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  stepVinylArc(1);
                }}
                disabled={Math.round(arcOffset) >= projects.length - 1}
                title="Siguiente vinilo"
              >
                ▼
              </button>
            </div>

            <div className="vinyl-fan-arc-wheel">
              {projects.map((p, idx) => {
                const delta = idx - arcOffset;
                const absDelta = Math.abs(delta);
                // Ángulo tangencial a lo largo del arco C (como en la imagen de referencia)
                const angleDeg = delta * 17.5;
                const angleRad = (angleDeg * Math.PI) / 180;
                const radiusX = 270;
                const radiusY = 275;

                // En ángulo 0 está más a la derecha; hacia arriba y abajo se curva hacia la izquierda
                const tx = (Math.cos(angleRad) - 1) * radiusX + (absDelta < 0.35 ? 26 : 0);
                const ty = Math.sin(angleRad) * radiusY;
                const rotZ = angleDeg * 0.78;
                const scale = Math.max(0.76, 1 - absDelta * 0.065);
                const zIndex = Math.round(30 - absDelta * 6);
                const isFocused = p.id === selectedProjectId;

                return (
                  <div
                    key={p.id}
                    role="button"
                    tabIndex={0}
                    className={`vinyl-fan-sleeve-card ${isFocused ? "is-focused" : ""}`}
                    style={{
                      transform: `translate3d(${tx.toFixed(1)}px, ${ty.toFixed(1)}px, 0px) rotate(${rotZ.toFixed(2)}deg) scale(${scale.toFixed(3)})`,
                      zIndex,
                      opacity: absDelta > 3.4 ? 0 : Math.max(0.35, 1 - absDelta * 0.16),
                      pointerEvents: absDelta > 3.2 ? "none" : "auto",
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (arcDragRef.current.moved) return;
                      sfx.tap();
                      setArcOffset(idx);
                      onSelectProject(p);
                      // Si ya estaba enfocado o si el usuario hace click para abrirlo, entramos al proyecto
                      if (isFocused && onDiveIntoProject) {
                        sfx.open();
                        onDiveIntoProject(p);
                      }
                    }}
                  >
                    {/* Disco de vinilo real asomando por el borde derecho del sobre */}
                    <div
                      className="vinyl-fan-record-disc"
                      style={{
                        borderColor: p.c2,
                      }}
                    >
                      <div
                        className="vinyl-fan-record-label"
                        style={{
                          background: `radial-gradient(circle, ${p.c2} 0%, ${p.c1} 85%)`,
                        }}
                      >
                        <span className="vinyl-fan-record-hole" />
                      </div>
                    </div>

                    {/* Sobre rectangular redondeado estilo editorial (image.png) */}
                    <div
                      className="vinyl-fan-sleeve-body"
                      style={{
                        background: `linear-gradient(135deg, ${p.c1} 0%, ${p.c2} 135%)`,
                      }}
                    >
                      {/* Lomo tipográfico vertical izquierdo estilo RESONANCE (image.png) */}
                      <div className="vinyl-fan-spine-text">
                        <span>{p.title}</span>
                        <small>
                          {p.artist.toUpperCase()} · {p.type.toUpperCase()} · {p.tracks.length} TRACKS
                        </small>
                      </div>

                      {/* Escudo / emblema central del proyecto */}
                      <div className="vinyl-fan-center-crest">
                        <div className="crest-ring">
                          <strong>{p.tracks[0]?.glyph || "01"}</strong>
                          <small>{p.type}</small>
                        </div>
                      </div>

                      {/* Info inferior derecha */}
                      <div className="vinyl-fan-corner-badge">
                        <b>{p.artist}</b>
                        <span>{isFocused ? "TOCÁ P/ ABRIR →" : p.year}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Panel lateral derecho fijo del proyecto enfocado en el abanico */}
            {activeProject && (
              <div className="vinyl-fan-inspector-card">
                <span className="mono-tag">
                  VINILO SELECCIONADO // {activeProject.type.toUpperCase()} · {activeProject.tracks.length} CANCIONES
                </span>
                <h2>{activeProject.title}</h2>
                <p className="vinyl-fan-artist-line">
                  por <b>{activeProject.artist}</b> · {activeProject.zone}
                </p>
                <p className="vinyl-fan-desc">{activeProject.description}</p>

                {/* Lista rápida de canciones del vinilo para escuchar o entrar directo */}
                <div className="vinyl-fan-quick-tracks">
                  {activeProject.tracks.slice(0, 4).map((tr, i) => (
                    <div key={tr.id} className="vinyl-mini-track-pill">
                      <span>0{i + 1}</span>
                      <b>{tr.title}</b>
                      <small>{tr.duration}</small>
                    </div>
                  ))}
                </div>

                <div className="vinyl-fan-actions">
                  {onDiveIntoProject && (
                    <button
                      type="button"
                      className="apple-btn primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        sfx.open();
                        onDiveIntoProject(activeProject);
                      }}
                    >
                      💿 Entrar al Proyecto ({activeProject.tracks.length} tracks) →
                    </button>
                  )}
                  {onDeleteProject && projects.length > 1 && (
                    <button
                      type="button"
                      className="apple-btn ghost danger-trash-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        sfx.tap();
                        onDeleteProject(activeProject.id);
                      }}
                      title="Eliminar proyecto entero"
                    >
                      🗑️ Eliminar proyecto
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeProject && onUploadProjectVideo && (
        <div className="project-video-folder-bar">
          <div className="video-folder-left">
            <span className="folder-icon">🎞️</span>
            <div>
              <b>Canvas</b>
              <span>Videos 3-5s</span>
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

