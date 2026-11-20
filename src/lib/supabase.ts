import { createClient } from "@supabase/supabase-js";
import type { ArtistProfile, Project, Track, ProjectVideoClip } from "./mock";
import { encodeAudioToMp3, shouldTranscodeAudio } from "./mp3Encode";

export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://txhrbfgejcwmmurriccw.supabase.co";

export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "sb_publishable_UvC4vGCFOnN0FGbRAux0nw_wneVnyhC";

// ==================== SESIÓN QUE SOBREVIVE: localStorage + copia en cookies ====================
// En iPhone el localStorage de una web (o de la app de la pantalla de inicio) se puede borrar.
// Guardamos además la sesión en cookies de 400 días (partida en pedazos de <4 KB) y si el
// localStorage aparece vacío, la sesión se recupera de las cookies.
const COOKIE_CHUNK = 3000;
const COOKIE_MAX_AGE = 60 * 60 * 24 * 400;

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp("(?:^|; )" + name.replace(/[.$?*|{}()[\]\\/+^]/g, "\\$&") + "=([^;]*)"));
  return m ? m[1] : null;
}
function writeCookie(name: string, value: string, maxAge: number) {
  if (typeof document === "undefined") return;
  const secure = typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${value}; Max-Age=${maxAge}; Path=/; SameSite=Lax${secure}`;
}
function cookieKey(key: string) {
  return `et_${key.replace(/[^a-zA-Z0-9]/g, "_")}`;
}
function clearCookieChunks(key: string) {
  const base = cookieKey(key);
  for (let i = 0; i < 12; i++) {
    if (readCookie(`${base}_${i}`) === null && i > 0) break;
    writeCookie(`${base}_${i}`, "", 0);
  }
  writeCookie(`${base}_n`, "", 0);
}

const resilientStorage = {
  getItem(key: string): string | null {
    let v: string | null = null;
    try {
      v = localStorage.getItem(key);
    } catch {}
    if (v) return v;
    // localStorage vacío: reconstruir desde las cookies
    const base = cookieKey(key);
    const n = Number(readCookie(`${base}_n`) || 0);
    if (!n) return null;
    let joined = "";
    for (let i = 0; i < n; i++) {
      const part = readCookie(`${base}_${i}`);
      if (part === null) return null;
      joined += part;
    }
    try {
      const restored = decodeURIComponent(joined);
      try {
        localStorage.setItem(key, restored);
      } catch {}
      return restored;
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {}
    if (!/auth-token/.test(key)) return;
    const enc = encodeURIComponent(value);
    const base = cookieKey(key);
    clearCookieChunks(key);
    const parts = Math.ceil(enc.length / COOKIE_CHUNK);
    if (parts > 12) return; // sesión demasiado grande para cookies: queda solo en localStorage
    for (let i = 0; i < parts; i++) writeCookie(`${base}_${i}`, enc.slice(i * COOKIE_CHUNK, (i + 1) * COOKIE_CHUNK), COOKIE_MAX_AGE);
    writeCookie(`${base}_n`, String(parts), COOKIE_MAX_AGE);
  },
  removeItem(key: string) {
    try {
      localStorage.removeItem(key);
    } catch {}
    clearCookieChunks(key);
  },
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: typeof window !== "undefined" ? resilientStorage : undefined,
  },
});

export const isSupabaseConfigured = () => Boolean(SUPABASE_ANON_KEY);

// ==================== IDs: cualquier id local se mapea a un UUID estable ====================
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function hash32(str: string, seed: number): number {
  let h = (0x811c9dc5 ^ seed) >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return h >>> 0;
}

/** Devuelve el id tal cual si ya es UUID; si no, genera un UUID determinístico (mismo input -> mismo UUID). */
export function toDbId(id: string): string {
  if (UUID_RE.test(id)) return id.toLowerCase();
  const hex = [0x1234, 0x5678, 0x9abc, 0xdef0]
    .map((seed) => hash32(id, seed).toString(16).padStart(8, "0"))
    .join("");
  const variant = "89ab"[parseInt(hex[16], 16) % 4];
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export const isTransientUrl = (url?: string | null): boolean =>
  !!url && url.startsWith("blob:");

const cleanUrl = (url?: string | null): string | undefined =>
  url && !url.startsWith("blob:") ? url : undefined;

const audioMemCache = new Map<string, string>();
/** Columnas enteras de la base (bpm, duration_sec, version, audio_freq, order_index): un decimal hace fallar TODO el guardado */
const int = (v: unknown, fallback: number): number => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : fallback;
};
// Tracks que ESTA pestaña sabe que están en la nube, por proyecto (de la última carga o guardado).
// Al guardar solo se borran los que estaban acá y ya no están: una pestaña vieja que nunca vio
// los tracks nuevos no puede borrarlos (antes borraba todo lo que no conocía).
const knownCloudTrackIds = new Map<string, Set<string>>();

// ==================== INDEXEDDB CACHE LOCAL ULTRA-RÁPIDO (0 RED EN F5) ====================
const IDB_NAME = "el_tablero_fast_cache_v1";
const IDB_STORE = "kv";

function openFastIdb(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined" || !("indexedDB" in window)) return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function fastCacheGet<T = unknown>(key: string): Promise<T | null> {
  const db = await openFastIdb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function fastCacheSet(key: string, value: unknown): Promise<void> {
  const db = await openFastIdb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export function compressImageBlobToDataUrl(blob: Blob, maxDim = 720, quality = 0.85): Promise<string | null> {
  if (typeof document === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      try {
        let w = img.naturalWidth || img.width;
        let h = img.naturalHeight || img.height;
        if (w > maxDim || h > maxDim) {
          const ratio = Math.min(maxDim / w, maxDim / h);
          w = Math.max(1, Math.round(w * ratio));
          h = Math.max(1, Math.round(h * ratio));
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          URL.revokeObjectURL(url);
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        const out = canvas.toDataURL("image/webp", quality);
        URL.revokeObjectURL(url);
        resolve(out);
      } catch {
        URL.revokeObjectURL(url);
        resolve(null);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

async function blobToDataUrl(blob: Blob): Promise<string | null> {
  if (
    blob.type.startsWith("image/") &&
    !blob.type.includes("gif") &&
    !blob.type.includes("svg")
  ) {
    const compressed = await compressImageBlobToDataUrl(blob, 720, 0.85);
    if (compressed) return compressed;
  }
  return new Promise((resolve) => {
    try {
      const reader = new FileReader();
      reader.onloadend = () =>
        resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    } catch {
      resolve(null);
    }
  });
}

// ==================== CLOUDFLARE R2 (archivos nuevos) ====================
// Si están las variables de R2 en Vercel, los archivos se suben a R2 (sin costo de tráfico al escuchar).
// El servidor firma la subida (/api/r2/sign-upload); si algo falla, se cae a Supabase Storage.
const R2_PUBLIC = (process.env.NEXT_PUBLIC_R2_PUBLIC_URL || "").replace(/\/+$/, "");
async function uploadToR2(filename: string, file: File | Blob, folder: string): Promise<string | null> {
  if (!R2_PUBLIC || typeof window === "undefined") return null;
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return null;
    // Extensión real del archivo; si no tiene (ej. "blob"), se saca del tipo (el servidor solo acepta audio/imagen/video)
    let ext = (filename.includes(".") ? filename.split(".").pop() || "" : "").toLowerCase();
    if (!/^(mp3|wav|m4a|aac|flac|ogg|opus|aif|aiff|jpg|jpeg|png|webp|gif|avif|heic|mp4|mov|webm|m4v)$/.test(ext)) {
      const sub = (file.type.split("/")[1] || "").replace("mpeg", "mp3").replace("x-wav", "wav").replace("quicktime", "mov").replace("jpeg", "jpg");
      ext = /^(mp3|wav|m4a|aac|flac|ogg|webm|jpg|png|webp|gif|avif|mp4|mov)$/.test(sub)
        ? sub
        : folder.startsWith("tracks") || folder.startsWith("originals") ? "mp3" : folder.startsWith("videos") ? "mp4" : "jpg";
    }
    const sign = await fetch("/api/r2/sign-upload", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ folder: folder.split("/")[0], ext }),
    });
    if (!sign.ok) return null;
    const { uploadUrl, publicUrl } = (await sign.json()) as { uploadUrl: string; publicUrl: string };
    const put = await fetch(uploadUrl, {
      method: "PUT",
      body: file,
      headers: { "content-type": file.type || (folder === "tracks" ? "audio/mpeg" : "application/octet-stream") },
    });
    return put.ok ? publicUrl : null;
  } catch (err) {
    console.warn("R2 upload falló, uso Supabase:", err);
    return null;
  }
}

// ==================== STORAGE: SUBIR AUDIO / TAPAS / VIDEOS AL BUCKET ====================
async function uploadToStorageWithRetry(
  filename: string,
  file: File | Blob,
  folder: string,
  maxRetries = 3,
  timeoutOverrideMs?: number
): Promise<string | null> {
  const r2 = await uploadToR2(filename, file, folder);
  if (r2) return r2;
  // Audio/video: el tiempo depende del tamaño (con mala señal 45 s fijos cortaban los WAV a la mitad)
  const heavy = folder === "tracks" || folder === "videos" || folder === "originals";
  const byteBudget = Math.ceil((file.size || 0) / (60 * 1024)) * 1000; // ~60 KB/s mínimo
  const timeoutMs = timeoutOverrideMs ?? (heavy ? Math.max(45000, Math.min(15 * 60000, byteBudget)) : 18000);
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const uploadPromise = supabase.storage
        .from("el-tablero-media")
        .upload(filename, file, {
          cacheControl: "31536000",
          upsert: true,
          contentType: file.type || (folder === "tracks" ? "audio/mpeg" : undefined),
        });

      const timeoutPromise = new Promise<{ data: null; error: Error }>((resolve) =>
        setTimeout(
          () => resolve({ data: null, error: new Error(`Storage upload timeout (${timeoutMs}ms)`) }),
          timeoutMs
        )
      );

      const { data, error } = await Promise.race([uploadPromise, timeoutPromise]);
      if (!error && data) {
        const { data: publicUrlData } = supabase.storage
          .from("el-tablero-media")
          .getPublicUrl(data.path);
        if (publicUrlData?.publicUrl) return publicUrlData.publicUrl;
      }
      if (error) {
        console.warn(`Storage upload attempt ${attempt}/${maxRetries} failed:`, error.message);
      }
    } catch (err: any) {
      console.warn(`Storage upload attempt ${attempt}/${maxRetries} err:`, err?.message || err);
    }
    if (attempt < maxRetries) {
      await new Promise((r) => setTimeout(r, attempt * 1000));
    }
  }
  return null;
}

// ==================== AUDIO: MP3 PARA ESCUCHAR + ORIGINAL PARA DESCARGAR ====================
const KEEP_ORIGINALS = false;
// Original (WAV/AIFF/FLAC) que se está subiendo por detrás, por URL del MP3 que suena
const pendingOriginals = new Map<string, Promise<string | null>>();

async function attachOriginalWhenReady(streamUrl: string, original: File | Blob) {
  const ext = ((original as File).name || "").split(".").pop()?.toLowerCase() || "wav";
  const name = `originals/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const job = uploadToStorageWithRetry(name, original, "originals", 3);
  pendingOriginals.set(streamUrl, job);
  const originalUrl = await job;
  if (!originalUrl) return;
  // La fila del track puede guardarse después que termine esto: reintentar unos minutos
  for (let i = 0; i < 30; i++) {
    const { data, error } = await supabase
      .from("tracks")
      .update({ original_audio_url: originalUrl })
      .eq("audio_url", streamUrl)
      .select("id");
    if (error) return; // columna todavía sin crear (falta correr la migración)
    if (data && data.length) {
      pendingOriginals.delete(streamUrl);
      return;
    }
    await new Promise((r) => setTimeout(r, 10000));
  }
}

