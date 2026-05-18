import { compile, type EvalFunction } from 'mathjs';

export type FunctionKind = 'surface' | 'curve-x' | 'curve-y' | 'constant' | 'implicit3d';

export type GraphMode = 'auto' | 'curve2d' | 'contour' | 'surface3d' | 'implicit3d';

export interface GraphRange {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  zMin: number;
  zMax: number;
  samples2d: number;
  samples3d: number;
}

export const DEFAULT_RANGE: GraphRange = {
  xMin: -4,
  xMax: 4,
  yMin: -4,
  yMax: 4,
  zMin: -4,
  zMax: 4,
  samples2d: 600,
  samples3d: 90,
};

/** Convierte notación tipo LaTeX ($x^2$, \sin(x)) a sintaxis Math.js */
export function normalizeExpression(raw: string): string {
  let s = raw.trim();

  s = s.replace(/\$/g, '');
  s = s.replace(/\\left/g, '').replace(/\\right/g, '');
  s = s.replace(/\\cdot/g, '*').replace(/\\times/g, '*').replace(/\\div/g, '/');
  s = s.replace(/\\pi/g, 'pi').replace(/\\e\b/g, 'e');
  s = s.replace(/\\sin/g, 'sin').replace(/\\cos/g, 'cos').replace(/\\tan/g, 'tan');
  s = s.replace(/\\ln/g, 'log').replace(/\\log_{10}/g, 'log10').replace(/\\log/g, 'log10');
  s = s.replace(/\\sqrt\{([^}]*)\}/g, 'sqrt($1)');
  s = s.replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '(($1)/($2))');
  s = s.replace(/\^\{([^}]*)\}/g, '^($1)');
  s = s.replace(/([0-9])([a-zA-Z(])/g, '$1*$2');
  s = s.replace(/\)([a-zA-Z(])/g, ')*$1');

  if (s.includes('=')) {
    const parts = s.split('=');
    if (parts.length === 2) {
      return `(${parts[0].trim()}) - (${parts[1].trim()})`;
    }
  }

  return s.trim();
}

export function splitEquations(raw: string): string[] {
  return raw
    .split(/[;\n]/)
    .map((e) => e.trim())
    .filter(Boolean);
}

export function safeCompile(expr: string): EvalFunction | null {
  try {
    return compile(normalizeExpression(expr)) as EvalFunction;
  } catch {
    return null;
  }
}

export function evalNumber(
  fn: EvalFunction,
  scope: Record<string, number>,
): number | null {
  try {
    const result = fn.evaluate(scope);
    if (typeof result === 'number' && isFinite(result)) return result;
    if (result && typeof result === 'object' && 're' in result) {
      const c = result as { re: number; im: number };
      if (Math.abs(c.im) < 1e-8) return c.re;
    }
    return null;
  } catch {
    return null;
  }
}

export function detectFunctionKind(equation: string): FunctionKind {
  const fn = safeCompile(equation);
  if (!fn) return 'surface';

  const tests = [
    { x: 0.5, y: 0.3, z: 0.1 },
    { x: -1, y: 2, z: -0.5 },
    { x: 3, y: -0.7, z: 1.2 },
  ];

  let dependsOnX = false;
  let dependsOnY = false;
  let dependsOnZ = false;

  for (const t of tests) {
    const base = evalNumber(fn, t);
    if (base === null) continue;
    const vx = evalNumber(fn, { x: t.x + 0.01, y: t.y, z: t.z });
    const vy = evalNumber(fn, { x: t.x, y: t.y + 0.01, z: t.z });
    const vz = evalNumber(fn, { x: t.x, y: t.y, z: t.z + 0.01 });
    if (vx !== null && Math.abs(vx - base) > 1e-9) dependsOnX = true;
    if (vy !== null && Math.abs(vy - base) > 1e-9) dependsOnY = true;
    if (vz !== null && Math.abs(vz - base) > 1e-9) dependsOnZ = true;
  }

  if (dependsOnZ) return 'implicit3d';
  if (dependsOnX && dependsOnY) return 'surface';
  if (dependsOnX) return 'curve-x';
  if (dependsOnY) return 'curve-y';
  return 'constant';
}

export function resolveGraphMode(equation: string, mode: GraphMode): GraphMode {
  if (mode !== 'auto') return mode;
  const kind = detectFunctionKind(equation);
  if (kind === 'implicit3d') return 'implicit3d';
  if (kind === 'surface') return 'surface3d';
  if (kind === 'constant') return 'contour';
  return 'curve2d';
}

export function validateExpression(expr: string): string | null {
  try {
    compile(normalizeExpression(expr));
    return null;
  } catch {
    return 'Ecuación inválida';
  }
}

export function getExpressionLabel(expr: string): string {
  return normalizeExpression(expr);
}
