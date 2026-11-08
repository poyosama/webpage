"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { type Project, type Track } from "@/lib/mock";
import { sfx } from "@/lib/sfx";

export type VisualMode = "props" | "boids" | "ferro" | "cd";

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

// Generador de geometrías procedurales locas y 100% macizas
function buildProceduralGeometry(index: number, radius: number): THREE.BufferGeometry {
  const kind = index % 6;
  if (kind === 0) {
    // Nudo toroidal complejo (p=2, q=3 o p=3, q=4)
    return new THREE.TorusKnotGeometry(radius * 0.62, radius * 0.2, 96, 20, 2 + (index % 2), 3 + (index % 3));
  }
  if (kind === 1) {
    // Blob orgánico desplazado por armónicos sinusoidales
    const geo = new THREE.SphereGeometry(radius * 0.85, 36, 36);
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
    // Estrella procedural extruida en 3D
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
      bevelSegments: 4,
    });
    geo.center();
    return geo;
  }
  if (kind === 3) {
    // Columna helicoidal / tornillo retorcido procedural
    const geo = new THREE.CylinderGeometry(radius * 0.55, radius * 0.55, radius * 1.55, 24, 24);
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
    // Cristal poliédrico tallado
    const geo = new THREE.OctahedronGeometry(radius * 0.9, 1);
    geo.scale(0.85, 1.35, 0.85);
    return geo;
  }
  // Anillo hiperbólico ondulado
  const geo = new THREE.TorusGeometry(radius * 0.68, radius * 0.24, 24, 64);
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

// 1. PROPS 3D MACIZOS PROCEDURALES SIEMPRE EN GRAVEDAD 0G
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
      // Gravedad 0G permanente: deriva orbital suave hacia el centro para que floten y choquen
      b.vel.x += -b.pos.x * 0.38 * step;
      b.vel.y += -b.pos.y * 0.38 * step;
      b.vel.z += -b.pos.z * 0.38 * step;

      // Interacción magnética con el mouse
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

    // Colisiones elásticas entre props macizos
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

// 2. PARTÍCULAS ALGORÍTMICAS DE ALTA RESOLUCIÓN (18.000 partículas redondas siguiendo un campo de flujo procedural)
function HighResFlowParticles({ accent, c2 }: { accent: string; c2: string }) {
  const pointsRef = useRef<THREE.Points>(null!);
  const count = 18000;

  // Sprite circular suave en alta resolución para que no sean cuadraditos
  const circleSprite = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 64;
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.45, "rgba(255,255,255,0.85)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    return tex;
  }, []);

  const { positions, colors, phases } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const ph = new Float32Array(count);
    const cA = new THREE.Color(accent);
    const cB = new THREE.Color(c2);
    const cInk = new THREE.Color("#18181b");

    for (let i = 0; i < count; i++) {
      // Distribución inicial sobre cintas de atractor procedural
      const u = (i / count) * Math.PI * 24;
      const stream = i % 5;
      const r = 0.6 + (i / count) * 2.4;
      pos[i * 3] = Math.cos(u + stream) * r + (Math.random() - 0.5) * 0.25;
      pos[i * 3 + 1] = Math.sin(u * 1.5 - stream) * r * 0.65 + (Math.random() - 0.5) * 0.25;
      pos[i * 3 + 2] = Math.sin(u * 0.7 + stream) * 1.6 + (Math.random() - 0.5) * 0.25;

      ph[i] = Math.random() * Math.PI * 2;

      const tMix = (i % 100) / 100;
      const chosen = i % 3 === 0 ? cA.clone().lerp(cB, tMix) : i % 3 === 1 ? cB : cInk;
      col[i * 3] = chosen.r;
      col[i * 3 + 1] = chosen.g;
      col[i * 3 + 2] = chosen.b;
    }
    return { positions: pos, colors: col, phases: ph };
  }, [accent, c2]);

  useFrame(({ clock, pointer }, dt) => {
    const { beat } = sfx.sampleReactiveLevels();
    const t = clock.elapsedTime;
    const step = Math.min(0.03, dt) * (1.1 + beat * 0.9);
    const geo = pointsRef.current.geometry;
    const attr = geo.getAttribute("position") as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;

    // Atractor cíclico de Thomas + guía del puntero: traza caminos curvos hipnóticos
    const bParam = 0.19;
    const mx = pointer.x * 2.2;
    const my = pointer.y * 1.5;

    for (let i = 0; i < count; i++) {
      const ix = i * 3;
      let x = arr[ix];
      let y = arr[ix + 1];
      let z = arr[ix + 2];

      // Campo vectorial procedural que guía el destino de cada partícula
      const vx = Math.sin(y * 1.55 + t * 0.7) - bParam * x + (mx - x) * 0.14;
      const vy = Math.sin(z * 1.55 - t * 0.5) - bParam * y + (my - y) * 0.14;
      const vz = Math.sin(x * 1.55 + phases[i] * 0.2) - bParam * z;

      x += vx * step * 1.45;
      y += vy * step * 1.45;
      z += vz * step * 1.45;

      // Re-inyección si se aleja demasiado para mantener densidad máxima
      if (x * x + y * y + z * z > 18) {
        const a = phases[i] + t;
        x = Math.cos(a) * 0.4;
        y = Math.sin(a) * 0.4;
        z = Math.sin(a * 2) * 0.4;
      }

      arr[ix] = x;
      arr[ix + 1] = y;
      arr[ix + 2] = z;
    }
    attr.needsUpdate = true;
    pointsRef.current.rotation.y += dt * 0.08;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        map={circleSprite}
        size={0.052}
        vertexColors
        transparent
        alphaTest={0.05}
        opacity={0.92}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
}

// 3. FERROFLUIDO INTERACTIVO (Se puede moldear pasando/arrastrando en la superficie + rotar en 3D con OrbitControls)
function SculptableFerrofluid({ accent }: { accent: string }) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const baseGeo = useMemo(() => new THREE.IcosahedronGeometry(1.42, 32), []);
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

    const spikeAmp = 0.2 + bass * 0.35 + beat * 0.16;
    const hDir = hoverDirRef.current;

    for (let i = 0; i < pos.count; i++) {
      const ix = i * 3;
      const ox = origPos[ix];
      const oy = origPos[ix + 1];
      const oz = origPos[ix + 2];

      // Si el usuario está pasando el mouse sobre la superficie, moldeamos las púas hacia afuera en esa zona
      if (hDir) {
        const dot = (ox * hDir.x + oy * hDir.y + oz * hDir.z) / 1.42;
        if (dot > 0.72) {
          sculptOffsets[i] = Math.min(0.85, sculptOffsets[i] + (dot - 0.72) * 0.22);
        }
      }
      // Relajación elástica lenta del moldeado
      sculptOffsets[i] *= 0.988;

      const n =
        Math.sin(ox * 3.6 + t * 2.4) *
        Math.cos(oy * 3.6 - t * 2.0) *
        Math.sin(oz * 3.6 + t * 1.7);
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
          color="#18181b"
          emissive={accent}
          emissiveIntensity={0.24}
          metalness={0.94}
          roughness={0.1}
          clearcoat={1}
          iridescence={0.65}
        />
      </mesh>
      <OrbitControls enableZoom={false} enablePan={false} rotateSpeed={0.75} />
    </group>
  );
}

