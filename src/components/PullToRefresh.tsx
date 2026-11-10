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

    const blocked = (el: EventTarget | null) => {
      if (document.body.classList.contains("mobile-vinyl-wheel-locked")) return true;
      let node = el as HTMLElement | null;
      while (node && node !== document.body) {
        if (
          node.matches?.(
            ".apple-modal-backdrop, .project-inspector-sheet, .perf-player, .vinyl-fan-arc-viewport, .spotify-queue-drawer, input, textarea, select"
          )
        ) {
          return true;
        }
        if (node.scrollTop > 0) return true;
        node = node.parentElement;
      }
      return false;
    };

    const onStart = (e: TouchEvent) => {
      if (window.scrollY > 0 || blocked(e.target)) {
        startY.current = null;
        return;
      }
      startY.current = e.touches[0].clientY;
    };

    const onMove = (e: TouchEvent) => {
      if (startY.current === null) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy <= 0 || window.scrollY > 0) {
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
      if (pullRef.current >= THRESHOLD * 0.5 + 6) {
        setRefreshing(true);
        setPull(THRESHOLD * 0.6);
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
