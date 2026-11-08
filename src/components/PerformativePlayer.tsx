"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { type Project, type Track } from "@/lib/mock";
import { sfx } from "@/lib/sfx";

export type VisualMode = "props" | "boids" | "ferro" | "cd";
export type FontSkin = "sf" | "serif" | "mono" | "gothic";

type Body3D = {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rot: THREE.Euler;
  angVel: THREE.Vector3;
  radius: number;
  kind: "crate" | "cone" | "torus" | "sphere" | "capsule";
  color: string;
  wire: boolean;
};

// Escena 1: GMod Uncanny Props con físicas reales (gravedad, colisión entre objetos, rebote en paredes y patada con el sub-bass o click)
function UncannyPropsPhysics({
  accent,
  c2,
  impulseSignal,
  gravityOn,
}: {
  accent: string;
  c2: string;
  impulseSignal: number;
  gravityOn: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null!);
  const lastImpulse = useRef(0);

  const bodies = useMemo<Body3D[]>(() => {
    const palette = [accent, c2, "#111111", "#ffffff", "#ff5500", "#e2e8f0"];
    const kinds: Body3D["kind"][] = ["crate", "cone", "torus", "sphere", "capsule"];
    return Array.from({ length: 16 }, (_, i) => ({
      pos: new THREE.Vector3(
        (Math.random() - 0.5) * 3.4,
        (Math.random() - 0.2) * 2.6,
        (Math.random() - 0.5) * 1.8
      ),
      vel: new THREE.Vector3(
        (Math.random() - 0.5) * 2.2,
        (Math.random() - 0.5) * 2.2,
        (Math.random() - 0.5) * 1.5
      ),
      rot: new THREE.Euler(Math.random() * 3, Math.random() * 3, Math.random() * 3),
      angVel: new THREE.Vector3(
        (Math.random() - 0.5) * 3,
        (Math.random() - 0.5) * 3,
        (Math.random() - 0.5) * 3
      ),
      radius: 0.36 + (i % 3) * 0.08,
      kind: kinds[i % kinds.length],
      color: palette[i % palette.length],
      wire: i % 5 === 0,
    }));
  }, [accent, c2]);

  useFrame(({ pointer }, dt) => {
    const step = Math.min(0.033, dt);
    const { beat, bass } = sfx.sampleReactiveLevels();

    // Si apretaron "Patear Props" o entró un golpe de 808 fuerte
    const kickNow = impulseSignal !== lastImpulse.current;
    if (kickNow) lastImpulse.current = impulseSignal;

    const boundsX = 2.55;
    const boundsY = 1.75;
    const boundsZ = 1.35;

    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      if (gravityOn) {
        b.vel.y -= 4.8 * step;
      } else {
        // Atracción suave hacia un vórtice central
        b.vel.x += -b.pos.x * 0.9 * step;
        b.vel.y += -b.pos.y * 0.9 * step;
      }

      // Empuje del cursor como imán físico
      const mx = pointer.x * 2.2;
      const my = pointer.y * 1.5;
      const dxm = b.pos.x - mx;
      const dym = b.pos.y - my;
      const distM = Math.hypot(dxm, dym);
      if (distM < 1.15 && distM > 0.001) {
        const push = (1.15 - distM) * 4.5 * step;
        b.vel.x += (dxm / distM) * push;
        b.vel.y += (dym / distM) * push;
      }

      if (kickNow || bass > 0.92) {
        const strength = kickNow ? 4.2 : 1.15;
        b.vel.y += (0.6 + Math.random() * 0.9) * strength;
        b.vel.x += (Math.random() - 0.5) * strength * 1.4;
        b.angVel.set(
          (Math.random() - 0.5) * 7,
          (Math.random() - 0.5) * 7,
          (Math.random() - 0.5) * 7
        );
      }

      b.vel.multiplyScalar(0.992);
      b.pos.addScaledVector(b.vel, step);

      b.rot.x += b.angVel.x * step * (1 + beat * 0.6);
      b.rot.y += b.angVel.y * step * (1 + beat * 0.6);
      b.rot.z += b.angVel.z * step;

      // Rebote contra la caja de cristal
      if (b.pos.x > boundsX - b.radius) {
        b.pos.x = boundsX - b.radius;
        b.vel.x *= -0.78;
      } else if (b.pos.x < -boundsX + b.radius) {
        b.pos.x = -boundsX + b.radius;
        b.vel.x *= -0.78;
      }
      if (b.pos.y > boundsY - b.radius) {
        b.pos.y = boundsY - b.radius;
        b.vel.y *= -0.75;
      } else if (b.pos.y < -boundsY + b.radius) {
        b.pos.y = -boundsY + b.radius;
        b.vel.y *= -0.82;
      }
      if (b.pos.z > boundsZ - b.radius) {
        b.pos.z = boundsZ - b.radius;
        b.vel.z *= -0.75;
      } else if (b.pos.z < -boundsZ + b.radius) {
        b.pos.z = -boundsZ + b.radius;
        b.vel.z *= -0.75;
      }
    }

    // Colisión elástica par-a-par
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
            const imp = -relVel * 0.85;
            a.vel.addScaledVector(n, imp);
            b.vel.addScaledVector(n, -imp);
          }
        }
      }
    }

    // Sincronizar meshes hijos
    const children = groupRef.current.children;
    for (let i = 0; i < bodies.length; i++) {
      const m = children[i];
      if (!m) continue;
      m.position.copy(bodies[i].pos);
      m.rotation.copy(bodies[i].rot);
      const pulse = 1 + (i % 3 === 0 ? beat * 0.16 : 0);
      m.scale.setScalar(pulse);
    }
  });

  return (
    <group>
      {/* Cuarto de prueba estilo sandbox minimalista */}
      <mesh position={[0, -1.82, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[6.4, 4.2, 12, 12]} />
        <meshBasicMaterial color="#94a3b8" wireframe transparent opacity={0.22} />
      </mesh>
      <group ref={groupRef}>
        {bodies.map((b, i) => (
          <group key={i}>
            {b.kind === "crate" && (
              <RoundedBox args={[b.radius * 1.45, b.radius * 1.45, b.radius * 1.45]} radius={0.05}>
                <meshStandardMaterial color={b.color} roughness={0.25} metalness={0.15} wireframe={b.wire} />
              </RoundedBox>
            )}
            {b.kind === "cone" && (
              <mesh>
                <coneGeometry args={[b.radius * 0.95, b.radius * 1.7, 20]} />
                <meshStandardMaterial color={b.color} roughness={0.3} metalness={0.1} wireframe={b.wire} />
              </mesh>
            )}
            {b.kind === "torus" && (
              <mesh>
                <torusGeometry args={[b.radius * 0.72, b.radius * 0.28, 16, 32]} />
                <meshStandardMaterial color={b.color} roughness={0.18} metalness={0.35} wireframe={b.wire} />
              </mesh>
            )}
            {b.kind === "sphere" && (
              <mesh>
                <icosahedronGeometry args={[b.radius * 0.9, 1]} />
                <meshStandardMaterial color={b.color} roughness={0.2} metalness={0.25} flatShading wireframe={b.wire} />
              </mesh>
            )}
            {b.kind === "capsule" && (
              <mesh>
                <capsuleGeometry args={[b.radius * 0.52, b.radius * 0.85, 8, 16]} />
                <meshStandardMaterial color={b.color} roughness={0.2} metalness={0.2} wireframe={b.wire} />
              </mesh>
            )}
          </group>
        ))}
      </group>
    </group>
  );
}

