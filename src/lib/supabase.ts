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

// ==================== STORAGE: SUBIR AUDIO O TAPAS AL BUCKET ====================
export async function uploadMediaToSupabase(
  file: File,
  folder: "covers" | "tracks" | "videos" = "covers"
): Promise<string | null> {
  try {
    const ext = file.name.split(".").pop() || "bin";
    const filename = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
    const { data, error } = await supabase.storage
      .from("el-tablero-media")
      .upload(filename, file, { cacheControl: "3600", upsert: true });

    if (error || !data) {
      console.warn("Storage upload warn (usando fallback local):", error?.message);
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

// ==================== DB: FETCH DE PROYECTOS DEL USUARIO O COMUNIDAD ====================
export async function fetchUserProjectsFromSupabase(userId?: string): Promise<Project[] | null> {
  try {
    let query = supabase.from("projects").select(`
      id,
      title,
      artist,
      type,
      year,
      status,
      zone,
      description,
      cover_url,
      order_index,
      tracks:tracks (
        id,
        title,
        artist,
        feat,
        prod,
        bpm,
        musical_key,
        duration,
        duration_sec,
        version,
        note,
        glyph,
        c1,
        c2,
        accent,
        audio_freq,
        audio_url,
        cover_url,
        order_index
      ),
      project_videos:project_videos (
        id,
        url,
        label,
        media_type,
        duration
      )
    `);

    if (userId) {
      query = query.eq("user_id", userId);
    }

    const { data, error } = await query.order("order_index", { ascending: true });

    if (error || !data) {
      console.warn("Error al traer proyectos de Supabase:", error?.message);
      return null;
    }

    // Mapear schema de DB a interfaz Project
    return data.map((row: any, idx: number): Project => ({
      id: row.id,
      title: row.title,
      artist: row.artist,
      artistId: row.artist_id || String(row.artist || "user").toLowerCase().replace(/\s+/g, ""),
      type: row.type || "Mixtape",
      year: row.year || "2026",
      status: row.status || "Publicado",
      dateLabel: row.date_label || `${row.year || "2026"} · Mendoza`,
      zone: row.zone || "Mendoza",
      genre: row.genre || "Trap / Underground",
      description: row.description || "",
      coverUrl: row.cover_url || undefined,
      c1: row.c1 || "#111111",
      c2: row.c2 || "#222222",
      accent: row.accent || "#ffffff",
      tagGlyph: row.tag_glyph || "◈",
      plays: row.plays || "0",
      blockPos: [idx * 3.2, 0, 0],
      blockSize: [2.2, 2.2, 2.2],
      tracks: (row.tracks || []).map((t: any): Track => ({
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
        customAudioUrl: t.audio_url || undefined,
        coverUrl: t.cover_url || undefined,
      })),
      videos: (row.project_videos || []).map((v: any): ProjectVideoClip => ({
        id: v.id,
        label: v.label || "canvas_loop.mp4",
        kind: "uploaded",
        stylePreset: "vhs-grain",
        url: v.url,
        mediaType: v.media_type || "video",
        c1: "#111111",
        c2: "#222222",
      })),
    }));
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
      .select("id, name, handle, role, zone, crew, bio, color, stickers, avatar_url")
      .order("created_at", { ascending: false });

    if (error || !data) {
      return [];
    }

    return data.map((row: any): ArtistProfile => ({
      id: row.id,
      name: row.name,
      handle: row.handle?.startsWith("@") ? row.handle : `@${row.handle || "artista"}`,
      role: row.role || "Rapero · Artista",
      category: "rapero",
      zone: row.zone || "Mendoza",
      crew: row.crew || "UG BOARD",
      bio: row.bio || "",
      color: row.color || "#111111",
      avatarUrl: row.avatar_url || undefined,
      stickers: row.stickers || ["RAW", "MIC", "808"],
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

    const { error: upsertErr } = await supabase
      .from("profiles")
      .upsert({
        id: profile.id,
        handle: cleanHandle,
        name: profile.name.trim() || cleanHandle,
        role: profile.role || "Rapero · Artista",
        zone: profile.zone || "Mendoza",
        crew: profile.crew || "UG BOARD",
        bio: profile.bio || "",
        color: profile.color || "#111111",
        stickers: profile.stickers || ["RAW", "MIC", "808"],
        avatar_url: profile.avatarUrl || null,
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
export async function saveProjectToSupabase(project: Project, userId?: string): Promise<boolean> {
  try {
    const { error: projErr } = await supabase.from("projects").upsert(
      {
        id: project.id,
        title: project.title,
        artist: project.artist,
        type: project.type,
        year: project.year,
        status: project.status,
        zone: project.zone,
        description: project.description,
        cover_url: project.coverUrl || null,
        user_id: userId || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );

    if (projErr) {
      console.warn("Error guardando proyecto en Supabase:", projErr.message);
      return false;
    }

    if (project.tracks && project.tracks.length > 0) {
      const trackRows = project.tracks.map((t, idx) => ({
        id: t.id,
        project_id: project.id,
        title: t.title,
        artist: t.artist,
        prod: t.prod || null,
        bpm: t.bpm,
        musical_key: t.key,
        duration: t.duration,
        duration_sec: t.durationSec,
        version: t.version,
        glyph: t.glyph,
        audio_url: t.customAudioUrl || null,
        cover_url: t.coverUrl || project.coverUrl || null,
        order_index: idx,
      }));
      await supabase.from("tracks").upsert(trackRows, { onConflict: "id" });
    }

    return true;
  } catch (err) {
    console.warn("Fallo saveProjectToSupabase:", err);
    return false;
  }
}

// ==================== DB: ACTUALIZAR PORTADA DE UN PROYECTO ====================
export async function updateProjectCoverInSupabase(projectId: string, coverUrl: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("projects")
      .update({ cover_url: coverUrl, updated_at: new Date().toISOString() })
      .eq("id", projectId);
    if (error) {
      console.warn("Error actualizando cover en Supabase:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("Fallo updateProjectCoverInSupabase:", err);
    return false;
  }
}

// ==================== DB: GUARDAR O ACTUALIZAR TRACK INDIVIDUAL ====================
export async function saveTrackToSupabase(projectId: string, track: Track, orderIndex: number = 0): Promise<boolean> {
  try {
    const { error } = await supabase.from("tracks").upsert(
      {
        id: track.id,
        project_id: projectId,
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
        audio_url: track.customAudioUrl || null,
        cover_url: track.coverUrl || null,
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
    const { error } = await supabase.from("tracks").delete().eq("id", trackId);
    if (error) {
      console.warn("Error eliminando track de Supabase:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("Fallo deleteTrackFromSupabase:", err);
    return false;
  }
}

// ==================== DB: ELIMINAR PROYECTO ====================
export async function deleteProjectFromSupabase(projectId: string): Promise<boolean> {
  try {
    const { error } = await supabase.from("projects").delete().eq("id", projectId);
    if (error) {
      console.warn("Error eliminando proyecto de Supabase:", error.message);
      return false;
    }
    return true;
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
    if (isSaved) {
      await supabase.from("saved_projects").upsert({ user_id: userId, project_id: projectId });
    } else {
      await supabase.from("saved_projects").delete().eq("user_id", userId).eq("project_id", projectId);
    }
  } catch (err) {
    console.warn("toggleSavedProjectInSupabase warn:", err);
  }
}


