import { ADMIN_IDS, r2Config, r2Missing, r2Exists, r2Put, SUPABASE_ANON, SUPABASE_BUCKET, SUPABASE_URL, userFromRequest } from "@/lib/r2Server";

export const maxDuration = 60;

const PREFIXES = ["tracks", "covers", "videos", "avatars", "originals"];

async function listAll(): Promise<{ name: string; type: string }[]> {
  const out: { name: string; type: string }[] = [];
  for (const prefix of PREFIXES) {
    for (let offset = 0; offset < 20000; offset += 1000) {
      const r = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${SUPABASE_BUCKET}`, {
        method: "POST",
        headers: { apikey: SUPABASE_ANON, authorization: `Bearer ${SUPABASE_ANON}`, "content-type": "application/json" },
        body: JSON.stringify({ prefix, limit: 1000, offset, sortBy: { column: "name", order: "asc" } }),
      });
      if (!r.ok) break;
      const items = (await r.json()) as { name: string; id: string | null; metadata?: { mimetype?: string } }[];
      items.filter((it) => it.id).forEach((it) => out.push({ name: `${prefix}/${it.name}`, type: it.metadata?.mimetype || "" }));
      if (items.length < 1000) break;
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Copia (de a tandas) los archivos de Supabase Storage a R2 con la misma ruta. Solo admins. */
export async function POST(request: Request) {
  if (!r2Config()) {
    const missing = r2Missing();
    return Response.json(
      { error: `Faltan en este deploy: ${missing.join(", ") || "(ninguna: revisá que los valores no estén vacíos)"}. Cargalas en Vercel y hacé Redeploy.` },
      { status: 503 }
    );
  }
  const user = await userFromRequest(request);
  if (!user || !ADMIN_IDS.has(user.id)) return Response.json({ error: "solo admin" }, { status: 403 });
  let body: { cursor?: number; batch?: number } = {};
  try {
    body = await request.json();
  } catch {}
  const files = await listAll();
  const start = Math.max(0, Number(body.cursor) || 0);
  const batch = Math.min(12, Math.max(1, Number(body.batch) || 6));
  const slice = files.slice(start, start + batch);
  let copied = 0;
  let skipped = 0;
  const errors: string[] = [];
  for (const f of slice) {
    try {
      if (await r2Exists(f.name)) {
        skipped++;
        continue;
      }
      const src = await fetch(`${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_BUCKET}/${f.name.split("/").map(encodeURIComponent).join("/")}`);
      if (!src.ok) {
        errors.push(`${f.name}: HTTP ${src.status}`);
        continue;
      }
      const ok = await r2Put(f.name, await src.arrayBuffer(), src.headers.get("content-type") || f.type);
      if (ok) copied++;
      else errors.push(`${f.name}: no se pudo subir a R2`);
    } catch (e) {
      errors.push(`${f.name}: ${(e as Error).message}`);
    }
  }
  const next = start + slice.length;
  return Response.json({ total: files.length, next, done: next >= files.length, copied, skipped, errors });
}
