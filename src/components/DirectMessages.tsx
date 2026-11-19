"use client";

/**
 * Mensajes directos: bandeja, conversación (texto + tracks) y "nuevo mensaje / grupo" (hasta 10).
 * También sirve para mandar un track desde Compartir (pendingShare): elegís a quién y se manda.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { agoEs } from "@/lib/supabase";
import {
  createGroup,
  fetchMessages,
  leaveThread,
  markRead,
  openDm,
  renameThread,
  searchPeople,
  sendMessage,
  threadName,
  type DmMessage,
  type DmPerson,
  type DmThread,
  type DmTrack,
} from "@/lib/dms";

type View = { kind: "list" } | { kind: "thread"; id: string } | { kind: "new" };

const at = (h?: string | null) => (h ? `@${h.replace(/^@+/, "")}` : "");
const initial = (p: { name?: string | null; handle?: string | null }) => (p.name || p.handle || "?").replace(/^@+/, "").charAt(0).toUpperCase();

function Avatar({ p, size = 40 }: { p: DmPerson; size?: number }) {
  return (
    <span className="dm-avatar" style={{ width: size, height: size }}>
      {p.avatar_url ? <img src={p.avatar_url} alt="" /> : initial(p)}
    </span>
  );
}
function ThreadAvatar({ t }: { t: Pick<DmThread, "is_group" | "members"> }) {
  if (!t.is_group || t.members.length < 2) return t.members[0] ? <Avatar p={t.members[0]} /> : <span className="dm-avatar">?</span>;
  return (
    <span className="dm-avatar-group">
      <Avatar p={t.members[0]} size={28} />
      <Avatar p={t.members[1]} size={28} />
    </span>
  );
}
const timeShort = (iso: string) => new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });

export default function DirectMessages({
  open,
  onClose,
  meId,
  threads,
  reloadInbox,
  lastIncoming,
  startWith,
  onStartedWith,
  pendingShare,
  onShareDone,
  onPlayTrack,
  onOpenProfile,
}: {
  open: boolean;
  onClose: () => void;
  meId: string;
  threads: DmThread[];
  reloadInbox: () => Promise<void>;
  lastIncoming: DmMessage | null;
  /** Abrir directo la conversación con esta persona (desde su perfil) */
  startWith: DmPerson | null;
  onStartedWith: () => void;
  /** Track a mandar (desde Compartir) */
  pendingShare: DmTrack | null;
  onShareDone: () => void;
  onPlayTrack: (t: DmTrack) => void;
  onOpenProfile: (handle: string) => void;
}) {
  const [view, setView] = useState<View>({ kind: "list" });
  const [msgs, setMsgs] = useState<DmMessage[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [, setTick] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // nuevo mensaje / grupo
  const [q, setQ] = useState("");
  const [results, setResults] = useState<DmPerson[]>([]);
  const [picked, setPicked] = useState<DmPerson[]>([]);
  const [groupTitle, setGroupTitle] = useState("");

  const current = view.kind === "thread" ? threads.find((t) => t.thread_id === view.id) : undefined;
  const people = useMemo(() => {
    const map: Record<string, DmPerson> = {};
    threads.forEach((t) => t.members.forEach((m) => (map[m.id] = m)));
    return map;
  }, [threads]);

  useEffect(() => {
    if (!open) return;
    const t = window.setInterval(() => setTick((n) => n + 1), 30000);
    return () => window.clearInterval(t);
  }, [open]);

  // Cerrar = volver a la bandeja la próxima vez
  useEffect(() => {
    if (!open) {
      setView({ kind: "list" });
      setError("");
    }
  }, [open]);

  // Desde un perfil: abrir (o crear) la conversación con esa persona
  useEffect(() => {
    if (!open || !startWith) return;
    setError("");
    void openDm(startWith.id).then(async (r) => {
      onStartedWith();
      if (r.error) {
        setView({ kind: "list" });
        setError(r.error);
        return;
      }
      await reloadInbox();
      setView({ kind: "thread", id: r.id! });
    });
  }, [open, startWith, onStartedWith, reloadInbox]);

  // Cargar mensajes al entrar a una conversación
  useEffect(() => {
    if (view.kind !== "thread") return;
    let alive = true;
    setLoadingMsgs(true);
    setMsgs([]);
    void fetchMessages(view.id).then((m) => {
      if (!alive) return;
      setMsgs(m);
      setLoadingMsgs(false);
      void markRead(view.id, meId).then(() => reloadInbox());
    });
    window.setTimeout(() => inputRef.current?.focus(), 200);
    return () => {
      alive = false;
    };
  }, [view, meId, reloadInbox]);

  // Mensaje en vivo de la conversación abierta
  useEffect(() => {
    if (!lastIncoming || view.kind !== "thread" || lastIncoming.thread_id !== view.id) return;
    setMsgs((prev) => (prev.some((m) => m.id === lastIncoming.id) ? prev : [...prev, lastIncoming]));
    if (lastIncoming.sender_id !== meId && open) void markRead(view.id, meId);
  }, [lastIncoming, view, meId, open]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [msgs.length]);

  // Buscar gente
  useEffect(() => {
    if (view.kind !== "new") return;
    const t = window.setTimeout(() => void searchPeople(q, meId).then(setResults), 220);
    return () => window.clearTimeout(t);
  }, [q, view.kind, meId]);

  const send = async (threadId: string, content: { body?: string; track?: DmTrack }) => {
    const r = await sendMessage(threadId, meId, content);
    if (r.error) {
      setError(r.error);
      return false;
    }
    if (r.msg) setMsgs((prev) => (prev.some((m) => m.id === r.msg!.id) ? prev : [...prev, r.msg!]));
    void reloadInbox();
    return true;
  };

  const sendDraft = async () => {
    if (view.kind !== "thread" || !draft.trim() || busy) return;
    setBusy(true);
    const ok = await send(view.id, { body: draft });
    setBusy(false);
    if (ok) setDraft("");
  };

  const shareTo = async (threadId: string) => {
    if (!pendingShare) return;
    setBusy(true);
    const ok = await send(threadId, { track: pendingShare });
    setBusy(false);
    if (ok) {
      onShareDone();
      setView({ kind: "thread", id: threadId });
    }
  };

  const startNew = async () => {
    if (!picked.length || busy) return;
    setBusy(true);
    setError("");
    const r = picked.length === 1 ? await openDm(picked[0].id) : await createGroup(picked.map((p) => p.id), groupTitle);
    if (r.error || !r.id) {
      setBusy(false);
      setError(r.error || "No se pudo crear");
      return;
    }
    await reloadInbox();
    if (pendingShare) await shareTo(r.id);
    setBusy(false);
    setPicked([]);
    setQ("");
    setGroupTitle("");
    setView({ kind: "thread", id: r.id });
  };

  if (!open) return null;

  const title =
    view.kind === "thread" ? (current ? threadName(current) : "Conversación") : view.kind === "new" ? (picked.length > 1 ? "Nuevo grupo" : "Nuevo mensaje") : "Mensajes";

  return (
    <>
      <div className="dm-backdrop" onClick={onClose} aria-hidden />
      <aside className="dm-panel" role="dialog" aria-label="Mensajes">
        <div className="dm-head">
          {view.kind !== "list" ? (
            <button type="button" className="dm-icon-btn" onClick={() => setView({ kind: "list" })} aria-label="Volver">
              ‹
            </button>
          ) : (
            <span className="dm-head-spacer" />
          )}
          <div className="dm-head-title">
            {view.kind === "thread" && current ? (
              <button
                type="button"
                className="dm-head-name"
                onClick={() => !current.is_group && current.members[0]?.handle && onOpenProfile(current.members[0].handle!.replace(/^@+/, ""))}
              >
                {title}
              </button>
            ) : (
              <b>{title}</b>
            )}
            {view.kind === "thread" && current?.is_group && <small>{current.members.length + 1} personas</small>}
          </div>
          {view.kind === "list" && (
            <button type="button" className="dm-icon-btn" onClick={() => setView({ kind: "new" })} aria-label="Nuevo mensaje" title="Nuevo mensaje o grupo">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
            </button>
          )}
          {view.kind === "thread" && current?.is_group && (
            <button
              type="button"
              className="dm-icon-btn"
              title="Renombrar o salir"
              onClick={async () => {
                const n = window.prompt("Nombre del grupo (dejalo vacío para sacarlo). Escribí SALIR para irte del grupo.", current.title || "");
                if (n === null) return;
                if (n.trim().toUpperCase() === "SALIR") {
                  await leaveThread(current.thread_id);
                  await reloadInbox();
                  setView({ kind: "list" });
                  return;
                }
                await renameThread(current.thread_id, n);
                await reloadInbox();
              }}
            >
              ⋯
            </button>
          )}
          <button type="button" className="dm-icon-btn" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>

        {pendingShare && view.kind !== "thread" && (
          <div className="dm-share-banner">
            {pendingShare.cover && <img src={pendingShare.cover} alt="" />}
            <span>
              Mandar <b>{pendingShare.title}</b> a…
            </span>
            <button type="button" onClick={onShareDone} aria-label="Cancelar">
              ✕
            </button>
          </div>
        )}
        {error && (
          <p className="dm-error" onClick={() => setError("")}>
            {error}
          </p>
        )}

        {/* ---------- BANDEJA ---------- */}
        {view.kind === "list" && (
          <div className="dm-scroll">
            {threads.length === 0 && (
              <div className="dm-empty">
                <b>Todavía no hay mensajes</b>
                <span>Escribile a alguien desde el lápiz de arriba o desde su perfil. También podés armar grupos de hasta 10.</span>
              </div>
            )}
            {threads.map((t) => {
              const last = t.last_track_title && !t.last_body ? `🎵 ${t.last_track_title}` : t.last_body || "";
              const mine = t.last_sender === meId;
              return (
                <button
                  key={t.thread_id}
                  type="button"
                  className={`dm-thread ${t.unread ? "is-unread" : ""}`}
                  onClick={() => (pendingShare ? void shareTo(t.thread_id) : setView({ kind: "thread", id: t.thread_id }))}
                  disabled={busy}
                >
                  <ThreadAvatar t={t} />
                  <span className="dm-thread-main">
                    <span className="dm-thread-top">
                      <b>{threadName(t)}</b>
                      <small>{agoEs(t.last_message_at).replace("hace ", "")}</small>
                    </span>
                    <span className="dm-thread-last">
                      {mine && "Vos: "}
                      {last || <i>Conversación nueva</i>}
                    </span>
                  </span>
                  {pendingShare ? <span className="dm-send-chip">Enviar</span> : t.unread > 0 && <span className="dm-unread">{t.unread > 9 ? "9+" : t.unread}</span>}
                </button>
              );
            })}
          </div>
        )}

        {/* ---------- NUEVO ---------- */}
        {view.kind === "new" && (
          <div className="dm-scroll dm-new">
            <div className="dm-picked">
              {picked.map((p) => (
                <button key={p.id} type="button" onClick={() => setPicked((x) => x.filter((y) => y.id !== p.id))}>
                  {at(p.handle) || p.name} ✕
                </button>
              ))}
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={picked.length ? "Sumar a alguien más…" : "Buscar @usuario o nombre"}
              />
            </div>
            {picked.length > 1 && (
              <input className="dm-group-title" value={groupTitle} onChange={(e) => setGroupTitle(e.target.value.slice(0, 60))} placeholder="Nombre del grupo (opcional)" />
            )}
            <div className="dm-results">
              {results
                .filter((r) => !picked.some((p) => p.id === r.id))
                .map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className="dm-person"
                    disabled={picked.length >= 9}
                    onClick={() => {
                      setPicked((x) => [...x, r]);
                      setQ("");
                    }}
                  >
                    <Avatar p={r} size={34} />
                    <span>
                      <b>{r.name || at(r.handle)}</b>
                      <small>{at(r.handle)}</small>
                    </span>
                  </button>
                ))}
              {q && results.length === 0 && <p className="dm-hint">No encontré a nadie con eso.</p>}
              {picked.length >= 9 && <p className="dm-hint">Máximo 10 personas por grupo (con vos).</p>}
            </div>
            <button type="button" className="dm-primary" disabled={!picked.length || busy} onClick={() => void startNew()}>
              {busy ? "…" : pendingShare ? "Enviar" : picked.length > 1 ? `Crear grupo (${picked.length + 1})` : "Empezar conversación"}
            </button>
          </div>
        )}

        {/* ---------- CONVERSACIÓN ---------- */}
        {view.kind === "thread" && (
          <>
            <div className="dm-scroll dm-msgs" ref={listRef}>
              {loadingMsgs && <p className="dm-hint">Cargando…</p>}
              {!loadingMsgs && msgs.length === 0 && <p className="dm-hint">Arrancá la conversación 👋</p>}
              {msgs.map((m, i) => {
                const mine = m.sender_id === meId;
                const prev = msgs[i - 1];
                const showWho = current?.is_group && !mine && prev?.sender_id !== m.sender_id;
                const who = m.sender_id ? people[m.sender_id] : undefined;
                return (
                  <div key={m.id} className={`dm-msg ${mine ? "is-mine" : ""}`}>
                    {showWho && <small className="dm-msg-who">{who ? who.name || at(who.handle) : "Alguien"}</small>}
                    {m.track && (
                      <button type="button" className="dm-track" onClick={() => onPlayTrack(m.track!)}>
                        {m.track.cover ? <img src={m.track.cover} alt="" /> : <span className="dm-track-ph">♪</span>}
                        <span>
                          <b>{m.track.title}</b>
                          <small>{[m.track.artist, m.track.projectTitle].filter(Boolean).join(" · ")}</small>
                        </span>
                        <i aria-hidden>▶</i>
                      </button>
                    )}
                    {m.body && <p className="dm-bubble">{m.body}</p>}
                    <small className="dm-msg-time">{timeShort(m.created_at)}</small>
                  </div>
                );
              })}
            </div>
            <form
              className="dm-compose"
              onSubmit={(e) => {
                e.preventDefault();
                void sendDraft();
              }}
            >
              <textarea
                ref={inputRef}
                value={draft}
                rows={1}
                maxLength={2000}
                placeholder="Escribí un mensaje…"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void sendDraft();
                  }
                }}
              />
              <button type="submit" disabled={!draft.trim() || busy} aria-label="Enviar">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M3.4 20.4 21 12 3.4 3.6 3.4 10l12.6 2-12.6 2z" /></svg>
              </button>
            </form>
          </>
        )}
      </aside>
    </>
  );
}

