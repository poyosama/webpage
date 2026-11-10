"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { type Project, type ProjectVideoClip } from "@/lib/mock";
import { sfx } from "@/lib/sfx";
import "./library-polish.css";

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
      float stripe = step(0.5, fract(uv.y * 5.0 - uTime * 0.45));
      col = mix(uColor1, uColor2, stripe * 0.85);
      vec2 center = vec2(0.5 + 0.22 * sin(uTime * 1.6), 0.54 + 0.18 * cos(uTime * 1.3));
      float d = length(uv - center);
      col = mix(col, vec3(0.06, 0.06, 0.08), smoothstep(0.22, 0.20, d));
    } else if (uMode == 1) {
      float wave = 0.42 + 0.28 * sin(uv.x * 10.0 + uTime * 2.4) * cos(uv.x * 4.0 - uTime);
      col = mix(vec3(0.97, 0.97, 0.96), uColor2, step(uv.y, wave));
      float sun = length(uv - vec2(0.5, 0.72 + 0.06 * sin(uTime * 2.0)));
      col = mix(col, uColor1, smoothstep(0.16, 0.14, sun));
    } else if (uMode == 2) {
      vec2 grid = floor(uv * 6.0);
      float v = sin(grid.x * 1.2 + grid.y * 1.4 + uTime * 3.0);
      col = v > 0.2 ? uColor2 : (v < -0.25 ? vec3(0.96) : uColor1);
    } else {
      float b1 = length(uv - vec2(0.5 + 0.25 * sin(uTime * 1.3), 0.5 + 0.25 * cos(uTime * 1.7)));
      float b2 = length(uv - vec2(0.5 - 0.25 * cos(uTime * 1.5), 0.5 + 0.22 * sin(uTime * 1.1)));
      float m = smoothstep(0.38, 0.12, b1) + smoothstep(0.36, 0.12, b2);
      col = mix(uColor1, uColor2, clamp(m, 0.0, 1.0));
    }

    vec4 overlay = texture2D(uOverlayTex, uv);
    col = mix(col, overlay.rgb, overlay.a);

    gl_FragColor = vec4(col, 1.0);
  }
