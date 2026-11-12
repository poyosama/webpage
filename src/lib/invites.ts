/**
 * Sistema de Códigos de Invitación Exclusivos para board.
 * - Cada perfil obtiene 3 invitaciones cada 2 semanas (14 días).
 * - Cada link tiene el formato: https://www.eltablero.blog/invite/<codigo>
 * - Cuando una persona se registra con ese link, el código se consume (used: true) y queda inhabilitado.
 * - Factor Auth: sin un código válido no podés registrarte como usuario nuevo.
 *
 * SERVIDOR (supabase/migration_invites.sql): los pases viven en public.invite_codes y se
 * crean/validan/gastan con funciones RPC security definer. Si la migración todavía no se
 * corrió (la RPC no existe), se usa el sistema viejo (legacy_*) para no romper nada.
 */

import { supabase } from "./supabase";

export interface InviteCodeItem {
  code: string;
  creatorId: string;
  creatorHandle: string;
  creatorName: string;
  createdAt: string;
  batchDate: string;
  used: boolean;
  usedByUserId?: string;
  usedByHandle?: string;
  usedAt?: string;
}

const STORAGE_INVITES_KEY = "board_user_invites_v1";
const STORAGE_GLOBAL_REGISTRY_KEY = "board_global_invite_registry_v1";
const PENDING_INVITE_KEY = "board_pending_invite_code";
const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;

// Códigos semilla fundacionales (siempre válidos como respaldo VIP)
const SEED_INVITES: Record<string, { creatorHandle: string; creatorName: string }> = {
  "board-poyo": { creatorHandle: "@poyo", creatorName: "poyo" },
  "board-vip": { creatorHandle: "@poyo", creatorName: "El tablero." },
  "board-alpha": { creatorHandle: "@poyo", creatorName: "El tablero." },
  "board-5056": { creatorHandle: "@poyo", creatorName: "5056" },
};

/** Cuentas (email de Google) con pases de invitación ilimitados */
const UNLIMITED_INVITE_EMAILS = ["jpizarrograndinetti@gmail.com"];

export function hasUnlimitedInvites(email?: string | null): boolean {
  const e = (email || "").trim().toLowerCase();
  return !!e && UNLIMITED_INVITE_EMAILS.includes(e);
}

/**
 * Chequeo verificado: pregunta al servidor de Auth de Supabase (getUser valida el JWT),
 * así no alcanza con editar el email del perfil local o el localStorage.
 */
async function legacy_verifyUnlimitedInvites(): Promise<boolean> {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user) return false;
    const provider = (data.user.app_metadata as { provider?: string } | undefined)?.provider;
    if (provider && provider !== "google") return false;
    return hasUnlimitedInvites(data.user.email);
  } catch {
    return false;
  }
}

/** Genera una cadena alfanumérica corta y limpia de 6 caracteres */
function generateCleanCodeSlug(): string {
  const chars = "23456789abcdefghjkmnpqrstuvwxyz";
  let slug = "";
  for (let i = 0; i < 6; i++) {
    slug += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `board-${slug}`;
}

/** Lee el registro local de invitaciones */
function readGlobalRegistry(): Record<string, InviteCodeItem> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_GLOBAL_REGISTRY_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** Guarda en el registro local de invitaciones */
function writeGlobalRegistry(reg: Record<string, InviteCodeItem>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_GLOBAL_REGISTRY_KEY, JSON.stringify(reg));
  } catch {}
}

