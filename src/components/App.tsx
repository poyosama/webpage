"use client";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { artists, events, library, posts, type Artist, type Release } from "@/lib/mock";
import { sfx } from "@/lib/sfx";
import type { Face } from "./CubeScene";

const CubeScene = dynamic(() => import("./CubeScene"), { ssr: false });
const CoverStack = dynamic(() => import("./CoverStack"), { ssr: false });
const CerroMap = dynamic(() => import("./CerroMap"), { ssr: false });

const ME = artists[0];
// 4 caras en el anillo (se rota con snap izquierda/derecha) + perfil arriba.
const FACES: Face[] = [
  { id: "inicio", label: "inicio", sub: "esta semana en mendoza", glyph: "◈" },
  { id: "comunidad", label: "comunidad", sub: "feed · agenda", glyph: "⟡" },
  { id: "biblioteca", label: "biblioteca", sub: "proyectos · versiones", glyph: "▤" },
  { id: "mapa", label: "mapa", sub: "la escena en el cerro", glyph: "△" },
  { id: "perfil", label: `@${ME.name}`, sub: "tu espacio", glyph: "◉" },
];
const RING = 4;

const fx = { onMouseEnter: () => sfx.hover() };

export default function App() {
  const [face, setFace] = useState(0);
  const [inside, setInside] = useState(false);
  const [muted, setMuted] = useState(false);
  const [open, setOpen] = useState<Release | null>(null);
  const [playing, setPlaying] = useState<{ title: string; artist: string } | null>(null);
  const [selected, setSelected] = useState<Artist | null>(null);
  const [liked, setLiked] = useState<Set<number>>(new Set());
  const drag = useRef({ x: 0, y: 0 });
  const start = useRef<{ x: number; y: number } | null>(null);
  const S = useRef({ face, inside }); S.current = { face, inside };

  const turn = (dir: 1 | -1) => {
    const f = S.current.face;
    const next = f === 4 ? 0 : (f + dir + RING) % RING;
    setFace(next); sfx.blade();
  };
  const up = () => { if (S.current.face !== 4) { setFace(4); sfx.blade(); } };
  const down = () => { if (S.current.face === 4) { setFace(0); sfx.blade(); } };
  const enter = () => { setInside(true); sfx.open(); window.scrollTo({ top: 0 }); };
  const exit = () => { setInside(false); sfx.close(); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const jump = (i: number) => { if (i !== S.current.face) { setFace(i); sfx.blade(); } if (S.current.inside) window.scrollTo({ top: 0 }); };

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      if (e.key === "Escape") { if (open) { setOpen(null); sfx.close(); } else if (S.current.inside) exit(); return; }
      if (S.current.inside) return;
      if (e.key === "ArrowRight") turn(1);
      if (e.key === "ArrowLeft") turn(-1);
      if (e.key === "ArrowUp") up();
      if (e.key === "ArrowDown") down();
      if (e.key === "Enter") enter();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  const play = (title: string, artist: string) => {
    if (playing?.title === title) { setPlaying(null); sfx.pause(); }
    else { setPlaying({ title, artist }); sfx.play(); }
  };

  return (
    <div className={`app ${inside ? "is-inside" : ""}`}>
      <div className="scene">
        <CubeScene faces={FACES} index={face} compact={inside} drag={drag} onEnter={() => (inside ? exit() : enter())} />
      </div>

      {/* capa de arrastre: solo en el menú del cubo */}
      {!inside && (
        <div
          className="dragpad"
          onPointerDown={(e) => { start.current = { x: e.clientX, y: e.clientY }; (e.target as HTMLElement).setPointerCapture(e.pointerId); }}
          onPointerMove={(e) => {
            if (!start.current) return;
            const dx = (e.clientX - start.current.x) / 260, dy = (e.clientY - start.current.y) / 260;
            const nx = Math.max(-1, Math.min(1, dx)), ny = Math.max(-1, Math.min(1, dy));
            if (Math.abs(nx - drag.current.x) > 0.12) sfx.tick();
            drag.current = { x: nx, y: ny };
          }}
          onPointerUp={(e) => {
            if (!start.current) return;
            const dx = e.clientX - start.current.x, dy = e.clientY - start.current.y;
            start.current = null; drag.current = { x: 0, y: 0 };
            if (Math.abs(dx) < 6 && Math.abs(dy) < 6) { enter(); return; }
            if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 60) turn(dx > 0 ? -1 : 1);
            else if (dy > 60) up();
            else if (dy < -60) down();
          }}
        />
      )}

      <header className="hud">
        <div className="brand" {...fx} onClick={() => inside && exit()}>
          <b>EL CERRO</b><span>de la gloria</span>
        </div>
        <nav className="facebar">
          {FACES.map((f, i) => (
            <button key={f.id} className={i === face ? "on" : ""} {...fx} onClick={() => jump(i)}>
              <i>{String(i + 1).padStart(2, "0")}</i>{f.label}
            </button>
          ))}
        </nav>
        <button className="mute" {...fx} onClick={() => { const m = !muted; setMuted(m); sfx.setMuted(m); }}>
          {muted ? "SND OFF" : "SND ON"}
        </button>
      </header>

      <AnimatePresence>
        {!inside && (
          <motion.div className="cube-caption" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}>
            <AnimatePresence mode="wait">
              <motion.div key={face} initial={{ opacity: 0, filter: "blur(6px)" }} animate={{ opacity: 1, filter: "blur(0px)" }} exit={{ opacity: 0, filter: "blur(6px)" }} transition={{ duration: 0.25 }}>
                <h1>{FACES[face].label}</h1>
                <p>{FACES[face].sub}</p>
              </motion.div>
            </AnimatePresence>
            <small>arrastrá ← → para girar · ↑ perfil · click / enter para entrar</small>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {inside && (
          <motion.main
            key={face}
            className="panel"
            initial={{ opacity: 0, y: 40, scale: 0.98, filter: "blur(10px)" }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -20, filter: "blur(10px)" }}
            transition={{ duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <div className="panel-h">
              <span className="idx">{String(face + 1).padStart(2, "0")} / 05</span>
              <h1>{FACES[face].label}</h1>
              <button className="back" {...fx} onClick={exit}>← volver al cubo</button>
            </div>

            {face === 0 && (
              <>
                <CoverStack onOpen={(r) => setOpen(r)} />
                <section className="grid2">
                  <div className="card">
                    <h3>lo más escuchado — semana</h3>
                    <ol className="list">
                      {artists.slice().sort((a, b) => b.followers - a.followers).slice(0, 5).map((a, i) => (
                        <li key={a.id} {...fx} onClick={() => play(`top ${i + 1}`, a.name)}>
                          <span className="n">{String(i + 1).padStart(2, "0")}</span>{a.name}<em>{a.role}</em>
                        </li>
                      ))}
                    </ol>
                  </div>
                  <div className="card">
                    <h3>próximos shows</h3>
                    {events.slice(0, 2).map((e) => (
                      <div key={e.name} className="row" {...fx} onClick={() => sfx.click()}>
                        <b>{e.date}</b><span>{e.name}</span><small>{e.place}</small>
                      </div>
                    ))}
                  </div>
                </section>
              </>
            )}

            {face === 1 && (
              <section className="grid2 wide">
                <div>
                  <div className="card composer">
                    <input placeholder="hoy grabando, snippet, foto..." onKeyDown={() => sfx.type()} onFocus={() => sfx.click()} />
                    <button {...fx} onClick={() => sfx.open()}>publicar</button>
                  </div>
                  {posts.map((p, i) => (
                    <motion.div key={i} className="card post" initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} {...fx}>
                      <div className="post-h"><b>{p.who}</b><span className="tag">{p.kind}</span><small>{p.ago}</small></div>
                      <p>{p.text}</p>
                      <div className="post-a">
                        <button className={liked.has(i) ? "liked" : ""} {...fx} onClick={() => { sfx.like(); setLiked((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; }); }}>♥ like</button>
                        {p.kind === "snippet" && <button {...fx} onClick={() => play(p.text, p.who)}>▶ play</button>}
                        <button {...fx} onClick={() => sfx.click()}>comentar</button>
                      </div>
                    </motion.div>
                  ))}
                </div>
                <div className="card">
                  <h3>agenda</h3>
                  {events.map((e) => (
                    <div key={e.name} className="row" {...fx} onClick={() => sfx.click()}>
                      <b>{e.date}</b><span>{e.name}</span><small>{e.place} — {e.lineup}</small>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {face === 2 && (
              <section>
                <div className="toolbar"><button className="btn" {...fx} onClick={() => sfx.open()}>+ nuevo proyecto</button></div>
                {library.map((p) => (
                  <div key={p.title} className="card project">
                    <div className="project-h"><div className="cover-mini" /><div><h3>{p.title}</h3><small>{p.type} · {p.status} · {p.tracks.length} tracks</small></div></div>
                    <table>
                      <thead><tr><th></th><th>track</th><th>bpm</th><th>key</th><th>ver</th><th>dur</th></tr></thead>
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

            {face === 3 && (
              <section>
                <CerroMap onSelect={setSelected} selected={selected} />
                {selected && (
                  <div className="card sel">
                    <span className="swatch" style={{ background: selected.color }} />
                    <div><h3>{selected.name}</h3><small>{selected.role} · {selected.zone} · {selected.followers} followers</small></div>
                    <button className="btn" {...fx} onClick={() => sfx.open()}>ver perfil</button>
                  </div>
                )}
              </section>
            )}

            {face === 4 && (
              <section>
                <div className="card banner">
                  <div className="avatar" />
                  <div><h2>{ME.name}</h2><p className="dim">{ME.role} · {ME.zone} — &quot;fuego lento, pero fuego&quot;</p></div>
                </div>
                <div className="metrics">
                  {[["tracks", ME.tracks], ["proyectos", ME.projects], ["amigos", ME.friends], ["followers", ME.followers]].map(([k, v]) => (
                    <div key={k} className="card metric" {...fx}><b>{v}</b><span>{k}</span></div>
                  ))}
                </div>
                <div className="grid2">
                  <div className="card"><h3>tema destacado</h3>
                    <div className="row" {...fx} onClick={() => play("fuego lento", ME.name)}><b>▶</b><span>fuego lento</span><small>140 bpm · A menor</small></div>
                  </div>
                  <div className="card"><h3>top 8</h3>
                    <div className="top8">{artists.slice(1).map((a) => (
                      <div key={a.id} {...fx} onClick={() => sfx.click()}><span className="swatch" style={{ background: a.color }} /><small>{a.name}</small></div>
                    ))}</div>
                  </div>
                </div>
              </section>
            )}
          </motion.main>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <motion.div className="modal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => { setOpen(null); sfx.close(); }}>
            <motion.div className="card modal-c" initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9 }} onClick={(e) => e.stopPropagation()}>
              <div className="cover-big" style={{ background: `radial-gradient(circle at 35% 40%, ${open.c1}, ${open.c2})` }} />
              <div>
                <span className="tag">{open.type}</span>
                <h2>{open.title}</h2><p className="dim">{open.artist}</p>
                <button className="btn" {...fx} onClick={() => play(open.title, open.artist)}>{playing?.title === open.title ? "❚❚ pausa" : "▶ escuchar"}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {playing && (
          <motion.div className="player" initial={{ y: 100 }} animate={{ y: 0 }} exit={{ y: 100 }}>
            <div className="eq">{[0, 1, 2, 3].map((i) => <i key={i} style={{ animationDelay: `${i * 0.15}s` }} />)}</div>
            <div><b>{playing.title}</b><small>{playing.artist}</small></div>
            <button {...fx} onClick={() => { setPlaying(null); sfx.pause(); }}>❚❚</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
