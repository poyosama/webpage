"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Project } from "@/lib/mock";

export type FolderItem = { id: string; title: string };
export type DropTarget = { kind: "project" | "folder" | "out"; id?: string };

/**
 * Arrastrar proyectos en la vista de tapas (mouse y dedo).
 * - Mouse: arranca al mover 6 px con el botón apretado.
 * - Dedo: mantener apretado ~0,4 s y arrastrar (antes de eso, la grilla scrollea normal).
 * El destino se detecta con elementos marcados con data-drop-kind / data-drop-id.
 */
export function useProjectDrag(onDrop: (projectId: string, target: DropTarget) => void) {
  const [drag, setDrag] = useState<{ id: string; x: number; y: number; cover?: string; title: string } | null>(null);
  const [over, setOver] = useState<DropTarget | null>(null);
  const pending = useRef<{ id: string; x: number; y: number; touch: boolean; timer: number | null; cover?: string; title: string } | null>(null);
  const active = useRef(false);
  const suppressClick = useRef(false);

  const hitTest = useCallback((x: number, y: number, selfId: string): DropTarget | null => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const t = el?.closest?.("[data-drop-kind]") as HTMLElement | null;
    if (!t) return null;
    const kind = t.dataset.dropKind as DropTarget["kind"];
    const id = t.dataset.dropId;
    if (kind === "project" && id === selfId) return null;
    return { kind, id };
  }, []);

  const start = useCallback((p: { id: string; x: number; y: number; cover?: string; title: string }) => {
    active.current = true;
    setDrag(p);
    try {
      navigator.vibrate?.(12);
    } catch {}
  }, []);

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const pd = pending.current;
      if (!pd) return;
      if (!active.current) {
        const dist = Math.hypot(e.clientX - pd.x, e.clientY - pd.y);
        if (pd.touch) {
          // si el dedo se mueve antes del "mantener apretado", es scroll: se cancela
          if (dist > 10) {
            if (pd.timer) window.clearTimeout(pd.timer);
            pending.current = null;
          }
          return;
        }
        if (dist < 6) return;
        start({ id: pd.id, x: e.clientX, y: e.clientY, cover: pd.cover, title: pd.title });
      }
      setDrag((d) => (d ? { ...d, x: e.clientX, y: e.clientY } : d));
      setOver(hitTest(e.clientX, e.clientY, pd.id));
    };
    const up = (e: PointerEvent) => {
      const pd = pending.current;
      if (pd?.timer) window.clearTimeout(pd.timer);
      if (active.current && pd) {
        const target = hitTest(e.clientX, e.clientY, pd.id);
        suppressClick.current = true;
        window.setTimeout(() => (suppressClick.current = false), 350);
        if (target) onDrop(pd.id, target);
      }
      active.current = false;
      pending.current = null;
      setDrag(null);
      setOver(null);
    };
    // Con el dedo, una vez que arrancó el arrastre no tiene que scrollear la página
    const noScroll = (e: TouchEvent) => {
      if (active.current) e.preventDefault();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    window.addEventListener("touchmove", noScroll, { passive: false });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("touchmove", noScroll);
    };
  }, [hitTest, onDrop, start]);

  /** Props para la tarjeta arrastrable */
  const dragHandlers = (p: Project) => ({
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      const touch = e.pointerType !== "mouse";
      const base = { id: p.id, x: e.clientX, y: e.clientY, touch, timer: null as number | null, cover: p.coverUrl, title: p.title };
      if (touch) {
        base.timer = window.setTimeout(() => {
          if (pending.current?.id === p.id) start({ id: p.id, x: base.x, y: base.y, cover: p.coverUrl, title: p.title });
        }, 400);
      }
      pending.current = base;
    },
    onContextMenu: (e: React.MouseEvent) => {
      if (active.current || pending.current?.touch) e.preventDefault();
    },
  });

  return { drag, over, dragHandlers, suppressClick };
}

/** Tapa de carpeta: mosaico 2x2 con las tapas de los primeros proyectos */
export function FolderCover({ projects }: { projects: Project[] }) {
  const four = projects.slice(0, 4);
  return (
    <div className="lib-folder-mosaic">
      {[0, 1, 2, 3].map((i) => {
        const p = four[i];
        return (
          <span
            key={i}
            style={
              p
                ? { background: p.coverUrl ? `url(${p.coverUrl}) center / cover no-repeat` : `linear-gradient(135deg, ${p.c1}, ${p.c2})` }
                : undefined
            }
          />
        );
      })}
      <svg className="lib-folder-badge" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M3 6.5A2.5 2.5 0 0 1 5.5 4h4.2l2 2.2h6.8A2.5 2.5 0 0 1 21 8.7v8.8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z" />
      </svg>
    </div>
  );
}
