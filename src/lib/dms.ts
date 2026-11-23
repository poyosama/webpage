"use client";

/** Mensajes directos: conversaciones de a 2 o grupos (hasta 10), texto y tracks compartidos. */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";

export type DmPolicy = "everyone" | "followers" | "friends" | "nobody";
export type DmPerson = { id: string; handle: string | null; name: string | null; avatar_url: string | null };
export type DmThread = {
  thread_id: string;
  is_group: boolean;
  title: string | null;
  last_message_at: string;
  members: DmPerson[];
  last_body: string | null;
  last_track_title: string | null;
  last_sender: string | null;
  unread: number;
};
/** Track compartido: foto del momento + link para abrirlo aunque no lo tengas en tu biblioteca */
export type DmTrack = {
  /** "project" = se compartió el proyecto entero (sin kind = un track) */
  kind?: "project";
  trackCount?: number;
  trackId: string;
  projectId: string;
  title: string;
  artist: string;
  cover?: string | null;
  projectTitle?: string | null;
  url?: string | null;
};
export type DmMessage = { id: string; thread_id: string; sender_id: string | null; body: string | null; track: DmTrack | null; created_at: string };

const errMsg = (e: { message?: string } | null) => (e?.message || "Algo falló").replace(/^.*?ERROR:\s*/, "");

export async function fetchInbox(): Promise<DmThread[] | null> {
  const { data, error } = await supabase.rpc("dm_inbox");
  return error ? null : ((data || []) as DmThread[]);
}
export async function openDm(userId: string): Promise<{ id?: string; error?: string }> {
  const { data, error } = await supabase.rpc("dm_open", { p_user: userId });
  return error ? { error: errMsg(error) } : { id: data as string };
}
export async function createGroup(userIds: string[], title: string): Promise<{ id?: string; error?: string }> {
  const { data, error } = await supabase.rpc("dm_create_group", { p_users: userIds, p_title: title || null });
  return error ? { error: errMsg(error) } : { id: data as string };
}
export async function leaveThread(threadId: string) {
  await supabase.rpc("dm_leave", { p_thread: threadId });
}
export async function renameThread(threadId: string, title: string) {
  await supabase.rpc("dm_rename", { p_thread: threadId, p_title: title });
}
export async function fetchMessages(threadId: string, limit = 80): Promise<DmMessage[]> {
  const { data } = await supabase
    .from("dm_messages")
    .select("id, thread_id, sender_id, body, track, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return ((data || []) as DmMessage[]).reverse();
}
export async function sendMessage(
  threadId: string,
  senderId: string,
  content: { body?: string; track?: DmTrack }
): Promise<{ msg?: DmMessage; error?: string }> {
  const body = content.body?.trim().slice(0, 2000) || null;
  const { data, error } = await supabase
    .from("dm_messages")
    .insert({ thread_id: threadId, sender_id: senderId, body, track: content.track || null })
    .select("id, thread_id, sender_id, body, track, created_at")
    .single();
  return error ? { error: errMsg(error) } : { msg: data as DmMessage };
}
export async function markRead(threadId: string, userId: string) {
  await supabase.from("dm_members").update({ last_read_at: new Date().toISOString() }).eq("thread_id", threadId).eq("user_id", userId);
}
export async function searchPeople(q: string, meId: string): Promise<DmPerson[]> {
  const clean = q.trim().replace(/^@+/, "").replace(/[%_,()]/g, "");
  if (clean.length < 1) return [];
  const { data } = await supabase
    .from("profiles")
    .select("id, handle, name, avatar_url")
    .or(`handle.ilike.%${clean}%,name.ilike.%${clean}%`)
    .neq("id", meId)
    .limit(8);
  return (data || []) as DmPerson[];
}
export async function getDmPolicy(userId: string): Promise<DmPolicy> {
  const { data } = await supabase.from("profiles").select("dm_policy").eq("id", userId).maybeSingle();
  return ((data as { dm_policy?: DmPolicy } | null)?.dm_policy || "friends") as DmPolicy;
}
export async function setDmPolicy(userId: string, policy: DmPolicy): Promise<boolean> {
  const { error } = await supabase.from("profiles").update({ dm_policy: policy }).eq("id", userId);
  return !error;
}

/** Bandeja + mensajes en vivo (Realtime: cada uno recibe solo los de sus conversaciones) */
export function useDmInbox(meId: string | null) {
  const [threads, setThreads] = useState<DmThread[]>([]);
  const [lastIncoming, setLastIncoming] = useState<DmMessage | null>(null);
  const timer = useRef<number | null>(null);

  const reload = useCallback(async () => {
    if (!meId) return;
    const t = await fetchInbox();
    if (t) setThreads(t);
  }, [meId]);

  useEffect(() => {
    if (!meId) {
      setThreads([]);
      return;
    }
    void reload();
    const ch = supabase
      .channel(`dm-inbox:${meId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "dm_messages" }, (payload) => {
        const m = payload.new as DmMessage;
        setLastIncoming(m);
        // la bandeja se recarga (agrupando ráfagas)
        if (timer.current) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => void reload(), 400);
      })
      .subscribe();
    // por si Realtime se corta: cada 60 s con la pestaña visible
    const id = window.setInterval(() => document.visibilityState === "visible" && void reload(), 60000);
    return () => {
      window.clearInterval(id);
      void supabase.removeChannel(ch);
    };
  }, [meId, reload]);

  const unread = threads.reduce((n, t) => n + (t.unread || 0), 0);
  return { threads, unread, reload, lastIncoming, setThreads };
}

export function threadName(t: Pick<DmThread, "is_group" | "title" | "members">): string {
  if (t.title) return t.title;
  const names = t.members.map((m) => (m.handle ? `@${m.handle.replace(/^@+/, "")}` : m.name || "?"));
  if (!t.is_group) return names[0] || "Conversación";
  return names.length > 3 ? `${names.slice(0, 3).join(", ")} y ${names.length - 3} más` : names.join(", ");
}
