"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { type Project, type Track } from "@/lib/mock";
import { sfx } from "@/lib/sfx";

function ResponsiveSpinnerGroup({ children }: { children: React.ReactNode }) {
  const width = useThree((s) => s.size.width);
  const scale = width < 420 ? 0.76 : width < 540 ? 0.86 : 1;
  return (
    <group position={[0, -0.15, 0]} scale={scale}>
      {children}
    </group>
  );
}

function useDiscPlateTexture(track: Track, projectCoverUrl?: string, index: number = 0, total: number = 1) {
  const [texture, setTexture] = useState<THREE.Texture>(() => {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 512;
    const g = c.getContext("2d")!;
    g.fillStyle = "#0c0d12";
    g.fillRect(0, 0, 512, 512);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  });

  useEffect(() => {
    let active = true;
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 512;
    const g = c.getContext("2d")!;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;

    const imgUrl = track.coverUrl || projectCoverUrl;

    const draw = (img?: HTMLImageElement) => {
      if (!active) return;
      g.fillStyle = "#0c0d12";
      g.fillRect(0, 0, 512, 512);

      if (img) {
        // Tapa real de la canción / proyecto 1:1 limpia
        g.drawImage(img, 0, 0, 512, 512);

        // Borde fino de acabado vinilo/sleeve
        g.strokeStyle = "rgba(255,255,255,0.18)";
        g.lineWidth = 3;
        g.strokeRect(3, 3, 506, 506);
      } else {
        // Placeholder estilizado limpio con gradiente del track
        const grad = g.createLinearGradient(0, 0, 512, 512);
        grad.addColorStop(0, track.c1 || "#161720");
        grad.addColorStop(1, track.c2 || "#282a36");
        g.fillStyle = grad;
        g.fillRect(0, 0, 512, 512);

        // Borde fino
        g.strokeStyle = "rgba(255,255,255,0.18)";
        g.lineWidth = 3;
        g.strokeRect(3, 3, 506, 506);

        // Número de track sutil
        g.fillStyle = "rgba(255,255,255,0.18)";
        g.font = "800 120px Inter, -apple-system, sans-serif";
        g.textAlign = "center";
        g.fillText(String(index + 1).padStart(2, "0"), 256, 280);

        // Título del Track
        g.fillStyle = "#ffffff";
        g.font = "700 28px Inter, -apple-system, sans-serif";
        const cleanTitle = (track.title || "Track").slice(0, 22);
        g.fillText(cleanTitle, 256, 360);

        // Artista
        g.fillStyle = "rgba(255,255,255,0.65)";
        g.font = "500 18px Inter, -apple-system, sans-serif";
        const cleanArtist = (track.artist || "").slice(0, 26);
        g.fillText(cleanArtist, 256, 400);
      }

      tex.needsUpdate = true;
      setTexture(tex);
    };

    if (imgUrl) {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = () => draw(image);
      image.onerror = () => draw();
      image.src = imgUrl;
    } else {
      draw();
    }

    return () => {
      active = false;
      tex.dispose();
    };
  }, [track.id, track.coverUrl, track.title, track.artist, projectCoverUrl, index, total]);

  return texture;
}

type FanDrag = {
  angle: number;
  vel: number;
  dragging: boolean;
};

