import { useMemo } from 'react';
import * as THREE from 'three';
import { Line } from '@react-three/drei';
import { compile } from 'mathjs';
import { normalizeExpression } from '../lib/mathEngine';

interface MathCurveProps {
  equation: string;
  bounds?: number;
  resolution?: number;
  axis?: 'x' | 'y'; // which variable the function depends on
}

export function MathCurve({ equation, bounds = 20, resolution = 500, axis = 'x' }: MathCurveProps) {
  const points = useMemo(() => {
    try {
      const fn = compile(normalizeExpression(equation));
      const pts: THREE.Vector3[] = [];
      const step = (bounds * 2) / resolution;

      for (let t = -bounds; t <= bounds; t += step) {
        try {
          const val = fn.evaluate(axis === 'x' ? { x: t, y: 0 } : { x: 0, y: t });
          if (typeof val !== 'number' || !isFinite(val)) continue;

          if (axis === 'x') {
            // Curva 2D: y = f(x) en el plano del suelo
            // x_three = t (eje X math), y_three = 0 (suelo), z_three = -val (eje Y math = -Z three)
            pts.push(new THREE.Vector3(t, 0, -val));
          } else {
            // Curva 2D: x = f(y) en el plano del suelo
            // z_three = -t, y_three = 0, x_three = val
            pts.push(new THREE.Vector3(val, 0, -t));
          }
        } catch {
          // skip invalid points
        }
      }
      return pts;
    } catch {
      return [];
    }
  }, [equation, bounds, resolution, axis]);

  // Tubo suave sobre los puntos muestreados
  const tubeGeometry = useMemo(() => {
    if (points.length < 2) return null;
    try {
      // Smooth curve through points
      const curve = new THREE.CatmullRomCurve3(points);
      return new THREE.TubeGeometry(curve, Math.min(points.length * 2, 1000), 0.05, 8, false);
    } catch {
      return null;
    }
  }, [points]);

  if (!tubeGeometry && points.length < 2) return null;

  return (
    <group>
      {/* Main curve as a tube */}
      {tubeGeometry && (
        <mesh geometry={tubeGeometry} frustumCulled={false}>
          <meshStandardMaterial
            color="#7c3aed"
            roughness={0.2}
            metalness={0.1}
          />
        </mesh>
      )}
      {/* Fallback line if tube fails */}
      {!tubeGeometry && points.length >= 2 && (
        <Line points={points} color="#7c3aed" lineWidth={2} frustumCulled={false} />
      )}
    </group>
  );
}
