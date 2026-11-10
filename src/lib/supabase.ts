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
  !!url && (url.startsWith("blob:") || url.startsWith("data:"));

const cleanUrl = (url?: string | null): string | undefined =>
  url && !url.startsWith("blob:") ? url : undefined;

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

    if (error || !data) {
      console.warn("Storage upload warn:", error?.message);
      return null;
    }

    const { data: publicUrlData } = supabase.storage
      .from("el-tablero-media")
      .getPublicUrl(data.path);

    return publicUrlData.publicUrl;
  } catch (err) {
    console.warn("Error en uploadMediaToSupabase:", err);
    return null;
  }
}

/** Si la URL es blob:/data: (temporal, se pierde con F5) la sube al bucket y devuelve la URL pública permanente. */
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

// ==================== DB: FETCH DE PROYECTOS (los propios + los públicos, según RLS) ====================
export async function fetchUserProjectsFromSupabase(userId?: string): Promise<Project[] | null> {
  try {
    let query = supabase.from("projects").select("*, tracks:tracks(*), project_videos:project_videos(*)");

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
        .map((t: any): Track => ({
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
          customAudioUrl: cleanUrl(t.audio_url),
          coverUrl: cleanUrl(t.cover_url),
        }));
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
          .map((v: any): ProjectVideoClip => ({
            id: v.id,
            label: v.label || "canvas_loop.mp4",
            kind: "uploaded",
            stylePreset: "vhs-grain",
            url: v.url,
            mediaType: v.media_type || "video",
            c1: "#111111",
            c2: "#222222",
          })),
      };
    });
  } catch (err) {
    console.warn("Fallo fetchUserProjectsFromSupabase:", err);
    return null;
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
        error: `El usuario ${cleanHandle} ya está en uso por otro artista en El tablero. Por favor elegí otro.`,
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

    const coverUrl = await ensurePersistentUrl(project.coverUrl, "covers", cache);

    const tracks: Track[] = [];
    for (const t of project.tracks || []) {
      const audio = await ensurePersistentUrl(t.customAudioUrl, "tracks", cache);
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
      user_id: userId || null,
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
        const { error: vErr } = await supabase.from("project_videos").upsert(videoRows, { onConflict: "id" });
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
