"use client";

/**
 * Vitrinas públicas (sin sesión) para mostrar El tablero afuera:
 * - StudioShowcase: proyectos con visuales de un estudio (ej. 2kolorstudio) → página /estudio/2kolorstudio y recuadro /embed/estudio/2kolorstudio
 * - BoardEmbed: el tablero del día (top 10) → recuadro /embed/tablero
 * Solo usa datos públicos. Se escuchan ahí mismo con un mini reproductor.
 */
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

export const STUDIOS: Record<string, { name: string; tagline: string; about: string; url?: string }> = {
  "2kolorstudio": {
    name: "2kolorstudio",
    tagline: "Estudio creativo · VFX · CGI · 3D · IA",
    about: "Hacen el lado visual de la escena: tapas, canvas y videos. Estos son los proyectos de El tablero con visuales de 2kolorstudio.",
    url: "", // web del estudio (todavía sin publicar)
  },
};

type PTrack = { id: string; title: string; artist: string; audio_url: string | null; order_index: number | null };
type PProject = { id: string; title: string; artist: string; type: string; cover_url: string | null; tracks: PTrack[] };
type Playing = { id: string; title: string; artist: string; url: string; cover?: string | null };

const SITE = "https://www.eltablero.blog";

function useMiniPlayer() {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [now, setNow] = useState<Playing | null>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  useEffect(() => {
    const a = new Audio();
    a.preload = "none";
    audio.current = a;
    const on = () => setPlaying(!a.paused);
    a.addEventListener("play", on);
    a.addEventListener("pause", on);
    a.addEventListener("ended", on);
    a.addEventListener("timeupdate", () => setPos(a.currentTime));
    a.addEventListener("loadedmetadata", () => setDur(a.duration || 0));
    return () => {
      a.pause();
      a.src = "";
    };
  }, []);
  const play = (p: Playing) => {
    const a = audio.current;
    if (!a) return;
    if (now?.id === p.id) {
      if (a.paused) void a.play().catch(() => {});
      else a.pause();
      return;
    }
    a.src = p.url;
    setNow(p);
    setPos(0);
    setDur(0);
    void a.play().catch(() => {});
  };
  return { now, playing, pos, dur, play, seek: (s: number) => audio.current && (audio.current.currentTime = s) };
}

function PlayerBar({ p }: { p: ReturnType<typeof useMiniPlayer> }) {
  if (!p.now) return null;
  return (
    <div className="sc-player">
      {p.now.cover ? <img src={p.now.cover} alt="" /> : <span className="sc-ph">♪</span>}
      <div className="sc-player-meta">
        <b>{p.now.title}</b>
        <small>{p.now.artist}</small>
        <div className="sc-bar" onClick={(e) => {
          const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
          if (p.dur) p.seek(((e.clientX - r.left) / r.width) * p.dur);
        }}>
          <i style={{ width: `${p.dur ? (p.pos / p.dur) * 100 : 0}%` }} />
        </div>
      </div>
      <button type="button" className="sc-play" onClick={() => p.play(p.now!)} aria-label={p.playing ? "Pausa" : "Reproducir"}>
        {p.playing ? "❚❚" : "▶"}
      </button>
    </div>
  );
}

