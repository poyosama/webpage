"use client";

/**
 * Partículas del reproductor — versión GPU.
 * Todo el movimiento vive en el shader (la placa de video): por cuadro el procesador solo actualiza
 * un puñado de uniforms (tiempo, pulso del 808, colores). Nada de recorrer miles de posiciones en JS.
 *
 * Qué se ve:
 * - Una forma por track (según `seed`) hecha de "cinta" volumétrica + un polvo lejano desenfocado → profundidad.
 * - Flujo orgánico tipo humo, titileo propio de cada partícula.
 * - 808: una onda que viaja del centro hacia afuera (no un empujón parejo) + destello de tamaño.
 * - Escenario oscuro: mezcla aditiva (las zonas densas brillan). Claro: tinta nítida.
 */
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { sfx } from "@/lib/sfx";
import { isLowPowerDevice } from "@/lib/perf";

const VERT = /* glsl */ `
  uniform float uTime;
  uniform float uPulse;
  uniform float uScale;   // px por unidad de mundo a distancia 1
  uniform float uSize;
  uniform float uMaxPx;   // tope de tamaño en pantalla (evita manchas gigantes)
  uniform vec3 uColA;
  uniform vec3 uColB;
  uniform vec3 uInk;
  attribute vec4 aSeed;   // x: fase 0..1 · y: tamaño · z: velocidad · w: mezcla de color
  attribute vec3 aDir;    // hacia dónde sale con el golpe
  attribute float aFade;  // 1 = cinta, <1 = polvo lejano
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vec3 p = position;
    float ph = aSeed.x * 6.2831853;
    float t = uTime * 0.2 * aSeed.z;

    // flujo orgánico (humo): tres ondas desfasadas por partícula, baratas y sin texturas
    p += 0.11 * vec3(
      sin(t + ph + p.y * 1.7),
      cos(t * 1.13 + ph * 1.31 + p.z * 1.5),
      sin(t * 0.87 + ph * 0.71 + p.x * 1.6)
    );

    // 808: anillo que viaja hacia afuera desde el centro
    float r = length(p);
    float ring = 0.5 + 0.5 * sin(r * 3.4 - uTime * 2.6);
    p += aDir * uPulse * (0.55 + 0.75 * ring);
    p *= 1.0 + uPulse * 0.08;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float depth = max(0.1, -mv.z);

    float twinkle = 0.72 + 0.28 * sin(uTime * 1.7 * aSeed.z + ph * 3.0);
    gl_PointSize = min(uMaxPx, uSize * aSeed.y * twinkle * (1.0 + uPulse * 1.1 * ring) * uScale / depth);

    vec3 base = mix(uColA, uColB, aSeed.w);
    vColor = mix(base, uInk, step(0.7, fract(aSeed.x * 7.31)));
    // los del fondo se apagan; el polvo es más tenue
    // (y los que pasan muy cerca de la cámara se desvanecen en vez de volverse manchas)
    vAlpha = smoothstep(9.5, 3.4, depth) * smoothstep(1.3, 2.7, depth) * (0.5 + 0.5 * twinkle) * aFade;
  }
`;

const FRAG = /* glsl */ `
  uniform float uOpacity;
  uniform float uSoft;    // 0 = disco nítido (claro) · 1 = halo suave (oscuro)
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;        // 0 centro → 1 borde
    float disc = smoothstep(1.0, mix(0.72, 0.0, uSoft), d);
    float a = disc * mix(1.0, disc, uSoft) * vAlpha * uOpacity;
    if (a < 0.004) discard;
    gl_FragColor = vec4(vColor, a);
  }
`;

/** Color legible sobre el escenario (si el del track se pierde contra el fondo, se corrige) */
function contrast(hex: string, isDark: boolean, fallbackDark: string): THREE.Color {
  try {
    const c = new THREE.Color(hex);
    const lum = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
    if (!isDark && lum > 0.55) return new THREE.Color(fallbackDark);
    if (isDark && lum < 0.18) return new THREE.Color("#e4e4e7");
    return c;
  } catch {
    return new THREE.Color(isDark ? "#ffffff" : fallbackDark);
  }
}

// aleatorio determinístico: misma forma para el mismo track
function rng(seed: number) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