// Escena 2: Enjambre de Partículas Algorítmicas (Atractor de Lorenz + Curl + Audio Pulse)
function AlgorithmicParticles({ accent, c2 }: { accent: string; c2: string }) {
  const pointsRef = useRef<THREE.Points>(null!);
  const count = 2400;

  const { positions, seeds, colors } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const sd = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const cA = new THREE.Color(accent);
    const cB = new THREE.Color(c2);
    const cDark = new THREE.Color("#111111");

    for (let i = 0; i < count; i++) {
      const r = 0.4 + Math.random() * 2.2;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);

      sd[i * 3] = pos[i * 3];
      sd[i * 3 + 1] = pos[i * 3 + 1];
      sd[i * 3 + 2] = pos[i * 3 + 2];

      const mix = i % 3 === 0 ? cA : i % 3 === 1 ? cB : cDark;
      col[i * 3] = mix.r;
      col[i * 3 + 1] = mix.g;
      col[i * 3 + 2] = mix.b;
    }
    return { positions: pos, seeds: sd, colors: col };
  }, [accent, c2]);

  useFrame(({ clock, pointer }, dt) => {
    const { beat } = sfx.sampleReactiveLevels();
    const t = clock.elapsedTime;
    const geo = pointsRef.current.geometry;
    const attr = geo.getAttribute("position") as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;

    for (let i = 0; i < count; i++) {
      const ix = i * 3;
      const sx = seeds[ix];
      const sy = seeds[ix + 1];
      const sz = seeds[ix + 2];

      const wave = Math.sin(t * 1.4 + sx * 1.8 + sy * 1.3) * 0.35;
      const swirl = t * 0.55 + (i % 7) * 0.1;
      const scale = 1 + beat * 0.28 + wave * 0.2;

      arr[ix] = (sx * Math.cos(swirl) - sz * Math.sin(swirl)) * scale + pointer.x * 0.35;
      arr[ix + 1] = sy * scale + Math.cos(t * 1.9 + sx * 2.0) * 0.22 + pointer.y * 0.25;
      arr[ix + 2] = (sx * Math.sin(swirl) + sz * Math.cos(swirl)) * scale;
    }
    attr.needsUpdate = true;
    pointsRef.current.rotation.y += dt * 0.12;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.055} vertexColors transparent opacity={0.9} sizeAttenuation />
    </points>
  );
}