function DiscPlate({
  track,
  index,
  total,
  dragRef,
  activeIdx,
  hoveredIdx,
  setHoveredIdx,
  onSelectTrack,
  movedRef,
  projectCoverUrl,
}: {
  track: Track;
  index: number;
  total: number;
  dragRef: React.RefObject<FanDrag>;
  activeIdx: number;
  hoveredIdx: number | null;
  setHoveredIdx: (i: number | null) => void;
  onSelectTrack: (t: Track, i: number) => void;
  movedRef: React.RefObject<boolean>;
  projectCoverUrl?: string;
}) {
  const groupRef = useRef<THREE.Group>(null!);
  const tex = useDiscPlateTexture(track, projectCoverUrl, index, total);
  const liftRef = useRef(0);

  useFrame((_, dt) => {
    const stepAngle = (Math.PI * 1.05) / Math.max(1, total);
    const rel = index - dragRef.current.angle;
    const theta = rel * stepAngle;

    const isFocused = index === activeIdx;
    const isHov = hoveredIdx === index;
    liftRef.current = THREE.MathUtils.damp(
      liftRef.current,
      isHov ? 1 : isFocused ? 0.55 : 0,
      10,
      dt
    );

    const radius = 1.85;
    const x = Math.sin(theta) * radius;
    const z = Math.cos(theta) * radius * 0.58 + liftRef.current * 0.45;
    const y = -Math.abs(rel) * 0.06 + liftRef.current * 0.24;

    const g = groupRef.current;
    g.position.set(x, y, z);
    g.rotation.set(
      -0.22 + liftRef.current * 0.12,
      -theta * 0.72 - 0.25,
      -theta * 0.16
    );
  });

  return (
    <group ref={groupRef}>
      <mesh
        onPointerOver={(e) => {
          e.stopPropagation();
          setHoveredIdx(index);
          sfx.hover();
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHoveredIdx(null);
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
            sfx.play();
            onSelectTrack(track, index);
          }
        }}
      >
        <boxGeometry args={[2.0, 2.0, 0.04]} />
        <meshBasicMaterial map={tex} />
      </mesh>
    </group>
  );
}

function SpinnerParticles() {
  const pointsRef = useRef<THREE.Points>(null!);
  const count = 300;
  const [positions, phases] = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const ph = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const angle = (Math.random() - 0.5) * Math.PI * 1.5;
      const r = 1.2 + Math.random() * 1.6;
      pos[i * 3] = Math.sin(angle) * r + (Math.random() - 0.5) * 0.4;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 1.6;
      pos[i * 3 + 2] = Math.cos(angle) * r * 0.6 + (Math.random() - 0.5) * 0.8;
      ph[i] = Math.random() * Math.PI * 2;
    }
    return [pos, ph];
  }, [count]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (!pointsRef.current) return;
    const posAttr = pointsRef.current.geometry.attributes.position as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;
    for (let i = 0; i < count; i++) {
      const idx = i * 3;
      arr[idx + 1] += Math.sin(t * 1.3 + phases[i]) * 0.0016;
    }
    posAttr.needsUpdate = true;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.04}
        color="#ffffff"
        transparent
        opacity={0.8}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}

function SpinnerPhysics({
  total,
  dragRef,
  onActiveChange,
}: {
  total: number;
  dragRef: React.RefObject<FanDrag>;
  onActiveChange: (idx: number) => void;
}) {
  const lastIdx = useRef(0);
  useFrame((_, dt) => {
    const s = dragRef.current;
    if (!s.dragging) {
      s.angle += s.vel * dt;
      s.vel *= Math.pow(0.05, dt);
      const target = Math.round(s.angle);
      if (Math.abs(s.vel) < 1.2) {
        s.angle = THREE.MathUtils.damp(s.angle, target, 9, dt);
      }
      s.angle = THREE.MathUtils.clamp(s.angle, 0, Math.max(0, total - 1));
    }
    const clamped = THREE.MathUtils.clamp(Math.round(s.angle), 0, Math.max(0, total - 1));
    if (clamped !== lastIdx.current) {
      lastIdx.current = clamped;
      sfx.tick();
      onActiveChange(clamped);
    }
  });
  return null;
}

