"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase, setFollowing, rejectFriendRequest } from "@/lib/supabase";

type Notif = {
  id: string;
  kind: "like" | "save" | "follow" | "friend" | "comment" | "comment_like";
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

/** Siempre "quién hizo qué a quién": usuario1 = quien lo hizo, usuario2 = dueño de esta bandeja */
function text(n: Notif, meHandle: string): React.ReactNode {
  const u1 = <b>{who(n)}</b>;
  const u2 = <b>{meHandle}</b>;
  const track = n.track_title ? <> <b>{n.track_title}</b></> : null;
  const project = n.project_title ? <> <b>{n.project_title}</b></> : null;
  switch (n.kind) {
    case "like":
      return <>A {u1} le gustó el track{track} de {u2}</>;
    case "save":
      return <>{u1} guardó el proyecto{project} de {u2}</>;
    case "follow":
      return <>{u1} le mandó una solicitud de amistad a {u2}</>;
    case "friend":
      return <>¡{u1} y {u2} ahora son amigos!</>;
    case "comment":
      return <>{u1} comentó en el track{track} de {u2}</>;
    case "comment_like":
      return <>A {u1} le gustó el comentario de {u2} en el track{track}</>;
  }
}

export default function NotificationBell({
  meId,
  meHandle,
  onOpenActor,
}: {
  meId: string;
  /** @handle del dueño de esta bandeja (usuario2 en los textos) */
  meHandle?: string;
  onOpenActor: (n: { id: string; handle: string }) => void;
}) {
  const [items, setItems] = useState<Notif[]>([]);
  const [open, setOpen] = useState(false);
  const [available, setAvailable] = useState(true);
  const [answered, setAnswered] = useState<Record<string, "ok" | "no">>({});
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
            <div className="notif-empty">Todavía no hay nada. Cuando te den me gusta, te comenten, te manden una solicitud de amistad o guarden tus proyectos, aparece acá.</div>
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
                    <span className="notif-text">{text(n, meHandle ? `@${meHandle.replace(/^@+/, "")}` : "vos")}</span>
                    <span className="notif-time">{ago(n.created_at)}</span>
                  </button>
                  {n.kind === "follow" && (
                    <div className="notif-req-actions">
                      {answered[n.actor_id] ? (
                        <small>{answered[n.actor_id] === "ok" ? "¡Ahora son amigos!" : "Solicitud rechazada"}</small>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="notif-req-btn is-primary"
                            onClick={async () => {
                              if (await setFollowing(meId, n.actor_id, true)) setAnswered((x) => ({ ...x, [n.actor_id]: "ok" }));
                            }}
                          >
                            Aceptar
                          </button>
                          <button
                            type="button"
                            className="notif-req-btn"
                            onClick={async () => {
                              if (await rejectFriendRequest(meId, n.actor_id)) setAnswered((x) => ({ ...x, [n.actor_id]: "no" }));
                            }}
                          >
                            Rechazar
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
