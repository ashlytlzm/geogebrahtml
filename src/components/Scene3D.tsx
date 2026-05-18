import { useState, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
import { MathSurface } from './MathSurface';
import { MathImplicitSurface } from './MathImplicitSurface';
import { MathCurve } from './MathCurve';
import { Point3D } from './Point3D';
import { CustomAxes } from './CustomAxes';
import type { Point3DData } from '../types';
import { normalizeExpression } from '../lib/mathEngine';

// Detecta si la ecuación depende de x, y, z o combinaciones
function detectFunctionType(equation: string): 'surface' | 'curve-x' | 'curve-y' | 'constant' | 'implicit3d' {
  try {
    // Normalize first to handle '=' signs (e.g. x^2+y^2=z becomes (x^2+y^2)-(z))
    const normalized = normalizeExpression(equation);
    const fn = compile(normalized);
    const tests = [
      { x: 0.5, y: 0.3, z: 0.1 }, { x: -1, y: 2, z: -0.5 }, { x: 3, y: -0.7, z: 1.2 }
    ];

    let dependsOnX = false;
    let dependsOnY = false;
    let dependsOnZ = false;

    for (const t of tests) {
      try {
        const vBase = fn.evaluate({ x: t.x, y: t.y, z: t.z });
        const vX = fn.evaluate({ x: t.x + 0.01, y: t.y, z: t.z });
        const vY = fn.evaluate({ x: t.x, y: t.y + 0.01, z: t.z });
        const vZ = fn.evaluate({ x: t.x, y: t.y, z: t.z + 0.01 });
        if (Math.abs(vX - vBase) > 1e-10) dependsOnX = true;
        if (Math.abs(vY - vBase) > 1e-10) dependsOnY = true;
        if (Math.abs(vZ - vBase) > 1e-10) dependsOnZ = true;
      } catch { /* skip invalid */ }
    }

    if (dependsOnZ) return 'implicit3d';
    if (dependsOnX && dependsOnY) return 'surface';
    if (dependsOnX) return 'curve-x';
    if (dependsOnY) return 'curve-y';
    return 'constant';
  } catch {
    return 'surface';
  }
}

interface Scene3DProps {
  equation: string;
  points: Point3DData[];
}

interface SceneManagerProps extends Scene3DProps {
  planeLocked: boolean;
}

function SceneManager({ equation, points, planeLocked }: SceneManagerProps) {
  const [bounds, setBounds] = useState(30);
  const lockedBoundsRef = useRef(30);

  const fnType = detectFunctionType(equation);

  useFrame((state) => {
    if (planeLocked) return;
    const dist = state.camera.position.length();
    let newBounds = Math.floor(dist * 0.7);
    newBounds = Math.floor(newBounds / 5) * 5;
    if (newBounds < 20) newBounds = 20;
    if (newBounds !== bounds) {
      setBounds(newBounds);
      lockedBoundsRef.current = newBounds;
    }
  });

  return (
    <>
      {/* Render curve or surface based on function type */}
      {(fnType === 'surface' || fnType === 'constant') && (
        <MathSurface equation={equation} bounds={bounds} segments={100} />
      )}
      {fnType === 'implicit3d' && (
        <MathImplicitSurface equation={equation} bounds={bounds} />
      )}
      {fnType === 'curve-x' && (
        <MathCurve equation={equation} bounds={bounds} axis="x" />
      )}
      {fnType === 'curve-y' && (
        <MathCurve equation={equation} bounds={bounds} axis="y" />
      )}

      {/* User Points */}
      {points.map((pt) => (
        <Point3D key={pt.id} x={pt.x} y={pt.y} z={pt.z} />
      ))}

      {/* Plano Base */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <planeGeometry args={[bounds, bounds]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.6} depthWrite={false} />
      </mesh>

      {/* Cuadrícula */}
      <gridHelper args={[bounds, bounds, bounds/2, bounds/2]} position={[0, -0.01, 0]} material-color="#cbd5e1" material-transparent material-opacity={0.5} />

      {/* Custom Axes */}
      <CustomAxes bounds={bounds} tickRadius={0.05} />
    </>
  );
}

export function Scene3D({ equation, points }: Scene3DProps) {
  const [planeLocked, setPlaneLocked] = useState(false);

  return (
    <div className="w-full h-full relative">
      <Canvas camera={{ position: [30, 24, 30], fov: 30, near: 0.1, far: 10000 }}>
        {/* Environment and Lighting */}
        <color attach="background" args={['#f8fafc']} />
        <ambientLight intensity={0.4} />
        <directionalLight position={[10, 20, 5]} intensity={1.5} castShadow />
        <directionalLight position={[-10, -20, -5]} intensity={0.5} />
        <Environment preset="city" />

        <SceneManager equation={equation} points={points} planeLocked={planeLocked} />

        {/* Controls */}
        <OrbitControls makeDefault target={[0, 0, 0]} enablePan={false} maxPolarAngle={Math.PI / 2 + 0.2} />
      </Canvas>

      {/* Botón flotante de bloqueo del plano */}
      <button
        onClick={() => setPlaneLocked(prev => !prev)}
        title={planeLocked ? "Desbloquear plano (se ajustará al zoom)" : "Bloquear plano (el plano no cambiará al hacer zoom)"}
        style={{
          position: 'absolute',
          top: '16px',
          right: '16px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 16px',
          borderRadius: '12px',
          border: planeLocked ? '2px solid #7c3aed' : '2px solid #e2e8f0',
          background: planeLocked
            ? 'linear-gradient(135deg, #7c3aed, #a855f7)'
            : 'rgba(255,255,255,0.92)',
          color: planeLocked ? '#fff' : '#334155',
          fontWeight: 700,
          fontSize: '13px',
          cursor: 'pointer',
          boxShadow: planeLocked
            ? '0 4px 18px rgba(124,58,237,0.35)'
            : '0 2px 10px rgba(0,0,0,0.10)',
          backdropFilter: 'blur(10px)',
          transition: 'all 0.2s ease',
          zIndex: 100,
          letterSpacing: '0.01em',
        }}
      >
        {/* Ícono de candado */}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          {planeLocked ? (
            <>
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </>
          ) : (
            <>
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 9.9-1"/>
            </>
          )}
        </svg>
        {planeLocked ? 'Plano Fijo' : 'Plano Libre'}
      </button>
    </div>
  );
}
