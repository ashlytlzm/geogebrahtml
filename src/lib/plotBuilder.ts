import type { Config, Data, Layout } from 'plotly.js';
import type { Point3DData } from '../types';
import {
  DEFAULT_RANGE,
  detectFunctionKind,
  evalNumber,
  getExpressionLabel,
  resolveGraphMode,
  safeCompile,
  splitEquations,
  type GraphMode,
  type GraphRange,
} from './mathEngine';
import type { FIXED_CAMERA } from './scene3dStyle';
import {
  buildFixedSceneLayout,
  buildNormalizedSurface,
  buildStaticSceneExtras,
  normalizePoint,
} from './scene3dStyle';

const TRACE_COLORS = ['#7c3aed', '#0891b2', '#db2777', '#ea580c', '#16a34a'];

function linspace(min: number, max: number, n: number): number[] {
  if (n < 2) return [min];
  const step = (max - min) / (n - 1);
  return Array.from({ length: n }, (_, i) => min + i * step);
}

function buildCurve2D(
  equation: string,
  range: GraphRange,
  color: string,
  name: string,
): Data | null {
  const fn = safeCompile(equation);
  if (!fn) return null;

  const kind = detectFunctionKind(equation);
  const xs: number[] = [];
  const ys: number[] = [];

  if (kind === 'curve-y') {
    const ysAxis = linspace(range.yMin, range.yMax, range.samples2d);
    for (const y of ysAxis) {
      const val = evalNumber(fn, { x: 0, y });
      if (val === null) continue;
      xs.push(val);
      ys.push(y);
    }
    return {
      type: 'scatter',
      mode: 'lines',
      x: xs,
      y: ys,
      name,
      line: { color, width: 2.5 },
      hovertemplate: 'x=%{x:.4f}<br>y=%{y:.4f}<extra></extra>',
    };
  }

  const xsAxis = linspace(range.xMin, range.xMax, range.samples2d);
  for (const x of xsAxis) {
    const val = evalNumber(fn, { x, y: 0 });
    if (val === null) continue;
    xs.push(x);
    ys.push(val);
  }

  return {
    type: 'scatter',
    mode: 'lines',
    x: xs,
    y: ys,
    name,
    line: { color, width: 2.5 },
    hovertemplate: 'x=%{x:.4f}<br>y=%{y:.4f}<extra></extra>',
  };
}

function buildContour(
  equation: string,
  range: GraphRange,
  color: string,
  name: string,
): Data | null {
  const fn = safeCompile(equation);
  if (!fn) return null;

  const xs = linspace(range.xMin, range.xMax, range.samples3d);
  const ys = linspace(range.yMin, range.yMax, range.samples3d);
  const z: number[][] = [];

  for (const y of ys) {
    const row: number[] = [];
    for (const x of xs) {
      row.push(evalNumber(fn, { x, y }) ?? NaN);
    }
    z.push(row);
  }

  return {
    type: 'contour',
    x: xs,
    y: ys,
    z,
    name,
    colorscale: 'Viridis',
    contours: {
      coloring: 'heatmap',
      showlabels: true,
      labelfont: { size: 10, color: '#334155' },
    },
    colorbar: { title: { text: 'z' } },
    line: { color },
  };
}

interface SurfaceSample {
  xs: number[];
  ys: number[];
  z: number[][];
  trace: Data;
}

function sampleSurface3D(
  equation: string,
  domain: GraphRange,
  name: string,
): SurfaceSample | null {
  const fn = safeCompile(equation);
  if (!fn) return null;

  const n = Math.min(120, Math.max(64, domain.samples3d));
  const xs = linspace(domain.xMin, domain.xMax, n);
  const ys = linspace(domain.yMin, domain.yMax, n);
  const z: number[][] = [];

  for (const y of ys) {
    const row: number[] = [];
    for (const x of xs) {
      row.push(evalNumber(fn, { x, y }) ?? NaN);
    }
    z.push(row);
  }

  return {
    xs,
    ys,
    z,
    trace: buildNormalizedSurface(xs, ys, z, domain, name),
  };
}

function buildPointsTrace(
  points: Point3DData[],
  mode: GraphMode,
  domain?: GraphRange,
): Data | null {
  if (points.length === 0) return null;

  if ((mode === 'surface3d' || mode === 'implicit3d') && domain) {
    const coords = points
      .map((p) => {
        const n = normalizePoint(p.x, p.y, p.z, domain);
        return n ? { x: n[0], y: n[1], z: n[2], p } : null;
      })
      .filter(Boolean) as { x: number; y: number; z: number; p: Point3DData }[];

    if (coords.length === 0) return null;

    return {
      type: 'scatter3d',
      mode: 'markers+text',
      x: coords.map((c) => c.x),
      y: coords.map((c) => c.y),
      z: coords.map((c) => c.z),
      name: 'Puntos',
      marker: {
        size: 14,
        color: '#ff0000',
        symbol: 'circle',
        line: { color: '#000000', width: 3 },
        opacity: 1,
      },
      text: coords.map((c) => `(${c.p.x}, ${c.p.y}, ${c.p.z})`),
      textposition: 'top center',
      textfont: { size: 13, color: '#ff0000', family: 'Arial, sans-serif' },
      hovertemplate: '(%{text})<extra>Punto</extra>',
    };
  }

  return {
    type: 'scatter',
    mode: 'markers',
    x: points.map((p) => p.x),
    y: points.map((p) => p.z),
    name: 'Puntos',
    marker: { size: 9, color: '#ef4444', line: { color: '#fff', width: 1 } },
    hovertemplate: 'x=%{x:.2f}<br>y=%{y:.2f}<extra>Punto</extra>',
  };
}

