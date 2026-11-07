"use client";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { artists, events, library, posts, type Artist, type Release } from "@/lib/mock";
import { sfx } from "@/lib/sfx";
import Background from "./Background";

const CoverStack = dynamic(() => import("./CoverStack"), { ssr: false });
const CerroMap = dynamic(() => import("./CerroMap"), { ssr: false });

const ME = artists[0];
const BLADES = ["inicio", "comunidad", "biblioteca", "mapa", `@${ME.name}`];

// helper: todo lo interactivo suena
const fx = { onMouseEnter: () => sfx.hover() };

export default function App() {
  const [blade, setBlade] = useState(0);
  const [dir, setDir] = useState(1);
  const [muted, setMuted] = useState(false);
  const [open, setOpen] = useState<Release | null>(null);
  const [playing, setPlaying] = useState<{ title: string; artist: string } | null>(null);
  const [selected, setSelected] = useState<Artist | null>(null);
  const [liked, setLiked] = useState<Set<number>>(new Set());
  const [today, setToday] = useState("");
  useEffect(() => { setToday(new Date().toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })); }, []);

  const go = (i: number) => {
    if (i === blade || i < 0 || i >= BLADES.length) return;
    setDir(i > blade ? 1 : -1); setBlade(i); sfx.blade();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const goRef = useRef(go); goRef.current = go;
  const bladeRef = useRef(blade); bladeRef.current = blade;

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      if (e.key === "ArrowRight") goRef.current(bladeRef.current + 1);
      if (e.key === "ArrowLeft") goRef.current(bladeRef.current - 1);
      if (e.key === "Escape") { setOpen(null); sfx.close(); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  const play = (title: string, artist: string) => {
    if (playing?.title === title) { setPlaying(null); sfx.pause(); }
    else { setPlaying({ title, artist }); sfx.play(); }
  };

  return (
    <div className="app">
      <Background playing={!!playing} />

      <header className="topbar">
        <div className="logo" {...fx} onClick={() => go(0)}>
          <span className="orb" /> EL CERRO <i>de la gloria</i>
        </div>
        <nav className="blades">
          {BLADES.map((b, i) => (
            <button key={b} className={i === blade ? "on" : ""} {...fx} onClick={() => go(i)}>
              {b}
              {i === blade && <motion.span layoutId="bladeGlow" className="glow" />}
            </button>
          ))}
        </nav>
        <button className="mute" {...fx} onClick={() => { const m = !muted; setMuted(m); sfx.setMuted(m); }}>
          {muted ? "🔇" : "🔊"}
        </button>
      </header>

      <AnimatePresence mode="wait" custom={dir}>
        <motion.main
          key={blade}
          custom={dir}
          initial={{ opacity: 0, x: dir * 120, rotateY: dir * -12, scale: 0.96 }}
          animate={{ opacity: 1, x: 0, rotateY: 0, scale: 1 }}
          exit={{ opacity: 0, x: dir * -120, rotateY: dir * 12, scale: 0.96 }}
          transition={{ type: "spring", stiffness: 260, damping: 28 }}
          className="panel"
        >
          {blade === 0 && (
            <>
              <section className="hero">
                <h1>esta semana en mendoza</h1>
                <p className="dim">{today}</p>
              </section>
              <CoverStack onOpen={setOpen} />
              <section className="grid2">
                <div className="glass">
                  <h3>lo más escuchado · semana</h3>
                  <ol className="top">
                    {artists.slice().sort((a, b) => b.followers - a.followers).slice(0, 5).map((a, i) => (
                      <li key={a.id} {...fx} onClick={() => play(`top ${i + 1}`, a.name)}>
                        <span className="n">{i + 1}</span><span className="dot" style={{ background: a.color }} />
                        {a.name}<em>{a.role}</em>
                      </li>
                    ))}
                  </ol>
                </div>
                <div className="glass">
                  <h3>próximos shows</h3>
                  {events.slice(0, 2).map((e) => (
                    <div key={e.name} className="event" {...fx} onClick={() => sfx.click()}>
                      <b>{e.date}</b><span>{e.name}</span><small>{e.place}</small>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}

          {blade === 1 && (
            <section className="grid2 wide">
              <div>
                <div className="glass composer">
                  <input placeholder="¿qué estás haciendo? (hoy grabando, snippet, foto...)" onKeyDown={() => sfx.type()} onFocus={() => sfx.click()} />
                  <button {...fx} onClick={() => sfx.open()}>publicar</button>
                </div>
                {posts.map((p, i) => (
                  <motion.div key={i} className="glass post" initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} {...fx}>
                    <div className="post-h"><b>{p.who}</b><span className="chip">{p.kind}</span><small>{p.ago}</small></div>
                    <p>{p.text}</p>
                    <div className="post-a">
                      <button className={liked.has(i) ? "liked" : ""} {...fx} onClick={() => { sfx.like(); setLiked((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; }); }}>♥</button>
                      {p.kind === "snippet" && <button {...fx} onClick={() => play(p.text, p.who)}>▶</button>}
                      <button {...fx} onClick={() => sfx.click()}>comentar</button>
                    </div>
                  </motion.div>
                ))}
              </div>
              <div className="glass">
                <h3>agenda</h3>
                {events.map((e) => (
                  <div key={e.name} className="event" {...fx} onClick={() => sfx.click()}>
                    <b>{e.date}</b><span>{e.name}</span><small>{e.place} — {e.lineup}</small>
                  </div>
                ))}
              </div>
            </section>
          )}

          {blade === 2 && (
            <section>
              <div className="lib-h"><h1>biblioteca</h1><button className="btn" {...fx} onClick={() => sfx.open()}>+ nuevo proyecto</button></div>
              {library.map((p) => (
                <div key={p.title} className="glass project">
                  <div className="project-h"><div className="cover-mini" /><div><h3>{p.title}</h3><small>{p.type} · {p.status} · {p.tracks.length} tracks</small></div></div>
                  <table>
                    <thead><tr><th></th><th>track</th><th>bpm</th><th>key</th><th>versión</th><th>dur</th></tr></thead>
                    <tbody>
                      {p.tracks.map((t) => (
                        <tr key={t.t} {...fx} onClick={() => play(t.t, ME.name)} className={playing?.title === t.t ? "on" : ""}>
                          <td>{playing?.title === t.t ? "❚❚" : "▶"}</td><td>{t.t}</td><td>{t.bpm}</td><td>{t.key}</td><td>v{t.v}</td><td>{t.dur}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </section>
          )}

          {blade === 3 && (
            <section>
              <div className="lib-h"><h1>mapa de la escena</h1><small className="dim">arrastrá para girar el cerro · click en un nodo</small></div>
              <CerroMap onSelect={setSelected} selected={selected} />
              {selected && (
                <div className="glass sel">
                  <span className="dot big" style={{ background: selected.color }} />
                  <div><h3>{selected.name}</h3><small>{selected.role} · {selected.zone} · {selected.followers} followers</small></div>
                  <button className="btn" {...fx} onClick={() => sfx.open()}>ver perfil</button>
                </div>
              )}
            </section>
          )}

          {blade === 4 && (
            <section className="profile">
              <div className="banner glass">
                <div className="avatar" style={{ boxShadow: `0 0 40px ${ME.color}` }} />
                <div><h1>{ME.name}</h1><p className="dim">{ME.role} · {ME.zone} · &quot;fuego lento, pero fuego&quot;</p></div>
              </div>
              <div className="metrics">
                {[["tracks", ME.tracks], ["proyectos", ME.projects], ["amigos", ME.friends], ["followers", ME.followers]].map(([k, v]) => (
                  <div key={k} className="glass metric" {...fx}><b>{v}</b><span>{k}</span></div>
                ))}
              </div>
              <div className="grid2">
                <div className="glass"><h3>tema destacado</h3>
                  <div className="event" {...fx} onClick={() => play("fuego lento", ME.name)}><b>▶</b><span>fuego lento</span><small>140 bpm · A menor</small></div>
                </div>
                <div className="glass"><h3>top 8</h3>
                  <div className="top8">{artists.slice(1).map((a) => (
                    <div key={a.id} {...fx} onClick={() => sfx.click()}><span className="dot big" style={{ background: a.color }} /><small>{a.name}</small></div>
                  ))}</div>
                </div>
              </div>
            </section>
          )}
        </motion.main>
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <motion.div className="modal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => { setOpen(null); sfx.close(); }}>
            <motion.div className="glass modal-c" initial={{ scale: 0.8, rotateX: 20 }} animate={{ scale: 1, rotateX: 0 }} exit={{ scale: 0.8 }} onClick={(e) => e.stopPropagation()}>
              <div className="cover-big" style={{ background: `radial-gradient(circle at 35% 40%, ${open.c1}, ${open.c2})` }} />
              <div>
                <span className="chip">{open.type}</span>
                <h2>{open.title}</h2><p className="dim">{open.artist}</p>
                <button className="btn" {...fx} onClick={() => play(open.title, open.artist)}>{playing?.title === open.title ? "❚❚ pausa" : "▶ escuchar"}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {playing && (
          <motion.div className="player glass" initial={{ y: 100 }} animate={{ y: 0 }} exit={{ y: 100 }}>
            <div className="eq">{[0, 1, 2, 3].map((i) => <i key={i} style={{ animationDelay: `${i * 0.15}s` }} />)}</div>
            <div><b>{playing.title}</b><small>{playing.artist}</small></div>
            <button {...fx} onClick={() => { setPlaying(null); sfx.pause(); }}>❚❚</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
