"use client";

import { useEffect, useRef, useState } from "react";

const THRESHOLD = 78;
const MAX_PULL = 130;

/**
 * Pull-to-refresh táctil (el típico "tirar hacia abajo para refrescar").
 * Necesario porque en la app instalada de iOS (standalone) Safari no trae el suyo.
 * Solo se activa si la página está en el tope y el gesto no arranca dentro de algo scrolleable
 * (modales, hoja del proyecto, reproductor, rueda de vinilos).
 */
export default function PullToRefresh() {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const pullRef = useRef(0);

  useEffect(() => {
    if (!window.matchMedia("(pointer: coarse)").matches) return;

    const isScrollableAtTop = (target: EventTarget | null) => {
      let node = target as HTMLElement | null;
      while (node && node !== document.body && node !== document.documentElement) {
        if (node.scrollTop > 4) return false;
        node = node.parentElement;
      }
      return true;
    };

    const isInteractiveInput = (target: EventTarget | null) => {
      let node = target as HTMLElement | null;
      while (node && node !== document.body) {
        if (
          node.matches?.(
            "input, textarea, select, [contenteditable='true'], .perf-player-expanded, .perf-waveform-scrubber, .ios-mini-player-dock, .ios-mini-player, .performative-player, .dynamic-island, .manifold-3d-wrapper, .vinyl-fan-arc-viewport, .project-inspector-sheet, .library-bottom-actions"
          )
        ) {
          return true;
        }
        node = node.parentElement;
      }
      return false;
    };

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        startY.current = null;
        return;
      }
      const touch = e.touches[0];
      const target = e.target;

      // Pull-to-refresh solo debe iniciar si el dedo arranca en la franja superior (área de la barra de estado / header)
      // Si toca más abajo de 110px (donde está el contenido, biblioteca o reproductor), nunca refrescar
      if (touch.clientY > 110) {
        startY.current = null;
        return;
      }

      // Si está tocando un reproductor, campo de texto, controles o rueda, no refrescar
      if (isInteractiveInput(target)) {
        startY.current = null;
        return;
      }

      // Si la ventana o un contenedor interno ya está scrolleado hacia abajo, no refrescar
      if (window.scrollY > 4 || !isScrollableAtTop(target)) {
        startY.current = null;
        return;
      }

      const isVinylWheel = (target as HTMLElement | null)?.closest?.(
        ".vinyl-fan-arc-wheel, .vinyl-fan-arc-viewport, .ios-mini-player-dock, .ios-mini-player"
      );
      if (isVinylWheel) {
        startY.current = null;
        return;
      }

      startY.current = touch.clientY;
    };

    const onMove = (e: TouchEvent) => {
      if (startY.current === null) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy <= 0 || window.scrollY > 4) {
        pullRef.current = 0;
        setPull(0);
        return;
      }
      const eased = Math.min(MAX_PULL, dy * 0.5);
      pullRef.current = eased;
      setPull(eased);
    };

    const onEnd = () => {
      if (startY.current === null) return;
      startY.current = null;
      if (pullRef.current >= THRESHOLD) {
        setRefreshing(true);
        setPull(THRESHOLD * 0.7);
        window.setTimeout(() => window.location.reload(), 350);
      } else {
        setPull(0);
      }
      pullRef.current = 0;
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, []);

  if (pull <= 0 && !refreshing) return null;
  const ready = pull >= THRESHOLD * 0.5 + 6;

  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        top: "calc(env(safe-area-inset-top, 0px) + 8px)",
        left: "50%",
        transform: `translate(-50%, ${Math.max(0, pull - 28)}px)`,
        zIndex: 400,
        width: 38,
        height: 38,
        borderRadius: "50%",
        display: "grid",
        placeItems: "center",
        background: "rgba(28,28,34,0.88)",
        border: "1px solid rgba(255,255,255,0.18)",
        backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)",
        boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
        color: "#fff",
        opacity: Math.min(1, pull / 30),
        pointerEvents: "none",
      }}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          transform: refreshing ? undefined : `rotate(${ready ? 180 : (pull / THRESHOLD) * 180}deg)`,
          animation: refreshing ? "ptr-spin 0.7s linear infinite" : undefined,
          transition: "transform 0.12s",
        }}
      >
        {refreshing ? <path d="M21 12a9 9 0 1 1-6.2-8.55" /> : <path d="M12 5v14M6 13l6 6 6-6" />}
      </svg>
      <style>{`@keyframes ptr-spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
