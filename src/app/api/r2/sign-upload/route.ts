import { presignPut, r2Config, userFromRequest } from "@/lib/r2Server";

const FOLDERS = new Set(["tracks", "covers", "videos", "avatars", "originals"]);

/** El navegador pide permiso para subir un archivo a R2: devuelve una URL firmada (PUT) y la URL pública */
export async function POST(request: Request) {
  const cfg = r2Config();
  if (!cfg) return Response.json({ error: "r2-off" }, { status: 503 });
  const user = await userFromRequest(request);
  if (!user) return Response.json({ error: "login" }, { status: 401 });
  let body: { folder?: string; ext?: string } = {};
  try {
    body = await request.json();
  } catch {}
  const folder = FOLDERS.has(String(body.folder)) ? String(body.folder) : "covers";
  const ext = String(body.ext || "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 6) || "bin";
  const key = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const uploadUrl = await presignPut(key);
  if (!uploadUrl) return Response.json({ error: "firma" }, { status: 500 });
  return Response.json({ uploadUrl, publicUrl: `${cfg.publicUrl}/${key}`, key });
}