// Escena 3: Escultura Ferrofluido Cromado Reactivo
function FerrofluidMesh({ accent }: { accent: string }) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const baseGeo = useMemo(() => new THREE.IcosahedronGeometry(1.38, 24), []);
  const origPos = useMemo(() => {
    const p = baseGeo.attributes.position.array as Float32Array;
    return new Float32Array(p);
  }, [baseGeo]);

  useFrame(({ clock, pointer }) => {
    const { beat, bass } = sfx.sampleReactiveLevels();
    const t = clock.elapsedTime;
    const pos = baseGeo.attributes.position as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;

    const spikeAmp = 0.22 + bass * 0.38 + beat * 0.18;
    for (let i = 0; i < pos.count; i++) {
      const ix = i * 3;
      const ox = origPos[ix];
      const oy = origPos[ix + 1];
      const oz = origPos[ix + 2];
      const n =
        Math.sin(ox * 3.4 + t * 2.6) *
        Math.cos(oy * 3.4 - t * 2.1) *
        Math.sin(oz * 3.4 + t * 1.8);
      const s = 1 + n * spikeAmp;
      arr[ix] = ox * s;
      arr[ix + 1] = oy * s;
      arr[ix + 2] = oz * s;
    }
    pos.needsUpdate = true;
    baseGeo.computeVertexNormals();

    meshRef.current.rotation.y = t * 0.35 + pointer.x * 0.6;
    meshRef.current.rotation.x = pointer.y * 0.45;
  });

  return (
    <mesh ref={meshRef} geometry={baseGeo}>
      <meshPhysicalMaterial
        color="#18181b"
        emissive={accent}
        emissiveIntensity={0.22}
        metalness={0.92}
        roughness={0.12}
        clearcoat={1}
        iridescence={0.6}
      />
    </mesh>
  );
}

