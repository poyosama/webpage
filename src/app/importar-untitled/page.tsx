"use client";

import { useEffect, useRef, useState } from "react";

/** Página con el favorito de diagnóstico de [untitled] (paso previo al importador completo) */
export default function ImportarUntitled() {
  const linkRef = useRef<HTMLAnchorElement>(null);
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void fetch("/tools/untitled-diag.js")
      .then((r) => r.text())
      .then((src) => {
        const href = "javascript:" + encodeURIComponent(src);
        setCode(href);
        // React bloquea href="javascript:..." en JSX: se pone a mano
        linkRef.current?.setAttribute("href", href);
      });
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
        <h1>Paso 1: diagnóstico</h1>
        <p>
          [untitled] no tiene forma de exportar los proyectos, así que vamos a armar un botón que corra adentro de
          [untitled] con tu sesión y traiga todo. Para armarlo necesito ver cómo carga [untitled] sus datos. Para eso es este favorito.
        </p>

        <div className="iu-card">
          <h2>En la compu (recomendado)</h2>
          <ol>
            <li>
              Arrastrá este botón a tu barra de favoritos:
              <br />
              <a ref={linkRef} className="iu-bm" href="#" onClick={(e) => e.preventDefault()} draggable>
                ⚡ Diagnóstico El tablero
              </a>
              <br />
              <span className="iu-note">¿No ves la barra de favoritos? Ctrl + Shift + B (en Mac, Cmd + Shift + B).</span>
            </li>
            <li>Abrí <b>untitled.stream</b>, logueado, y entrá a un proyecto tuyo.</li>
            <li>Tocá el favorito <b>⚡ Diagnóstico El tablero</b>. Abajo a la derecha aparece un cartelito.</li>
            <li>
              Con el cartelito abierto: <b>dale play a un track</b>, <b>abrí otro proyecto</b> y <b>volvé a tu biblioteca</b>.
            </li>
            <li>Tocá <b>Listo, copiar</b> y pegá el texto en el chat con Claude.</li>
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
          </ol>
        </div>

        <p className="iu-safe">
          Es solo lectura: no manda nada a ningún lado. Copia una lista de nombres de campos y direcciones de la API para que yo
          entienda cómo están armados los datos. No copia tu contraseña, ni tokens, ni mails, ni archivos. Los textos se recortan.
        </p>
        <p style={{ marginTop: 24 }}>
          <a className="iu-back" href="/">
            ← Volver a El tablero
          </a>
        </p>
      </div>
    </main>
  );
}
