import type { GraphRange } from './mathEngine';

/** Coordenadas normalizadas del cubo fijo en pantalla */
export const CUBE_LO = -1;
export const CUBE_HI = 1;

export const INITIAL_VIEW_DOMAIN: Pick<GraphRange, 'xMin' | 'xMax' | 'yMin' | 'yMax' | 'zMin' | 'zMax'> = {
  xMin: -4,
  xMax: 4,
  yMin: -4,
  yMax: 4,
  zMin: -4,
  zMax: 4,
};

const MIN_XY_SPAN = 0.2;
const MAX_XY_SPAN = 200;
const ZOOM_WHEEL_FACTOR = 1.12;

export function normalizeToCube(value: number, min: number, max: number): number {
  const mid = (min + max) / 2;
  const half = (max - min) / 2;
  if (half <= 0) return 0;
  return (value - mid) / half;
}

export function expandViewDomain(range: GraphRange, zoomOut: boolean): GraphRange {
  const factor = zoomOut ? ZOOM_WHEEL_FACTOR : 1 / ZOOM_WHEEL_FACTOR;
  const cx = (range.xMin + range.xMax) / 2;
  const cy = (range.yMin + range.yMax) / 2;
  const cz = (range.zMin + range.zMax) / 2;
  
  let hx = ((range.xMax - range.xMin) / 2) * factor;
  let hy = ((range.yMax - range.yMin) / 2) * factor;
  let hz = ((range.zMax - range.zMin) / 2) * factor;

  hx = Math.max(MIN_XY_SPAN / 2, Math.min(MAX_XY_SPAN / 2, hx));
  hy = Math.max(MIN_XY_SPAN / 2, Math.min(MAX_XY_SPAN / 2, hy));
  hz = Math.max(MIN_XY_SPAN / 2, Math.min(MAX_XY_SPAN / 2, hz));

  return {
    ...range,
    xMin: cx - hx,
    xMax: cx + hx,
    yMin: cy - hy,
    yMax: cy + hy,
    zMin: cz - hz,
    zMax: cz + hz,
  };
}

export function tickValues(min: number, max: number): number[] {
  const span = max - min;
  if (span <= 0) return [0];

  // Target ~16 ticks so every integer shows for typical ranges (e.g. -6 to 6)
  const rawStep = span / 16;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const niceSteps = [1, 2, 2.5, 5, 10];
  let step = magnitude;
  for (const ns of niceSteps) {
    if (ns * magnitude >= rawStep) {
      step = ns * magnitude;
      break;
    }
  }

  const ticks: number[] = [];
  const start = Math.ceil(min / step) * step;
  for (let v = start; v <= max + step * 0.01; v += step) {
    const rounded = Math.round(v * 1e6) / 1e6;
    ticks.push(rounded);
  }
  if (min < 0 && max > 0 && !ticks.some(t => Math.abs(t) < step * 0.01)) {
    ticks.push(0);
    ticks.sort((a, b) => a - b);
  }
  return ticks;
}

export function formatTick(v: number): string {
  if (Number.isInteger(v)) return String(v);
  return Number(v.toFixed(2)).toString();
}

/** Más divisiones en el plano cuando el dominio crece */
export function gridDivisionsForSpan(span: number): number {
  return Math.min(36, Math.max(8, Math.round((span / 4) * 6)));
}

export function isInsideCube(nx: number, ny: number, nz: number): boolean {
  return nx >= CUBE_LO && nx <= CUBE_HI && ny >= CUBE_LO && ny <= CUBE_HI && nz >= CUBE_LO && nz <= CUBE_HI;
}
