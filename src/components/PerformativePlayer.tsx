"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { type Project, type Track } from "@/lib/mock";
import { sfx } from "@/lib/sfx";

export type VisualMode = "boids" | "props" | "ferro" | "cd";
export type RepeatMode = "off" | "all" | "one";

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

type ProceduralPropBody = {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rot: THREE.Euler;
  angVel: THREE.Vector3;
  radius: number;
  geometry: THREE.BufferGeometry;
  color: string;
  metalness: number;
  roughness: number;
};

function buildProceduralGeometry(index: number, radius: number): THREE.BufferGeometry {
  const kind = index % 6;
  if (kind === 0) {
    return new THREE.TorusKnotGeometry(
      radius * 0.62,
      radius * 0.2,
      72,
      16,
      2 + (index % 2),
      3 + (index % 3)
    );
  }
  if (kind === 1) {
    const geo = new THREE.SphereGeometry(radius * 0.85, 28, 28);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const d =
        1 +
        0.26 * Math.sin(x * 4.5 + index) * Math.cos(y * 4.5) +
        0.18 * Math.cos(z * 5.2 - index);
      pos.setXYZ(i, x * d, y * d, z * d);
    }
    geo.computeVertexNormals();
    return geo;
  }
  if (kind === 2) {
    const shape = new THREE.Shape();
    const spikes = 5 + (index % 4);
    for (let i = 0; i < spikes * 2; i++) {
      const r = i % 2 === 0 ? radius * 0.92 : radius * 0.42;
      const a = (i / (spikes * 2)) * Math.PI * 2;
      if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: radius * 0.45,
      bevelEnabled: true,
      bevelThickness: radius * 0.12,
      bevelSize: radius * 0.1,
      bevelSegments: 3,
    });
    geo.center();
    return geo;
  }
  if (kind === 3) {
    const geo = new THREE.CylinderGeometry(radius * 0.55, radius * 0.55, radius * 1.55, 20, 20);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const twist = y * 2.8;
      const nx = x * Math.cos(twist) - z * Math.sin(twist);
      const nz = x * Math.sin(twist) + z * Math.cos(twist);
      pos.setXYZ(i, nx, y, nz);
    }
    geo.computeVertexNormals();
    return geo;
  }
  if (kind === 4) {
    const geo = new THREE.OctahedronGeometry(radius * 0.9, 1);
    geo.scale(0.85, 1.35, 0.85);
    return geo;
  }
  const geo = new THREE.TorusGeometry(radius * 0.68, radius * 0.24, 20, 48);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const angle = Math.atan2(y, x);
    pos.setZ(i, z + Math.sin(angle * 3) * radius * 0.22);
  }
  geo.computeVertexNormals();
  return geo;
}

