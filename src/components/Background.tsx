"use client";
import { useEffect, useRef } from "react";

// Niebla + partículas tipo PS2 que siguen al mouse y laten si hay audio.
// Más adelante se reemplaza por el GIF/video de fondo que pase juani.
export default function Background({ playing }: { playing: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const playingRef = useRef(playing);
  playingRef.current = playing;

  useEffect(() => {
    const c = ref.current!;
    const g = c.getContext("2d")!;
    let w = 0, h = 0, raf = 0;
    const mouse = { x: 0.5, y: 0.5 };
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const pts = Array.from({ length: 90 }, () => ({ x: Math.random(), y: Math.random(), z: Math.random() * 0.8 + 0.2, s: Math.random() * 2 + 0.5 }));
    const resize = () => { w = c.width = innerWidth; h = c.height = innerHeight; };
    const move = (e: PointerEvent) => { mouse.x = e.clientX / w; mouse.y = e.clientY / h; };
    resize();
    addEventListener("resize", resize);
    addEventListener("pointermove", move);
    let t = 0;
    const loop = () => {
      t += 0.004;
      const beat = playingRef.current ? 1 + Math.max(0, Math.sin(t * 52)) * 0.35 : 1;
      g.fillStyle = "#04060d";
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 3; i++) {
        const cx = w * (0.3 + 0.4 * Math.sin(t + i * 2) + (mouse.x - 0.5) * 0.15);
        const cy = h * (0.4 + 0.3 * Math.cos(t * 0.8 + i) + (mouse.y - 0.5) * 0.15);
        const r = Math.max(w, h) * 0.5 * beat;
        const grd = g.createRadialGradient(cx, cy, 0, cx, cy, r);
        grd.addColorStop(0, ["rgba(40,90,180,0.22)", "rgba(120,60,200,0.15)", "rgba(20,160,170,0.14)"][i]);
        grd.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = grd;
        g.fillRect(0, 0, w, h);
      }
      for (const p of pts) {
        if (!reduced) { p.y -= 0.0004 * p.z; if (p.y < 0) p.y = 1; }
        const x = (p.x + (mouse.x - 0.5) * 0.05 * p.z) * w;
        const y = (p.y + (mouse.y - 0.5) * 0.05 * p.z) * h;
        g.fillStyle = `rgba(190,230,255,${0.25 * p.z * beat})`;
        g.beginPath(); g.arc(x, y, p.s * p.z * beat, 0, Math.PI * 2); g.fill();
      }
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => { cancelAnimationFrame(raf); removeEventListener("resize", resize); removeEventListener("pointermove", move); };
  }, []);
  return <canvas ref={ref} className="bg" aria-hidden />;
}
