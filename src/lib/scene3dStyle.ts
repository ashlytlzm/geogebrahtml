import type { Data, Layout } from 'plotly.js';
import type { GraphRange } from './mathEngine';
import {
  CUBE_HI,
  CUBE_LO,
  formatTick,
  gridDivisionsForSpan,
  isInsideCube,
  normalizeToCube,
  tickValues,
} from './cubeViewport';

const SURFACE_RED = '#d32f2f';
const SURFACE_GRID = '#ffffff';
const AXIS_GRAY = '#757575';
const BOX_GRAY = '#bdbdbd';
const PLANE_FILL = 'rgba(200, 200, 200, 0.28)';
const FLOOR_LINE = 'rgba(90, 90, 90, 0.5)';
const TICK_BLACK = '#111111';
const PLANE_Z = 0;

export const FIXED_CAMERA = {
  projection: { type: 'perspective' as const },
  eye: { x: 1.4, y: 1.4, z: 0.7 },
  center: { x: 0, y: 0, z: 0 },
  up: { x: 0, y: 0, z: 1 },
};

export function zExtentFromMatrix(z: number[][]): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const row of z) {
    for (const v of row) {
      if (typeof v === 'number' && isFinite(v)) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
  }
  if (!isFinite(min) || !isFinite(max)) return { min: -1, max: 1 };
  return { min, max };
}

function edge(x: [number, number], y: [number, number], z: [number, number]) {
  return { x, y, z };
}

/** Cubo alámbrico FIJO en pantalla (−1…1) */
export function buildStaticBoundingBox(): Data {
  const edges = [
    edge([CUBE_LO, CUBE_HI], [CUBE_LO, CUBE_LO], [CUBE_LO, CUBE_LO]),
    edge([CUBE_LO, CUBE_LO], [CUBE_LO, CUBE_HI], [CUBE_LO, CUBE_LO]),
    edge([CUBE_HI, CUBE_HI], [CUBE_LO, CUBE_HI], [CUBE_LO, CUBE_LO]),
    edge([CUBE_LO, CUBE_HI], [CUBE_HI, CUBE_HI], [CUBE_LO, CUBE_LO]),
    edge([CUBE_LO, CUBE_HI], [CUBE_LO, CUBE_LO], [CUBE_HI, CUBE_HI]),
    edge([CUBE_LO, CUBE_LO], [CUBE_LO, CUBE_HI], [CUBE_HI, CUBE_HI]),
    edge([CUBE_HI, CUBE_HI], [CUBE_LO, CUBE_HI], [CUBE_HI, CUBE_HI]),
    edge([CUBE_LO, CUBE_HI], [CUBE_HI, CUBE_HI], [CUBE_HI, CUBE_HI]),
    edge([CUBE_LO, CUBE_LO], [CUBE_LO, CUBE_LO], [CUBE_LO, CUBE_HI]),
    edge([CUBE_HI, CUBE_HI], [CUBE_LO, CUBE_LO], [CUBE_LO, CUBE_HI]),
    edge([CUBE_LO, CUBE_LO], [CUBE_HI, CUBE_HI], [CUBE_LO, CUBE_HI]),
    edge([CUBE_HI, CUBE_HI], [CUBE_HI, CUBE_HI], [CUBE_LO, CUBE_HI]),
  ];

  const x: (number | null)[] = [];
  const y: (number | null)[] = [];
  const z: (number | null)[] = [];
  for (const e of edges) {
    x.push(e.x[0], e.x[1], null);
    y.push(e.y[0], e.y[1], null);
    z.push(e.z[0], e.z[1], null);
  }

  return {
    type: 'scatter3d',
    mode: 'lines',
    x,
    y,
    z,
    line: { color: BOX_GRAY, width: 1.5 },
    hoverinfo: 'skip',
    showlegend: false,
    name: '_box',
  };
}

function normX(x: number, d: GraphRange) {
  return normalizeToCube(x, d.xMin, d.xMax);
}
function normY(y: number, d: GraphRange) {
  return normalizeToCube(y, d.yMin, d.yMax);
}
function normZ(z: number, d: GraphRange) {
  return normalizeToCube(z, d.zMin, d.zMax);
}

