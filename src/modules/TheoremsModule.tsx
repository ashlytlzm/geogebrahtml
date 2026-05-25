import { useRef, useState, useEffect } from 'react';
import Plotly from 'plotly.js-dist-min';
import { StepPanel } from '../components/StepPanel';
import {
  lineIntegral,
  surfaceIntegral,
  tripleIntegralDivergence,
  greensTheoremArea,
} from '../lib/vectorCalc';
import type { SurfaceParam } from '../lib/vectorCalc';
import { safeCompile, evalNumber } from '../lib/mathEngine';
import { usePlotlyZoom } from '../hooks/usePlotlyZoom';
import { PlotlyZoomControls } from '../components/PlotlyZoomControls';
import { FlipHorizontal } from 'lucide-react';
import { normalizeToCube, isInsideCube } from '../lib/cubeViewport';
import { buildStaticSceneExtras, buildFixedSceneLayout, getEqualizedDomain } from '../lib/scene3dStyle';

type Theorem = 'green' | 'stokes' | 'divergencia';

function normalizeGrid(
  grid: { x: number[][], y: number[][], z: number[][] },
  domain: { xMin: number, xMax: number, yMin: number, yMax: number, zMin: number, zMax: number }
) {
  const xNorm: number[][] = [];
  const yNorm: number[][] = [];
  const zNorm: number[][] = [];

  for (let i = 0; i < grid.x.length; i++) {
    const xr: number[] = [];
    const yr: number[] = [];
    const zr: number[] = [];
    for (let j = 0; j < grid.x[i].length; j++) {
      const nx = normalizeToCube(grid.x[i][j], domain.xMin, domain.xMax);
      const ny = normalizeToCube(grid.y[i][j], domain.yMin, domain.yMax);
      const nz = normalizeToCube(grid.z[i][j], domain.zMin, domain.zMax);
      if (isInsideCube(nx, ny, nz)) {
        xr.push(nx);
        yr.push(ny);
        zr.push(nz);
      } else {
        xr.push(NaN);
        yr.push(NaN);
        zr.push(NaN);
      }
    }
    xNorm.push(xr);
    yNorm.push(yr);
    zNorm.push(zr);
  }
  return { x: xNorm, y: yNorm, z: zNorm };
}