// 1. 36.000 PARTÍCULAS ALGORÍTMICAS DE BAJA LATENCIA CON LATIDO ELÁSTICO 808
function HighResFlowParticles({
  accent,
  c2,
  impulseSignal,
}: {
  accent: string;
  c2: string;
  impulseSignal: number;
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
    const cInk = new THREE.Color("#18181b");

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
  }, [accent, c2]);

  useFrame(({ clock, pointer }, dt) => {
    const { beat, eightOhEight } = sfx.sampleReactiveLevels();
    const clampedDt = Math.min(0.033, dt);
    const t = clock.elapsedTime;

    // Si el usuario clickea o pega el 808 de la canción, las partículas saltan según la fuerza del 808 y vuelven elásticamente
    if (impulseSignal !== lastImpulseRef.current) {
      lastImpulseRef.current = impulseSignal;
      velRef.current += 9.5;
    }

    // Fuerza objetivo proporcional a qué tan fuerte suena el 808 en este instante
    const target808 = Math.min(1.6, eightOhEight * 1.45);
    if (target808 > dispRef.current) {
      // Ataque rápido de golpe de 808: salta hacia afuera con fuerza proporcional al 808
      velRef.current += (target808 - dispRef.current) * 58 * clampedDt;
    }
    // Resorte elástico que las devuelve exactamente a su posición original apenas termina el 808
    const springForce = (target808 - dispRef.current) * 32 - velRef.current * 9.2;
    velRef.current += springForce * clampedDt;
    dispRef.current = Math.max(0, dispRef.current + velRef.current * clampedDt);

    const pulseDisp = dispRef.current;
    if (matRef.current) {
      // 50% más chicas (0.025 base) y laten un poquito en tamaño con el 808
      matRef.current.size = 0.025 * (1 + pulseDisp * 0.38);
    }

    const step = clampedDt * (0.95 + beat * 0.45);
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

// 2. PROPS 3D MACIZOS PROCEDURALES SIEMPRE EN GRAVEDAD 0G
function UncannyPropsPhysics0G({
  accent,
  c2,
  impulseSignal,
}: {
  accent: string;
  c2: string;
  impulseSignal: number;
}) {
  const groupRef = useRef<THREE.Group>(null!);
  const lastImpulse = useRef(0);

  const bodies = useMemo<ProceduralPropBody[]>(() => {
    const palette = [accent, c2, "#111111", "#f43f5e", "#0284c7", "#eab308", "#a855f7", "#14b8a6"];
    return Array.from({ length: 18 }, (_, i) => {
      const radius = 0.38 + (i % 4) * 0.08;
      return {
        pos: new THREE.Vector3(
          (Math.random() - 0.5) * 4.2,
          (Math.random() - 0.5) * 2.6,
          (Math.random() - 0.5) * 2.0
        ),
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 1.4,
          (Math.random() - 0.5) * 1.4,
          (Math.random() - 0.5) * 1.1
        ),
        rot: new THREE.Euler(Math.random() * 3, Math.random() * 3, Math.random() * 3),
        angVel: new THREE.Vector3(
          (Math.random() - 0.5) * 2.4,
          (Math.random() - 0.5) * 2.4,
          (Math.random() - 0.5) * 2.4
        ),
        radius,
        geometry: buildProceduralGeometry(i, radius),
        color: palette[i % palette.length],
        metalness: i % 2 === 0 ? 0.55 : 0.18,
        roughness: i % 3 === 0 ? 0.14 : 0.32,
      };
    });
  }, [accent, c2]);

  useFrame(({ pointer }, dt) => {
    const step = Math.min(0.033, dt);
    const { beat, bass } = sfx.sampleReactiveLevels();

    const kickNow = impulseSignal !== lastImpulse.current;
    if (kickNow) lastImpulse.current = impulseSignal;

    const boundsX = 2.85;
    const boundsY = 1.85;
    const boundsZ = 1.45;

    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      b.vel.x += -b.pos.x * 0.38 * step;
      b.vel.y += -b.pos.y * 0.38 * step;
      b.vel.z += -b.pos.z * 0.38 * step;

      const mx = pointer.x * 2.5;
      const my = pointer.y * 1.65;
      const dxm = b.pos.x - mx;
      const dym = b.pos.y - my;
      const distM = Math.hypot(dxm, dym);
      if (distM < 1.25 && distM > 0.001) {
        const push = (1.25 - distM) * 4.8 * step;
        b.vel.x += (dxm / distM) * push;
        b.vel.y += (dym / distM) * push;
      }

      if (kickNow || bass > 0.94) {
        const s = kickNow ? 3.4 : 0.9;
        b.vel.x += (Math.random() - 0.5) * s * 1.6;
        b.vel.y += (Math.random() - 0.5) * s * 1.6;
        b.vel.z += (Math.random() - 0.5) * s;
      }

      b.vel.multiplyScalar(0.994);
      b.pos.addScaledVector(b.vel, step);

      b.rot.x += b.angVel.x * step * (1 + beat * 0.5);
      b.rot.y += b.angVel.y * step * (1 + beat * 0.5);
      b.rot.z += b.angVel.z * step;

      if (Math.abs(b.pos.x) > boundsX - b.radius) {
        b.pos.x = Math.sign(b.pos.x) * (boundsX - b.radius);
        b.vel.x *= -0.88;
      }
      if (Math.abs(b.pos.y) > boundsY - b.radius) {
        b.pos.y = Math.sign(b.pos.y) * (boundsY - b.radius);
        b.vel.y *= -0.88;
      }
      if (Math.abs(b.pos.z) > boundsZ - b.radius) {
        b.pos.z = Math.sign(b.pos.z) * (boundsZ - b.radius);
        b.vel.z *= -0.88;
      }
    }

    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i];
        const b = bodies[j];
        const diff = a.pos.clone().sub(b.pos);
        const d = diff.length();
        const minD = a.radius + b.radius;
        if (d > 0 && d < minD) {
          const n = diff.divideScalar(d);
          const overlap = minD - d;
          a.pos.addScaledVector(n, overlap * 0.5);
          b.pos.addScaledVector(n, -overlap * 0.5);
          const relVel = a.vel.clone().sub(b.vel).dot(n);
          if (relVel < 0) {
            const imp = -relVel * 0.92;
            a.vel.addScaledVector(n, imp);
            b.vel.addScaledVector(n, -imp);
          }
        }
      }
    }

    const children = groupRef.current.children;
    for (let i = 0; i < bodies.length; i++) {
      const m = children[i];
      if (!m) continue;
      m.position.copy(bodies[i].pos);
      m.rotation.copy(bodies[i].rot);
      const pulse = 1 + (i % 3 === 0 ? beat * 0.14 : 0);
      m.scale.setScalar(pulse);
    }
  });

  return (
    <group ref={groupRef}>
      {bodies.map((b, i) => (
        <mesh key={i} geometry={b.geometry} castShadow receiveShadow>
          <meshPhysicalMaterial
            color={b.color}
            roughness={b.roughness}
            metalness={b.metalness}
            clearcoat={0.85}
            clearcoatRoughness={0.12}
          />
        </mesh>
      ))}
    </group>
  );
}

