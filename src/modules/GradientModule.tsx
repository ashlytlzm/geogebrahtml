import { useRef, useState, useEffect } from 'react';
import Plotly from 'plotly.js-dist-min';
import { MathKeyboard } from '../components/MathKeyboard';
import { StepPanel } from '../components/StepPanel';
import type { Step } from '../components/StepPanel';
import {
  gradient,
  hessian2D,
  classifyCriticalPoint,
  sampleGradientField,
} from '../lib/vectorCalc';
import { sampleSurface } from '../lib/numericalIntegration';
import { safeCompile, evalNumber } from '../lib/mathEngine';
import {
  symbolicGradient,
  symbolicCriticalPoints,
  isBackendAvailable,
} from '../lib/symbolicApi';
import type { CriticalPoint } from '../lib/symbolicApi';
import { usePlotlyZoom } from '../hooks/usePlotlyZoom';
import { PlotlyZoomControls } from '../components/PlotlyZoomControls';
import { TrendingUp, Keyboard, Zap, Cpu } from 'lucide-react';
import { normalizeToCube, isInsideCube } from '../lib/cubeViewport';
import { buildStaticSceneExtras, buildFixedSceneLayout, getEqualizedDomain } from '../lib/scene3dStyle';

function normalizeGrid(
  grid: { x: number[], y: number[], z: number[][] },
  domain: { xMin: number, xMax: number, yMin: number, yMax: number, zMin: number, zMax: number }
) {
  const xNorm = grid.x.map(x => normalizeToCube(x, domain.xMin, domain.xMax));
  const yNorm = grid.y.map(y => normalizeToCube(y, domain.yMin, domain.yMax));
  const zNorm: number[][] = [];

  for (let i = 0; i < grid.y.length; i++) {
    const row: number[] = [];
    for (let j = 0; j < grid.x.length; j++) {
      const nx = xNorm[j];
      const ny = yNorm[i];
      const nz = normalizeToCube(grid.z[i][j], domain.zMin, domain.zMax);
      if (isInsideCube(nx, ny, nz)) {
        row.push(nz);
      } else {
        row.push(NaN);
      }
    }
    zNorm.push(row);
  }
  return { x: xNorm, y: yNorm, z: zNorm };
}

