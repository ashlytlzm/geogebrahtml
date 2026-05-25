import { useRef, useMemo, useState, useEffect, Suspense, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html, Sphere } from '@react-three/drei';
import * as THREE from 'three';
import { safeCompile, evalNumber } from '../lib/mathEngine';

// ── Types ─────────────────────────────────────────────────────────────
export interface Surface3D {
  id: string;
  expr: string;
  color: string;
  opacity: number;
}

export interface Point3D {
  id: string;
  x: number;
  y: number;
  z: number;
}

export interface CuttingPlane3D {
  id: string;
  expr: string;
}

interface ThreeSceneProps {
  surfaces: Surface3D[];
  planes?: CuttingPlane3D[];
  points?: Point3D[];
  isDark: boolean;
  domain?: number;
}

// ── Utility: make canvas text sprite ──────────────────────────────────
function makeTextTexture(text: string, color: string, fontSize = 28): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 128, 64);
  ctx.font = `bold ${fontSize}px Inter, Arial, sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 64, 32);
  return new THREE.CanvasTexture(canvas);
}

// ── Adaptive Grid on XY plane (z=0) ───────────────────────────────────
function AdaptiveGrid({ isDark, domain }: { isDark: boolean; domain: number }) {
  const { camera } = useThree();
  const [cellSize, setCellSize] = useState(1);
  const [tickPositions, setTickPositions] = useState<number[]>([]);
  const frameSkip = useRef(0);
  const prevZoom = useRef(-1);

  const computeGrid = useCallback(() => {
    const orthoCamera = camera as THREE.OrthographicCamera;
    const zoom = orthoCamera.zoom ?? 80;
    if (Math.abs(zoom - prevZoom.current) / (prevZoom.current + 0.001) < 0.03) return;
    prevZoom.current = zoom;

    // Visible half-extent in world units
    const visibleHalf = domain * (80 / zoom);
    // Choose a nice cell size
    const rawCell = visibleHalf / 5;
    const exp = Math.floor(Math.log10(Math.max(rawCell, 1e-9)));
    const base = Math.pow(10, exp);
    let cs = base;
    if (rawCell / base > 5) cs = base * 5;
    else if (rawCell / base > 2) cs = base * 2;

    setCellSize(cs);

    // Ticks from -visibleHalf*1.5 to +visibleHalf*1.5
    const max = Math.ceil(visibleHalf * 1.5 / cs) * cs;
    const ticks: number[] = [];
    for (let v = -max; v <= max; v += cs) {
      const rounded = Math.round(v / cs) * cs;
      if (Math.abs(rounded) > 1e-10) ticks.push(rounded);
    }
    setTickPositions(ticks.slice(0, 40));
  }, [camera, domain]);

  useFrame(() => {
    frameSkip.current++;
    if (frameSkip.current % 6 !== 0) return;
    computeGrid();
  });

  // Build grid lines geometry on XY plane (z=0)
  const gridGeo = useMemo(() => {
    const halfExt = domain * 8;
    const points: THREE.Vector3[] = [];
    const step = cellSize;
    const max = Math.ceil(halfExt / step) * step;

    // Vertical lines (parallel to Y)
    for (let x = -max; x <= max; x += step) {
      const xr = Math.round(x / step) * step;
      points.push(new THREE.Vector3(xr, -halfExt, 0));
      points.push(new THREE.Vector3(xr, halfExt, 0));
    }
    // Horizontal lines (parallel to X)
    for (let y = -max; y <= max; y += step) {
      const yr = Math.round(y / step) * step;
      points.push(new THREE.Vector3(-halfExt, yr, 0));
      points.push(new THREE.Vector3(halfExt, yr, 0));
    }

    const geo = new THREE.BufferGeometry().setFromPoints(points);
    return geo;
  }, [cellSize, domain]);

  // Section lines (every 5 cells)
  const sectionGeo = useMemo(() => {
    const halfExt = domain * 8;
    const step = cellSize * 5;
    const points: THREE.Vector3[] = [];
    const max = Math.ceil(halfExt / step) * step;

    for (let x = -max; x <= max; x += step) {
      const xr = Math.round(x / step) * step;
      points.push(new THREE.Vector3(xr, -halfExt, 0));
      points.push(new THREE.Vector3(xr, halfExt, 0));
    }
    for (let y = -max; y <= max; y += step) {
      const yr = Math.round(y / step) * step;
      points.push(new THREE.Vector3(-halfExt, yr, 0));
      points.push(new THREE.Vector3(halfExt, yr, 0));
    }

    return new THREE.BufferGeometry().setFromPoints(points);
  }, [cellSize, domain]);

  const gridColor = isDark ? '#2a3447' : '#e0e0e0';
  const sectionColor = isDark ? '#374151' : '#cccccc';
  const labelColor = isDark ? '#8899bb' : '#888888';

  const fmt = (v: number) => {
    if (cellSize >= 1) return v.toFixed(0);
    if (cellSize >= 0.1) return v.toFixed(1);
    if (cellSize >= 0.01) return v.toFixed(2);
    return v.toFixed(3);
  };

  return (
    <group>
      {/* Fine grid */}
      <lineSegments geometry={gridGeo} renderOrder={0}>
        <lineBasicMaterial color={gridColor} transparent opacity={0.6} />
      </lineSegments>

      {/* Section grid */}
      <lineSegments geometry={sectionGeo} renderOrder={0}>
        <lineBasicMaterial color={sectionColor} transparent opacity={0.85} />
      </lineSegments>

      {/* Tick labels along X axis */}
      {tickPositions.map(v => (
        <group key={`tx-${v}`}>
          <Html position={[v, 0, 0]} center style={{ pointerEvents: 'none' }}>
            <span style={{
              fontSize: '9px', color: labelColor,
              fontFamily: 'Inter, monospace', whiteSpace: 'nowrap',
              transform: 'translate(0, 8px)',
              display: 'block',
            }}>{fmt(v)}</span>
          </Html>
        </group>
      ))}
      {/* Tick labels along Y axis */}
      {tickPositions.map(v => (
        <group key={`ty-${v}`}>
          <Html position={[0, v, 0]} center style={{ pointerEvents: 'none' }}>
            <span style={{
              fontSize: '9px', color: labelColor,
              fontFamily: 'Inter, monospace', whiteSpace: 'nowrap',
              transform: 'translate(-18px, 0)',
              display: 'block',
            }}>{fmt(v)}</span>
          </Html>
        </group>
      ))}
    </group>
  );
}

// ── Colored XYZ Axes with Arrows ───────────────────────────────────────
function ColoredAxes({ length, isDark }: { length: number; isDark: boolean }) {
  const labelBg = isDark ? 'rgba(13,17,23,0.85)' : 'rgba(255,255,255,0.9)';

  const axes = [
    {
      dir: new THREE.Vector3(1, 0, 0),
      negDir: new THREE.Vector3(-1, 0, 0),
      color: '#e53935', dimColor: '#ef9a9a', label: 'X',
    },
    {
      dir: new THREE.Vector3(0, 1, 0),
      negDir: new THREE.Vector3(0, -1, 0),
      color: '#43a047', dimColor: '#a5d6a7', label: 'Y',
    },
    {
      dir: new THREE.Vector3(0, 0, 1),
      negDir: new THREE.Vector3(0, 0, -1),
      color: '#1e88e5', dimColor: '#90caf9', label: 'Z',
    },
  ];

  return (
    <group>
      {axes.map(axis => {
        const posEnd = axis.dir.clone().multiplyScalar(length);
        const negEnd = axis.negDir.clone().multiplyScalar(length * 0.6);
        const shaftEnd = posEnd.clone().multiplyScalar(0.87);

        const shaftGeo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(0, 0, 0), shaftEnd,
        ]);
        const negGeo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(0, 0, 0), negEnd,
        ]);

        // Cone
        const coneHeight = length * 0.12;
        const coneRadius = length * 0.038;
        const coneGeo = new THREE.ConeGeometry(coneRadius, coneHeight, 10);
        const q = new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 1, 0), axis.dir
        );
        coneGeo.applyQuaternion(q);
        const conePos = posEnd.clone().multiplyScalar(0.93);

        const labelPos = posEnd.clone().multiplyScalar(1.08);
        const negLabelPos = negEnd.clone().multiplyScalar(1.05);

        return (
          <group key={axis.label}>
            {/* Positive shaft */}
            <lineSegments geometry={shaftGeo}>
              <lineBasicMaterial color={axis.color} />
            </lineSegments>
            {/* Negative dashed */}
            <lineSegments geometry={negGeo}>
              <lineBasicMaterial color={axis.dimColor} transparent opacity={0.7} />
            </lineSegments>
            {/* Arrowhead cone */}
            <mesh geometry={coneGeo} position={conePos.toArray()}>
              <meshBasicMaterial color={axis.color} />
            </mesh>
            {/* Positive label */}
            <Html position={labelPos.toArray()} center style={{ pointerEvents: 'none' }}>
              <span style={{
                color: axis.color, fontWeight: 800, fontSize: '14px',
                background: labelBg,
                padding: '1px 6px', borderRadius: '4px',
                border: `1px solid ${axis.color}55`,
                fontFamily: 'Inter, Arial, sans-serif',
                boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
              }}>
                {axis.label}
              </span>
            </Html>
            {/* Negative label */}
            <Html position={negLabelPos.toArray()} center style={{ pointerEvents: 'none' }}>
              <span style={{
                color: axis.dimColor, fontWeight: 600, fontSize: '11px',
                background: labelBg,
                padding: '1px 4px', borderRadius: '3px',
                fontFamily: 'Inter, Arial, sans-serif',
              }}>
                −{axis.label}
              </span>
            </Html>
          </group>
        );
      })}
    </group>
  );
}

// ── Wireframe Bounding Box ─────────────────────────────────────────────
function BoundingBox({
  xMin, xMax, yMin, yMax, zMin, zMax, isDark,
}: {
  xMin: number; xMax: number;
  yMin: number; yMax: number;
  zMin: number; zMax: number;
  isDark: boolean;
}) {
  const geo = useMemo(() => {
    const w = xMax - xMin, h = yMax - yMin, d = zMax - zMin;
    return new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d));
  }, [xMin, xMax, yMin, yMax, zMin, zMax]);

  return (
    <lineSegments
      geometry={geo}
      position={[(xMin + xMax) / 2, (yMin + yMax) / 2, (zMin + zMax) / 2]}
    >
      <lineBasicMaterial
        color={isDark ? '#334155' : '#cccccc'}
        transparent
        opacity={0.7}
      />
    </lineSegments>
  );
}

// ── Surface Mesh (flat-shaded, no glow) ───────────────────────────────
function SurfaceMesh({
  surf, xMin, xMax, yMin, yMax, n = 50,
}: {
  surf: Surface3D;
  xMin: number; xMax: number;
  yMin: number; yMax: number;
  n?: number;
}) {
  const geo = useMemo(() => {
    const fn = safeCompile(surf.expr);
    if (!fn) return null;

    const positions = new Float32Array(n * n * 3);
    const dx = (xMax - xMin) / (n - 1);
    const dy = (yMax - yMin) / (n - 1);

    let idx = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const x = xMin + i * dx;
        const y = yMin + j * dy;
        const z = evalNumber(fn, { x, y, z: 0 });
        positions[idx++] = x;
        positions[idx++] = y;
        positions[idx++] = (z !== null && isFinite(z)) ? z : 0;
      }
    }

    const indices: number[] = [];
    for (let i = 0; i < n - 1; i++) {
      for (let j = 0; j < n - 1; j++) {
        const a = i * n + j, b = (i + 1) * n + j;
        const c = i * n + (j + 1), d = (i + 1) * n + (j + 1);
        indices.push(a, b, c);
        indices.push(b, d, c);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }, [surf.expr, xMin, xMax, yMin, yMax, n]);

  if (!geo) return null;

  return (
    <mesh geometry={geo} renderOrder={1}>
      <meshLambertMaterial
        color={surf.color}
        transparent
        opacity={surf.opacity}
        side={THREE.DoubleSide}
        depthWrite={surf.opacity > 0.9}
      />
    </mesh>
  );
}

// ── Cutting Plane Mesh ────────────────────────────────────────────────
function CuttingPlaneMesh({
  plane, xMin, xMax, yMin, yMax,
}: {
  plane: CuttingPlane3D;
  xMin: number; xMax: number;
  yMin: number; yMax: number;
}) {
  const geo = useMemo(() => {
    const expr = plane.expr.trim().toLowerCase();
    let rhs = expr;
    if (expr.includes('=')) rhs = expr.split('=')[1].trim();
    const fn = safeCompile(rhs);
    const n = 20;
    const dx = (xMax - xMin) / (n - 1);
    const dy = (yMax - yMin) / (n - 1);
    const positions = new Float32Array(n * n * 3);
    let idx = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const x = xMin + i * dx, y = yMin + j * dy;
        let z = 0;
        if (expr.startsWith('z')) {
          z = fn ? (evalNumber(fn, { x, y, z: 0 }) ?? 0) : 0;
        } else if (expr.startsWith('x')) {
          const val = fn ? (evalNumber(fn, { x: 0, y, z: 0 }) ?? 0) : parseFloat(rhs);
          positions[idx++] = val; positions[idx++] = y; positions[idx++] = x; continue;
        } else {
          z = fn ? (evalNumber(fn, { x, y, z: 0 }) ?? 0) : 0;
        }
        positions[idx++] = x; positions[idx++] = y; positions[idx++] = z;
      }
    }
    const inds: number[] = [];
    for (let i = 0; i < n - 1; i++) for (let j = 0; j < n - 1; j++) {
      const a = i * n + j, b = (i + 1) * n + j, c = i * n + (j + 1), d = (i + 1) * n + (j + 1);
      inds.push(a, b, c); inds.push(b, d, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setIndex(inds);
    g.computeVertexNormals();
    return g;
  }, [plane.expr, xMin, xMax, yMin, yMax]);

  if (!geo) return null;
  return (
    <mesh geometry={geo} renderOrder={2}>
      <meshLambertMaterial color="#f97316" transparent opacity={0.45} side={THREE.DoubleSide} />
    </mesh>
  );
}

// ── Point Marker ──────────────────────────────────────────────────────
function PointMarker({ pt, isDark }: { pt: Point3D; isDark: boolean }) {
  const labelBg = isDark ? 'rgba(13,17,23,0.9)' : 'rgba(255,255,255,0.95)';
  const labelColor = isDark ? '#f1f5f9' : '#1e293b';
  return (
    <group position={[pt.x, pt.y, pt.z]}>
      <Sphere args={[0.07, 14, 14]}>
        <meshBasicMaterial color="#f43f5e" />
      </Sphere>
      <Html center distanceFactor={8} style={{ pointerEvents: 'none' }}>
        <div style={{
          background: labelBg, color: labelColor,
          padding: '2px 7px', borderRadius: '5px',
          fontSize: '10px', fontFamily: "'JetBrains Mono', monospace",
          border: '1px solid #f43f5e66',
          whiteSpace: 'nowrap',
          transform: 'translate(12px, -14px)',
          boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
        }}>
          ({pt.x.toFixed(2)}, {pt.y.toFixed(2)}, {pt.z.toFixed(2)})
        </div>
      </Html>
    </group>
  );
}

// ── Orthographic Camera Controller ────────────────────────────────────
function OrthoController({
  zoomIn, zoomOut, resetCamera,
  onZoomIn, onZoomOut, onReset,
  defaultD,
}: {
  zoomIn: boolean; zoomOut: boolean; resetCamera: boolean;
  onZoomIn: () => void; onZoomOut: () => void; onReset: () => void;
  defaultD: number;
}) {
  const { camera } = useThree();

  useEffect(() => {
    // Set isometric position on mount
    const d = defaultD * 4;
    camera.position.set(d, d, d);
    camera.lookAt(0, 0, 0);
    (camera as THREE.OrthographicCamera).zoom = 80;
    camera.updateProjectionMatrix();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useFrame(() => {
    if (zoomIn) {
      (camera as THREE.OrthographicCamera).zoom *= 1.2;
      camera.updateProjectionMatrix();
      onZoomIn();
    }
    if (zoomOut) {
      (camera as THREE.OrthographicCamera).zoom /= 1.2;
      camera.updateProjectionMatrix();
      onZoomOut();
    }
    if (resetCamera) {
      const d = defaultD * 4;
      camera.position.set(d, d, d);
      camera.lookAt(0, 0, 0);
      (camera as THREE.OrthographicCamera).zoom = 80;
      camera.updateProjectionMatrix();
      onReset();
    }
  });

  return null;
}

// ── Lighting Setup ────────────────────────────────────────────────────
function SceneLighting({ isDark }: { isDark: boolean }) {
  return (
    <>
      <ambientLight intensity={isDark ? 0.7 : 1.0} />
      <directionalLight position={[5, 8, 5]} intensity={isDark ? 0.6 : 0.9} />
      <directionalLight position={[-4, -4, -4]} intensity={0.25} />
    </>
  );
}

// ── Scene Background Sync ─────────────────────────────────────────────
function SceneBackground({ isDark }: { isDark: boolean }) {
  const { scene } = useThree();
  useEffect(() => {
    scene.background = new THREE.Color(isDark ? '#0d1117' : '#ffffff');
  }, [isDark, scene]);
  return null;
}

// ── Scene Contents ────────────────────────────────────────────────────
function SceneContents({
  surfaces, planes, points, isDark, domain,
  zoomIn, zoomOut, resetCamera,
  onZoomIn, onZoomOut, onReset,
}: ThreeSceneProps & {
  zoomIn: boolean; zoomOut: boolean; resetCamera: boolean;
  onZoomIn: () => void; onZoomOut: () => void; onReset: () => void;
}) {
  const d = domain ?? 3;

  return (
    <>
      <SceneBackground isDark={isDark} />
      <SceneLighting isDark={isDark} />
      <OrthoController
        zoomIn={zoomIn} zoomOut={zoomOut} resetCamera={resetCamera}
        onZoomIn={onZoomIn} onZoomOut={onZoomOut} onReset={onReset}
        defaultD={d}
      />

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.06}
        enableZoom={true}
        zoomSpeed={1.2}
        enablePan={true}
        panSpeed={0.8}
        rotateSpeed={0.7}
      />

      {/* XY-plane adaptive grid */}
      <AdaptiveGrid isDark={isDark} domain={d} />

      {/* Colored axes */}
      <ColoredAxes length={d * 1.4} isDark={isDark} />

      {/* Wireframe bounding box */}
      <BoundingBox
        xMin={-d} xMax={d}
        yMin={-d} yMax={d}
        zMin={-d * 0.8} zMax={d * 0.8}
        isDark={isDark}
      />

      <Suspense fallback={null}>
        {surfaces.map(s => (
          <SurfaceMesh key={s.id} surf={s} xMin={-d} xMax={d} yMin={-d} yMax={d} />
        ))}
        {(planes ?? []).map(p => (
          <CuttingPlaneMesh key={p.id} plane={p} xMin={-d} xMax={d} yMin={-d} yMax={d} />
        ))}
        {(points ?? []).map(pt => (
          <PointMarker key={pt.id} pt={pt} isDark={isDark} />
        ))}
      </Suspense>
    </>
  );
}

// ── Main ThreeScene Export ────────────────────────────────────────────
export function ThreeScene(props: ThreeSceneProps) {
  const { isDark } = props;
  const [zoomIn, setZoomIn] = useState(false);
  const [zoomOut, setZoomOut] = useState(false);
  const [resetCamera, setResetCamera] = useState(false);

  const btnBg = isDark ? 'rgba(13,17,23,0.9)' : 'rgba(255,255,255,0.95)';
  const btnColor = isDark ? '#94a3b8' : '#374151';
  const btnBorder = isDark ? '#334155' : '#d1d5db';
  const borderColor = isDark ? '#1e293b' : '#e5e7eb';

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', border: `1px solid ${borderColor}` }}>
      <Canvas
        orthographic
        camera={{ zoom: 80, position: [12, 12, 12], near: 0.01, far: 2000 }}
        gl={{ antialias: true, alpha: false }}
        dpr={[1, 2]}
      >
        <SceneContents
          {...props}
          zoomIn={zoomIn} zoomOut={zoomOut} resetCamera={resetCamera}
          onZoomIn={() => setZoomIn(false)}
          onZoomOut={() => setZoomOut(false)}
          onReset={() => setResetCamera(false)}
        />
      </Canvas>

      {/* Control buttons overlay */}
      <div style={{
        position: 'absolute', top: '12px', right: '12px',
        display: 'flex', flexDirection: 'column', gap: '6px', zIndex: 10,
      }}>
        {[
          { label: '+',  title: 'Zoom In',    id: 'btn-zoom-in',    onClick: () => setZoomIn(true) },
          { label: '−',  title: 'Zoom Out',   id: 'btn-zoom-out',   onClick: () => setZoomOut(true) },
          { label: '⌂',  title: 'Reset View', id: 'btn-reset-view', onClick: () => setResetCamera(true) },
        ].map(btn => (
          <button
            key={btn.label}
            id={btn.id}
            onClick={btn.onClick}
            title={btn.title}
            style={{
              width: '32px', height: '32px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: btnBg,
              border: `1px solid ${btnBorder}`,
              borderRadius: '8px',
              color: btnColor,
              cursor: 'pointer',
              fontSize: '16px', fontWeight: 700,
              backdropFilter: 'blur(8px)',
              transition: 'all 0.15s',
              fontFamily: 'monospace',
              boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
            }}
          >
            {btn.label}
          </button>
        ))}
      </div>

      {/* Hint */}
      <div style={{
        position: 'absolute', bottom: '10px', left: '12px',
        fontSize: '10px',
        color: isDark ? '#4b5563' : '#9ca3af',
        pointerEvents: 'none',
        fontFamily: 'Inter, sans-serif',
        userSelect: 'none',
      }}>
        Drag to rotate · Scroll to zoom · Right-drag to pan
      </div>
    </div>
  );
}
