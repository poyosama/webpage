"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { sfx } from "@/lib/sfx";
import { supabase } from "@/lib/supabase";

const VINYL_PALETTE = [
  "#e11d48", // coral
  "#0284c7", // cyan
  "#eab308", // gold
  "#84cc16", // lime
  "#a855f7", // purple
  "#14b8a6", // teal
  "#f97316", // orange
  "#ec4899", // pink
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

const VERT_SHADER = /* glsl */ `
  attribute vec3 aColor;
  varying vec3 vColor;
  uniform float uSize;
  void main() {
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(uSize * (300.0 / max(0.3, -mv.z)), 2.0, 26.0);
  }
`;

// Cuerpo del vinilo negro con surcos y reflejo; SOLO el sello central toma el color de cada partícula
const FRAG_SHADER = /* glsl */ `
  varying vec3 vColor;
  void main() {
    vec2 p = gl_PointCoord - vec2(0.5);
    float r = length(p);
    if (r > 0.49) discard;

    // Agujero central
    if (r < 0.055) {
      gl_FragColor = vec4(0.02, 0.02, 0.03, 0.96);
      return;
    }

    // Sello central de colores distintos en cada vinilito
    if (r < 0.19) {
      float innerRim = smoothstep(0.19, 0.165, r);
      vec3 labelCol = vColor * (0.92 + 0.14 * innerRim);
      gl_FragColor = vec4(labelCol, 0.97);
      return;
    }

    // Surcos negros + brillo diagonal de vinilo
    float groove = sin(r * 135.0) * 0.5 + 0.5;
    float sheen = pow(abs(dot(normalize(p), vec2(0.7071, 0.7071))), 5.0) * 0.24;
    float base = 0.065 + groove * 0.045 + sheen;
    float alpha = smoothstep(0.49, 0.455, r) * 0.94;
    gl_FragColor = vec4(vec3(base), alpha);
  }
`;

function MicroDiscsSwarm({ count }: { count: number }) {
  const pointsRef = useRef<THREE.Points>(null!);
  const simTimeRef = useRef(0);
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

      const colorPick = parsedColors[(i * 5 + (i % 3)) % parsedColors.length];
      col[ix] = colorPick.r;
      col[ix + 1] = colorPick.g;
      col[ix + 2] = colorPick.b;
    }

    return { orbitPositions: orbitPos, currentPositions: currPos, colors: col, phases: ph };
  }, [count]);

  const uniforms = useMemo(() => ({ uSize: { value: 0.055 } }), []);

  useFrame(({ pointer }, dt) => {
    // Usar tiempo propio acotado para que al volver de segundo plano en iPhone no salte ni se reinicie el ciclo
    const clampedDt = Math.min(0.033, Math.max(0.001, dt));
    simTimeRef.current += clampedDt;
    const t = simTimeRef.current;

    const arr = pointsRef.current.geometry.attributes.position.array as Float32Array;

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
    const step = Math.min(0.22, clampedDt * 4.5);

    for (let i = 0; i < count; i++) {
      const ix = i * 3;
      const phi = phases[i];

      const ox = orbitPositions[ix] + Math.cos(t * 1.1 + phi) * 0.08;
      const oy = orbitPositions[ix + 1] + Math.sin(t * 1.4 + phi) * 0.08;
      const oz = orbitPositions[ix + 2] + Math.sin(t * 0.9 + phi) * 0.06;

      const tx = logoTargets[ix];
      const ty = logoTargets[ix + 1];
      const tz = logoTargets[ix + 2];

      const targetX = THREE.MathUtils.lerp(ox, tx, smoothMorph);
      const targetY = THREE.MathUtils.lerp(oy, ty, smoothMorph);
      const targetZ = THREE.MathUtils.lerp(oz, tz, smoothMorph);

      arr[ix] += (targetX - arr[ix]) * step;
      arr[ix + 1] += (targetY - arr[ix + 1]) * step;
      arr[ix + 2] += (targetZ - arr[ix + 2]) * step;

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

    pointsRef.current.rotation.y = t * 0.04 * (1 - smoothMorph);
    pointsRef.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={pointsRef} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[currentPositions, 3]} />
        <bufferAttribute attach="attributes-aColor" args={[colors, 3]} />
      </bufferGeometry>
      <shaderMaterial
        vertexShader={VERT_SHADER}
        fragmentShader={FRAG_SHADER}
        uniforms={uniforms}
        transparent
        depthWrite={false}
      />
    </points>
  );
}

const VALID_REFERRAL_CODES = [
  "TABLERO-UG-2026",
  "POYO-VIP",
  "CHICKENNUGGET",
  "MENDOZA-808",
  "HEYSPACE-TABLERO",
  "UNDERGROUND-2026",
  "TABLERO-PRIVATE",
];

