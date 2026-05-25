/**
 * vectorCalc.ts
 * Numerical vector calculus: curl, divergence, line/surface integrals, gradient.
 */

import { safeCompile, evalNumber } from './mathEngine';
import type { IntegralResult, IntegralStep } from './numericalIntegration';

const H = 1e-5; // finite-difference step

// ─── Partial Derivatives ────────────────────────────────────────────────────

export function partialX(expr: string, x: number, y: number, z: number): number {
  const fn = safeCompile(expr);
  if (!fn) return 0;
  const f1 = evalNumber(fn, { x: x + H, y, z }) ?? 0;
  const f0 = evalNumber(fn, { x: x - H, y, z }) ?? 0;
  return (f1 - f0) / (2 * H);
}

export function partialY(expr: string, x: number, y: number, z: number): number {
  const fn = safeCompile(expr);
  if (!fn) return 0;
  const f1 = evalNumber(fn, { x, y: y + H, z }) ?? 0;
  const f0 = evalNumber(fn, { x, y: y - H, z }) ?? 0;
  return (f1 - f0) / (2 * H);
}

export function partialZ(expr: string, x: number, y: number, z: number): number {
  const fn = safeCompile(expr);
  if (!fn) return 0;
  const f1 = evalNumber(fn, { x, y, z: z + H }) ?? 0;
  const f0 = evalNumber(fn, { x, y, z: z - H }) ?? 0;
  return (f1 - f0) / (2 * H);
}

/** Gradient ∇f at a point */
export function gradient(
  fExpr: string,
  x: number, y: number, z: number,
): [number, number, number] {
  return [
    partialX(fExpr, x, y, z),
    partialY(fExpr, x, y, z),
    partialZ(fExpr, x, y, z),
  ];
}

/** Second-order partial for Hessian */
function partial2(expr: string, v1: 'x'|'y'|'z', v2: 'x'|'y'|'z', x: number, y: number, z: number): number {
  const fn = safeCompile(expr);
  if (!fn) return 0;
  const scope = { x, y, z };
  const s1p = { ...scope, [v1]: scope[v1] + H };
  const s1m = { ...scope, [v1]: scope[v1] - H };
  const s2p = { ...s1p, [v2]: scope[v2] + H };
  const s2m = { ...s1p, [v2]: scope[v2] - H };
  const s3p = { ...s1m, [v2]: scope[v2] + H };
  const s3m = { ...s1m, [v2]: scope[v2] - H };
  const f1 = (evalNumber(fn, s2p) ?? 0) - (evalNumber(fn, s2m) ?? 0);
  const f2 = (evalNumber(fn, s3p) ?? 0) - (evalNumber(fn, s3m) ?? 0);
  return (f1 - f2) / (4 * H * H);
}

/** Hessian matrix [fxx, fxy; fyx, fyy] at (x,y) — for 2D critical point analysis */
export function hessian2D(fExpr: string, x: number, y: number): number[][] {
  const fxx = partial2(fExpr, 'x', 'x', x, y, 0);
  const fxy = partial2(fExpr, 'x', 'y', x, y, 0);
  const fyx = partial2(fExpr, 'y', 'x', x, y, 0);
  const fyy = partial2(fExpr, 'y', 'y', x, y, 0);
  return [[fxx, fxy], [fyx, fyy]];
}

/** Classify a 2D critical point from D = det(H) and fxx */
export function classifyCriticalPoint(
  fExpr: string, x: number, y: number,
): 'mínimo local' | 'máximo local' | 'punto silla' | 'prueba inconclusa' {
  const H = hessian2D(fExpr, x, y);
  const D = H[0][0] * H[1][1] - H[0][1] * H[1][0];
  if (D < 0) return 'punto silla';
  if (D > 0 && H[0][0] > 0) return 'mínimo local';
  if (D > 0 && H[0][0] < 0) return 'máximo local';
  return 'prueba inconclusa';
}

// ─── Divergence & Curl ──────────────────────────────────────────────────────

