"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { sfx } from "@/lib/sfx";
import { supabase } from "@/lib/supabase";

function buildDiscSprite(): THREE.CanvasTexture {
  if (typeof document === "undefined") {
    return new THREE.CanvasTexture({} as HTMLCanvasElement);
  }
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, 64, 64);

  // Micro Vinilo con surcos finos y centro brillante
  g.fillStyle = "#0c0c0e";
  g.beginPath();
  g.arc(32, 32, 30, 0, Math.PI * 2);
  g.fill();

  // Surcos concéntricos
  g.lineWidth = 1;
  [24, 20, 16, 12].forEach((r) => {
    g.strokeStyle = "rgba(255, 255, 255, 0.12)";
    g.beginPath();
    g.arc(32, 32, r, 0, Math.PI * 2);
    g.stroke();
  });

  // Brillo especular diagonal en arco
  const sheen = g.createLinearGradient(10, 10, 54, 54);
  sheen.addColorStop(0, "rgba(255, 255, 255, 0.22)");
  sheen.addColorStop(0.5, "rgba(255, 255, 255, 0.0)");
  sheen.addColorStop(1, "rgba(255, 255, 255, 0.22)");
  g.fillStyle = sheen;
  g.beginPath();
  g.arc(32, 32, 29, 0, Math.PI * 2);
  g.fill();

  // Sello central
  g.fillStyle = "#e11d48";
  g.beginPath();
  g.arc(32, 32, 8, 0, Math.PI * 2);
  g.fill();

  // Agujero central del vinilo
  g.fillStyle = "#000000";
  g.beginPath();
  g.arc(32, 32, 2.5, 0, Math.PI * 2);
  g.fill();

  const tex = new THREE.CanvasTexture(c);
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

