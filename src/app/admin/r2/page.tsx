"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

/** Admin: copiar los archivos de Supabase Storage a Cloudflare R2 (de a tandas, se puede reanudar) */
export default function MigrarR2() {
  const [log, setLog] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ next: number; total: number } | null>(null);

  const run = async () => {
    setRunning(true);
    setLog([]);
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      setLog(["Iniciá sesión en El tablero (con la cuenta admin) y volvé a esta página."]);
      setRunning(false);
      return;
    }
    let cursor = 0;
    let copied = 0;
    let skipped = 0;
    const errs: string[] = [];
    for (let i = 0; i < 500; i++) {
      const r = await fetch("/api/r2/migrate", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ cursor, batch: 6 }),
      });
      const j = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
      if (!r.ok || j.error) {
        errs.push(j.error || `HTTP ${r.status}`);
        break;
      }
      copied += j.copied;
      skipped += j.skipped;
      (j.errors || []).forEach((e: string) => errs.push(e));
      setProgress({ next: j.next, total: j.total });
      cursor = j.next;
      if (j.done) break;
    }
    setLog([`Copiados: ${copied} · ya estaban: ${skipped} · errores: ${errs.length}`, ...errs.slice(0, 30)]);
    setRunning(false);
  };

  return (
    <main style={{ minHeight: "100dvh", background: "#09090b", color: "#f4f4f5", font: "15px/1.5 -apple-system,system-ui,sans-serif", padding: "40px 16px" }}>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <p style={{ font: "600 11px ui-monospace,monospace", letterSpacing: ".14em", opacity: 0.55 }}>EL TABLERO · ADMIN</p>
        <h1 style={{ margin: "6px 0 10px", fontSize: 28 }}>Migrar archivos a Cloudflare R2</h1>
        <p style={{ color: "#c4c4cc" }}>
          Copia audios, tapas, canvas y avatares de Supabase a R2 con la misma ruta. Se puede tocar de nuevo sin problema: lo que ya
          está en R2 se saltea. Los links de la base se cambian después.
        </p>
        <button
          type="button"
          onClick={run}
          disabled={running}
          style={{ marginTop: 14, border: 0, borderRadius: 999, padding: "12px 18px", fontWeight: 800, background: "#fff", color: "#000", cursor: "pointer", opacity: running ? 0.5 : 1 }}
        >
          {running ? "Copiando…" : "Empezar"}
        </button>
        {progress && (
          <p style={{ marginTop: 14 }}>
            {progress.next} / {progress.total} archivos
          </p>
        )}
        {log.map((l, i) => (
          <p key={i} style={{ margin: "6px 0", fontSize: 13, color: i === 0 ? "#fff" : "#fca5a5" }}>
            {l}
          </p>
        ))}
      </div>
    </main>
  );
}
