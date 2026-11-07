"use client";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Html, Line } from "@react-three/drei";
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { artists, collabs, type Artist } from "@/lib/mock";
import { sfx } from "@/lib/sfx";

// Altura del "cerro": un pico principal + la precordillera atrás.
function h(x: number, z: number) {
  const peak = 2.2 * Math.exp(-(x * x + z * z) / 3.2);
  const ridge = 1.4 * Math.exp(-((z + 3) ** 2) / 2) * (0.6 + 0.4 * Math.sin(x * 1.3));
  const noise = 0.15 * Math.sin(x * 3.1 + z * 1.7) * Math.cos(z * 2.3);
  return peak + ridge + noise;
}

function Terrain() {
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(12, 12, 36, 36).toNonIndexed();
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, h(p.getX(i), p.getZ(i)));
    g.computeVertexNormals();
    return g;
  }, []);
  return (
    <group>
      <mesh geometry={geo}>
        <meshStandardMaterial color="#1b2340" flatShading roughness={0.9} />
      </mesh>
      <mesh geometry={geo} position={[0, 0.005, 0]}>
        <meshBasicMaterial color="#7cf7ff" wireframe transparent opacity={0.12} />
      </mesh>
    </group>
  );
}

function Node({ a, pos, onSelect, active }: { a: Artist; pos: THREE.Vector3; onSelect: (a: Artist) => void; active: boolean }) {
  const ref = useRef<THREE.Mesh>(null!);
  const [hov, setHov] = useState(false);
  useFrame(({ clock }) => {
    const s = (hov || active ? 1.6 : 1) + Math.sin(clock.elapsedTime * 2 + pos.x) * 0.1;
    ref.current.scale.setScalar(s);
  });
  return (
    <group position={pos}>
      <mesh
        ref={ref}
        onPointerOver={(e) => { e.stopPropagation(); setHov(true); sfx.hover(); document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { setHov(false); document.body.style.cursor = ""; }}
        onClick={(e) => { e.stopPropagation(); sfx.click(); onSelect(a); }}
      >
        <sphereGeometry args={[0.12, 16, 16]} />
        <meshBasicMaterial color={a.color} toneMapped={false} />
      </mesh>
      <pointLight color={a.color} intensity={hov ? 4 : 1.5} distance={1.5} />
      {(hov || active) && (
        <Html center position={[0, 0.45, 0]} className="node-label">
          <b>{a.name}</b><span>{a.role} · {a.zone}</span>
        </Html>
      )}
    </group>
  );
}

export default function CerroMap({ onSelect, selected }: { onSelect: (a: Artist) => void; selected: Artist | null }) {
  const positions = useMemo(() => {
    const m = new Map<string, THREE.Vector3>();
    artists.forEach((a, i) => {
      const ang = (i / artists.length) * Math.PI * 2;
      const r = 1.2 + (i % 3) * 0.9;
      const x = Math.cos(ang) * r, z = Math.sin(ang) * r;
      m.set(a.id, new THREE.Vector3(x, h(x, z) + 0.25, z));
    });
    return m;
  }, []);
  return (
    <div className="map">
      <Canvas camera={{ position: [6, 5, 7], fov: 40 }} dpr={[1, 2]}>
        <color attach="background" args={["#05070f"]} />
        <fog attach="fog" args={["#05070f", 9, 20]} />
        <ambientLight intensity={0.4} />
        <directionalLight position={[5, 8, 3]} intensity={1.2} color="#bcd" />
        <Terrain />
        {collabs.map(([a, b], i) => (
          <Line key={i} points={[positions.get(a)!, positions.get(b)!]} color="#7cf7ff" transparent opacity={0.45} lineWidth={1.2} />
        ))}
        {artists.map((a) => (
          <Node key={a.id} a={a} pos={positions.get(a.id)!} onSelect={onSelect} active={selected?.id === a.id} />
        ))}
        {/* sin zoom: la rueda queda para scrollear la página */}
        <OrbitControls enableZoom={false} enablePan={false} autoRotate autoRotateSpeed={0.4} maxPolarAngle={1.3} onStart={() => sfx.tick()} />
      </Canvas>
    </div>
  );
}
