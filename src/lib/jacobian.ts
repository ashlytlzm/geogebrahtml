/**
 * jacobian.ts
 * Symbolic 2×2 Jacobian computation via mathjs derivative().
 * Used by Cat3 (Change of Variable).
 */

import { derivative, parse, simplify } from 'mathjs';
import { normalizeExpression } from './mathEngine';

export interface Jacobian2DResult {
  /** ∂u/∂x */
  dudx: string;
  /** ∂u/∂y */
  dudy: string;
  /** ∂v/∂x */
  dvdx: string;
  /** ∂v/∂y */
  dvdy: string;
  /** det = dudx*dvdy - dudy*dvdx (symbolic string) */
  detExpr: string;
  /** Numeric determinant at a sample point (x=1,y=1) */
  detNumeric: number | null;
  /** LaTeX for the 2×2 matrix */
  matrixLatex: string;
}

function trySimplify(expr: string): string {
  try {
    return simplify(expr).toString();
  } catch {
    return expr;
  }
}

/**
 * Given forward substitution u = uExpr(x,y), v = vExpr(x,y),
 * computes the Jacobian ∂(u,v)/∂(x,y).
 * The integral change-of-variable factor is |det|⁻¹.
 */
export function computeJacobian2D(
  uExpr: string,
  vExpr: string,
): Jacobian2DResult | null {
  try {
    const un = normalizeExpression(uExpr);
    const vn = normalizeExpression(vExpr);

    const uParsed = parse(un);
    const vParsed = parse(vn);

    const dudx = trySimplify(derivative(uParsed, 'x').toString());
    const dudy = trySimplify(derivative(uParsed, 'y').toString());
    const dvdx = trySimplify(derivative(vParsed, 'x').toString());
    const dvdy = trySimplify(derivative(vParsed, 'y').toString());

    const detExpr = trySimplify(`(${dudx})*(${dvdy}) - (${dudy})*(${dvdx})`);

    // Numeric sample at x=1, y=1
    let detNumeric: number | null = null;
    try {
      const scope = { x: 1, y: 1 };
      const d11 = parse(dudx).evaluate(scope) as number;
      const d12 = parse(dudy).evaluate(scope) as number;
      const d21 = parse(dvdx).evaluate(scope) as number;
      const d22 = parse(dvdy).evaluate(scope) as number;
      detNumeric = d11 * d22 - d12 * d21;
    } catch { /* ignore */ }

    const matrixLatex =
      `\\begin{vmatrix}${dudx} & ${dudy} \\\\ ${dvdx} & ${dvdy}\\end{vmatrix}`;

    return { dudx, dudy, dvdx, dvdy, detExpr, detNumeric, matrixLatex };
  } catch {
    return null;
  }
}
