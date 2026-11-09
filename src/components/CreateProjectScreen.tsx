"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import {
  type ArtistProfile,
  type Project,
  type ProjectType,
  type ProjectVideoClip,
  type Track,
} from "@/lib/mock";
import { sfx } from "@/lib/sfx";

type SentientBehavior = "auto" | "logo" | "clusters" | "shapes" | "scatter";

// Genera una nube de puntos 3D volumétrica con la tipografía apretada de "El tablero" (estilo SecondStory)
function buildLogoTargets(count: number): Float32Array {
  const targets = new Float32Array(count * 3);
  if (typeof document === "undefined") return targets;

  const W = 720;
  const H = 220;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;

  g.fillStyle = "#000000";
  g.fillRect(0, 0, W, H);

  // Marco y punto de marca sutil + texto "El tablero" bien apretado
  g.fillStyle = "#ffffff";
  g.font = '800 132px -apple-system, BlinkMacSystemFont, "SF Pro Display", Inter, sans-serif';
  g.textAlign = "center";
  g.textBaseline = "middle";
  // Simulamos el tracking apretado (-0.065em) dibujando letra por letra
  const text = "El tablero";
  const chars = text.split("");
  const tightFactor = 0.87;
  const widths = chars.map((ch) => g.measureText(ch).width * tightFactor);
  const totalW = widths.reduce((a, b) => a + b, 0);
  let curX = (W - totalW) / 2;
  const centerY = H * 0.52;

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const cw = widths[i];
    g.fillText(ch, curX + cw * 0.5, centerY);
    curX += cw;
  }

  const img = g.getImageData(0, 0, W, H).data;
  const validPixels: [number, number][] = [];
  for (let y = 0; y < H; y += 2) {
    for (let x = 0; x < W; x += 2) {
      const lum = img[(y * W + x) * 4];
      if (lum > 110) {
        validPixels.push([(x / W - 0.5) * 6.4, (0.5 - y / H) * 1.95]);
      }
    }
  }

  if (validPixels.length === 0) {
    validPixels.push([0, 0]);
  }

  for (let i = 0; i < count; i++) {
    const ix = i * 3;
    const [px, py] = validPixels[(i * 7) % validPixels.length];
    // Extrusión 3D en varias capas de profundidad Z para que sea un modelo 3D macizo del logo "El tablero"
    const layer = ((i % 9) - 4) / 4; // -1 a +1
    const zDepth = layer * 0.26 + (Math.random() - 0.5) * 0.05;
    targets[ix] = px + (Math.random() - 0.5) * 0.022;
    targets[ix + 1] = py + (Math.random() - 0.5) * 0.022;
    targets[ix + 2] = zDepth;
  }

  return targets;
}

