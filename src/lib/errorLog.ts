"use client";

/**
 * Registro automático de errores (tipo Sentry, pero propio): lo que le falla a la gente en el navegador
 * se guarda en la tabla client_errors y se ve en /admin/errores. Sin paquetes ni cuentas externas.
 * - Mismo error: una sola vez por sesión (no inunda). Máximo 25 por sesión.
 */
import { supabase } from "./supabase";

let installed = false;
let sent = 0;
const seen = new Set<string>();
let currentUser: string | null = null;

export function setErrorUser(id: string | null) {
  currentUser = id;
}

// Ruido conocido de navegadores / extensiones que no es culpa de la app
const IGNORE = [/ResizeObserver loop/i, /Script error\.?$/i, /chrome-extension:\/\//i, /AbortError/i, /The play\(\) request was interrupted/i, /NotAllowedError/i, /Load failed$/i];

export async function logClientError(kind: "error" | "report", message: string, stack?: string) {
  if (typeof window === "undefined") return;
  const msg = String(message || "").slice(0, 2000);
  if (!msg || (kind === "error" && IGNORE.some((r) => r.test(msg) || r.test(stack || "")))) return;
  const fingerprint = (msg.replace(/\d+/g, "#") + "|" + (stack || "").split("\n")[1]?.trim().replace(/\?[^)]*/, "")).slice(0, 200);
  if (kind === "error") {
    if (seen.has(fingerprint) || sent >= 25) return;
    seen.add(fingerprint);
    sent++;
  }
  try {
    await supabase.from("client_errors").insert({
      kind,
      message: msg,
      stack: stack ? String(stack).slice(0, 6000) : null,
      url: location.pathname + location.search.slice(0, 200),
      ua: navigator.userAgent.slice(0, 400),
      fingerprint: kind === "error" ? fingerprint : null,
      user_id: currentUser,
    });
  } catch {}
}

export function installErrorLogging() {
  if (installed || typeof window === "undefined" || process.env.NODE_ENV !== "production") return;
  installed = true;
  window.addEventListener("error", (e) => {
    void logClientError("error", e.message || String(e.error), e.error?.stack);
  });
  window.addEventListener("unhandledrejection", (e) => {
    const r = e.reason as { message?: string; stack?: string } | string | undefined;
    void logClientError("error", typeof r === "string" ? r : r?.message || "Promesa rechazada sin manejar", typeof r === "object" ? r?.stack : undefined);
  });
}