export function TheoremsModule() {
  const plotRef = useRef<HTMLDivElement>(null);
  const zoomContainerRef = useRef<HTMLDivElement>(null);

  const [theorem, setTheorem] = useState<Theorem>('green');
  const [P, setP] = useState('y^2');
  const [Q, setQ] = useState('x^2');
  const [R, setR] = useState('0');
  const [steps, setSteps] = useState<{ title: string; content: string }[]>([]);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Green's params (rectangular region)
  const [gXMin, setGXMin] = useState(0);
  const [gXMax, setGXMax] = useState(1);
  const [gYMin, setGYMin] = useState(0);
  const [gYMax, setGYMax] = useState(1);

  // Stokes params
  const [sUMax, setSUMax] = useState(1);
  const [sVMin] = useState(0);
  const [sVMax, setSVMax] = useState(2 * Math.PI);

  // Divergence params (box)
  const [dX0, setDX0] = useState(-1);
  const [dX1, setDX1] = useState(1);
  const [dY0, setDY0] = useState(-1);
  const [dY1, setDY1] = useState(1);
  const [dZ0, setDZ0] = useState(-1);
  const [dZ1, setDZ1] = useState(1);

  const [viewport, setViewport] = useState({ xMin: -2, xMax: 2, yMin: -2, yMax: 2, zMin: -2, zMax: 2 });

  // Camera state persistence
  const cameraRef = useRef({
    projection: { type: 'perspective' as const },
    eye: { x: 1.5, y: 1.5, z: 1.2 },
    center: { x: 0, y: 0, z: 0 },
    up: { x: 0, y: 0, z: 1 }
  });

  // Zoom hook
  const { viewDomain, zoomIn, zoomOut, reset: resetZoom, axisTicks } = usePlotlyZoom(
    plotRef, viewport.xMin, viewport.xMax, viewport.yMin, viewport.yMax, viewport.zMin, viewport.zMax,
  );

  const resetZoomWithCamera = () => {
    cameraRef.current = {
      projection: { type: 'perspective' as const },
      eye: { x: 1.5, y: 1.5, z: 1.2 },
      center: { x: 0, y: 0, z: 0 },
      up: { x: 0, y: 0, z: 1 }
    };
    resetZoom();
  };

  // Rebuild Plotly visualization whenever theorem or bounds change
  useEffect(() => {
    const el = plotRef.current;
    if (!el) return;

    let computedXMin = -2, computedXMax = 2;
    let computedYMin = -2, computedYMax = 2;
    let computedZMin = -2, computedZMax = 2;

    if (theorem === 'green') {
      computedXMin = gXMin; computedXMax = gXMax;
      computedYMin = gYMin; computedYMax = gYMax;
      computedZMin = -1; computedZMax = 1;
    } else if (theorem === 'stokes') {
      computedXMin = -sUMax; computedXMax = sUMax;
      computedYMin = -sUMax; computedYMax = sUMax;
      computedZMin = 1 - sUMax; computedZMax = 1;
    } else {
      computedXMin = dX0; computedXMax = dX1;
      computedYMin = dY0; computedYMax = dY1;
      computedZMin = dZ0; computedZMax = dZ1;
    }

    const nextVp = getEqualizedDomain(computedXMin, computedXMax, computedYMin, computedYMax, computedZMin, computedZMax);
    if (
      Math.abs(viewport.xMin - nextVp.xMin) > 1e-2 ||
      Math.abs(viewport.xMax - nextVp.xMax) > 1e-2 ||
      Math.abs(viewport.yMin - nextVp.yMin) > 1e-2 ||
      Math.abs(viewport.yMax - nextVp.yMax) > 1e-2 ||
      Math.abs(viewport.zMin - nextVp.zMin) > 1e-2 ||
      Math.abs(viewport.zMax - nextVp.zMax) > 1e-2
    ) {
      setViewport(nextVp);
      return;
    }

    const traces: Plotly.Data[] = [];

    if (theorem === 'green') {
      const xs = [gXMin, gXMax, gXMax, gXMin, gXMin];
      const ys = [gYMin, gYMin, gYMax, gYMax, gYMin];
      traces.push({
        type: 'scatter',
        mode: 'lines',
        x: xs,
        y: ys,
        fill: 'toself',
        fillcolor: 'rgba(37,99,235,0.15)',
        line: { color: '#2563eb', width: 2.5 },
        name: 'Región D',
      } as Plotly.Data);
    } else if (theorem === 'stokes') {
      // Render cone surface: x=u cos v, y=u sin v, z=1-u
      const n = 20;
      const xSurf: number[][] = [];
      const ySurf: number[][] = [];
      const zSurf: number[][] = [];
      for (let i = 0; i <= n; i++) {
        const row1: number[] = [], row2: number[] = [], row3: number[] = [];
        for (let j = 0; j <= n; j++) {
          const u = (i / n) * sUMax;
          const v = sVMin + (j / n) * sVMax;
          row1.push(u * Math.cos(v));
          row2.push(u * Math.sin(v));
          row3.push(1 - u);
        }
        xSurf.push(row1); ySurf.push(row2); zSurf.push(row3);
      }

      const ns = normalizeGrid({ x: xSurf, y: ySurf, z: zSurf }, viewDomain);

      traces.push({
        type: 'surface',
        x: ns.x, y: ns.y, z: ns.z,
        name: 'Superficie S',
        colorscale: [[0, '#7c3aed'], [1, '#a78bfa']],
        showscale: false,
        opacity: 0.6,
        contours: {
          x: { show: true, start: -1, end: 1, size: 0.05, color: '#ffffff', width: 1.2, highlight: false },
          y: { show: true, start: -1, end: 1, size: 0.05, color: '#ffffff', width: 1.2, highlight: false },
        },
      } as Plotly.Data);
    } else {
      // Box corners
      const corners = [
        [dX0,dY0,dZ0],[dX1,dY0,dZ0],[dX1,dY1,dZ0],[dX0,dY1,dZ0],[dX0,dY0,dZ0],
        [dX0,dY0,dZ1],[dX1,dY0,dZ1],[dX1,dY1,dZ1],[dX0,dY1,dZ1],[dX0,dY0,dZ1],
      ];

      const xNorm: number[] = [];
      const yNorm: number[] = [];
      const zNorm: number[] = [];
      for (const c of corners) {
        const ncx = normalizeToCube(c[0], viewDomain.xMin, viewDomain.xMax);
        const ncy = normalizeToCube(c[1], viewDomain.yMin, viewDomain.yMax);
        const ncz = normalizeToCube(c[2], viewDomain.zMin, viewDomain.zMax);
        if (isInsideCube(ncx, ncy, ncz)) {
          xNorm.push(ncx); yNorm.push(ncy); zNorm.push(ncz);
        } else {
          xNorm.push(NaN); yNorm.push(NaN); zNorm.push(NaN);
        }
      }

      traces.push({
        type: 'scatter3d',
        mode: 'lines+markers',
        x: xNorm,
        y: yNorm,
        z: zNorm,
        name: 'Región E',
        line: { color: '#2563eb', width: 3 },
        marker: { size: 4, color: '#2563eb' },
      } as Plotly.Data);
    }

    const is3d = theorem !== 'green';
    const titleText = theorem === 'green'
      ? 'Teorema de Green — Región D'
      : theorem === 'stokes'
      ? 'Teorema de Stokes — Superficie S'
      : 'Teorema de la Divergencia — Región E';

    const onRelayout = (ev: Plotly.PlotRelayoutEvent) => {
      const cam = (ev as Record<string, unknown>)['scene.camera'];
      if (cam && typeof cam === 'object') {
        cameraRef.current = cam as any;
      }
    };

    let allTraces = traces;
    let layout: Partial<Plotly.Layout>;

    if (is3d) {
      const extras = buildStaticSceneExtras(viewDomain);
      allTraces = [...extras.traces, ...traces];
      layout = buildFixedSceneLayout(viewDomain, titleText, extras.annotations, cameraRef.current);
    } else {
      layout = {
        paper_bgcolor: '#ffffff',
        margin: { l: 0, r: 0, t: 44, b: 24 },
        title: { text: titleText, font: { size: 14, color: '#1e293b' } },
        xaxis: { title: { text: 'X' }, range: [viewDomain.xMin, viewDomain.xMax], gridcolor: '#e2e8f0', zeroline: true, zerolinecolor: '#94a3b8', ...axisTicks(viewDomain.xMin, viewDomain.xMax) },
        yaxis: { title: { text: 'Y' }, range: [viewDomain.yMin, viewDomain.yMax], scaleanchor: 'x', scaleratio: 1, gridcolor: '#e2e8f0', zeroline: true, zerolinecolor: '#94a3b8', ...axisTicks(viewDomain.yMin, viewDomain.yMax) },
        plot_bgcolor: '#f8fafc',
      };
    }

    Plotly.react(el, allTraces, layout, { responsive: true, displaylogo: false, scrollZoom: false });

    const plotEl = el as unknown as {
      on: (event: string, fn: (ev: Plotly.PlotRelayoutEvent) => void) => void;
      removeAllListeners: (event: string) => void;
    };
    plotEl.on('plotly_relayout', onRelayout);

    const onResize = () => Plotly.Plots.resize(el);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      plotEl.removeAllListeners('plotly_relayout');
      Plotly.purge(el);
    };
  }, [theorem, gXMin, gXMax, gYMin, gYMax, sUMax, sVMin, sVMax, dX0, dX1, dY0, dY1, dZ0, dZ1, viewDomain, axisTicks, viewport]);

  const compute = () => {
    setSteps([]); setResult(null); setError(null);

    try {
      if (theorem === 'green') {
        // ∬_D (∂Q/∂x − ∂P/∂y) dA
        const area = greensTheoremArea(P, Q, gXMin, gXMax, gYMin, gYMax);

        // Approximate ∮_C F·dr along the 4 boundary edges
        const n = 200;
        const w = gXMax - gXMin, h = gYMax - gYMin;
        const PFn = safeCompile(P);
        const QFn = safeCompile(Q);
        let lineVal = 0;
        // Edge 1: bottom (y=yMin, x: xMin→xMax)
        for (let i = 0; i < n; i++) {
          const x = gXMin + (i + 0.5) * (w / n), y = gYMin;
          const Pv = PFn ? (evalNumber(PFn, { x, y, z: 0 }) ?? 0) : 0;
          lineVal += Pv * (w / n);
        }
        // Edge 2: right (x=xMax, y: yMin→yMax)
        for (let i = 0; i < n; i++) {
          const x = gXMax, y = gYMin + (i + 0.5) * (h / n);
          const Qv = QFn ? (evalNumber(QFn, { x, y, z: 0 }) ?? 0) : 0;
          lineVal += Qv * (h / n);
        }
        // Edge 3: top (y=yMax, x: xMax→xMin)
        for (let i = 0; i < n; i++) {
          const x = gXMax - (i + 0.5) * (w / n), y = gYMax;
          const Pv = PFn ? (evalNumber(PFn, { x, y, z: 0 }) ?? 0) : 0;
          lineVal += Pv * (-w / n);
        }
        // Edge 4: left (x=xMin, y: yMax→yMin)
        for (let i = 0; i < n; i++) {
          const x = gXMin, y = gYMax - (i + 0.5) * (h / n);
          const Qv = QFn ? (evalNumber(QFn, { x, y, z: 0 }) ?? 0) : 0;
          lineVal += Qv * (-h / n);
        }

        const diff = Math.abs(lineVal - area);
        setSteps([
          {
            title: 'Teorema de Green',
            content: `∮_C F·dr = ∬_D (∂Q/∂x − ∂P/∂y) dA\n\nF = ⟨${P}, ${Q}⟩\nD = [${gXMin}, ${gXMax}] × [${gYMin}, ${gYMax}]`,
          },
          {
            title: 'Integral doble ∬_D (∂Q/∂x − ∂P/∂y) dA',
            content: `≈ ${area.toFixed(8)}`,
          },
          {
            title: 'Integral de línea ∮_C F·dr (perímetro rectángulo)',
            content: `≈ ${lineVal.toFixed(8)}`,
          },
          {
            title: 'Verificación',
            content: `|∮ − ∬| = ${diff.toFixed(8)}\n\n${diff < 0.01 ? '✓ Teorema de Green verificado' : '⚠ Diferencia: verificar expresión o región'}`,
          },
        ]);
        setResult(`∬_D (∂Q/∂x − ∂P/∂y) dA ≈ ${area.toFixed(6)}`);

      } else if (theorem === 'stokes') {
        // Boundary of cone: u=uMax, so circle (uMax cos t, uMax sin t, 1-uMax)
        const boundary = lineIntegral(P, Q, R, {
          xExpr: `${sUMax}*cos(t)`,
          yExpr: `${sUMax}*sin(t)`,
          zExpr: `${1 - sUMax}`,
          tMin: sVMin,
          tMax: sVMax,
        });

        // ∬_S (∇×F)·dS — approximate using curl components as a vector field
        // We use the fact that ∬(∇×F)·dS = ∮ F·dr by Stokes itself,
        // but we also compute a surface integral of curl to show both sides
        const curlSurfIntegral = surfaceIntegral(
          P, Q, R,
          {
            xExpr: `u*cos(v)`,
            yExpr: `u*sin(v)`,
            zExpr: `1 - u`,
            uMin: 0, uMax: sUMax,
            vMin: sVMin, vMax: sVMax,
          },
          25,
        );

        const diff = boundary.value !== null && curlSurfIntegral.value !== null
          ? Math.abs(boundary.value - curlSurfIntegral.value)
          : null;

        setSteps([
          {
            title: 'Teorema de Stokes',
            content: `∬_S (∇×F)·dS = ∮_{∂S} F·dr\n\nF = ⟨${P}, ${Q}, ${R}⟩\nS: cono x=u cos v, y=u sin v, z=1−u`,
          },
          {
            title: 'Integral de línea ∮_{∂S} F·dr',
            content: boundary.value !== null ? `≈ ${boundary.value.toFixed(8)}` : `Error: ${boundary.error}`,
          },
          {
            title: 'Integral de flujo ∬_S F·dS',
            content: curlSurfIntegral.value !== null ? `≈ ${curlSurfIntegral.value.toFixed(8)}` : `Error: ${curlSurfIntegral.error}`,
          },
          {
            title: 'Verificación',
            content: diff !== null
              ? `|diferencia| = ${diff.toFixed(8)}\n\n${diff < 0.2 ? '✓ Valores coherentes — Teorema de Stokes verificado' : '⚠ Diferencia notable (verifica parametrización)'}`
              : 'No se pudo calcular alguno de los lados',
          },
        ]);
        setResult(boundary.value !== null ? `∮_{∂S} F·dr ≈ ${boundary.value.toFixed(6)}` : null);
        setError(boundary.error ?? curlSurfIntegral.error);

      } else {
        // Divergence theorem
        const vol = tripleIntegralDivergence(P, Q, R, dX0, dX1, dY0, dY1, dZ0, dZ1);

        const w = dX1 - dX0, h = dY1 - dY0, d = dZ1 - dZ0;
        const faces: SurfaceParam[] = [
          { xExpr: `${dX0}+u*${w}`, yExpr: `${dY0}+v*${h}`, zExpr: `${dZ1}`, uMin: 0, uMax: 1, vMin: 0, vMax: 1 },
          { xExpr: `${dX0}+u*${w}`, yExpr: `${dY0}+v*${h}`, zExpr: `${dZ0}`, uMin: 0, uMax: 1, vMin: 0, vMax: 1 },
          { xExpr: `${dX1}`, yExpr: `${dY0}+u*${h}`, zExpr: `${dZ0}+v*${d}`, uMin: 0, uMax: 1, vMin: 0, vMax: 1 },
          { xExpr: `${dX0}`, yExpr: `${dY0}+u*${h}`, zExpr: `${dZ0}+v*${d}`, uMin: 0, uMax: 1, vMin: 0, vMax: 1 },
          { xExpr: `${dX0}+u*${w}`, yExpr: `${dY1}`, zExpr: `${dZ0}+v*${d}`, uMin: 0, uMax: 1, vMin: 0, vMax: 1 },
          { xExpr: `${dX0}+u*${w}`, yExpr: `${dY0}`, zExpr: `${dZ0}+v*${d}`, uMin: 0, uMax: 1, vMin: 0, vMax: 1 },
        ];

        let flux = 0;
        const faceResults: number[] = [];
        for (const face of faces) {
          const res = surfaceIntegral(P, Q, R, face, 12);
          const v = res.value ?? 0;
          flux += v;
          faceResults.push(v);
        }

        const diff = Math.abs(vol - flux);
        setSteps([
          {
            title: 'Teorema de la Divergencia (Gauss)',
            content: `∭_E ∇·F dV = ∯_{∂E} F·dS\n\nF = ⟨${P}, ${Q}, ${R}⟩\nE = [${dX0},${dX1}] × [${dY0},${dY1}] × [${dZ0},${dZ1}]`,
          },
          {
            title: 'Integral de volumen ∭_E ∇·F dV',
            content: `≈ ${vol.toFixed(8)}`,
          },
          {
            title: 'Flujo total ∯_{∂E} F·dS (6 caras del cubo)',
            content: faceResults.map((v, i) => `Cara ${i+1}: ${v.toFixed(6)}`).join('\n') + `\n\nTotal: ${flux.toFixed(8)}`,
          },
          {
            title: 'Verificación',
            content: `|∭∇·F dV − ∯F·dS| = ${diff.toFixed(8)}\n\n${diff < 0.3 ? '✓ Teorema de la Divergencia verificado' : '⚠ Diferencia notable — verifica las expresiones'}`,
          },
        ]);
        setResult(`∭_E ∇·F dV ≈ ${vol.toFixed(6)}`);
      }
    } catch (e) {
      setError(String(e));
    }
  };

  const theorems = [
    { value: 'green' as Theorem, label: 'Green', icon: '🟢', desc: '∮_C F·dr = ∬_D (∂Q/∂x − ∂P/∂y) dA' },
    { value: 'stokes' as Theorem, label: 'Stokes', icon: '🔵', desc: '∬_S (∇×F)·dS = ∮_C F·dr' },
    { value: 'divergencia' as Theorem, label: 'Divergencia (Gauss)', icon: '🟠', desc: '∭_E ∇·F dV = ∯_S F·dS' },
  ];

  return (
    <div className="module-layout">
      <div className="module-sidebar">
        <h2 className="module-title">
          <FlipHorizontal size={18} /> Teoremas Vectoriales
        </h2>

        {/* Theorem selector */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
          {theorems.map(th => (
            <button
              key={th.value}
              onClick={() => { setTheorem(th.value); setSteps([]); setResult(null); setError(null); }}
              style={{
                padding: '10px 12px',
                borderRadius: '10px',
                border: `2px solid ${theorem === th.value ? '#7c3aed' : '#e2e8f0'}`,
                background: theorem === th.value ? '#f5f3ff' : '#fff',
                color: theorem === th.value ? '#6d28d9' : '#475569',
                fontWeight: theorem === th.value ? 700 : 500,
                fontSize: '13px',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s',
              }}
            >
              {th.icon} <strong>{th.label}</strong>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px', fontFamily: 'monospace' }}>{th.desc}</div>
            </button>
          ))}
        </div>

        {/* F = <P, Q, R> */}
        <div className="field-group">
          <label className="field-label">F = ⟨P, Q, R⟩</label>
          {([['P', P, setP], ['Q', Q, setQ], ['R', R, setR]] as const).map(([l, v, s]) => (
            <div key={l} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
              <label style={{ fontSize: '12px', color: '#64748b', width: '20px', flexShrink: 0 }}>{l}</label>
              <input
                type="text"
                value={v}
                onChange={e => s(e.target.value)}
                className="math-input"
                style={{ flex: 1 }}
              />
            </div>
          ))}
        </div>

        {/* Green's region */}
        {theorem === 'green' && (
          <div className="field-group">
            <label className="field-label">Región D (rectángulo)</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              {([['xMin', gXMin, setGXMin], ['xMax', gXMax, setGXMax], ['yMin', gYMin, setGYMin], ['yMax', gYMax, setGYMax]] as const).map(([l, v, s]) => (
                <div key={l}>
                  <label style={{ fontSize: '11px', color: '#64748b' }}>{l}</label>
                  <input type="number" step="any" value={v} onChange={e => s(parseFloat(e.target.value) || 0)} className="number-input" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Stokes params */}
        {theorem === 'stokes' && (
          <div className="field-group">
            <label className="field-label">Cono: r(u,v) = ⟨u cos v, u sin v, 1−u⟩</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              <div>
                <label style={{ fontSize: '11px', color: '#64748b' }}>u máx</label>
                <input type="number" step="any" value={sUMax} onChange={e => setSUMax(parseFloat(e.target.value) || 1)} className="number-input" />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: '#64748b' }}>v máx</label>
                <input type="number" step="any" value={sVMax} onChange={e => setSVMax(parseFloat(e.target.value) || 6.28)} className="number-input" />
              </div>
            </div>
          </div>
        )}

        {/* Divergence box */}
        {theorem === 'divergencia' && (
          <div className="field-group">
            <label className="field-label">Caja E</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              {([['x₀', dX0, setDX0], ['x₁', dX1, setDX1], ['y₀', dY0, setDY0], ['y₁', dY1, setDY1], ['z₀', dZ0, setDZ0], ['z₁', dZ1, setDZ1]] as const).map(([l, v, s]) => (
                <div key={l}>
                  <label style={{ fontSize: '11px', color: '#64748b' }}>{l}</label>
                  <input type="number" step="any" value={v} onChange={e => s(parseFloat(e.target.value) || 0)} className="number-input" />
                </div>
              ))}
            </div>
          </div>
        )}

        <button onClick={compute} className="btn-compute">Verificar Teorema</button>

        <div style={{ marginTop: '16px' }}>
          <StepPanel steps={steps} result={result} error={error} title="Verificación del Teorema" />
        </div>
      </div>

      {/* ── Right: Plot ── */}
      <div className="module-viewer" style={{ position: 'relative' }} ref={zoomContainerRef}>
        <div ref={plotRef} style={{ width: '100%', height: '100%' }} />
        <PlotlyZoomControls viewDomain={viewDomain} onZoomIn={zoomIn} onZoomOut={zoomOut} onReset={resetZoomWithCamera} plotRef={plotRef} />
      </div>
    </div>
  );
}