/** ¿La URL guardada es un audio sin comprimir (WAV/AIFF/FLAC)? */
export function isLosslessAudioUrl(url?: string | null): boolean {
  if (!url || !/^https?:/i.test(url)) return false;
  try {
    return /\.(wav|wave|aif|aiff|aifc|flac|alac|caf)$/i.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

/**
 * Pasa un track ya subido en WAV/AIFF/FLAC a MP3 para escuchar, dejando el original para descargar.
 * Devuelve la URL nueva, "no-column" si falta la migración, o null si falló.
 */
export async function optimizeExistingTrackAudio(trackId: string, oldUrl: string): Promise<string | "no-column" | null> {
  try {
    const res = await fetch(oldUrl);
    if (!res.ok) return null;
    const blob = await res.blob();
    const name = new URL(oldUrl).pathname.split("/").pop() || "track.wav";
    const mp3 = await encodeAudioToMp3(new File([blob], name, { type: blob.type }));
    if (!mp3) return null;
    const mp3Name = `tracks/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp3`;
    const streamUrl = await uploadToStorageWithRetry(mp3Name, mp3, "tracks", 3);
    if (!streamUrl) return null;
    const { data, error } = await supabase
      .from("tracks")
      .update({ audio_url: streamUrl })
      .eq("id", toDbId(trackId))
      .eq("audio_url", oldUrl)
      .select("id");
    if (error || !data || !data.length) return null;
    // El WAV ya no se usa: se borra del almacenamiento para liberar espacio (solo si lo subiste vos)
    if (!KEEP_ORIGINALS) {
      const m = oldUrl.match(/\/storage\/v1\/object\/public\/el-tablero-media\/(.+)$/);
      if (m) void supabase.storage.from("el-tablero-media").remove([decodeURIComponent(m[1].split("?")[0])]).then(() => {});
    }
    audioMemCache.set(toDbId(trackId), streamUrl);
    void fastCacheSet(`audio3:${toDbId(trackId)}`, streamUrl);
    return streamUrl;
  } catch (err) {
    console.warn("optimizeExistingTrackAudio:", err);
    return null;
  }
}

/** URL del archivo original para descargar (si existe); si no, la del audio que suena */
export async function resolveOriginalAudioUrl(trackId: string, streamUrl?: string): Promise<string | undefined> {
  if (streamUrl && pendingOriginals.has(streamUrl)) {
    const u = await pendingOriginals.get(streamUrl);
    if (u) return u;
  }
  try {
    const { data, error } = await supabase
      .from("tracks")
      .select("original_audio_url")
      .eq("id", toDbId(trackId))
      .maybeSingle();
    if (!error && data?.original_audio_url) return data.original_audio_url as string;
  } catch {}
  return streamUrl;
}

export async function uploadMediaToSupabase(
  file: File | Blob,
  folder: "covers" | "tracks" | "videos" | "avatars" = "covers"
): Promise<string | null> {
  try {
    // Audio pesado: se sube un MP3 de 192 kbps para escuchar (rápido con mala señal)
    // y el original por detrás para descargar
    if (folder === "tracks" && shouldTranscodeAudio(file as File)) {
      const mp3 = await encodeAudioToMp3(file as File);
      if (mp3) {
        const mp3Name = `tracks/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp3`;
        const streamUrl = await uploadToStorageWithRetry(mp3Name, mp3, "tracks", 3);
        if (streamUrl) {
          // Por ahora NO se guarda el WAV original (el plan gratis de Supabase se llena): solo el MP3.
          // Para volver a guardarlos, poner KEEP_ORIGINALS = true (ideal con almacenamiento sin costo de tráfico, ej. R2).
          if (KEEP_ORIGINALS) void attachOriginalWhenReady(streamUrl, file);
          return streamUrl;
        }
      }
    }

    const rawName = (file as File).name || "";
    const mimeExt = (file.type || "").split("/")[1]?.split(";")[0]?.replace("mpeg", "mp3");
    const ext = (rawName.includes(".") ? rawName.split(".").pop() : mimeExt) || "bin";
    const filename = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext.toLowerCase()}`;

    // 1. Intento robusto en Storage con reintentos
    const storageUrl = await uploadToStorageWithRetry(filename, file, folder, 3);
    if (storageUrl) {
      return storageUrl;
    }

    // 2. Si Storage falla y es imagen, compresión y fallback a Data URL WebP compacta
    if (folder === "covers" || folder === "avatars" || file.type.startsWith("image/")) {
      return await blobToDataUrl(file);
    }

    // 3. Para archivos pesados de audio o video donde el bucket no respondió:
    // Evitamos meter 30MB en texto Base64 dentro de Postgres para no colapsar la conexión
    if (file.size > 4 * 1024 * 1024 && (folder === "tracks" || folder === "videos")) {
      console.warn("Audio/video pesado sin bucket disponible, se preserva en cache local:", folder, file.size);
      return null;
    }

    // Fallback a Data URL para audios cortos (<4MB) si Storage no está disponible
    return await blobToDataUrl(file);
  } catch (err) {
    console.warn("Error en uploadMediaToSupabase:", err);
    return null;
  }
}

// Subidas compartidas entre corridas de la sincronización: el mismo archivo (blob:) se sube UNA sola vez,
// aunque la sincronización se dispare de nuevo mientras sube.
const persistedUploads = new Map<string, Promise<string | null>>();

/** Si la URL es blob: (temporal, se pierde con F5) la sube al bucket o la convierte a Data URL persistente. */
export async function ensurePersistentUrl(
  url: string | undefined | null,
  folder: "covers" | "tracks" | "videos" | "avatars",
  cache?: Map<string, string | null>
): Promise<string | null> {
  if (!url) return null;
  if (!isTransientUrl(url)) return url;
  if (cache?.has(url)) return cache.get(url) ?? null;
  const inflight = persistedUploads.get(url);
  if (inflight) {
    const r = await inflight;
    cache?.set(url, r);
    return r;
  }
  const job = uploadTransient(url, folder);
  persistedUploads.set(url, job);
  bumpUploads(1);
  let result: string | null = null;
  try {
    result = await job;
  } finally {
    bumpUploads(-1);
  }
  if (!result) persistedUploads.delete(url); // si falló, se puede reintentar
  cache?.set(url, result);
  return result;
}

async function uploadTransient(url: string, folder: "covers" | "tracks" | "videos" | "avatars"): Promise<string | null> {
  let result: string | null = null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 35000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    const blob = await res.blob();

    // Guardar copia local en IndexedDB si es audio para que nunca se pierda en recargas
    if (folder === "tracks") {
      try {
        const buf = await blob.arrayBuffer();
        if (buf && buf.byteLength > 0) {
          void fastCacheSet(`blob_audio:${url}`, buf);
        }
      } catch {
        // ignore
      }
    }

    result = await uploadMediaToSupabase(blob, folder);
  } catch (err) {
    console.warn("No se pudo leer el archivo temporal:", err);
  }
  return result;
}

// ==================== DB: FETCH ULTRA-RÁPIDO DE PROYECTOS (SIN BLOQUEAR EN BLOBS DE AUDIO) ====================
const TRACK_META_COLS =
  "id, project_id, title, artist, feat, prod, bpm, musical_key, duration, duration_sec, version, note, glyph, c1, c2, accent, audio_freq, cover_url, order_index";


/** Fila de `projects` (con `tracks` y `project_videos` anidados) → Project */
export function mapProjectRow(row: any, idx = 0): Project {
  try {
    knownCloudTrackIds.set(toDbId(String(row.id)), new Set((row.tracks || []).map((t: any) => toDbId(String(t.id)))));
  } catch {}
  const tracks = [...(row.tracks || [])]
    .sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0))
    .map((t: any): Track => {
      const cachedAudio = audioMemCache.get(toDbId(t.id)) || cleanUrl(t.audio_url);
      return {
        id: t.id,
        title: t.title,
        artist: t.artist,
        feat: t.feat || undefined,
        prod: t.prod || undefined,
        bpm: t.bpm || 140,
        key: t.musical_key || "F#m",
        duration: t.duration || "2:30",
        durationSec: t.duration_sec || 150,
        version: t.version || 1,
        note: t.note || undefined,
        glyph: t.glyph || "01",
        c1: t.c1 || "#ffffff",
        c2: t.c2 || "#888888",
        accent: t.accent || "#ffffff",
        audioFreq: t.audio_freq || 80,
        customAudioUrl: cachedAudio,
        coverUrl: cleanUrl(t.cover_url),
      };
    });
  const isPublic = row.is_public === true;
  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    artistId: row.user_id || String(row.artist || "user").toLowerCase().replace(/\s+/g, ""),
    type: row.type || "Mixtape",
    year: row.year || "2026",
    status: row.status || "Publicado",
    visibility: row.visibility === "friends" || row.visibility === "public" || row.visibility === "private" ? row.visibility : isPublic ? "public" : "private",
    createdAt: row.created_at,
    dateLabel: row.date_label || `${row.year || "2026"} · ${row.zone || "Mendoza"}`,
    zone: row.zone || "Mendoza",
    genre: row.genre || "",
    description: row.description || "",
    coverUrl: cleanUrl(row.cover_url),
    c1: row.c1 || "#111111",
    c2: row.c2 || "#222222",
    accent: row.accent || "#ffffff",
    tagGlyph: row.tag_glyph || "◈",
    plays: row.plays || "0",
    blockPos: [idx * 3.2, 0, 0],
    blockSize: [2.2, 2.2, 2.2],
    tracks,
    videos: (row.project_videos || [])
      .filter((v: any) => cleanUrl(v.url))
      .map((v: any): ProjectVideoClip => {
        const isImg =
          v.media_type === "image" ||
          /^data:image\//i.test(v.url || "") ||
          /\.(gif|png|jpe?g|webp|avif)(\?|$)/i.test(v.url || "") ||
          /\.(gif|png|jpe?g|webp|avif)$/i.test(v.label || "");
        return {
          id: v.id,
          label: v.label || "canvas_loop.mp4",
          kind: "uploaded",
          stylePreset: "vhs-grain",
          url: v.url,
          mediaType: isImg ? "image" : "video",
          c1: "#111111",
          c2: "#222222",
        };
      }),
  };
}

export async function fetchUserProjectsFromSupabase(userId?: string): Promise<Project[] | null> {
  try {
    let query = supabase
      .from("projects")
      .select(`*, tracks:tracks(${TRACK_META_COLS}), project_videos:project_videos(*)`);

    if (userId) {
      query = query.eq("user_id", userId);
    }

    const { data, error } = await query.order("created_at", { ascending: false });

    if (error || !data) {
      console.warn("Error al traer proyectos de Supabase:", error?.message);
      return null;
    }

    return data.map((row: any, idx: number): Project => mapProjectRow(row, idx));
  } catch (err) {
    console.warn("Fallo fetchUserProjectsFromSupabase:", err);
    return null;
  }
}

/** Obtiene el audio_url de un track (primero desde memoria o IndexedDB local en 1ms, luego desde Supabase). */
export async function resolveTrackAudioUrl(trackId: string): Promise<string | undefined> {
  const dbId = toDbId(trackId);
  const mem = audioMemCache.get(dbId);
  if (mem) return mem;

  const disk = await fastCacheGet<string>(`audio3:${dbId}`);
  if (disk) {
    audioMemCache.set(dbId, disk);
    return disk;
  }

  try {
    const { data } = await supabase
      .from("tracks")
      .select("id, audio_url")
      .eq("id", dbId)
      .maybeSingle();
    const url = cleanUrl(data?.audio_url);
    if (url) {
      audioMemCache.set(dbId, url);
      void fastCacheSet(`audio3:${dbId}`, url);
      return url;
    }
  } catch {
    // ignore
  }
  return undefined;
}

/** Hidrata en segundo plano los audio_url de los proyectos sin bloquear la pantalla inicial. */
export async function hydrateProjectsAudioInBackground(
  projects: Project[],
  onAudioResolved: (trackId: string, audioUrl: string) => void
): Promise<void> {
  for (const p of projects) {
    for (const t of p.tracks) {
      if (t.customAudioUrl) {
        const dbId = toDbId(t.id);
        audioMemCache.set(dbId, t.customAudioUrl);
        continue;
      }
      const url = await resolveTrackAudioUrl(t.id);
      if (url) {
        onAudioResolved(t.id, url);
      }
    }
  }
}

// ==================== DB: FETCH DE PERFILES DE LA COMUNIDAD ====================
export async function purgeJaimeMartinezProfile(): Promise<void> {
  try {
    await supabase
      .from("profiles")
      .delete()
      .or("handle.ilike.%jm2100553%,name.ilike.%jaime martinez%");
  } catch {
    // ignore
  }
}

export async function fetchCommunityProfilesFromSupabase(): Promise<ArtistProfile[]> {
  try {
    const cols = "id, name, handle, role, zone, crew, bio, color, stickers, avatar_url, created_at";
    // El servidor a veces falla un instante (ej. mientras recarga su esquema): se reintenta antes de rendirse
    let { data, error }: { data: any[] | null; error: any } = { data: null, error: null };
    for (let attempt = 0; attempt < 3; attempt++) {
      ({ data, error } = await supabase.from("profiles").select(`${cols}, account_type`).order("created_at", { ascending: false }));
      if (!error || /account_type/i.test(error.message || "")) break;
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }
    if (error && /account_type/i.test(error.message || "")) {
      // Servidor sin la migración de tipo de cuenta
      ({ data, error } = await supabase.from("profiles").select(cols).order("created_at", { ascending: false }));
    }

    if (error || !data) {
      return [];
    }

    const filteredRows = data.filter((row: any) => {
      const h = (row.handle || "").toLowerCase();
      const n = (row.name || "").toLowerCase();
      if (h.includes("jm2100553") || n.includes("jaime martinez")) {
        void supabase.from("profiles").delete().eq("id", row.id).then(() => {});
        return false;
      }
      return true;
    });

    return filteredRows.map((row: any): ArtistProfile => ({
      id: row.id,
      name: row.name,
      handle: row.handle?.startsWith("@") ? row.handle : `@${row.handle || "artista"}`,
      role: row.role || "Artista",
      accountType: row.account_type === "oyente" ? "oyente" : "artista",
      category: "rapero",
      zone: row.zone || "",
      crew: row.crew || "",
      bio: row.bio || "",
      color: row.color || "#111111",
      avatarUrl: row.avatar_url || undefined,
      stickers: row.stickers || [],
      createdAt: row.created_at,
      tracksCount: 0,
      projectsCount: 0,
      friendsCount: 0,
      followersCount: 0,
      playsTotal: "0",
    }));
  } catch (err) {
    console.warn("Fallo fetchCommunityProfilesFromSupabase:", err);
    return [];
  }
}

// ==================== HANDLE: FORMATO Y DISPONIBILIDAD ====================
export function cleanHandleText(raw: string): string {
  return raw.replace(/^@+/, "").toLowerCase().trim().replace(/[^a-z0-9._]/g, "");
}

export type HandleStatus = { state: "ok" | "taken" | "invalid" | "error"; clean: string; message: string };

/** Formato (3–20 caracteres: letras, números, . y _) + disponibilidad real en la base (case-insensitive). */
export async function checkHandleAvailability(raw: string, myId?: string): Promise<HandleStatus> {
  const clean = cleanHandleText(raw);
  if (clean.length < 3) return { state: "invalid", clean, message: "Mínimo 3 caracteres." };
  if (clean.length > 20) return { state: "invalid", clean, message: "Máximo 20 caracteres." };
  if (/^[._]|[._]$/.test(clean)) return { state: "invalid", clean, message: "No puede empezar ni terminar con . o _" };
  try {
    const { data, error } = await supabase.rpc("handle_available", { p_handle: clean });
    if (!error && typeof data === "boolean") {
      return data
        ? { state: "ok", clean, message: "Disponible" }
        : { state: "taken", clean, message: "Ya lo usa otra persona." };
    }
    // Sin la migración: consulta directa
    let q = supabase.from("profiles").select("id").ilike("handle", `@${clean.replace(/[%_]/g, "\\$&")}`);
    if (myId) q = q.neq("id", myId);
    const { data: rows, error: e2 } = await q.limit(1);
    if (e2) return { state: "error", clean, message: "No pude chequear ahora. Probá de nuevo." };
    return rows && rows.length
      ? { state: "taken", clean, message: "Ya lo usa otra persona." }
      : { state: "ok", clean, message: "Disponible" };
  } catch {
    return { state: "error", clean, message: "No pude chequear ahora. Probá de nuevo." };
  }
}

// ==================== DB: GUARDAR / ACTUALIZAR PERFIL Y VALIDAR HANDLE ÚNICO ====================
export async function saveUserProfileToSupabase(profile: Partial<ArtistProfile> & { id: string; handle: string; name: string }): Promise<{ success: boolean; error?: string; cleanHandle?: string }> {
  try {
    const rawHandle = profile.handle.replace(/^@+/, "").toLowerCase().trim().replace(/[^a-z0-9._]/g, "");
    if (!rawHandle) {
      return { success: false, error: "El handle no puede estar vacío." };
    }
    const cleanHandle = `@${rawHandle}`;

    // Validar si el handle ya pertenece a otro usuario registrado
    const { data: conflict } = await supabase
      .from("profiles")
      .select("id, handle")
      .eq("handle", cleanHandle)
      .neq("id", profile.id)
      .maybeSingle();

    if (conflict) {
      return {
        success: false,
        error: `El usuario ${cleanHandle} ya está en uso por otro artista en El tablero. Por favor elegí otro.`,
      };
    }

    let avatarUrl = await ensurePersistentUrl(profile.avatarUrl, "avatars");
    // Foto elegida del dispositivo (llega como texto "data:"): se sube a R2. Nunca se guarda una foto gigante
    // como texto en la base (una de 14 MB hacía que la lista de artistas no cargara en los celus).
    if (avatarUrl && avatarUrl.startsWith("data:")) {
      try {
        const blob = await (await fetch(avatarUrl)).blob();
        const uploaded = await uploadMediaToSupabase(blob, "avatars");
        if (uploaded) avatarUrl = uploaded;
        else if (avatarUrl.length > 120000) avatarUrl = (await compressImageBlobToDataUrl(blob, 400, 0.82)) || null;
      } catch {
        if (avatarUrl && avatarUrl.length > 120000) avatarUrl = null;
      }
    }

    const row: Record<string, unknown> = {
      id: profile.id,
      handle: cleanHandle,
      name: profile.name.trim() || cleanHandle,
      role: profile.role || "Artista",
      zone: profile.zone || "",
      crew: profile.crew || "",
      bio: profile.bio || "",
      color: profile.color || "#111111",
      stickers: profile.stickers || [],
      avatar_url: avatarUrl,
      updated_at: new Date().toISOString(),
    };
    if (profile.accountType) row.account_type = profile.accountType;

    let { error: upsertErr } = await supabase.from("profiles").upsert(row, { onConflict: "id" });
    // Servidor sin la migración de tipo de cuenta: se guarda igual sin esa columna
    if (upsertErr && /account_type/i.test(upsertErr.message || "")) {
      delete row.account_type;
      ({ error: upsertErr } = await supabase.from("profiles").upsert(row, { onConflict: "id" }));
    }

    if (upsertErr) {
      return { success: false, error: `Error en base de datos: ${upsertErr.message}` };
    }

    return { success: true, cleanHandle };
  } catch (err: any) {
    return { success: false, error: err?.message || "Error al conectar con los servidores de El tablero." };
  }
}

// ==================== DB: GUARDAR O ACTUALIZAR PROYECTO ENTERO ====================
/**
 * Sube a Storage todo archivo temporal (blob:/data:), guarda proyecto + tracks + canvas y
 * devuelve una copia del proyecto con URLs permanentes (o null si falló).
 */
async function saveProjectSkeleton(project: Project, userId?: string): Promise<void> {
  try {
    const dbProjectId = toDbId(project.id);
    let uid: string | null = userId && UUID_RE.test(userId) ? userId : project.artistId && UUID_RE.test(project.artistId) ? project.artistId : null;
    if (!uid) {
      try {
        const { data } = await supabase.auth.getSession();
        uid = data.session?.user?.id || null;
      } catch {}
    }
    if (!uid) return;
    const row: Record<string, unknown> = {
      id: dbProjectId,
      title: project.title,
      artist: project.artist,
      type: project.type,
      year: project.year,
      status: project.status,
      zone: project.zone,
      description: project.description || "",
      user_id: uid,
      is_public: project.visibility === "public",
      visibility: project.visibility || "private",
      updated_at: new Date().toISOString(),
    };
    if (!isTransientUrl(project.coverUrl)) row.cover_url = cleanUrl(project.coverUrl) || null;
    let { error } = await supabase.from("projects").upsert(row, { onConflict: "id" });
    if (error && /visibility/i.test(error.message)) {
      delete row.visibility;
      ({ error } = await supabase.from("projects").upsert(row, { onConflict: "id" }));
    }
    if (error) return;
    const meta = (t: Track, idx: number) => ({
      id: toDbId(t.id),
      project_id: dbProjectId,
      title: t.title,
      artist: t.artist,
      feat: t.feat || null,
      prod: t.prod || null,
      bpm: int(t.bpm, 140),
      musical_key: t.key,
      duration: t.duration,
      duration_sec: int(t.durationSec, 150),
      version: int(t.version, 1),
      note: t.note || null,
      glyph: t.glyph,
      c1: t.c1 || "#ffffff",
      c2: t.c2 || "#888888",
      accent: t.accent || "#ffffff",
      audio_freq: int(t.audioFreq, 80),
      order_index: idx,
    });
    const list = project.tracks || [];
    // Los que ya tienen audio guardado se mandan con su audio; los pendientes, sin tocar audio/tapa
    const ready = list.map((t, i) => ({ t, i })).filter(({ t }) => !isTransientUrl(t.customAudioUrl));
    const pending = list.map((t, i) => ({ t, i })).filter(({ t }) => isTransientUrl(t.customAudioUrl));
    if (ready.length) {
      await supabase.from("tracks").upsert(
        ready.map(({ t, i }) => ({ ...meta(t, i), audio_url: cleanUrl(t.customAudioUrl) || null })),
        { onConflict: "id" }
      );
    }
    if (pending.length) {
      await supabase.from("tracks").upsert(pending.map(({ t, i }) => meta(t, i)), { onConflict: "id" });
    }
  } catch (err) {
    console.warn("saveProjectSkeleton:", err);
  }
}

// ==================== SUBIDAS EN CURSO (para avisar antes de cerrar/recargar) ====================
let uploadsInFlight = 0;
const uploadListeners = new Set<(n: number) => void>();
export function pendingUploadsCount() {
  return uploadsInFlight;
}
export function onPendingUploadsChange(fn: (n: number) => void): () => void {
  uploadListeners.add(fn);
  return () => uploadListeners.delete(fn);
}
function bumpUploads(delta: number) {
  uploadsInFlight = Math.max(0, uploadsInFlight + delta);
  uploadListeners.forEach((fn) => fn(uploadsInFlight));
}

export async function saveProjectToSupabase(project: Project, userId?: string): Promise<Project | null> {
  try {
    const cache = new Map<string, string | null>();
    const dbProjectId = toDbId(project.id);

    // Si hay archivos por subir (audios recién importados, WAV que hay que convertir…), PRIMERO se guardan
    // el proyecto y los tracks sin esos archivos: si la persona recarga a mitad de la subida, los tracks
    // no desaparecen (antes se guardaban recién al final de todo).
    if (hasTransientMedia(project)) {
      await saveProjectSkeleton(project, userId);
    }

    // Todo en paralelo: tapa, canvas y hasta 3 tracks a la vez (antes era de a uno)
    const saveTrack = async (t: Track): Promise<Track> => {
      const dbTrackId = toDbId(t.id);
      let audio = await ensurePersistentUrl(t.customAudioUrl, "tracks", cache);
      if (!audio) {
        audio = (await resolveTrackAudioUrl(t.id)) ?? null;
      } else if (!isTransientUrl(audio)) {
        audioMemCache.set(dbTrackId, audio);
        void fastCacheSet(`audio3:${dbTrackId}`, audio);
        // Recién subido: se guarda ya en su fila (no esperar al resto de los tracks)
        if (isTransientUrl(t.customAudioUrl)) {
          void supabase.from("tracks").update({ audio_url: audio }).eq("id", dbTrackId).then(() => {});
        }
      }
      const cover = await ensurePersistentUrl(t.coverUrl, "covers", cache);
      return {
        ...t,
        customAudioUrl: audio || (isTransientUrl(t.customAudioUrl) ? t.customAudioUrl : audio) || undefined,
        coverUrl: cover || (isTransientUrl(t.coverUrl) ? t.coverUrl : cover) || undefined,
      };
    };
    const list = project.tracks || [];
    const tracks: Track[] = new Array(list.length);
    let next = 0;
    const worker = async () => {
      while (next < list.length) {
        const i = next++;
        tracks[i] = await saveTrack(list[i]);
      }
    };
    const [coverUrl, videos] = await Promise.all([
      ensurePersistentUrl(project.coverUrl, "covers", cache),
      Promise.all(
        (project.videos || []).map(async (v): Promise<ProjectVideoClip> => {
          const url = await ensurePersistentUrl(v.url, "videos", cache);
          return { ...v, url: url || v.url };
        })
      ),
      Promise.all(Array.from({ length: Math.min(3, list.length) }, worker)),
    ]).then(([c, v]) => [c, v] as const);

    let safeUserId: string | null = null;
    if (userId && UUID_RE.test(userId)) {
      safeUserId = userId;
    } else if (project.artistId && UUID_RE.test(project.artistId)) {
      safeUserId = project.artistId;
    } else {
      try {
        const { data: authData } = await supabase.auth.getSession();
        const authUid = authData.session?.user?.id;
        if (authUid && UUID_RE.test(authUid)) {
          safeUserId = authUid;
        }
      } catch {
        // ignore
      }
    }

    const baseRow: Record<string, unknown> = {
      id: dbProjectId,
      title: project.title,
      artist: project.artist,
      type: project.type,
      year: project.year,
      status: project.status,
      zone: project.zone,
      description: project.description || "",
      cover_url: coverUrl,
      user_id: safeUserId,
      updated_at: new Date().toISOString(),
    };

    let { error: projErr } = await supabase
      .from("projects")
      .upsert(
        { ...baseRow, is_public: project.visibility === "public", visibility: project.visibility || "private" },
        { onConflict: "id" }
      );
    if (projErr && /visibility/i.test(projErr.message)) {
      // la columna visibility todavía no existe (falta migration_privacy.sql): amigos = privado
      ({ error: projErr } = await supabase
        .from("projects")
        .upsert({ ...baseRow, is_public: project.visibility === "public" }, { onConflict: "id" }));
    }
    if (projErr && /is_public/i.test(projErr.message)) {
      // la columna is_public todavía no existe en la DB (falta correr la migración)
      ({ error: projErr } = await supabase.from("projects").upsert(baseRow, { onConflict: "id" }));
    }
    if (projErr && /user_id|foreign key/i.test(projErr.message)) {
      // Si falló por constraint de user_id en base de datos, reintentamos con user_id: null
      const rowNoUser = { ...baseRow, user_id: null };
      ({ error: projErr } = await supabase.from("projects").upsert(rowNoUser, { onConflict: "id" }));
    }
    if (projErr) {
      console.warn("Error guardando proyecto en Supabase:", projErr.message);
      return null;
    }

    const trackIds = tracks.map((t) => toDbId(t.id));
    if (tracks.length > 0) {
      const trackRows = tracks.map((t, idx) => ({
        id: toDbId(t.id),
        project_id: dbProjectId,
        title: t.title,
        artist: t.artist,
        feat: t.feat || null,
        prod: t.prod || null,
        bpm: int(t.bpm, 140),
        musical_key: t.key,
        duration: t.duration,
        duration_sec: int(t.durationSec, 150),
        version: int(t.version, 1),
        note: t.note || null,
        glyph: t.glyph,
        c1: t.c1 || "#ffffff",
        c2: t.c2 || "#888888",
        accent: t.accent || "#ffffff",
        audio_freq: int(t.audioFreq, 80),
        audio_url: cleanUrl(t.customAudioUrl) || null,
        cover_url: cleanUrl(t.coverUrl) || coverUrl || null,
        order_index: idx,
      }));
      const { error: trErr } = await supabase.from("tracks").upsert(trackRows, { onConflict: "id" });
      if (trErr) console.warn("Error guardando tracks:", trErr.message);
    }
    // Borrar de la nube SOLO los tracks que esta pestaña conocía y ya no están (los sacaste o moviste).
    // Nunca "todo lo que no conozco": eso borraba tracks subidos desde otra pestaña o dispositivo.
    {
      const known = knownCloudTrackIds.get(dbProjectId) || new Set<string>();
      const removed = [...known].filter((id) => !trackIds.includes(id));
      if (removed.length > 0) {
        await supabase.from("tracks").delete().eq("project_id", dbProjectId).in("id", removed);
      }
      knownCloudTrackIds.set(dbProjectId, new Set(trackIds));
    }

    const videoIds = videos.map((v) => toDbId(v.id));
    if (videos.length > 0) {
      const videoRows = videos
        .filter((v) => cleanUrl(v.url))
        .map((v) => ({
          id: toDbId(v.id),
          project_id: dbProjectId,
          url: v.url as string,
          label: v.label || "canvas",
          media_type: v.mediaType || "video",
        }));
      if (videoRows.length > 0) {
        let { error: vErr } = await supabase
          .from("project_videos")
          .upsert(videoRows, { onConflict: "id" });
        if (vErr && /media_type/i.test(vErr.message)) {
          const fallbackRows = videoRows.map(({ media_type: _mt, ...rest }) => rest);
          ({ error: vErr } = await supabase
            .from("project_videos")
            .upsert(fallbackRows, { onConflict: "id" }));
        }
        if (vErr) console.warn("Error guardando canvas:", vErr.message);
      }
    }
    {
      let del = supabase.from("project_videos").delete().eq("project_id", dbProjectId);
      if (videoIds.length > 0) del = del.not("id", "in", `(${videoIds.join(",")})`);
      await del;
    }

    return { ...project, coverUrl: coverUrl || undefined, tracks, videos };
  } catch (err) {
    console.warn("Fallo saveProjectToSupabase:", err);
    return null;
  }
}

/** Aplica sobre el estado actual las URLs permanentes devueltas por saveProjectToSupabase. */
export function mergePersistedUrls(current: Project, saved: Project): Project {
  const savedTracks = new Map(saved.tracks.map((t) => [t.id, t]));
  const savedVideos = new Map(saved.videos.map((v) => [v.id, v]));
  return {
    ...current,
    coverUrl: isTransientUrl(current.coverUrl) ? saved.coverUrl : current.coverUrl,
    tracks: current.tracks.map((t) => {
      const s = savedTracks.get(t.id);
      if (!s) return t;
      return {
        ...t,
        customAudioUrl: isTransientUrl(t.customAudioUrl) ? s.customAudioUrl : t.customAudioUrl,
        coverUrl: isTransientUrl(t.coverUrl) ? s.coverUrl : t.coverUrl,
      };
    }),
    videos: current.videos.map((v) => {
      const s = savedVideos.get(v.id);
      return s && isTransientUrl(v.url) ? { ...v, url: s.url } : v;
    }),
  };
}

export function hasTransientMedia(p: Project): boolean {
  return (
    isTransientUrl(p.coverUrl) ||
    p.tracks.some((t) => isTransientUrl(t.customAudioUrl) || isTransientUrl(t.coverUrl)) ||
    p.videos.some((v) => isTransientUrl(v.url))
  );
}

// ==================== DB: ACTUALIZAR PORTADA DE UN PROYECTO ====================
export async function updateProjectCoverInSupabase(projectId: string, coverUrl: string): Promise<boolean> {
  try {
    const persistent = await ensurePersistentUrl(coverUrl, "covers");
    if (!persistent) return false;
    const { error } = await supabase
      .from("projects")
      .update({ cover_url: persistent, updated_at: new Date().toISOString() })
      .eq("id", toDbId(projectId));
    return !error;
  } catch (err) {
    console.warn("Fallo updateProjectCoverInSupabase:", err);
    return false;
  }
}

// ==================== DB: GUARDAR O ACTUALIZAR TRACK INDIVIDUAL ====================
export async function saveTrackToSupabase(projectId: string, track: Track, orderIndex: number = 0): Promise<boolean> {
  try {
    const cache = new Map<string, string | null>();
    const audio = await ensurePersistentUrl(track.customAudioUrl, "tracks", cache);
    const cover = await ensurePersistentUrl(track.coverUrl, "covers", cache);
    const { error } = await supabase.from("tracks").upsert(
      {
        id: toDbId(track.id),
        project_id: toDbId(projectId),
        title: track.title,
        artist: track.artist,
        feat: track.feat || null,
        prod: track.prod || null,
        bpm: int(track.bpm, 140),
        musical_key: track.key,
        duration: track.duration,
        duration_sec: int(track.durationSec, 150),
        version: int(track.version, 1),
        note: track.note || null,
        glyph: track.glyph,
        c1: track.c1 || "#ffffff",
        c2: track.c2 || "#888888",
        accent: track.accent || "#ffffff",
        audio_freq: int(track.audioFreq, 80),
        audio_url: audio,
        cover_url: cover,
        order_index: orderIndex,
      },
      { onConflict: "id" }
    );
    if (error) {
      console.warn("Error guardando track en Supabase:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("Fallo saveTrackToSupabase:", err);
    return false;
  }
}

// ==================== DB: ELIMINAR TRACK ====================
export async function deleteTrackFromSupabase(trackId: string): Promise<boolean> {
  try {
    const { error } = await supabase.from("tracks").delete().eq("id", toDbId(trackId));
    return !error;
  } catch (err) {
    console.warn("Fallo deleteTrackFromSupabase:", err);
    return false;
  }
}

// ==================== DB: ELIMINAR PROYECTO ====================
export async function deleteProjectFromSupabase(projectId: string): Promise<boolean> {
  try {
    const { error } = await supabase.from("projects").delete().eq("id", toDbId(projectId));
    return !error;
  } catch (err) {
    console.warn("Fallo deleteProjectFromSupabase:", err);
    return false;
  }
}

// ==================== DB: GUARDADOS / BOOKMARKS ====================
export async function fetchSavedProjectIdsFromSupabase(userId: string): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from("saved_projects")
      .select("project_id")
      .eq("user_id", userId);
    if (error || !data) return [];
    return data.map((d: any) => d.project_id);
  } catch {
    return [];
  }
}

export async function toggleSavedProjectInSupabase(userId: string, projectId: string, isSaved: boolean): Promise<void> {
  try {
    const pid = toDbId(projectId);
    if (isSaved) {
      await supabase.from("saved_projects").upsert({ user_id: userId, project_id: pid });
    } else {
      await supabase.from("saved_projects").delete().eq("user_id", userId).eq("project_id", pid);
    }
  } catch (err) {
    console.warn("toggleSavedProjectInSupabase warn:", err);
  }
}

// ==================== LINKS DE INVITACIÓN AL EP / PROYECTO (ESTILO [untitled]) ====================
export type ProjectInviteRole = "listen" | "edit";

function computeInviteHash(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ (ch * 31), 0x85ebca6b) >>> 0;
  }
  return `${h1.toString(36)}${h2.toString(36)}`.slice(0, 12);
}

/**
 * Genera el token verificable para un link de "Invitación al EP / Proyecto" estilo [untitled]:
 * - "listen": Solo escuchar (acceso a proyecto privado para escuchar, descargar y guardar en biblioteca)
 * - "edit": Permitir editar el proyecto (acceso de colaborador para subir tracks, editar Key/BPM, portada, canvas, etc.)
 */
export function makeProjectInviteToken(projectId: string, role: ProjectInviteRole): string {
  const cleanId = projectId.trim().toLowerCase();
  const sig = computeInviteHash(`board_invite_v1::${cleanId}::${role}`);
  const prefix = role === "edit" ? "ed" : "ls";
  return `${prefix}_${sig}`;
}

export function verifyProjectInviteToken(
  projectId: string,
  token: string | null | undefined
): ProjectInviteRole | null {
  if (!token || !projectId) return null;
  const cleanToken = token.trim();
  if (cleanToken === makeProjectInviteToken(projectId, "edit")) return "edit";
  if (cleanToken === makeProjectInviteToken(projectId, "listen")) return "listen";
  return null;
}



// =========================================================================
// COMPARTIR PROYECTOS Y TRACKS (supabase/migration_sharing.sql)
// =========================================================================

export type ShareMemberships = {
  projects: Record<string, ProjectInviteRole>;
  tracks: Record<string, ProjectInviteRole>;
  projectIdsWithAccess: string[];
};

function shareRpcMissing(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return (
    error.code === "PGRST202" ||
    error.code === "PGRST205" ||
    error.code === "42883" ||
    error.code === "42P01" ||
    /could not find the function|does not exist|schema cache/i.test(error.message || "")
  );
}

/** Los links viejos (hash calculable en el navegador) tienen forma ls_xxxx / ed_xxxx */
export function isLegacyInviteToken(token: string | null | undefined): boolean {
  return /^(ed|ls)_[a-z0-9]{4,16}$/i.test((token || "").trim());
}

/** Crea (o reutiliza) un link para un proyecto entero o un track. "missing" = servidor sin la migración */
export async function createProjectShareToken(
  projectId: string,
  trackId: string | null,
  role: ProjectInviteRole
): Promise<string | null | "missing"> {
  const { data, error } = await supabase.rpc("create_project_share", {
    p_project: toDbId(projectId),
    p_track: trackId ? toDbId(trackId) : null,
    p_role: role,
  });
  if (error) return shareRpcMissing(error) ? "missing" : null;
  return typeof data === "string" ? data : null;
}

/** Canjea un link: la cuenta logueada queda como miembro del proyecto o del track */
export async function redeemProjectShareToken(
  token: string
): Promise<{ projectId: string; trackId: string | null; role: ProjectInviteRole } | null | "missing"> {
  const { data, error } = await supabase.rpc("redeem_project_share", { p_token: token });
  if (error) return shareRpcMissing(error) ? "missing" : null;
  const row = (Array.isArray(data) ? data[0] : data) as
    | { project_id: string; track_id: string | null; role: ProjectInviteRole }
    | undefined;
  return row ? { projectId: row.project_id, trackId: row.track_id, role: row.role } : null;
}

/** Sin iniciar sesión: el proyecto con solo los tracks que permite el link (para escuchar) */
export async function getProjectShareByToken(
  token: string
): Promise<{ project: Project; role: ProjectInviteRole; trackId: string | null } | null | "missing"> {
  const { data, error } = await supabase.rpc("get_project_share", { p_token: token });
  if (error) return shareRpcMissing(error) ? "missing" : null;
  if (!data) return null;
  const row = data as any;
  return {
    project: mapProjectRow({ ...row, tracks: row.tracks || [], project_videos: row.project_videos || [] }, 0),
    role: row.share_role === "edit" ? "edit" : "listen",
    trackId: row.share_track_id || null,
  };
}

/** Membresías de la cuenta (proyectos y tracks compartidos conmigo) */
export async function fetchMyShareMemberships(userId: string): Promise<ShareMemberships | null> {
  if (!userId) return null;
  const { data, error } = await supabase
    .from("project_members")
    .select("project_id, track_id, role")
    .eq("user_id", userId);
  if (error) return null;
  const out: ShareMemberships = { projects: {}, tracks: {}, projectIdsWithAccess: [] };
  const ids = new Set<string>();
  for (const m of (data || []) as { project_id: string; track_id: string | null; role: ProjectInviteRole }[]) {
    ids.add(m.project_id);
    const bucket = m.track_id ? out.tracks : out.projects;
    const key = m.track_id || m.project_id;
    bucket[key] = bucket[key] === "edit" || m.role === "edit" ? "edit" : "listen";
  }
  out.projectIdsWithAccess = Array.from(ids);
  return out;
}

/** Editor de UN track: guarda solo esa fila (no toca el proyecto ni los otros tracks) */
export async function saveSharedTrackMeta(track: Track, projectId: string): Promise<boolean> {
  const { error } = await supabase
    .from("tracks")
    .update({
      title: track.title,
      artist: track.artist,
      feat: track.feat || null,
      prod: track.prod || null,
      bpm: int(track.bpm, 140),
      musical_key: track.key,
      note: track.note || null,
      glyph: track.glyph,
    })
    .eq("id", toDbId(track.id))
    .eq("project_id", toDbId(projectId));
  if (error) console.warn("Error guardando track compartido:", error.message);
  return !error;
}


// =========================================================================
// COLABORADORES (supabase/migration_collab.sql)
// =========================================================================
export type ProjectCollaborator = {
  userId: string;
  handle: string;
  name: string;
  avatarUrl?: string;
  role: ProjectInviteRole;
  isCoauthor: boolean;
};

export async function addProjectCollaborator(
  projectId: string,
  handle: string,
  role: ProjectInviteRole,
  coauthor: boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.rpc("add_project_collaborator", {
    p_project: toDbId(projectId),
    p_handle: handle,
    p_role: role,
    p_coauthor: coauthor,
  });
  if (!error) return { ok: true };
  if (shareRpcMissing(error)) return { ok: false, error: "Falta la actualización del servidor (APLICAR_TODO.sql)." };
  return { ok: false, error: error.message.replace(/^.*?ERROR:\s*/, "") };
}

export async function listProjectCollaborators(projectId: string): Promise<ProjectCollaborator[] | null> {
  const { data, error } = await supabase.rpc("list_project_collaborators", { p_project: toDbId(projectId) });
  if (error) return null;
  return ((data || []) as any[]).map((r) => ({
    userId: r.user_id,
    handle: r.handle,
    name: r.name,
    avatarUrl: r.avatar_url || undefined,
    role: r.role === "edit" ? "edit" : "listen",
    isCoauthor: Boolean(r.is_coauthor),
  }));
}

export async function removeProjectCollaborator(projectId: string, userId: string): Promise<boolean> {
  const { error } = await supabase.rpc("remove_project_collaborator", { p_project: toDbId(projectId), p_user: userId });
  return !error;
}

/** Coautores de muchos proyectos de una: { projectId: ["dorkke", ...] } */
export async function fetchCoauthors(projectIds: string[]): Promise<Record<string, string[]> | null> {
  const ids = projectIds.filter((id) => UUID_RE.test(id));
  if (ids.length === 0) return {};
  const { data, error } = await supabase.rpc("coauthors_for_projects", { p_projects: ids });
  if (error) return null;
  const out: Record<string, string[]> = {};
  for (const r of (data || []) as { project_id: string; name: string; handle: string }[]) {
    (out[r.project_id] ||= []).push(r.name || r.handle.replace(/^@/, ""));
  }
  return out;
}


// =========================================================================
// SEGUIDORES Y AMIGOS (supabase/migration_social.sql)
// =========================================================================
export type SocialPerson = { userId: string; handle: string; name: string; avatarUrl?: string };
export type SocialLists = { amigos: SocialPerson[]; seguidores: SocialPerson[]; seguidos: SocialPerson[] };

/** Amigos (se siguen los dos), seguidores (te siguen, no los seguís) y seguidos (los seguís, no te siguen) */
export async function fetchSocialLists(userId: string): Promise<SocialLists | null> {
  if (!UUID_RE.test(userId)) return null;
  const { data, error } = await supabase.rpc("social_lists", { p_user: userId });
  if (error) return null;
  const out: SocialLists = { amigos: [], seguidores: [], seguidos: [] };
  for (const r of (data || []) as { kind: string; user_id: string; handle: string; name: string; avatar_url: string | null }[]) {
    const person = { userId: r.user_id, handle: r.handle, name: r.name, avatarUrl: r.avatar_url || undefined };
    if (r.kind === "amigo") out.amigos.push(person);
    else if (r.kind === "seguidor") out.seguidores.push(person);
    else out.seguidos.push(person);
  }
  return out;
}

export async function setFollowing(me: string, other: string, follow: boolean): Promise<boolean> {
  if (follow) {
    // Solo insertar (si ya existe, no hace nada): la tabla no permite "actualizar", y el upsert común daba 403
    const { error } = await supabase
      .from("follows")
      .upsert({ follower_id: me, followee_id: other }, { onConflict: "follower_id,followee_id", ignoreDuplicates: true });
    return !error;
  }
  const { error } = await supabase.from("follows").delete().eq("follower_id", me).eq("followee_id", other);
  return !error;
}

/** Amigos: rechazar la solicitud que te mandó `other` */
export async function rejectFriendRequest(me: string, other: string): Promise<boolean> {
  const { error } = await supabase.from("follows").delete().eq("follower_id", other).eq("followee_id", me);
  return !error;
}
/** Amigos: dejar de ser amigos (se borran las dos direcciones) */
export async function removeFriend(me: string, other: string): Promise<boolean> {
  const a = await supabase.from("follows").delete().eq("follower_id", me).eq("followee_id", other);
  const b = await supabase.from("follows").delete().eq("follower_id", other).eq("followee_id", me);
  return !a.error && !b.error;
}

// ==================== COMENTARIOS CON TIEMPO EN LOS TRACKS ====================
export type TrackComment = {
  id: string;
  trackId: string;
  userId: string;
  atSec: number | null;
  body: string;
  createdAt: string;
  handle?: string;
  name?: string;
  avatarUrl?: string;
  likeCount: number;
  liked: boolean;
};

/** null = la migración de comentarios todavía no está aplicada */
export async function fetchTrackComments(trackId: string): Promise<TrackComment[] | null> {
  const { data, error } = await supabase.rpc("track_comments_list", { p_track: toDbId(trackId) });
  if (error) return null;
  return ((data || []) as Array<Record<string, unknown>>).map((r) => ({
    id: r.id as string,
    trackId: r.track_id as string,
    userId: r.user_id as string,
    atSec: r.at_sec == null ? null : Number(r.at_sec),
    body: r.body as string,
    createdAt: r.created_at as string,
    handle: (r.handle as string) || undefined,
    name: (r.name as string) || undefined,
    avatarUrl: (r.avatar_url as string) || undefined,
    likeCount: Number(r.like_count || 0),
    liked: r.liked === true,
  }));
}

/** Me gusta en un comentario (on = dar, off = sacar) */
export async function setCommentLike(commentId: string, userId: string, on: boolean): Promise<boolean> {
  if (on) {
    const { error } = await supabase.from("comment_likes").upsert({ comment_id: commentId, user_id: userId }, { onConflict: "comment_id,user_id" });
    return !error;
  }
  const { error } = await supabase.from("comment_likes").delete().eq("comment_id", commentId).eq("user_id", userId);
  return !error;
}

export async function addTrackComment(trackId: string, userId: string, body: string, atSec: number | null): Promise<boolean> {
  const { error } = await supabase.from("track_comments").insert({
    track_id: toDbId(trackId),
    user_id: userId,
    body: body.trim().slice(0, 500),
    at_sec: atSec == null ? null : Math.max(0, Math.round(atSec * 10) / 10),
  });
  return !error;
}

export async function deleteTrackComment(id: string): Promise<boolean> {
  const { error } = await supabase.from("track_comments").delete().eq("id", id);
  return !error;
}


// ==================== CARPETAS DE PROYECTOS ====================
export type ProjectFolder = { id: string; title: string; createdAt: string };

/** null = la migración de carpetas todavía no está aplicada */
export async function fetchProjectFolders(userId: string): Promise<ProjectFolder[] | null> {
  const { data, error } = await supabase
    .from("project_folders")
    .select("id, title, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) return null;
  return (data || []).map((f: { id: string; title: string; created_at: string }) => ({ id: f.id, title: f.title, createdAt: f.created_at }));
}

export async function createProjectFolder(userId: string, title = "Nueva carpeta"): Promise<ProjectFolder | null> {
  const { data, error } = await supabase
    .from("project_folders")
    .insert({ user_id: userId, title })
    .select("id, title, created_at")
    .single();
  if (error || !data) return null;
  return { id: data.id, title: data.title, createdAt: data.created_at };
}

export async function renameProjectFolder(folderId: string, title: string): Promise<boolean> {
  const { error } = await supabase.from("project_folders").update({ title: title.trim().slice(0, 80) || "Carpeta" }).eq("id", folderId);
  return !error;
}

export async function deleteProjectFolder(folderId: string): Promise<boolean> {
  const { error } = await supabase.from("project_folders").delete().eq("id", folderId);
  return !error;
}

/** Qué proyecto tengo en qué carpeta (de esta cuenta). null = falta la migración */
export async function fetchFolderItems(userId: string): Promise<Record<string, string> | null> {
  const { data, error } = await supabase.from("project_folder_items").select("project_id, folder_id").eq("user_id", userId);
  if (error) return null;
  const out: Record<string, string> = {};
  (data || []).forEach((r: { project_id: string; folder_id: string }) => (out[r.project_id] = r.folder_id));
  return out;
}

/** Mete (o saca, con folderId null) un proyecto de una carpeta propia */
export async function setProjectFolderInDb(userId: string, projectId: string, folderId: string | null): Promise<boolean> {
  if (!folderId) {
    const { error } = await supabase.from("project_folder_items").delete().eq("user_id", userId).eq("project_id", projectId);
    return !error;
  }
  const { error } = await supabase
    .from("project_folder_items")
    .upsert({ user_id: userId, project_id: projectId, folder_id: folderId }, { onConflict: "user_id,project_id" });
  return !error;
}

// ==================== ACTIVIDAD (qué escucha cada uno) ====================
export type ActivityReport = {
  trackId: string | null;
  trackTitle: string | null;
  artist: string | null;
  projectId: string | null;
  projectTitle: string | null;
  coverUrl: string | null;
  isPlaying: boolean;
  device: string;
  share: boolean;
};
/** Latido: "estoy conectado y escuchando esto" (la hora la pone el servidor) */
export async function reportActivity(userId: string, a: ActivityReport): Promise<void> {
  try {
    await supabase.from("listening_activity").upsert(
      {
        user_id: userId,
        track_id: a.trackId,
        track_title: a.trackTitle,
        artist: a.artist,
        project_id: a.projectId,
        project_title: a.projectTitle,
        cover_url: a.coverUrl && /^https?:/.test(a.coverUrl) ? a.coverUrl : null,
        is_playing: a.isPlaying,
        device: a.device,
        share: a.share,
      },
      { onConflict: "user_id" }
    );
  } catch {}
}

export type FriendActivity = {
  user_id: string;
  handle: string | null;
  name: string | null;
  avatar_url: string | null;
  track_id: string | null;
  track_title: string | null;
  artist: string | null;
  project_id: string | null;
  project_title: string | null;
  cover_url: string | null;
  is_playing: boolean;
  last_seen: string | null;
};
export async function fetchFriendsActivity(): Promise<FriendActivity[] | null> {
  const { data, error } = await supabase.rpc("friends_activity");
  return error ? null : ((data || []) as FriendActivity[]);
}

export type AdminUserRow = {
  user_id: string;
  handle: string | null;
  name: string | null;
  avatar_url: string | null;
  account_type: string | null;
  email: string | null;
  registered_at: string;
  last_sign_in_at: string | null;
  track_title: string | null;
  artist: string | null;
  project_title: string | null;
  cover_url: string | null;
  is_playing: boolean;
  device: string | null;
  share: boolean | null;
  last_seen: string | null;
};
export async function fetchAdminUsers(): Promise<{ rows: AdminUserRow[]; error?: string }> {
  const { data, error } = await supabase.rpc("admin_users_activity");
  return error ? { rows: [], error: error.message } : { rows: (data || []) as AdminUserRow[] };
}

/** Conectado = latido de hace menos de 2 minutos */
export const ONLINE_MS = 2 * 60 * 1000;
export const isOnline = (lastSeen: string | null | undefined) => Boolean(lastSeen && Date.now() - new Date(lastSeen).getTime() < ONLINE_MS);
export function agoEs(iso: string | null | undefined): string {
  if (!iso) return "nunca";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "recién";
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  if (s < 86400 * 30) return `hace ${Math.floor(s / 86400)} d`;
  return new Date(iso).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "2-digit" });
}
