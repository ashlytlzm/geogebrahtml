import { useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { normalizeExpression } from '../lib/mathEngine';
import { compile } from 'mathjs';

interface MathSurfaceProps {
  equation: string;
  bounds?: number;
  segments?: number;
}

export function MathSurface({ equation, bounds = 20, segments = 100 }: MathSurfaceProps) {
  const geometry = useMemo(() => new THREE.PlaneGeometry(bounds, bounds, segments, segments), [bounds, segments]);

  // Compile math function (normalize first to handle = signs)
  const compiledFn = useMemo(() => {
    try {
      return compile(normalizeExpression(equation));
    } catch (e) {
      console.error("Invalid equation:", e);
      return null;
    }
  }, [equation]);

  useEffect(() => {
    if (!geometry || !compiledFn) return;

    const positionAttribute = geometry.getAttribute('position') as THREE.BufferAttribute;

    let minZ = Infinity;
    let maxZ = -Infinity;

    // First pass to compute Z and find min/max
    const zValues: number[] = [];
    
    for (let i = 0; i < positionAttribute.count; i++) {
      const x = positionAttribute.getX(i);
      const y = positionAttribute.getY(i);
      let z = 0;

      try {
        const result = compiledFn.evaluate({ x, y });
        // Handle complex numbers or NaN
        if (typeof result === 'number' && !isNaN(result) && isFinite(result)) {
          z = result;
        } else {
           z = NaN;
        }
      } catch (e) {
        z = NaN;
      }

      zValues.push(z);
      if (!isNaN(z)) {
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;
      }
    }

    // Fix NaNs by clamping to min/max if possible, or just 0
    if (!isFinite(minZ)) minZ = -10;
    if (!isFinite(maxZ)) maxZ = 10;

    for (let i = 0; i < positionAttribute.count; i++) {
      let z = zValues[i];
      if (isNaN(z)) z = minZ - 1;

      // Update Z coordinate
      positionAttribute.setZ(i, z);
    }

    // Configurar colores de los vértices para hacer bandas
    const colors = new Float32Array(positionAttribute.count * 3);
    const colorPurple = new THREE.Color("#c084fc"); // Morado
    const colorGrey = new THREE.Color("#e2e8f0");   // Gris/Blanco

    for (let i = 0; i < positionAttribute.count; i++) {
      const z = positionAttribute.getZ(i);
      
      // Crear bandas basadas en la altura Z
      // Multiplicar por un factor define el grosor de la banda
      const band = Math.floor(z * 2.5); 
      
      if (band % 2 === 0) {
        colors[i * 3] = colorPurple.r;
        colors[i * 3 + 1] = colorPurple.g;
        colors[i * 3 + 2] = colorPurple.b;
      } else {
        colors[i * 3] = colorGrey.r;
        colors[i * 3 + 1] = colorGrey.g;
        colors[i * 3 + 2] = colorGrey.b;
      }
    }
    
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    positionAttribute.needsUpdate = true;
    
    // Recompute normals for proper lighting
    geometry.computeVertexNormals();

  }, [compiledFn, geometry]);

  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      {/* Solid Surface - más opaco/sólido */}
      <mesh geometry={geometry} frustumCulled={false}>
        <meshStandardMaterial 
          color="#ffffff"
          vertexColors={true}
          side={THREE.DoubleSide} 
          roughness={0.3}
          metalness={0.05}
          transparent={true}
          opacity={0.92}
        />
      </mesh>
      {/* Wireframe sutil - muy tenue para no tapar */}
      <mesh geometry={geometry} frustumCulled={false}>
        <meshBasicMaterial 
          color="#581c87"
          wireframe={true}
          transparent={true}
          opacity={0.12}
        />
      </mesh>
    </group>
  );
}
