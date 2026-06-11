"use client";

// Live 3D view of the selected Stargate printer: bed grid, deposited-path
// trail, and a glowing melt-pool sphere at the current toolhead position whose
// color tracks temperature (white-hot nominal -> dark red in the anomaly band).
// Imported with next/dynamic ssr:false — three.js renders client-side only.

import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { TelemetryPoint } from "@/lib/lab/stargateStream";

const BED_MM = 600;
const SCENE_SPAN = 6; // bed maps to 6x6 scene units
const HEIGHT_SCALE = 0.2; // mm of z -> scene units (layers are 0.8mm; exaggerate)

function toScene(p: TelemetryPoint): [number, number, number] {
  return [
    (p.x / BED_MM) * SCENE_SPAN - SCENE_SPAN / 2,
    Math.max(0.02, p.z * HEIGHT_SCALE),
    (p.y / BED_MM) * SCENE_SPAN - SCENE_SPAN / 2,
  ];
}

export function meltPoolColor(tempC: number): THREE.Color {
  // < 1400: anomaly band, deep red. 1400-1480: amber. >= 1480: toward white-hot.
  if (tempC < 1400) return new THREE.Color("#a31515");
  if (tempC < 1480) {
    const t = (tempC - 1400) / 80;
    return new THREE.Color().lerpColors(new THREE.Color("#d9542b"), new THREE.Color("#f3b14a"), t);
  }
  const t = Math.min(1, (tempC - 1480) / 120);
  return new THREE.Color().lerpColors(new THREE.Color("#f3b14a"), new THREE.Color("#fff6e0"), t);
}

function Trail({ points }: { points: TelemetryPoint[] }) {
  const line = useMemo(() => {
    const positions = new Float32Array(points.length * 3);
    points.forEach((p, i) => {
      const [x, y, z] = toScene(p);
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const material = new THREE.LineBasicMaterial({ color: "#3fb1e8", transparent: true, opacity: 0.55 });
    return new THREE.Line(geometry, material);
  }, [points]);
  return <primitive object={line} />;
}

function MeltPool({ point }: { point: TelemetryPoint }) {
  const color = meltPoolColor(point.melt_pool_temp_c);
  const [x, y, z] = toScene(point);
  const intensity = point.melt_pool_temp_c < 1400 ? 1.2 : 2.4;
  return (
    <group position={[x, y, z]}>
      <mesh>
        <sphereGeometry args={[0.09, 24, 24]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2.2} />
      </mesh>
      <pointLight color={color} intensity={intensity} distance={3.2} />
    </group>
  );
}

function SlowOrbit({ children }: { children: React.ReactNode }) {
  const group = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (group.current) group.current.rotation.y += delta * 0.12;
  });
  return <group ref={group}>{children}</group>;
}

export default function PrinterHead3D({ points }: { points: TelemetryPoint[] }) {
  const latest = points.length ? points[points.length - 1] : null;
  return (
    <div style={{ width: "100%", height: 340, borderRadius: 8, overflow: "hidden", background: "#06090d" }}>
      <Canvas camera={{ position: [5.5, 4.5, 7.5], fov: 42 }}>
        <ambientLight intensity={0.25} />
        <directionalLight position={[8, 10, 6]} intensity={0.35} />
        <SlowOrbit>
          <gridHelper args={[SCENE_SPAN, 12, "#22303f", "#141d28"]} position={[0, 0, 0]} />
          {points.length > 1 && <Trail points={points} />}
          {latest && <MeltPool point={latest} />}
        </SlowOrbit>
      </Canvas>
    </div>
  );
}
