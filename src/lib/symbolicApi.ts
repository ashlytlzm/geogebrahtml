/**
 * symbolicApi.ts
 * Frontend client for the FastAPI + SymPy backend.
 * Falls back gracefully to null when the backend is unavailable.
 */

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:8787';

let _backendAvailable: boolean | null = null; // null = not checked yet

/** Check once if the backend is reachable */
export async function isBackendAvailable(): Promise<boolean> {
  if (_backendAvailable !== null) return _backendAvailable;
  try {
    const res = await fetch(`${BACKEND_URL}/health`, { signal: AbortSignal.timeout(2000) });
    _backendAvailable = res.ok;
  } catch {
    _backendAvailable = false;
  }
  return _backendAvailable;
}

/** Reset availability cache (call if user clicks "reconectar") */
export function resetBackendCache() {
  _backendAvailable = null;
}

// ─── Response shape ─────────────────────────────────────────────────────────

export interface SymbolicStep {
  title: string;
  content: string;
  latex?: string;
}

export interface SymbolicResult {
  value?: number | null;
  symbolic?: string | null;
  steps: SymbolicStep[];
  error: string | null;
  source: 'sympy' | 'fallback';
}

// ─── Generic POST helper ────────────────────────────────────────────────────

async function post<T>(endpoint: string, body: unknown): Promise<T | null> {
  try {
    const res = await fetch(`${BACKEND_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail ?? res.statusText);
    }
    return await res.json() as T;
  } catch {
    return null;
  }
}

// ─── API calls ──────────────────────────────────────────────────────────────

export async function symbolicDoubleIntegral(
  f: string,
  x_min: number, x_max: number,
  y_min_expr: string, y_max_expr: string,
  order?: string,
): Promise<SymbolicResult | null> {
  const ok = await isBackendAvailable();
  if (!ok) return null;
  const raw = await post<SymbolicResult & { source?: string }>('/integrate/double', {
    f, x_min, x_max, y_min_expr, y_max_expr, order,
  });
  if (!raw) return null;
  return { ...raw, source: raw.error ? 'fallback' : 'sympy' };
}

export async function symbolicTripleIntegral(
  f: string,
  x_min: number, x_max: number,
  y_min_expr: string, y_max_expr: string,
  z_min_expr: string, z_max_expr: string,
  order?: string,
): Promise<SymbolicResult | null> {
  const ok = await isBackendAvailable();
  if (!ok) return null;
  const raw = await post<SymbolicResult>('/integrate/triple', {
    f, x_min, x_max, y_min_expr, y_max_expr, z_min_expr, z_max_expr, order,
  });
  if (!raw) return null;
  return { ...raw, source: raw.error ? 'fallback' : 'sympy' };
}

export async function symbolicGradient(
  f: string,
  point?: { x: number; y: number; z: number },
): Promise<(SymbolicResult & { gx?: string; gy?: string; gz?: string }) | null> {
  const ok = await isBackendAvailable();
  if (!ok) return null;
  return post('/gradient', { f, point });
}

export async function symbolicPartial(
  f: string,
  variable: 'x' | 'y' | 'z',
  point?: { x: number; y: number; z: number },
): Promise<(SymbolicResult & { symbolic?: string }) | null> {
  const ok = await isBackendAvailable();
  if (!ok) return null;
  return post('/derivative/partial', { f, variable, point });
}

export async function symbolicCurl(
  P: string, Q: string, R: string,
  point?: { x: number; y: number; z: number },
): Promise<(SymbolicResult & { curl_x?: string; curl_y?: string; curl_z?: string }) | null> {
  const ok = await isBackendAvailable();
  if (!ok) return null;
  return post('/vector/curl', { P, Q, R, point });
}

export async function symbolicDivergence(
  P: string, Q: string, R: string,
  point?: { x: number; y: number; z: number },
): Promise<(SymbolicResult & { divergence?: string }) | null> {
  const ok = await isBackendAvailable();
  if (!ok) return null;
  return post('/vector/divergence', { P, Q, R, point });
}

export async function symbolicCriticalPoints(
  f: string,
  x_min = -5, x_max = 5,
  y_min = -5, y_max = 5,
): Promise<(SymbolicResult & { points?: CriticalPoint[] }) | null> {
  const ok = await isBackendAvailable();
  if (!ok) return null;
  return post('/critical-points', { f, x_min, x_max, y_min, y_max });
}

export interface CriticalPoint {
  x: number; y: number; f: number;
  D: number; fxx: number; tipo: string;
}

export async function symbolicCoordConvert(
  f: string,
  from_system: string,
  to_system: string,
): Promise<(SymbolicResult & { jacobian?: string; jacobian_latex?: string }) | null> {
  const ok = await isBackendAvailable();
  if (!ok) return null;
  return post('/coord/convert', { f, from_system, to_system });
}