/** Divergence ∇·F = ∂P/∂x + ∂Q/∂y + ∂R/∂z */
export function divergence(
  P: string, Q: string, R: string,
  x: number, y: number, z: number,
): number {
  return partialX(P, x, y, z) + partialY(Q, x, y, z) + partialZ(R, x, y, z);
}

/** Curl ∇×F = <∂R/∂y - ∂Q/∂z, ∂P/∂z - ∂R/∂x, ∂Q/∂x - ∂P/∂y> */
export function curl(
  P: string, Q: string, R: string,
  x: number, y: number, z: number,
): [number, number, number] {
  const curlX = partialY(R, x, y, z) - partialZ(Q, x, y, z);
  const curlY = partialZ(P, x, y, z) - partialX(R, x, y, z);
  const curlZ = partialX(Q, x, y, z) - partialY(P, x, y, z);
  return [curlX, curlY, curlZ];
}

// ─── Line Integral ─────────────────────────────────────────────────────────

export interface CurveParam {
  xExpr: string; // x(t)
  yExpr: string; // y(t)
  zExpr: string; // z(t)
  tMin: number;
  tMax: number;
}

/** ∫_C F·dr = ∫_{t0}^{t1} F(r(t))·r'(t) dt */
export function lineIntegral(
  P: string, Q: string, R: string,
  curve: CurveParam,
  panels = 100,
): IntegralResult {
  const steps: IntegralStep[] = [];
  const xFn = safeCompile(curve.xExpr);
  const yFn = safeCompile(curve.yExpr);
  const zFn = safeCompile(curve.zExpr);
  const PFn = safeCompile(P);
  const QFn = safeCompile(Q);
  const RFn = safeCompile(R);

  if (!xFn || !yFn || !zFn || !PFn || !QFn || !RFn) {
    return { value: null, error: 'Expresión inválida', steps };
  }

  steps.push({
    title: 'Integral de línea planteada',
    content: `∫_C F·dr donde:\n  F = ⟨${P}, ${Q}, ${R}⟩\n  r(t) = ⟨${curve.xExpr}, ${curve.yExpr}, ${curve.zExpr}⟩\n  t ∈ [${curve.tMin}, ${curve.tMax}]`,
  });

  steps.push({
    title: 'Parametrización',
    content: `∫_C F·dr = ∫_{${curve.tMin}}^{${curve.tMax}} F(r(t)) · r'(t) dt\n\ndonde r'(t) = ⟨dx/dt, dy/dt, dz/dt⟩ (diferencias finitas)`,
  });

  try {
    const dt = H;
    const integrand = (t: number): number => {
      const x = evalNumber(xFn, { t }) ?? 0;
      const y = evalNumber(yFn, { t }) ?? 0;
      const z = evalNumber(zFn, { t }) ?? 0;
      const x2 = evalNumber(xFn, { t: t + dt }) ?? 0;
      const y2 = evalNumber(yFn, { t: t + dt }) ?? 0;
      const z2 = evalNumber(zFn, { t: t + dt }) ?? 0;
      const dxdt = (x2 - x) / dt;
      const dydt = (y2 - y) / dt;
      const dzdt = (z2 - z) / dt;
      const Pv = evalNumber(PFn, { x, y, z }) ?? 0;
      const Qv = evalNumber(QFn, { x, y, z }) ?? 0;
      const Rv = evalNumber(RFn, { x, y, z }) ?? 0;
      return Pv * dxdt + Qv * dydt + Rv * dzdt;
    };

    const dStep = (curve.tMax - curve.tMin) / panels;
    let value = 0;
    for (let i = 0; i < panels; i++) {
      const t0 = curve.tMin + i * dStep;
      const t1 = t0 + dStep;
      const tm = (t0 + t1) / 2;
      value += (t1 - t0) / 6 * (integrand(t0) + 4 * integrand(tm) + integrand(t1));
    }

    steps.push({
      title: 'Resultado',
      content: `∫_C F·dr ≈ ${value.toFixed(8)}`,
    });

    return { value, error: null, steps };
  } catch (e) {
    return { value: null, error: String(e), steps };
  }
}

