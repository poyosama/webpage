import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import App from "@/components/App";

/**
 * Link de proyecto (/project/:id): la app es la misma, pero acá se arma la VISTA PREVIA que muestran
 * WhatsApp, Discord, iMessage o Instagram (tapa, título, artista). Solo de proyectos públicos.
 */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://txhrbfgejcwmmurriccw.supabase.co";
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_UvC4vGCFOnN0FGbRAux0nw_wneVnyhC";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ProjectMeta = { title: string; type: string; cover_url: string | null; tracks: number; artist: string };

async function getProjectMeta(id: string): Promise<ProjectMeta | null> {
  "use cache";
  if (!UUID_RE.test(id)) return null;
  try {
    const url = `${SUPABASE_URL}/rest/v1/projects?id=eq.${id}&select=title,type,cover_url,artist,profiles(handle,name),tracks(count)`;
    const r = await fetch(url, { headers: { apikey: SUPABASE_ANON, authorization: `Bearer ${SUPABASE_ANON}` } });
    if (!r.ok) return null;
    const rows = (await r.json()) as Array<{
      title: string;
      type: string;
      cover_url: string | null;
      artist: string;
      profiles?: { handle?: string; name?: string } | null;
      tracks?: { count: number }[];
    }>;
    const p = rows[0]; // con la clave pública solo se ven proyectos públicos
    if (!p) return null;
    return {
      title: p.title,
      type: p.type,
      cover_url: p.cover_url,
      tracks: p.tracks?.[0]?.count ?? 0,
      artist: p.profiles?.handle || p.profiles?.name || p.artist || "El tablero",
    };
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const p = await getProjectMeta(id);
  if (!p) return { title: "El tablero." };
  const title = `${p.title} — ${p.artist}`;
  const description = `${p.type} · ${p.tracks} ${p.tracks === 1 ? "track" : "tracks"} · Escuchalo en El tablero.`;
  const images = p.cover_url ? [{ url: p.cover_url, width: 1200, height: 1200, alt: p.title }] : [{ url: "/icon.png", width: 512, height: 512 }];
  return {
    title,
    description,
    openGraph: { title, description, images, type: "music.album", url: `/project/${id}`, siteName: "El tablero." },
    twitter: { card: p.cover_url ? "summary_large_image" : "summary", title, description, images: images.map((i) => i.url) },
  };
}

// La vista previa depende del id de la dirección: esta página se arma en cada pedido
const Connection = async () => {
  await connection();
  return null;
};

export default function ProjectPage() {
  return (
    <>
      <App />
      <Suspense>
        <Connection />
      </Suspense>
    </>
  );
}
