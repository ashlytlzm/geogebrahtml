/**
 * numericalIntegration.ts
 * Adaptive numerical integration using Gaussian quadrature and Simpson's rule.
 */

import { safeCompile, evalNumber, normalizeExpression } from './mathEngine';

// ─── Gauss-Legendre nodes/weights (5-point) ────────────────────────────────
const GL5_NODES = [-0.9061798459, -0.5384693101, 0, 0.5384693101, 0.9061798459];
const GL5_WEIGHTS = [0.2369268851, 0.4786286705, 0.5688888889, 0.4786286705, 0.2369268851];

/** Map Gauss-Legendre nodes from [-1,1] to [a,b] */
function gaussLegendre1D(f: (x: number) => number, a: number, b: number): number {
  const mid = (a + b) / 2;
  const half = (b - a) / 2;
  let sum = 0;
  for (let i = 0; i < GL5_NODES.length; i++) {
    sum += GL5_WEIGHTS[i] * f(mid + half * GL5_NODES[i]);
  }
  return half * sum;
}

/** Adaptive 1D integration using composite Gauss-Legendre */
function integrate1D(f: (x: number) => number, a: number, b: number, panels = 40): number {
  const dx = (b - a) / panels;
  let total = 0;
  for (let i = 0; i < panels; i++) {
    total += gaussLegendre1D(f, a + i * dx, a + (i + 1) * dx);
  }
  return total;
}

// ─── Double Integral ────────────────────────────────────────────────────────

export interface DoubleIntegralBounds {
  xMin: number;
  xMax: number;
  /** yMin as function of outer var (or constant) */
  yMinExpr: string;
  /** yMax as function of outer var (or constant) */
  yMaxExpr: string;
  order?: 'dydx' | 'dxdy';
}

export interface IntegralResult {
  value: number | null;
  error: string | null;
  steps: IntegralStep[];
}

export interface IntegralStep {
  title: string;
  content: string;
}

export function computeDoubleIntegral(
  fExpr: string,
  bounds: DoubleIntegralBounds,
  panels = 50,
): IntegralResult {
  const steps: IntegralStep[] = [];
  const order = bounds.order || 'dydx';

  const fFn = safeCompile(fExpr);
  const yMinFn = safeCompile(bounds.yMinExpr);
  const yMaxFn = safeCompile(bounds.yMaxExpr);

  if (!fFn || !yMinFn || !yMaxFn) {
    return { value: null, error: 'Expresión inválida', steps };
  }

  const outerVar = order === 'dydx' ? 'x' : 'y';
  const innerVar = order === 'dydx' ? 'y' : 'x';

  steps.push({
    title: 'Integral doble planteada',
    content: `∬_D f(x,y) dA = ∫_{${bounds.xMin}}^{${bounds.xMax}} ∫_{${bounds.yMinExpr}}^{${bounds.yMaxExpr}} (${fExpr}) d${innerVar} d${outerVar}`,
  });

  steps.push({
    title: `Integral iterada (integración interna d${innerVar})`,
    content: `Para cada ${outerVar} ∈ [${bounds.xMin}, ${bounds.xMax}], se evalúa:\n∫_{${bounds.yMinExpr}}^{${bounds.yMaxExpr}} f(x, y) d${innerVar}`,
  });

  try {
    const innerIntegral = (outerVal: number): number => {
      const innerMin = evalNumber(yMinFn, { [outerVar]: outerVal }) ?? 0;
      const innerMax = evalNumber(yMaxFn, { [outerVar]: outerVal }) ?? 0;
      if (innerMin >= innerMax) return 0;
      return integrate1D((innerVal) => {
        return evalNumber(fFn, { [outerVar]: outerVal, [innerVar]: innerVal }) ?? 0;
      }, innerMin, innerMax, panels);
    };

    const value = integrate1D(innerIntegral, bounds.xMin, bounds.xMax, panels);

    steps.push({
      title: 'Integración externa',
      content: `∫_{${bounds.xMin}}^{${bounds.xMax}} [∫_{${innerVar}_min}^{${innerVar}_max} f(x,y) d${innerVar}] d${outerVar}`,
    });

    steps.push({
      title: 'Resultado numérico',
      content: `∬_D f(x,y) dA ≈ ${value.toFixed(8)}`,
    });

    return { value, error: null, steps };
  } catch (e) {
    return { value: null, error: String(e), steps };
  }
}

