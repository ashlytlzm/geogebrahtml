/**
 * coordTransform.ts
 * Coordinate system transformations: Cartesian, Polar, Cylindrical, Spherical.
 * Includes Jacobians and step-by-step integral reformulation.
 */

export type CoordSystem = 'cartesiano' | 'polar' | 'cilindrico' | 'esferico';

// ─── Forward transforms ─────────────────────────────────────────────────────

/** Polar → Cartesian: (r, θ) → (x, y) */
export function polarToCartesian(r: number, theta: number): [number, number] {
  return [r * Math.cos(theta), r * Math.sin(theta)];
}

/** Cartesian → Polar: (x, y) → (r, θ) */
export function cartesianToPolar(x: number, y: number): [number, number] {
  return [Math.sqrt(x*x + y*y), Math.atan2(y, x)];
}

/** Cylindrical → Cartesian: (r, θ, z) → (x, y, z) */
export function cylindricalToCartesian(r: number, theta: number, z: number): [number, number, number] {
  return [r * Math.cos(theta), r * Math.sin(theta), z];
}

/** Cartesian → Cylindrical: (x, y, z) → (r, θ, z) */
export function cartesianToCylindrical(x: number, y: number, z: number): [number, number, number] {
  return [Math.sqrt(x*x + y*y), Math.atan2(y, x), z];
}

/** Spherical → Cartesian: (ρ, φ, θ) → (x, y, z) where φ = polar angle from z-axis */
export function sphericalToCartesian(rho: number, phi: number, theta: number): [number, number, number] {
  return [
    rho * Math.sin(phi) * Math.cos(theta),
    rho * Math.sin(phi) * Math.sin(theta),
    rho * Math.cos(phi),
  ];
}

/** Cartesian → Spherical: (x, y, z) → (ρ, φ, θ) */
export function cartesianToSpherical(x: number, y: number, z: number): [number, number, number] {
  const rho = Math.sqrt(x*x + y*y + z*z);
  const phi = rho === 0 ? 0 : Math.acos(z / rho);
  const theta = Math.atan2(y, x);
  return [rho, phi, theta];
}

// ─── Jacobian display text ──────────────────────────────────────────────────

export function jacobianFormula(system: CoordSystem): string {
  switch (system) {
    case 'polar':
      return 'J = r  →  dA = r dr dθ';
    case 'cilindrico':
      return 'J = r  →  dV = r dr dθ dz';
    case 'esferico':
      return 'J = ρ² sin φ  →  dV = ρ² sin φ dρ dφ dθ';
    default:
      return 'J = 1  →  dA = dx dy  (sin cambio)';
  }
}

export function jacobianValue(system: CoordSystem, rho: number, phi: number): number {
  switch (system) {
    case 'polar':
    case 'cilindrico':
      return rho; // r
    case 'esferico':
      return rho * rho * Math.sin(phi); // ρ² sin φ
    default:
      return 1;
  }
}

// ─── Substitution variable names ────────────────────────────────────────────

export function variableNames(system: CoordSystem): { v1: string; v2: string; v3: string } {
  switch (system) {
    case 'polar':
      return { v1: 'r', v2: 'θ', v3: '' };
    case 'cilindrico':
      return { v1: 'r', v2: 'θ', v3: 'z' };
    case 'esferico':
      return { v1: 'ρ', v2: 'φ', v3: 'θ' };
    default:
      return { v1: 'x', v2: 'y', v3: 'z' };
  }
}

// ─── Substitution formulas (display strings) ─────────────────────────────────

export function substitutionFormulas(system: CoordSystem): string[] {
  switch (system) {
    case 'polar':
      return ['x = r cos θ', 'y = r sin θ'];
    case 'cilindrico':
      return ['x = r cos θ', 'y = r sin θ', 'z = z'];
    case 'esferico':
      return [
        'x = ρ sin φ cos θ',
        'y = ρ sin φ sin θ',
        'z = ρ cos φ',
      ];
    default:
      return ['x = x', 'y = y', 'z = z'];
  }
}

// ─── Step-by-step integral reformulation ────────────────────────────────────

export interface ConvertedIntegral {
  steps: { title: string; content: string }[];
  convertedExpr: string;
  jacobianText: string;
  variableInfo: string;
}

export function reformulateIntegral(
  fExpr: string,
  fromSystem: CoordSystem,
  toSystem: CoordSystem,
  boundsDescription: string,
): ConvertedIntegral {
  const steps: { title: string; content: string }[] = [];

  steps.push({
    title: `Integral original en coordenadas ${fromSystem}`,
    content: `∭ (${fExpr}) dV`,
  });

  const subs = substitutionFormulas(toSystem);
  steps.push({
    title: `Sustitución a coordenadas ${toSystem}`,
    content: subs.join('\n'),
  });

  const jac = jacobianFormula(toSystem);
  steps.push({
    title: 'Jacobiano de la transformación',
    content: jac,
  });

  const vars = variableNames(toSystem);
  const varStr = toSystem === 'polar'
    ? `d${vars.v1} d${vars.v2}`
    : `d${vars.v1} d${vars.v2} d${vars.v3}`;

  steps.push({
    title: 'Integral transformada',
    content: `∭ f(${vars.v1}, ${vars.v2}${vars.v3 ? ', ' + vars.v3 : ''}) · J ${varStr}\n\ndonde J = ${jac}`,
  });

  if (boundsDescription) {
    steps.push({
      title: 'Región de integración convertida',
      content: boundsDescription,
    });
  }

  return {
    steps,
    convertedExpr: fExpr,
    jacobianText: jac,
    variableInfo: `Variables: ${[vars.v1, vars.v2, vars.v3].filter(Boolean).join(', ')}`,
  };
}

// ─── Surface area of coordinate systems for visualization ───────────────────

/** Generate sample points for visualizing the region in a target coord system */
export function generateRegionPoints(
  system: CoordSystem,
  p1Min: number, p1Max: number,
  p2Min: number, p2Max: number,
  p3Min: number, p3Max: number,
  n = 20,
): { x: number[]; y: number[]; z: number[] } {
  const xs: number[] = [];
  const ys: number[] = [];
  const zs: number[] = [];

  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= n; j++) {
      const t1 = p1Min + (i / n) * (p1Max - p1Min);
      const t2 = p2Min + (j / n) * (p2Max - p2Min);

      if (system === 'polar') {
        const [x, y] = polarToCartesian(t1, t2);
        xs.push(x); ys.push(y); zs.push(0);
      } else if (system === 'cilindrico') {
        const t3 = (p3Min + p3Max) / 2;
        const [x, y, z] = cylindricalToCartesian(t1, t2, t3);
        xs.push(x); ys.push(y); zs.push(z);
      } else if (system === 'esferico') {
        const t3 = (p3Min + p3Max) / 2;
        const [x, y, z] = sphericalToCartesian(t1, t2, t3);
        xs.push(x); ys.push(y); zs.push(z);
      } else {
        xs.push(t1); ys.push(t2); zs.push(0);
      }
    }
  }

  return { x: xs, y: ys, z: zs };
}
