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

  // Collage como el de Proyectos: 10 tracks en 5 renglones (2·1·2·2·3), en orden de ranking de arriba a abajo
  // y de izquierda a derecha. Los títulos se parten en gris + color como en los proyectos ("bla|blabla").
  const top = rows.slice(0, 10);
  const pattern = [2, 1, 2, 2, 3];
  const lines: BoardTrack[][] = [];
  for (let i = 0, k = 0; k < top.length; i++) {
    const n = pattern[i] ?? 3;
    lines.push(top.slice(k, k + n));
    k += n;
  }

  const item = (r: BoardTrack) => {
    const idx = top.indexOf(r);
    const active = currentTrackId === r.track_id;
    const plays = playsLabel(r.track_id);
    const [pre, sw, post] = splitTitle(r.title, idx);
    return (
      <button
        key={r.track_id}
        type="button"
        className={`collage-item clean-editorial-word track-board-item ${active ? "is-playing" : ""} ${idx === 0 ? "is-top" : ""}`}
        onClick={() => onPlay(top, idx)}
        title={`#${r.rank} · ${r.listeners} oyentes · ${r.likers} me gusta · ${r.commenters} comentaron`}
      >
        {r.cover_url ? <img src={r.cover_url} alt="" className="collage-cover-thumb" /> : <span className="collage-cover-thumb track-board-ph">♪</span>}
        <span className="roster-word">
          {pre}
          <span className={`inline-swatch ${COLORS[idx % COLORS.length]}`}>{sw}</span>
          {post}
        </span>
        <sup className="sup-tag">
          #{r.rank} · {r.artist}
          {plays ? ` · ${plays}` : ""}
        </sup>
      </button>
    );
  };

  return (
    <>
      <div className="neon-spine" aria-hidden />
      <div className="Roster-collage track-board-collage">
        {lines.map((line, li) => (
          <div key={li} className="collage-line">
            {li === 0 && (
              <>
                <span className="cluster-dots">
                  <i style={{ background: "#e11d48" }} />
                  <i style={{ background: "#0284c7" }} />
                  <i style={{ background: "#ca8a04" }} />
                </span>
                <span className="pixel-tag coral-badge">TOP // 10</span>
              </>
            )}
            {line.map(item)}
            {li === 0 && <span className="cutout-pill">Escena UG</span>}
            {li === 1 && <span className="cutout-pill dark">se arma todos los días a las 18:00</span>}
          </div>
        ))}
      </div>
    </>
  );
}

/** Parte el título en [gris, color, gris] para que se vea como el collage de proyectos */
function splitTitle(title: string, i: number): [string, string, string] {
  const t = title.trim();
  // los guiones / signos sueltos se pegan a la palabra anterior ("mientes -" + "1leiito")
  const words: string[] = [];
  t.split(/\s+/).forEach((w) => {
    if (words.length && !/[\p{L}\p{N}]/u.test(w)) words[words.length - 1] += " " + w;
    else words.push(w);
  });
  if (words.length >= 3) {
    // alterna: "ESTO [ES ESTAR EN SONIDO]" o "[un dia] mas, sin mas"
    if (i % 2 === 0) return [words[0] + " ", words.slice(1).join(" "), ""];
    const half = Math.ceil(words.length / 2);
    return ["", words.slice(0, half).join(" "), " " + words.slice(half).join(" ")];
  }
  if (words.length === 2) return i % 3 === 2 ? ["", words[0], " " + words[1]] : [words[0] + " ", words[1], ""];
  const cut = syllableCut(t);
  return cut ? [t.slice(0, cut), t.slice(cut), ""] : ["", t, ""];
}

/** Dónde cortar una palabra sola por sílaba (cerca del 45 %): antes de consonante+vocal o de grupos como "cr", "pl". */
function syllableCut(w: string): number | null {
  if (w.length < 7) return null;
  const V = /[aeiouáéíóúüy]/i;
  const C = /[bcdfghjklmnñpqrstvwxyz]/i;
  const CLUSTER = /^(bl|br|cl|cr|dr|fl|fr|gl|gr|pl|pr|tr|ch|ll|rr)$/i;
  const target = w.length * 0.45;
  let best: number | null = null;
  for (let k = 2; k <= w.length - 3; k++) {
    const a = w[k], b = w[k + 1] || "", prev = w[k - 1];
    const startsSyllable =
      (C.test(a) && V.test(b) && !(prev && CLUSTER.test(prev + a))) ||
      (CLUSTER.test(a + b) && V.test(w[k + 2] || "")) ||
      (a.toLowerCase() === "q" && V.test(prev)); // la "q" siempre arranca sílaba ("jajaja|qlacreo")
    if (!startsSyllable || !V.test(prev) && !C.test(prev)) continue;
    if (best === null || Math.abs(k - target) < Math.abs(best - target)) best = k;
  }
  return best;
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