// ─── Triple Integral ────────────────────────────────────────────────────────

export interface TripleIntegralBounds {
  xMin: number;
  xMax: number;
  yMinExpr: string;
  yMaxExpr: string;
  zMinExpr: string;
  zMaxExpr: string;
  order?: 'dzdydx' | 'dzdxdy' | 'dydzdx' | 'dydxdz' | 'dxdzdy' | 'dxdydz';
}

export function computeTripleIntegral(
  fExpr: string,
  bounds: TripleIntegralBounds,
  panels = 20,
): IntegralResult {
  const steps: IntegralStep[] = [];
  const order = bounds.order || 'dzdydx';

  const fFn = safeCompile(fExpr);
  const yMinFn = safeCompile(bounds.yMinExpr);
  const yMaxFn = safeCompile(bounds.yMaxExpr);
  const zMinFn = safeCompile(bounds.zMinExpr);
  const zMaxFn = safeCompile(bounds.zMaxExpr);

  if (!fFn || !yMinFn || !yMaxFn || !zMinFn || !zMaxFn) {
    return { value: null, error: 'Expresión inválida', steps };
  }

  // Parse order: e.g. "dzdydx" -> inner: z (index 1), middle: y (index 3), outer: x (index 5)
  const innerVar = order[1];
  const middleVar = order[3];
  const outerVar = order[5];

  steps.push({
    title: 'Integral triple planteada',
    content: `∭_E f(x,y,z) dV = ∫_{${bounds.xMin}}^{${bounds.xMax}} ∫_{${bounds.yMinExpr}}^{${bounds.yMaxExpr}} ∫_{${bounds.zMinExpr}}^{${bounds.zMaxExpr}} (${fExpr}) d${innerVar} d${middleVar} d${outerVar}`,
  });

  steps.push({
    title: `Orden de integración: d${innerVar} d${middleVar} d${outerVar}`,
    content: `Se integra primero en ${innerVar}, luego en ${middleVar}, finalmente en ${outerVar} (integración iterada).`,
  });

  try {
    const value = integrate1D((outerVal) => {
      const middleMin = evalNumber(yMinFn, { [outerVar]: outerVal }) ?? 0;
      const middleMax = evalNumber(yMaxFn, { [outerVar]: outerVal }) ?? 0;
      return integrate1D((middleVal) => {
        const innerMin = evalNumber(zMinFn, { [outerVar]: outerVal, [middleVar]: middleVal }) ?? 0;
        const innerMax = evalNumber(zMaxFn, { [outerVar]: outerVal, [middleVar]: middleVal }) ?? 0;
        return integrate1D((innerVal) => {
          return evalNumber(fFn, {
            [outerVar]: outerVal,
            [middleVar]: middleVal,
            [innerVar]: innerVal
          }) ?? 0;
        }, innerMin, innerMax, panels);
      }, middleMin, middleMax, panels);
    }, bounds.xMin, bounds.xMax, panels);

    steps.push({
      title: 'Resultado numérico',
      content: `∭_E f(x,y,z) dV ≈ ${value.toFixed(8)}`,
    });

    return { value, error: null, steps };
  } catch (e) {
    return { value: null, error: String(e), steps };
  }
}

// ─── Volume Between Surfaces ────────────────────────────────────────────────