// 3. FERROFLUIDO INTERACTIVO
function SculptableFerrofluid({ accent, c2 }: { accent: string; c2: string }) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const baseGeo = useMemo(() => new THREE.IcosahedronGeometry(0.96, 36), []);
  const origPos = useMemo(() => {
    const p = baseGeo.attributes.position.array as Float32Array;
    return new Float32Array(p);
  }, [baseGeo]);
  const sculptOffsets = useMemo(
    () => new Float32Array(baseGeo.attributes.position.count),
    [baseGeo]
  );
  const hoverDirRef = useRef<THREE.Vector3 | null>(null);

  useFrame(({ clock }) => {
    const { beat, bass } = sfx.sampleReactiveLevels();
    const t = clock.elapsedTime;
    const pos = baseGeo.attributes.position as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;

    const spikeAmp = 0.18 + bass * 0.28 + beat * 0.14;
    const hDir = hoverDirRef.current;

    for (let i = 0; i < pos.count; i++) {
      const ix = i * 3;
      const ox = origPos[ix];
      const oy = origPos[ix + 1];
      const oz = origPos[ix + 2];

      if (hDir) {
        const dot = (ox * hDir.x + oy * hDir.y + oz * hDir.z) / 0.96;
        if (dot > 0.72) {
          sculptOffsets[i] = Math.min(0.65, sculptOffsets[i] + (dot - 0.72) * 0.22);
        }
      }
      sculptOffsets[i] *= 0.988;

      const n =
        Math.sin(ox * 4.2 + t * 2.4) *
        Math.cos(oy * 4.2 - t * 2.0) *
        Math.sin(oz * 4.2 + t * 1.7);
      const s = 1 + n * spikeAmp + sculptOffsets[i];
      arr[ix] = ox * s;
      arr[ix + 1] = oy * s;
      arr[ix + 2] = oz * s;
    }
    pos.needsUpdate = true;
    baseGeo.computeVertexNormals();
  });

  return (
    <group>
      <pointLight position={[3, 4, 4]} color="#ffffff" intensity={25} />
      <pointLight position={[-4, -3, 3]} color={c2} intensity={18} />
      <pointLight position={[0, 4, -4]} color={accent} intensity={16} />
      <mesh
        ref={meshRef}
        geometry={baseGeo}
        onPointerMove={(e) => {
          e.stopPropagation();
          const localPt = meshRef.current.worldToLocal(e.point.clone()).normalize();
          hoverDirRef.current = localPt;
        }}
        onPointerOut={() => {
          hoverDirRef.current = null;
        }}
      >
        <meshPhysicalMaterial
          color="#1e1b24"
          emissive={accent}
          emissiveIntensity={0.14}
          metalness={0.35}
          roughness={0.14}
          clearcoat={1}
          clearcoatRoughness={0.08}
          iridescence={0.75}
        />
      </mesh>
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

// 4. DISCO ACRÍLICO 3D
function InteractiveAcrylicDisc({ track }: { track: Track }) {
  const spinRef = useRef<THREE.Group>(null!);

  const labelTex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 512;
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(256, 256, 20, 256, 256, 256);
    grad.addColorStop(0, track.c2);
    grad.addColorStop(1, track.c1);
    g.fillStyle = grad;
    g.fillRect(0, 0, 512, 512);

    g.strokeStyle = "rgba(255,255,255,0.22)";
    g.lineWidth = 2;
    for (let r = 70; r < 245; r += 12) {
      g.beginPath();
      g.arc(256, 256, r, 0, Math.PI * 2);
      g.stroke();
    }

    g.fillStyle = "#ffffff";
    g.font = "700 42px Inter, sans-serif";
    g.textAlign = "center";
    g.fillText(track.title.toUpperCase().slice(0, 14), 256, 200);
    g.font = "600 24px monospace";
    g.fillText(`${track.artist} · ${track.bpm} BPM`, 256, 330);

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, [track]);

  useFrame((_, dt) => {
    const { beat } = sfx.sampleReactiveLevels();
    spinRef.current.rotation.z -= dt * 0.95;
    const s = 1 + beat * 0.05;
    spinRef.current.scale.setScalar(s);
  });

  return (
    <group>
      <pointLight position={[3, 4, 5]} color="#ffffff" intensity={18} />
      <group ref={spinRef} rotation={[0.2, -0.24, 0]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[1.65, 1.65, 0.065, 72]} />
          <meshPhysicalMaterial
            color={track.c2}
            transmission={0.72}
            thickness={0.5}
            roughness={0.08}
            metalness={0.15}
            clearcoat={1}
            transparent
            opacity={0.92}
          />
        </mesh>

        <mesh position={[0, 0, 0.036]}>
          <ringGeometry args={[0.24, 1.54, 72]} />
          <meshBasicMaterial map={labelTex} side={THREE.DoubleSide} />
        </mesh>

        <mesh position={[0, 0, -0.036]} rotation={[0, Math.PI, 0]}>
          <ringGeometry args={[0.24, 1.54, 72]} />
          <meshBasicMaterial map={labelTex} side={THREE.DoubleSide} />
        </mesh>

        <mesh position={[0, 0, 0]}>
          <torusGeometry args={[0.24, 0.04, 16, 48]} />
          <meshStandardMaterial color="#f8fafc" metalness={0.5} roughness={0.15} />
        </mesh>
      </group>

      <OrbitControls
        enableZoom={true}
        minDistance={2.0}
        maxDistance={11.0}
        zoomSpeed={0.95}
        enablePan={false}
        rotateSpeed={0.85}
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
  const [impulseSignal, setImpulseSignal] = useState(0);
  const [queueOpen, setQueueOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [showRemaining, setShowRemaining] = useState(false);

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
      if (st.ended && isPlaying) {
        if (repeatMode === "one") {
          sfx.seek(0);
        } else {
          onNext();
        }
      }
    }, 120);
    return () => clearInterval(id);
  }, [isPlaying, repeatMode, onNext, track.durationSec]);

  const progressPct = durationSec > 0 ? Math.min(100, (currentSec / durationSec) * 100) : 0;
  const isLiked = likedTrackIds.includes(track.id);

  // Siguientes del proyecto actual (como "Siguiente de: <Proyecto>" en Spotify)
  const projectNextTracks = useMemo(() => {
    const idx = project.tracks.findIndex((t) => t.id === track.id);
    if (idx === -1) return project.tracks;
    return [...project.tracks.slice(idx + 1), ...project.tracks.slice(0, idx)];
  }, [project.tracks, track.id]);

  return (
    <div
      className={`perf-player font-skin-sf ${darkStage ? "stage-dark" : "stage-light"} ${
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

      {/* Canvas 3D performativo a pantalla completa (DPR optimizado a 1.25 en partículas para 60fps clavados con 36K partículas) */}
      <div
        className="perf-canvas-wrap"
        onClick={() => {
          if (mode === "props" || mode === "boids") {
            setImpulseSignal((n) => n + 1);
            sfx.tap();
          }
        }}
      >
        <Canvas
          camera={{ position: [0, 0, 5.2], fov: 42 }}
          dpr={mode === "boids" ? [1, 1.25] : [1, 1.75]}
          gl={{ antialias: mode !== "boids", powerPreference: "high-performance" }}
        >
          <ambientLight intensity={darkStage ? 0.95 : 1.45} />
          <directionalLight position={[4, 6, 5]} intensity={1.85} />
          <pointLight position={[-4, -3, 3]} color={track.c2} intensity={6} />

          {mode === "boids" && (
            <HighResFlowParticles
              accent={track.accent}
              c2={track.c2}
              impulseSignal={impulseSignal}
            />
          )}
          {mode === "props" && (
            <UncannyPropsPhysics0G
              accent={track.accent}
              c2={track.c2}
              impulseSignal={impulseSignal}
            />
          )}
          {mode === "ferro" && <SculptableFerrofluid accent={track.accent} c2={track.c2} />}
          {mode === "cd" && <InteractiveAcrylicDisc track={track} />}
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
          ↓ Minimizar
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
            ✎ Editar track ({track.bpm} BPM · {track.key} · v{track.version})
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
            📂 {project.title} ↗
          </button>
        </div>

        <div className="perf-top-actions">
          <button
            type="button"
            className={`pill-control ${darkStage ? "active" : ""}`}
            onMouseEnter={() => sfx.hover()}
            onClick={() => {
              sfx.tap();
              setDarkStage((d) => !d);
            }}
          >
            {darkStage ? "☀️ Claro" : "🌑 Oscuro"}
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
            {snippetClean ? "● REC SNIPPET (Salir)" : "🎥 Modo Snippet Clean"}
          </button>
        </div>
      </header>

      {/* Overlay tipográfico central en SF Display */}
      <div className="perf-center-typo">
        <div
          className="perf-artwork-card"
          style={{ background: `linear-gradient(135deg, ${track.c1}, ${track.c2})` }}
        >
          <span>{track.glyph}</span>
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
              <span className="mono-tag"> REPRODUCTOR // COLA</span>
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
                style={{ background: `linear-gradient(135deg, ${track.c1}, ${track.c2})` }}
              >
                {track.glyph}
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
                      background: `linear-gradient(135deg, ${item.track.c1}, ${item.track.c2})`,
                    }}
                  >
                    {item.track.glyph}
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
                  style={{ background: `linear-gradient(135deg, ${t.c1}, ${t.c2})` }}
                >
                  {t.glyph}
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
                    style={{ background: `linear-gradient(135deg, ${t.c1}, ${t.c2})` }}
                  >
                    {t.glyph}
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

      {/* DOCK INFERIOR COMPLETO ESTILO SPOTIFY */}
      {!snippetClean && (
        <footer className="perf-dock spotify-full-dock">
          <div className="spotify-dock-grid">
            {/* IZQUIERDA: Track actual + Artista + Favorito (Like) */}
            <div className="spotify-now-playing">
              <div
                className="spotify-now-art"
                style={{ background: `linear-gradient(135deg, ${track.c1}, ${track.c2})` }}
                onClick={() => onJumpToProject(project.id)}
                title={`Ir a ${project.title}`}
              >
                <span>{track.glyph}</span>
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
                {isLiked ? "♥" : "♡"}
              </button>
            </div>

            {/* CENTRO: Controles de transporte centrados (Shuffle, Prev, Play/Pause, Next, Repeat) + Barra de progreso con duración */}
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
                  🔀
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
                  ⏮
                </button>

                <button
                  type="button"
                  className="spotify-play-circle"
                  onClick={onTogglePlay}
                  title={isPlaying ? "Pausar" : "Reproducir"}
                  aria-label={isPlaying ? "Pausar" : "Reproducir"}
                >
                  {isPlaying ? "❚❚" : "▶"}
                </button>

                <button
                  type="button"
                  className="spotify-icon-btn"
                  onClick={onNext}
                  title="Siguiente"
                  aria-label="Siguiente"
                >
                  ⏭
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
                  {repeatMode === "one" ? "🔂" : "🔁"}
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

            {/* DERECHA: Visual Engine + Notas/Lyrics + Cola (Queue) + Volumen con Slider */}
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
                <option value="boids">✨ 36K Partículas (808 Pulse)</option>
                <option value="props">📦 Props 3D (0G)</option>
                <option value="ferro">💧 Ferrofluido 3D</option>
                <option value="cd">💿 Disco Acrílico 3D</option>
              </select>

              <button
                type="button"
                className={`spotify-util-btn ${notesOpen ? "active" : ""}`}
                onClick={() => {
                  sfx.tap();
                  setNotesOpen((v) => !v);
                }}
                title="Notas de sesión / Lyrics"
              >
                🎙️
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
                ☰ Cola {userQueue.length > 0 ? `(${userQueue.length})` : ""}
              </button>

              <div className="spotify-volume-group">
                <button
                  type="button"
                  className="spotify-util-btn"
                  onClick={onToggleMute}
                  title={muted ? "Activar sonido" : "Silenciar"}
                >
                  {muted || volume === 0 ? "🔇" : volume < 0.5 ? "🔉" : "🔊"}
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
