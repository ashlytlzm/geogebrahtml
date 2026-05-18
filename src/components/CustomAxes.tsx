import { useState, useMemo } from 'react';
import { Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';

interface CustomAxesProps {
  bounds?: number;
  tickRadius?: number;
}

export function CustomAxes({ bounds = 20, tickRadius = 0.05 }: CustomAxesProps) {
  // GeoGebra colors: X=rojo, Y=verde, Z=azul
  const colorX = "#d32f2f";  // Rojo  → eje horizontal derecha (Three.js X)
  const colorY = "#388e3c";  // Verde → eje profundidad (Three.js -Z)
  const colorZ = "#1565c0";  // Azul  → eje vertical arriba (Three.js Y)

  const [spacing, setSpacing] = useState(1);
  const [visibleRadius, setVisibleRadius] = useState(20);
  const infiniteLength = 10000;

  useFrame((state) => {
    const dist = state.camera.position.length();
    
    let newSpacing = 1;
    if (dist > 150) newSpacing = 10;
    else if (dist > 80) newSpacing = 5;
    else if (dist > 40) newSpacing = 2;
    else if (dist > 20) newSpacing = 1;
    else if (dist > 10) newSpacing = 0.5;
    else newSpacing = 0.2;
    if (newSpacing !== spacing) setSpacing(newSpacing);

    let newRadius = Math.max(20, Math.floor(dist * 1.5));
    if (newRadius !== visibleRadius) setVisibleRadius(newRadius);
  });

  const ticks = useMemo(() => {
    const items = [];
    const steps = Math.floor(visibleRadius / spacing);

    for (let s = -steps; s <= steps; s++) {
      if (s === 0) continue;
      const i = parseFloat((s * spacing).toFixed(2));

      // X ticks: en el eje Three.js X (horizontal)
      items.push({ pos: [i, 0, 0] as [number,number,number], label: i.toString(), color: colorX, axis: 'x' });
      // Y ticks: en el eje Three.js -Z (profundidad matemática Y)
      items.push({ pos: [0, 0, -i] as [number,number,number], label: i.toString(), color: colorY, axis: 'y' });
      // Z ticks: en el eje Three.js Y (vertical matemático Z)
      items.push({ pos: [0, i, 0] as [number,number,number], label: i.toString(), color: colorZ, axis: 'z' });
    }
    return items;
  }, [visibleRadius, spacing]);

  const R = visibleRadius;

  return (
    <group>
      {/* ── Eje X (Rojo) ── horizontal: rota el cilindro Y→X con [0,0,PI/2] */}
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.025, 0.025, infiniteLength * 2]} />
        <meshBasicMaterial color={colorX} />
      </mesh>
      {/* Flechas X */}
      <mesh rotation={[0, 0, -Math.PI / 2]} position={[R + 1, 0, 0]}>
        <coneGeometry args={[0.12, 0.5, 8]} />
        <meshBasicMaterial color={colorX} />
      </mesh>
      <mesh rotation={[0, 0, Math.PI / 2]} position={[-(R + 1), 0, 0]}>
        <coneGeometry args={[0.12, 0.5, 8]} />
        <meshBasicMaterial color={colorX} />
      </mesh>

      {/* ── Eje Y (Verde) ── profundidad: rota el cilindro Y→Z con [PI/2,0,0] */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.025, 0.025, infiniteLength * 2]} />
        <meshBasicMaterial color={colorY} />
      </mesh>
      {/* Flechas Y */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -(R + 1)]}>
        <coneGeometry args={[0.12, 0.5, 8]} />
        <meshBasicMaterial color={colorY} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, R + 1]}>
        <coneGeometry args={[0.12, 0.5, 8]} />
        <meshBasicMaterial color={colorY} />
      </mesh>

      {/* ── Eje Z (Azul) ── vertical: cilindro sin rotación (a lo largo de Y Three.js) */}
      <mesh>
        <cylinderGeometry args={[0.025, 0.025, infiniteLength * 2]} />
        <meshBasicMaterial color={colorZ} />
      </mesh>
      {/* Flechas Z */}
      <mesh position={[0, R + 1, 0]}>
        <coneGeometry args={[0.12, 0.5, 8]} />
        <meshBasicMaterial color={colorZ} />
      </mesh>
      <mesh rotation={[Math.PI, 0, 0]} position={[0, -(R + 1), 0]}>
        <coneGeometry args={[0.12, 0.5, 8]} />
        <meshBasicMaterial color={colorZ} />
      </mesh>

      {/* ── Marcas y Números ── */}
      {ticks.map((tick, idx) => (
        <group key={idx} position={tick.pos}>
          <mesh>
            <sphereGeometry args={[tickRadius, 8, 8]} />
            <meshBasicMaterial color={tick.color} />
          </mesh>
          <Text
            position={[
              tick.axis === 'y' ? 0.5 : (tick.axis === 'z' ? 0.5 : 0),  // X: centrado, Y: +x, Z: +x
              tick.axis === 'x' ? 0.4 : (tick.axis === 'y' ? 0.4 : 0),  // X: arriba, Y: arriba, Z: centrado
              tick.axis === 'x' ? 0.3 : (tick.axis === 'z' ? 0.3 : 0),  // X: leve +z, Z: leve +z, Y: centrado
            ]}
            color={tick.color}
            fontSize={0.55}
            fontWeight="bold"
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.05}
            outlineColor="#ffffff"
            renderOrder={999}
          >
            {tick.label}
          </Text>
        </group>
      ))}

      {/* ── Etiquetas de Ejes ── */}
      <Text position={[bounds / 2 + 1, 0.5, 0]} color={colorX} fontSize={1.2} fontWeight="bold" anchorX="center" anchorY="middle" outlineWidth={0.14} outlineColor="#ffffff" renderOrder={1000}>
        x
      </Text>
      <Text position={[-(bounds / 2 + 1), 0.5, 0]} color={colorX} fontSize={1.2} fontWeight="bold" anchorX="center" anchorY="middle" outlineWidth={0.14} outlineColor="#ffffff" renderOrder={1000}>
        -x
      </Text>

      <Text position={[0, 0.5, -(bounds / 2 + 1)]} color={colorY} fontSize={1.2} fontWeight="bold" anchorX="center" anchorY="middle" outlineWidth={0.14} outlineColor="#ffffff" renderOrder={1000}>
        y
      </Text>
      <Text position={[0, 0.5, bounds / 2 + 1]} color={colorY} fontSize={1.2} fontWeight="bold" anchorX="center" anchorY="middle" outlineWidth={0.14} outlineColor="#ffffff" renderOrder={1000}>
        -y
      </Text>

      <Text position={[1.2, bounds / 2 + 1, 0]} color={colorZ} fontSize={1.2} fontWeight="bold" anchorX="center" anchorY="middle" outlineWidth={0.14} outlineColor="#ffffff" renderOrder={1000}>
        z
      </Text>
      <Text position={[1.2, -(bounds / 2 + 1), 0]} color={colorZ} fontSize={1.2} fontWeight="bold" anchorX="center" anchorY="middle" outlineWidth={0.14} outlineColor="#ffffff" renderOrder={1000}>
        -z
      </Text>
    </group>
  );
}

