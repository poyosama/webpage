"use client";

/** Avisos puntuales para el usuario (tabla user_notices): pop-up al entrar, uno por vez, "Entendido" lo marca visto */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";

type Notice = { id: string; title: string; body: string; created_at: string };

export default function UserNotices({ meId }: { meId: string | null }) {
  const [queue, setQueue] = useState<Notice[]>([]);
  useEffect(() => {
    if (!meId) return;
    let alive = true;
    const t = window.setTimeout(() => {
      void supabase
        .from("user_notices")
        .select("id, title, body, created_at")
        .eq("user_id", meId)
        .is("seen_at", null)
        .order("created_at", { ascending: true })
        .then(({ data }) => {
          if (alive && Array.isArray(data)) setQueue(data as Notice[]);
        });
    }, 2500); // que primero cargue la app
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [meId]);

  const n = queue[0];
  if (!n || typeof document === "undefined") return null;
  const close = () => {
    // (.then hace que el pedido salga de verdad: sin esto nunca se marcaba como visto)
    void supabase.from("user_notices").update({ seen_at: new Date().toISOString() }).eq("id", n.id).then(() => {});
    setQueue((q) => q.slice(1));
  };
  return createPortal(
    <div className="notice-backdrop">
      <div className="notice-card" role="alertdialog" aria-labelledby="notice-title">
        <span className="notice-icon" aria-hidden>
          !
        </span>
        <h3 id="notice-title">{n.title}</h3>
        <p>{n.body}</p>
        <button type="button" onClick={close}>
          Entendido
        </button>
      </div>
    </div>,
    document.body
  );
}
