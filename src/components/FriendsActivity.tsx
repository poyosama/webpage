"use client";

/**
 * Actividad de amigos (tipo Spotify): panel al costado con lo que escuchan tus amigos
 * (los que se siguen mutuamente con vos). En compu queda abierto al costado; en el celu es una hoja.
 */
import { useCallback, useEffect, useState } from "react";
import { agoEs, fetchFriendsActivity, isOnline, type FriendActivity } from "@/lib/supabase";

export const SHARE_KEY = "eltablero_share_activity";
export function readShareActivity(): boolean {
  try {
    return localStorage.getItem(SHARE_KEY) !== "0";
  } catch {
    return true;
  }
}

export default function FriendsActivity({
  open,
  onClose,
  isAdmin,
  share,
  onShareChange,
  onOpenProfile,
  onPlay,
}: {
  open: boolean;
  onClose: () => void;
  isAdmin: boolean;
  share: boolean;
  onShareChange: (v: boolean) => void;
  onOpenProfile: (handle: string) => void;
  /** Escuchar lo mismo que el amigo (si el track existe en la app); devuelve false si no se pudo */
  onPlay: (trackId: string, projectId: string | null) => boolean;
}) {
  const [rows, setRows] = useState<FriendActivity[] | null>(null);
  const [, setTick] = useState(0);

  const load = useCallback(async () => {
    const r = await fetchFriendsActivity();
    if (r) setRows(r);
  }, []);

  useEffect(() => {
    if (!open) return;
    void load();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 30000);
    const t = window.setInterval(() => setTick((n) => n + 1), 20000); // refresca los "hace X min"
    return () => {
      window.clearInterval(id);
      window.clearInterval(t);
    };
  }, [open, load]);

  if (!open) return null;

  const live = (r: FriendActivity) => r.is_playing && isOnline(r.last_seen);
  const sorted = [...(rows || [])].sort((a, b) => {
    const la = live(a) ? 2 : isOnline(a.last_seen) ? 1 : 0;
    const lb = live(b) ? 2 : isOnline(b.last_seen) ? 1 : 0;
    if (la !== lb) return lb - la;
    return new Date(b.last_seen || 0).getTime() - new Date(a.last_seen || 0).getTime();
  });

  return (
    <>
      <div className="friends-backdrop" onClick={onClose} aria-hidden />
      <aside className="friends-panel" role="complementary" aria-label="Actividad de amigos">
        <div className="friends-head">
          <div>
            <span className="mono-tag">AMIGOS // EN VIVO</span>
            <h3>Actividad de amigos</h3>
          </div>
          <button type="button" className="friends-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>

        <div className="friends-list">
          {rows === null && <p className="friends-empty">Cargando…</p>}
          {rows && rows.length === 0 && (
            <p className="friends-empty">
              Todavía no tenés amigos. Cuando vos y alguien se sigan mutuamente, acá ves lo que está escuchando.
            </p>
          )}
          {sorted.map((r) => {
            const handle = (r.handle || "").replace(/^@+/, "");
            const on = isOnline(r.last_seen);
            const playing = live(r);
            return (
              <div key={r.user_id} className={`friend-row ${playing ? "is-live" : ""}`}>
                <button type="button" className="friend-avatar" onClick={() => handle && onOpenProfile(handle)} title={handle ? `@${handle}` : ""}>
                  {r.avatar_url ? <img src={r.avatar_url} alt="" /> : <span>{(r.name || handle || "?").charAt(0).toUpperCase()}</span>}
                  {on && <i className="friend-online" aria-label="Conectado" />}
                </button>
                <div className="friend-main">
                  <div className="friend-top">
                    <button type="button" className="friend-name" onClick={() => handle && onOpenProfile(handle)}>
                      {r.name || (handle ? `@${handle}` : "Amigo")}
                    </button>
                    <span className="friend-time">
                      {playing ? (
                        <span className="device-eq" aria-label="Escuchando ahora">
                          <i />
                          <i />
                          <i />
                        </span>
                      ) : on ? (
                        "conectado"
                      ) : (
                        agoEs(r.last_seen)
                      )}
                    </span>
                  </div>
                  {r.track_title ? (
                    <button
                      type="button"
                      className="friend-track"
                      title="Escuchar"
                      onClick={() => r.track_id && onPlay(r.track_id, r.project_id)}
                    >
                      {r.cover_url && <img src={r.cover_url} alt="" />}
                      <span>
                        <b>{r.track_title}</b>
                        <small>
                          {[r.artist, r.project_title].filter(Boolean).join(" · ")}
                          {!playing && " · escuchó"}
                        </small>
                      </span>
                    </button>
                  ) : (
                    <small className="friend-none">Sin actividad todavía</small>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="friends-foot">
          <label className="friends-share">
            <input type="checkbox" checked={share} onChange={(e) => onShareChange(e.target.checked)} />
            <span>Mostrar a mis amigos lo que escucho</span>
          </label>
          {isAdmin && (
            <a className="friends-admin" href="/admin/usuarios">
              Panel de usuarios →
            </a>
          )}
        </div>
      </aside>
    </>
  );
}
