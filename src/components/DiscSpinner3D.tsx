"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { type Project, type Track } from "@/lib/mock";
import { sfx } from "@/lib/sfx";

function createDiscTexture(t: Track, idx: number, total: number) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const g = c.getContext("2d")!;

  g.fillStyle = idx % 2 === 0 ? t.c1 : "#f8fafc";
  g.fillRect(0, 0, 512, 512);

  g.fillStyle = t.c2;
  g.fillRect(28, 28, 456, 210);

  g.fillStyle = idx % 2 === 0 ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";
  for (let y = 0; y < 512; y += 6) {
    g.fillRect(0, y, 512, 2);
  }

  g.fillStyle = idx % 2 === 0 ? "#ffffff" : "#09090b";
  g.font = "700 138px Inter, -apple-system, sans-serif";
  g.fillText(String(idx + 1).padStart(2, "0"), 34, 380);

  g.fillStyle = "#ffffff";
  g.font = "600 22px monospace";
  g.fillText(`${t.bpm} BPM · ${t.key} · V${t.version}`, 48, 76);

  g.fillStyle = idx % 2 === 0 ? "#ffffff" : "#09090b";
  g.font = "600 32px Inter, -apple-system, sans-serif";
  g.fillText(t.title.slice(0, 18).toUpperCase(), 36, 444);

  g.fillStyle = idx % 2 === 0 ? "rgba(255,255,255,0.62)" : "rgba(9,9,11,0.55)";
  g.font = "500 20px monospace";
  g.fillText(`${t.artist} // TRACK ${idx + 1} DE ${total}`, 36, 480);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
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
}) {
  const groupRef = useRef<THREE.Group>(null!);
  const tex = useMemo(() => createDiscTexture(track, index, total), [track, index, total]);
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
      <RoundedBox
        args={[1.95, 2.35, 0.035]}
        radius={0.03}
        smoothness={4}
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
        onClick={(e) => {
          e.stopPropagation();
          if (!movedRef.current) {
            sfx.play();
            onSelectTrack(track, index);
          }
        }}
      >
        <meshBasicMaterial map={tex} />
      </RoundedBox>
    </group>
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
  compact = false,
}: {
  project: Project;
  currentTrackId?: string;
  onPlayTrack: (track: Track, project: Project) => void;
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
        <span className="mono-tag">SPINNER // {tracks.length} DISCOS EXACTOS</span>
        <span className="mono-tag">YR 26 · ARRASTRÁ O TOCÁ UNA LÁMINA</span>
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
          <group position={[0, -0.15, 0]}>
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
                onSelectTrack={(tr, idx) => {
                  dragRef.current.angle = idx;
                  setActiveIdx(idx);
                  onPlayTrack(tr, project);
                }}
              />
            ))}
          </group>
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
            <button
              type="button"
              className="apple-btn primary"
              onMouseEnter={() => sfx.hover()}
              onClick={() => onPlayTrack(focusedTrack, project)}
            >
              {currentTrackId === focusedTrack.id ? "Sonando · Abrir Studio" : "▶ Reproducir corte"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