/** Obtiene o genera los 3 códigos de invitación para un usuario en la quincena actual */
async function legacy_getOrGenerateUserInvites(
  userId: string,
  userHandle: string,
  userName: string,
  unlimited = false
): Promise<{
  codes: InviteCodeItem[];
  canGenerateNewBatch: boolean;
  daysUntilNextBatch: number;
}> {
  if (!userId) {
    return { codes: [], canGenerateNewBatch: false, daysUntilNextBatch: 14 };
  }

  const cleanHandle = userHandle.startsWith("@") ? userHandle : `@${userHandle || "artista"}`;
  const now = Date.now();
  const registry = readGlobalRegistry();

  // Buscar invitaciones existentes de este usuario
  let userCodes = Object.values(registry).filter((inv) => inv.creatorId === userId);

  // Intentar leer de Supabase si la tabla o campo profiles.invite_codes existe
  try {
    const { data } = await supabase
      .from("profiles")
      .select("invite_codes")
      .eq("id", userId)
      .maybeSingle();

    if (Array.isArray(data?.invite_codes) && data.invite_codes.length > 0) {
      const merged = new Map<string, InviteCodeItem>();
      userCodes.forEach((c) => merged.set(c.code.toLowerCase(), c));
      data.invite_codes.forEach((c: InviteCodeItem) => merged.set(c.code.toLowerCase(), c));
      userCodes = Array.from(merged.values());
    }
  } catch {
    // ignore
  }

  // Ordenar por fecha de creación descendente
  userCodes.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

  const latestBatch = userCodes[0];
  const latestBatchTime = latestBatch ? new Date(latestBatch.batchDate || latestBatch.createdAt).getTime() : 0;
  const timeSinceLatest = now - latestBatchTime;
  const canGenerateNewBatch = userCodes.length === 0 || timeSinceLatest >= TWO_WEEKS_MS;
  const daysUntilNextBatch = Math.max(0, Math.ceil((TWO_WEEKS_MS - timeSinceLatest) / (24 * 60 * 60 * 1000)));

  // Si no tiene códigos aún, generar la primera tanda de 3 de inmediato
  if (userCodes.length === 0) {
    const batchDate = new Date().toISOString();
    const newBatch: InviteCodeItem[] = [
      {
        code: generateCleanCodeSlug(),
        creatorId: userId,
        creatorHandle: cleanHandle,
        creatorName: userName,
        createdAt: new Date().toISOString(),
        batchDate,
        used: false,
      },
      {
        code: generateCleanCodeSlug(),
        creatorId: userId,
        creatorHandle: cleanHandle,
        creatorName: userName,
        createdAt: new Date().toISOString(),
        batchDate,
        used: false,
      },
      {
        code: generateCleanCodeSlug(),
        creatorId: userId,
        creatorHandle: cleanHandle,
        creatorName: userName,
        createdAt: new Date().toISOString(),
        batchDate,
        used: false,
      },
    ];

    newBatch.forEach((c) => {
      registry[c.code.toLowerCase()] = c;
    });
    writeGlobalRegistry(registry);

    // Intentar persistir en Supabase
    try {
      await supabase
        .from("profiles")
        .update({ invite_codes: newBatch })
        .eq("id", userId);
    } catch {}

    return {
      codes: newBatch,
      canGenerateNewBatch: false,
      daysUntilNextBatch: 14,
    };
  }

  return {
    codes: unlimited ? userCodes : userCodes.slice(0, 6), // Muestra los códigos activos más recientes
    canGenerateNewBatch,
    daysUntilNextBatch,
  };
}

/** Genera una nueva tanda de 3 invitaciones si pasaron las 2 semanas */
async function legacy_generateNewBatchForUser(
  userId: string,
  userHandle: string,
  userName: string
): Promise<InviteCodeItem[]> {
  const cleanHandle = userHandle.startsWith("@") ? userHandle : `@${userHandle || "artista"}`;
  const registry = readGlobalRegistry();
  const batchDate = new Date().toISOString();

  const newCodes: InviteCodeItem[] = [
    {
      code: generateCleanCodeSlug(),
      creatorId: userId,
      creatorHandle: cleanHandle,
      creatorName: userName,
      createdAt: new Date().toISOString(),
      batchDate,
      used: false,
    },
    {
      code: generateCleanCodeSlug(),
      creatorId: userId,
      creatorHandle: cleanHandle,
      creatorName: userName,
      createdAt: new Date().toISOString(),
      batchDate,
      used: false,
    },
    {
      code: generateCleanCodeSlug(),
      creatorId: userId,
      creatorHandle: cleanHandle,
      creatorName: userName,
      createdAt: new Date().toISOString(),
      batchDate,
      used: false,
    },
  ];

  newCodes.forEach((c) => {
    registry[c.code.toLowerCase()] = c;
  });
  writeGlobalRegistry(registry);

  // Guardar en Supabase
  try {
    const existing = Object.values(registry).filter((x) => x.creatorId === userId);
    await supabase
      .from("profiles")
      .update({ invite_codes: existing })
      .eq("id", userId);
  } catch {}

  return newCodes;
}

