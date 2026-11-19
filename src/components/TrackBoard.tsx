"use client";

/**
 * Tablero en modo "Canciones": los tracks públicos ordenados por cómo les fue con la gente
 * (oyentes, me gusta y comentarios de cuentas únicas, sin contar al dueño). Se recalcula todos los días a las 18:00 (AR).
 */
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type BoardTrack = {
  rank: number;
  track_id: string;
  project_id: string;
  title: string;
  artist: string;
  cover_url: string | null;
  project_title: string;
  score: number;
  listeners: number;
  likers: number;
  commenters: number;
};

const COLORS = ["coral", "cyan", "gold", "blue", "lime", "purple", "red"];

/** Próximas 18:00 en Argentina (UTC-3, sin horario de verano) = 21:00 UTC */
function nextRefresh(now: number): number {
  const d = new Date(now);
  const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 21, 0, 0);
  return now < t ? t : t + 86400000;
}
const pad = (n: number) => String(n).padStart(2, "0");

export function BoardCountdown({ onZero }: { onZero?: () => void }) {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    let target = nextRefresh(Date.now());
    const tick = () => {
      const now = Date.now();
      if (now >= target) {
        target = nextRefresh(now + 1000);
        window.setTimeout(() => onZero?.(), 8000); // le da unos segundos al servidor
      }
      setLeft(target - now);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [onZero]);
  const s = left === null ? null : Math.max(0, Math.floor(left / 1000));
  const txt = s === null ? "--:--:--" : `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
  return (
    <span className="board-countdown" title="Todos los días a las 18:00">
      El tablero se actualiza en: <b>{txt}</b>
    </span>
  );
}

export default function TrackBoard({
  currentTrackId,
  isPlaying,
  playsLabel,
  onPlay,
  onLoaded,
  reloadKey,
}: {
  currentTrackId: string;
  isPlaying: boolean;
  playsLabel: (trackId: string) => string | null;
  onPlay: (rows: BoardTrack[], index: number) => void;
  onLoaded?: (rows: BoardTrack[]) => void;
  reloadKey: number;
}) {
  const [rows, setRows] = useState<BoardTrack[] | null>(null);
  useEffect(() => {
    let alive = true;
    void supabase.rpc("track_board_current").then(({ data, error }) => {
      if (!alive) return;
      const r = error ? [] : ((data || []) as BoardTrack[]);
      setRows(r);
      onLoaded?.(r.slice(0, 10));
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);

  if (rows === null) return <div className="track-board is-loading">Cargando el tablero…</div>;
  if (!rows.length) return <div className="track-board is-empty">Todavía no hay tracks públicos para armar el tablero.</div>;

  // Jerarquía: el 1 enorme, 2–3 grandes, 4–6 medianos, 7–10 más chicos
  // Se muestran solo los 10 primeros (el servidor guarda más por si hace falta)
  const tiers: BoardTrack[][] = [rows.slice(0, 1), rows.slice(1, 3), rows.slice(3, 6), rows.slice(6, 10)];
  const sizes = ["is-t1", "is-t2", "is-t3", "is-t4", "is-t5", "is-t6"];

  return (
    <div className="track-board">
      {tiers.map((tier, ti) =>
        tier.length ? (
          <div key={ti} className={`collage-line track-board-line ${sizes[ti]}`}>
            {tier.map((r) => {
              const idx = rows.indexOf(r);
              const active = currentTrackId === r.track_id;
              const plays = playsLabel(r.track_id);
              return (
                <button
                  key={r.track_id}
                  type="button"
                  className={`collage-item clean-editorial-word track-board-item ${active ? "is-playing" : ""}`}
                  onClick={() => onPlay(rows.slice(0, 10), idx)}
                  title={`#${r.rank} · ${r.listeners} oyentes · ${r.likers} me gusta · ${r.commenters} comentaron`}
                >
                  <span className="track-board-rank">{r.rank}</span>
                  {r.cover_url ? <img src={r.cover_url} alt="" className="collage-cover-thumb" /> : <span className="collage-cover-thumb track-board-ph">♪</span>}
                  <span className="roster-word">
                    <span className={`inline-swatch ${COLORS[idx % COLORS.length]}`}>
                      {r.title}
                    </span>
                  </span>
                  <sup className="sup-tag">
                    {r.artist}
                    {plays ? ` · ${plays}` : ""}
                  </sup>
                </button>
              );
            })}
          </div>
        ) : null
      )}
    </div>
  );
}

/** Configuración de cuenta: el contador de reproducciones de tus tracks lo ven todos o solo vos */
export function PlayCountsField({ meId }: { meId: string }) {
  const [pub, setPub] = useState<boolean | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    void supabase
      .from("profiles")
      .select("show_play_counts")
      .eq("id", meId)
      .maybeSingle()
      .then(({ data }) => setPub((data as { show_play_counts?: boolean } | null)?.show_play_counts ?? true));
  }, [meId]);
  const pick = async (v: boolean) => {
    setPub(v);
    const { error } = await supabase.from("profiles").update({ show_play_counts: v }).eq("id", meId);
    if (!error) {
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1800);
    }
  };
  return (
    <div className="modal-field play-counts-field">
      <span>REPRODUCCIONES DE TUS TRACKS · ¿QUIÉN LAS VE?</span>
      <div className="dm-policy-opts">
        <button type="button" className={pub === true ? "on" : ""} onClick={() => void pick(true)}>
          Todos
        </button>
        <button type="button" className={pub === false ? "on" : ""} onClick={() => void pick(false)}>
          Solo yo
        </button>
      </div>
      <small>{saved ? "Guardado ✓" : "Cuenta una reproducción cuando alguien escucha ~30 segundos."}</small>
    </div>
  );
}
