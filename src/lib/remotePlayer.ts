"use client";

/**
 * Control remoto entre dispositivos (tipo Spotify Connect) con Supabase Realtime.
 * - Cada dispositivo abierto con la misma cuenta se anuncia en el canal `player:<userId>` (presencia).
 * - Uno es el que SUENA (activeDeviceId); los demás son control remoto.
 * - El que suena manda su estado (`state`) y los controles mandan órdenes (`cmd`).
 * No usa tablas: todo viaja por el canal en vivo.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export type RemoteDevice = { deviceId: string; name: string; isMe: boolean };

export type RemoteState = {
  deviceId: string;
  trackId: string;
  projectId: string;
  title: string;
  artist: string;
  cover?: string;
  isPlaying: boolean;
  position: number;
  duration: number;
  volume: number;
  at: number;
};

export type RemoteCommand =
  | { action: "toggle" }
  | { action: "next" }
  | { action: "prev" }
  | { action: "seek"; sec: number }
  | { action: "volume"; value: number }
  | { action: "play_track"; trackId: string; projectId: string }
  | { action: "transfer"; trackId: string; projectId: string; position: number; playing: boolean }
  | { action: "pause_local" };

function getDeviceId(): string {
  try {
    let id = localStorage.getItem("eltablero_device_id");
    if (!id) {
      id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
      localStorage.setItem("eltablero_device_id", id);
    }
    return id;
  } catch {
    return Math.random().toString(36).slice(2, 10);
  }
}

function getDeviceName(): string {
  if (typeof navigator === "undefined") return "Este dispositivo";
  const ua = navigator.userAgent;
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return "iPad";
  if (/Android/i.test(ua)) return /Mobile/i.test(ua) ? "Celular Android" : "Tablet Android";
  if (/Macintosh/i.test(ua)) return "Mac";
  if (/Windows/i.test(ua)) return "Compu (Windows)";
  if (/Linux/i.test(ua)) return "Compu (Linux)";
  return "Navegador";
}

export function useRemotePlayer({
  userId,
  getLocalState,
  onCommand,
}: {
  userId: string | null | undefined;
  /** Estado actual de ESTE dispositivo (se manda cuando es el que suena) */
  getLocalState: () => Omit<RemoteState, "deviceId" | "at"> | null;
  /** Ejecutar una orden que llegó de otro dispositivo (solo si este es el que suena) */
  onCommand: (cmd: RemoteCommand) => void;
}) {
  const [myDeviceId] = useState<string>(() => (typeof window === "undefined" ? "ssr" : getDeviceId()));
  const myName = useRef<string>(typeof window === "undefined" ? "" : getDeviceName());
  const [devices, setDevices] = useState<RemoteDevice[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState<string | null>(null);
  const [remoteState, setRemoteState] = useState<RemoteState | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const getLocalRef = useRef(getLocalState);
  const onCmdRef = useRef(onCommand);
  getLocalRef.current = getLocalState;
  onCmdRef.current = onCommand;
  const activeRef = useRef<string | null>(null);
  activeRef.current = activeDeviceId;

  useEffect(() => {
    if (!userId || typeof window === "undefined") return;
    const ch = supabase.channel(`player:${userId}`, {
      config: { presence: { key: myDeviceId }, broadcast: { self: false } },
    });
    channelRef.current = ch;

    ch.on("presence", { event: "sync" }, () => {
      const st = ch.presenceState() as Record<string, { name?: string }[]>;
      const list: RemoteDevice[] = Object.entries(st).map(([deviceId, metas]) => ({
        deviceId,
        name: metas?.[0]?.name || "Dispositivo",
        isMe: deviceId === myDeviceId,
      }));
      list.sort((a, b) => (a.isMe ? -1 : b.isMe ? 1 : a.name.localeCompare(b.name)));
      setDevices(list);
      // si el que sonaba se fue, vuelve a sonar acá
      if (activeRef.current && !st[activeRef.current]) {
        setActiveDeviceId(null);
        setRemoteState(null);
      }
    });

    ch.on("broadcast", { event: "state" }, ({ payload }) => {
      const s = payload as RemoteState;
      if (!s || s.deviceId === myDeviceId) return;
      // Ya lo seguimos: actualizar lo que muestra el control remoto
      if (activeRef.current === s.deviceId) {
        setRemoteState(s);
        return;
      }
      // Si ESTE dispositivo está sonando, no se lo cede a nadie por un simple "state"
      // (solo con claim / transfer explícitos). Evita que dos dispositivos se pisen.
      const mine = getLocalRef.current();
      if (mine?.isPlaying) return;
      if (s.isPlaying && !activeRef.current) {
        setActiveDeviceId(s.deviceId);
        setRemoteState(s);
      }
    });

    ch.on("broadcast", { event: "cmd" }, ({ payload }) => {
      const { target, cmd } = (payload || {}) as { target: string; cmd: RemoteCommand };
      if (target !== myDeviceId || !cmd) return;
      if (cmd.action === "transfer") {
        setActiveDeviceId(null);
        setRemoteState(null);
      }
      onCmdRef.current(cmd);
    });

    ch.on("broadcast", { event: "claim" }, ({ payload }) => {
      // otro dispositivo empezó a sonar: este deja de ser el activo
      const { deviceId } = (payload || {}) as { deviceId: string };
      if (deviceId && deviceId !== myDeviceId) {
        onCmdRef.current({ action: "pause_local" });
        setActiveDeviceId(deviceId);
      }
    });

    ch.subscribe((status) => {
      if (status === "SUBSCRIBED") void ch.track({ name: myName.current, at: Date.now() });
    });

    return () => {
      void supabase.removeChannel(ch);
      channelRef.current = null;
    };
  }, [userId, myDeviceId]);

  /** ¿Este dispositivo es un control remoto de otro? */
  const controlling = Boolean(activeDeviceId && activeDeviceId !== myDeviceId);

  // El que suena publica su estado cada 2 s
  useEffect(() => {
    if (!userId || controlling) return;
    const send = () => {
      const s = getLocalRef.current();
      const ch = channelRef.current;
      if (!s || !ch) return;
      void ch.send({ type: "broadcast", event: "state", payload: { ...s, deviceId: myDeviceId, at: Date.now() } });
    };
    const id = window.setInterval(send, 2000);
    return () => window.clearInterval(id);
  }, [userId, controlling, myDeviceId]);

  const publishNow = useCallback(() => {
    const s = getLocalRef.current();
    const ch = channelRef.current;
    if (!s || !ch) return;
    void ch.send({ type: "broadcast", event: "state", payload: { ...s, deviceId: myDeviceId, at: Date.now() } });
  }, [myDeviceId]);

  const sendCmd = useCallback(
    (cmd: RemoteCommand) => {
      const ch = channelRef.current;
      if (!ch || !activeRef.current) return;
      void ch.send({ type: "broadcast", event: "cmd", payload: { target: activeRef.current, cmd } });
    },
    []
  );

  /** Pasar la música a otro dispositivo (o traerla a este con myDeviceId) */
  const transferTo = useCallback(
    (deviceId: string, current: { trackId: string; projectId: string; position: number; playing: boolean } | null) => {
      const ch = channelRef.current;
      if (!ch) return;
      if (deviceId === myDeviceId) {
        // traer la música acá: el resto se entera con "claim"
        setActiveDeviceId(null);
        setRemoteState(null);
        void ch.send({ type: "broadcast", event: "claim", payload: { deviceId: myDeviceId } });
        return;
      }
      if (!current) return;
      void ch.send({
        type: "broadcast",
        event: "cmd",
        payload: { target: deviceId, cmd: { action: "transfer", ...current } as RemoteCommand },
      });
      setActiveDeviceId(deviceId);
    },
    [myDeviceId]
  );

  /** Avisar que este dispositivo empezó a sonar (los demás pasan a control remoto) */
  const claim = useCallback(() => {
    const ch = channelRef.current;
    if (!ch) return;
    if (activeRef.current && activeRef.current !== myDeviceId) {
      setActiveDeviceId(null);
      setRemoteState(null);
    }
    void ch.send({ type: "broadcast", event: "claim", payload: { deviceId: myDeviceId } });
  }, [myDeviceId]);

  return { myDeviceId, devices, activeDeviceId, controlling, remoteState, sendCmd, transferTo, claim, publishNow };
}
