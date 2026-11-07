"use client";
import { Canvas, useFrame } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { releases, type Release } from "@/lib/mock";
import { sfx } from "@/lib/sfx";

function makeCover(r: Release) {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(180, 200, 20, 256, 256, 420);
  grd.addColorStop(0, r.c1);
  grd.addColorStop(1, r.c2);
  g.fillStyle = grd;
  g.fillRect(0, 0, 512, 512);
  // scanlines dosmileras
  g.globalAlpha = 0.08;
  for (let y = 0; y < 512; y += 4) { g.fillStyle = "#000"; g.fillRect(0, y, 512, 2); }
  g.globalAlpha = 1;
  g.fillStyle = "rgba(255,255,255,0.92)";
  g.font = "bold 44px Michroma, sans-serif";
  g.fillText(r.title.toUpperCase(), 32, 440);
  g.font = "24px sans-serif";
  g.fillStyle = "rgba(255,255,255,0.6)";
  g.fillText(`${r.artist} · ${r.type}`, 32, 478);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

type DragState = { offset: number; vel: number; dragging: boolean };

function Card({ r, i, state, hovered, setHovered, onOpen, moved }: {
  r: Release; i: number; state: React.RefObject<DragState>;
  hovered: number | null; setHovered: (n: number | null) => void;
  onOpen: (r: Release) => void; moved: React.RefObject<boolean>;
}) {
  const ref = useRef<THREE.Group>(null!);
  const tex = useMemo(() => makeCover(r), [r]);
  const lift = useRef(0);
  useFrame((_, dt) => {
    const d = i - state.current.offset;
    lift.current = THREE.MathUtils.damp(lift.current, hovered === i ? 1 : 0, 10, dt);
    const g = ref.current;
    g.position.set(d * 1.05 - lift.current * 0.4, d * 0.55 + lift.current * 0.15, -d * 1.3 + lift.current * 0.9);
    g.rotation.set(0, -0.75 + lift.current * 0.35, 0);
    g.visible = d > -3.5 && d < 9;
  });
  return (
    <group ref={ref}>
      <RoundedBox
        args={[2.4, 2.4, 0.04]} radius={0.03}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(i); sfx.hover(); document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { setHovered(null); document.body.style.cursor = ""; }}
        onClick={(e) => { e.stopPropagation(); if (!moved.current) { sfx.open(); onOpen(r); } }}
      >
        <meshPhysicalMaterial map={tex} roughness={0.15} metalness={0.1} clearcoat={1} transmission={0.08} transparent opacity={0.94} />
      </RoundedBox>
    </group>
  );
}

function Physics({ state, onIndex }: { state: React.RefObject<DragState>; onIndex: (n: number) => void }) {
  const last = useRef(0);
  useFrame((_, dt) => {
    const s = state.current;
    if (!s.dragging) {
      s.offset += s.vel * dt;
      s.vel *= Math.pow(0.04, dt);
      const target = Math.round(s.offset);
      if (Math.abs(s.vel) < 1.5) s.offset = THREE.MathUtils.damp(s.offset, target, 8, dt);
      s.offset = THREE.MathUtils.clamp(s.offset, -0.4, releases.length - 0.6);
    }
    const idx = Math.round(s.offset);
    if (idx !== last.current) { last.current = idx; sfx.tick(); onIndex(idx); }
  });
  return null;
}

export default function CoverStack({ onOpen }: { onOpen: (r: Release) => void }) {
  const state = useRef<DragState>({ offset: 0, vel: 0, dragging: false });
  const moved = useRef(false);
  const start = useRef({ x: 0, off: 0, t: 0, lx: 0 });
  const [hovered, setHovered] = useState<number | null>(null);
  const [idx, setIdx] = useState(0);
  const cur = releases[THREE.MathUtils.clamp(idx, 0, releases.length - 1)];

  return (
    <div
      className="stack"
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        state.current.dragging = true; moved.current = false;
        start.current = { x: e.clientX, off: state.current.offset, t: performance.now(), lx: e.clientX };
      }}
      onPointerMove={(e) => {
        if (!state.current.dragging) return;
        const dx = e.clientX - start.current.x;
        if (Math.abs(dx) > 5) moved.current = true;
        const now = performance.now();
        const ddt = Math.max(1, now - start.current.t) / 1000;
        state.current.vel = -((e.clientX - start.current.lx) / 140) / ddt;
        start.current.t = now; start.current.lx = e.clientX;
        state.current.offset = start.current.off - dx / 140;
      }}
      onPointerUp={() => { state.current.dragging = false; }}
      onPointerLeave={() => { state.current.dragging = false; }}
    >
      <Canvas camera={{ position: [0, 0.6, 7], fov: 40 }} dpr={[1, 2]}>
        <ambientLight intensity={0.8} />
        <directionalLight position={[3, 5, 5]} intensity={1.5} />
        <pointLight position={[-4, -2, 4]} color="#7cf7ff" intensity={20} />
        <group position={[-1.2, -0.6, 0]}>
          {releases.map((r, i) => (
            <Card key={r.id} r={r} i={i} state={state} hovered={hovered} setHovered={setHovered} onOpen={onOpen} moved={moved} />
          ))}
        </group>
        <Physics state={state} onIndex={setIdx} />
      </Canvas>
      <div className="stack-caption">
        <span className="chip">{cur.date}</span>
        <h2>{cur.title}</h2>
        <p>{cur.artist} · {cur.type}</p>
        <small>← arrastrá para moverte · click para abrir →</small>
      </div>
    </div>
  );
}