function SentientTableroSwarm({
  accent,
  c2,
  behavior,
  keystrokePulse,
}: {
  accent: string;
  c2: string;
  behavior: SentientBehavior;
  keystrokePulse: number;
}) {
  const pointsRef = useRef<THREE.Points>(null!);
  const count = 28000;
  const clusterCount = 12;
  const lastPulseRef = useRef(0);
  const keyEnergyRef = useRef(0);

  const sprite = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 16;
    c.height = 16;
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(8, 8, 1, 8, 8, 7.5);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.55, "rgba(255,255,255,0.82)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 16, 16);
    const tex = new THREE.CanvasTexture(c);
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    return tex;
  }, []);

  const logoTargets = useMemo(() => buildLogoTargets(count), [count]);

  const { positions, velocities, colors, clusterIds, phases, shapeTargets } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const vel = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const cIds = new Uint8Array(count);
    const ph = new Float32Array(count);
    const shapes = new Float32Array(count * 3);

    const cA = new THREE.Color(accent);
    const cB = new THREE.Color(c2);
    const cInk = new THREE.Color("#0f0f11");

    for (let i = 0; i < count; i++) {
      const ix = i * 3;
      const cid = i % clusterCount;
      cIds[i] = cid;
      ph[i] = Math.random() * Math.PI * 2;

      // Posición inicial cerca del logo con dispersión suave
      pos[ix] = logoTargets[ix] + (Math.random() - 0.5) * 1.8;
      pos[ix + 1] = logoTargets[ix + 1] + (Math.random() - 0.5) * 1.8;
      pos[ix + 2] = logoTargets[ix + 2] + (Math.random() - 0.5) * 1.8;

      // Formas conectadas entre sí (anillos entrelazados + doble hélice + esfera geodésica)
      const u = (i / count) * Math.PI * 2;
      const subShape = i % 3;
      if (subShape === 0) {
        // Nudo / Anillo entrelazado
        const p = 2;
        const q = 3;
        const r = 1.45 + 0.45 * Math.cos(q * u * 6);
        shapes[ix] = r * Math.cos(p * u * 6) + (Math.random() - 0.5) * 0.14;
        shapes[ix + 1] = r * Math.sin(p * u * 6) * 0.72 + (Math.random() - 0.5) * 0.14;
        shapes[ix + 2] = 0.65 * Math.sin(q * u * 6) + (Math.random() - 0.5) * 0.14;
      } else if (subShape === 1) {
        // Esfera celular hueca con filamentos
        const phi = Math.acos(1 - 2 * ((i * 13) % count) / count);
        const theta = Math.PI * (1 + Math.sqrt(5)) * i;
        const rad = 1.55 + Math.sin(phi * 6) * 0.22;
        shapes[ix] = rad * Math.sin(phi) * Math.cos(theta);
        shapes[ix + 1] = rad * Math.cos(phi) * 0.85;
        shapes[ix + 2] = rad * Math.sin(phi) * Math.sin(theta);
      } else {
        // Espiral / ADN conectando los extremos
        const xHelix = ((i / count) - 0.5) * 5.8;
        const strand = i % 2 === 0 ? 0 : Math.PI;
        shapes[ix] = xHelix;
        shapes[ix + 1] = Math.sin(xHelix * 2.2 + strand) * 0.95 + (Math.random() - 0.5) * 0.12;
        shapes[ix + 2] = Math.cos(xHelix * 2.2 + strand) * 0.95 + (Math.random() - 0.5) * 0.12;
      }

      const mix = (i % 100) / 100;
      const chosen = i % 3 === 0 ? cInk : i % 3 === 1 ? cA.clone().lerp(cB, mix) : cB;
      col[ix] = chosen.r;
      col[ix + 1] = chosen.g;
      col[ix + 2] = chosen.b;
    }

    return {
      positions: pos,
      velocities: vel,
      colors: col,
      clusterIds: cIds,
      phases: ph,
      shapeTargets: shapes,
    };
  }, [accent, c2, logoTargets]);

  // Centros dinámicos de los 12 grupos sentientes
  const clusterCenters = useMemo(
    () => Array.from({ length: clusterCount }, () => new THREE.Vector3()),
    []
  );

  useFrame(({ clock, pointer }, dt) => {
    const clampedDt = Math.min(0.033, dt);
    const t = clock.elapsedTime;

    if (keystrokePulse !== lastPulseRef.current) {
      lastPulseRef.current = keystrokePulse;
      keyEnergyRef.current = Math.min(1.4, keyEnergyRef.current + 0.55);
    }
    keyEnergyRef.current *= 0.9;

    // Si está en "auto", el enjambre sentiente alterna orgánicamente entre:
    // 0: Logo 3D "El tablero" (con exploradoras sueltas) -> 1: Dispersión en Grupos -> 2: Formas entre sí -> 3: Explosión individual y regreso al Logo 3D
    const cyclePhase = (t * 0.18) % 4;
    let activeStage: "logo" | "clusters" | "shapes" | "scatter" = "logo";
    if (behavior !== "auto") {
      activeStage = behavior;
    } else if (cyclePhase < 1.35) {
      activeStage = "logo";
    } else if (cyclePhase < 2.25) {
      activeStage = "clusters";
    } else if (cyclePhase < 3.25) {
      activeStage = "shapes";
    } else {
      activeStage = "scatter";
    }

    // Actualizar las trayectorias autónomas de los 12 grupos (bandadas)
    for (let c = 0; c < clusterCount; c++) {
      const a = t * (0.75 + (c % 4) * 0.18) + c * 1.1;
      const b = t * (0.55 + (c % 3) * 0.22) - c * 0.8;
      clusterCenters[c].set(
        Math.cos(a) * 2.55 + Math.sin(b * 1.4) * 0.75,
        Math.sin(b) * 1.35 + Math.cos(a * 1.2) * 0.4,
        Math.sin(a * 0.8 + b) * 1.45
      );
    }

    const mx = pointer.x * 3.1;
    const my = pointer.y * 1.8;

    const geo = pointsRef.current.geometry;
    const attr = geo.getAttribute("position") as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;

    for (let i = 0; i < count; i++) {
      const ix = i * 3;
      const x = arr[ix];
      const y = arr[ix + 1];
      const z = arr[ix + 2];
      const ph = phases[i];
      const cid = clusterIds[i];

      let tx = logoTargets[ix];
      let ty = logoTargets[ix + 1];
      let tz = logoTargets[ix + 2];
      let springK = 14.0;
      let damping = 0.87;

      // Exploradoras individuales ("se dispersan de a una"): ~7% de las partículas salen a explorar por su cuenta en ondas rotativas
      const soloWave = Math.sin(t * 1.9 + ph * 8.0 + cid * 0.5);
      const isSoloScout = soloWave > 0.92;

      if (activeStage === "logo") {
        // Modelo 3D vivo de "El tablero" con respiración 3D y exploradoras individuales que se desprenden y vuelven
        const breath = Math.sin(t * 2.1 + tx * 0.8) * 0.045;
        tx += breath * 0.4;
        ty += breath;
        tz += Math.cos(t * 1.7 + tx * 1.2) * 0.08;

        if (isSoloScout) {
          // Sale de a una a orbitar alrededor del logo y luego vuelve a su letra
          tx += Math.cos(t * 3.2 + ph * 12) * 1.35;
          ty += Math.sin(t * 2.8 + ph * 10) * 1.15;
          tz += Math.sin(t * 3.6 + ph * 6) * 1.25;
          springK = 6.5;
        }
      } else if (activeStage === "clusters") {
        // Se dispersan en 12 grupos sentientes que orbitan, se cruzan y se pasan partículas entre sí
        const center = clusterCenters[cid];
        const orbitR = 0.32 + (i % 7) * 0.065;
        const localAngle = t * 2.8 + ph * 4;
        tx = center.x + Math.cos(localAngle) * orbitR;
        ty = center.y + Math.sin(localAngle * 1.3) * orbitR;
        tz = center.z + Math.sin(localAngle * 0.8 + ph) * orbitR;
        springK = 9.5;
        damping = 0.9;
      } else if (activeStage === "shapes") {
        // Crean formas geométricas/orgánicas entre sí (nudo + esfera celular + doble hélice rotando en 3D)
        const sx = shapeTargets[ix];
        const sy = shapeTargets[ix + 1];
        const sz = shapeTargets[ix + 2];
        const rotA = t * 0.55;
        const cosA = Math.cos(rotA);
        const sinA = Math.sin(rotA);
        tx = sx * cosA - sz * sinA;
        ty = sy + Math.sin(t * 2 + sx) * 0.1;
        tz = sx * sinA + sz * cosA;
        springK = 11.0;
      } else {
        // Dispersión libre individual y en racimos antes de volver a juntarse en el logo
        const burst = 1.65 + Math.sin(ph * 5 + t * 2) * 0.95;
        tx = logoTargets[ix] * burst + Math.cos(ph * 15 + t * 2.4) * 1.4;
        ty = logoTargets[ix + 1] * burst + Math.sin(ph * 13 - t * 2.1) * 1.25;
        tz = logoTargets[ix + 2] * burst + Math.sin(ph * 9 + t * 2.8) * 1.6;
        springK = 7.5;
      }

      // Impulso al escribir en el formulario de Crear Proyecto
      if (keyEnergyRef.current > 0.02) {
        const kPush = keyEnergyRef.current * 0.42;
        tx += Math.cos(ph * 17 + t * 8) * kPush;
        ty += Math.sin(ph * 19 + t * 8) * kPush;
        tz += Math.sin(ph * 11 - t * 8) * kPush;
      }

      // Repulsión/curiosidad sentiente al pasar el cursor cerca
      const dxm = x - mx;
      const dym = y - my;
      const distSq = dxm * dxm + dym * dym;
      let pushX = 0;
      let pushY = 0;
      let pushZ = 0;
      if (distSq < 1.15 && distSq > 0.0001) {
        const dist = Math.sqrt(distSq);
        const f = ((1.07 - dist) / 1.07) * 9.5;
        // Giran en remolino sentiente alrededor del puntero
        pushX = (dxm / dist) * f - (dym / dist) * f * 0.45;
        pushY = (dym / dist) * f + (dxm / dist) * f * 0.45;
        pushZ = Math.sin(ph * 8 + t * 5) * f * 0.4;
      }

      let vx = velocities[ix];
      let vy = velocities[ix + 1];
      let vz = velocities[ix + 2];

      vx = (vx + ((tx - x) * springK + pushX) * clampedDt) * damping;
      vy = (vy + ((ty - y) * springK + pushY) * clampedDt) * damping;
      vz = (vz + ((tz - z) * springK + pushZ) * clampedDt) * damping;

      velocities[ix] = vx;
      velocities[ix + 1] = vy;
      velocities[ix + 2] = vz;

      arr[ix] = x + vx * clampedDt * 6.2;
      arr[ix + 1] = y + vy * clampedDt * 6.2;
      arr[ix + 2] = z + vz * clampedDt * 6.2;
    }

    attr.needsUpdate = true;
  });

  return (
    <points ref={pointsRef} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        map={sprite}
        size={0.026}
        vertexColors
        transparent
        alphaTest={0.04}
        opacity={0.92}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
}

