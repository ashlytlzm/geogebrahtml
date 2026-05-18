import { useRef } from 'react';
import * as THREE from 'three';

interface Point3DProps {
  x: number;
  y: number;
  z: number;
  color?: string;
}

export function Point3D({ x, y, z, color = "#ef4444" }: Point3DProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  return (
    <mesh ref={meshRef} position={[x, z, -y]}>
      <sphereGeometry args={[0.15, 32, 32]} />
      <meshStandardMaterial 
        color={color} 
        roughness={0.1} 
        metalness={0.5} 
        emissive={color}
        emissiveIntensity={0.2}
      />
    </mesh>
  );
}