/** Cuentas con pases ilimitados: genera `count` códigos nuevos sin esperar los 14 días */
async function legacy_generateExtraInvitesForUser(
  userId: string,
  userHandle: string,
  userName: string,
  count = 1
): Promise<InviteCodeItem[]> {
  // Solo cuentas verificadas por el servidor de Auth pueden saltarse el límite
  if (!(await legacy_verifyUnlimitedInvites())) {
    return Object.values(readGlobalRegistry())
      .filter((x) => x.creatorId === userId)
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  }
  const cleanHandle = userHandle.startsWith("@") ? userHandle : `@${userHandle || "artista"}`;
  const registry = readGlobalRegistry();
  const now = new Date().toISOString();
  const n = Math.max(1, Math.min(20, Math.floor(count)));

  for (let i = 0; i < n; i++) {
    let code = generateCleanCodeSlug();
    while (registry[code.toLowerCase()]) code = generateCleanCodeSlug();
    registry[code.toLowerCase()] = {
      code,
      creatorId: userId,
      creatorHandle: cleanHandle,
      creatorName: userName,
      createdAt: now,
      batchDate: now,
      used: false,
    };
  }
  writeGlobalRegistry(registry);

  const all = Object.values(registry)
    .filter((x) => x.creatorId === userId)
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

  // Persistencia en segundo plano: los códigos ya quedaron en el registro local
  void Promise.resolve(supabase.from("profiles").update({ invite_codes: all }).eq("id", userId)).catch(() => {});

  return all;
}

/** Valida si un código de invitación existe y no ha sido utilizado */
async function legacy_validateInviteCode(
  rawCode: string
): Promise<{ valid: boolean; creatorHandle?: string; creatorName?: string; error?: string }> {
  const code = (rawCode || "").trim().toLowerCase();
  if (!code) {
    return { valid: false, error: "Ingresá un código de invitación." };
  }

  // 1. Chequeo de códigos semilla VIP
  if (SEED_INVITES[code]) {
    return {
      valid: true,
      creatorHandle: SEED_INVITES[code].creatorHandle,
      creatorName: SEED_INVITES[code].creatorName,
    };
  }

  // 2. Chequeo en registro global local
  const registry = readGlobalRegistry();
  const found = registry[code];
  if (found) {
    if (found.used) {
      return {
        valid: false,
        error: `Este código de invitación ya fue utilizado por ${found.usedByHandle || "otro usuario"}.`,
      };
    }
    return {
      valid: true,
      creatorHandle: found.creatorHandle,
      creatorName: found.creatorName,
    };
  }

  // 3. Chequeo en Supabase (buscando en profiles.invite_codes)
  try {
    const { data } = await supabase
      .from("profiles")
      .select("id, name, handle, invite_codes")
      .not("invite_codes", "is", null);

    if (Array.isArray(data)) {
      for (const p of data) {
        if (Array.isArray(p.invite_codes)) {
          const match = p.invite_codes.find(
            (inv: any) => (inv.code || "").trim().toLowerCase() === code
          );
          if (match) {
            // Guardar en cache local
            registry[code] = match;
            writeGlobalRegistry(registry);
            if (match.used) {
              return {
                valid: false,
                error: `Este código de invitación ya fue utilizado por ${match.usedByHandle || "otro usuario"}.`,
              };
            }
            return {
              valid: true,
              creatorHandle: match.creatorHandle || p.handle,
              creatorName: match.creatorName || p.name,
            };
          }
        }
      }
    }
  } catch {}


  return { valid: false, error: "El código de invitación no existe o es incorrecto." };
}