`;

function createStaticLabelOverlay(projectTitle: string, clipLabel: string, pillTag: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, 256, 256);

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

function getCubePopOffset(project: Project, popFactor: number): THREE.Vector3 {
  const [bx, by, bz] = project.blockPos;
  const dir = new THREE.Vector3(bx, by + 0.5, bz);
  if (dir.lengthSq() < 0.0001) {
    dir.set(0, 0.5, 1);
  }
  dir.normalize();
  return new THREE.Vector3(
    bx + dir.x * popFactor,
    by + dir.y * popFactor,
    bz + dir.z * popFactor
  );
}

// ==================== PARTÍCULAS QUE ABRAZAN EL CLUSTER DE CUBOS ====================
function ClusterEmbraceParticles({
  projects,
  selectedProjectId,
  divingProject,
}: {
  projects: Project[];
  selectedProjectId: string;
  divingProject: Project | null;
}) {
  const pointsRef = useRef<THREE.Points>(null!);
  const matRef = useRef<THREE.PointsMaterial>(null!);
  const count = 16000;

  const circleSprite = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 16;
    c.height = 16;
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(8, 8, 1, 8, 8, 7.5);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.55, "rgba(255,255,255,0.85)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 16, 16);
    const tex = new THREE.CanvasTexture(c);
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    return tex;
  }, []);

  // Semillas inmutables por partícula para calcular su abrazo alrededor de cada cubo o puente entre cubos
  const { positions, colors, seeds } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const sd = new Float32Array(count * 4);

    for (let i = 0; i < count; i++) {
      const ix = i * 3;
      const is = i * 4;
      const u = Math.random() * Math.PI * 2;
      const v = Math.acos(2 * Math.random() - 1);
      const r = 1.4 + Math.random() * 1.8;

      pos[ix] = Math.sin(v) * Math.cos(u) * r;
      pos[ix + 1] = Math.cos(v) * r * 0.75;
      pos[ix + 2] = Math.sin(v) * Math.sin(u) * r;

      // s0: ángulo base, s1: fase vertical, s2: radio de capa de abrazo, s3: tipo (0..0.74 abraza cara/arista de cubo, 0.74..1 puente entre cubos)
      sd[is] = u;
      sd[is + 1] = (Math.random() - 0.5) * 2;
      sd[is + 2] = 0.05 + Math.pow(Math.random(), 1.4) * 0.34;
      sd[is + 3] = Math.random();

      // Partículas oscuras/grafito + destellos cromáticos sutiles para contrastar sobre el escenario claro de Biblioteca
      const shade = 0.06 + (i % 7) * 0.035;
      col[ix] = shade;
      col[ix + 1] = shade;
      col[ix + 2] = shade + 0.04;
    }

    return { positions: pos, colors: col, seeds: sd };
  }, []);

  // Actualizar matices de color cuando cambian los proyectos
  useEffect(() => {
    if (!pointsRef.current) return;
    const geo = pointsRef.current.geometry;
    const colAttr = geo.getAttribute("color") as THREE.BufferAttribute | undefined;
    if (!colAttr) return;
    const arr = colAttr.array as Float32Array;
    const darkInk = new THREE.Color("#0f172a");
    const tmpCol = new THREE.Color();

    for (let i = 0; i < count; i++) {
      const ix = i * 3;
      if (projects.length === 0) {
        arr[ix] = 0.12;
        arr[ix + 1] = 0.13;
        arr[ix + 2] = 0.16;
      } else {
        const proj = projects[i % projects.length];
        const accentCol = tmpCol.set(proj.c2);
        const mixAmt = i % 4 === 0 ? 0.65 : 0.18;
        arr[ix] = THREE.MathUtils.lerp(darkInk.r, accentCol.r, mixAmt);
        arr[ix + 1] = THREE.MathUtils.lerp(darkInk.g, accentCol.g, mixAmt);
        arr[ix + 2] = THREE.MathUtils.lerp(darkInk.b, accentCol.b, mixAmt);
      }
    }
    colAttr.needsUpdate = true;
  }, [projects]);

  useFrame(({ clock, pointer }, dt) => {
    if (!pointsRef.current) return;
    const clampedDt = Math.min(0.033, dt);
    const t = clock.elapsedTime;
    const { eightOhEight } = sfx.sampleReactiveLevels();
    const bassPulse = 1 + eightOhEight * 0.32;

    const geo = pointsRef.current.geometry;
    const posAttr = geo.getAttribute("position") as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;

    const nProj = projects.length;
    const divePos = divingProject ? getCubePopOffset(divingProject, 0.45) : null;

    for (let i = 0; i < count; i++) {
      const ix = i * 3;
      const is = i * 4;
      const angle0 = seeds[is];
      const vBias = seeds[is + 1];
      const shellDist = seeds[is + 2];
      const role = seeds[is + 3];

      let tx = 0;
      let ty = 0;
      let tz = 0;

      if (nProj === 0) {
        // Estado 0 proyectos: anillo levitante suave esperando el primer proyecto
        const orbitA = angle0 + t * 0.28;
        const ringR = (1.35 + shellDist * 2.2) * (1 + 0.08 * Math.sin(t * 1.4 + angle0 * 2));
        tx = Math.cos(orbitA) * ringR;
        ty = vBias * 0.42 + Math.sin(orbitA * 2 + t) * 0.18;
        tz = Math.sin(orbitA) * ringR;
      } else if (role < 0.76 || nProj === 1) {
        // 76% de las partículas ABRAZAN la silueta de cada cubo del cluster (envolviendo sus caras y aristas)
        const pIdx = i % nProj;
        const proj = projects[pIdx];
        const isSel = proj.id === selectedProjectId;
        const popAmt = isSel ? 0.45 : 0;
        const center = getCubePopOffset(proj, popAmt);
        const [w, h, d] = proj.blockSize;

        const speed = isSel ? 0.85 : 0.48;
        const theta = angle0 + t * speed * (i % 2 === 0 ? 1 : -1);
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);

        // Proyección sobre el contorno rectangular del cubo (norma L-infinito suavizada) para que abrace el bloque como un guante
        const maxAxis = Math.max(Math.abs(cosT), Math.abs(sinT), 0.001);
        const boxSignX = cosT / maxAxis;
        const boxSignZ = sinT / maxAxis;

        // Mezcla entre contorno cúbico exacto (0.78) y halo redondeado (0.22) + respiración 808
        const hugTightness = (isSel ? 0.92 : 1.0) * bassPulse;
        const halfW = w * 0.5 + shellDist * hugTightness;
        const halfH = h * 0.5 + shellDist * 0.85 * hugTightness;
        const halfD = d * 0.5 + shellDist * hugTightness;

        const localX = THREE.MathUtils.lerp(cosT, boxSignX, 0.78) * halfW;
        const localZ = THREE.MathUtils.lerp(sinT, boxSignZ, 0.78) * halfD;
        const waveY = Math.sin(theta * 2.0 + t * 1.3 + pIdx) * 0.16;
        const localY = THREE.MathUtils.clamp(vBias + waveY, -1.05, 1.05) * halfH;

        tx = center.x + localX + pointer.x * 0.12;
        ty = center.y + localY + pointer.y * 0.1;
        tz = center.z + localZ;
      } else {
        // 24% de las partículas tejen filamentos magnéticos que conectan y abrazan todo el cluster entre cubo y cubo
        const pIdxA = i % nProj;
        const pIdxB = (pIdxA + 1) % nProj;
        const projA = projects[pIdxA];
        const projB = projects[pIdxB];
        const cA = getCubePopOffset(projA, projA.id === selectedProjectId ? 0.45 : 0);
        const cB = getCubePopOffset(projB, projB.id === selectedProjectId ? 0.45 : 0);

        const flowT = (angle0 / (Math.PI * 2) + t * 0.24) % 1;
        const arcBow = Math.sin(flowT * Math.PI);
        const swirl = angle0 * 3 + t * 1.6;
        const tubeR = (0.14 + shellDist * 0.65) * arcBow;

        tx = THREE.MathUtils.lerp(cA.x, cB.x, flowT) + Math.cos(swirl) * tubeR;
        ty = THREE.MathUtils.lerp(cA.y, cB.y, flowT) + arcBow * 0.38 + Math.sin(swirl) * tubeR;
        tz = THREE.MathUtils.lerp(cA.z, cB.z, flowT) + Math.sin(swirl * 0.7) * tubeR;
      }

      // Si estamos entrando a un cubo, el enjambre se arremolina hacia el portal del cubo elegido
      if (divePos) {
        const swirlA = angle0 + t * 4.5;
        const funnelR = 0.25 + shellDist * 1.9;
        tx = THREE.MathUtils.lerp(tx, divePos.x + Math.cos(swirlA) * funnelR, 0.65);
        ty = THREE.MathUtils.lerp(ty, divePos.y + Math.sin(swirlA) * funnelR, 0.65);
        tz = THREE.MathUtils.lerp(tz, divePos.z + vBias * 0.85, 0.65);
      }

      const damp = 1 - Math.exp(-8.5 * clampedDt);
      arr[ix] += (tx - arr[ix]) * damp;
      arr[ix + 1] += (ty - arr[ix + 1]) * damp;
      arr[ix + 2] += (tz - arr[ix + 2]) * damp;
    }

    posAttr.needsUpdate = true;
    if (matRef.current) {
      matRef.current.size = 0.024 * (1 + eightOhEight * 0.28);
    }
  });

  return (
    <points ref={pointsRef} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        ref={matRef}
        size={0.024}
        map={circleSprite}
        vertexColors
        transparent
        opacity={0.78}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
}

function ProjectVideoCube({
  project,
  isSelected,
  isPopped,
  isDivingThisCube,
  isAnyDiving,
  onSelect,
}: {
  project: Project;
  isSelected: boolean;
  isPopped: boolean;
  isDivingThisCube: boolean;
  isAnyDiving: boolean;
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
  const edgesGeo = useMemo(
    () => new THREE.EdgesGeometry(new THREE.BoxGeometry(w + 0.012, h + 0.012, d + 0.012)),
    [w, h, d]
  );

  useFrame((_, dt) => {
    const popFactor = isPopped ? 0.85 : isSelected ? 0.45 : hovered ? 0.18 : 0;
    const targetPos = getCubePopOffset(project, popFactor);

    const g = groupRef.current;
    g.position.x = THREE.MathUtils.damp(g.position.x, targetPos.x, 10, dt);
    g.position.y = THREE.MathUtils.damp(g.position.y, targetPos.y, 10, dt);
    g.position.z = THREE.MathUtils.damp(g.position.z, targetPos.z, 10, dt);

    const targetScale = isAnyDiving && !isDivingThisCube
      ? 0.84
      : isPopped
        ? 1.1
        : isSelected
          ? 1.04
          : hovered
            ? 1.015
            : 1;
    const s = THREE.MathUtils.damp(g.scale.x, targetScale, 10, dt);
    g.scale.setScalar(s);
  });

  // Cuando este cubo entra en modo portal voxel, ocultamos el mesh sólido para que su cascada volumétrica de micro-vóxeles tome el relevo sin costuras
  return (
    <group
      ref={groupRef}
      position={project.blockPos}
      visible={!isDivingThisCube}
      onPointerOver={(e) => {
        e.stopPropagation();
        if (isAnyDiving) return;
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
        if (isAnyDiving) return;
        sfx.press();
      }}
      onPointerUp={(e) => {
        e.stopPropagation();
        if (isAnyDiving) return;
        sfx.release();
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (isAnyDiving) return;
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

// ==================== PORTAL DE INMERSIÓN AL CUBO (MICRO-VÓXELES CRISTALINOS + APERTURA DE IRIS + CÁMARA DOLLY) ====================
function VoxelDivePortal({
  project,
  onProgress,
  onComplete,
}: {
  project: Project;
  onProgress: (p: number) => void;
  onComplete: (p: Project) => void;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null!);
  const progressRef = useRef(0);
  const doneRef = useRef(false);
  const { camera } = useThree();

  const startCamPos = useMemo(() => camera.position.clone(), [camera]);
  const cubeCenter = useMemo(() => getCubePopOffset(project, 0.45), [project]);

  // Vector normal desde el centro del cubo hacia la cámara para abrir el túnel de entrada justo de frente a la mirada del usuario
  const { forward, right, up } = useMemo(() => {
    const fwd = startCamPos.clone().sub(cubeCenter).normalize();
    const worldUp = new THREE.Vector3(0, 1, 0);
    const rgt = new THREE.Vector3().crossVectors(worldUp, fwd).normalize();
    const u = new THREE.Vector3().crossVectors(fwd, rgt).normalize();
    return { forward: fwd, right: rgt, up: u };
  }, [startCamPos, cubeCenter]);

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const colorObj = useMemo(() => new THREE.Color(), []);

  // Construimos las 6 caras completas del cubo en micro-vóxeles de alta precisión (12x12 por cara = 864 micro-cubos)
  const { voxels, totalVoxels } = useMemo(() => {
    const [w, h, d] = project.blockSize;
    const N = 12;
    const list: {
      localPos: THREE.Vector3;
      size: [number, number, number];
      radialDist: number;
      angle: number;
      isFront: boolean;
      delay: number;
      spinSign: number;
      colorMix: number;
    }[] = [];

    const cellW = w / N;
    const cellH = h / N;
    const cellD = d / N;

    for (let face = 0; face < 6; face++) {
      for (let ix = 0; ix < N; ix++) {
        for (let iy = 0; iy < N; iy++) {
          const u = (ix + 0.5) / N - 0.5;
          const v = (iy + 0.5) / N - 0.5;
          const pos = new THREE.Vector3();
          let sx = cellW;
          let sy = cellH;
          let sz = cellD;

          if (face === 0) {
            pos.set(u * w, v * h, d * 0.5 - cellD * 0.5);
          } else if (face === 1) {
            pos.set(u * w, v * h, -d * 0.5 + cellD * 0.5);
          } else if (face === 2) {
            pos.set(w * 0.5 - cellW * 0.5, v * h, u * d);
          } else if (face === 3) {
            pos.set(-w * 0.5 + cellW * 0.5, v * h, u * d);
          } else if (face === 4) {
            pos.set(u * w, h * 0.5 - cellH * 0.5, v * d);
          } else {
            pos.set(u * w, -h * 0.5 + cellH * 0.5, v * d);
          }

          // Proyectar sobre el plano perpendicular a la cámara para abrir un túnel cilíndrico perfecto hacia el interior del cubo
          const projRight = pos.dot(right);
          const projUp = pos.dot(up);
          const projFwd = pos.dot(forward);
          const radialDist = Math.hypot(projRight, projUp);
          const angle = Math.atan2(projUp, projRight);
          const isFront = projFwd > 0.15;

          const normR = Math.min(1, radialDist / (Math.max(w, h) * 0.65));
          const delay = isFront ? normR * 0.22 : 0.14 + normR * 0.24;

          list.push({
            localPos: pos,
            size: [sx * 0.96, sy * 0.96, sz * 0.96],
            radialDist,
            angle,
            isFront,
            delay,
            spinSign: (ix + iy + face) % 2 === 0 ? 1 : -1,
            colorMix: ((ix * 3 + iy * 5 + face) % 10) / 10,
          });
        }
      }
    }

    return { voxels: list, totalVoxels: list.length };
  }, [project.blockSize, right, up, forward]);

  useFrame((_, dt) => {
    if (doneRef.current) return;
    // Duración total ~0.88s: súper fluida, cinematográfica y sin cortes bruscos
    progressRef.current = Math.min(1, progressRef.current + Math.min(0.035, dt) * 1.16);
    const p = progressRef.current;
    onProgress(p);

    // Curva suave quintic easeInOut para el viaje de la cámara hacia el corazón del cubo
    const camT =
      p < 0.5 ? 16 * p * p * p * p * p : 1 - Math.pow(-2 * p + 2, 5) / 2;

    // La cámara se alinea con la normal del cubo y atraviesa limpiamente el portal hacia el centro
    const entryPoint = cubeCenter.clone().addScaledVector(forward, 0.18);
    camera.position.lerpVectors(startCamPos, entryPoint, camT);
    camera.lookAt(cubeCenter);

    const col1 = new THREE.Color(project.c1);
    const col2 = new THREE.Color(project.c2);
    const pureWhite = new THREE.Color("#ffffff");

    for (let i = 0; i < totalVoxels; i++) {
      const v = voxels[i];
      const localT = THREE.MathUtils.clamp((p - v.delay) / (1 - v.delay), 0, 1);

      // Fase 1 (0 -> 0.32): Ignición cristalina — cada micro-vóxel pasa del color del cubo a BLANCO PURO (#ffffff)
      const whitePhase = THREE.MathUtils.smoothstep(localT, 0.0, 0.3);
      colorObj.copy(col1).lerp(col2, v.colorMix).lerp(pureWhite, whitePhase);
      meshRef.current.setColorAt(i, colorObj);

      // Fase 2 (0.14 -> 1.0): Apertura de Iris + Túnel Vórtice alrededor de la lente de la cámara
      const openT = THREE.MathUtils.smoothstep(localT, 0.12, 0.96);
      const irisExpand = openT * openT * (v.isFront ? 1.85 : 1.15);
      const swirlAngle = v.angle + openT * 1.15 * v.spinSign;

      const outRight = Math.cos(swirlAngle) * irisExpand;
      const outUp = Math.sin(swirlAngle) * irisExpand;
      const streamTowardCam = v.isFront
        ? openT * openT * 1.65
        : openT * 0.45;

      const wx =
        cubeCenter.x +
        v.localPos.x +
        right.x * outRight +
        up.x * outUp +
        forward.x * streamTowardCam;
      const wy =
        cubeCenter.y +
        v.localPos.y +
        right.y * outRight +
        up.y * outUp +
        forward.y * streamTowardCam;
      const wz =
        cubeCenter.z +
        v.localPos.z +
        right.z * outRight +
        up.z * outUp +
        forward.z * streamTowardCam;

      dummy.position.set(wx, wy, wz);
      dummy.rotation.set(
        openT * 2.2 * v.spinSign,
        openT * 2.8,
        openT * 1.9 * v.spinSign
      );

      // Ligero pulso al encenderse en blanco y luego estilización en pequeños vóxeles blancos
      const pulse = 1 + Math.sin(Math.min(1, localT * 2.5) * Math.PI) * 0.14;
      const shrink = Math.max(0.001, (1 - Math.pow(openT, 1.65)) * pulse);
      dummy.scale.set(
        v.size[0] * shrink,
        v.size[1] * shrink,
        v.size[2] * shrink
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
  onUploadProjectTrack,
  onUpdateProjectCover,
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
  onUploadProjectTrack?: (projectId: string, file: File) => void;
  onUpdateProjectCover?: (projectId: string, newCoverUrl: string) => void;
  compact?: boolean;
}) {
  const activeProject =
    projects.find((p) => p.id === selectedProjectId) || projects[0] || null;

  const [divingProject, setDivingProject] = useState<Project | null>(null);
  const [diveProgress, setDiveProgress] = useState<number>(0);

  const selectedIndex = Math.max(
    0,
    projects.findIndex((p) => p.id === selectedProjectId)
  );
  const [arcOffset, setArcOffset] = useState<number>(selectedIndex);
  const [confirmDeleteProjectId, setConfirmDeleteProjectId] = useState<string | null>(null);

  useEffect(() => {
    if (confirmDeleteProjectId) {
      const timer = setTimeout(() => setConfirmDeleteProjectId(null), 3500);
      return () => clearTimeout(timer);
    }
  }, [confirmDeleteProjectId]);

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
        setDiveProgress(0);
        setDivingProject(proj);
      } else {
        onDiveIntoProject(proj);
      }
    }
  };

  const stepVinylArc = (dir: -1 | 1) => {
    if (projects.length === 0) return;
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
          {onDeleteProject && (
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
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
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

  // Opacidad del bloom blanco final cuando la cámara atraviesa el núcleo de micro-vóxeles blancos
  const bloomOpacity = divingProject
    ? THREE.MathUtils.smoothstep(diveProgress, 0.64, 0.96)
    : 0;

  return (
    <div className={`manifold-3d-wrapper ${compact ? "is-compact" : ""}`}>
      {/* ==================== MODO VINILOS 3D: COLECCIÓN EN ARCO FIJO ==================== */}
      <div className="manifold-3d-canvas-stage vinyl-arc-stage">
        <div className="manifold-stage-overlay-top">
          <div className="manifold-title-and-switch">
            <div className="manifold-overlay-titles">
              <span className="mono-tag">MIS PROYECTOS // VINILOS 3D</span>
              <h3>Arrastrá para mover · Seleccioná un vinilo</h3>
            </div>
          </div>

          {renderQuickPills()}
        </div>

          {projects.length === 0 ? (
            <div className="vinyl-fan-arc-viewport">
              <div
                className="manifold-empty-cluster-overlay"
                style={{
                  position: "relative",
                  inset: "auto",
                  transform: "none",
                  margin: "0 auto",
                  gridColumn: "1 / -1",
                  pointerEvents: "auto",
                  zIndex: 20,
                }}
              >
                <span className="mono-tag">0 PROYECTOS // 0 VINILOS</span>
                <h4>Todavía no cargaste ningún vinilo</h4>
                <p>
                  Tocá el botón <b>+</b> para crear tu primer proyecto.
                </p>
                {onOpenCreateProject && (
                  <button
                    type="button"
                    className="apple-btn primary"
                    style={{ pointerEvents: "auto", cursor: "pointer" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      sfx.open();
                      onOpenCreateProject();
                    }}
                  >
                    + Crear mi primer Proyecto →
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div
              className="vinyl-fan-arc-viewport"
              onWheel={(e) => {
                if (projects.length <= 1) return;
                if (Math.abs(e.deltaY) > 12) {
                  stepVinylArc(e.deltaY > 0 ? 1 : -1);
                }
              }}
              onPointerDown={(e) => {
                if (
                  (e.target as HTMLElement).closest(
                    ".vinyl-fan-inspector-card, .vinyl-arc-step-controls, .vinyl-fan-sleeve-card"
                  )
                ) {
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
                <span className="vinyl-step-counter">
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
                  const angleDeg = delta * 17.5;
                  const angleRad = (angleDeg * Math.PI) / 180;
                  const radiusX = 270;
                  const radiusY = 275;

                  const tx =
                    (Math.cos(angleRad) - 1) * radiusX + (absDelta < 0.35 ? 26 : 0);
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
                        sfx.tap();
                        setArcOffset(idx);
                        onSelectProject(p);
                        if (onDiveIntoProject) {
                          sfx.open();
                          onDiveIntoProject(p);
                        }
                      }}
                    >
                      <div
                        className="vinyl-fan-record-disc"
                        style={{
                          borderColor: p.c2,
                        }}
                      >
                        <div
                          className="vinyl-fan-record-label"
                          style={{
                            background: p.coverUrl
                              ? `url(${p.coverUrl}) center / cover no-repeat`
                              : `radial-gradient(circle, ${p.c2} 0%, ${p.c1} 85%)`,
                          }}
                        >
                          <span className="vinyl-fan-record-hole" />
                        </div>
                      </div>

                      <div
                        className="vinyl-fan-sleeve-body"
                        style={{
                          background: p.coverUrl
                            ? `linear-gradient(180deg, rgba(10,10,14,0.68) 0%, rgba(10,10,14,0.22) 48%, rgba(10,10,14,0.82) 100%), url(${p.coverUrl}) center / cover no-repeat`
                            : `linear-gradient(135deg, ${p.c1} 0%, ${p.c2} 135%)`,
                        }}
                      >
                        <div className="vinyl-fan-spine-text">
                          <span>{p.title}</span>
                          <small>
                            {p.artist.toUpperCase()} · {p.type.toUpperCase()} · {p.tracks.length} TRACKS
                          </small>
                        </div>

                        <div className="vinyl-fan-center-crest">
                          <div className="crest-ring">
                            <strong>{p.tracks[0]?.glyph || "01"}</strong>
                            <small>{p.type}</small>
                          </div>
                        </div>

                        <div className="vinyl-fan-corner-badge">
                          <b>{p.artist}</b>
                          <span>{isFocused ? "TOCÁ P/ ABRIR →" : p.year}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {activeProject && (
                <div
                  className="vinyl-fan-inspector-card is-clickable-card"
                  role="button"
                  tabIndex={0}
                  title={`Abrir ${activeProject.title}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onDiveIntoProject) {
                      sfx.open();
                      onDiveIntoProject(activeProject);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      if (onDiveIntoProject) {
                        sfx.open();
                        onDiveIntoProject(activeProject);
                      }
                    }
                  }}
                >
                  <span className="mono-tag">
                    {activeProject.type.toUpperCase()} · {activeProject.tracks.length}{" "}
                    {activeProject.tracks.length === 1 ? "TRACK" : "TRACKS"}
                  </span>
                  <h2>{activeProject.title}</h2>
                  <p className="vinyl-fan-artist-line">
                    por <b>{activeProject.artist}</b>
                    {activeProject.zone ? ` · ${activeProject.zone}` : ""}
                  </p>
                  {activeProject.description && (
                    <p className="vinyl-fan-desc">{activeProject.description}</p>
                  )}

                  <div className="vinyl-fan-quick-tracks">
                    {activeProject.tracks.slice(0, 4).map((tr, i) => (
                      <div key={tr.id} className="vinyl-mini-track-pill">
                        <span>0{i + 1} · </span>
                        <b>{tr.title}</b>
                      </div>
                    ))}
                  </div>

                  <div
                    className="vinyl-fan-actions"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {onUpdateProjectCover && (
                      <label
                        className="apple-btn ghost"
                        style={{ cursor: "pointer" }}
                        title="Cambiar la tapa / portada del proyecto"
                      >
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                          Cambiar portada
                        </span>
                        <input
                          type="file"
                          accept="image/*,image/gif"
                          hidden
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              sfx.drop();
                              const url = URL.createObjectURL(file);
                              onUpdateProjectCover(activeProject.id, url);
                              e.target.value = "";
                            }
                          }}
                        />
                      </label>
                    )}
                    {onDeleteProject && (
                      <button
                        type="button"
                        className={`trash-icon-btn ${confirmDeleteProjectId === activeProject.id ? "confirm-delete-active" : ""}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          sfx.tap();
                          if (confirmDeleteProjectId === activeProject.id) {
                            onDeleteProject(activeProject.id);
                            setConfirmDeleteProjectId(null);
                          } else {
                            setConfirmDeleteProjectId(activeProject.id);
                          }
                        }}
                        title={
                          confirmDeleteProjectId === activeProject.id
                            ? "¿Confirmar eliminación? Tocá de nuevo para borrar"
                            : "Eliminar proyecto"
                        }
                        aria-label="Eliminar proyecto"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

      {activeProject && onUploadProjectVideo && (
        <div className="project-video-folder-bar">
          <div className="video-folder-left">
            <span className="folder-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/></svg>
            </span>
            <div>
              <b>Canva</b>
            </div>
          </div>

          <div className="video-folder-clips">
            {activeProject.videos.map((v) => (
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
            ))}
          </div>

          {onUploadProjectTrack && (
            <label className="apple-btn ghost upload-video-btn" onMouseEnter={() => sfx.hover()}>
              <span>+ Subir WAV / MP3 al bloque</span>
              <input
                type="file"
                accept=".wav,.mp3,.m4a,.flac,.aac,.ogg,.aiff,.alac,.opus,audio/wav,audio/x-wav,audio/wave,audio/mpeg,audio/mp3,audio/mp4,audio/x-m4a,audio/aac,audio/flac,application/octet-stream"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    sfx.drop();
                    onUploadProjectTrack(activeProject.id, file);
                    e.target.value = "";
                  }
                }}
              />
            </label>
          )}

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
                  // Si el usuario en iPhone seleccionó un audio en este botón, lo mandamos a track
                  if (
                    onUploadProjectTrack &&
                    (file.type.startsWith("audio/") || /\.(wav|mp3|m4a|flac|aac|ogg|aiff|alac)$/i.test(file.name))
                  ) {
                    onUploadProjectTrack(activeProject.id, file);
                  } else if (onUploadProjectVideo) {
                    onUploadProjectVideo(activeProject.id, file);
                  }
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
