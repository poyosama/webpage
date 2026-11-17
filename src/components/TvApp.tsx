"use client";

/**
 * Modo TV. La tele NO inicia sesión: muestra un código/QR, el celu logueado se lo "reclama"
 * (canal temporal tvpair:<código>) y desde ahí la tele se suma al control remoto de esa cuenta
 * (canal player:<userId>) como un dispositivo más, tipo "Tele". El celu le manda los links de audio.
 * Pensada para el control de la tele: pocas cosas, grandes, navegables con las flechas + OK.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRemotePlayer, type RemoteCommand, type TvMedia } from "@/lib/remotePlayer";
import { qrSvg } from "@/lib/qr";

const PAIR_KEY = "eltablero_tv_pair";
type Pair = { userId: string; name?: string; handle?: string };

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin 0/O ni 1/I
function newCode() {
  const a = new Uint32Array(6);
  crypto.getRandomValues(a);
  return Array.from(a, (n) => ALPHABET[n % ALPHABET.length]).join("");
}

const fmt = (s: number) => {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
};

/** Flechas del control: mueven el foco entre los botones marcados con data-tv */
function useDpad(onMedia: (k: "toggle" | "next" | "prev") => void) {
  const mediaRef = useRef(onMedia);
  mediaRef.current = onMedia;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key;
      if (k === "MediaPlayPause" || k === "MediaPlay" || k === "MediaPause") {
        e.preventDefault();
        mediaRef.current("toggle");
        return;
      }
      if (k === "MediaTrackNext" || k === "MediaFastForward") return mediaRef.current("next");
      if (k === "MediaTrackPrevious" || k === "MediaRewind") return mediaRef.current("prev");
      if (!/^Arrow(Left|Right|Up|Down)$/.test(k)) return;
      const items = Array.from(document.querySelectorAll<HTMLElement>("[data-tv]")).filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      e.preventDefault();
      const cur = items.indexOf(document.activeElement as HTMLElement);
      if (cur < 0) return items[0].focus();
      const r0 = items[cur].getBoundingClientRect();
      const cx = r0.left + r0.width / 2;
      const cy = r0.top + r0.height / 2;
      // el más cercano en esa dirección
      let best: HTMLElement | null = null;
      let bestD = Infinity;
      items.forEach((el, i) => {
        if (i === cur) return;
        const r = el.getBoundingClientRect();
        const dx = r.left + r.width / 2 - cx;
        const dy = r.top + r.height / 2 - cy;
        const ok = k === "ArrowLeft" ? dx < -4 : k === "ArrowRight" ? dx > 4 : k === "ArrowUp" ? dy < -4 : dy > 4;
        if (!ok) return;
        const horiz = k === "ArrowLeft" || k === "ArrowRight";
        const d = horiz ? Math.abs(dx) + Math.abs(dy) * 3 : Math.abs(dy) + Math.abs(dx) * 3;
        if (d < bestD) {
          bestD = d;
          best = el;
        }
      });
      (best as HTMLElement | null)?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

export default function TvApp() {
  const [pair, setPair] = useState<Pair | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PAIR_KEY);
      if (raw) setPair(JSON.parse(raw));
    } catch {}
    setReady(true);
    document.documentElement.classList.add("tv-mode");
    return () => document.documentElement.classList.remove("tv-mode");
  }, []);

  const onPaired = useCallback((p: Pair) => {
    try {
      localStorage.setItem(PAIR_KEY, JSON.stringify(p));
    } catch {}
    setPair(p);
  }, []);
  const unpair = () => {
    try {
      localStorage.removeItem(PAIR_KEY);
    } catch {}
    setPair(null);
  };

  if (!ready) return <main className="tv-root" />;
  return pair ? <TvPlayer pair={pair} onUnpair={unpair} /> : <TvPairing onPaired={onPaired} />;
}

