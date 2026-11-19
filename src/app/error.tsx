"use client";

import { useEffect } from "react";
import { logClientError } from "@/lib/errorLog";

/** Si algo explota al dibujar la página: se registra el error y se ofrece reintentar */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    const e = error as { message?: string; stack?: string; digest?: string };
    void logClientError("error", `[pantalla] ${e?.message || String(error)}${e?.digest ? ` (${e.digest})` : ""}`, e?.stack);
  }, [error]);
  return (
    <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", background: "#09090b", color: "#f4f4f5", padding: 24, fontFamily: "system-ui, sans-serif", textAlign: "center" }}>
      <div style={{ maxWidth: 360 }}>
        <h1 style={{ fontSize: 22, margin: "0 0 8px" }}>Algo falló</h1>
        <p style={{ color: "#a1a1aa", margin: "0 0 18px", lineHeight: 1.5 }}>Ya nos llegó el aviso del error. Probá de nuevo; si sigue, recargá la página.</p>
        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          <button type="button" onClick={() => retry()} style={{ border: 0, borderRadius: 999, padding: "10px 18px", background: "#f4f4f5", color: "#09090b", fontWeight: 700 }}>
            Reintentar
          </button>
          <button type="button" onClick={() => location.reload()} style={{ border: "1px solid #3f3f46", borderRadius: 999, padding: "10px 18px", background: "transparent", color: "#f4f4f5", fontWeight: 600 }}>
            Recargar
          </button>
        </div>
      </div>
    </main>
  );
}