/** Proyectos con visuales de un estudio */
export function StudioShowcase({ slug, embed = false }: { slug: string; embed?: boolean }) {
  const studio = STUDIOS[slug];
  const [projects, setProjects] = useState<PProject[] | null>(null);
  const player = useMiniPlayer();
  useEffect(() => {
    void supabase
      .from("projects")
      .select("id, title, artist, type, cover_url, tracks(id, title, artist, audio_url, order_index)")
      .eq("visuals_by", slug)
      .eq("visibility", "public")
      .order("created_at", { ascending: false })
      .then(({ data }) => setProjects(((data || []) as PProject[]).filter((p) => p.tracks?.length)));
  }, [slug]);
  if (!studio) return <p className="sc-empty">Estudio no encontrado.</p>;
  const target = embed ? "_blank" : undefined;
  return (
    <div className={`sc-root ${embed ? "is-embed" : ""}`}>
      <header className="sc-head">
        <span className="sc-kicker">{embed ? "PROYECTOS EN EL TABLERO." : "ESTUDIO // VISUALES"}</span>
        <h1>{studio.name}</h1>
        <p className="sc-tagline">{studio.tagline}</p>
        {!embed && <p className="sc-about">{studio.about}</p>}
        {!embed && studio.url && (
          <a className="sc-link" href={studio.url} target="_blank" rel="noopener noreferrer">
            Ver la web de {studio.name} ↗
          </a>
        )}
      </header>
      {projects === null && <p className="sc-empty">Cargando…</p>}
      {projects && projects.length === 0 && <p className="sc-empty">Todavía no hay proyectos públicos marcados con visuales de {studio.name}.</p>}
      <div className="sc-grid">
        {(projects || []).map((p) => {
          const first = [...p.tracks].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)).find((t) => t.audio_url);
          const isNow = player.now && p.tracks.some((t) => t.id === player.now!.id);
          return (
            <div key={p.id} className={`sc-card ${isNow ? "is-now" : ""}`}>
              <button
                type="button"
                className="sc-cover"
                style={p.cover_url ? { backgroundImage: `url(${p.cover_url})` } : undefined}
                onClick={() => first && player.play({ id: first.id, title: first.title, artist: first.artist || p.artist, url: first.audio_url!, cover: p.cover_url })}
                aria-label={`Escuchar ${p.title}`}
              >
                <span className="sc-cover-play">{isNow && player.playing ? "❚❚" : "▶"}</span>
              </button>
              <a className="sc-title" href={`${SITE}/project/${p.id}`} target={target} rel="noopener">
                {p.title}
              </a>
              <small>{p.artist} · {p.type}</small>
            </div>
          );
        })}
      </div>
      <a className="sc-foot" href={SITE} target={target} rel="noopener">
        Escuchá todo en <b>El tablero.</b> ↗
      </a>
      <PlayerBar p={player} />
    </div>
  );
}

type BoardRow = { rank: number; track_id: string; project_id: string; title: string; artist: string; cover_url: string | null };

/** El tablero del día (top 10) para poner en otra web */
export function BoardEmbed() {
  const [rows, setRows] = useState<(BoardRow & { url?: string })[] | null>(null);
  const player = useMiniPlayer();
  useEffect(() => {
    void (async () => {
      const { data } = await supabase.rpc("track_board_current");
      const top = ((data || []) as BoardRow[]).slice(0, 10);
      const { data: au } = await supabase.from("tracks").select("id, audio_url").in("id", top.map((r) => r.track_id));
      const urls = new Map(((au || []) as { id: string; audio_url: string | null }[]).map((r) => [r.id, r.audio_url || undefined]));
      setRows(top.map((r) => ({ ...r, url: urls.get(r.track_id) })));
    })();
  }, []);
  return (
    <div className="sc-root is-embed">
      <header className="sc-head">
        <span className="sc-kicker">EL TABLERO // ESCENA UG</span>
        <h1>Top 10 de hoy</h1>
      </header>
      {rows === null && <p className="sc-empty">Cargando…</p>}
      <ol className="sc-list">
        {(rows || []).map((r) => (
          <li key={r.track_id} className={player.now?.id === r.track_id ? "is-now" : ""}>
            <span className="sc-rank">{r.rank}</span>
            <button
              type="button"
              className="sc-row"
              disabled={!r.url}
              onClick={() => r.url && player.play({ id: r.track_id, title: r.title, artist: r.artist, url: r.url, cover: r.cover_url })}
            >
              {r.cover_url ? <img src={r.cover_url} alt="" /> : <span className="sc-ph">♪</span>}
              <span>
                <b>{r.title}</b>
                <small>{r.artist}</small>
              </span>
              <i>{player.now?.id === r.track_id && player.playing ? "❚❚" : "▶"}</i>
            </button>
          </li>
        ))}
      </ol>
      <a className="sc-foot" href={SITE} target="_blank" rel="noopener">
        Abrir <b>El tablero.</b> ↗
      </a>
      <PlayerBar p={player} />
    </div>
  );
}
