"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { motion, AnimatePresence } from "framer-motion";
import { Unbounded } from "next/font/google";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import {
  type ArtistProfile,
  type Project,
  type ProjectType,
  type ProjectVideoClip,
  type Track,
} from "@/lib/mock";
import { sfx } from "@/lib/sfx";
import "./create-project.css";

const display = Unbounded({ subsets: ["latin"], weight: ["800"], display: "swap" });

const AUDIO_RE = /\.(wav|mp3|m4a|flac|aac|ogg|aiff|alac|opus)$/i;
const DEFAULT_TEXT = "EL TABLERO";

function useIsMobile() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const check = () => setMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return mobile;
}

function useTheme() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  useEffect(() => {
    const el = document.documentElement;
    const read = () => setTheme(el.getAttribute("data-theme") === "light" ? "light" : "dark");
    read();
    const mo = new MutationObserver(read);
    mo.observe(el, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, []);
  return theme;
}

/**
 * Muestrea el texto en un canvas 2D y devuelve una lista de puntos (x,y) en [-0.5, 0.5] x [-0.5, 0.5]
 * junto con la relación de aspecto del bloque de texto.
 */
function sampleText(rawText: string, fontFamily: string) {
  const text = (rawText.trim() || DEFAULT_TEXT).toUpperCase();
  const W = 1400;
  const H = 360;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.fillStyle = "#000";
  g.fillRect(0, 0, W, H);
  g.fillStyle = "#fff";
  g.textAlign = "center";
  g.textBaseline = "middle";
  let size = 250;
  g.font = `800 ${size}px ${fontFamily}`;
  const w = g.measureText(text).width;
  const maxW = W * 0.94;
  if (w > maxW) {
    size = Math.max(40, size * (maxW / w));
    g.font = `800 ${size}px ${fontFamily}`;
  }
  g.fillText(text, W / 2, H / 2);
  const data = g.getImageData(0, 0, W, H).data;
  const pts: number[] = [];
  const step = 3;
  let minX = W;
  let maxX = 0;
  for (let y = 0; y < H; y += step) {
    for (let x = 0; x < W; x += step) {
      if (data[(y * W + x) * 4] > 110) {
        pts.push(x, y);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
  }
  if (pts.length === 0) pts.push(W / 2, H / 2, minX, maxX);
  const bw = Math.max(1, maxX - minX);
  const cx = (minX + maxX) / 2;
  return { pts, W, H, cx, bw };
}

function MorphSwarm({
  text,
  fontReady,
  fontFamily,
  count,
  color,
}: {
  text: string;
  fontReady: boolean;
  fontFamily: string;
  count: number;
  color: string;
}) {
  const pointsRef = useRef<THREE.Points>(null!);
  const size = useThree((s) => s.size);
  const pointer = useRef({ x: 0, y: 0 });

  const sprite = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 32;
    c.height = 32;
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(16, 16, 0, 16, 16, 15);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.6, "rgba(255,255,255,0.9)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 32, 32);
    const tex = new THREE.CanvasTexture(c);
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    return tex;
  }, []);

  // Datos persistentes por partícula (no se reconstruyen al escribir)
  const data = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const targets = new Float32Array(count * 3);
    const pick = new Float32Array(count);
    const rate = new Float32Array(count);
    const depth = new Float32Array(count);
    const phase = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pick[i] = Math.random();
      rate[i] = 2.2 + Math.random() * 3.2;
      depth[i] = (Math.random() * 2 - 1) * 0.3;
      phase[i] = Math.random() * Math.PI * 2;
      positions[i * 3] = (Math.random() - 0.5) * 7;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 4;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 5;
    }
    return { positions, targets, pick, rate, depth, phase };
  }, [count]);

  // Recalcula SOLO los targets (mutando el buffer) cuando cambia el texto/tamaño
  useEffect(() => {
    if (!fontReady) return;
    const { pts, W, H, cx, bw } = sampleText(text, fontFamily);
    const n = pts.length / 2;
    const aspect = size.width / Math.max(1, size.height);
    const visH = 2 * 5.2 * Math.tan((40 * Math.PI) / 360);
    const visW = visH * aspect;
    const worldW = Math.min(visW * 0.9, 7.2);
    const scale = worldW / Math.max(bw, W * 0.35);
    const { targets, pick, depth } = data;
    for (let i = 0; i < count; i++) {
      const k = Math.min(n - 1, Math.floor(pick[i] * n));
      const px = pts[k * 2];
      const py = pts[k * 2 + 1];
      targets[i * 3] = (px - cx) * scale + (Math.random() - 0.5) * 0.008;
      targets[i * 3 + 1] = (H / 2 - py) * scale + 0.35 + (Math.random() - 0.5) * 0.008;
      targets[i * 3 + 2] = depth[i];
    }
  }, [text, fontReady, fontFamily, size.width, size.height, count, data]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  useFrame(({ clock }, dtRaw) => {
    const dt = Math.min(0.05, dtRaw);
    const t = clock.elapsedTime;
    const { positions, targets, rate, phase } = data;
    for (let i = 0; i < count; i++) {
      const ix = i * 3;
      const ph = phase[i];
      const tx = targets[ix] + Math.sin(t * 0.9 + ph) * 0.006;
      const ty = targets[ix + 1] + Math.cos(t * 0.8 + ph * 1.3) * 0.006;
      const tz = targets[ix + 2] + Math.sin(t * 0.6 + ph * 2) * 0.02;
      const k = 1 - Math.exp(-dt * rate[i]);
      positions[ix] += (tx - positions[ix]) * k;
      positions[ix + 1] += (ty - positions[ix + 1]) * k;
      positions[ix + 2] += (tz - positions[ix + 2]) * k;
    }
    const geo = pointsRef.current.geometry;
    (geo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    const p = pointsRef.current;
    p.rotation.y += (pointer.current.x * 0.22 + Math.sin(t * 0.35) * 0.08 - p.rotation.y) * 0.04;
    p.rotation.x += (pointer.current.y * 0.08 - p.rotation.x) * 0.04;
  });

  return (
    <points ref={pointsRef} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[data.positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        map={sprite}
        color={color}
        size={0.017}
        transparent
        alphaTest={0.05}
        opacity={0.95}
        toneMapped={false}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
}

function detectType(n: number): ProjectType {
  if (n <= 1) return "Single";
  if (n <= 6) return "EP";
  return "LP";
}

const ImageIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21 15 16 10 5 21" />
  </svg>
);
const WaveIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M4 10v4M8 6v12M12 3v18M16 8v8M20 11v2" />
  </svg>
);
const ClipIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <polygon points="10 9 15 12 10 15" />
  </svg>
);

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
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#e11d48");
  const [coverUrl, setCoverUrl] = useState("");
  const [uploadedClips, setUploadedClips] = useState<ProjectVideoClip[]>([]);
  const [uploadedTracks, setUploadedTracks] = useState<Track[]>([]);
  const [fontReady, setFontReady] = useState(false);

  const mobile = useIsMobile();
  const theme = useTheme();
  const fontFamily = display.style.fontFamily;
  const count = mobile ? 9000 : 22000;
  const inkColor = theme === "light" ? "#0f0f11" : "#f4f4f5";

  useEffect(() => {
    let alive = true;
    document.fonts
      .load(`800 100px ${fontFamily}`, "ELTABLERO")
      .catch(() => undefined)
      .finally(() => alive && setFontReady(true));
    return () => {
      alive = false;
    };
  }, [fontFamily]);

  const type = detectType(uploadedTracks.length);

  const handleCoverFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    sfx.drop();
    setCoverUrl(URL.createObjectURL(file));
  };

  const makeTracks = (files: File[]): Track[] =>
    files.map((file, i) => ({
      id: `tr-new-${Date.now()}-${i}`,
      title: file.name.replace(/\.[^/.]+$/, ""),
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
    }));

  const handleTrackFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    sfx.drop();
    setUploadedTracks((prev) => [...prev, ...makeTracks(files)]);
  };

  const handleVideoFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawFiles = Array.from(e.target.files || []);
    if (rawFiles.length === 0) return;
    sfx.drop();
    const isAudio = (f: File) => f.type.startsWith("audio/") || AUDIO_RE.test(f.name);
    const audioFiles = rawFiles.filter(isAudio);
    const videoFiles = rawFiles.filter((f) => !isAudio(f));
    if (audioFiles.length > 0) setUploadedTracks((prev) => [...prev, ...makeTracks(audioFiles)]);
    if (videoFiles.length > 0) {
      const added: ProjectVideoClip[] = videoFiles.map((file, i) => ({
        id: `clip-new-${Date.now()}-${i}`,
        label: file.name,
        kind: "uploaded",
        stylePreset: "vhs-grain",
        url: URL.createObjectURL(file),
        mediaType:
          file.type.startsWith("image/") || /\.(gif|png|jpe?g|webp|avif)$/i.test(file.name)
            ? "image"
            : "video",
        c1: "#111111",
        c2: color,
      }));
      setUploadedClips((prev) => [...prev, ...added]);
    }
  };

  const uid = (p: string) =>
    typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${p}-${Date.now()}`;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalTitle = (title.trim() || `PROYECTO 0${existingCount + 1}`).toUpperCase();
    const angle = (existingCount * 1.35) % (Math.PI * 2);
    const blockPos: [number, number, number] = [
      Math.cos(angle) * 1.25,
      ((existingCount % 3) - 1) * 0.85,
      Math.sin(angle) * 0.95,
    ];

    const tracks: Track[] =
      uploadedTracks.length > 0
        ? uploadedTracks
        : [
            {
              id: uid("tr"),
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

    const videos: ProjectVideoClip[] =
      uploadedClips.length > 0
        ? uploadedClips
        : [
            {
              id: uid("v"),
              label: `${finalTitle.toLowerCase().replace(/\s+/g, "_")}_canvas.mp4 (4s)`,
              kind: "procedural",
              stylePreset: "kinetic-type",
              c1: "#111111",
              c2: color,
            },
          ];

    const newProject: Project = {
      id: uid("proj"),
      title: finalTitle,
      artist: meProfile.name,
      artistId: meProfile.id,
      type,
      status: "Publicado",
      year: String(new Date().getFullYear()),
      dateLabel: "HOY",
      zone: "Mendoza",
      attributes: [],
      coverUrl: coverUrl || undefined,
      c1: "#111111",
      c2: color,
      accent: color,
      tagGlyph: `0${existingCount + 1} // ${type.toUpperCase()}`,
      description: description.trim(),
      plays: "0",
      blockPos,
      blockSize: [1.55, 1.45, 1.55],
      videos,
      tracks,
    };

    sfx.drop();
    onCreateProject(newProject);
  };

  return (
    <section className="cp-page">
      <div className="cp-stage" aria-hidden>
        <Canvas
          camera={{ position: [0, 0, 5.2], fov: 40 }}
          dpr={[1, 1.5]}
          gl={{ antialias: false, alpha: true, powerPreference: "high-performance" }}
        >
          <MorphSwarm
            text={title}
            fontReady={fontReady}
            fontFamily={fontFamily}
            count={count}
            color={inkColor}
          />
        </Canvas>
      </div>

      <div className="cp-content">
        <button type="button" className="cp-back" onClick={onCancel}>
          ← Volver
        </button>

        <motion.form
          className="cp-card"
          onSubmit={handleSubmit}
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 140, damping: 20 }}
        >
          <h1 className="cp-title">Crear proyecto</h1>

          <input
            className="cp-input cp-input-lg"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Nombre del proyecto"
            required
            autoFocus
          />
          <input
            className="cp-input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Descripción"
          />

          <div className="cp-tiles">
            <div className="cp-tile">
              <span className="cp-label">Artwork</span>
              <AnimatePresence mode="wait" initial={false}>
                {coverUrl ? (
                  <motion.div
                    key="cover"
                    className="cp-cover-row"
                    initial={{ opacity: 0, scale: 0.94 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.94 }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={coverUrl} alt="Artwork" className="cp-cover" />
                    <div className="cp-cover-actions">
                      <label className="cp-link">
                        Cambiar
                        <input type="file" accept="image/*,image/gif" hidden onChange={handleCoverFile} />
                      </label>
                      <button type="button" className="cp-link" onClick={() => setCoverUrl("")}>
                        Quitar
                      </button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.label
                    key="drop"
                    className="cp-drop"
                    whileHover={{ scale: 1.015 }}
                    whileTap={{ scale: 0.97 }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <ImageIcon />
                    <span>Subir portada (jpg, png, webp, gif)</span>
                    <input type="file" accept="image/*,image/gif" hidden onChange={handleCoverFile} />
                  </motion.label>
                )}
              </AnimatePresence>
            </div>

            <div className="cp-tile">
              <span className="cp-label">Tracks (wav, mp3)</span>
              <motion.label
                className={`cp-drop${uploadedTracks.length ? " on" : ""}`}
                whileHover={{ scale: 1.015 }}
                whileTap={{ scale: 0.97 }}
              >
                <WaveIcon />
                <span>
                  {uploadedTracks.length > 0
                    ? `${uploadedTracks.length} · ${type === "LP" ? "Álbum" : type}`
                    : "Subir tracks"}
                </span>
                <input
                  type="file"
                  accept=".wav,.mp3,.m4a,.flac,.aac,.ogg,.aiff,.alac,.opus,audio/wav,audio/x-wav,audio/wave,audio/mpeg,audio/mp3,audio/mp4,audio/x-m4a,audio/aac,audio/flac,application/octet-stream"
                  multiple
                  hidden
                  onChange={handleTrackFiles}
                />
              </motion.label>
            </div>

            <div className="cp-tile">
              <span className="cp-label">Canvas</span>
              <motion.label
                className={`cp-drop${uploadedClips.length ? " on" : ""}`}
                whileHover={{ scale: 1.015 }}
                whileTap={{ scale: 0.97 }}
              >
                <ClipIcon />
                <span>{uploadedClips.length > 0 ? `${uploadedClips.length} clips` : "Subir canvas"}</span>
                <input type="file" accept="video/*,image/gif,image/*" multiple hidden onChange={handleVideoFiles} />
              </motion.label>
            </div>
          </div>

          <div className="cp-colors">
            {["#e11d48", "#0284c7", "#ca8a04", "#65a30d", "#7e22ce", "#14b8a6"].map((c) => (
              <motion.button
                key={c}
                type="button"
                aria-label={c}
                style={{ background: c }}
                className={color === c ? "on" : ""}
                whileHover={{ scale: 1.15 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => {
                  sfx.tap();
                  setColor(c);
                }}
              />
            ))}
          </div>

          <motion.button type="submit" className="cp-submit" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
            Crear proyecto
          </motion.button>
        </motion.form>
      </div>
    </section>
  );
}
