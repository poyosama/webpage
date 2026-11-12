"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { sfx } from "@/lib/sfx";
import { supabase } from "@/lib/supabase";
import { validateInviteCode, setPendingInviteCode } from "@/lib/invites";

const VINYL_PALETTE = [
  "#ffffff", // Blanco puro
  "#22c55e", // Verde esmeralda / neon
  "#e11d48", // Rojo carmesí
];

function buildCaseSensitiveTextShape(count: number, text = "El tablero."): Float32Array {
  const out = new Float32Array(count * 3);
  if (typeof document === "undefined") return out;

  const W = 1400;
  const H = 420;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return out;

  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // Respeta mayúsculas y minúsculas exactas ("El tablero.")
  ctx.font = '800 225px -apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif';
  ctx.fillText(text, W / 2, H / 2);

  const img = ctx.getImageData(0, 0, W, H).data;
  const validPts: number[] = [];
  let minX = W;
  let maxX = 0;

  for (let y = 0; y < H; y += 3) {
    for (let x = 0; x < W; x += 3) {
      if (img[(y * W + x) * 4] > 110) {
        validPts.push(x, y);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
  }

  const numPts = validPts.length / 2;
  if (numPts === 0) return out;

  const bw = Math.max(1, maxX - minX);
  const cx = (minX + maxX) / 2;
  const scale = 5.4 / bw;

  for (let i = 0; i < count; i++) {
    const ix = i * 3;
    const pick = Math.floor(((i * 2654435761) >>> 0) % numPts);
    const px = validPts[pick * 2];
    const py = validPts[pick * 2 + 1];
    const waveZ = Math.sin((px - cx) * scale * 1.2) * 0.22 + (((i * 7919) % 100) / 100 - 0.5) * 0.34;
    out[ix] = (px - cx) * scale;
    out[ix + 1] = (H / 2 - py) * scale;
    out[ix + 2] = waveZ;
  }

  return out;
}

function buildProceduralShapes(count: number): Float32Array[] {
  const sText = buildCaseSensitiveTextShape(count, "El tablero."); // 0. "El tablero." (distinguiendo minúsculas y punto)
  const s0 = new Float32Array(count * 3); // 1. Nudo Toroidal Trefoil (p=2, q=3)
  const s1 = new Float32Array(count * 3); // 2. Doble Hélice / Vórtice ADN Cósmico
  const s2 = new Float32Array(count * 3); // 3. Flor Cimática 3D / Armónicos Esféricos
  const s3 = new Float32Array(count * 3); // 4. Anillo de Acreción Hiperbólico + Jets Polares

  for (let i = 0; i < count; i++) {
    const ix = i * 3;
    const u = (i / count) * Math.PI * 2;
    const v = ((i * 7919) % count) / count * Math.PI * 2;

    // --- Forma 0: Nudo Toroidal (p=2, q=3) con espesor tubular ---
    {
      const t = u * 3;
      const p = 2;
      const q = 3;
      const tubeR = 0.36 + 0.14 * Math.sin(v * 3);
      const r = 1.65 + 0.68 * Math.cos(q * t);
      const cx = r * Math.cos(p * t);
      const cy = r * Math.sin(p * t);
      const cz = -0.85 * Math.sin(q * t);
      s0[ix] = cx + Math.cos(v) * tubeR;
      s0[ix + 1] = cy * 0.78 + Math.sin(v) * tubeR;
      s0[ix + 2] = cz + Math.sin(v * 2) * 0.25;
    }

    // --- Forma 1: Doble Hélice / Galaxia Espiral Entrelazada ---
    {
      const strand = i % 2 === 0 ? 1 : -1;
      const turns = 4.2;
      const yNorm = (i / count) * 2 - 1; // -1 a 1
      const theta = yNorm * Math.PI * turns + (strand === 1 ? 0 : Math.PI);
      const radius = 1.55 * Math.sqrt(1 - yNorm * yNorm * 0.42);
      const spread = (Math.sin(v * 5) * 0.24);
      const isRung = i % 9 === 0;
      if (isRung) {
        const lerpS = ((i % 90) / 90) * 2 - 1;
        s1[ix] = Math.cos(theta) * radius * lerpS;
        s1[ix + 1] = yNorm * 2.15;
        s1[ix + 2] = Math.sin(theta) * radius * lerpS;
      } else {
        s1[ix] = Math.cos(theta) * (radius + spread);
        s1[ix + 1] = yNorm * 2.15 + Math.cos(v) * 0.12;
        s1[ix + 2] = Math.sin(theta) * (radius + spread);
      }
    }

    // --- Forma 2: Cimática 3D / Esfera de Lissajous Armónica ---
    {
      const phi = Math.acos(1 - 2 * ((i + 0.5) / count));
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      const harmonic =
        1.15 +
        0.75 * Math.sin(3 * phi) * Math.cos(4 * theta) +
        0.35 * Math.cos(5 * phi);
      const rad = harmonic * 1.38;
      s2[ix] = rad * Math.sin(phi) * Math.cos(theta);
      s2[ix + 1] = rad * Math.sin(phi) * Math.sin(theta) * 0.85;
      s2[ix + 2] = rad * Math.cos(phi);
    }

    // --- Forma 3: Singularity Vortex (Disco de Acreción + Espirales Polares) ---
    {
      if (i < count * 0.74) {
        const idxNorm = i / (count * 0.74);
        const r = 0.65 + Math.pow(idxNorm, 0.72) * 3.1;
        const spiralAngle = u * 18 + 3.2 / (r + 0.2);
        const warpY = Math.sin(spiralAngle * 2) * (0.28 / (r * 0.7 + 0.4));
        s3[ix] = Math.cos(spiralAngle) * r;
        s3[ix + 1] = warpY + (Math.cos(v) * 0.08) * (r * 0.35);
        s3[ix + 2] = Math.sin(spiralAngle) * r;
      } else {
        const jetNorm = (i - count * 0.74) / (count * 0.26); // 0..1
        const sign = i % 2 === 0 ? 1 : -1;
        const y = sign * (0.25 + jetNorm * 2.35);
        const jetR = 0.14 + Math.pow(jetNorm, 1.5) * 0.65;
        const jetAng = jetNorm * Math.PI * 14 + v;
        s3[ix] = Math.cos(jetAng) * jetR;
        s3[ix + 1] = y;
        s3[ix + 2] = Math.sin(jetAng) * jetR;
      }
    }
  }

  return [sText, s0, s1, s2, s3];
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

// Cuerpo del vinilo negro con surcos y reflejo; SOLO el sello central toma el color (blanco, verde o rojo)
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

    // Sello central: blanco, verde o rojo
    if (r < 0.20) {
      float innerRim = smoothstep(0.20, 0.17, r);
      vec3 labelCol = vColor * (0.94 + 0.12 * innerRim);
      gl_FragColor = vec4(labelCol, 0.98);
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
  const shapes = useMemo(() => buildProceduralShapes(count), [count]);

  const { currentPositions, colors, phases } = useMemo(() => {
    const currPos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const ph = new Float32Array(count);

    const parsedColors = VINYL_PALETTE.map((hex) => new THREE.Color(hex));

    for (let i = 0; i < count; i++) {
      const ix = i * 3;
      currPos[ix] = shapes[0][ix];
      currPos[ix + 1] = shapes[0][ix + 1];
      currPos[ix + 2] = shapes[0][ix + 2];

      ph[i] = Math.random() * Math.PI * 2;

      const colorPick = parsedColors[i % parsedColors.length];
      col[ix] = colorPick.r;
      col[ix + 1] = colorPick.g;
      col[ix + 2] = colorPick.b;
    }

    return { currentPositions: currPos, colors: col, phases: ph };
  }, [count, shapes]);

  const uniforms = useMemo(() => ({ uSize: { value: 0.056 } }), []);

  useFrame(({ pointer }, dt) => {
    const clampedDt = Math.min(0.033, Math.max(0.001, dt));
    simTimeRef.current += clampedDt;
    const t = simTimeRef.current;

    const arr = pointsRef.current.geometry.attributes.position.array as Float32Array;

    // Cada 6.5 segundos transiciona suavemente a la siguiente escultura procedural 3D
    const stageDuration = 6.5;
    const totalStages = shapes.length;
    const stageFloat = (t / stageDuration) % totalStages;
    const stageIdx = Math.floor(stageFloat);
    const nextStageIdx = (stageIdx + 1) % totalStages;
    const localPhase = stageFloat - stageIdx;

    // Mantiene la forma 4.2s y hace morph suave durante 2.3s
    const rawMorph = Math.max(0, Math.min(1, (localPhase - 0.58) / 0.42));
    const smoothMorph = 0.5 - 0.5 * Math.cos(rawMorph * Math.PI);

    const shapeA = shapes[stageIdx];
    const shapeB = shapes[nextStageIdx];

    const mx = pointer.x * 2.2;
    const my = pointer.y * 1.6;
    const step = Math.min(0.2, clampedDt * 4.8);

    for (let i = 0; i < count; i++) {
      const ix = i * 3;
      const phi = phases[i];

      const ax = shapeA[ix];
      const ay = shapeA[ix + 1];
      const az = shapeA[ix + 2];

      const bx = shapeB[ix];
      const by = shapeB[ix + 1];
      const bz = shapeB[ix + 2];

      // Onda orgánica procedural sobre la geometría
      const waveX = Math.cos(t * 1.35 + phi) * 0.055;
      const waveY = Math.sin(t * 1.15 + phi * 1.3) * 0.055;
      const waveZ = Math.sin(t * 0.95 + phi * 0.7) * 0.055;

      let tx = THREE.MathUtils.lerp(ax, bx, smoothMorph) + waveX;
      let ty = THREE.MathUtils.lerp(ay, by, smoothMorph) + waveY;
      let tz = THREE.MathUtils.lerp(az, bz, smoothMorph) + waveZ;

      // Interacción magnética suave con el puntero
      const dx = tx - mx;
      const dy = ty - my;
      const d2 = dx * dx + dy * dy;
      if (d2 < 1.35 && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        const push = ((1.16 - d) / 1.16) * 0.36;
        tx += (dx / d) * push;
        ty += (dy / d) * push;
        tz += push * 0.25;
      }

      arr[ix] += (tx - arr[ix]) * step;
      arr[ix + 1] += (ty - arr[ix + 1]) * step;
      arr[ix + 2] += (tz - arr[ix + 2]) * step;
    }

    const isTextStage = stageIdx === 0 ? 1 - smoothMorph : nextStageIdx === 0 ? smoothMorph : 0;
    const targetRotY = THREE.MathUtils.lerp(
      Math.sin(t * 0.42) * 0.68 + pointer.x * 0.28,
      Math.sin(t * 0.45) * 0.16 + pointer.x * 0.22,
      isTextStage
    );
    const targetRotZ = THREE.MathUtils.lerp(Math.cos(t * 0.24) * 0.09, 0, isTextStage);
    pointsRef.current.rotation.y += (targetRotY - pointsRef.current.rotation.y) * 0.08;
    pointsRef.current.rotation.x = Math.sin(t * 0.32) * 0.14 - pointer.y * 0.16;
    pointsRef.current.rotation.z += (targetRotZ - pointsRef.current.rotation.z) * 0.08;
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
  onEnterAsGuest,
  autoOpenSubscribe = false,
  prefilledInvite = null,
  inviteLinkError = "",
  onOpenGoogleAuth,
  onSetAccountRole,
}: {
  onEnterAsGuest?: () => void;
  /** Volviendo del modo explorar con "Suscribirme": abre directo el modal */
  autoOpenSubscribe?: boolean;
  /** Entró por un link /invite/:code válido: el modal se abre con el pase ya puesto */
  prefilledInvite?: { code: string; creatorHandle?: string; creatorName?: string } | null;
  inviteLinkError?: string;
  onOpenGoogleAuth?: () => void;
  onSetAccountRole?: (role: "artista" | "oyente") => void;
}) {
  const [inviteModalOpen, setInviteModalOpen] = useState(autoOpenSubscribe);
  const [inviteCode, setInviteCode] = useState("");

  // Link de invitación: abrir "Suscribirme" con el pase ya copiado y dejar la URL limpia
  useEffect(() => {
    if (!prefilledInvite?.code) return;
    setInviteCode(prefilledInvite.code);
    setErrorMsg("");
    setInviteModalOpen(true);
    try {
      if (window.location.pathname.startsWith("/invite/")) window.history.replaceState(null, "", "/");
    } catch {}
  }, [prefilledInvite?.code]);

  useEffect(() => {
    if (!inviteLinkError) return;
    setErrorMsg(`${inviteLinkError} Pedile un pase nuevo a quien te invitó.`);
    try {
      if (window.location.pathname.startsWith("/invite/")) window.history.replaceState(null, "", "/");
    } catch {}
  }, [inviteLinkError]);
  const [chosenRole, setChosenRole] = useState<"artista" | "oyente">("artista");
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Si un intento de suscripción fue rechazado (sin pase válido), mostrar el motivo
  useEffect(() => {
    try {
      const msg = localStorage.getItem("eltablero_auth_error");
      if (msg) {
        setErrorMsg(msg);
        localStorage.removeItem("eltablero_auth_error");
      }
    } catch {}
  }, []);

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

    const clean = inviteCode
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\/[^/]+\/(invite\/)?/, "")
      .replace(/\/+$/, "");

    setLoading(true);
    const res = await validateInviteCode(clean);
    if (!res.valid) {
      setLoading(false);
      sfx.close();
      setErrorMsg(res.error || "Código de invitación inválido.");
      return;
    }
    setPendingInviteCode(clean);

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
          <MicroDiscsSwarm count={isMobile ? 3800 : 7600} />
        </Canvas>
      </div>

      <header className="landing-top-bar">
        <div className="landing-brand-tag">
          <span className="brand-dot" />
          <span>El tablero.</span>
        </div>
      </header>

      <div className="landing-center-content">
        <span className="mono-tag" style={{ letterSpacing: "0.22em", marginBottom: 12 }}>
          SUSCRIPCIÓN GRATIS · POR INVITACIÓN
        </span>

        <h1 className="landing-display-title">El tablero.</h1>

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
            Suscribirme
          </button>
          <span className="landing-pill-divider" />
          <button
            type="button"
            className="landing-pill-btn"
            disabled={loading}
            onClick={handleDirectSignIn}
          >
            {loading ? "Conectando..." : "Ya estoy suscrito"}
          </button>
        </div>

        {onEnterAsGuest && (
          <button type="button" className="landing-explore-link" onClick={() => { sfx.tap(); onEnterAsGuest(); }}>
            Explorar sin suscribirme →
          </button>
        )}

        {errorMsg && !inviteModalOpen && (
          <small style={{ color: "#e11d48", marginTop: 10, fontSize: "0.78rem" }}>{errorMsg}</small>
        )}
      </div>

      <footer className="landing-legal-links">
        <a href="/privacidad">Privacidad</a>
        <span>·</span>
        <a href="/terminos">Términos</a>
      </footer>

      {inviteModalOpen && (
        <div className="apple-modal-backdrop" onClick={() => setInviteModalOpen(false)}>
          <div className="apple-modal-card narrow" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <span className="mono-tag">SUSCRIPCIÓN // EL TABLERO.</span>
                <h3>Suscribirme a El tablero.</h3>
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

            <p className="subscribe-explainer">Es gratis. Solo necesitás un pase.</p>

            {prefilledInvite?.code && inviteCode === prefilledInvite.code && (
              <div className="landing-invite-from">
                <span className="landing-invite-check" aria-hidden>✓</span>
                <span>
                  Te invitó <b>{prefilledInvite.creatorName || "alguien de la escena"}</b>
                  {prefilledInvite.creatorHandle ? ` (${prefilledInvite.creatorHandle})` : ""}. Tu pase es válido.
                </span>
              </div>
            )}

            <form onSubmit={handleValidateAndRegister} className="modal-form-grid single-col">
              <label className="modal-field">
                <span>TU PASE DE INVITACIÓN</span>
                <input
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  placeholder="board-xxxxxx o el link de invitación"
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
                  {loading ? "Conectando..." : "Suscribirme con Google →"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