export function computeVolumeBetweenSurfaces(
  topExpr: string,
  bottomExpr: string,
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number,
  panels = 60,
): IntegralResult {
  const steps: IntegralStep[] = [];
  const topFn = safeCompile(topExpr);
  const botFn = safeCompile(bottomExpr);

  if (!topFn || !botFn) {
    return { value: null, error: 'Expresión inválida', steps };
  }

  steps.push({
    title: 'Volumen entre superficies',
    content: `V = ∬_D [f_sup(x,y) - f_inf(x,y)] dA\n\nDonde:\n  f_sup = ${topExpr}\n  f_inf = ${bottomExpr}\n  D = [${xMin}, ${xMax}] × [${yMin}, ${yMax}]`,
  });

  try {
    const value = integrate1D((x) =>
      integrate1D((y) => {
        const top = evalNumber(topFn, { x, y }) ?? 0;
        const bot = evalNumber(botFn, { x, y }) ?? 0;
        return Math.max(0, top - bot);
      }, yMin, yMax, panels),
      xMin, xMax, panels,
    );

    steps.push({
      title: 'Integración numérica',
      content: `V = ∫_{${xMin}}^{${xMax}} ∫_{${yMin}}^{${yMax}} [${topExpr} − (${bottomExpr})] dy dx`,
    });

    steps.push({
      title: 'Resultado',
      content: `V ≈ ${value.toFixed(6)} unidades cúbicas`,
    });

    return { value, error: null, steps };
  } catch (e) {
    return { value: null, error: String(e), steps };
  }
}

// ─── Sample surface for 3D plot ────────────────────────────────────────────

export function sampleSurface(
  expr: string,
  xMin: number, xMax: number,
  yMin: number, yMax: number,
  n = 50,
): { x: number[]; y: number[]; z: number[][] } | null {
  const fn = safeCompile(expr);
  if (!fn) return null;

  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < n; i++) {
    xs.push(xMin + (i / (n - 1)) * (xMax - xMin));
    ys.push(yMin + (i / (n - 1)) * (yMax - yMin));
  }

  const z: number[][] = [];
  for (const y of ys) {
    const row: number[] = [];
    for (const x of xs) {
      const v = evalNumber(fn, { x, y });
      row.push(v !== null ? v : NaN);
    }
    z.push(row);
  }

  return { x: xs, y: ys, z };
}

/** Normalise an expression that may include '=' into a plain form */
export function normalise(raw: string): string {
  return normalizeExpression(raw);
}

// ─── Domain Spec for Solid Volume ───────────────────────────────────────────

export type DomainSpec =
  | { type: 'rect'; xMin: number; xMax: number; yMin: number; yMax: number }
  | { type: 'circle'; cx: number; cy: number; R: number }
  | { type: 'custom'; xMin: number; xMax: number; yMinExpr: string; yMaxExpr: string };

