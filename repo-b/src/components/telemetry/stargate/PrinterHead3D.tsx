"use client";

// Live 3D view of the selected Stargate printer: bed grid, deposited-path
// trail, and a glowing melt-pool sphere at the current toolhead position whose
// color tracks temperature (white-hot nominal -> dark red in the anomaly band).
// Imported with next/dynamic ssr:false — three.js renders client-side only.
//
// Degrades, never escalates: browsers without WebGL (or with a renderer that
// throws) get a styled fallback panel in the same slot. The rest of the
// console — chart, anomaly ticker, DLQ — needs no WebGL and must keep working;
// a throw here must never reach the lab route's error boundary.

import { Canvas, useFrame } from "@react-three/fiber";
import React, { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { C } from "../primitives";
import type { TelemetryPoint } from "@/lib/lab/stargateStream";

const BED_MM = 600;
const SCENE_SPAN = 6; // bed maps to 6x6 scene units
const HEIGHT_SCALE = 0.2; // mm of z -> scene units (layers are 0.8mm; exaggerate)
const VIEW_HEIGHT = 340;

/** True when the browser can hand out a WebGL context. Probed once before the
 * R3F canvas mounts so an unsupported browser renders the fallback instead of
 * throwing "Error creating WebGL context" into the route error boundary. */
export function webglSupported(
  createCanvas: () => HTMLCanvasElement = () => document.createElement("canvas"),
): boolean {
  try {
    const canvas = createCanvas();
    return Boolean(canvas.getContext("webgl2")) || Boolean(canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

export function WebglFallback({ reason }: { reason: string }) {
  return (
    <div
      data-testid="printerhead-3d-fallback"
      style={{
        width: "100%", height: VIEW_HEIGHT, borderRadius: 8, background: "#06090d",
        border: `1px dashed ${C.borderHi}`, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 8, padding: 16,
      }}
    >
      <span style={{ fontFamily: C.mono, fontSize: 12, color: C.amber }}>
        3D toolhead view unavailable — {reason}
      </span>
      <span style={{ fontFamily: C.mono, fontSize: 11, color: C.faint, textAlign: "center", lineHeight: 1.6 }}>
        The live chart, anomaly ticker, and dead-letter feed do not use WebGL and are unaffected.
      </span>
    </div>
  );
}

/** Local boundary: a renderer throw (context loss, driver quirks) degrades to
 * the fallback panel instead of escalating to the route error boundary. */
class CanvasErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return <WebglFallback reason="the 3D renderer failed in this browser" />;
    }
    return this.props.children;
  }
}

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
  // Probe once on mount (client-only component; ssr:false). useState initializer
  // keeps the probe out of the render loop.
  const [supported] = useState(() => webglSupported());
  if (!supported) {
    return <WebglFallback reason="this browser does not support WebGL" />;
  }

  const latest = points.length ? points[points.length - 1] : null;
  return (
    <CanvasErrorBoundary>
      <div style={{ width: "100%", height: VIEW_HEIGHT, borderRadius: 8, overflow: "hidden", background: "#06090d" }}>
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
    </CanvasErrorBoundary>
  );
}