// 4. DISCO ACRÍLICO 3D (Orientado de frente desde el inicio + rotable 360º con el mouse)
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

    // Surcos circulares
    g.strokeStyle = "rgba(255,255,255,0.16)";
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
      {/* Rotamos ligeramente para que se vea de frente y con volumen 3D inmediato */}
      <group ref={spinRef} rotation={[0.22, -0.28, 0]}>
        {/* Cuerpo exterior de acrílico translúcido (rotado Math.PI/2 en X para que mire a la cámara) */}
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[1.85, 1.85, 0.07, 72]} />
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

        {/* Cara frontal grabada con surcos y arte */}
        <mesh position={[0, 0, 0.038]}>
          <ringGeometry args={[0.24, 1.72, 72]} />
          <meshStandardMaterial map={labelTex} roughness={0.22} metalness={0.35} side={THREE.DoubleSide} />
        </mesh>

        {/* Cara trasera grabada */}
        <mesh position={[0, 0, -0.038]} rotation={[0, Math.PI, 0]}>
          <ringGeometry args={[0.24, 1.72, 72]} />
          <meshStandardMaterial map={labelTex} roughness={0.22} metalness={0.35} side={THREE.DoubleSide} />
        </mesh>

        {/* Anillo cromado central */}
        <mesh position={[0, 0, 0]}>
          <torusGeometry args={[0.24, 0.04, 16, 48]} />
          <meshStandardMaterial color="#f8fafc" metalness={0.9} roughness={0.1} />
        </mesh>
      </group>

      {/* Rotación libre 3D con el mouse */}
      <OrbitControls enableZoom={false} enablePan={false} rotateSpeed={0.85} />
    </group>
  );
}