export default function DiscSpinner3D({
  project,
  currentTrackId,
  onPlayTrack,
  onDeleteTrack,
  compact = false,
}: {
  project: Project;
  currentTrackId?: string;
  onPlayTrack: (track: Track, project: Project) => void;
  onDeleteTrack?: (projectId: string, trackId: string) => void;
  compact?: boolean;
}) {
  const tracks = project.tracks;
  const dragRef = useRef<FanDrag>({ angle: 0, vel: 0, dragging: false });
  const movedRef = useRef(false);
  const startRef = useRef({ x: 0, angle: 0, t: 0, lx: 0 });
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);

  const safeIdx = Math.min(tracks.length - 1, Math.max(0, activeIdx));
  const focusedTrack = tracks[safeIdx] || tracks[0];

  const stepTo = (idx: number) => {
    const next = Math.max(0, Math.min(tracks.length - 1, idx));
    dragRef.current.angle = next;
    dragRef.current.vel = 0;
    setActiveIdx(next);
    sfx.tick();
  };

  return (
    <div className={`disc-spinner-wrap ${compact ? "is-compact" : ""}`}>
      <div className="disc-spinner-meta">
        <span className="mono-tag">Spinner</span>
        <span className="mono-tag">ARRASTRÁ O TOCÁ UN DISCO</span>
      </div>

      <div
        className="disc-spinner-stage"
        onPointerDown={(e) => {
          (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
          dragRef.current.dragging = true;
          movedRef.current = false;
          startRef.current = {
            x: e.clientX,
            angle: dragRef.current.angle,
            t: performance.now(),
            lx: e.clientX,
          };
        }}
        onPointerMove={(e) => {
          if (!dragRef.current.dragging) return;
          const dx = e.clientX - startRef.current.x;
          if (Math.abs(dx) > 5) movedRef.current = true;
          const now = performance.now();
          const dt = Math.max(1, now - startRef.current.t) / 1000;
          dragRef.current.vel = -((e.clientX - startRef.current.lx) / 110) / dt;
          startRef.current.t = now;
          startRef.current.lx = e.clientX;
          dragRef.current.angle = THREE.MathUtils.clamp(
            startRef.current.angle - dx / 110,
            -0.35,
            tracks.length - 0.65
          );
        }}
        onPointerUp={() => {
          dragRef.current.dragging = false;
        }}
        onPointerLeave={() => {
          dragRef.current.dragging = false;
        }}
      >
        {/* Cámara con zoom out y más desde arriba */}
        <Canvas camera={{ position: [0, 1.35, 6.8], fov: 36 }} dpr={[1, 2]}>
          <ambientLight intensity={1.4} />
          <directionalLight position={[4, 6, 5]} intensity={1.6} />
          <ResponsiveSpinnerGroup>
            {tracks.map((t, i) => (
              <DiscPlate
                key={t.id}
                track={t}
                index={i}
                total={tracks.length}
                dragRef={dragRef}
                activeIdx={safeIdx}
                hoveredIdx={hoveredIdx}
                setHoveredIdx={setHoveredIdx}
                movedRef={movedRef}
                projectCoverUrl={project.coverUrl}
                onSelectTrack={(tr, idx) => {
                  dragRef.current.angle = idx;
                  setActiveIdx(idx);
                  onPlayTrack(tr, project);
                }}
              />
            ))}
            <SpinnerParticles />
          </ResponsiveSpinnerGroup>
          <SpinnerPhysics
            total={tracks.length}
            dragRef={dragRef}
            onActiveChange={setActiveIdx}
          />
        </Canvas>
      </div>

      {focusedTrack && (
        <div className="disc-spinner-footer">
          <div className="disc-pills">
            {tracks.map((t, i) => (
              <button
                key={t.id}
                type="button"
                className={`disc-pill ${i === safeIdx ? "active" : ""} ${currentTrackId === t.id ? "playing" : ""}`}
                onClick={() => stepTo(i)}
                onMouseEnter={() => sfx.hover()}
              >
                <span>{String(i + 1).padStart(2, "0")}</span>
                <b>{t.title}</b>
              </button>
            ))}
          </div>

          <div className="disc-focused-bar">
            <div>
              <span className="mono-tag">
                DISCO {safeIdx + 1}/{tracks.length} · {focusedTrack.bpm} BPM · {focusedTrack.key} · v{focusedTrack.version}
              </span>
              <h4>{focusedTrack.title}</h4>
            </div>
            <div className="row-actions">
              <button
                type="button"
                className="apple-btn primary"
                onMouseEnter={() => sfx.hover()}
                onClick={() => onPlayTrack(focusedTrack, project)}
              >
                {currentTrackId === focusedTrack.id ? "Sonando · Abrir Studio" : "▶ Reproducir"}
              </button>
              {onDeleteTrack && tracks.length > 1 && (
                <button
                  type="button"
                  className="trash-icon-btn"
                  title={`Eliminar track ${focusedTrack.title}`}
                  onClick={() => {
                    sfx.tap();
                    onDeleteTrack(project.id, focusedTrack.id);
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
