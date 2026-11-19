"use client";

import { useCallback, useEffect, useState } from "react";
import { agoEs, supabase } from "@/lib/supabase";

type Row = {
  kind: "error" | "report";
  message: string;
  fingerprint: string;
  veces: number;
  personas: number;
  ultimo: string;
  ejemplo_url: string | null;
  ejemplo_ua: string | null;
  ejemplo_stack: string | null;
  handles: string | null;
};

const device = (ua?: string | null) =>
  !ua ? "" : /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Mac/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : "Otro";

/** Admin: errores que le pasan a la gente en la app + "Reportar un problema" */
export default function AdminErrores() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState("");
  const [days, setDays] = useState(7);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data: s } = await supabase.auth.getSession();
    if (!s.session) return setErr("Iniciá sesión en El tablero con tu cuenta y volvé a esta página.");
    const { data, error } = await supabase.rpc("admin_client_errors", { p_days: days });
    if (error) return setErr(/solo admin/.test(error.message) ? "Esta página es solo para el admin." : error.message);
    setErr("");
    setRows((data || []) as Row[]);
  }, [days]);
  useEffect(() => {
    void load();
    const id = window.setInterval(() => document.visibilityState === "visible" && void load(), 30000);
    return () => window.clearInterval(id);
  }, [load]);

  const reports = (rows || []).filter((r) => r.kind === "report");
  const errors = (rows || []).filter((r) => r.kind === "error");
  const card = (r: Row, i: number) => {
    const key = r.kind + r.fingerprint + i;
    return (
      <div key={key} style={{ background: "#111114", border: "1px solid #1e1e24", borderRadius: 14, padding: "12px 14px", cursor: "pointer" }} onClick={() => setOpen(open === key ? null : key)}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
          <b style={{ fontWeight: 600, wordBreak: "break-word" }}>{r.message}</b>
          <span style={{ flex: "none", color: "#8b8b93", fontSize: 12 }}>{agoEs(r.ultimo)}</span>
        </div>
        <div style={{ color: "#8b8b93", fontSize: 12, marginTop: 4 }}>
          {r.kind === "error" ? `${r.veces} ${r.veces === 1 ? "vez" : "veces"} · ${r.personas} ${r.personas === 1 ? "persona" : "personas"} · ` : ""}
          {r.handles || "sin sesión"} · {device(r.ejemplo_ua)} · {r.ejemplo_url}
        </div>
        {open === key && r.ejemplo_stack && (
          <pre style={{ marginTop: 8, whiteSpace: "pre-wrap", fontSize: 11, color: "#a1a1aa", background: "#0b0b0e", padding: 10, borderRadius: 10, overflowX: "auto" }}>{r.ejemplo_stack}</pre>
        )}
      </div>
    );
  };

  return (
    <main style={{ minHeight: "100dvh", background: "#09090b", color: "#f4f4f5", font: "14px/1.5 -apple-system,system-ui,sans-serif", padding: "32px 16px 60px" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <p style={{ font: "600 11px ui-monospace,monospace", letterSpacing: ".14em", opacity: 0.55, margin: 0 }}>EL TABLERO · ADMIN</p>
        <h1 style={{ margin: "4px 0 6px", fontSize: 28 }}>Errores y reportes</h1>
        <p style={{ color: "#8b8b93", margin: "0 0 16px" }}>
          Lo que le falla a la gente en la app (se registra solo) y lo que mandan desde Cuenta → &quot;Reportar un problema&quot;. Tocá un error para ver el detalle técnico.
        </p>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {[1, 7, 30].map((d) => (
            <button key={d} type="button" onClick={() => setDays(d)} style={{ border: "1px solid #2a2a31", background: days === d ? "#f4f4f5" : "#141418", color: days === d ? "#09090b" : "#d4d4d8", borderRadius: 99, padding: "6px 12px", font: "inherit", cursor: "pointer" }}>
              {d === 1 ? "Hoy" : `${d} días`}
            </button>
          ))}
          <a href="/admin/usuarios" style={{ marginLeft: "auto", color: "#a1a1aa", alignSelf: "center" }}>Usuarios →</a>
        </div>
        {err && <p style={{ background: "#1c1416", border: "1px solid #4c1d24", color: "#fecaca", borderRadius: 12, padding: "12px 14px" }}>{err}</p>}
        {rows === null && !err && <p>Cargando…</p>}
        {rows && (
          <>
            <h2 style={{ fontSize: 16, margin: "8px 0" }}>Reportes ({reports.length})</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 22 }}>
              {reports.length ? reports.map(card) : <p style={{ color: "#6b6b73" }}>Nadie reportó nada.</p>}
            </div>
            <h2 style={{ fontSize: 16, margin: "8px 0" }}>Errores automáticos ({errors.length})</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {errors.length ? errors.map(card) : <p style={{ color: "#6b6b73" }}>Sin errores en este período. 🙌</p>}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