const PROJECT_TYPES: ProjectType[] = [
  "Mixtape",
  "EP",
  "LP",
  "Album",
  "Single",
  "Beatpost",
  "Soundkit",
  "Drumkit",
  "Loopkit",
  "Catálogo de Beats",
  "WIP",
];

export default function CreateProjectScreen({
  meProfile,
  existingCount,
  onCreateProject,
  onCancel,
}: {
  meProfile: ArtistProfile;
  existingCount: number;
  onCreateProject: (newProj: Project) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<ProjectType>("EP");
  const [status, setStatus] = useState<Project["status"]>("Publicado");
  const [zone, setZone] = useState("Mendoza");
  const [year, setYear] = useState("2026");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#e11d48");
  const [attrs, setAttrs] = useState<string[]>(["Mendoza", "2026", "808"]);
  const [attrInput, setAttrInput] = useState("");
  const [behavior, setBehavior] = useState<SentientBehavior>("auto");
  const [keystrokePulse, setKeystrokePulse] = useState(0);

  const [uploadedClips, setUploadedClips] = useState<ProjectVideoClip[]>([]);
  const [uploadedTracks, setUploadedTracks] = useState<Track[]>([]);

  const addAttr = () => {
    const clean = attrInput.trim();
    if (!clean || attrs.includes(clean)) return;
    setAttrs((prev) => [...prev, clean]);
    setAttrInput("");
    setKeystrokePulse((n) => n + 1);
    sfx.tap();
  };

  const handleVideoFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    sfx.drop();
    const added: ProjectVideoClip[] = files.map((file, i) => {
      const isImg =
        file.type.startsWith("image/") || /\.(gif|png|jpe?g|webp|avif)$/i.test(file.name);
      return {
        id: `clip-new-${Date.now()}-${i}`,
        label: file.name,
        kind: "uploaded",
        stylePreset: "vhs-grain",
        url: URL.createObjectURL(file),
        mediaType: isImg ? "image" : "video",
        c1: "#111111",
        c2: color,
      };
    });
    setUploadedClips((prev) => [...prev, ...added]);
    setKeystrokePulse((n) => n + 1);
  };

  const handleTrackFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    sfx.drop();
    const added: Track[] = files.map((file, i) => {
      const cleanName = file.name.replace(/\.[^/.]+$/, "");
      return {
        id: `tr-new-${Date.now()}-${i}`,
        title: cleanName,
        artist: meProfile.name,
        prod: meProfile.name,
        bpm: 136,
        key: "F#m",
        duration: "2:30",
        durationSec: 150,
        version: 1,
        c1: "#111111",
        c2: color,
        accent: color,
        glyph: String(uploadedTracks.length + i + 1).padStart(2, "0"),
        audioFreq: 130.8,
        customAudioUrl: URL.createObjectURL(file),
      };
    });
    setUploadedTracks((prev) => [...prev, ...added]);
    setKeystrokePulse((n) => n + 1);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalTitle = (title.trim() || `PROYECTO 0${existingCount + 1}`).toUpperCase();
    const angle = (existingCount * 1.35) % (Math.PI * 2);
    const blockPos: [number, number, number] = [
      Math.cos(angle) * 1.25,
      ((existingCount % 3) - 1) * 0.85,
      Math.sin(angle) * 0.95,
    ];

    const defaultTracks: Track[] =
      uploadedTracks.length > 0
        ? uploadedTracks
        : [
            {
              id: `tr-${Date.now()}-1`,
              title: `${title.trim() || "Track"} 01`,
              artist: meProfile.name,
              prod: meProfile.name,
              bpm: 138,
              key: "F#m",
              duration: "2:24",
              durationSec: 144,
              version: 1,
              c1: "#111111",
              c2: color,
              accent: color,
              glyph: "01",
              audioFreq: 130.8,
            },
          ];

    const defaultVideos: ProjectVideoClip[] =
      uploadedClips.length > 0
        ? uploadedClips
        : [
            {
              id: `v-${Date.now()}-1`,
              label: `${finalTitle.toLowerCase().replace(/\s+/g, "_")}_canvas.mp4 (4s)`,
              kind: "procedural",
              stylePreset: "kinetic-type",
              c1: "#111111",
              c2: color,
            },
          ];

    const newProject: Project = {
      id: `proj-${Date.now()}`,
      title: finalTitle,
      artist: meProfile.name,
      artistId: meProfile.id,
      type,
      status,
      year,
      dateLabel: "HOY",
      zone,
      attributes: attrs,
      c1: "#111111",
      c2: color,
      accent: color,
      tagGlyph: `0${existingCount + 1} // ${type.toUpperCase()}`,
      description:
        description.trim() ||
        `${type} de ${meProfile.name} creado en El tablero (${defaultTracks.length} tracks).`,
      plays: "0",
      blockPos,
      blockSize: [1.55, 1.45, 1.55],
      videos: defaultVideos,
      tracks: defaultTracks,
    };

    sfx.drop();
    onCreateProject(newProject);
  };

  return (
    <section className="create-project-page">
      <div className="section-header-row">
        <div>
          <span className="mono-tag">NUEVO PROYECTO // ENJAMBRE SENTIENTE 3D</span>
          <h1 className="editorial-h1">Crear Proyecto</h1>
        </div>
        <div className="seg-pills">
          <button
            type="button"
            className={behavior === "auto" ? "on" : ""}
            onClick={() => {
              sfx.tap();
              setBehavior("auto");
            }}
          >
            🔮 Sentiente Auto
          </button>
          <button
            type="button"
            className={behavior === "logo" ? "on" : ""}
            onClick={() => {
              sfx.tap();
              setBehavior("logo");
            }}
          >
            🏷️ Modelo 3D &ldquo;El tablero&rdquo;
          </button>
          <button
            type="button"
            className={behavior === "clusters" ? "on" : ""}
            onClick={() => {
              sfx.tap();
              setBehavior("clusters");
            }}
          >
            🐦 Grupos
          </button>
          <button
            type="button"
            className={behavior === "shapes" ? "on" : ""}
            onClick={() => {
              sfx.tap();
              setBehavior("shapes");
            }}
          >
            🧬 Formas
          </button>
          <button type="button" className="apple-btn ghost" onClick={onCancel}>
            ← Volver
          </button>
        </div>
      </div>

      {/* Escenario 3D Sentiente con el modelo 3D volumétrico de "El tablero" + bandadas y formas */}
      <div className="sentient-stage-card">
        <div className="sentient-canvas-box">
          <div className="sentient-stage-hud">
            <span className="mono-tag">
              28K PARTÍCULAS SENTIENTES · LOGO 3D &ldquo;EL TABLERO&rdquo; + BANDADAS AUTÓNOMAS
            </span>
            <span className="mono-tag">MOVÉ EL CURSOR O ESCRIBÍ ABAJO PARA EXCITAR EL ENJAMBRE</span>
          </div>

          <Canvas
            camera={{ position: [0, 0, 5.2], fov: 40 }}
            dpr={[1, 1.35]}
            gl={{ antialias: false, powerPreference: "high-performance" }}
          >
            <SentientTableroSwarm
              accent={color}
              c2={color}
              behavior={behavior}
              keystrokePulse={keystrokePulse}
            />
            <OrbitControls
              enableZoom={true}
              minDistance={2.8}
              maxDistance={9.5}
              enablePan={false}
              rotateSpeed={0.65}
            />
          </Canvas>
        </div>

        {/* Formulario de creación del proyecto */}
        <form className="create-project-form" onSubmit={handleSubmit}>
          <div className="create-form-grid">
            <label className="modal-field">
              <span>NOMBRE DEL PROYECTO</span>
              <input
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setKeystrokePulse((n) => n + 1);
                }}
                placeholder="ej. FUEGO LENTO VOL. 2"
                required
              />
            </label>

            <label className="modal-field">
              <span>TIPO DE PROYECTO</span>
              <select
                className="apple-select"
                value={type}
                onChange={(e) => {
                  setType(e.target.value as ProjectType);
                  setKeystrokePulse((n) => n + 1);
                }}
              >
                {PROJECT_TYPES.map((pt) => (
                  <option key={pt} value={pt}>
                    {pt}
                  </option>
                ))}
              </select>
            </label>

            <label className="modal-field">
              <span>ESTADO</span>
              <select
                className="apple-select"
                value={status}
                onChange={(e) => setStatus(e.target.value as Project["status"])}
              >
                <option value="Publicado">Publicado</option>
                <option value="En mezcla">En mezcla</option>
                <option value="Master">Master</option>
                <option value="WIP">WIP</option>
                <option value="Privado">Privado</option>
              </select>
            </label>

            <div className="modal-field">
              <span>COLOR DEL BLOQUE &amp; ENJAMBRE</span>
              <div className="color-dots">
                {["#e11d48", "#0284c7", "#ca8a04", "#65a30d", "#7e22ce", "#14b8a6"].map((c) => (
                  <button
                    key={c}
                    type="button"
                    style={{ background: c }}
                    className={color === c ? "on" : ""}
                    onClick={() => {
                      sfx.tap();
                      setColor(c);
                      setKeystrokePulse((n) => n + 1);
                    }}
                  />
                ))}
              </div>
            </div>

            <label className="modal-field full">
              <span>DESCRIPCIÓN / CONCEPTO DEL PROYECTO</span>
              <input
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  setKeystrokePulse((n) => n + 1);
                }}
                placeholder="Grabado en Mendoza, sintetizadores analógicos, 808 crudo..."
              />
            </label>

            <div className="modal-field full">
              <span>ATRIBUTOS DEL PROYECTO</span>
              <div className="project-editable-meta-bar">
                {attrs.map((a) => (
                  <span key={a} className="meta-user-attr-pill">
                    {a}
                    <button
                      type="button"
                      onClick={() => setAttrs((prev) => prev.filter((x) => x !== a))}
                    >
                      ✕
                    </button>
                  </span>
                ))}
                <div className="meta-add-attr-form">
                  <input
                    value={attrInput}
                    onChange={(e) => setAttrInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addAttr();
                      }
                    }}
                    placeholder="+ Agregar atributo (Enter)"
                  />
                  <button type="button" className="meta-attr-submit" onClick={addAttr}>
                    +
                  </button>
                </div>
              </div>
            </div>

            <div className="modal-field">
              <span>CANVAS (VIDEOS 3-5S / GIFS OPCIONALES)</span>
              <label className="apple-btn ghost" style={{ justifyContent: "center" }}>
                <span>
                  🎞️ {uploadedClips.length > 0 ? `${uploadedClips.length} clips listos` : "+ Subir videos 3-5s"}
                </span>
                <input
                  type="file"
                  accept="video/*,image/gif,image/*"
                  multiple
                  hidden
                  onChange={handleVideoFiles}
                />
              </label>
            </div>

            <div className="modal-field">
              <span>CANCIONES INICIALES (WAV / MP3 OPCIONAL)</span>
              <label className="apple-btn ghost" style={{ justifyContent: "center" }}>
                <span>
                  🎵 {uploadedTracks.length > 0 ? `${uploadedTracks.length} tracks listos` : "+ Subir tracks"}
                </span>
                <input
                  type="file"
                  accept="audio/*"
                  multiple
                  hidden
                  onChange={handleTrackFiles}
                />
              </label>
            </div>
          </div>

          <div className="create-form-footer">
            <button type="button" className="apple-btn ghost" onClick={onCancel}>
              Cancelar
            </button>
            <button type="submit" className="apple-btn primary">
              ✓ Crear Proyecto en Biblioteca 3D
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