/** Configuración de cuenta: quién te puede empezar una conversación */
export function DmPolicyField({ meId }: { meId: string }) {
  const [policy, setPolicy] = useState<import("@/lib/dms").DmPolicy | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    void import("@/lib/dms").then((m) => m.getDmPolicy(meId)).then(setPolicy);
  }, [meId]);
  const opts: { v: import("@/lib/dms").DmPolicy; label: string }[] = [
    { v: "everyone", label: "Todos" },
    { v: "friends", label: "Solo amigos" },
    { v: "nobody", label: "Nadie" },
  ];
  return (
    <div className="modal-field dm-policy-field">
      <span>MENSAJES DIRECTOS · ¿QUIÉN TE PUEDE ESCRIBIR?</span>
      <div className="dm-policy-opts">
        {opts.map((o) => (
          <button
            key={o.v}
            type="button"
            className={policy === o.v ? "on" : ""}
            onClick={async () => {
              setPolicy(o.v);
              const { setDmPolicy } = await import("@/lib/dms");
              if (await setDmPolicy(meId, o.v)) {
                setSaved(true);
                window.setTimeout(() => setSaved(false), 1800);
              }
            }}
          >
            {o.label}
          </button>
        ))}
      </div>
      <small>{saved ? "Guardado ✓" : "Las conversaciones que ya tenés siguen igual."}</small>
    </div>
  );
}
