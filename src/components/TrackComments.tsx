"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  supabase,
  toDbId,
  fetchTrackComments,
  addTrackComment,
  deleteTrackComment,
  type TrackComment,
} from "@/lib/supabase";
import { sfx } from "@/lib/sfx";

const fmt = (sec: number) => {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const ago = (iso: string) => {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "ahora";
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} d`;
  return new Date(iso).toLocaleDateString("es-AR", { day: "numeric", month: "short" });
};

/** Cantidad de comentarios de un track (para el globito); null si no hay sistema de comentarios */
export function useCommentCount(trackId: string, enabled: boolean) {
  const [count, setCount] = useState<number | null>(null);
  const reload = useCallback(() => {
    if (!enabled || !trackId) return;
    void fetchTrackComments(trackId).then((list) => setCount(list ? list.length : null));
  }, [trackId, enabled]);
  useEffect(() => {
    setCount(null);
    reload();
  }, [reload]);
  return { count, reload };
}

export default function TrackComments({
  trackId,
  trackTitle,
  meId,
  canModerate,
  getCurrentSec,
  onSeek,
  onClose,
  onChanged,
}: {
  trackId: string;
  trackTitle: string;
  meId?: string;
  /** dueño del proyecto: puede borrar cualquier comentario */
  canModerate: boolean;
  getCurrentSec: () => number;
  onSeek: (sec: number) => void;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [items, setItems] = useState<TrackComment[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [text, setText] = useState("");
  const [atSec, setAtSec] = useState<number>(() => getCurrentSec());
  const [withTime, setWithTime] = useState(true);
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);

  const load = useCallback(async () => {
    const list = await fetchTrackComments(trackId);
    if (list === null) {
      setUnavailable(true);
      setItems([]);
      return;
    }
    setItems(list);
    onChanged?.();
  }, [trackId, onChanged]);

  useEffect(() => {
    void load();
    const ch = supabase
      .channel(`comments:${toDbId(trackId)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "track_comments", filter: `track_id=eq.${toDbId(trackId)}` },
        () => void load()
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [trackId, load]);

  // Ordenados por momento del track; los generales (sin tiempo) al final
  const sorted = useMemo(
    () =>
      [...(items || [])].sort((a, b) => {
        if (a.atSec == null && b.atSec == null) return a.createdAt.localeCompare(b.createdAt);
        if (a.atSec == null) return 1;
        if (b.atSec == null) return -1;
        return a.atSec - b.atSec || a.createdAt.localeCompare(b.createdAt);
      }),
    [items]
  );

  const send = async () => {
    const body = text.trim();
    if (!body || !meId || sending) return;
    setSending(true);
    const ok = await addTrackComment(trackId, meId, body, withTime ? atSec : null);
    setSending(false);
    if (ok) {
      sfx.pop();
      setText("");
      setAtSec(getCurrentSec());
      await load();
    }
  };

  return (
    <div className="tc-backdrop" onClick={onClose}>
      <div className="tc-sheet" role="dialog" aria-modal="true" aria-label={`Comentarios de ${trackTitle}`} onClick={(e) => e.stopPropagation()}>
        <div className="tc-grabber" />
        <div className="tc-head">
          <div>
            <span className="tc-kicker">COMENTARIOS</span>
            <h3>{trackTitle}</h3>
          </div>
          <button type="button" className="tc-close" onClick={onClose} aria-label="Cerrar comentarios">
            ✕
          </button>
        </div>

        {unavailable ? (
          <p className="tc-empty">Los comentarios todavía no están activados en el servidor.</p>
        ) : items === null ? (
          <p className="tc-empty">Cargando…</p>
        ) : sorted.length === 0 ? (
          <p className="tc-empty">Todavía no hay comentarios. Dejá el primero, marcando el momento del track.</p>
        ) : (
          <ul className="tc-list" ref={listRef}>
            {sorted.map((c) => {
              const who = c.handle ? `@${c.handle.replace(/^@+/, "")}` : c.name || "Alguien";
              const canDelete = meId && (c.userId === meId || canModerate);
              return (
                <li key={c.id}>
                  {c.avatarUrl ? (
                    <img className="tc-avatar" src={c.avatarUrl} alt="" />
                  ) : (
                    <span className="tc-avatar tc-avatar-ph">{who.replace(/^@/, "").charAt(0).toUpperCase()}</span>
                  )}
                  <div className="tc-body">
                    <div className="tc-meta">
                      <b>{who}</b>
                      {c.atSec != null && (
                        <button
                          type="button"
                          className="tc-time"
                          onClick={() => {
                            sfx.tap();
                            onSeek(c.atSec as number);
                          }}
                          title="Ir a este momento"
                        >
                          {fmt(c.atSec)}
                        </button>
                      )}
                      <span className="tc-ago">{ago(c.createdAt)}</span>
                    </div>
                    <p>{c.body}</p>
                  </div>
                  {canDelete && (
                    <button
                      type="button"
                      className="tc-del"
                      aria-label="Borrar comentario"
                      onClick={async () => {
                        if (await deleteTrackComment(c.id)) void load();
                      }}
                    >
                      Borrar
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {meId && !unavailable && (
          <form
            className="tc-form"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <button
              type="button"
              className={`tc-at ${withTime ? "is-on" : ""}`}
              onClick={() => {
                if (!withTime) setAtSec(getCurrentSec());
                setWithTime((v) => !v);
              }}
              title={withTime ? "Se guarda en este momento del track (tocá para que sea general)" : "Comentario general (tocá para marcar el momento)"}
            >
              {withTime ? `en ${fmt(atSec)}` : "general"}
            </button>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onFocus={() => withTime && setAtSec(getCurrentSec())}
              placeholder="ej. subí el bajo en el estribillo"
              maxLength={500}
              aria-label="Escribir comentario"
            />
            <button type="submit" className="tc-send" disabled={!text.trim() || sending}>
              {sending ? "…" : "Enviar"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