export function computeVolumeSolid(
  topExpr: string,
  botExpr: string,
  domain: DomainSpec,
  panels = 60,
): IntegralResult {
  const steps: IntegralStep[] = [];
  const topFn = safeCompile(topExpr);
  const botFn = safeCompile(botExpr);

  if (!topFn || !botFn) {
    return { value: null, error: 'Expresión inválida en superficie', steps };
  }

  try {
    let value = 0;

    if (domain.type === 'rect') {
      const { xMin, xMax, yMin, yMax } = domain;
      steps.push({
        title: 'Dominio rectangular',
        content: `D = [${xMin}, ${xMax}] × [${yMin}, ${yMax}]`,
        latex: `D = [${xMin},\\,${xMax}]\\times[${yMin},\\,${yMax}]`,
      });
      steps.push({
        title: 'Integral de volumen planteada',
        content: `V = ∬_D [f(x,y) − g(x,y)] dA\n  = ∫_${xMin}^${xMax} ∫_${yMin}^${yMax} [${topExpr} − (${botExpr})] dy dx`,
        latex: `V = \\int_{${xMin}}^{${xMax}}\\int_{${yMin}}^{${yMax}}\\bigl[${topExpr} - (${botExpr})\\bigr]\\,dy\\,dx`,
      });

      value = integrate1D((x) =>
        integrate1D((y) => {
          const top = evalNumber(topFn, { x, y }) ?? 0;
          const bot = evalNumber(botFn, { x, y }) ?? 0;
          return Math.max(0, top - bot);
        }, yMin, yMax, panels),
        xMin, xMax, panels,
      );
    } else if (domain.type === 'circle') {
      const { cx, cy, R } = domain;
      // Polar integral: V = ∫₀²π ∫₀ᴿ [f - g](cx+r cosθ, cy+r sinθ) · r dr dθ
      steps.push({
        title: 'Dominio circular',
        content: `D: (x − ${cx})² + (y − ${cy})² ≤ ${R}²`,
        latex: `D:\\;(x-${cx})^2+(y-${cy})^2 \\leq ${R}^2`,
      });
      steps.push({
        title: 'Cambio a coordenadas polares',
        content: `V = ∫₀²π ∫₀ᴿ [f − g](${cx}+r cosθ, ${cy}+r sinθ) · r dr dθ`,
        latex: `V = \\int_0^{2\\pi}\\int_0^{${R}}\\bigl[f-g\\bigr](r,\\theta)\\cdot r\\,dr\\,d\\theta`,
      });

      const TWO_PI = 2 * Math.PI;
      value = integrate1D((theta) =>
        integrate1D((r) => {
          const x = cx + r * Math.cos(theta);
          const y = cy + r * Math.sin(theta);
          const top = evalNumber(topFn, { x, y }) ?? 0;
          const bot = evalNumber(botFn, { x, y }) ?? 0;
          return Math.max(0, top - bot) * r; // Jacobian
        }, 0, R, panels),
        0, TWO_PI, panels,
      );
    } else {
      // custom y-bounds
      const { xMin, xMax, yMinExpr, yMaxExpr } = domain;
      const yMinFn = safeCompile(yMinExpr);
      const yMaxFn = safeCompile(yMaxExpr);
      if (!yMinFn || !yMaxFn) {
        return { value: null, error: 'Expresión de dominio inválida', steps };
      }
      steps.push({
        title: 'Dominio con cotas variables',
        content: `D: x ∈ [${xMin}, ${xMax}], y ∈ [${yMinExpr}, ${yMaxExpr}]`,
        latex: `D:\\;x\\in[${xMin},${xMax}],\\;y\\in[${yMinExpr},\\,${yMaxExpr}]`,
      });
      steps.push({
        title: 'Integral iterada planteada',
        content: `V = ∫_${xMin}^${xMax} ∫_{${yMinExpr}}^{${yMaxExpr}} [${topExpr} − (${botExpr})] dy dx`,
        latex: `V = \\int_{${xMin}}^{${xMax}}\\int_{${yMinExpr}}^{${yMaxExpr}}\\bigl[${topExpr}-(${botExpr})\\bigr]\\,dy\\,dx`,
      });

      value = integrate1D((x) => {
        const yLo = evalNumber(yMinFn, { x }) ?? 0;
        const yHi = evalNumber(yMaxFn, { x }) ?? 0;
        if (yLo >= yHi) return 0;
        return integrate1D((y) => {
          const top = evalNumber(topFn, { x, y }) ?? 0;
          const bot = evalNumber(botFn, { x, y }) ?? 0;
          return Math.max(0, top - bot);
        }, yLo, yHi, panels);
      }, xMin, xMax, panels);
    }

    steps.push({
      title: 'Resultado numérico',
      content: `V ≈ ${value.toFixed(8)} unidades³`,
      latex: `V \\approx ${value.toFixed(6)}`,
    });

    return { value, error: null, steps };
  } catch (e) {
    return { value: null, error: String(e), steps };
  }
}

