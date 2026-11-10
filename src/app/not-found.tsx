"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

function createSoftDotTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const half = size / 2;
  const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.55, "rgba(255,255,255,0.92)");
  grad.addColorStop(0.85, "rgba(255,255,255,0.28)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

function buildQuestionMarkTargets(count: number): {
  targets: Float32Array;
  starts: Float32Array;
  phases: Float32Array;
  sizes: Float32Array;
} {
  const targets = new Float32Array(count * 3);
  const starts = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const sizes = new Float32Array(count);

  const w = 512;
  const h = 512;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "900 390px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillText("?", w / 2, h / 2 + 12);

  const img = ctx.getImageData(0, 0, w, h).data;
  const validPixels: Array<[number, number]> = [];
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      const alpha = img[(y * w + x) * 4];
      if (alpha > 120) {
        validPixels.push([x, y]);
      }
    }
  }

  const glyphCount = Math.floor(count * 0.86);

  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    phases[i] = Math.random() * Math.PI * 2;

    // Initial scattered sphere for smooth entrance
    const r = 4.5 + Math.random() * 5.5;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    starts[i3] = r * Math.sin(phi) * Math.cos(theta);
    starts[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    starts[i3 + 2] = r * Math.cos(phi);

    if (i < glyphCount && validPixels.length > 0) {
      const [px, py] = validPixels[Math.floor(Math.random() * validPixels.length)];
      const nx = (px / w - 0.5) * 5.4 + (Math.random() - 0.5) * 0.045;
      const ny = -(py / h - 0.5) * 5.4 + 0.55 + (Math.random() - 0.5) * 0.045;
      const nz = (Math.random() - 0.5) * 0.55;
      targets[i3] = nx;
      targets[i3 + 1] = ny;
      targets[i3 + 2] = nz;
      sizes[i] = 0.75 + Math.random() * 0.75;
    } else {
      // Ambient halo dust around the ?
      const haloR = 1.9 + Math.random() * 2.8;
      const a = Math.random() * Math.PI * 2;
      const b = (Math.random() - 0.5) * Math.PI;
      targets[i3] = Math.cos(a) * Math.cos(b) * haloR;
      targets[i3 + 1] = Math.sin(b) * haloR + 0.55;
      targets[i3 + 2] = Math.sin(a) * Math.cos(b) * haloR * 0.55;
      sizes[i] = 0.45 + Math.random() * 0.55;
    }
  }

  return { targets, starts, phases, sizes };
}

function QuestionMarkSwarm({ isDark }: { isDark: boolean }) {
  const pointsRef = useRef<THREE.Points>(null);
  const count = 11000;

  const dotTexture = useMemo(() => createSoftDotTexture(), []);
  const { targets, starts, phases } = useMemo(
    () => buildQuestionMarkTargets(count),
    [count]
  );

  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    arr.set(starts);
    return arr;
  }, [count, starts]);

  const simTimeRef = useRef(0);
  const pointerRef = useRef({ x: 0, y: 0 });

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);
    simTimeRef.current += dt;
    const t = simTimeRef.current;

    pointerRef.current.x += (state.pointer.x - pointerRef.current.x) * 0.08;
    pointerRef.current.y += (state.pointer.y - pointerRef.current.y) * 0.08;

    const pts = pointsRef.current;
    if (!pts) return;

    const posAttr = pts.geometry.getAttribute("position") as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;

    const lerpFactor = Math.min(1, dt * 4.2);
    const px = pointerRef.current.x * 1.35;
    const py = pointerRef.current.y * 1.35 + 0.55;

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const ph = phases[i];

      let tx = targets[i3] + Math.sin(t * 1.35 + ph) * 0.032;
      let ty = targets[i3 + 1] + Math.cos(t * 1.15 + ph * 1.3) * 0.032;
      let tz = targets[i3 + 2] + Math.sin(t * 1.55 + ph * 0.7) * 0.045;

      // Subtle magnetic repulsion around cursor
      const dx = tx - px;
      const dy = ty - py;
      const distSq = dx * dx + dy * dy;
      if (distSq < 0.75 && distSq > 0.0001) {
        const dist = Math.sqrt(distSq);
        const push = (1 - dist / 0.866) * 0.28;
        tx += (dx / dist) * push;
        ty += (dy / dist) * push;
        tz += push * 0.35;
      }

      arr[i3] += (tx - arr[i3]) * lerpFactor;
      arr[i3 + 1] += (ty - arr[i3 + 1]) * lerpFactor;
      arr[i3 + 2] += (tz - arr[i3 + 2]) * lerpFactor;
    }

    posAttr.needsUpdate = true;

    pts.rotation.y = Math.sin(t * 0.55) * 0.22 + pointerRef.current.x * 0.28;
    pts.rotation.x = Math.cos(t * 0.42) * 0.06 - pointerRef.current.y * 0.16;
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
        map={dotTexture}
        color={isDark ? "#ffffff" : "#09090b"}
        size={0.042}
        sizeAttenuation
        transparent
        opacity={isDark ? 0.9 : 0.85}
        depthWrite={false}
      />
    </points>
  );
}