export default function PlayerParticles({
  accent,
  c2,
  impulseSignal,
  isDarkStage,
  seed,
}: {
  accent: string;
  c2: string;
  impulseSignal: number;
  isDarkStage: boolean;
  seed: number;
}) {
  const pointsRef = useRef<THREE.Points>(null!);
  const lastImpulse = useRef(impulseSignal);
  const disp = useRef(0);
  const vel = useRef(0);
  const tilt = useRef({ x: 0, z: 0 });

  // Menos partículas que antes (16k/6k/2,8k): al moverse en la GPU y tener profundidad, rinden más
  const count = useMemo(() => {
    if (typeof window !== "undefined" && window.innerWidth <= 720) return 2200;
    if (isLowPowerDevice()) return 4200;
    return 9000;
  }, []);

  const geometry = useMemo(() => {
    const rand = rng(seed + 11);
    const gauss = () => (rand() + rand() + rand() + rand() - 2) * 0.5; // ~campana
    const pos = new Float32Array(count * 3);
    const dir = new Float32Array(count * 3);
    const sd = new Float32Array(count * 4);
    const fade = new Float32Array(count);
    const shape = ((seed % 4) + 4) % 4;
    const dust = Math.floor(count * 0.14);

    for (let i = 0; i < count; i++) {
      const ix = i * 3;
      let x: number, y: number, z: number;
      const isDust = i < dust;
      if (isDust) {
        // polvo lejano: cáscara ancha alrededor de la forma
        const u = rand() * 2 - 1;
        const th = rand() * Math.PI * 2;
        const rr = 2.6 + rand() * 2.4;
        const s = Math.sqrt(1 - u * u);
        x = s * Math.cos(th) * rr * 1.25;
        y = u * rr * 0.8;
        z = s * Math.sin(th) * rr - 0.6;
      } else {
        const f = (i - dust) / (count - dust);
        const thick = 0.045 + 0.075 * rand() * rand(); // grosor de la cinta (fina, con algunos hilos sueltos)
        if (shape === 1) {
          // nudo de trébol
          const tt = f * Math.PI * 2 * 5;
          x = (Math.sin(tt) + 2 * Math.sin(2 * tt)) * 0.62;
          y = (Math.cos(tt) - 2 * Math.cos(2 * tt)) * 0.62;
          z = -Math.sin(3 * tt) * 1.05;
        } else if (shape === 2) {
          // doble hélice
          const a = f * Math.PI * 2 * 6 + ((i & 1) ? Math.PI : 0);
          const rad = 1.25 + 0.2 * Math.sin(f * Math.PI * 4);
          x = Math.cos(a) * rad;
          z = Math.sin(a) * rad;
          y = (f * 2 - 1) * 2.4;
        } else if (shape === 3) {
          // esfera con relieve
          const phi = Math.acos(1 - 2 * f);
          const th = Math.PI * (1 + Math.sqrt(5)) * i;
          const rr = 1.95 + Math.sin(phi * 6) * 0.2;
          x = Math.sin(phi) * Math.cos(th) * rr;
          y = Math.cos(phi) * rr;
          z = Math.sin(phi) * Math.sin(th) * rr;
        } else {
          // galaxia de cintas
          const u = f * Math.PI * 26;
          const st = i % 5;
          const rr = 0.5 + f * 2.4;
          x = Math.cos(u + st) * rr;
          y = Math.sin(u * 1.5 - st) * rr * 0.62;
          z = Math.sin(u * 0.7 + st) * 1.55;
        }
        x += gauss() * thick * 2;
        y += gauss() * thick * 2;
        z += gauss() * thick * 2;
      }
      pos[ix] = x;
      pos[ix + 1] = y;
      pos[ix + 2] = z;

      // dirección del golpe: hacia afuera + algo de azar
      const len = Math.hypot(x, y, z) || 1;
      let dx = x / len + (rand() - 0.5) * 1.2;
      let dy = y / len + (rand() - 0.5) * 1.2;
      let dz = z / len + (rand() - 0.5) * 1.2;
      const dl = Math.hypot(dx, dy, dz) || 1;
      const strength = (0.2 + Math.pow(rand(), 0.7) * 0.42) * (isDust ? 0.5 : 1);
      dir[ix] = (dx / dl) * strength;
      dir[ix + 1] = (dy / dl) * strength;
      dir[ix + 2] = (dz / dl) * strength;

      const i4 = i * 4;
      sd[i4] = rand();
      // tamaños variados: muchas chicas, pocas grandes; el polvo es grande y blando
      sd[i4 + 1] = isDust ? 1.3 + rand() * 1.5 : 0.42 + Math.pow(rand(), 3.2) * 1.9;
      sd[i4 + 2] = 0.6 + rand() * 0.9;
      sd[i4 + 3] = rand();
      fade[i] = isDust ? 0.22 : 1;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aDir", new THREE.BufferAttribute(dir, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(sd, 4));
    g.setAttribute("aFade", new THREE.BufferAttribute(fade, 1));
    return g;
  }, [count, seed]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        uniforms: {
          uTime: { value: 0 },
          uPulse: { value: 0 },
          uScale: { value: 600 },
          uSize: { value: 0.05 },
          uMaxPx: { value: 40 },
          uOpacity: { value: 0.8 },
          uSoft: { value: 1 },
          uColA: { value: new THREE.Color("#ffffff") },
          uColB: { value: new THREE.Color("#ffffff") },
          uInk: { value: new THREE.Color("#ffffff") },
        },
      }),
    []
  );
  useEffect(() => () => material.dispose(), [material]);

  // Colores y modo según el track y el escenario (sin rearmar la geometría)
  useEffect(() => {
    const u = material.uniforms;
    u.uColA.value.copy(contrast(accent, isDarkStage, "#09090b"));
    u.uColB.value.copy(contrast(c2, isDarkStage, "#27272a"));
    u.uInk.value.set(isDarkStage ? "#ffffff" : "#09090b");
    u.uSoft.value = isDarkStage ? 1 : 0.3;
    u.uOpacity.value = isDarkStage ? 0.7 : 0.82;
    u.uSize.value = isDarkStage ? 0.046 : 0.024;
    material.blending = isDarkStage ? THREE.AdditiveBlending : THREE.NormalBlending;
    material.needsUpdate = true;
  }, [material, accent, c2, isDarkStage]);

  useFrame(({ clock, pointer, size, camera, gl }, dt) => {
    const mobile = size.width <= 720 ? 0.38 : 1;
    const d = Math.min(0.033, dt);
    const { eightOhEight } = sfx.sampleReactiveLevels();

    // toque / cambio de track: empujón
    if (impulseSignal !== lastImpulse.current) {
      lastImpulse.current = impulseSignal;
      disp.current += 0.22 * mobile;
    }
    // resorte hacia la energía del 808 (golpea rápido, vuelve elástico)
    const target = Math.pow(eightOhEight, 0.9) * 0.34 * mobile;
    const acc = -28 * (disp.current - target) - 8.2 * vel.current;
    vel.current += acc * d;
    disp.current += vel.current * d;
    if (disp.current < 0) {
      disp.current = 0;
      vel.current = 0;
    }

    const u = material.uniforms;
    u.uTime.value = clock.elapsedTime;
    u.uPulse.value = disp.current;
    const cam = camera as THREE.PerspectiveCamera;
    u.uScale.value = (gl.getPixelRatio() * size.height * 0.5) / Math.tan((cam.fov * Math.PI) / 360);
    u.uMaxPx.value = gl.getPixelRatio() * (size.width <= 720 ? 22 : 30);

    const pts = pointsRef.current;
    if (pts) {
      // giro lento + inclinación suave siguiendo el mouse (con inercia)
      tilt.current.x += (-pointer.y * 0.07 - tilt.current.x) * Math.min(1, d * 3);
      tilt.current.z += (pointer.x * 0.05 - tilt.current.z) * Math.min(1, d * 3);
      pts.rotation.y += d * 0.04;
      pts.rotation.x = Math.sin(clock.elapsedTime * 0.1) * 0.03 + tilt.current.x;
      pts.rotation.z = tilt.current.z;
      // la figura entra entera: más chica en pantallas angostas
      const fit = size.width / size.height < 0.8 ? 0.6 : 0.84;
      pts.scale.setScalar(fit * (1 + Math.sin(clock.elapsedTime * 0.8) * 0.012));
    }
  });

  return <points ref={pointsRef} geometry={geometry} material={material} frustumCulled={false} />;
}
