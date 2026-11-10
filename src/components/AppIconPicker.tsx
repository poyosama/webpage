"use client";

import { useEffect, useState } from "react";

const KEY = "board_app_icon_v1";
const DEFAULT_ICON = "/apple-touch-icon.png";

function applyIcon(href: string) {
  document.querySelectorAll('link[rel="apple-touch-icon"]').forEach((l) => l.remove());
  const link = document.createElement("link");
  link.rel = "apple-touch-icon";
  link.setAttribute("sizes", "180x180");
  link.href = href;
  document.head.appendChild(link);
}

/** Reaplica el ícono guardado en cada carga (iOS lo lee al "Agregar a inicio"). */
export function AppIconApplier() {
  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved) applyIcon(saved);
    } catch {}
  }, []);
  return null;
}

async function toSquarePng(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const S = 512;
  const c = document.createElement("canvas");
  c.width = S;
  c.height = S;
  const g = c.getContext("2d")!;
  g.fillStyle = "#0a0a0c"; // iOS no admite transparencia: fondo sólido
  g.fillRect(0, 0, S, S);
  const side = Math.min(bmp.width, bmp.height);
  g.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, S, S);
  return c.toDataURL("image/png");
}

export default function AppIconPicker() {
  const [icon, setIcon] = useState<string>(DEFAULT_ICON);
  const [custom, setCustom] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved) {
        setIcon(saved);
        setCustom(true);
      }
    } catch {}
  }, []);

  const onFile = async (f?: File | null) => {
    if (!f) return;
    try {
      const url = await toSquarePng(f);
      localStorage.setItem(KEY, url);
      applyIcon(url);
      setIcon(url);
      setCustom(true);
      setMsg("Listo. Para que el iPhone lo tome: borrá el acceso directo viejo, tocá Compartir → Agregar a inicio.");
    } catch {
      setMsg("No pude leer esa imagen. Probá con un PNG o JPG.");
    }
  };

  const reset = () => {
    try {
      localStorage.removeItem(KEY);
    } catch {}
    applyIcon(DEFAULT_ICON);
    setIcon(DEFAULT_ICON);
    setCustom(false);
    setMsg("Volvió el ícono original.");
  };

  return (
    <div className="modal-field full">
      <span>ÍCONO DEL ACCESO DIRECTO (iPHONE / HOME)</span>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 6 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={icon}
          alt="Ícono"
          style={{ width: 60, height: 60, borderRadius: 14, objectFit: "cover", border: "1px solid var(--line-strong)", flexShrink: 0 }}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
          <label className="apple-btn" style={{ cursor: "pointer", width: "fit-content" }}>
            Elegir imagen
            <input type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
          {custom && (
            <button type="button" className="apple-btn ghost" style={{ width: "fit-content" }} onClick={reset}>
              Restaurar original
            </button>
          )}
        </div>
      </div>
      <small style={{ display: "block", marginTop: 8, color: "var(--ink-secondary)", lineHeight: 1.4 }}>
        {msg || "iOS guarda el ícono al agregar la web a inicio, así que después de elegirlo hay que volver a agregar el acceso directo."}
      </small>
    </div>
  );
}