export default function NotFound() {
  const [mounted, setMounted] = useState(false);
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    setMounted(true);
    try {
      const saved = localStorage.getItem("el_tablero_theme_v1");
      const currentAttr = document.documentElement.getAttribute("data-theme");
      const theme = saved || currentAttr || "dark";
      document.documentElement.setAttribute("data-theme", theme);
      setIsDark(theme === "dark");
    } catch {
      setIsDark(true);
    }
  }, []);

  return (
    <main
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100dvh",
        overflow: "hidden",
        background: isDark
          ? "radial-gradient(circle at 50% 38%, rgba(38, 38, 46, 0.55) 0%, #09090b 70%)"
          : "radial-gradient(circle at 50% 38%, rgba(255, 255, 255, 0.95) 0%, #f3f2ee 72%)",
        color: isDark ? "#ffffff" : "#09090b",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-end",
        padding: "2rem 1.5rem calc(3.5rem + env(safe-area-inset-bottom, 0px))",
        userSelect: "none",
      }}
    >
      {/* Top minimal brand mark */}
      <div
        style={{
          position: "fixed",
          top: "calc(1.25rem + env(safe-area-inset-top, 0px))",
          left: "1.5rem",
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          fontFamily: "var(--font-mono), monospace",
          fontSize: "0.75rem",
          letterSpacing: "0.06em",
          opacity: 0.72,
        }}
      >
        <span>@quetablero</span>
        <span style={{ opacity: 0.4 }}>//</span>
        <span>404</span>
      </div>

      {/* 3D Particle Swarm Canvas forming '?' */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 1,
          pointerEvents: "auto",
        }}
      >
        {mounted && (
          <Canvas
            dpr={[1, 1.75]}
            camera={{ position: [0, 0, 6.2], fov: 45 }}
            gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
          >
            <QuestionMarkSwarm isDark={isDark} />
          </Canvas>
        )}
      </div>

      {/* Bottom editorial card / copy + CTA */}
      <div
        style={{
          position: "relative",
          zIndex: 10,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          maxWidth: "420px",
          gap: "0.75rem",
          pointerEvents: "auto",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-mono), monospace",
            fontSize: "0.7rem",
            textTransform: "uppercase",
            letterSpacing: "0.16em",
            padding: "0.3rem 0.75rem",
            borderRadius: "999px",
            border: isDark
              ? "1px solid rgba(255,255,255,0.16)"
              : "1px solid rgba(0,0,0,0.14)",
            background: isDark
              ? "rgba(255,255,255,0.05)"
              : "rgba(0,0,0,0.04)",
          }}
        >
          404 · Fuera del tablero
        </span>

        <h1
          style={{
            fontFamily: "var(--font-display), -apple-system, BlinkMacSystemFont, sans-serif",
            fontSize: "clamp(1.65rem, 4vw, 2.25rem)",
            fontWeight: 700,
            letterSpacing: "-0.035em",
            lineHeight: 1.1,
            margin: 0,
          }}
        >
          No encontramos esa página
        </h1>

        <p
          style={{
            fontSize: "0.92rem",
            lineHeight: 1.45,
            opacity: 0.66,
            margin: "0 0 0.65rem 0",
          }}
        >
          La ruta que buscás no existe o fue movida a otra parte de El tablero.
        </p>

        <Link
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.5rem",
            padding: "0.8rem 1.5rem",
            borderRadius: "999px",
            fontSize: "0.9rem",
            fontWeight: 600,
            letterSpacing: "-0.01em",
            textDecoration: "none",
            background: isDark ? "#ffffff" : "#09090b",
            color: isDark ? "#09090b" : "#ffffff",
            boxShadow: isDark
              ? "0 10px 30px rgba(0,0,0,0.45)"
              : "0 10px 26px rgba(0,0,0,0.14)",
            transition: "transform 0.18s ease, opacity 0.18s ease",
          }}
        >
          <span>←</span>
          <span>Volver al inicio</span>
        </Link>
      </div>
    </main>
  );
}
