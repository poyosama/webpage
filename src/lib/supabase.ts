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
