import { createClient } from "@supabase/supabase-js";
import type { ArtistProfile, Project, Track, ProjectVideoClip } from "./mock";

export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://txhrbfgejcwmmurriccw.supabase.co";

export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "sb_publishable_UvC4vGCFOnN0FGbRAux0nw_wneVnyhC";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
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
export async function uploadMediaToSupabase(
  file: File | Blob,
  folder: "covers" | "tracks" | "videos" | "avatars" = "covers"
): Promise<string | null> {
  try {
    const rawName = (file as File).name || "";
    const mimeExt = (file.type || "").split("/")[1]?.split(";")[0]?.replace("mpeg", "mp3");
    const ext = (rawName.includes(".") ? rawName.split(".").pop() : mimeExt) || "bin";
    const filename = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext.toLowerCase()}`;
    const { data, error } = await supabase.storage
      .from("el-tablero-media")
      .upload(filename, file, {
        cacheControl: "31536000",
        upsert: false,
        contentType: file.type || undefined,
      });

    if (!error && data) {
      const { data: publicUrlData } = supabase.storage
        .from("el-tablero-media")
        .getPublicUrl(data.path);
      return publicUrlData.publicUrl;
    }

    // Fallback directo a Data URL en PostgreSQL cuando el bucket aún no está creado o no tiene políticas
    return await blobToDataUrl(file);
  } catch {
    return await blobToDataUrl(file);
  }
}

/** Si la URL es blob: (temporal, se pierde con F5) la sube al bucket o la convierte a Data URL persistente. */
export async function ensurePersistentUrl(
  url: string | undefined | null,
  folder: "covers" | "tracks" | "videos" | "avatars",
  cache?: Map<string, string | null>
): Promise<string | null> {
  if (!url) return null;
  if (!isTransientUrl(url)) return url;
  if (cache?.has(url)) return cache.get(url) ?? null;
  let result: string | null = null;
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    result = await uploadMediaToSupabase(blob, folder);
  } catch (err) {
    console.warn("No se pudo leer el archivo temporal:", err);
  }
  cache?.set(url, result);
  return result;
}

// ==================== DB: FETCH ULTRA-RÁPIDO DE PROYECTOS (SIN BLOQUEAR EN BLOBS DE AUDIO) ====================
const TRACK_META_COLS =
  "id, project_id, title, artist, feat, prod, bpm, musical_key, duration, duration_sec, version, note, glyph, c1, c2, accent, audio_freq, cover_url, order_index";

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

    return data.map((row: any, idx: number): Project => {
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
        visibility: isPublic ? "public" : "private",
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
    });
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
export async function fetchCommunityProfilesFromSupabase(): Promise<ArtistProfile[]> {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, name, handle, role, zone, crew, bio, color, stickers, avatar_url, created_at")
      .order("created_at", { ascending: false });

    if (error || !data) {
      return [];
    }

    return data.map((row: any): ArtistProfile => ({
      id: row.id,
      name: row.name,
      handle: row.handle?.startsWith("@") ? row.handle : `@${row.handle || "artista"}`,
      role: row.role || "Artista",
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
        error: `El usuario ${cleanHandle} ya está en uso por otro artista en board. Por favor elegí otro.`,
      };
    }

    const avatarUrl = await ensurePersistentUrl(profile.avatarUrl, "avatars");

    const { error: upsertErr } = await supabase
      .from("profiles")
      .upsert({
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
      }, { onConflict: "id" });

    if (upsertErr) {
      return { success: false, error: `Error en base de datos: ${upsertErr.message}` };
    }

    return { success: true, cleanHandle };
  } catch (err: any) {
    return { success: false, error: err?.message || "Error al conectar con los servidores de board." };
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

    const coverUrl = await ensurePersistentUrl(project.coverUrl, "covers", cache);

    const tracks: Track[] = [];
    for (const t of project.tracks || []) {
      const dbTrackId = toDbId(t.id);
      let audio = await ensurePersistentUrl(t.customAudioUrl, "tracks", cache);
      if (!audio) {
        audio = (await resolveTrackAudioUrl(t.id)) ?? null;
      } else if (!isTransientUrl(audio)) {
        audioMemCache.set(dbTrackId, audio);
        void fastCacheSet(`audio:${dbTrackId}`, audio);
      }
      const cover = await ensurePersistentUrl(t.coverUrl, "covers", cache);
      tracks.push({
        ...t,
        customAudioUrl: audio || (isTransientUrl(t.customAudioUrl) ? t.customAudioUrl : audio) || undefined,
        coverUrl: cover || (isTransientUrl(t.coverUrl) ? t.coverUrl : cover) || undefined,
      });
    }

    const videos: ProjectVideoClip[] = [];
    for (const v of project.videos || []) {
      const url = await ensurePersistentUrl(v.url, "videos", cache);
      videos.push({ ...v, url: url || v.url });
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
      user_id: (project.artistId && UUID_RE.test(project.artistId) ? project.artistId : userId) || null,
      updated_at: new Date().toISOString(),
    };

    let { error: projErr } = await supabase
      .from("projects")
      .upsert({ ...baseRow, is_public: project.visibility === "public" }, { onConflict: "id" });
    if (projErr && /is_public/i.test(projErr.message)) {
      // la columna is_public todavía no existe en la DB (falta correr la migración)
      ({ error: projErr } = await supabase.from("projects").upsert(baseRow, { onConflict: "id" }));
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

