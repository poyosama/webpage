"use client";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { RoundedBox, Edges } from "@react-three/drei";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { sfx } from "@/lib/sfx";

export type Face = { id: string; label: string; sub: string; glyph: string };

// Orientación del cubo para cada cara: 4 en el anillo horizontal + la de arriba.
export const FACE_ROT: [number, number][] = [
  [0, 0],                 // frente
  [0, -Math.PI / 2],      // derecha
  [0, Math.PI],           // atrás
  [0, Math.PI / 2],       // izquierda
  [Math.PI / 2, 0],       // arriba
];
// posición/rotación de cada cara en el espacio local del cubo
const FACE_LOCAL: { p: [number, number, number]; r: [number, number, number] }[] = [
  { p: [0, 0, 1.001], r: [0, 0, 0] },
  { p: [1.001, 0, 0], r: [0, Math.PI / 2, 0] },
  { p: [0, 0, -1.001], r: [0, Math.PI, 0] },
  { p: [-1.001, 0, 0], r: [0, -Math.PI / 2, 0] },
  { p: [0, 1.001, 0], r: [-Math.PI / 2, 0, 0] },
];

/* ---------- nebulosa (shader fbm) ---------- */
const nebulaFrag = `
uniform float uTime; uniform vec2 uMouse; varying vec3 vPos;
float hash(vec3 p){ p=fract(p*0.3183099+.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float noise(vec3 x){ vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z); }
float fbm(vec3 p){ float v=0.0; float a=0.5; for(int i=0;i<6;i++){ v+=a*noise(p); p*=2.03; a*=0.5; } return v; }
void main(){
  vec3 d = normalize(vPos);
  vec3 q = d*2.2 + vec3(uMouse*0.15, uTime*0.015);
  float n = fbm(q + fbm(q*1.7 + uTime*0.02));
  float n2 = fbm(q*3.0 - uTime*0.01);
  vec3 deep = vec3(0.01,0.0,0.03);
  vec3 c1 = vec3(0.35,0.02,0.12);   // carmesí
  vec3 c2 = vec3(0.10,0.05,0.45);   // violeta
  vec3 c3 = vec3(0.9,0.45,0.75);    // brillo rosado
  vec3 col = mix(deep, c2, smoothstep(0.35,0.75,n));
  col = mix(col, c1, smoothstep(0.5,0.9,n2)*0.8);
  col += c3 * pow(smoothstep(0.62,0.95,n*n2*1.6),3.0)*0.6;
  float s = step(0.9985, hash(floor(d*400.0)));
  col += s * vec3(0.9,0.9,1.0) * (0.5+0.5*sin(uTime*2.0+hash(floor(d*400.0))*30.0));
  gl_FragColor = vec4(col,1.0);
}`;
const nebulaVert = `varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;

function Nebula() {
  const mat = useRef<THREE.ShaderMaterial>(null!);
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uMouse: { value: new THREE.Vector2() } }), []);
  useFrame(({ clock, pointer }) => {
    uniforms.uTime.value = clock.elapsedTime;
    uniforms.uMouse.value.lerp(pointer, 0.03);
  });
  return (
    <mesh scale={50}>
      <sphereGeometry args={[1, 48, 48]} />
      <shaderMaterial ref={mat} side={THREE.BackSide} uniforms={uniforms} vertexShader={nebulaVert} fragmentShader={nebulaFrag} depthWrite={false} />
    </mesh>
  );
}

function Dust() {
  const ref = useRef<THREE.Points>(null!);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const n = 600, a = new Float32Array(n * 3);
    for (let i = 0; i < n * 3; i++) a[i] = (Math.random() - 0.5) * 24;
    g.setAttribute("position", new THREE.BufferAttribute(a, 3));
    return g;
  }, []);
  useFrame((_, dt) => { ref.current.rotation.y += dt * 0.01; ref.current.rotation.x += dt * 0.004; });
  return (
    <points ref={ref} geometry={geo}>
      <pointsMaterial size={0.03} color="#ffd6f0" transparent opacity={0.6} sizeAttenuation depthWrite={false} />
    </points>
  );
}

/* ---------- textura de cada cara ---------- */
function faceTexture(f: Face) {
  const c = document.createElement("canvas");
  c.width = c.height = 1024;
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, 1024, 1024);
  // marco fino + esquinas
  g.strokeStyle = "rgba(255,220,240,0.55)"; g.lineWidth = 3;
  g.strokeRect(70, 70, 884, 884);
  g.strokeStyle = "rgba(255,255,255,0.95)"; g.lineWidth = 8;
  const L = 70;
  [[70, 70, 1, 1], [954, 70, -1, 1], [70, 954, 1, -1], [954, 954, -1, -1]].forEach(([x, y, sx, sy]) => {
    g.beginPath(); g.moveTo(x, y + L * sy); g.lineTo(x, y); g.lineTo(x + L * sx, y); g.stroke();
  });
  g.textAlign = "center";
  g.fillStyle = "rgba(255,255,255,0.95)";
  g.font = "300 260px sans-serif";
  g.fillText(f.glyph, 512, 470);
  g.font = "600 92px Michroma, sans-serif";
  g.shadowColor = "#ff7ac8"; g.shadowBlur = 30;
  g.fillText(f.label.toUpperCase(), 512, 660);
  g.shadowBlur = 0;
  g.font = "38px monospace";
  g.fillStyle = "rgba(255,220,240,0.6)";
  g.fillText(f.sub, 512, 740);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function Cube({ faces, index, compact, drag, onEnter }: {
  faces: Face[]; index: number; compact: boolean;
  drag: React.RefObject<{ x: number; y: number }>; onEnter: () => void;
}) {
  const group = useRef<THREE.Group>(null!);
  const inner = useRef<THREE.Mesh>(null!);
  const pos = useRef(new THREE.Vector3());
  const texes = useMemo(() => faces.map(faceTexture), [faces]);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const e = useMemo(() => new THREE.Euler(), []);
  const { viewport } = useThree();

  useFrame(({ clock }, dt) => {
    const [rx, ry] = FACE_ROT[index];
    const t = clock.elapsedTime;
    // snap + un poquito de "respiración" y el arrastre como tensión elástica
    e.set(rx + drag.current.y * 0.35 + Math.sin(t * 0.6) * 0.03, ry + drag.current.x * 0.35 + Math.cos(t * 0.5) * 0.04, 0, "YXZ");
    q.setFromEuler(e);
    group.current.quaternion.slerp(q, 1 - Math.pow(0.0008, dt));
    const target = compact
      ? new THREE.Vector3(-viewport.width / 2 + 0.9, viewport.height / 2 - 0.9, 0)
      : new THREE.Vector3(0, 0.1, 0);
    pos.current.lerp(target, 1 - Math.pow(0.002, dt));
    group.current.position.copy(pos.current);
    const s = THREE.MathUtils.damp(group.current.scale.x, compact ? 0.32 : 1, 8, dt);
    group.current.scale.setScalar(s);
    inner.current.rotation.x += dt * 0.4;
    inner.current.rotation.y += dt * 0.6;
  });

  return (
    <group ref={group}>
      {/* cáscara de vidrio */}
      <RoundedBox args={[2, 2, 2]} radius={0.08} smoothness={6}
        onClick={(ev) => { ev.stopPropagation(); onEnter(); }}
        onPointerOver={() => { document.body.style.cursor = "pointer"; sfx.hover(); }}
        onPointerOut={() => { document.body.style.cursor = ""; }}>
        <meshPhysicalMaterial color="#ffd9ee" transmission={0.92} thickness={1.2} roughness={0.08} ior={1.45}
          iridescence={1} iridescenceIOR={1.3} clearcoat={1} transparent opacity={0.9} envMapIntensity={1} />
        <Edges threshold={30} color="#ffe6f6" />
      </RoundedBox>
      {/* núcleo */}
      <mesh ref={inner} scale={0.55}>
        <icosahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color="#ff4fa3" emissive="#ff2f8f" emissiveIntensity={1.4} flatShading wireframe />
      </mesh>
      <pointLight color="#ff6fb8" intensity={6} distance={4} />
      {/* caras con los menús */}
      {FACE_LOCAL.map((f, i) => (
        <mesh key={i} position={f.p} rotation={f.r}>
          <planeGeometry args={[1.86, 1.86]} />
          <meshBasicMaterial map={texes[i]} transparent opacity={i === index ? 1 : 0.35} toneMapped={false} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

export default function CubeScene(props: {
  faces: Face[]; index: number; compact: boolean;
  drag: React.RefObject<{ x: number; y: number }>; onEnter: () => void;
}) {
  return (
    <Canvas className="cube-canvas" camera={{ position: [0, 0, 6.2], fov: 42 }} dpr={[1, 2]}>
      <Nebula />
      <Dust />
      <ambientLight intensity={0.5} />
      <directionalLight position={[3, 4, 5]} intensity={2} color="#fff0f8" />
      <directionalLight position={[-4, -2, -3]} intensity={1} color="#7a5cff" />
      <Cube {...props} />
    </Canvas>
  );
}