// ─── Surface Integral (Flux) ───────────────────────────────────────────────

export interface SurfaceParam {
  xExpr: string; // x(u,v)
  yExpr: string; // y(u,v)
  zExpr: string; // z(u,v)
  uMin: number; uMax: number;
  vMin: number; vMax: number;
}

/** ∬_S F·dS = ∬ F(r(u,v))·(r_u × r_v) du dv */
export function surfaceIntegral(
  P: string, Q: string, R: string,
  surf: SurfaceParam,
  panels = 30,
): IntegralResult {
  const steps: IntegralStep[] = [];
  const xFn = safeCompile(surf.xExpr);
  const yFn = safeCompile(surf.yExpr);
  const zFn = safeCompile(surf.zExpr);
  const PFn = safeCompile(P);
  const QFn = safeCompile(Q);
  const RFn = safeCompile(R);

  if (!xFn || !yFn || !zFn || !PFn || !QFn || !RFn) {
    return { value: null, error: 'Expresión inválida', steps };
  }

  steps.push({
    title: 'Integral de superficie (flujo) planteada',
    content: `∬_S F·dS donde:\n  F = ⟨${P}, ${Q}, ${R}⟩\n  r(u,v) = ⟨${surf.xExpr}, ${surf.yExpr}, ${surf.zExpr}⟩\n  u ∈ [${surf.uMin}, ${surf.uMax}], v ∈ [${surf.vMin}, ${surf.vMax}]`,
  });

  steps.push({
    title: 'Vector normal dS = r_u × r_v du dv',
    content: 'El vector normal se calcula como el producto cruzado de las derivadas parciales de la parametrización: r_u × r_v (diferencias finitas centrales).',
  });

  try {
    const cross = (
      a: [number,number,number], b: [number,number,number],
    ): [number,number,number] => [
      a[1]*b[2] - a[2]*b[1],
      a[2]*b[0] - a[0]*b[2],
      a[0]*b[1] - a[1]*b[0],
    ];

    const r = (u: number, v: number): [number,number,number] => [
      evalNumber(xFn, { u, v }) ?? 0,
      evalNumber(yFn, { u, v }) ?? 0,
      evalNumber(zFn, { u, v }) ?? 0,
    ];

    const integrand = (u: number, v: number): number => {
      const [x, y, z] = r(u, v);
      const [x1,y1,z1] = r(u+H,v);
      const [x2,y2,z2] = r(u-H,v);
      const [x3,y3,z3] = r(u,v+H);
      const [x4,y4,z4] = r(u,v-H);
      const ru: [number,number,number] = [(x1-x2)/(2*H),(y1-y2)/(2*H),(z1-z2)/(2*H)];
      const rv: [number,number,number] = [(x3-x4)/(2*H),(y3-y4)/(2*H),(z3-z4)/(2*H)];
      const n = cross(ru, rv);
      const Pv = evalNumber(PFn, { x, y, z }) ?? 0;
      const Qv = evalNumber(QFn, { x, y, z }) ?? 0;
      const Rv = evalNumber(RFn, { x, y, z }) ?? 0;
      return Pv*n[0] + Qv*n[1] + Rv*n[2];
    };

    const du = (surf.uMax - surf.uMin) / panels;
    const dv = (surf.vMax - surf.vMin) / panels;
    let value = 0;
    for (let i = 0; i < panels; i++) {
      for (let j = 0; j < panels; j++) {
        const u = surf.uMin + (i + 0.5) * du;
        const v = surf.vMin + (j + 0.5) * dv;
        value += integrand(u, v) * du * dv;
      }
    }

    steps.push({
      title: 'Resultado',
      content: `∬_S F·dS ≈ ${value.toFixed(8)}`,
    });

    return { value, error: null, steps };
  } catch (e) {
    return { value: null, error: String(e), steps };
  }
}

// ─── Divergence Theorem verification ──────────────────────────────────────