/** Plano z=0 translúcido; la rejilla se escala con el dominio */
export function buildScaledZeroPlane(domain: GraphRange): Data | null {
  if (domain.zMin > PLANE_Z || domain.zMax < PLANE_Z) return null;

  const nx0 = CUBE_LO;
  const nx1 = CUBE_HI;
  const ny0 = CUBE_LO;
  const ny1 = CUBE_HI;
  const nz = normZ(PLANE_Z, domain);

  return {
    type: 'surface',
    x: [nx0, nx1],
    y: [ny0, ny1],
    z: [
      [nz, nz],
      [nz, nz],
    ],
    colorscale: [[0, PLANE_FILL], [1, PLANE_FILL]],
    showscale: false,
    opacity: 0.4,
    hoverinfo: 'skip',
    showlegend: false,
    name: '_z0',
  } as Data;
}

export function buildScaledFloorGrid(domain: GraphRange): Data | null {
  if (domain.zMin > PLANE_Z || domain.zMax < PLANE_Z) return null;

  const divX = gridDivisionsForSpan(domain.xMax - domain.xMin);
  const divY = gridDivisionsForSpan(domain.yMax - domain.yMin);
  const nz = normZ(PLANE_Z, domain);

  const x: (number | null)[] = [];
  const y: (number | null)[] = [];
  const z: (number | null)[] = [];

  for (let i = 0; i <= divX; i++) {
    const t = i / divX;
    const wx = domain.xMin + t * (domain.xMax - domain.xMin);
    const nx = normX(wx, domain);
    x.push(nx, nx, null);
    y.push(CUBE_LO, CUBE_HI, null);
    z.push(nz, nz, null);
  }
  for (let i = 0; i <= divY; i++) {
    const t = i / divY;
    const wy = domain.yMin + t * (domain.yMax - domain.yMin);
    const ny = normY(wy, domain);
    x.push(CUBE_LO, CUBE_HI, null);
    y.push(ny, ny, null);
    z.push(nz, nz, null);
  }

  return {
    type: 'scatter3d',
    mode: 'lines',
    x,
    y,
    z,
    line: { color: FLOOR_LINE, width: 1 },
    hoverinfo: 'skip',
    showlegend: false,
    name: '_floor',
  };
}

function buildAxisLine(
  from: [number, number, number],
  to: [number, number, number],
  color: string,
): Data {
  return {
    type: 'scatter3d',
    mode: 'lines',
    x: [from[0], to[0]],
    y: [from[1], to[1]],
    z: [from[2], to[2]],
    line: { color: color, width: 6 },
    hoverinfo: 'skip',
    showlegend: false,
    name: '_ax',
  };
}

function buildAxisArrow(tip: [number, number, number], dir: [number, number, number], size: number, color: string): Data {
  return {
    type: 'cone',
    x: [tip[0]],
    y: [tip[1]],
    z: [tip[2]],
    u: [dir[0] * size],
    v: [dir[1] * size],
    w: [dir[2] * size],
    sizemode: 'absolute',
    sizeref: size * 0.45,
    anchor: 'tip',
    colorscale: [[0, color], [1, color]],
    showscale: false,
    hoverinfo: 'skip',
    showlegend: false,
    name: '_arrow',
  } as Data;
}

/** Ejes cruzando el cubo entero en colores + etiquetas X,Y,Z */
export function buildStaticAxes(): { traces: Data[]; labelAnnotations: Record<string, unknown>[] } {
  const ext = CUBE_HI * 1.05; // Slightly past the cube
  const arrow = 0.08;
  const cX = '#d32f2f'; // Rojo
  const cY = '#388e3c'; // Verde
  const cZ = '#1565c0'; // Azul

  const traces: Data[] = [
    buildAxisLine([-ext, 0, 0], [ext, 0, 0], cX),
    buildAxisLine([0, -ext, 0], [0, ext, 0], cY),
    buildAxisLine([0, 0, -ext], [0, 0, ext], cZ),
    
    // Flechas en puntas positivas
    buildAxisArrow([ext, 0, 0], [1, 0, 0], arrow, cX),
    buildAxisArrow([0, ext, 0], [0, 1, 0], arrow, cY),
    buildAxisArrow([0, 0, ext], [0, 0, 1], arrow, cZ),
  ];

  const labelAnnotations: Record<string, unknown>[] = [
    { x: ext + 0.1, y: 0, z: 0, text: '<b>X</b>', showarrow: false, font: { size: 24, color: cX } },
    { x: 0, y: ext + 0.1, z: 0, text: '<b>Y</b>', showarrow: false, font: { size: 24, color: cY } },
    { x: 0, y: 0, z: ext + 0.1, text: '<b>Z</b>', showarrow: false, font: { size: 24, color: cZ } },
  ];

  return { traces, labelAnnotations };
}