export function GradientModule() {
  const plotRef = useRef<HTMLDivElement>(null);
  const zoomContainerRef = useRef<HTMLDivElement>(null);
  const fRef = useRef<HTMLInputElement>(null);

  const [fExpr, setFExpr] = useState('x^2 + y^2');
  const [px, setPx] = useState(1);
  const [py, setPy] = useState(1);
  const [pz, setPz] = useState(0);
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [xMin, setXMin] = useState(-3);
  const [xMax, setXMax] = useState(3);
  const [yMin, setYMin] = useState(-3);
  const [yMax, setYMax] = useState(3);
  const [showGradField, setShowGradField] = useState(true);
  const [showTangent, setShowTangent] = useState(true);
  const [steps, setSteps] = useState<Step[]>([]);
  const [result, setResult] = useState<string | null>(null);
  const [resultLatex, setResultLatex] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<'sympy' | 'fallback' | 'mathjs'>('mathjs');
  const [backendOk, setBackendOk] = useState<boolean | null>(null);
  const [computing, setComputing] = useState(false);
  const [critPoints, setCritPoints] = useState<CriticalPoint[]>([]);

  const [viewport, setViewport] = useState({ xMin: -3, xMax: 3, yMin: -3, yMax: 3, zMin: -3, zMax: 3 });

  // Camera state persistence
  const cameraRef = useRef({
    projection: { type: 'perspective' as const },
    eye: { x: 1.4, y: 1.4, z: 1.0 },
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
      eye: { x: 1.4, y: 1.4, z: 1.0 },
      center: { x: 0, y: 0, z: 0 },
      up: { x: 0, y: 0, z: 1 }
    };
    resetZoom();
  };

  useEffect(() => { isBackendAvailable().then(ok => setBackendOk(ok)); }, []);

  const compute = async () => {
    setComputing(true);
    setError(null); setResult(null); setResultLatex(null); setSteps([]); setCritPoints([]);

    // Try SymPy gradient
    const sym = await symbolicGradient(fExpr, { x: px, y: py, z: pz });
    if (sym && sym.steps.length > 0) {
      const allSteps: Step[] = sym.steps.map(s => ({ title: s.title, content: s.content, latex: s.latex }));

      // Try SymPy critical points
      const crit = await symbolicCriticalPoints(fExpr, xMin, xMax, yMin, yMax);
      if (crit) {
        setCritPoints(crit.points ?? []);
        if (crit.steps) {
          allSteps.push(...crit.steps.map(s => ({ title: s.title, content: s.content, latex: s.latex })));
        }
      }

      setSteps(allSteps);
      const gvals = sym.gradient_values;
      if (gvals) {
        setResult(`∇f(${px},${py}) ≈ ⟨${gvals[0].toFixed(4)}, ${gvals[1].toFixed(4)}, ${gvals[2].toFixed(4)}⟩`);
        setResultLatex(sym.gx && sym.gy && sym.gz
          ? `\\nabla f = \\langle ${sym.gx},\\, ${sym.gy},\\, ${sym.gz} \\rangle`
          : null);
      }
      setSource('sympy');
      setComputing(false);
      return;
    }

    // Numerical fallback
    const [gx, gy, gz] = gradient(fExpr, px, py, pz);
    const gradMag = Math.sqrt(gx*gx + gy*gy + gz*gz);
    const H = hessian2D(fExpr, px, py);
    const D = H[0][0]*H[1][1] - H[0][1]*H[1][0];
    const type = classifyCriticalPoint(fExpr, px, py);
    const fn = safeCompile(fExpr);
    const z0 = fn ? (evalNumber(fn, { x: px, y: py, z: pz }) ?? 0) : 0;

    setSteps([
      { title: 'Derivadas parciales', content: `∂f/∂x ≈ ${gx.toFixed(8)}\n∂f/∂y ≈ ${gy.toFixed(8)}\n∂f/∂z ≈ ${gz.toFixed(8)}` },
      { title: '∇f en el punto', content: `⟨${gx.toFixed(6)}, ${gy.toFixed(6)}, ${gz.toFixed(6)}⟩\n|∇f| = ${gradMag.toFixed(6)}` },
      { title: 'Plano tangente', content: `z = ${z0.toFixed(4)} + ${gx.toFixed(4)}(x−${px}) + ${gy.toFixed(4)}(y−${py})` },
      { title: 'Análisis Hessiana', content: `H = [[${H[0][0].toFixed(4)}, ${H[0][1].toFixed(4)}], [${H[1][0].toFixed(4)}, ${H[1][1].toFixed(4)}]]\nD = ${D.toFixed(6)}\nClasificación: ${type}` },
    ]);
    setResult(`∇f(${px},${py}) ≈ ⟨${gx.toFixed(4)}, ${gy.toFixed(4)}, ${gz.toFixed(4)}⟩`);
    setResultLatex(`\\nabla f \\approx \\langle ${gx.toFixed(4)},\\, ${gy.toFixed(4)},\\, ${gz.toFixed(4)} \\rangle`);
    setSource('mathjs');
    setComputing(false);
  };

  // Build 3D plot
  useEffect(() => {
    const el = plotRef.current;
    if (!el) return;

    let computedZMin = -3;
    let computedZMax = 3;

    const s = sampleSurface(fExpr, xMin, xMax, yMin, yMax, 50);
    if (s) {
      let sampledZMin = Infinity;
      let sampledZMax = -Infinity;
      for (const row of s.z) {
        for (const val of row) {
          if (typeof val === 'number' && isFinite(val)) {
            if (val < sampledZMin) sampledZMin = val;
            if (val > sampledZMax) sampledZMax = val;
          }
        }
      }
      if (isFinite(sampledZMin) && isFinite(sampledZMax)) {
        computedZMin = sampledZMin;
        computedZMax = sampledZMax;
      }
    }

    const nextVp = getEqualizedDomain(xMin, xMax, yMin, yMax, computedZMin, computedZMax);
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

    if (s) {
      const ns = normalizeGrid(s, viewDomain);
      traces.push({
        type: 'surface', x: ns.x, y: ns.y, z: ns.z,
        name: `f(x,y) = ${fExpr}`,
        colorscale: 'RdBu', showscale: false, opacity: 0.75,
        lighting: { ambient: 0.8, diffuse: 0.9 },
        hovertemplate: 'x=%{x:.2f} y=%{y:.2f} z=%{z:.3f}<extra></extra>',
        contours: {
          x: { show: true, start: -1, end: 1, size: 0.05, color: '#ffffff', width: 1.2, highlight: false },
          y: { show: true, start: -1, end: 1, size: 0.05, color: '#ffffff', width: 1.2, highlight: false },
        },
      } as Plotly.Data);
    }

    if (showGradField) {
      const gf = sampleGradientField(fExpr, xMin, xMax, yMin, yMax, 8);
      const fn = safeCompile(fExpr);
      const gz = gf.x.map((xi, i) => fn ? (evalNumber(fn, { x: xi, y: gf.y[i], z: 0 }) ?? 0) : 0);

      const nx: number[] = [];
      const ny: number[] = [];
      const nz: number[] = [];
      const nu: number[] = [];
      const nv: number[] = [];
      const nw: number[] = [];
      const spanX = viewDomain.xMax - viewDomain.xMin;
      const spanY = viewDomain.yMax - viewDomain.yMin;
      for (let i = 0; i < gf.x.length; i++) {
        const npx = normalizeToCube(gf.x[i], viewDomain.xMin, viewDomain.xMax);
        const npy = normalizeToCube(gf.y[i], viewDomain.yMin, viewDomain.yMax);
        const npz = normalizeToCube(gz[i], viewDomain.zMin, viewDomain.zMax);
        if (isInsideCube(npx, npy, npz)) {
          nx.push(npx);
          ny.push(npy);
          nz.push(npz);
          nu.push(gf.u[i] * 2 / spanX);
          nv.push(gf.v[i] * 2 / spanY);
          nw.push(0);
        } else {
          nx.push(NaN); ny.push(NaN); nz.push(NaN);
          nu.push(0); nv.push(0); nw.push(0);
        }
      }

      traces.push({
        type: 'cone',
        x: nx, y: ny, z: nz,
        u: nu, v: nv, w: nw,
        name: '∇f',
        sizemode: 'scaled', sizeref: 0.5, anchor: 'tail',
        colorscale: [[0, '#f97316'], [1, '#ef4444']],
        showscale: false,
      } as Plotly.Data);
    }

    // Evaluation point
    const fn2 = safeCompile(fExpr);
    const z0 = fn2 ? (evalNumber(fn2, { x: px, y: py, z: pz }) ?? 0) : 0;
    const npx = normalizeToCube(px, viewDomain.xMin, viewDomain.xMax);
    const npy = normalizeToCube(py, viewDomain.yMin, viewDomain.yMax);
    const npz = normalizeToCube(z0, viewDomain.zMin, viewDomain.zMax);
    const insidePt = isInsideCube(npx, npy, npz);
    traces.push({
      type: 'scatter3d', mode: 'markers',
      x: [insidePt ? npx : NaN], y: [insidePt ? npy : NaN], z: [insidePt ? npz : NaN],
      name: `P(${px},${py})`,
      marker: { size: 10, color: '#dc2626', line: { color: '#fff', width: 2 } },
    } as Plotly.Data);

    // Tangent plane
    if (showTangent && fn2) {
      const [gx, gy] = gradient(fExpr, px, py, 0);
      const dx = (xMax - xMin) * 0.25;
      const dy = (yMax - yMin) * 0.25;
      const planePts = [px - dx, px + dx];
      const planePtsY = [py - dy, py + dy];
      const planeZ = planePts.map(xi => planePtsY.map(yi => z0 + gx*(xi-px) + gy*(yi-py)));

      const txGrid: number[][] = [];
      const tyGrid: number[][] = [];
      const tzGrid: number[][] = [];
      for (let i = 0; i < planePtsY.length; i++) {
        const xr: number[] = [];
        const yr: number[] = [];
        const zr: number[] = [];
        for (let j = 0; j < planePts.length; j++) {
          const ntx = normalizeToCube(planePts[j], viewDomain.xMin, viewDomain.xMax);
          const nty = normalizeToCube(planePtsY[i], viewDomain.yMin, viewDomain.yMax);
          const ntz = normalizeToCube(planeZ[j][i], viewDomain.zMin, viewDomain.zMax);
          if (isInsideCube(ntx, nty, ntz)) {
            xr.push(ntx); yr.push(nty); zr.push(ntz);
          } else {
            xr.push(NaN); yr.push(NaN); zr.push(NaN);
          }
        }
        txGrid.push(xr);
        tyGrid.push(yr);
        tzGrid.push(zr);
      }

      traces.push({
        type: 'surface',
        x: txGrid, y: tyGrid, z: tzGrid,
        name: 'Plano tangente',
        colorscale: [[0, 'rgba(250,204,21,0.5)'], [1, 'rgba(251,191,36,0.7)']],
        showscale: false, opacity: 0.6,
        contours: {
          x: { show: true, start: -1, end: 1, size: 0.05, color: '#ffffff', width: 1.2, highlight: false },
          y: { show: true, start: -1, end: 1, size: 0.05, color: '#ffffff', width: 1.2, highlight: false },
        },
      } as Plotly.Data);
    }

    // Critical points from SymPy
    if (critPoints.length > 0) {
      const cxNorm: number[] = [];
      const cyNorm: number[] = [];
      const czNorm: number[] = [];
      const ctext: string[] = [];
      for (const c of critPoints) {
        const ncx = normalizeToCube(c.x, viewDomain.xMin, viewDomain.xMax);
        const ncy = normalizeToCube(c.y, viewDomain.yMin, viewDomain.yMax);
        const ncz = normalizeToCube(c.f, viewDomain.zMin, viewDomain.zMax);
        if (isInsideCube(ncx, ncy, ncz)) {
          cxNorm.push(ncx);
          cyNorm.push(ncy);
          czNorm.push(ncz);
          ctext.push(c.tipo);
        } else {
          cxNorm.push(NaN);
          cyNorm.push(NaN);
          czNorm.push(NaN);
          ctext.push('');
        }
      }

      traces.push({
        type: 'scatter3d', mode: 'markers+text',
        x: cxNorm,
        y: cyNorm,
        z: czNorm,
        text: ctext,
        textposition: 'top center',
        name: 'Puntos críticos',
        marker: { size: 9, color: '#7c3aed', symbol: 'diamond', line: { color: '#fff', width: 2 } },
      } as Plotly.Data);
    }

    const onRelayout = (ev: Plotly.PlotRelayoutEvent) => {
      const cam = (ev as Record<string, unknown>)['scene.camera'];
      if (cam && typeof cam === 'object') {
        cameraRef.current = cam as any;
      }
    };

    const extras = buildStaticSceneExtras(viewDomain);
    const allTraces = [...extras.traces, ...traces];
    const titleText = `f(x,y) = ${fExpr}`;
    const layout = buildFixedSceneLayout(viewDomain, titleText, extras.annotations, cameraRef.current);
    if (layout.scene) {
      layout.scene.showlegend = true;
      layout.scene.legend = { x: 0.01, y: 0.99, bgcolor: 'rgba(255,255,255,0.85)' };
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
  }, [fExpr, px, py, pz, xMin, xMax, yMin, yMax, showGradField, showTangent, critPoints, viewDomain, axisTicks, viewport]);

  return (
    <div className="module-layout">
      <div className="module-sidebar">
        <h2 className="module-title"><TrendingUp size={18} /> Gradiente y Derivadas Parciales</h2>

        {/* Backend status */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '6px 10px', borderRadius: '8px',
          border: `1px solid ${backendOk ? '#bbf7d0' : '#e2e8f0'}`,
          background: backendOk ? '#f0fdf4' : '#f8fafc',
          marginBottom: '14px', fontSize: '11px', fontWeight: 600,
          color: backendOk ? '#166534' : '#64748b',
        }}>
          {backendOk ? <Zap size={11} color="#16a34a" /> : <Cpu size={11} />}
          {backendOk === null ? 'Verificando backend…' : backendOk ? 'SymPy — simbólico exacto' : 'Modo numérico (math.js)'}
        </div>

        {/* f(x,y) */}
        <div className="field-group">
          <label className="field-label">Función f(x,y,z)</label>
          <div style={{ position: 'relative' }}>
            <input ref={fRef} type="text" value={fExpr} onChange={e => setFExpr(e.target.value)}
              onFocus={() => setShowKeyboard(true)} className="math-input" style={{ paddingRight: '36px' }} />
            <button onClick={() => setShowKeyboard(v => !v)}
              style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#7c3aed', padding: 0 }}>
              <Keyboard size={15} />
            </button>
          </div>
          {showKeyboard && <MathKeyboard inputRef={fRef} value={fExpr} onChange={setFExpr} onEnter={() => setShowKeyboard(false)} />}
        </div>

        {/* Evaluation point */}
        <div className="field-group">
          <label className="field-label">Punto de evaluación</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
            {([['x₀', px, setPx], ['y₀', py, setPy], ['z₀', pz, setPz]] as const).map(([l, v, s]) => (
              <div key={l}>
                <label style={{ fontSize: '11px', color: '#64748b' }}>{l}</label>
                <input type="number" step="any" value={v} onChange={e => s(parseFloat(e.target.value) || 0)} className="number-input" />
              </div>
            ))}
          </div>
        </div>

        {/* Domain */}
        <div className="field-group">
          <label className="field-label">Dominio</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
            {([['xMin', xMin, setXMin], ['xMax', xMax, setXMax], ['yMin', yMin, setYMin], ['yMax', yMax, setYMax]] as const).map(([l, v, s]) => (
              <div key={l}>
                <label style={{ fontSize: '11px', color: '#64748b' }}>{l}</label>
                <input type="number" step="any" value={v} onChange={e => s(parseFloat(e.target.value) || 0)} className="number-input" />
              </div>
            ))}
          </div>
        </div>

        {/* Toggles */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer', userSelect: 'none' }}>
            <input type="checkbox" checked={showGradField} onChange={e => setShowGradField(e.target.checked)} style={{ accentColor: '#f97316' }} />
            <span style={{ color: '#f97316', fontWeight: 600 }}>Mostrar campo ∇f</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer', userSelect: 'none' }}>
            <input type="checkbox" checked={showTangent} onChange={e => setShowTangent(e.target.checked)} style={{ accentColor: '#eab308' }} />
            <span style={{ color: '#b45309', fontWeight: 600 }}>Mostrar plano tangente</span>
          </label>
        </div>

        <button onClick={compute} disabled={computing} className="btn-compute" style={{ opacity: computing ? 0.7 : 1 }}>
          {computing ? 'Calculando…' : 'Calcular Gradiente'}
        </button>

        {/* Critical points table */}
        {critPoints.length > 0 && (
          <div style={{ marginTop: '12px' }}>
            <label className="field-label">Puntos Críticos (SymPy)</label>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                <thead>
                  <tr style={{ background: '#f1f5f9' }}>
                    {['x', 'y', 'f(x,y)', 'Tipo'].map(h => (
                      <th key={h} style={{ padding: '5px 6px', textAlign: 'left', color: '#475569', fontWeight: 700, borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {critPoints.map((c, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '4px 6px', fontFamily: 'monospace' }}>{c.x.toFixed(3)}</td>
                      <td style={{ padding: '4px 6px', fontFamily: 'monospace' }}>{c.y.toFixed(3)}</td>
                      <td style={{ padding: '4px 6px', fontFamily: 'monospace' }}>{c.f.toFixed(3)}</td>
                      <td style={{ padding: '4px 6px', color: c.tipo === 'Mínimo local' ? '#16a34a' : c.tipo === 'Máximo local' ? '#dc2626' : '#d97706', fontWeight: 600 }}>{c.tipo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div style={{ marginTop: '16px' }}>
          <StepPanel steps={steps} result={result} resultLatex={resultLatex ?? undefined} error={error} source={source} title="Gradiente — Pasos" />
        </div>
      </div>

      {/* Right: 3D Plot */}
      <div className="module-viewer" style={{ position: 'relative' }} ref={zoomContainerRef}>
        <div ref={plotRef} style={{ width: '100%', height: '100%' }} />
        <PlotlyZoomControls viewDomain={viewDomain} onZoomIn={zoomIn} onZoomOut={zoomOut} onReset={resetZoomWithCamera} plotRef={plotRef} />
      </div>
    </div>
  );
}
