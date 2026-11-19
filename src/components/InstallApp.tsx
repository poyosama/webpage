"use client";

/**
 * "Instalar aplicación": deja El tablero como app con ícono en el inicio (celu) o en el escritorio (compu).
 * - Android / Chrome / Edge: el navegador nos deja abrir su ventana de instalación (beforeinstallprompt).
 * - iPhone / iPad: Apple no lo permite desde una página → mostramos los pasos (Compartir → Agregar a inicio).
 * Si ya está instalada (se abrió como app), no se muestra nada.
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

// El evento llega UNA vez y temprano: se guarda apenas carga el código
let deferred: BIPEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // nada de cartel automático: lo abre nuestro botón
    deferred = e as BIPEvent;
    listeners.forEach((f) => f());
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    try {
      localStorage.setItem("eltablero_installed", "1");
    } catch {}
    listeners.forEach((f) => f());
  });
}

type Platform = "ios" | "ios-other" | "android" | "desktop";
function platform(): Platform {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
  if (ios) return /CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua) ? "ios-other" : "ios";
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}
export function isInstalledApp(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function useInstallState() {
  const [state, setState] = useState<{ ready: boolean; installed: boolean; canPrompt: boolean; plat: Platform }>({
    ready: false,
    installed: false,
    canPrompt: false,
    plat: "desktop",
  });
  useEffect(() => {
    const update = () => setState({ ready: true, installed: isInstalledApp(), canPrompt: Boolean(deferred), plat: platform() });
    update();
    listeners.add(update);
    return () => {
      listeners.delete(update);
    };
  }, []);
  return state;
}

const ShareIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 3v12M8 7l4-4 4 4" />
    <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
  </svg>
);

function Steps({ plat }: { plat: Platform }) {
  if (plat === "ios" || plat === "ios-other")
    return (
      <ol className="install-steps">
        <li>
          Tocá el botón <b>Compartir</b> <span className="install-ico"><ShareIcon /></span>{" "}
          {plat === "ios" ? "(abajo en el medio, o arriba en iPad)" : "(en la barra del navegador)"}.
        </li>
        <li>
          Bajá y elegí <b>Agregar a inicio</b> (o <b>Agregar a pantalla de inicio</b>).
        </li>
        <li>
          Tocá <b>Agregar</b>. Listo: queda el ícono de El tablero en tu inicio y se abre como app.
        </li>
        {plat === "ios-other" && <li className="install-note">Si no te aparece la opción, abrí www.eltablero.blog en Safari y hacé lo mismo.</li>}
      </ol>
    );
  if (plat === "android")
    return (
      <ol className="install-steps">
        <li>
          Tocá el menú <b>⋮</b> del navegador (arriba a la derecha).
        </li>
        <li>
          Elegí <b>Instalar aplicación</b> (o <b>Agregar a la pantalla principal</b>).
        </li>
        <li>Confirmá. Queda el ícono en tu inicio y se abre como app.</li>
      </ol>
    );
  return (
    <ol className="install-steps">
      <li>
        En Chrome o Edge: tocá el ícono de <b>instalar</b> que aparece a la derecha de la barra de direcciones.
      </li>
      <li>
        Si no está: menú <b>⋮</b> → <b>Guardar y compartir</b> (o <b>Aplicaciones</b>) → <b>Instalar El tablero</b>.
      </li>
      <li>
        En Safari (Mac): menú <b>Archivo</b> → <b>Agregar al Dock</b>.
      </li>
    </ol>
  );
}

/** Botón "Instalar aplicación" + hoja con los pasos cuando el navegador no deja instalar directo */
export function InstallAppButton({ className = "", label = "Instalar aplicación", onDone }: { className?: string; label?: string; onDone?: () => void }) {
  const st = useInstallState();
  const [help, setHelp] = useState(false);
  if (!st.ready || st.installed) return null;
  const go = async () => {
    if (deferred) {
      const ev = deferred;
      await ev.prompt();
      const choice = await ev.userChoice.catch(() => ({ outcome: "dismissed" as const }));
      if (choice.outcome === "accepted") {
        deferred = null;
        onDone?.();
      }
      return;
    }
    setHelp(true);
  };
  return (
    <>
      <button type="button" className={`install-app-btn ${className}`} onClick={() => void go()}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 3v12M7 10l5 5 5-5" />
          <path d="M5 21h14" />
        </svg>
        {label}
      </button>
      {help && createPortal(
        <div className="install-sheet-backdrop" onClick={() => setHelp(false)}>
          <div className="install-sheet" role="dialog" aria-label="Cómo instalar El tablero" onClick={(e) => e.stopPropagation()}>
            <div className="install-sheet-head">
              <img src="/icon-192.png" alt="" />
              <div>
                <b>Instalá El tablero</b>
                <small>Queda como app, con su ícono, y abre al toque.</small>
              </div>
            </div>
            <Steps plat={st.plat} />
            <button type="button" className="install-sheet-ok" onClick={() => setHelp(false)}>
              Entendido
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

/** Tarjeta para Inicio / perfil: "Instalá la app" (se puede cerrar; vuelve a los 14 días) */
export function InstallAppCard({ dismissible = true }: { dismissible?: boolean }) {
  const st = useInstallState();
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    if (!dismissible) return setHidden(false);
    try {
      const t = Number(localStorage.getItem("eltablero_install_dismissed") || 0);
      setHidden(Date.now() - t < 14 * 86400000);
    } catch {
      setHidden(false);
    }
  }, [dismissible]);
  if (!st.ready || st.installed || hidden) return null;
  const isPhone = st.plat !== "desktop";
  return (
    <div className="install-app-card">
      <img src="/icon-192.png" alt="" className="install-app-icon" />
      <div className="install-app-text">
        <b>{isPhone ? "Tené El tablero en tu inicio" : "Instalá El tablero en tu compu"}</b>
        <small>{isPhone ? "Como una app: con su ícono, pantalla completa y abre al toque." : "Como un programa más: con su ícono y en su propia ventana."}</small>
      </div>
      <InstallAppButton onDone={() => setHidden(true)} />
      {dismissible && (
        <button
          type="button"
          className="install-app-close"
          aria-label="Ahora no"
          onClick={() => {
            try {
              localStorage.setItem("eltablero_install_dismissed", String(Date.now()));
            } catch {}
            setHidden(true);
          }}
        >
          ✕
        </button>
      )}
    </div>
  );
}
