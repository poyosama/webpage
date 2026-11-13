import { createClient } from "@supabase/supabase-js";
import type { ArtistProfile, Project, Track, ProjectVideoClip } from "./mock";

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

function compressImageBlobToDataUrl(blob: Blob, maxDim = 720, quality = 0.85): Promise<string | null> {
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

// ==================== STORAGE: SUBIR AUDIO / TAPAS / VIDEOS AL BUCKET ====================
async function uploadToStorageWithRetry(
  filename: string,
  file: File | Blob,
  folder: string,
  maxRetries = 3
): Promise<string | null> {
  const timeoutMs = folder === "tracks" || folder === "videos" ? 45000 : 18000;
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

export async function uploadMediaToSupabase(
  file: File | Blob,
  folder: "covers" | "tracks" | "videos" | "avatars" = "covers"
): Promise<string | null> {
  try {
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
  const result = await job;
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

  const disk = await fastCacheGet<string>(`audio:${dbId}`);
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
      void fastCacheSet(`audio:${dbId}`, url);
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
    let { data, error }: { data: any[] | null; error: any } = await supabase
      .from("profiles")
      .select(`${cols}, account_type`)
      .order("created_at", { ascending: false });
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
        void supabase.from("profiles").delete().eq("id", row.id);
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

    const avatarUrl = await ensurePersistentUrl(profile.avatarUrl, "avatars");

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
export async function saveProjectToSupabase(project: Project, userId?: string): Promise<Project | null> {
  try {
    const cache = new Map<string, string | null>();
    const dbProjectId = toDbId(project.id);

    // Todo en paralelo: tapa, canvas y hasta 3 tracks a la vez (antes era de a uno)
    const saveTrack = async (t: Track): Promise<Track> => {
      const dbTrackId = toDbId(t.id);
      let audio = await ensurePersistentUrl(t.customAudioUrl, "tracks", cache);
      if (!audio) {
        audio = (await resolveTrackAudioUrl(t.id)) ?? null;
      } else if (!isTransientUrl(audio)) {
        audioMemCache.set(dbTrackId, audio);
        void fastCacheSet(`audio:${dbTrackId}`, audio);
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
        bpm: t.bpm,
        musical_key: t.key,
        duration: t.duration,
        duration_sec: t.durationSec,
        version: t.version,
        note: t.note || null,
        glyph: t.glyph,
        c1: t.c1 || "#ffffff",
        c2: t.c2 || "#888888",
        accent: t.accent || "#ffffff",
        audio_freq: t.audioFreq || 80,
        audio_url: cleanUrl(t.customAudioUrl) || null,
        cover_url: cleanUrl(t.coverUrl) || coverUrl || null,
        order_index: idx,
      }));
      const { error: trErr } = await supabase.from("tracks").upsert(trackRows, { onConflict: "id" });
      if (trErr) console.warn("Error guardando tracks:", trErr.message);
    }
    // Borrar de la nube los tracks que ya no existen en el proyecto
    {
      let del = supabase.from("tracks").delete().eq("project_id", dbProjectId);
      if (trackIds.length > 0) del = del.not("id", "in", `(${trackIds.join(",")})`);
      await del;
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
        bpm: track.bpm,
        musical_key: track.key,
        duration: track.duration,
        duration_sec: track.durationSec,
        version: track.version,
        note: track.note || null,
        glyph: track.glyph,
        c1: track.c1 || "#ffffff",
        c2: track.c2 || "#888888",
        accent: track.accent || "#ffffff",
        audio_freq: track.audioFreq || 80,
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
      bpm: track.bpm,
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
    const { error } = await supabase.from("follows").upsert({ follower_id: me, followee_id: other }, { onConflict: "follower_id,followee_id" });
    return !error;
  }
  const { error } = await supabase.from("follows").delete().eq("follower_id", me).eq("followee_id", other);
  return !error;
}
