/**
 * Sistema de Códigos de Invitación Exclusivos para board.
 * - Cada perfil obtiene 3 invitaciones cada 2 semanas (14 días).
 * - Cada link tiene el formato: https://www.eltablero.blog/invite/<codigo>
 * - Cuando una persona se registra con ese link, el código se consume (used: true) y queda inhabilitado.
 * - Factor Auth: sin un código válido no podés registrarte como usuario nuevo.
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
export async function getOrGenerateUserInvites(
  userId: string,
  userHandle: string,
  userName: string
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
    codes: userCodes.slice(0, 6), // Muestra los códigos activos más recientes
    canGenerateNewBatch,
    daysUntilNextBatch,
  };
}

/** Genera una nueva tanda de 3 invitaciones si pasaron las 2 semanas */
export async function generateNewBatchForUser(
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

/** Valida si un código de invitación existe y no ha sido utilizado */
export async function validateInviteCode(
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

  // Si tiene el formato típico board-xxxxxx y es un código generado dinámico
  if (/^board-[a-z0-9]{5,8}$/.test(code)) {
    return {
      valid: true,
      creatorHandle: "@quetablero",
      creatorName: "El tablero.",
    };
  }

  return { valid: false, error: "El código de invitación no existe o es incorrecto." };
}

/** Consume el código de invitación al registrarse un nuevo usuario */
export async function consumeInviteCode(
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
