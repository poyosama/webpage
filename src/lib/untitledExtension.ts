"use client";

/**
 * Comunicación con la extensión "El tablero — Importar desde [untitled]" (carpeta /extension).
 * La extensión inyecta un puente en eltablero.blog; acá se le habla con window.postMessage.
 */
import type { ImportProjectDraft } from "./importFolders";

export type UntitledProjectItem = {
  slug: string;
  title: string;
  username?: string;
  own: boolean;
  collab: boolean;
  cover?: string | null;
};

type Reply = { source: "et-ext"; type: "reply" | "hello"; id?: string; ok?: boolean; data?: unknown; error?: string; version?: string };

let detected: string | null = null;

/** Devuelve la versión de la extensión si está instalada (o null) */
export function detectUntitledExtension(timeoutMs = 900): Promise<string | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (detected) return Promise.resolve(detected);
  return new Promise((resolve) => {
    const onMsg = (ev: MessageEvent) => {
      const d = ev.data as Reply;
      if (ev.source !== window || !d || d.source !== "et-ext" || d.type !== "hello") return;
      detected = d.version || "1";
      window.removeEventListener("message", onMsg);
      resolve(detected);
    };
    window.addEventListener("message", onMsg);
    window.postMessage({ source: "et-page", type: "ping" }, location.origin);
    setTimeout(() => {
      window.removeEventListener("message", onMsg);
      resolve(detected);
    }, timeoutMs);
  });
}

function call<T>(type: string, payload?: unknown, timeoutMs = 120000): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const onMsg = (ev: MessageEvent) => {
      const d = ev.data as Reply;
      if (ev.source !== window || !d || d.source !== "et-ext" || d.type !== "reply" || d.id !== id) return;
      window.removeEventListener("message", onMsg);
      clearTimeout(timer);
      if (d.ok) resolve(d.data as T);
      else reject(new Error(d.error || "error de la extensión"));
    };
    const timer = setTimeout(() => {
      window.removeEventListener("message", onMsg);
      reject(new Error("La extensión no respondió"));
    }, timeoutMs);
    window.addEventListener("message", onMsg);
    window.postMessage({ source: "et-page", type, id, payload }, location.origin);
  });
}

export async function listUntitledProjects(): Promise<UntitledProjectItem[]> {
  const res = await call<{ projects?: UntitledProjectItem[]; error?: string }>("untitled:list", undefined, 60000);
  return res.projects || [];
}

const NOTE_FIX: Record<string, string> = { Db: "C#", Eb: "D#", Gb: "F#", Ab: "G#", Bb: "A#" };
const keyLabel = (k?: { mode?: string; base_note?: string } | null) =>
  k && k.base_note ? (NOTE_FIX[k.base_note] || k.base_note) + (/min/i.test(k.mode || "") ? "m" : "") : null;
const safeName = (s: string) => String(s || "track").replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 120) || "track";

async function downloadAsFile(url: string, name: string): Promise<File> {
  // 1) directo desde la página (si el servidor de [untitled] lo permite); 2) a través de la extensión
  try {
    const r = await fetch(url);
    if (r.ok) {
      const b = await r.blob();
      return new File([b], name, { type: b.type });
    }
  } catch {}
  const res = await call<{ b64: string; type: string }>("untitled:file", { url }, 300000);
  const bin = atob(res.b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new File([u8], name, { type: res.type });
}

/**
 * Trae un proyecto de [untitled] como borrador del importador (audios bajados, portada, BPM, key).
 * Si es de otra cuenta, la extensión lo rechaza.
 */
export async function fetchUntitledProject(
  slug: string,
  wantWav: boolean,
  onTrack?: (i: number, total: number, title: string) => void
): Promise<{ draft: ImportProjectDraft | null; failed: number }> {
  const p = await call<{
    title: string;
    cover?: string | null;
    coverExt?: string;
    tracks: { title: string; bpm?: number | null; key?: { mode?: string; base_note?: string } | null; durationSec?: number | null; uploader?: string | null; url?: string | null; ext?: string }[];
    error?: string;
  }>("untitled:project", { slug, wav: wantWav }, 180000);
  let cover: File | undefined;
  if (p.cover) {
    try {
      cover = await downloadAsFile(p.cover, `cover.${p.coverExt || "jpg"}`);
    } catch {}
  }
  let failed = 0;
  const tracks: ImportProjectDraft["tracks"] = [];
  for (let i = 0; i < p.tracks.length; i++) {
    const t = p.tracks[i];
    onTrack?.(i + 1, p.tracks.length, t.title);
    if (!t.url) {
      failed++;
      continue;
    }
    try {
      const file = await downloadAsFile(t.url, `${String(i + 1).padStart(2, "0")} - ${safeName(t.title)}.${t.ext || "mp3"}`);
      tracks.push({
        file,
        title: t.title,
        order: tracks.length,
        bpm: t.bpm ?? null,
        key: keyLabel(t.key),
        durationSec: t.durationSec ?? null,
        note: t.uploader ? `Subido por @${t.uploader} en [untitled]` : undefined,
      });
    } catch {
      failed++;
    }
  }
  if (!tracks.length) return { draft: null, failed };
  return {
    draft: {
      key: `untitled:${slug}`,
      title: p.title || "Proyecto de [untitled]",
      cover,
      coverPreview: cover ? URL.createObjectURL(cover) : undefined,
      tracks,
      include: true,
    },
    failed,
  };
}