/** Consume el código de invitación al registrarse un nuevo usuario */
async function legacy_consumeInviteCode(
  rawCode: string,
  newUserId: string,
  newUserHandle: string
): Promise<boolean> {
  const code = (rawCode || "").trim().toLowerCase();
  if (!code) return false;

  const registry = readGlobalRegistry();
  const existing = registry[code];

  const updated: InviteCodeItem = existing || {
    code,
    creatorId: "seed",
    creatorHandle: SEED_INVITES[code]?.creatorHandle || "@quetablero",
    creatorName: SEED_INVITES[code]?.creatorName || "El tablero.",
    createdAt: new Date().toISOString(),
    batchDate: new Date().toISOString(),
    used: true,
  };

  updated.used = true;
  updated.usedByUserId = newUserId;
  updated.usedByHandle = newUserHandle.startsWith("@") ? newUserHandle : `@${newUserHandle}`;
  updated.usedAt = new Date().toISOString();

  registry[code] = updated;
  writeGlobalRegistry(registry);

  // Limpiar el pending invite en localStorage
  try {
    localStorage.removeItem(PENDING_INVITE_KEY);
  } catch {}

  // Si pertenecía a un usuario en Supabase, actualizar su perfil
  if (updated.creatorId && updated.creatorId !== "seed") {
    try {
      const { data } = await supabase
        .from("profiles")
        .select("invite_codes")
        .eq("id", updated.creatorId)
        .maybeSingle();

      if (Array.isArray(data?.invite_codes)) {
        const nextCodes = data.invite_codes.map((item: InviteCodeItem) =>
          item.code.toLowerCase() === code ? updated : item
        );
        await supabase
          .from("profiles")
          .update({ invite_codes: nextCodes })
          .eq("id", updated.creatorId);
      }
    } catch {}
  }

  return true;
}

/** Obtiene el código de invitación pendiente guardado en el navegador */
export function getPendingInviteCode(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(PENDING_INVITE_KEY);
  } catch {
    return null;
  }
}

/** Guarda un código de invitación pendiente en el navegador */
export function setPendingInviteCode(code: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PENDING_INVITE_KEY, code.trim().toLowerCase());
  } catch {}
}

/** Construye la URL completa del link de invitación */
export function buildInviteUrl(code: string): string {
  const origin =
    typeof window !== "undefined" && window.location.origin
      ? window.location.origin
      : "https://www.eltablero.blog";
  return `${origin}/invite/${encodeURIComponent(code)}`;
}


// =========================================================================
// SERVIDOR (Supabase RPC) con fallback al sistema viejo
// =========================================================================

type InviteRow = {
  code: string;
  creator_id: string | null;
  creator_handle: string | null;
  creator_name: string | null;
  created_at: string;
  used: boolean;
  used_by: string | null;
  used_by_handle: string | null;
  used_at: string | null;
};

let serverMode: boolean | null = null; // null = no sabemos todavía

function isMissingRpc(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return (
    error.code === "PGRST202" ||
    error.code === "PGRST205" ||
    error.code === "42883" ||
    error.code === "42P01" ||
    /could not find the function|does not exist|schema cache/i.test(error.message || "")
  );
}

function rowToItem(r: InviteRow): InviteCodeItem {
  return {
    code: r.code,
    creatorId: r.creator_id || "",
    creatorHandle: r.creator_handle || "",
    creatorName: r.creator_name || "",
    createdAt: r.created_at,
    batchDate: r.created_at,
    used: r.used,
    usedByUserId: r.used_by || undefined,
    usedByHandle: r.used_by_handle || undefined,
    usedAt: r.used_at || undefined,
  };
}

async function fetchMyServerCodes(userId: string): Promise<InviteCodeItem[] | null> {
  const { data, error } = await supabase
    .from("invite_codes")
    .select("*")
    .eq("creator_id", userId)
    .order("created_at", { ascending: false });
  if (error) {
    if (isMissingRpc(error)) serverMode = false;
    return null;
  }
  serverMode = true;
  return (data as InviteRow[]).map(rowToItem);
}

async function rpcCreate(count: number): Promise<{ codes: InviteCodeItem[] | null; error?: string }> {
  const { data, error } = await supabase.rpc("create_invite_codes", { p_count: count });
  if (error) {
    if (isMissingRpc(error)) {
      serverMode = false;
      return { codes: null };
    }
    return { codes: [], error: error.message };
  }
  serverMode = true;
  return { codes: ((data as InviteRow[]) || []).map(rowToItem) };
}

/** ¿La cuenta logueada tiene pases ilimitados? (lo decide el servidor) */
export async function verifyUnlimitedInvites(): Promise<boolean> {
  if (serverMode !== false) {
    const { data, error } = await supabase.rpc("invite_is_unlimited");
    if (!error) {
      serverMode = true;
      return data === true;
    }
    if (!isMissingRpc(error)) return false;
    serverMode = false;
  }
  return legacy_verifyUnlimitedInvites();
}