/* ============================ VINCULAR ============================ */
function TvPairing({ onPaired }: { onPaired: (p: Pair) => void }) {
  const [code, setCode] = useState("");
  const [origin, setOrigin] = useState("https://www.eltablero.blog");
  useDpad(() => {});

  useEffect(() => {
    setOrigin(window.location.origin);
    setCode(newCode());
    // código nuevo cada 10 minutos (por si alguien lo vio de pasada)
    const id = window.setInterval(() => setCode(newCode()), 10 * 60 * 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!code) return;
    const ch = supabase.channel(`tvpair:${code}`, { config: { broadcast: { self: false } } });
    ch.on("broadcast", { event: "pair" }, ({ payload }) => {
      const p = payload as Pair;
      if (!p || typeof p.userId !== "string" || !/^[0-9a-f-]{36}$/i.test(p.userId)) return;
      void ch.send({ type: "broadcast", event: "paired", payload: { ok: true } });
      window.setTimeout(() => onPaired({ userId: p.userId, name: String(p.name || "").slice(0, 60), handle: String(p.handle || "").slice(0, 40) }), 300);
    });
    ch.subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [code, onPaired]);

  const link = `${origin}/?tv=${code}`;
  const svg = useMemo(() => (code ? qrSvg(link, "#0a0a0c", "#ffffff") : ""), [code, link]);
  const shortHost = origin.replace(/^https?:\/\/(www\.)?/, "");

  return (
    <main className="tv-root tv-pair">
      <div className="tv-pair-left">
        <img className="tv-logo" src="/brand/logo-el-tablero-white.svg" alt="El tablero." />
        <h1>Vinculá la tele con tu celu</h1>
        <ol>
          <li>
            Escaneá el QR con la cámara del celu <span>(con tu sesión de El tablero abierta)</span>
          </li>
          <li>
            O en el celu: <b>{shortHost}</b> → reproductor → ícono de dispositivos → <b>Vincular una tele</b> y escribí:
          </li>
        </ol>
        <div className="tv-code" aria-label={`Código ${code.split("").join(" ")}`}>
          {(code || "······").split("").map((c, i) => (
            <span key={i}>{c}</span>
          ))}
        </div>
        <p className="tv-hint">Después manejás todo desde el celu: elegís el track y lo mandás a la tele.</p>
      </div>
      <div className="tv-qr" dangerouslySetInnerHTML={{ __html: svg }} />
    </main>
  );
}

/* ============================ REPRODUCTOR ============================ */
function TvPlayer({ pair, onUnpair }: { pair: Pair; onUnpair: () => void }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [media, setMedia] = useState<TvMedia | null>(null);
  const [idx, setIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  const [volume, setVolume] = useState(1);
  const [needsTap, setNeedsTap] = useState(false);
  const [confirmUnpair, setConfirmUnpair] = useState(false);
  const playBtnRef = useRef<HTMLButtonElement>(null);

  const st = useRef({ media, idx, isPlaying, pos, dur, volume });
  st.current = { media, idx, isPlaying, pos, dur, volume };
  const track = media?.tracks[idx] || null;

  const tryPlay = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    void a.play().then(
      () => setNeedsTap(false),
      (err: unknown) => {
        if ((err as { name?: string })?.name === "NotAllowedError") setNeedsTap(true);
      }
    );
  }, []);

  const load = useCallback(
    (m: TvMedia, i: number, startAt = 0, autoplay = true) => {
      const a = audioRef.current;
      const t = m.tracks[i];
      if (!a || !t) return;
      setMedia(m);
      setIdx(i);
      setPos(startAt);
      setDur(t.durationSec || 0);
      if (a.src !== t.url) a.src = t.url;
      const go = () => {
        if (startAt > 0) {
          try {
            a.currentTime = startAt;
          } catch {}
        }
        if (autoplay) tryPlay();
        else a.pause();
      };
      if (a.readyState >= 1) go();
      else a.addEventListener("loadedmetadata", go, { once: true });
    },
    [tryPlay]
  );

  const step = useCallback(
    (dir: 1 | -1) => {
      const { media: m, idx: i } = st.current;
      if (!m) return;
      const a = audioRef.current;
      if (dir === -1 && a && a.currentTime > 4) {
        a.currentTime = 0;
        return;
      }
      const n = i + dir;
      if (n < 0 || n >= m.tracks.length) {
        if (dir === -1 && a) a.currentTime = 0;
        return;
      }
      load(m, n);
    },
    [load]
  );

  const toggle = useCallback(() => {
    const a = audioRef.current;
    if (!a || !st.current.media) return;
    if (a.paused) tryPlay();
    else a.pause();
  }, [tryPlay]);

  const onCommand = (cmd: RemoteCommand) => {
    const a = audioRef.current;
    switch (cmd.action) {
      case "toggle":
        toggle();
        break;
      case "next":
        step(1);
        break;
      case "prev":
        step(-1);
        break;
      case "seek":
        if (a) a.currentTime = Math.max(0, cmd.sec);
        break;
      case "volume":
        if (a) a.volume = Math.max(0, Math.min(1, cmd.value));
        setVolume(cmd.value);
        break;
      case "pause_local":
        a?.pause();
        break;
      case "play_track":
      case "transfer": {
        const m = cmd.media && cmd.media.tracks.length ? cmd.media : st.current.media;
        if (!m) break;
        const i = m.tracks.findIndex((t) => t.id === cmd.trackId);
        if (i < 0) break;
        if (cmd.action === "transfer") load(m, i, cmd.position || 0, cmd.playing);
        else load(m, i);
        break;
      }
    }
    window.setTimeout(() => remote.publishNow(), 500);
  };

  const remote = useRemotePlayer({
    userId: pair.userId,
    deviceName: "Tele",
    kind: "tv",
    getLocalState: () => {
      const s = st.current;
      const t = s.media?.tracks[s.idx];
      if (!t || !s.media) return null;
      return {
        trackId: t.id,
        projectId: s.media.project.id,
        title: t.title,
        artist: t.artist,
        cover: t.cover || s.media.project.cover,
        isPlaying: s.isPlaying,
        position: audioRef.current?.currentTime || 0,
        duration: s.dur,
        volume: s.volume,
      };
    },
    onCommand,
  });

  // Teclas multimedia del control + botones de la notificación del sistema
  useDpad((k) => (k === "toggle" ? toggle() : step(k === "next" ? 1 : -1)));
  useEffect(() => {
    const ms = typeof navigator !== "undefined" ? navigator.mediaSession : undefined;
    if (!ms) return;
    try {
      ms.setActionHandler("play", () => tryPlay());
      ms.setActionHandler("pause", () => audioRef.current?.pause());
      ms.setActionHandler("nexttrack", () => step(1));
      ms.setActionHandler("previoustrack", () => step(-1));
    } catch {}
  }, [step, tryPlay]);
  useEffect(() => {
    if (!track || typeof navigator === "undefined" || !navigator.mediaSession || typeof MediaMetadata === "undefined") return;
    const art = track.cover || media?.project.cover;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      album: media?.project.title,
      artwork: art ? [{ src: art, sizes: "512x512" }] : [],
    });
  }, [track, media]);

  // Que la tele no se apague / no entre el protector de pantalla mientras suena
  useEffect(() => {
    if (!isPlaying) return;
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    void nav.wakeLock?.request("screen").then((l) => (lock = l)).catch(() => {});
    return () => {
      void lock?.release().catch(() => {});
    };
  }, [isPlaying]);

  // Foco inicial en play cuando hay algo cargado
  useEffect(() => {
    if (track && document.activeElement === document.body) playBtnRef.current?.focus();
  }, [track]);
  useEffect(() => {
    if (!confirmUnpair) return;
    const t = window.setTimeout(() => setConfirmUnpair(false), 4000);
    return () => window.clearTimeout(t);
  }, [confirmUnpair]);

  const cover = track?.cover || media?.project.cover;
  const elsewhere = !track && remote.remoteState && remote.activeDeviceId !== remote.myDeviceId ? remote.remoteState : null;
  const who = pair.handle ? (pair.handle.startsWith("@") ? pair.handle : `@${pair.handle}`) : pair.name || "tu cuenta";

  return (
    <main className={`tv-root tv-player ${track ? "has-track" : "is-idle"}`}>
      <audio
        ref={audioRef}
        preload="auto"
        onPlay={() => {
          setIsPlaying(true);
          remote.publishNow();
        }}
        onPause={() => {
          setIsPlaying(false);
          remote.publishNow();
        }}
        onTimeUpdate={(e) => setPos(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => Number.isFinite(e.currentTarget.duration) && setDur(e.currentTarget.duration)}
        onEnded={() => step(1)}
      />

      {/* fondo: canvas del track o tapa desenfocada */}
      <div className="tv-bg" aria-hidden>
        {track?.canvas ? (
          <video key={track.canvas} src={track.canvas} autoPlay muted loop playsInline />
        ) : cover ? (
          <div className="tv-bg-cover" style={{ backgroundImage: `url(${cover})` }} />
        ) : null}
      </div>

      {track && media ? (
        <section className="tv-now">
          <div className="tv-cover" style={cover ? { backgroundImage: `url(${cover})` } : undefined} />
          <div className="tv-info">
            <span className="tv-kicker">{media.project.title}</span>
            <h1>{track.title}</h1>
            <p className="tv-artist">{track.artist}</p>
            <div className="tv-progress">
              <div className="tv-bar">
                <i style={{ width: `${dur ? Math.min(100, (pos / dur) * 100) : 0}%` }} />
              </div>
              <div className="tv-times">
                <span>{fmt(pos)}</span>
                <span>{fmt(dur)}</span>
              </div>
            </div>
            <div className="tv-controls">
              <button type="button" data-tv onClick={() => step(-1)} aria-label="Anterior">
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M6 5h2v14H6zM20 5v14L9.5 12z" /></svg>
              </button>
              <button type="button" data-tv ref={playBtnRef} className="tv-play" onClick={toggle} aria-label={isPlaying ? "Pausa" : "Reproducir"}>
                {isPlaying ? (
                  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M6 5h4v14H6zM14 5h4v14h-4z" /></svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M7 4.5v15L20 12z" /></svg>
                )}
              </button>
              <button type="button" data-tv onClick={() => step(1)} aria-label="Siguiente">
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M16 5h2v14h-2zM4 5v14l10.5-7z" /></svg>
              </button>
            </div>
            <p className="tv-upnext">
              {media.tracks[idx + 1] ? (
                <>
                  Sigue: <b>{media.tracks[idx + 1].title}</b>
                </>
              ) : (
                <>Último track del proyecto</>
              )}
            </p>
          </div>
        </section>
      ) : (
        <section className="tv-idle">
          <img className="tv-logo" src="/brand/logo-el-tablero-white.svg" alt="El tablero." />
          <h1>Lista para sonar</h1>
          {elsewhere ? (
            <p>
              Está sonando <b>{elsewhere.title}</b> en otro dispositivo. Desde el celu tocá el ícono de dispositivos y elegí <b>Tele</b>.
            </p>
          ) : (
            <p>
              En el celu poné un track, tocá el ícono de dispositivos y elegí <b>Tele</b>.
            </p>
          )}
        </section>
      )}

      <footer className="tv-foot">
        <span>
          <i className="tv-dot" /> Vinculada con {who}
        </span>
        <button
          type="button"
          data-tv
          className={`tv-unpair ${confirmUnpair ? "is-confirm" : ""}`}
          onClick={() => {
            if (!confirmUnpair) return setConfirmUnpair(true);
            audioRef.current?.pause();
            onUnpair();
          }}
        >
          {confirmUnpair ? "¿Seguro? Apretá OK de nuevo" : "Desvincular"}
        </button>
      </footer>

      {needsTap && (
        <div className="tv-tap">
          <div>
            <h2>Apretá OK para escuchar</h2>
            <p>La tele pide un toque del control la primera vez.</p>
            <button
              type="button"
              data-tv
              autoFocus
              onClick={() => {
                setNeedsTap(false);
                tryPlay();
              }}
            >
              ▶ Escuchar
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
