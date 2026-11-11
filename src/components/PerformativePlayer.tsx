"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { type Project, type ProjectVideoClip, type Track } from "@/lib/mock";
import { sfx } from "@/lib/sfx";
import TrackStudioEditModal from "./TrackStudioEditModal";

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
  // Duplicamos a 36.000 partículas y las hacemos 50% más pequeñas con sprite liviano 16x16 sin mipmaps para 0 lag
  const count = 36000;
  const lastImpulseRef = useRef(0);
  const dispRef = useRef(0);
  const velRef = useRef(0);

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
          // En modo claro (fondo marfil/blanco), convertimos colores claros a tinta profunda
          if (lum > 0.55) return new THREE.Color(fallbackDark);
        } else {
          // En modo oscuro (fondo negro), aclaramos si se pierde en la oscuridad
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
      // Forma procedural según la seed (tocá el fondo para cambiarla, como en la landing)
      const shape = ((seed % 4) + 4) % 4;
      const f = i / count;
      const jit = () => (Math.random() - 0.5) * 0.24;
      let hx: number, hy: number, hz: number;
      if (shape === 1) {
        // Nudo toroidal trefoil
        const tt = f * Math.PI * 2 * 6 + stream * 0.05;
        hx = (Math.sin(tt) + 2 * Math.sin(2 * tt)) * 0.62 + jit();
        hy = (Math.cos(tt) - 2 * Math.cos(2 * tt)) * 0.62 + jit();
        hz = -Math.sin(3 * tt) * 1.1 + jit();
      } else if (shape === 2) {
        // Doble hélice ADN
        const a = f * Math.PI * 2 * 7 + (i % 2) * Math.PI;
        hx = Math.cos(a) * 1.35 + jit();
        hz = Math.sin(a) * 1.35 + jit();
        hy = (f * 2 - 1) * 2.5 + jit();
      } else if (shape === 3) {
        // Esfera armónica (Fibonacci)
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

      // Vector de explosión/latido 808 para que salten para todos lados y vuelvan a su posición exacta
      const len = Math.hypot(hx, hy, hz) || 1;
      const rx = hx / len + (Math.random() - 0.5) * 1.35;
      const ry = hy / len + (Math.random() - 0.5) * 1.35;
      const rz = hz / len + (Math.random() - 0.5) * 1.35;
      const rLen = Math.hypot(rx, ry, rz) || 1;
      // Magnitud controlada por partícula para que el estallido del 808 sea armónico y elegante
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

  const targetRef = useRef(0);

  useFrame(({ clock, pointer, size }, dt) => {
    // En celular el latido se atenúa para mantener elegancia visual
    const mobileScale = size.width <= 720 ? 0.38 : 1;
    // Señal pura de 808 (< 90Hz filtrada por hardware low-pass + detector de golpe sub-grave)
    const { eightOhEight } = sfx.sampleReactiveLevels();
    const clampedDt = Math.min(0.033, dt);
    const t = clock.elapsedTime;

    // Click del usuario: mini pulso manual suave
    if (impulseSignal !== lastImpulseRef.current) {
      lastImpulseRef.current = impulseSignal;
      targetRef.current = Math.max(targetRef.current, 0.22 * mobileScale);
    }

    // Respuesta musical calibrada a los 808: pulso controlado que no dispersa caóticamente
    const MAX_DISP = 0.34 * mobileScale;
    const hitTarget = Math.pow(eightOhEight, 0.9) * MAX_DISP;
    if (hitTarget > targetRef.current) targetRef.current = hitTarget;
    // Decay elástico entre golpes de 808
    targetRef.current *= Math.exp(-clampedDt * 9.5);
    if (targetRef.current < 0.002) targetRef.current = 0;

    // Suavizado attack rápido / retorno elástico limpio
    const cur = dispRef.current;
    const k = targetRef.current > cur ? 30 : 12;
    let next = cur + (targetRef.current - cur) * Math.min(1, clampedDt * k);
    if (targetRef.current === 0 && next < 0.003) next = 0;
    dispRef.current = next;
    velRef.current = 0;

    const pulseDisp = dispRef.current;
    if (matRef.current) {
      const baseSize = isDarkStage ? 0.024 : 0.030;
      matRef.current.size = baseSize * (1 + pulseDisp * 0.28 * mobileScale);
    }

    const geo = pointsRef.current.geometry;
    const attr = geo.getAttribute("position") as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;

    // Movimiento orgánico armónico sin divergencias numéricas ni saltos aleatorios
    const waveT = t * 0.55;
    for (let i = 0; i < count; i++) {
      const ix = i * 3;
      const hx = homePositions[ix];
      const hy = homePositions[ix + 1];
      const hz = homePositions[ix + 2];
      const phi = phases[i];

      // Ondulación armónica sutil sobre la posición madre fija
      const wave = Math.sin(waveT + phi) * 0.016;

      // Posición = Posición madre + Ondulación + Expansión pura de 808
      arr[ix] = hx + scatterDirs[ix] * pulseDisp + wave * 0.5;
      arr[ix + 1] = hy + scatterDirs[ix + 1] * pulseDisp + wave;
      arr[ix + 2] = hz + scatterDirs[ix + 2] * pulseDisp + wave * 0.35;
    }
    attr.needsUpdate = true;

    // Rotación suave continua y fluida del enjambre 3D
    pointsRef.current.rotation.y += clampedDt * 0.035;
    pointsRef.current.rotation.x = Math.sin(t * 0.1) * 0.025 - pointer.y * 0.05;
    pointsRef.current.rotation.z = pointer.x * 0.04;
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

// 2. FERROFLUIDO 3D ESCULTABLE HD CON PARTÍCULAS EN LA SUPERFICIE (SALTO 808 Y RETORNO ELÁSTICO)
function SculptableFerrofluid({
  accent,
  c2,
  isDarkStage = true,
  impulseSignal = 0,
}: {
  accent: string;
  c2: string;
  isDarkStage?: boolean;
  impulseSignal?: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const pointsRef = useRef<THREE.Points>(null!);
  const pointsMatRef = useRef<THREE.PointsMaterial>(null!);
  const lastImpulseRef = useRef(0);
  const jumpDispRef = useRef(0);
  const targetJumpRef = useRef(0);

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

  // Sprite circular suave 32x32 para las partículas de la superficie
  const particleSprite = useMemo(() => {
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

  // 8.200 micro-gotas / partículas magnéticas ancladas a la piel del ferrofluido
  const particlesCount = 8200;

  const { baseDirs, scatterDirs, colors } = useMemo(() => {
    const baseD = new Float32Array(particlesCount * 3);
    const scatD = new Float32Array(particlesCount * 3);
    const col = new Float32Array(particlesCount * 3);

    const cA = new THREE.Color(accent);
    const cB = new THREE.Color(c2);
    const cHighlight = new THREE.Color(isDarkStage ? "#ffffff" : "#09090b");
    const cSecondary = new THREE.Color(isDarkStage ? "#bae6fd" : "#27272a");

    const phi = Math.PI * (Math.sqrt(5) - 1); // golden ratio para distribución uniforme en esfera (Fibonacci)

    for (let i = 0; i < particlesCount; i++) {
      const ix = i * 3;
      const y = 1 - (i / (particlesCount - 1)) * 2;
      const radiusAtY = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = phi * i;

      const x = Math.cos(theta) * radiusAtY;
      const z = Math.sin(theta) * radiusAtY;

      baseD[ix] = x;
      baseD[ix + 1] = y;
      baseD[ix + 2] = z;

      // Vector de salto hacia afuera (radial normal + pequeña dispersión estocástica orgánica)
      const spread = 0.28;
      const rx = x + (Math.random() - 0.5) * spread;
      const ry = y + (Math.random() - 0.5) * spread;
      const rz = z + (Math.random() - 0.5) * spread;
      const rLen = Math.hypot(rx, ry, rz) || 1;
      const burstPower = 0.52 + Math.pow(Math.random(), 0.72) * 1.5;

      scatD[ix] = (rx / rLen) * burstPower;
      scatD[ix + 1] = (ry / rLen) * burstPower;
      scatD[ix + 2] = (rz / rLen) * burstPower;

      // Colores de partículas: en modo oscuro destellos blancos/cian/accent, en modo claro perlas de tinta oscura
      let chosen: THREE.Color;
      const mod = i % 4;
      if (mod === 0) chosen = cHighlight;
      else if (mod === 1) chosen = isDarkStage ? cA : new THREE.Color("#09090b");
      else if (mod === 2) chosen = isDarkStage ? cB : new THREE.Color("#18181b");
      else chosen = isDarkStage ? cSecondary : new THREE.Color("#27272a");

      col[ix] = chosen.r;
      col[ix + 1] = chosen.g;
      col[ix + 2] = chosen.b;
    }

    return {
      baseDirs: baseD,
      scatterDirs: scatD,
      colors: col,
    };
  }, [accent, c2, isDarkStage]);

  const renderPositions = useMemo(() => {
    const pos = new Float32Array(particlesCount * 3);
    for (let i = 0; i < particlesCount; i++) {
      const ix = i * 3;
      pos[ix] = baseDirs[ix] * 0.965;
      pos[ix + 1] = baseDirs[ix + 1] * 0.965;
      pos[ix + 2] = baseDirs[ix + 2] * 0.965;
    }
    return pos;
  }, [baseDirs]);

  useFrame(({ clock }, dt) => {
    const { beat, bass, eightOhEight } = sfx.sampleReactiveLevels();
    const clampedDt = Math.min(0.033, dt);
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

    // === REACCIÓN DE SALTO Y RETORNO ELÁSTICO DE LAS PARTÍCULAS EN LA SUPERFICIE ===
    const MAX_JUMP = 1.35;
    const hitTarget = Math.max(
      Math.pow(eightOhEight || 0, 0.8) * MAX_JUMP,
      Math.pow(bass || 0, 0.85) * 1.15
    );

    // Impulso manual al clickear la pantalla
    if (impulseSignal !== lastImpulseRef.current) {
      lastImpulseRef.current = impulseSignal;
      targetJumpRef.current = Math.max(targetJumpRef.current, 0.85);
    }

    if (hitTarget > targetJumpRef.current) targetJumpRef.current = hitTarget;
    // Decaimiento elástico: regresan suave y limpiamente a su posición base en la piel
    targetJumpRef.current *= Math.exp(-clampedDt * 8.2);
    if (targetJumpRef.current < 0.002) targetJumpRef.current = 0;

    const cur = jumpDispRef.current;
    const k = targetJumpRef.current > cur ? 36 : 11;
    let next = cur + (targetJumpRef.current - cur) * Math.min(1, clampedDt * k);
    if (targetJumpRef.current === 0 && next < 0.002) next = 0;
    jumpDispRef.current = next;

    const jumpDisp = jumpDispRef.current;

    if (pointsMatRef.current) {
      const baseSize = isDarkStage ? 0.022 : 0.028;
      pointsMatRef.current.size = baseSize * (1 + jumpDisp * 0.55);
    }

    if (pointsRef.current) {
      const geo = pointsRef.current.geometry;
      const posAttr = geo.getAttribute("position") as THREE.BufferAttribute;
      const arr = posAttr.array as Float32Array;

      const spikeAmp = 0.18 + bass * 0.35 + beat * 0.16;
      const hStr = uniformsRef.current.uHoverStrength.value;
      const hDir = uniformsRef.current.uHoverDir.value;
      const baseR = 0.965;

      for (let i = 0; i < particlesCount; i++) {
        const ix = i * 3;
        const bx = baseDirs[ix];
        const by = baseDirs[ix + 1];
        const bz = baseDirs[ix + 2];

        // Misma función de onda matemática que el vertex shader para abrazar la piel líquida
        const n =
          Math.sin(bx * 4.2 + t * 2.4) *
          Math.cos(by * 4.2 - t * 2.0) *
          Math.sin(bz * 4.2 + t * 1.7);
        let s = 1.0 + n * spikeAmp;

        if (hStr > 0.005) {
          const dotVal = bx * hDir.x + by * hDir.y + bz * hDir.z;
          if (dotVal > 0.6) {
            s += (dotVal - 0.6) * 0.55 * hStr;
          }
        }

        // Posición de reposo exactamente sobre la superficie ondulante del ferrofluido
        const surfX = bx * baseR * s;
        const surfY = by * baseR * s;
        const surfZ = bz * baseR * s;

        // Salto hacia afuera en cada golpe de 808 / bass y retorno limpio a la superficie
        arr[ix] = surfX + scatterDirs[ix] * jumpDisp;
        arr[ix + 1] = surfY + scatterDirs[ix + 1] * jumpDisp;
        arr[ix + 2] = surfZ + scatterDirs[ix + 2] * jumpDisp;
      }

      posAttr.needsUpdate = true;
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
      <points ref={pointsRef} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[renderPositions, 3]} />
          <bufferAttribute attach="attributes-color" args={[colors, 3]} />
        </bufferGeometry>
        <pointsMaterial
          ref={pointsMatRef}
          map={particleSprite}
          size={isDarkStage ? 0.022 : 0.028}
          vertexColors
          transparent
          alphaTest={0.02}
          opacity={isDarkStage ? 0.95 : 0.92}
          sizeAttenuation
          depthWrite={false}
        />
      </points>
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
  onSaveTrack?: (updatedTrack: Track, updatedClip?: ProjectVideoClip) => void;
  theme?: "dark" | "light";
  onToggleTheme?: () => void;
}) {
  // Default en "boids" (36K Partículas con reacción 808) como pidió Juani
  const [mode, setMode] = useState<VisualMode>("boids");
  const [snippetClean, setSnippetClean] = useState(false);
  const [darkStage, setDarkStage] = useState(theme ? theme === "dark" : true);
  const [studioModalOpen, setStudioModalOpen] = useState(false);

  useEffect(() => {
    sfx.initTrackModifiers(track.pitchShift ?? 0, track.tempoMultiplier ?? 1.0);
  }, [track.id, track.pitchShift, track.tempoMultiplier]);

  useEffect(() => {
    if (theme) {
      setDarkStage(theme === "dark");
    }
  }, [theme]);
  const [cinemaMode, setCinemaMode] = useState(true);
  const [impulseSignal, setImpulseSignal] = useState(0);
  const [seed, setSeed] = useState(0);
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
    const id = window.setInterval(() => {
      const st = sfx.getPlaybackState();
      setCurrentSec(st.currentSec);
      setDurationSec(st.durationSec || track.durationSec || 174);
    }, 120);
    return () => clearInterval(id);
  }, [track.durationSec]);

  const progressPct = durationSec > 0 ? Math.min(100, (currentSec / durationSec) * 100) : 0;
  const isLiked = likedTrackIds.includes(track.id);
  const isStandby = track.id === "standby-track";

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

  const isDarkStage = darkStage;

  return (
    <div
      className={`perf-player font-skin-sf ${
        isDarkStage ? "stage-dark" : "stage-light"
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
                key={`${activeCanvasClip.url}-${track.videoTrimStart}-${track.videoTrimEnd}`}
                src={activeCanvasClip.url}
                className="perf-cinema-media"
                autoPlay
                loop
                muted
                playsInline
                disablePictureInPicture
                onLoadedMetadata={(e) => {
                  const tStart = track.videoTrimStart ?? activeCanvasClip?.trimStartSec ?? 0;
                  if (tStart > 0) e.currentTarget.currentTime = tStart;
                  e.currentTarget.play().catch(() => {});
                }}
                onTimeUpdate={(e) => {
                  const tStart = track.videoTrimStart ?? activeCanvasClip?.trimStartSec ?? 0;
                  const tEnd = track.videoTrimEnd ?? activeCanvasClip?.trimEndSec;
                  if (tEnd && tEnd > tStart && e.currentTarget.currentTime >= tEnd) {
                    e.currentTarget.currentTime = tStart;
                  } else if (e.currentTarget.currentTime < tStart) {
                    e.currentTarget.currentTime = tStart;
                  }
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
          setImpulseSignal((n) => n + 1);
          if (mode === "boids") {
            setSeed((n) => n + 1);
          }
          sfx.tap();
        }}
      >
        <Canvas
          camera={{ position: [0, 0, 5.2], fov: 42 }}
          dpr={mode === "boids" ? [1, 1.25] : [1, 1.5]}
          gl={{ alpha: true, antialias: mode !== "boids", powerPreference: "high-performance" }}
        >
          <ambientLight intensity={isDarkStage ? 1.15 : 1.7} />
          <directionalLight position={[4, 6, 5]} intensity={isDarkStage ? 1.85 : 2.4} />
          <pointLight position={[-4, -3, 3]} color={isDarkStage ? track.c2 : "#27272a"} intensity={isDarkStage ? 6 : 4} />

          {mode === "boids" && (
            <HighResFlowParticles
              accent={track.accent}
              c2={track.c2}
              impulseSignal={impulseSignal}
              seed={seed}
              isDarkStage={isDarkStage}
            />
          )}
          {mode === "ferro" && (
            <SculptableFerrofluid
              accent={track.accent}
              c2={track.c2}
              isDarkStage={isDarkStage}
              impulseSignal={impulseSignal}
            />
          )}
        </Canvas>
      </div>

      {/* Top HUD — Apple Music / iOS Liquid Glass */}
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
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
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
              sfx.open();
              setStudioModalOpen(true);
            }}
            title={`Editar track y proyecto: ${liveProject.title}`}
          >
            <span className="perf-project-pill-text">{liveProject.title}</span>
            <span className="perf-project-pill-arrow" aria-hidden>✎</span>
          </button>
        </div>

        <div className="perf-top-actions">
          <button
            type="button"
            className={`pill-control perf-action-pill perf-theme-pill ${darkStage ? "active" : ""}`}
            onMouseEnter={() => sfx.hover()}
            onClick={() => {
              sfx.tap();
              setDarkStage((d) => !d);
              onToggleTheme?.();
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
            className={`pill-control perf-action-pill ${snippetClean ? "active" : ""}`}
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
            <span>{snippetClean ? "Salir" : "Snippet"}</span>
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
          <small>{liveProject.type}</small>
        </div>
        <h1
          className="perf-title"
          style={{
            color: isDarkStage || isCinemaActive ? "#ffffff" : "#09090b",
            textShadow:
              isDarkStage || isCinemaActive
                ? "0 4px 28px rgba(0, 0, 0, 0.9), 0 2px 8px rgba(0, 0, 0, 0.95)"
                : "none",
          }}
        >
          {track.title}
        </h1>
        {!isStandby && (
          <p
            className="perf-kicker"
            style={{
              color: isDarkStage || isCinemaActive ? "rgba(255, 255, 255, 0.92)" : "#3f3f46",
              textShadow:
                isDarkStage || isCinemaActive ? "0 2px 14px rgba(0, 0, 0, 0.85)" : "none",
            }}
          >
            {track.artist} {track.feat ? `feat. ${track.feat}` : ""} — prod.{" "}
            {track.prod || track.artist}
          </p>
        )}
        {isStandby && <p className="perf-kicker">Elegí un track de tu biblioteca para escucharlo acá</p>}
        {notesOpen && (
          <span className="perf-note">
            “{track.note || `Sesión de ${liveProject.title} · ${track.bpm} BPM · Tonalidad ${track.key}`}”
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

            {/* DERECHA: BPM & Key textito + Visual Engine + Notas/Lyrics + Cola (Queue) + Volumen con Slider */}
            <div className="spotify-right-utilities">
              <button
                type="button"
                className="perf-bottom-meta-badge"
                onClick={() => {
                  sfx.open();
                  setStudioModalOpen(true);
                }}
                title="Editar pitch, tempo, key y video del track"
              >
                <span className="perf-bottom-meta-dot" />
                <span className="perf-bottom-meta-text">{track.bpm} BPM · {track.key}</span>
                <span className="perf-bottom-meta-pencil" aria-hidden>✎</span>
              </button>

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
