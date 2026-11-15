"use client";

import { useEffect, useRef, useState } from "react";

/** Página con el favorito de diagnóstico de [untitled] (paso previo al importador completo) */
export default function ImportarUntitled() {
  const linkRef = useRef<HTMLAnchorElement>(null);
  const diagRef = useRef<HTMLAnchorElement>(null);
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // React bloquea href="javascript:..." en JSX: se pone a mano
    void fetch("/tools/untitled-import.js")
      .then((r) => r.text())
      .then((src) => {
        const href = "javascript:" + encodeURIComponent(src);
        setCode(href);
        linkRef.current?.setAttribute("href", href);
      });
    void fetch("/tools/untitled-diag.js")
      .then((r) => r.text())
      .then((src) => diagRef.current?.setAttribute("href", "javascript:" + encodeURIComponent(src)));
  }, []);

  return (
    <main className="iu-page">
      <style>{`
        .iu-page{min-height:100dvh;background:#09090b;color:#f4f4f5;font:15px/1.55 -apple-system,system-ui,sans-serif;padding:40px 16px 80px;display:flex;justify-content:center}
        .iu-wrap{width:min(640px,100%)}
        .iu-kicker{font:600 11px ui-monospace,monospace;letter-spacing:.14em;opacity:.55}
        .iu-wrap h1{font-size:clamp(1.7rem,6vw,2.4rem);letter-spacing:-.03em;margin:6px 0 10px;line-height:1.1}
        .iu-wrap p{color:#c4c4cc;margin:0 0 14px}
        .iu-card{border:1px solid rgba(255,255,255,.14);border-radius:18px;padding:18px;margin:18px 0;background:#121216}
        .iu-card h2{font-size:1.05rem;margin:0 0 10px}
        .iu-card ol{margin:0;padding-left:20px;display:grid;gap:8px;color:#d4d4d8}
        .iu-bm{display:inline-flex;align-items:center;gap:8px;padding:12px 18px;border-radius:999px;background:#fff;color:#000;font-weight:800;text-decoration:none;cursor:grab;margin:6px 0 4px;user-select:none}
        .iu-btn{border:1px solid rgba(255,255,255,.25);background:transparent;color:#fff;border-radius:999px;padding:10px 16px;font-weight:600;cursor:pointer;font-size:14px}
        .iu-note{font-size:13px;color:#a1a1aa}
        .iu-safe{border-left:3px solid #22c55e;padding:4px 0 4px 12px;color:#c4c4cc;font-size:14px;margin:16px 0 0}
        a.iu-back{color:#a1a1aa;font-size:14px}
      `}</style>
      <div className="iu-wrap">
        <span className="iu-kicker">EL TABLERO · IMPORTAR DESDE [UNTITLED]</span>
        <h1>Llevá tus proyectos a El tablero</h1>
        <p>
          [untitled] no tiene forma de exportar los proyectos. Este botón corre adentro de [untitled] con tu sesión y trae
          tus proyectos con portada, el orden de los tracks, BPM, key y los audios en un .zip, que después soltás en El tablero.
        </p>

        <div className="iu-card">
          <h2>En la compu (recomendado)</h2>
          <ol>
            <li>
              Arrastrá este botón a tu barra de favoritos:
              <br />
              <a ref={linkRef} className="iu-bm" href="#" onClick={(e) => e.preventDefault()} draggable>
                ⚡ Llevar a El tablero
              </a>
              <br />
              <span className="iu-note">¿No ves la barra de favoritos? Ctrl + Shift + B (en Mac, Cmd + Shift + B).</span>
            </li>
            <li>Abrí <b>untitled.stream/library</b> (tu biblioteca), logueado.</li>
            <li>Tocá el favorito <b>⚡ Llevar a El tablero</b>. A la derecha aparece la lista de tus proyectos.</li>
            <li>
              Elegí cuáles llevar (tildá &quot;WAV originales&quot; si los querés; si no, se traen en MP3, que es mucho más rápido)
              y tocá <b>Bajar para El tablero</b>. Se descarga un <b>.zip</b> (o varios si es mucho). Si el navegador pregunta si
              permitir varias descargas, poné que sí.
            </li>
            <li>
              En El tablero: tu perfil → <b>+</b> → <b>Importar carpetas o .zip</b> → elegí el .zip. Aparecen tus proyectos con portada,
              orden, BPM y key de [untitled]. Revisá y tocá <b>Importar</b>.
            </li>
          </ol>
        </div>

        <div className="iu-card">
          <h2>En el iPhone (si no tenés compu a mano)</h2>
          <ol>
            <li>
              Copiá el código:{" "}
              <button
                type="button"
                className="iu-btn"
                disabled={!code}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(code);
                    setCopied(true);
                  } catch {
                    setCopied(false);
                  }
                }}
              >
                {copied ? "✓ Copiado" : "Copiar código"}
              </button>
            </li>
            <li>En Safari agregá esta página a favoritos (botón compartir → Agregar marcador).</li>
            <li>Abrí Favoritos, mantené apretado ese marcador → Editar, y en la dirección borrá todo y pegá el código.</li>
            <li>Entrá a untitled.stream en Safari y abrí ese favorito. Seguí los pasos 4 y 5 de arriba.</li>
            <li style={{ color: "#a1a1aa" }}>En el iPhone puede andar lento con muchos proyectos: si podés, hacelo en la compu.</li>
          </ol>
        </div>

        <p className="iu-safe">
          Solo se traen <b>tus</b> proyectos (o en los que sos colaborador con permiso de edición). Los de otras cuentas no:
          que los importe su dueño. Tu sesión de [untitled] no sale de tu navegador: el botón baja los archivos como si tocaras
          &quot;descargar&quot; vos y los junta en un .zip en tu compu.
        </p>
        <details style={{ marginTop: 18, color: "#a1a1aa", fontSize: 14 }}>
          <summary style={{ cursor: "pointer" }}>¿No anda? Favorito de diagnóstico</summary>
          <p style={{ marginTop: 10 }}>
            Si [untitled] cambió algo y el botón falla, arrastrá este otro favorito, tocalo en [untitled], dale play a un track,
            abrí otro proyecto, tocá &quot;Listo, copiar&quot; y mandale el texto a quien mantiene El tablero. Es solo lectura y tapa
            tokens y mails.
          </p>
          <a ref={diagRef} className="iu-btn" href="#" onClick={(e) => e.preventDefault()} draggable style={{ display: "inline-block", textDecoration: "none" }}>
            Diagnóstico El tablero
          </a>
        </details>
        <p style={{ marginTop: 24 }}>
          <a className="iu-back" href="/">
            ← Volver a El tablero
          </a>
        </p>
      </div>
    </main>
  );
}