/** Lista (o crea la primera tanda de) los pases del usuario */
export async function getOrGenerateUserInvites(
  userId: string,
  userHandle: string,
  userName: string,
  unlimited = false
): Promise<{ codes: InviteCodeItem[]; canGenerateNewBatch: boolean; daysUntilNextBatch: number }> {
  if (!userId) return { codes: [], canGenerateNewBatch: false, daysUntilNextBatch: 14 };
  if (serverMode !== false) {
    let codes = await fetchMyServerCodes(userId);
    if (codes) {
      if (codes.length === 0) {
        const res = await rpcCreate(3);
        if (res.codes) codes = res.codes;
      }
      const latest = codes[0] ? new Date(codes[0].createdAt).getTime() : 0;
      const since = Date.now() - latest;
      return {
        codes: unlimited ? codes : codes.slice(0, 6),
        canGenerateNewBatch: codes.length === 0 || since >= TWO_WEEKS_MS,
        daysUntilNextBatch: Math.max(0, Math.ceil((TWO_WEEKS_MS - since) / 86400000)),
      };
    }
  }
  return legacy_getOrGenerateUserInvites(userId, userHandle, userName, unlimited);
}

/** Nueva tanda de 3 (el servidor controla los 14 días) */
export async function generateNewBatchForUser(
  userId: string,
  userHandle: string,
  userName: string
): Promise<InviteCodeItem[]> {
  if (serverMode !== false) {
    const res = await rpcCreate(3);
    if (res.codes) return res.codes.slice(0, 6);
  }
  return legacy_generateNewBatchForUser(userId, userHandle, userName);
}

/** Pases extra para cuentas ilimitadas (el servidor rechaza a cualquier otra cuenta) */
export async function generateExtraInvitesForUser(
  userId: string,
  userHandle: string,
  userName: string,
  count = 1
): Promise<InviteCodeItem[]> {
  if (serverMode !== false) {
    const res = await rpcCreate(count);
    if (res.codes) return res.codes;
  }
  return legacy_generateExtraInvitesForUser(userId, userHandle, userName, count);
}

/** Valida un código (existe y está sin usar) */
export async function validateInviteCode(
  rawCode: string
): Promise<{ valid: boolean; creatorHandle?: string; creatorName?: string; error?: string }> {
  const code = (rawCode || "").trim().toLowerCase();
  if (!code) return { valid: false, error: "Ingresá un código de invitación." };
  if (serverMode !== false) {
    const { data, error } = await supabase.rpc("validate_invite_code", { p_code: code });
    if (!error) {
      serverMode = true;
      const row = (Array.isArray(data) ? data[0] : data) as
        | { valid: boolean; creator_handle: string | null; creator_name: string | null; reason: string | null }
        | undefined;
      if (row?.valid) {
        return { valid: true, creatorHandle: row.creator_handle || undefined, creatorName: row.creator_name || undefined };
      }
      return { valid: false, error: row?.reason || "El código de invitación no existe o es incorrecto." };
    }
    if (!isMissingRpc(error)) return { valid: false, error: "No pudimos verificar el código. Probá de nuevo." };
    serverMode = false;
  }
  return legacy_validateInviteCode(code);
}

/**
 * Gasta el código para la cuenta logueada.
 * Devuelve "ok" | "invalid" (código inexistente/usado) | "legacy" (servidor sin migración: se usó el sistema viejo).
 */
export async function consumeInviteCode(
  rawCode: string,
  newUserId: string,
  newUserHandle: string
): Promise<"ok" | "invalid" | "legacy"> {
  const code = (rawCode || "").trim().toLowerCase();
  if (serverMode !== false) {
    const { data, error } = await supabase.rpc("consume_invite_code", { p_code: code });
    if (!error) {
      serverMode = true;
      if (data === true) {
        try {
          localStorage.removeItem(PENDING_INVITE_KEY);
        } catch {}
        return "ok";
      }
      return "invalid";
    }
    if (!isMissingRpc(error)) return "invalid";
    serverMode = false;
  }
  if (!code) return "invalid";
  await legacy_consumeInviteCode(code, newUserId, newUserHandle);
  return "legacy";
}

/** ¿Esta cuenta puede crear su perfil? (admin, cuenta previa o con pase gastado). null = servidor sin migración */
export async function canCreateProfile(): Promise<boolean | null> {
  const { data, error } = await supabase.rpc("invite_can_create_profile");
  if (error) return isMissingRpc(error) ? null : false;
  return data === true;
}