/** Etiquetas numéricas dinámicas según dominio actual + rayas de graduación */
export function buildDynamicTickAnnotations(domain: GraphRange): {
  annotations: Record<string, unknown>[];
  tickTraces: Data[];
} {
  const anns: Record<string, unknown>[] = [];
  const font = { size: 11, color: TICK_BLACK, family: 'Arial, Helvetica, sans-serif' };
  const dashLen = 0.03; // Length of tick dash

  const xTicks = tickValues(domain.xMin, domain.xMax);
  const yTicks = tickValues(domain.yMin, domain.yMax);
  const zTicks = tickValues(domain.zMin, domain.zMax);

  // X axis numbers + dashes
  const txX: (number | null)[] = [];
  const tyX: (number | null)[] = [];
  const tzX: (number | null)[] = [];
  for (const t of xTicks) {
    const nx = normX(t, domain);
    if (Math.abs(nx) > 1.01) continue;
    anns.push({
      x: nx, y: 0, z: -0.08,
      text: formatTick(t),
      showarrow: false, font,
    });
    txX.push(nx, nx, null);
    tyX.push(0, 0, null);
    tzX.push(-dashLen, dashLen, null);
  }

  // Y axis numbers + dashes
  const txY: (number | null)[] = [];
  const tyY: (number | null)[] = [];
  const tzY: (number | null)[] = [];
  for (const t of yTicks) {
    const ny = normY(t, domain);
    if (Math.abs(ny) > 1.01) continue;
    anns.push({
      x: 0, y: ny, z: -0.08,
      text: formatTick(t),
      showarrow: false, font,
    });
    txY.push(0, 0, null);
    tyY.push(ny, ny, null);
    tzY.push(-dashLen, dashLen, null);
  }

  // Z axis numbers + dashes
  const txZ: (number | null)[] = [];
  const tyZ: (number | null)[] = [];
  const tzZ: (number | null)[] = [];
  for (const t of zTicks) {
    const nz = normZ(t, domain);
    if (Math.abs(nz) > 1.01) continue;
    anns.push({
      x: -0.08, y: 0, z: nz,
      text: formatTick(t),
      showarrow: false, font,
    });
    txZ.push(-dashLen, dashLen, null);
    tyZ.push(0, 0, null);
    tzZ.push(nz, nz, null);
  }

  const makeDashTrace = (x: (number|null)[], y: (number|null)[], z: (number|null)[]): Data => ({
    type: 'scatter3d', mode: 'lines',
    x, y, z,
    line: { color: '#999', width: 2 },
    hoverinfo: 'skip', showlegend: false, name: '_tick',
  });

  const tickTraces: Data[] = [
    makeDashTrace(txX, tyX, tzX),
    makeDashTrace(txY, tyY, tzY),
    makeDashTrace(txZ, tyZ, tzZ),
  ];

  return { annotations: anns, tickTraces };
}