export default function PerformativePlayer({
  track,
  project,
  isPlaying,
  onTogglePlay,
  onNext,
  onPrev,
  onClose,
  onJumpToProject,
  onOpenEditTrack,
}: {
  track: Track;
  project: Project;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
  onJumpToProject: (projectId: string) => void;
  onOpenEditTrack: () => void;
}) {
  const [mode, setMode] = useState<VisualMode>("props");
  const [snippetClean, setSnippetClean] = useState(false);
  const [darkStage, setDarkStage] = useState(false);
  const [impulseSignal, setImpulseSignal] = useState(0);
  const hasEnteredBodyRef = useRef(false);

  return (
    <div
      className={`perf-player font-skin-sf ${darkStage ? "stage-dark" : "stage-light"} ${
        snippetClean ? "snippet-clean" : ""
      }`}
      onPointerMove={(e) => {
        if (e.clientY > 90) {
          hasEnteredBodyRef.current = true;
        } else if (hasEnteredBodyRef.current && e.clientY <= 6) {
          // Gesto de llevar el cursor bien arriba del todo de la pantalla para cerrar
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

      {/* Canvas 3D performativo a pantalla completa */}
      <div
        className="perf-canvas-wrap"
        onClick={() => {
          if (mode === "props") {
            setImpulseSignal((n) => n + 1);
            sfx.tap();
          }
        }}
      >
        <Canvas camera={{ position: [0, 0, 5.2], fov: 42 }} dpr={[1, 2]}>
          <ambientLight intensity={darkStage ? 0.95 : 1.45} />
          <directionalLight position={[4, 6, 5]} intensity={1.85} />
          <pointLight position={[-4, -3, 3]} color={track.c2} intensity={6} />

          {mode === "props" && (
            <UncannyPropsPhysics0G
              accent={track.accent}
              c2={track.c2}
              impulseSignal={impulseSignal}
            />
          )}
          {mode === "boids" && <HighResFlowParticles accent={track.accent} c2={track.c2} />}
          {mode === "ferro" && <SculptableFerrofluid accent={track.accent} />}
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
          ↓ Cerrar (o subí el cursor al tope)
        </button>

        <div className="perf-badges">
          {/* Donde estaba el BPM y la Key ahora abre la pantalla Editar Track */}
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

          {/* Clickear el proyecto te lleva directo a ese proyecto en la Biblioteca */}
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

      {/* Overlay tipográfico en SF Display */}
      <div className="perf-center-typo">
        <div
          className="perf-artwork-card"
          style={{ background: `linear-gradient(135deg, ${track.c1}, ${track.c2})` }}
        >
          <span>{track.glyph}</span>
          <small>0261 // MZA</small>
        </div>
        <p className="perf-kicker">
          {track.artist} {track.feat ? `feat. ${track.feat}` : ""} — prod. {track.prod || track.artist}
        </p>
        <h1 className="perf-title">{track.title}</h1>
        {track.note && <span className="perf-note">“{track.note}”</span>}
      </div>

      {/* Dock inferior con Visual Engine en menú desplegable */}
      {!snippetClean && (
        <footer className="perf-dock">
          <div className="perf-customizer-row">
            <div className="cust-group">
              <label htmlFor="visual-engine-select">VISUAL ENGINE</label>
              <select
                id="visual-engine-select"
                className="apple-select"
                value={mode}
                onChange={(e) => {
                  sfx.tap();
                  setMode(e.target.value as VisualMode);
                }}
              >
                <option value="props">📦 Props 3D Procedurales (0G Macizos)</option>
                <option value="boids">✨ 18K Partículas Algorítmicas (Flow Field)</option>
                <option value="ferro">💧 Ferrofluido Moldeable + Rotación 3D</option>
                <option value="cd">💿 Disco Acrílico 3D (Rotable con Mouse)</option>
              </select>
            </div>

            <div className="cust-group">
              <label>INTERACCIÓN EN VIVO</label>
              <div className="seg-pills">
                {mode === "props" && (
                  <button
                    type="button"
                    onClick={() => {
                      setImpulseSignal((n) => n + 1);
                      sfx.drop();
                    }}
                  >
                    💥 Impulsar Props 0G
                  </button>
                )}
                {(mode === "ferro" || mode === "cd") && (
                  <span className="mono-badge">
                    🖱️ Arrastrá con el mouse para rotar {mode === "ferro" ? "y moldear púas" : "el disco 3D"}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => {
                    sfx.open();
                    onOpenEditTrack();
                  }}
                >
                  ✎ Editar Track
                </button>
                <button
                  type="button"
                  className={darkStage ? "on" : ""}
                  onClick={() => {
                    sfx.tap();
                    setDarkStage((d) => !d);
                  }}
                >
                  {darkStage ? "☀️ Papel Blanco" : "🌑 Fondo Estudio"}
                </button>
              </div>
            </div>
          </div>

          <div className="perf-transport">
            <button type="button" className="trans-btn" onClick={onPrev} aria-label="Anterior">
              ⏮
            </button>
            <button type="button" className="trans-play" onClick={onTogglePlay}>
              {isPlaying ? "❚❚ Pausar (Espacio)" : "▶ Reproducir (Espacio)"}
            </button>
            <button type="button" className="trans-btn" onClick={onNext} aria-label="Siguiente">
              ⏭
            </button>
          </div>
        </footer>
      )}
    </div>
  );
}