async function triggerGoogleOAuth(): Promise<string | null> {
  const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/` : undefined;
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo },
  });
  if (error) return error.message;
  if (data?.url && typeof window !== "undefined") {
    window.location.assign(data.url);
  }
  return null;
}

export default function LandingScene({
  onOpenGoogleAuth,
  onSetAccountRole,
}: {
  onEnterAsGuest?: () => void;
  onOpenGoogleAuth?: () => void;
  onSetAccountRole?: (role: "artista" | "oyente") => void;
}) {
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [chosenRole, setChosenRole] = useState<"artista" | "oyente">("artista");
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 768px)");
    setIsMobile(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  const handleDirectSignIn = async () => {
    sfx.open();
    setErrorMsg("");
    setLoading(true);
    try {
      const err = await triggerGoogleOAuth();
      if (err) {
        setErrorMsg(`Error al conectar con Google: ${err}`);
        setLoading(false);
        onOpenGoogleAuth?.();
      }
    } catch (err: any) {
      setErrorMsg(`Error al conectar con Google: ${err?.message || err}`);
      setLoading(false);
    }
  };

  const handleValidateAndRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    const clean = inviteCode.trim().toUpperCase().replace(/https?:\/\/[^/]+\/(invite\/)?/, "");

    const isValid =
      VALID_REFERRAL_CODES.includes(clean) ||
      clean.includes("TABLERO") ||
      clean.includes("VIP") ||
      clean.length >= 6;

    if (!isValid) {
      sfx.close();
      setErrorMsg("Código de invitación inválido.");
      return;
    }

    sfx.drop();
    onSetAccountRole?.(chosenRole);
    setLoading(true);

    try {
      const err = await triggerGoogleOAuth();
      if (err) {
        setErrorMsg(`Error al conectar con Google: ${err}`);
        setLoading(false);
      }
    } catch (err: any) {
      setErrorMsg(`Error al conectar con Google: ${err?.message || err}`);
      setLoading(false);
    }
  };

  return (
    <div className="landing-stage-wrapper">
      <div className="landing-canvas-container" style={{ pointerEvents: "none" }}>
        <Canvas
          camera={{ position: [0, 0, 4.8], fov: 42 }}
          dpr={isMobile ? [1, 1.15] : [1, 1.35]}
          gl={{ antialias: false, powerPreference: "high-performance" }}
          style={{ pointerEvents: "none" }}
        >
          <color attach="background" args={["#070709"]} />
          <MicroDiscsSwarm count={isMobile ? 7500 : 16000} />
        </Canvas>
      </div>

      <header className="landing-top-bar">
        <div className="landing-brand-tag">
          <span className="brand-dot" />
          <span>El tablero // @quetablero</span>
        </div>
      </header>

      <div className="landing-center-content">
        <span className="mono-tag" style={{ letterSpacing: "0.22em", marginBottom: 12 }}>
          ACCESO ANTICIPADO
        </span>

        <h1 className="landing-display-title">El tablero</h1>

        <p className="landing-manifesto-sub">
          Tus proyectos. Tu identidad. Tu gente. Tu música.
        </p>

        <div className="landing-center-pill">
          <button
            type="button"
            className="landing-pill-btn primary"
            disabled={loading}
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
            disabled={loading}
            onClick={handleDirectSignIn}
          >
            {loading ? "Conectando..." : "Iniciar sesión"}
          </button>
        </div>

        {errorMsg && !inviteModalOpen && (
          <small style={{ color: "#e11d48", marginTop: 10, fontSize: "0.78rem" }}>{errorMsg}</small>
        )}
      </div>

      {inviteModalOpen && (
        <div className="apple-modal-backdrop" onClick={() => setInviteModalOpen(false)}>
          <div className="apple-modal-card narrow" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <span className="mono-tag">ACCESO ANTICIPADO</span>
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
                <span>CÓDIGO DE INVITACIÓN</span>
                <input
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  placeholder="TABLERO-UG-2026"
                  required
                  autoFocus
                />
              </label>

              <div className="modal-field">
                <span>PERFIL</span>
                <div className="seg-pills" style={{ marginTop: 6 }}>
                  <button
                    type="button"
                    className={chosenRole === "artista" ? "on" : ""}
                    onClick={() => {
                      sfx.tap();
                      setChosenRole("artista");
                    }}
                  >
                    Artista / Productor
                  </button>
                  <button
                    type="button"
                    className={chosenRole === "oyente" ? "on" : ""}
                    onClick={() => {
                      sfx.tap();
                      setChosenRole("oyente");
                    }}
                  >
                    Oyente
                  </button>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
                <button
                  type="submit"
                  className="apple-btn primary"
                  disabled={loading}
                  style={{ justifyContent: "center", padding: "12px 18px", fontSize: "0.95rem" }}
                >
                  {loading ? "Conectando..." : "Continuar con Google →"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