// Escena 4: Artwork / Vinilo Acrílico en levitación
function AcrylicDiscStage({ track }: { track: Track }) {
  const groupRef = useRef<THREE.Group>(null!);
  useFrame(({ clock, pointer }, dt) => {
    const { beat } = sfx.sampleReactiveLevels();
    groupRef.current.rotation.z -= dt * 1.35;
    groupRef.current.rotation.y = THREE.MathUtils.lerp(groupRef.current.rotation.y, pointer.x * 0.45, 0.08);
    groupRef.current.rotation.x = THREE.MathUtils.lerp(groupRef.current.rotation.x, -pointer.y * 0.35, 0.08);
    const s = 1 + beat * 0.06 + Math.sin(clock.elapsedTime * 2) * 0.015;
    groupRef.current.scale.setScalar(s);
  });

  return (
    <group ref={groupRef}>
      <mesh>
        <cylinderGeometry args={[1.65, 1.65, 0.05, 64]} />
        <meshPhysicalMaterial
          color={track.c1}
          roughness={0.12}
          metalness={0.6}
          clearcoat={1}
        />
      </mesh>
      <mesh position={[0, 0, 0.03]}>
        <ringGeometry args={[0.22, 0.62, 48]} />
        <meshBasicMaterial color={track.c2} side={THREE.DoubleSide} />
      </mesh>
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
}: {
  track: Track;
  project: Project;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<VisualMode>("props");
  const [fontSkin, setFontSkin] = useState<FontSkin>("sf");
  const [snippetClean, setSnippetClean] = useState(false);
  const [darkStage, setDarkStage] = useState(false);
  const [gravityOn, setGravityOn] = useState(true);
  const [impulseSignal, setImpulseSignal] = useState(0);

  return (
    <div
      className={`perf-player font-skin-${fontSkin} ${darkStage ? "stage-dark" : "stage-light"} ${
        snippetClean ? "snippet-clean" : ""
      }`}
    >
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
          <ambientLight intensity={darkStage ? 0.85 : 1.35} />
          <directionalLight position={[4, 6, 5]} intensity={1.8} />
          <pointLight position={[-4, -3, 3]} color={track.c2} intensity={6} />

          {mode === "props" && (
            <UncannyPropsPhysics
              accent={track.accent}
              c2={track.c2}
              impulseSignal={impulseSignal}
              gravityOn={gravityOn}
            />
          )}
          {mode === "boids" && <AlgorithmicParticles accent={track.accent} c2={track.c2} />}
          {mode === "ferro" && <FerrofluidMesh accent={track.accent} />}
          {mode === "cd" && <AcrylicDiscStage track={track} />}
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
          ↓ Minimizar reproductor
        </button>

        <div className="perf-badges">
          <span className="mono-badge">
            {track.bpm} BPM · KEY {track.key} · V{track.version}
          </span>
          <span className="mono-badge">{project.title}</span>
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

      {/* Overlay tipográfico gigante custom para grabar pantalla */}
      <div className="perf-center-typo">
        <div className="perf-artwork-card" style={{ background: `linear-gradient(135deg, ${track.c1}, ${track.c2})` }}>
          <span>{track.glyph}</span>
          <small>0261 // MZA</small>
        </div>
        <p className="perf-kicker">
          {track.artist} {track.feat ? `feat. ${track.feat}` : ""} — prod. {track.prod || track.artist}
        </p>
        <h1 className="perf-title">{track.title}</h1>
        {track.note && <span className="perf-note">“{track.note}”</span>}
      </div>

      {/* Dock de customización en vivo (se oculta en modo Snippet Clean para que grabes la pantalla limpia) */}
      {!snippetClean && (
        <footer className="perf-dock">
          <div className="perf-customizer-row">
            <div className="cust-group">
              <label>VISUAL ENGINE</label>
              <div className="seg-pills">
                {(
                  [
                    ["props", "📦 Props 3D + Físicas"],
                    ["boids", "✨ Partículas Algorítmicas"],
                    ["ferro", "💧 Ferrofluido Audio"],
                    ["cd", "💿 Disco Acrílico"],
                  ] as [VisualMode, string][]
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={mode === id ? "on" : ""}
                    onMouseEnter={() => sfx.hover()}
                    onClick={() => {
                      sfx.tap();
                      setMode(id);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="cust-group">
              <label>TIPOGRAFÍA</label>
              <div className="seg-pills">
                {(
                  [
                    ["sf", "SF Display"],
                    ["serif", "Editorial Serif"],
                    ["mono", "JetBrains Mono"],
                    ["gothic", "0261 Display"],
                  ] as [FontSkin, string][]
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={fontSkin === id ? "on" : ""}
                    onMouseEnter={() => sfx.hover()}
                    onClick={() => {
                      sfx.tap();
                      setFontSkin(id);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="cust-group">
              <label>FÍSICAS / ESCENA</label>
              <div className="seg-pills">
                {mode === "props" && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setImpulseSignal((n) => n + 1);
                        sfx.drop();
                      }}
                    >
                      💥 Patear Props
                    </button>
                    <button
                      type="button"
                      className={!gravityOn ? "on" : ""}
                      onClick={() => {
                        sfx.tap();
                        setGravityOn((g) => !g);
                      }}
                    >
                      {gravityOn ? "🪐 Gravedad 0G" : "🌍 Gravedad Normal"}
                    </button>
                  </>
                )}
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
              {isPlaying ? "❚❚ Pausar" : "▶ Reproducir"}
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
