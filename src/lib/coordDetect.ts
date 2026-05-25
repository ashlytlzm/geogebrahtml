/**
 * coordDetect.ts
 * Heuristic coordinate system detection from surface expressions.
 */

export type CoordSystem = 'cartesian' | 'cylindrical' | 'spherical';

/**
 * Detects the most natural coordinate system for a set of expressions.
 * Heuristic: look for x²+y²+z² → spherical, x²+y² → cylindrical, else cartesian.
 */
export function detectCoordSystem(exprs: string[]): CoordSystem {
  const s = exprs.join(' ').replace(/\s/g, '');

  // Spherical: expression involves x^2+y^2+z^2
  if (
    /x\^2\+y\^2\+z\^2/.test(s) ||
    /sqrt\(x\^2\+y\^2\+z\^2/.test(s) ||
    /x\*x\+y\*y\+z\*z/.test(s)
  ) {
    return 'spherical';
  }

  // Cylindrical: x²+y² present but no z²
  if (
    /x\^2\+y\^2/.test(s) ||
    /sqrt\(x\^2\+y\^2/.test(s) ||
    /x\*x\+y\*y/.test(s)
  ) {
    return 'cylindrical';
  }

  return 'cartesian';
}

/** LaTeX integral notation for each system */
export function integralLatex(
  topExpr: string,
  botExpr: string,
  system: CoordSystem,
  domain: string,
): string {
  switch (system) {
    case 'cylindrical':
      return `V = \\int_0^{2\\pi}\\int_0^R\\bigl[${topExpr} - (${botExpr})\\bigr]\\,r\\,dr\\,d\\theta`;
    case 'spherical':
      return `V = \\int_0^{2\\pi}\\int_0^\\pi\\int_0^R \\rho^2\\sin\\phi\\,d\\rho\\,d\\phi\\,d\\theta`;
    default:
      return `V = \\iint_{${domain}}\\bigl[${topExpr} - (${botExpr})\\bigr]\\,dA`;
  }
}

/** Human-readable name */
export function coordSystemLabel(s: CoordSystem): string {
  return s === 'cylindrical' ? 'Cilíndricas' : s === 'spherical' ? 'Esféricas' : 'Cartesianas';
}
