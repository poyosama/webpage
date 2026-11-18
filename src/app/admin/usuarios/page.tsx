"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { agoEs, fetchAdminUsers, isOnline, supabase, type AdminUserRow } from "@/lib/supabase";

type Filter = "todos" | "activos" | "escuchando" | "inactivos";

/** Admin (@poyo): todos los registrados, quién está conectado, hace cuánto se fue y qué escucha */
export default function AdminUsuarios() {
  const [rows, setRows] = useState<AdminUserRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("todos");
  const [q, setQ] = useState("");
  const [, setTick] = useState(0);

  const load = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      setError("Iniciá sesión en El tablero con tu cuenta y volvé a esta página.");
      return;
    }
    const r = await fetchAdminUsers();
    if (r.error) setError(/solo admin/.test(r.error) ? "Esta página es solo para el admin." : r.error);
    else {
      setError(null);
      setRows(r.rows);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => document.visibilityState === "visible" && void load(), 20000);
    const t = window.setInterval(() => setTick((n) => n + 1), 15000);
    return () => {
      window.clearInterval(id);
      window.clearInterval(t);
    };
  }, [load]);

  const live = (r: AdminUserRow) => r.is_playing && isOnline(r.last_seen);
  const stats = useMemo(() => {
    if (!rows) return { total: 0, online: 0, listening: 0, today: 0 };
    const all = rows;
    const day = Date.now() - 86400000;
    return {
      total: all.length,
      online: all.filter((r) => isOnline(r.last_seen)).length,
      listening: all.filter(live).length,
      today: all.filter((r) => r.last_seen && new Date(r.last_seen).getTime() > day).length,
    };
  }, [rows]);

  const list = (rows || []).filter((r) => {
    if (filter === "activos" && !isOnline(r.last_seen)) return false;
    if (filter === "escuchando" && !live(r)) return false;
    if (filter === "inactivos" && isOnline(r.last_seen)) return false;
    if (q) {
      const hay = `${r.handle || ""} ${r.name || ""} ${r.email || ""}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  });

  return (
    <main className="au-page">
      <style>{`
        .au-page{min-height:100dvh;background:#09090b;color:#f4f4f5;font:14px/1.5 -apple-system,system-ui,sans-serif;padding:32px 16px 60px}
        .au-wrap{max-width:1100px;margin:0 auto}
        .au-kicker{font:600 11px ui-monospace,monospace;letter-spacing:.14em;opacity:.55;margin:0}
        .au-page h1{margin:4px 0 18px;font-size:28px}
        .au-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:18px}
        .au-stat{background:#141418;border:1px solid #232329;border-radius:14px;padding:12px 14px}
        .au-stat b{display:block;font-size:26px;font-variant-numeric:tabular-nums}
        .au-stat span{font-size:12px;color:#a1a1aa}
        .au-tools{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;align-items:center}
        .au-tools button{border:1px solid #2a2a31;background:#141418;color:#d4d4d8;border-radius:99px;padding:6px 12px;font:inherit;cursor:pointer}
        .au-tools button.on{background:#f4f4f5;color:#09090b;border-color:#f4f4f5}
        .au-tools input{flex:1;min-width:160px;background:#141418;border:1px solid #2a2a31;color:#f4f4f5;border-radius:10px;padding:8px 10px;font:inherit}
        .au-list{display:flex;flex-direction:column;gap:6px}
        .au-row{display:grid;grid-template-columns:44px minmax(0,1.3fr) minmax(0,1fr) minmax(0,1.6fr);gap:12px;align-items:center;background:#111114;border:1px solid #1e1e24;border-radius:14px;padding:10px 12px}
        .au-av{position:relative;width:44px;height:44px;border-radius:50%;background:#232329;display:grid;place-items:center;font-weight:700}
        .au-av img{width:100%;height:100%;border-radius:50%;object-fit:cover}
        .au-av i{position:absolute;right:0;bottom:0;width:12px;height:12px;border-radius:50%;background:#22c55e;border:2px solid #111114}
        .au-who b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .au-who small,.au-when small{display:block;color:#8b8b93;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .au-when b{font-weight:600}
        .au-when .on{color:#4ade80}
        .au-now{display:flex;gap:10px;align-items:center;min-width:0}
        .au-now img{width:38px;height:38px;border-radius:7px;object-fit:cover;flex:none}
        .au-now div{min-width:0}
        .au-now b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600}
        .au-now small{display:block;color:#8b8b93;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .au-live{color:#4ade80;font:600 10px ui-monospace,monospace;letter-spacing:.12em}
        .au-err{background:#1c1416;border:1px solid #4c1d24;color:#fecaca;border-radius:12px;padding:12px 14px}
        @media (max-width:760px){
          .au-stats{grid-template-columns:repeat(2,1fr)}
          .au-row{grid-template-columns:44px minmax(0,1fr);row-gap:6px}
          .au-when,.au-now{grid-column:2}
        }
      `}</style>
      <div className="au-wrap">
        <p className="au-kicker">EL TABLERO · ADMIN</p>
        <h1>Usuarios</h1>
        {error && <p className="au-err">{error}</p>}
        {!error && (
          <>
            <div className="au-stats">
              <div className="au-stat"><b>{stats.total}</b><span>registrados</span></div>
              <div className="au-stat"><b>{stats.online}</b><span>conectados ahora</span></div>
              <div className="au-stat"><b>{stats.listening}</b><span>escuchando ahora</span></div>
              <div className="au-stat"><b>{stats.today}</b><span>activos en 24 h</span></div>
            </div>
            <div className="au-tools">
              {(["todos", "activos", "escuchando", "inactivos"] as Filter[]).map((f) => (
                <button key={f} type="button" className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>
                  {f[0].toUpperCase() + f.slice(1)}
                </button>
              ))}
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar @usuario, nombre o mail" />
            </div>
            {rows === null && <p>Cargando…</p>}
            <div className="au-list">
              {list.map((r) => {
                const handle = (r.handle || "").replace(/^@+/, "");
                const on = isOnline(r.last_seen);
                const playing = live(r);
                return (
                  <div key={r.user_id} className="au-row">
                    <div className="au-av">
                      {r.avatar_url ? <img src={r.avatar_url} alt="" /> : (r.name || handle || r.email || "?").charAt(0).toUpperCase()}
                      {on && <i />}
                    </div>
                    <div className="au-who">
                      <b>{handle ? `@${handle}` : "(sin perfil)"} {r.name && <span style={{ fontWeight: 400, color: "#a1a1aa" }}>· {r.name}</span>}</b>
                      <small>{r.email}</small>
                      <small>
                        {r.account_type || "—"} · se registró {agoEs(r.registered_at)}
                      </small>
                    </div>
                    <div className="au-when">
                      {on ? <b className="on">● Conectado</b> : <b>{r.last_seen ? `Visto ${agoEs(r.last_seen)}` : "Sin actividad registrada"}</b>}
                      <small>Último login: {agoEs(r.last_sign_in_at)}</small>
                      {r.device && <small>Dispositivo: {r.device}</small>}
                    </div>
                    <div className="au-now">
                      {r.track_title ? (
                        <>
                          {r.cover_url && <img src={r.cover_url} alt="" />}
                          <div>
                            {playing ? <span className="au-live">▶ ESCUCHANDO AHORA</span> : <small>Lo último que escuchó</small>}
                            <b>{r.track_title}</b>
                            <small>{[r.artist, r.project_title].filter(Boolean).join(" · ")}</small>
                          </div>
                        </>
                      ) : (
                        <small style={{ color: "#6b6b73" }}>—</small>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <p style={{ color: "#6b6b73", fontSize: 12, marginTop: 16 }}>
              "Conectado" = la app abierta en los últimos 2 minutos. La actividad se empezó a registrar el 18/11/2026: los que no entraron desde entonces figuran sin actividad.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
