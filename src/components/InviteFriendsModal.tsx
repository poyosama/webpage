"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { sfx } from "@/lib/sfx";
import type { ArtistProfile } from "@/lib/mock";
import {
  InviteCodeItem,
  getOrGenerateUserInvites,
  generateNewBatchForUser,
  generateExtraInvitesForUser,
  verifyUnlimitedInvites,
  buildInviteUrl,
} from "@/lib/invites";

interface InviteFriendsModalProps {
  profile: ArtistProfile;
  onClose: () => void;
}

export function InviteFriendsModal({ profile, onClose }: InviteFriendsModalProps) {
  const [invites, setInvites] = useState<InviteCodeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [canGenerate, setCanGenerate] = useState(false);
  const [daysLeft, setDaysLeft] = useState(14);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [unlimited, setUnlimited] = useState(false);

  useEffect(() => {
    let alive = true;
    void verifyUnlimitedInvites().then((ok) => {
      if (alive) setUnlimited(ok);
    });
    return () => {
      alive = false;
    };
  }, [profile.id]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const res = await getOrGenerateUserInvites(
        profile.id || "local-user",
        profile.handle || "@artista",
        profile.name || "Artista",
        unlimited
      );
      if (alive) {
        setInvites(res.codes);
        setCanGenerate(res.canGenerateNewBatch);
        setDaysLeft(res.daysUntilNextBatch);
        setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [profile.id, profile.handle, profile.name, unlimited]);

  const [copiedCodeOnly, setCopiedCodeOnly] = useState<string | null>(null);
  const handleCopyCode = async (code: string) => {
    sfx.tap();
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = code;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopiedCodeOnly(code);
    setTimeout(() => setCopiedCodeOnly((cur) => (cur === code ? null : cur)), 2500);
  };

  const handleCopy = async (code: string) => {
    sfx.tap();
    const url = buildInviteUrl(code);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode((cur) => (cur === code ? null : cur)), 2500);
    } catch {
      // fallback
      const ta = document.createElement("textarea");
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode((cur) => (cur === code ? null : cur)), 2500);
    }
  };

  const handleGenerateExtra = async (count: number) => {
    if (generating) return;
    sfx.drop();
    setGenerating(true);
    const all = await generateExtraInvitesForUser(
      profile.id || "local-user",
      profile.handle || "@artista",
      profile.name || "Artista",
      count
    );
    setInvites(all);
    setGenerating(false);
  };

  const handleGenerateBatch = async () => {
    if (!canGenerate || generating) return;
    sfx.drop();
    setGenerating(true);
    const nextCodes = await generateNewBatchForUser(
      profile.id || "local-user",
      profile.handle || "@artista",
      profile.name || "Artista"
    );
    setInvites(nextCodes);
    setCanGenerate(false);
    setDaysLeft(14);
    setGenerating(false);
  };

  return (
    <motion.div
      className="apple-modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="apple-modal-card invite-friends-modal-card"
        initial={{ scale: 0.94, y: 16 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.94, y: 16 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <span className="mono-tag">ACCESO EXCLUSIVO // COMUNIDAD</span>
            <h3 style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span>🎟️</span>
              <span>Invitar amigos a El tablero.</span>
            </h3>
          </div>
          <button type="button" className="apple-btn ghost" onClick={onClose}>
            Cerrar
          </button>
        </div>

        <p className="invite-modal-desc">
          {unlimited ? (
            <>
              El tablero. es una plataforma exclusiva para artistas y productores. Tu cuenta tiene{" "}
              <b>pases ilimitados</b>. Cada tanda trae 5 y reemplaza a la anterior. Cada pase es de un solo uso y vence a los 14 días.
            </>
          ) : (
            <>
              El tablero. es una plataforma exclusiva para artistas y productores. Tenés{" "}
              <b>3 pases cada 2 semanas</b>. Cada pase es de un solo uso y vence a los 14 días.
            </>
          )}
        </p>

        {loading ? (
          <div className="invite-loading-box">
            <span>Cargando tus invitaciones...</span>
          </div>
        ) : (
          <div className="invite-cards-grid">
            {invites.map((inv, idx) => {
              const inviteUrl = buildInviteUrl(inv.code);
              const isCopied = copiedCode === inv.code;

              return (
                <div
                  key={inv.code}
                  className={`invite-code-card ${inv.used ? "is-used" : "is-available"}`}
                >
                  <div className="invite-code-top">
                    <div className="invite-badge-col">
                      <span className="invite-ticket-number">PASE #{idx + 1}</span>
                      <span className="invite-code-title">{inv.code}</span>
                    </div>
                    {inv.used ? (
                      <span className="invite-status-pill used">
                        ✓ Usado{inv.usedByHandle ? ` · ${inv.usedByHandle}` : ""}
                      </span>
                    ) : (
                      <span className="invite-status-pill available">Disponible</span>
                    )}
                  </div>

                  <div className="invite-code-url-box">
                    <span className="invite-url-text">{inviteUrl}</span>
                    <button
                      type="button"
                      disabled={inv.used}
                      className={`apple-btn ${isCopied ? "copied" : "ghost"} compact invite-copy-btn`}
                      onClick={() => handleCopy(inv.code)}
                    >
                      {inv.used ? (
                        "Gastado"
                      ) : isCopied ? (
                        "✓ Link copiado"
                      ) : (
                        <>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                          </svg>
                          <span>Copiar link</span>
                        </>
                      )}
                    </button>
                    {!inv.used && (
                      <button
                        type="button"
                        className="apple-btn ghost compact invite-copy-btn invite-copy-code-btn"
                        onClick={() => handleCopyCode(inv.code)}
                      >
                        {copiedCodeOnly === inv.code ? "✓ Código" : "Código"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="invite-modal-footer">
          {unlimited ? (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                className="apple-btn primary"
                disabled={generating}
                onClick={() => handleGenerateExtra(5)}
              >
                {generating ? "Generando..." : "Generar 5 pases nuevos"}
              </button>
            </div>
          ) : (
          <>
          <div className="invite-renews-info">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span>
              {canGenerate
                ? "¡Ya pasaron 2 semanas! Podés generar 3 pases nuevos."
                : `Tus 3 invitaciones se recargan cada 14 días (próxima tanda en ${daysLeft} ${daysLeft === 1 ? "día" : "días"}).`}
            </span>
          </div>

          {canGenerate && (
            <button
              type="button"
              className="apple-btn primary"
              disabled={generating}
              onClick={handleGenerateBatch}
            >
              {generating ? "Generando pases..." : "Generar nueva tanda de 3 invitaciones"}
            </button>
          )}
          </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

/** Modal de bienvenida cuando una persona abre un link eltablero.blog/invite/xxxxx */
export function WelcomeInviteModal({
  code,
  creatorHandle,
  creatorName,
  onAccept,
  onClose,
}: {
  code: string;
  creatorHandle?: string;
  creatorName?: string;
  onAccept: () => void;
  onClose: () => void;
}) {
  return (
    <motion.div
      className="apple-modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="apple-modal-card welcome-invite-modal-card"
        initial={{ scale: 0.94, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.94, y: 20 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="welcome-invite-header">
          <div className="welcome-invite-ticket-icon">🎟️</div>
          <span className="mono-tag">ACCESO EXCLUSIVO // INVITACIÓN DE ARTISTA</span>
          <h2>Te invitaron a suscribirte a El tablero.</h2>
          <p>
            Te invitó <b>{creatorName || "un artista"}</b> (
            <span className="invite-creator-handle">{creatorHandle || "@quetablero"}</span>). Es gratis.
          </p>
        </div>

        <div className="welcome-code-badge">
          <span className="code-label">CÓDIGO DE INVITACIÓN VERIFICADO</span>
          <b className="code-value">{code}</b>
          <span className="code-valid-tag">✓ Pase válido</span>
        </div>

        <div className="welcome-invite-actions">
          <button
            type="button"
            className="apple-btn primary"
            onClick={() => {
              sfx.tap();
              onAccept();
            }}
          >
            Suscribirme a El tablero.
          </button>
          <button type="button" className="apple-btn ghost" onClick={onClose}>
            Explorar antes de suscribirme
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
