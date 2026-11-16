import { AwsClient } from "aws4fetch";

/** Solo servidor: Cloudflare R2 (protocolo S3). Variables en Vercel: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
 *  R2_SECRET_ACCESS_KEY, R2_BUCKET, NEXT_PUBLIC_R2_PUBLIC_URL */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://txhrbfgejcwmmurriccw.supabase.co";
export const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_UvC4vGCFOnN0FGbRAux0nw_wneVnyhC";
export const SUPABASE_BUCKET = "el-tablero-media";

/** Nombres (nunca valores) de las variables de R2 que faltan en este deploy */
export function r2Missing(): string[] {
  const need = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "NEXT_PUBLIC_R2_PUBLIC_URL"];
  return need.filter((k) => !process.env[k]);
}

export function r2Config() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET || "eltablero-media";
  const publicUrl = (process.env.NEXT_PUBLIC_R2_PUBLIC_URL || "").replace(/\/+$/, "");
  if (!accountId || !accessKeyId || !secretAccessKey || !publicUrl) return null;
  return {
    client: new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: "auto" }),
    endpoint: `https://${accountId}.r2.cloudflarestorage.com/${bucket}`,
    publicUrl,
  };
}

const encKey = (key: string) => key.split("/").map(encodeURIComponent).join("/");

/** URL firmada para que el navegador suba un archivo con PUT (vence en `expires` segundos) */
export async function presignPut(key: string, expires = 900): Promise<string | null> {
  const cfg = r2Config();
  if (!cfg) return null;
  const url = new URL(`${cfg.endpoint}/${encKey(key)}`);
  url.searchParams.set("X-Amz-Expires", String(expires));
  const signed = await cfg.client.sign(new Request(url, { method: "PUT" }), { aws: { signQuery: true } });
  return signed.url;
}

export async function r2Exists(key: string): Promise<boolean> {
  const cfg = r2Config();
  if (!cfg) return false;
  const r = await cfg.client.fetch(`${cfg.endpoint}/${encKey(key)}`, { method: "HEAD" });
  return r.ok;
}

export async function r2Put(key: string, body: ArrayBuffer, contentType: string): Promise<boolean> {
  const cfg = r2Config();
  if (!cfg) return false;
  const r = await cfg.client.fetch(`${cfg.endpoint}/${encKey(key)}`, {
    method: "PUT",
    body,
    headers: { "content-type": contentType || "application/octet-stream" },
  });
  return r.ok;
}

/** Usuario de Supabase a partir del token de sesión (o null) */
export async function userFromRequest(req: Request): Promise<{ id: string; email?: string } | null> {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_ANON, authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  const u = await r.json();
  return u && u.id ? { id: u.id, email: u.email } : null;
}

/** Admins de El tablero (pueden correr la migración) */
export const ADMIN_IDS = new Set(["927df5ff-0c13-4088-abc7-52dbf9dbd41b"]);