/** Numerically compute ∭_E ∇·F dV over box [x0,x1]×[y0,y1]×[z0,z1] */
export function tripleIntegralDivergence(
  P: string, Q: string, R: string,
  x0: number, x1: number,
  y0: number, y1: number,
  z0: number, z1: number,
  n = 15,
): number {
  const dx = (x1-x0)/n, dy = (y1-y0)/n, dz = (z1-z0)/n;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const x = x0 + (i+0.5)*dx;
    for (let j = 0; j < n; j++) {
      const y = y0 + (j+0.5)*dy;
      for (let k = 0; k < n; k++) {
        const z = z0 + (k+0.5)*dz;
        sum += divergence(P, Q, R, x, y, z) * dx * dy * dz;
      }
    }
  }
  return sum;
}

/** Green's theorem: ∮_C F·dr = ∬_D (∂Q/∂x - ∂P/∂y) dA */
export function greensTheoremArea(
  P: string, Q: string,
  xMin: number, xMax: number,
  yMin: number, yMax: number,
  n = 60,
): number {
  const dx = (xMax-xMin)/n, dy = (yMax-yMin)/n;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const x = xMin + (i+0.5)*dx;
    for (let j = 0; j < n; j++) {
      const y = yMin + (j+0.5)*dy;
      const dQdx = partialX(Q, x, y, 0);
      const dPdy = partialY(P, x, y, 0);
      sum += (dQdx - dPdy) * dx * dy;
    }
  }
  return sum;
}

// ─── Sample vector field for Plotly cones ──────────────────────────────────

export interface VectorFieldSample {
  x: number[]; y: number[]; z: number[];
  u: number[]; v: number[]; w: number[];
}

export function sampleVectorField(
  P: string, Q: string, R: string,
  xMin: number, xMax: number,
  yMin: number, yMax: number,
  zMin: number, zMax: number,
  gridN = 6,
): VectorFieldSample {
  const PFn = safeCompile(P);
  const QFn = safeCompile(Q);
  const RFn = safeCompile(R);

  const xs: number[] = [], ys: number[] = [], zs: number[] = [];
  const us: number[] = [], vs: number[] = [], ws: number[] = [];

  for (let i = 0; i < gridN; i++) {
    for (let j = 0; j < gridN; j++) {
      for (let k = 0; k < gridN; k++) {
        const x = xMin + (i / (gridN-1)) * (xMax - xMin);
        const y = yMin + (j / (gridN-1)) * (yMax - yMin);
        const z = zMin + (k / (gridN-1)) * (zMax - zMin);
        const u = PFn ? (evalNumber(PFn, { x, y, z }) ?? 0) : 0;
        const v = QFn ? (evalNumber(QFn, { x, y, z }) ?? 0) : 0;
        const w = RFn ? (evalNumber(RFn, { x, y, z }) ?? 0) : 0;
        xs.push(x); ys.push(y); zs.push(z);
        us.push(u); vs.push(v); ws.push(w);
      }
    }
  }

  return { x: xs, y: ys, z: zs, u: us, v: vs, w: ws };
}

/** Sample gradient field ∇f */
export function sampleGradientField(
  fExpr: string,
  xMin: number, xMax: number,
  yMin: number, yMax: number,
  gridN = 10,
): VectorFieldSample {
  const xs: number[] = [], ys: number[] = [], zs: number[] = [];
  const us: number[] = [], vs: number[] = [], ws: number[] = [];

  for (let i = 0; i < gridN; i++) {
    for (let j = 0; j < gridN; j++) {
      const x = xMin + (i / (gridN-1)) * (xMax - xMin);
      const y = yMin + (j / (gridN-1)) * (yMax - yMin);
      const [gx, gy] = gradient(fExpr, x, y, 0);
      xs.push(x); ys.push(y); zs.push(0);
      us.push(gx); vs.push(gy); ws.push(0);
    }
  }

  return { x: xs, y: ys, z: zs, u: us, v: vs, w: ws };
}
