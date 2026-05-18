import { useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { MarchingCubes } from 'three-stdlib';
import { safeCompile, evalNumber } from '../lib/mathEngine';

interface MathImplicitSurfaceProps {
  equation: string;
  bounds: number;
}

export function MathImplicitSurface({ equation, bounds }: MathImplicitSurfaceProps) {
  const mc = useMemo(() => {
    const material = new THREE.MeshStandardMaterial({
      color: '#c084fc', // Morado
      side: THREE.DoubleSide,
      roughness: 0.3,
      metalness: 0.1,
      transparent: true,
      opacity: 0.9,
    });
    // Resolution = 40, maxPolyCount = 100000
    const cubes = new MarchingCubes(40, material, true, false, 100000);
    cubes.isolation = 0;
    return cubes;
  }, []);

  useEffect(() => {
    const fn = safeCompile(equation);
    if (!fn) return;

    const res = mc.resolution;
    mc.reset();
    mc.isolation = 0;

    let i = 0;
    // MarchingCubes array index = z * res^2 + y * res + x
    for (let k = 0; k < res; k++) {
      // z range
      const zNorm = -1 + 2 * (k / (res - 1));
      const z = zNorm * (bounds / 2);

      for (let j = 0; j < res; j++) {
        // y range
        const yNorm = -1 + 2 * (j / (res - 1));
        const y = yNorm * (bounds / 2);

        for (let i_x = 0; i_x < res; i_x++) {
          // x range
          const xNorm = -1 + 2 * (i_x / (res - 1));
          const x = xNorm * (bounds / 2);

          const val = evalNumber(fn, { x, y, z });
          mc.field[i] = val !== null && isFinite(val) ? val : 10000;
          i++;
        }
      }
    }
    
    // Scale and position the geometry
    mc.scale.set(bounds / 2, bounds / 2, bounds / 2);
    // Since WebGL uses Y-up but we use Z-up mostly, rotate it to match Plotly and our axes
    mc.rotation.x = -Math.PI / 2;
    mc.frustumCulled = false;

    mc.update();
  }, [equation, bounds, mc]);

  return <primitive object={mc} />;
}
