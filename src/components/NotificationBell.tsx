"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type Notif = {
  id: string;
  kind: "like" | "save" | "follow" | "friend";
  created_at: string;
  read_at: string | null;
  actor_id: string;
  actor_handle: string | null;
  actor_name: string | null;
  actor_avatar: string | null;
  project_title: string | null;
  track_title: string | null;
};

function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "ahora";
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} d`;
  return new Date(iso).toLocaleDateString("es-AR", { day: "numeric", month: "short" });
}

function who(n: Notif): string {
  const h = (n.actor_handle || "").replace(/^@+/, "");
  return h ? `@${h}` : n.actor_name || "Alguien";
}

function text(n: Notif): React.ReactNode {
  const w = <b>{who(n)}</b>;
  switch (n.kind) {
    case "like":
      return <>{w} le dio me gusta a <b>{n.track_title || "un track tuyo"}</b></>;
    case "save":
      return <>{w} guardó tu proyecto <b>{n.project_title || ""}</b></>;
    case "follow":
      return <>{w} empezó a seguirte</>;
    case "friend":
      return <>Ahora vos y {w} son amigos</>;
  }
}

export default function NotificationBell({
  meId,
  onOpenActor,
}: {
  meId: string;
  onOpenActor: (n: { id: string; handle: string }) => void;
}) {
  const [items, setItems] = useState<Notif[]>([]);
  const [open, setOpen] = useState(false);
  const [available, setAvailable] = useState(true);
  const wrapRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("my_notifications", { p_limit: 50 });
    if (error) {
      setAvailable(false); // migración todavía sin correr: la campanita no se muestra
      return;
    }
    setAvailable(true);
    setItems((data || []) as Notif[]);
  }, []);

  useEffect(() => {
    if (!meId) return;
    void load();
    const ch = supabase
      .channel(`notifs:${meId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${meId}` },
        () => void load()
      )
      .subscribe();
    const onVis = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      void supabase.removeChannel(ch);
    };
  }, [meId, load]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [open]);

  const unread = items.filter((n) => !n.read_at).length;

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) {
      void load();
      if (unread > 0) {
        const now = new Date().toISOString();
        void supabase
          .from("notifications")
          .update({ read_at: now })
          .eq("user_id", meId)
          .is("read_at", null)
          .then(() => {});
        // se ven como no leídas hasta cerrar el panel; después se limpian
        setTimeout(() => setItems((cur) => cur.map((n) => ({ ...n, read_at: n.read_at || now }))), 4000);
      }
    }
  };

  if (!available) return null;

  return (
    <div className="notif-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`ios-icon-btn notif-btn ${unread > 0 ? "has-unread" : ""}`}
        onClick={toggle}
        aria-label={unread > 0 ? `Notificaciones (${unread} nuevas)` : "Notificaciones"}
        aria-expanded={open}
        title="Notificaciones"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && <span className="notif-badge">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <div className="notif-panel" role="dialog" aria-label="Notificaciones">
          <div className="notif-head">Notificaciones</div>
          {items.length === 0 ? (
            <div className="notif-empty">Todavía no hay nada, juani. Cuando te den me gusta, te sigan o guarden tus proyectos, aparece acá.</div>
          ) : (
            <ul className="notif-list">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className={`notif-item ${n.read_at ? "" : "is-new"}`}
                    onClick={() => {
                      setOpen(false);
                      if (n.actor_handle) onOpenActor({ id: n.actor_id, handle: n.actor_handle });
                    }}
                  >
                    {n.actor_avatar ? (
                      <img className="notif-avatar" src={n.actor_avatar} alt="" />
                    ) : (
                      <span className="notif-avatar notif-avatar-ph">{(n.actor_name || n.actor_handle || "?").replace(/^@+/, "").charAt(0).toUpperCase()}</span>
                    )}
                    <span className="notif-text">{text(n)}</span>
                    <span className="notif-time">{ago(n.created_at)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