export interface PlotBundle {
  data: Data[];
  layout: Partial<Layout>;
  config: Partial<Config>;
  resolvedMode: GraphMode;
  error: string | null;
}

function buildImplicitSurface3D(
  equation: string,
  domain: GraphRange,
  name: string,
  color: string
): Data | null {
  const fn = safeCompile(equation);
  if (!fn) return null;

  const n = Math.min(30, Math.max(12, Math.floor(domain.samples3d / 2.5)));
  const xs = linspace(domain.xMin, domain.xMax, n);
  const ys = linspace(domain.yMin, domain.yMax, n);
  const zs = linspace(domain.zMin, domain.zMax, n);

  const xFlat: number[] = [];
  const yFlat: number[] = [];
  const zFlat: number[] = [];
  const valFlat: number[] = [];

  for (const x of xs) {
    for (const y of ys) {
      for (const z of zs) {
        const val = evalNumber(fn, { x, y, z });
        if (val !== null && isFinite(val)) {
          const pt = normalizePoint(x, y, z, domain);
          if (pt) {
            xFlat.push(pt[0]);
            yFlat.push(pt[1]);
            zFlat.push(pt[2]);
            valFlat.push(val);
          }
        }
      }
    }
  }

  if (xFlat.length === 0) return null;

  return {
    type: 'isosurface',
    x: xFlat,
    y: yFlat,
    z: zFlat,
    value: valFlat,
    isomin: 0,
    isomax: 0,
    surface: { show: true, count: 1, fill: 0.9 },
    caps: {
      x: { show: false },
      y: { show: false },
      z: { show: false }
    },
    name,
    colorscale: [[0, color], [1, color]],
    showscale: false,
    hovertemplate: name + '<extra></extra>',
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

export function buildPlot(
  equation: string,
  mode: GraphMode,
  range: GraphRange = DEFAULT_RANGE,
  points: Point3DData[] = [],
  camera?: typeof FIXED_CAMERA,
): PlotBundle {
  const equations = splitEquations(equation);
  const primary = equations[0] ?? '';
  const resolvedMode = primary ? resolveGraphMode(primary, mode) : 'curve2d';

  const data: Data[] = [];
  let sceneExtras: Data[] = [];
  let sceneAnnotations: Record<string, unknown>[] = [];
  let error: string | null = null;
  const is3d = resolvedMode === 'surface3d' || resolvedMode === 'implicit3d';

  if (is3d) {
    const scene = buildStaticSceneExtras(range);
    sceneExtras = scene.traces;
    sceneAnnotations = scene.annotations;
  }

  equations.forEach((eq, i) => {
    const compiled = safeCompile(eq);
    if (!compiled) {
      error = 'No se pudo interpretar la ecuación';
      return;
    }

    const color = TRACE_COLORS[i % TRACE_COLORS.length];
    const name = equations.length > 1 ? `f${i + 1}(x,y)` : 'f(x,y)';

    if (resolvedMode === 'curve2d') {
      const trace = buildCurve2D(eq, range, color, name);
      if (trace) data.push(trace);
    } else if (resolvedMode === 'contour') {
      const trace = buildContour(eq, range, color, name);
      if (trace) data.push(trace);
    } else if (resolvedMode === 'implicit3d') {
      const trace = buildImplicitSurface3D(eq, range, name, color);
      if (trace) data.push(trace);
    } else {
      const sampled = sampleSurface3D(eq, range, name);
      if (sampled) data.push(sampled.trace);
    }
  });

  const pointsTrace = buildPointsTrace(points, resolvedMode, is3d ? range : undefined);

  const plotData: Data[] = is3d
    ? [...sceneExtras, ...data, ...(pointsTrace ? [pointsTrace] : [])]
    : [...data, ...(pointsTrace ? [pointsTrace] : [])];

  const layout: Partial<Layout> = is3d
    ? buildFixedSceneLayout(range, getExpressionLabel(primary), sceneAnnotations, camera)
    : {
        title: { text: primary ? `y = ${getExpressionLabel(primary)}` : 'Gráfica 2D', font: { size: 14, color: '#475569' } },
        paper_bgcolor: '#ffffff',
        plot_bgcolor: '#ffffff',
        xaxis: {
          title: { text: 'x', font: { size: 14, color: '#6b7280' } },
          range: [range.xMin, range.xMax],
          zeroline: true,
          zerolinecolor: '#94a3b8',
          zerolinewidth: 2,
          gridcolor: '#e5e7eb',
          tickfont: { color: '#6b7280' },
        },
        yaxis: {
          title: {
            text: resolvedMode === 'contour' ? 'y' : 'y',
            font: { size: 14, color: '#6b7280' },
          },
          ...(resolvedMode === 'contour' ? { range: [range.yMin, range.yMax] } : {}),
          zeroline: true,
          zerolinecolor: '#94a3b8',
          zerolinewidth: 2,
          gridcolor: '#e5e7eb',
          tickfont: { color: '#6b7280' },
          scaleanchor: resolvedMode === 'curve2d' ? 'x' : undefined,
          scaleratio: resolvedMode === 'curve2d' ? 1 : undefined,
        },
        margin: { l: 56, r: 24, t: 48, b: 48 },
        showlegend: equations.length > 1 || points.length > 0,
      };

  const config: Partial<Config> = {
    responsive: true,
    displayModeBar: true,
    scrollZoom: !is3d,
    doubleClick: false as const,
    modeBarButtonsToRemove: ['lasso2d', 'select2d', 'autoScale2d'],
    displaylogo: false,
  };

  if (plotData.length === 0 && !error) error = 'Sin datos para graficar';

  return { data: plotData, layout, config, resolvedMode, error };
}
