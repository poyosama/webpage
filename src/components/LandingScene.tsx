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

const VINYL_PALETTE = [
  "#e11d48", // coral / red
  "#0284c7", // electric cyan
  "#ca8a04", // gold
  "#65a30d", // neon lime
  "#7e22ce", // purple
  "#14b8a6", // teal
];

function buildLandingLogoTargets(count: number): Float32Array {
  const targets = new Float32Array(count * 3);
  if (typeof document === "undefined") return targets;

  const text = "EL TABLERO";
  const W = 880;
  const H = 240;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;

  g.fillStyle = "#000000";
  g.fillRect(0, 0, W, H);

  g.fillStyle = "#ffffff";
  g.font = `800 110px -apple-system, BlinkMacSystemFont, "SF Pro Display", Inter, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";

  const chars = text.split("");
  const tightFactor = 0.88;
  const widths = chars.map((ch) => g.measureText(ch).width * tightFactor);
  const totalW = widths.reduce((a, b) => a + b, 0);
  let curX = (W - totalW) / 2;
  const centerY = H * 0.52;

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const cw = widths[i];
    g.fillText(ch, curX + cw * 0.5, centerY);
    curX += cw;
  }

  const img = g.getImageData(0, 0, W, H).data;
  const validPixels: [number, number][] = [];
  for (let y = 0; y < H; y += 2) {
    for (let x = 0; x < W; x += 2) {
      const lum = img[(y * W + x) * 4];
      if (lum > 100) {
        validPixels.push([(x / W - 0.5) * 6.2, (0.5 - y / H) * 1.8]);
      }
    }
  }

  if (validPixels.length === 0) {
    validPixels.push([0, 0]);
  }

  for (let i = 0; i < count; i++) {
    const ix = i * 3;
    const [px, py] = validPixels[(i * 7) % validPixels.length];
    const zDepth = ((i % 9) - 4) * 0.05 + (Math.random() - 0.5) * 0.04;
    targets[ix] = px + (Math.random() - 0.5) * 0.025;
    targets[ix + 1] = py + (Math.random() - 0.5) * 0.025;
    targets[ix + 2] = zDepth;
  }

  return targets;
}

function MicroDiscsSwarm() {
  const pointsRef = useRef<THREE.Points>(null!);
  const count = 18000;
  const sprite = useMemo(() => buildDiscSprite(), []);
  const logoTargets = useMemo(() => buildLandingLogoTargets(count), [count]);

  const { orbitPositions, currentPositions, colors, phases } = useMemo(() => {
    const orbitPos = new Float32Array(count * 3);
    const currPos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const ph = new Float32Array(count);

    const parsedColors = VINYL_PALETTE.map((hex) => new THREE.Color(hex));

    for (let i = 0; i < count; i++) {
      const ix = i * 3;
      const u = (i / count) * Math.PI * 24;
      const r = 1.2 + (i / count) * 4.6;
      const angle = u + (i % 5) * 1.25;

      const ox = Math.cos(angle) * r + (Math.random() - 0.5) * 0.45;
      const oy = Math.sin(angle * 1.3) * r * 0.55 + (Math.random() - 0.5) * 0.45;
      const oz = Math.sin(angle * 0.7) * 2.2 + (Math.random() - 0.5) * 0.45;

      orbitPos[ix] = ox;
      orbitPos[ix + 1] = oy;
      orbitPos[ix + 2] = oz;

      currPos[ix] = ox;
      currPos[ix + 1] = oy;
      currPos[ix + 2] = oz;

      ph[i] = Math.random() * Math.PI * 2;

      // Colores random vibrantes de la paleta de vinilitos de El Tablero
      const colorPick = parsedColors[i % parsedColors.length];
      col[ix] = colorPick.r;
      col[ix + 1] = colorPick.g;
      col[ix + 2] = colorPick.b;
    }

    return { orbitPositions: orbitPos, currentPositions: currPos, colors: col, phases: ph };
  }, [count]);

  useFrame(({ clock, pointer }, dt) => {
    const t = clock.elapsedTime;
    const clampedDt = Math.min(0.033, dt);
    const arr = pointsRef.current.geometry.attributes.position.array as Float32Array;

    // Ciclo de 13s: 6s órbita libre, 1.5s morph a "EL TABLERO" en 2D, 4s hold de "EL TABLERO", 1.5s dispersión
    const cycle = t % 13;
    let morphFactor = 0;
    if (cycle < 5.5) {
      morphFactor = 0;
    } else if (cycle < 7.0) {
      morphFactor = (cycle - 5.5) / 1.5;
    } else if (cycle < 11.0) {
      morphFactor = 1;
    } else if (cycle < 12.5) {
      morphFactor = 1 - (cycle - 11.0) / 1.5;
    } else {
      morphFactor = 0;
    }
    const smoothMorph = 0.5 - 0.5 * Math.cos(morphFactor * Math.PI);

    const mx = pointer.x * 0.85;
    const my = pointer.y * 0.85;

    for (let i = 0; i < count; i++) {
      const ix = i * 3;
      const phi = phases[i];

      // Posición de órbita base
      const ox = orbitPositions[ix] + Math.cos(t * 1.1 + phi) * 0.08;
      const oy = orbitPositions[ix + 1] + Math.sin(t * 1.4 + phi) * 0.08;
      const oz = orbitPositions[ix + 2] + Math.sin(t * 0.9 + phi) * 0.06;

      // Posición objetivo texto 2D "EL TABLERO"
      const tx = logoTargets[ix];
      const ty = logoTargets[ix + 1];
      const tz = logoTargets[ix + 2];

      // Interpolación entre órbita y texto 2D
      const targetX = THREE.MathUtils.lerp(ox, tx, smoothMorph);
      const targetY = THREE.MathUtils.lerp(oy, ty, smoothMorph);
      const targetZ = THREE.MathUtils.lerp(oz, tz, smoothMorph);

      arr[ix] += (targetX - arr[ix]) * (clampedDt * 4.5);
      arr[ix + 1] += (targetY - arr[ix + 1]) * (clampedDt * 4.5);
      arr[ix + 2] += (targetZ - arr[ix + 2]) * (clampedDt * 4.5);

      // Leve interacción con el puntero cuando está disperso
      if (smoothMorph < 0.3) {
        const dx = arr[ix] - mx * 3;
        const dy = arr[ix + 1] - my * 2;
        const d2 = dx * dx + dy * dy;
        if (d2 < 1.0 && d2 > 0.001) {
          const d = Math.sqrt(d2);
          const force = ((1.0 - d) / 1.0) * 0.5 * clampedDt;
          arr[ix] += (dx / d) * force;
          arr[ix + 1] += (dy / d) * force;
        }
      }
    }

    // Leve rotación solo cuando no está en texto 2D para mantener legibilidad
    pointsRef.current.rotation.y = t * 0.04 * (1 - smoothMorph);
    pointsRef.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={pointsRef} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[currentPositions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        map={sprite}
        size={0.048}
        vertexColors
        transparent
        alphaTest={0.03}
        opacity={0.94}
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
  onEnterAsGuest?: () => void;
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
      </header>

      {/* Centro de la landing: tipografía de El tablero + píldora Registrarme / Iniciar sesión */}
      <div className="landing-center-content">
        <span className="mono-tag" style={{ letterSpacing: "0.22em", marginBottom: 12 }}>
          ACCESO ANTICIPADO
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
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