/** Superficie roja con iluminación de estudio + malla blanca; recortada al cubo */
export function buildNormalizedSurface(
  xs: number[],
  ys: number[],
  zWorld: number[][],
  domain: GraphRange,
  name: string,
): Data {
  const xNorm = xs.map((x) => normX(x, domain));
  const yNorm = ys.map((y) => normY(y, domain));
  const zNorm: number[][] = [];
  const meta: string[][] = [];

  for (let i = 0; i < ys.length; i++) {
    const zRow: number[] = [];
    const mRow: string[] = [];
    for (let j = 0; j < xs.length; j++) {
      const zw = zWorld[i][j];
      const nx = xNorm[j];
      const ny = yNorm[i];
      const nz = isFinite(zw) ? normZ(zw, domain) : NaN;

      if (!isFinite(zw) || !isInsideCube(nx, ny, nz)) {
        zRow.push(NaN);
        mRow.push('');
      } else {
        zRow.push(nz);
        mRow.push(`${xs[j].toFixed(3)}, ${ys[i].toFixed(3)}, ${zw.toFixed(3)}`);
      }
    }
    zNorm.push(zRow);
    meta.push(mRow);
  }

  const stepX = xNorm.length > 1 ? Math.abs(xNorm[1] - xNorm[0]) : 0.15;
  const stepY = yNorm.length > 1 ? Math.abs(yNorm[1] - yNorm[0]) : 0.15;

  return {
    type: 'surface',
    x: xNorm,
    y: yNorm,
    z: zNorm,
    text: meta,
    name,
    colorscale: [[0, SURFACE_RED], [1, SURFACE_RED]],
    showscale: false,
    opacity: 1,
    hovertemplate: '%{text}<extra></extra>',
    contours: {
      x: {
        show: true,
        start: CUBE_LO,
        end: CUBE_HI,
        size: stepX,
        color: SURFACE_GRID,
        width: 1.3,
        highlight: false,
      },
      y: {
        show: true,
        start: CUBE_LO,
        end: CUBE_HI,
        size: stepY,
        color: SURFACE_GRID,
        width: 1.3,
        highlight: false,
      },
      z: { show: false },
    },
    lighting: {
      ambient: 0.68,
      diffuse: 0.92,
      specular: 0.18,
      roughness: 0.48,
      fresnel: 0.04,
    },
    lightposition: { x: 60, y: 100, z: 80 },
  } as unknown as Data;
}

export function buildFixedSceneLayout(
  _domain: GraphRange,
  equationLabel: string,
  annotations: Record<string, unknown>[],
  camera?: typeof FIXED_CAMERA,
): Partial<Layout> {
  const hiddenAxis = {
    range: [-1.25, 1.25], // Ampliado para no cortar etiquetas en los extremos
    showgrid: false,
    showline: false,
    showticklabels: false,
    showbackground: false,
    zeroline: false,
    showspikes: false,
    title: { text: '' }, // Evita que reserve padding para los títulos de los ejes invisibles
    visible: true,
  };

  return {
    paper_bgcolor: '#ffffff',
    margin: { l: 0, r: 0, t: 36, b: 0 },
    title: equationLabel
      ? {
          text: `z = ${equationLabel}`,
          font: { size: 14, color: TICK_BLACK },
          x: 0.5,
          xanchor: 'center',
        }
      : undefined,
    showlegend: false,
    scene: {
      bgcolor: '#ffffff',
      aspectmode: 'cube',
      dragmode: 'turntable',
      annotations,
      xaxis: { ...hiddenAxis },
      yaxis: { ...hiddenAxis },
      zaxis: { ...hiddenAxis },
      camera: camera ?? FIXED_CAMERA,
    } as Partial<Layout>['scene'],
  };
}

export function buildStaticSceneExtras(domain: GraphRange): {
  traces: Data[];
  annotations: Record<string, unknown>[];
} {
  const { traces: axisTraces, labelAnnotations } = buildStaticAxes();
  const { annotations: tickAnnotations, tickTraces } = buildDynamicTickAnnotations(domain);
  const traces: Data[] = [
    buildStaticBoundingBox(),
    buildScaledZeroPlane(domain),
    buildScaledFloorGrid(domain),
    ...axisTraces,
    ...tickTraces,
  ].filter((t): t is Data => t != null);

  const annotations = [...labelAnnotations, ...tickAnnotations];

  return { traces, annotations };
}

export function normalizePoint(
  x: number,
  y: number,
  z: number,
  domain: GraphRange,
): [number, number, number] | null {
  const nx = normX(x, domain);
  const ny = normY(y, domain);
  const nz = normZ(z, domain);
  if (!isInsideCube(nx, ny, nz)) return null;
  return [nx, ny, nz];
}