function MicroDiscsSwarm() {
  const pointsRef = useRef<THREE.Points>(null!);
  const count = 18000;
  const sprite = useMemo(() => buildDiscSprite(), []);

  const { positions, velocities, colors, phases } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const vel = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const ph = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const ix = i * 3;
      const u = (i / count) * Math.PI * 24;
      const r = 1.2 + (i / count) * 4.6;
      const angle = u + (i % 5) * 1.25;

      pos[ix] = Math.cos(angle) * r + (Math.random() - 0.5) * 0.45;
      pos[ix + 1] = Math.sin(angle * 1.3) * r * 0.55 + (Math.random() - 0.5) * 0.45;
      pos[ix + 2] = Math.sin(angle * 0.7) * 2.2 + (Math.random() - 0.5) * 0.45;

      vel[ix] = 0;
      vel[ix + 1] = 0;
      vel[ix + 2] = 0;

      ph[i] = Math.random() * Math.PI * 2;

      // Tintes sutiles entre blanco puro, plata y acentos de vinilo
      const isCd = i % 3 === 0;
      if (isCd) {
        col[ix] = 0.94;
        col[ix + 1] = 0.96;
        col[ix + 2] = 1.0;
      } else if (i % 3 === 1) {
        col[ix] = 0.98;
        col[ix + 1] = 0.4;
        col[ix + 2] = 0.45;
      } else {
        col[ix] = 0.85;
        col[ix + 1] = 0.85;
        col[ix + 2] = 0.88;
      }
    }

    return { positions: pos, velocities: vel, colors: col, phases: ph };
  }, [count]);

  useFrame(({ clock, pointer }, dt) => {
    const t = clock.elapsedTime;
    const clampedDt = Math.min(0.033, dt);
    const arr = pointsRef.current.geometry.attributes.position.array as Float32Array;

    // Rotación suave del enjambre + ondas
    const mx = pointer.x * 0.85;
    const my = pointer.y * 0.85;

    for (let i = 0; i < count; i += 2) {
      const ix = i * 3;
      const phi = phases[i];
      // Flotación en espiral
      arr[ix + 1] += Math.sin(t * 1.6 + phi) * 0.0035;
      arr[ix] += Math.cos(t * 1.2 + phi) * 0.0028;

      // Puntero genera suave repulsión curiosa
      const dx = arr[ix] - mx * 3;
      const dy = arr[ix + 1] - my * 2;
      const d2 = dx * dx + dy * dy;
      if (d2 < 1.2 && d2 > 0.001) {
        const d = Math.sqrt(d2);
        const force = ((1.2 - d) / 1.2) * 0.8 * clampedDt;
        arr[ix] += (dx / d) * force;
        arr[ix + 1] += (dy / d) * force;
      }
    }

    pointsRef.current.rotation.y = t * 0.055;
    pointsRef.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={pointsRef} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        map={sprite}
        size={0.046}
        vertexColors
        transparent
        alphaTest={0.03}
        opacity={0.92}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
}

// Códigos de invitación válidos (estilo HeySpace / red privada del underground)
const VALID_REFERRAL_CODES = [
  "TABLERO-UG-2026",
  "POYO-VIP",
  "CHICKENNUGGET",
  "MENDOZA-808",
  "HEYSPACE-TABLERO",
  "UNDERGROUND-2026",
  "TABLERO-PRIVATE",
];

export default function LandingScene({
  onEnterAsGuest,
  onOpenGoogleAuth,
  onSetAccountRole,
}: {
  onEnterAsGuest: () => void;
  onOpenGoogleAuth: () => void;
  onSetAccountRole?: (role: "artista" | "oyente") => void;
}) {
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [chosenRole, setChosenRole] = useState<"artista" | "oyente">("artista");
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const handleValidateAndRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    const clean = inviteCode.trim().toUpperCase().replace(/https?:\/\/[^/]+\/(invite\/)?/, "");

    const isValid =
      VALID_REFERRAL_CODES.includes(clean) ||
      clean.includes("TABLERO") ||
      clean.includes("VIP") ||
      clean.length >= 8;

    if (!isValid) {
      sfx.close();
      setErrorMsg("Link o código de invitación inválido, che. El tablero es una red privada solo por invitación (referral). Pedile acceso a un miembro.");
      return;
    }

    sfx.drop();
    if (onSetAccountRole) {
      onSetAccountRole(chosenRole);
    }
    setLoading(true);

    try {
      await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
        },
      });
    } catch (err: any) {
      setErrorMsg(`Error al conectar con Google: ${err?.message || err}`);
      setLoading(false);
    }
  };

  return (
    <div className="landing-stage-wrapper">
      {/* 3D Canvas con micro vinilos y micro CDs flotando a 60 FPS */}
      <div className="landing-canvas-container">
        <Canvas
          camera={{ position: [0, 0, 4.8], fov: 42 }}
          dpr={[1, 1.35]}
          gl={{ antialias: false, powerPreference: "high-performance" }}
        >
          <color attach="background" args={["#070709"]} />
          <MicroDiscsSwarm />
        </Canvas>
      </div>

      {/* Top minimal bar */}
      <header className="landing-top-bar">
        <div className="landing-brand-tag">
          <span className="brand-dot" />
          <span>El tablero // @quetablero</span>
        </div>
        <button
          type="button"
          className="apple-btn ghost landing-enter-guest-btn"
          onClick={() => {
            sfx.open();
            onEnterAsGuest();
          }}
        >
          Explorar como invitado →
        </button>
      </header>

      {/* Centro de la landing: tipografía de El tablero + píldora Registrarme / Iniciar sesión */}
      <div className="landing-center-content">
        <span className="mono-tag" style={{ letterSpacing: "0.22em", marginBottom: 12 }}>
          RED PRIVADA // ACCESO EXCLUSIVO POR REFERRAL
        </span>

        <h1 className="landing-display-title">El tablero</h1>

        <p className="landing-manifesto-sub">
          Tus proyectos. Tu identidad. Tu gente. Tu música.
        </p>

        {/* Píldora del medio estilo reproductor minimalista */}
        <div className="landing-center-pill">
          <button
            type="button"
            className="landing-pill-btn primary"
            onClick={() => {
              sfx.open();
              setErrorMsg("");
              setInviteModalOpen(true);
            }}
          >
            Registrarme
          </button>
          <span className="landing-pill-divider" />
          <button
            type="button"
            className="landing-pill-btn"
            onClick={() => {
              sfx.open();
              onOpenGoogleAuth();
            }}
          >
            Iniciar sesión
          </button>
        </div>

        <small className="landing-referral-hint">
          ¿Tenés un link de invitación? Tocá <b>Registrarme</b> y pegalo para ingresar.
        </small>
      </div>

      {/* Modal de Validación de Referral Invite estilo HeySpace */}
      {inviteModalOpen && (
        <div className="apple-modal-backdrop" onClick={() => setInviteModalOpen(false)}>
          <div className="apple-modal-card narrow" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <span className="mono-tag">ACCESO PRIVADO // REFERRAL INVITE</span>
                <h3>Invitación a El tablero</h3>
              </div>
              <button
                type="button"
                className="apple-btn ghost"
                onClick={() => setInviteModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <p className="modal-subcopy">
              El tablero es una comunidad privada y curada para la escena underground. Para ingresar necesitás un link o código de referido otorgado por un miembro activo.
            </p>

            {errorMsg && (
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: 8,
                  fontSize: "0.82rem",
                  marginBottom: 14,
                  background: "rgba(225,29,72,0.12)",
                  color: "#e11d48",
                  border: "1px solid rgba(225,29,72,0.3)",
                }}
              >
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleValidateAndRegister} className="modal-form-grid single-col">
              <label className="modal-field">
                <span>LINK O CÓDIGO DE INVITACIÓN</span>
                <input
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  placeholder="ej. TABLERO-UG-2026 o https://eltablero.blog/invite/..."
                  required
                  autoFocus
                />
                <small style={{ color: "var(--ink-secondary)", fontSize: "0.7rem", marginTop: 4 }}>
                  Código VIP de acceso temprano. Sin referral válido no es posible registrarse.
                </small>
              </label>

              <div className="modal-field">
                <span>¿CÓMO VAS A USAR EL TABLERO?</span>
                <div className="seg-pills" style={{ marginTop: 6 }}>
                  <button
                    type="button"
                    className={chosenRole === "artista" ? "on" : ""}
                    onClick={() => {
                      sfx.tap();
                      setChosenRole("artista");
                    }}
                  >
                    🎙️ Artista / Productor
                  </button>
                  <button
                    type="button"
                    className={chosenRole === "oyente" ? "on" : ""}
                    onClick={() => {
                      sfx.tap();
                      setChosenRole("oyente");
                    }}
                  >
                    🎧 Oyente
                  </button>
                </div>
                <small style={{ color: "var(--ink-secondary)", fontSize: "0.68rem", marginTop: 4 }}>
                  {chosenRole === "artista"
                    ? "Podrás crear proyectos 3D, subir tracks WAV/MP3, videos Canvas y vincular tu @handle único."
                    : "Tu biblioteca se enfocará en tus proyectos Guardados para escuchar la música de la escena."}
                </small>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
                <button
                  type="submit"
                  className="apple-btn primary"
                  disabled={loading}
                  style={{ justifyContent: "center", padding: "12px 18px", fontSize: "0.95rem" }}
                >
                  {loading ? "Verificando y conectando..." : "Validar y Conectar con Google →"}
                </button>
                <button
                  type="button"
                  className="apple-btn ghost"
                  onClick={() => {
                    setInviteModalOpen(false);
                    onEnterAsGuest();
                  }}
                  style={{ justifyContent: "center" }}
                >
                  Continuar explorando como invitado
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
