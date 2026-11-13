"use client";

import { useEffect, useRef, useState } from "react";
import { checkHandleAvailability, cleanHandleText, type HandleStatus } from "../lib/supabase";
import { sfx } from "../lib/sfx";
import "./onboarding.css";

export type OnboardingResult = {
  name: string;
  handle: string;
  accountType: "artista" | "oyente";
  /** Foto subida por la persona (data URL ya achicada) o undefined si la dejó vacía */
  avatarUrl?: string;
};

/** Lee una imagen y la achica a un cuadrado máx. 512px (JPEG) para no subir fotos gigantes. */
function fileToAvatarDataUrl(file: File, maxDim = 512): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => resolve(null);
    reader.onload = () => {
      const src = typeof reader.result === "string" ? reader.result : null;
      if (!src) return resolve(null);
      const img = new Image();
      img.onerror = () => resolve(null);
      img.onload = () => {
        try {
          const side = Math.min(img.width, img.height);
          const out = Math.min(maxDim, side);
          const canvas = document.createElement("canvas");
          canvas.width = out;
          canvas.height = out;
          const ctx = canvas.getContext("2d");
          if (!ctx) return resolve(src);
          ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, out, out);
          resolve(canvas.toDataURL("image/jpeg", 0.88));
        } catch {
          resolve(src);
        }
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Pantalla de registro de credenciales: se muestra una sola vez, después de entrar con Google
 * y antes de crear el perfil. Nombre, @usuario (con check de disponibilidad) y artista u oyente.
 */
export default function OnboardingScreen({
  userId,
  onSubmit,
  onCancel,
}: {
  userId: string;
  onSubmit: (r: OnboardingResult) => Promise<{ success: boolean; error?: string }>;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [accountType, setAccountType] = useState<"artista" | "oyente">("artista");
  const [status, setStatus] = useState<HandleStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState("");
  const [photoMsg, setPhotoMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const seq = useRef(0);

  // Chequeo en vivo (con debounce) de formato + disponibilidad
  useEffect(() => {
    const clean = cleanHandleText(handle);
    if (!clean) {
      setStatus(null);
      setChecking(false);
      return;
    }
    const mine = ++seq.current;
    setChecking(true);
    const t = setTimeout(async () => {
      const res = await checkHandleAvailability(clean, userId);
      if (mine !== seq.current) return;
      setStatus(res);
      setChecking(false);
    }, 350);
    return () => clearTimeout(t);
  }, [handle, userId]);

  const clean = cleanHandleText(handle);
  const handleOk = !checking && status?.state === "ok" && status.clean === clean;
  const canSubmit = handleOk && name.trim().length > 0 && !saving;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setErrorMsg("");
    const res = await onSubmit({ name: name.trim(), handle: `@${clean}`, accountType, avatarUrl: avatarUrl || undefined });
    if (!res.success) {
      setSaving(false);
      setErrorMsg(res.error || "No se pudo crear tu perfil. Probá de nuevo.");
      // Si el handle se lo ganaron en el medio, se re-chequea
      setStatus(null);
      setHandle((h) => h + "");
      return;
    }
    sfx.drop();
  };

  return (
    <div className="onb-stage">
      <form className="onb-card" onSubmit={submit} noValidate>
        <div className="onb-brand">
          <span className="brand-dot" />
          <span>El tablero.</span>
        </div>

        <span className="mono-tag onb-kicker">ÚLTIMO PASO · TUS CREDENCIALES</span>
        <h1 className="onb-title">Armá tu perfil</h1>
        <p className="onb-sub">Elegí cómo te van a ver en El tablero. Después lo podés cambiar desde tu perfil.</p>

        <div className="onb-photo">
          <label className="onb-avatar" aria-label="Subir foto de perfil">
            {avatarUrl ? <img src={avatarUrl} alt="Tu foto de perfil" /> : <span className="onb-avatar-plus">+</span>}
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                setPhotoMsg("");
                const data = await fileToAvatarDataUrl(file);
                if (data) {
                  sfx.tap();
                  setAvatarUrl(data);
                } else {
                  setPhotoMsg("No pude leer esa imagen. Probá con otra.");
                }
              }}
            />
          </label>
          <div className="onb-photo-info">
            <b>Foto de perfil <em>(opcional)</em></b>
            <small className={photoMsg ? "bad" : ""}>
              {photoMsg || "Si no subís una, queda vacía. No usamos nada de tu cuenta de Google."}
            </small>
            {avatarUrl && (
              <button type="button" className="onb-link" onClick={() => setAvatarUrl("")}>
                Quitar foto
              </button>
            )}
          </div>
        </div>

        <label className="onb-field">
          <span>NOMBRE</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tu nombre o nombre artístico"
            maxLength={40}
            autoComplete="off"
            autoFocus
          />
        </label>

        <label className="onb-field">
          <span>NOMBRE DE USUARIO</span>
          <div className={`onb-handle ${handleOk ? "ok" : status && !checking && status.state !== "ok" ? "bad" : ""}`}>
            <b>@</b>
            <input
              value={handle}
              onChange={(e) => setHandle(cleanHandleText(e.target.value).slice(0, 20))}
              placeholder="tuusuario"
              maxLength={20}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="username"
              inputMode="text"
              aria-describedby="onb-handle-msg"
            />
            <i className="onb-handle-state" aria-hidden>
              {checking ? <em className="onb-spin" /> : handleOk ? "✓" : status && status.state !== "ok" ? "✕" : ""}
            </i>
          </div>
          <small
            id="onb-handle-msg"
            className={`onb-hint ${handleOk ? "ok" : status && !checking && status.state !== "ok" ? "bad" : ""}`}
            aria-live="polite"
          >
            {checking
              ? "Chequeando…"
              : status && status.clean === clean
                ? handleOk
                  ? `@${clean} está disponible`
                  : status.message
                : "Letras, números, punto y guion bajo."}
          </small>
        </label>

        <div className="onb-field">
          <span>¿CÓMO VAS A USAR EL TABLERO?</span>
          <div className="onb-roles" role="radiogroup" aria-label="Tipo de cuenta">
            <button
              type="button"
              role="radio"
              aria-checked={accountType === "artista"}
              className={accountType === "artista" ? "on" : ""}
              onClick={() => {
                sfx.tap();
                setAccountType("artista");
              }}
            >
              <b>Artista / Productor</b>
              <small>Subís tus proyectos, aparecés en el directorio de artistas y compartís tu música.</small>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={accountType === "oyente"}
              className={accountType === "oyente" ? "on" : ""}
              onClick={() => {
                sfx.tap();
                setAccountType("oyente");
              }}
            >
              <b>Oyente</b>
              <small>Escuchás y guardás proyectos. No aparecés en “Artistas en El tablero”.</small>
            </button>
          </div>
        </div>

        {errorMsg && <div className="onb-error">{errorMsg}</div>}

        <button type="submit" className="apple-btn primary onb-submit" disabled={!canSubmit}>
          {saving ? "Creando tu perfil…" : "Entrar a El tablero. →"}
        </button>
        <button type="button" className="onb-cancel" onClick={onCancel} disabled={saving}>
          Salir
        </button>
      </form>
    </div>
  );
}
