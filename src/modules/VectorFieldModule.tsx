import { useRef, useState, useEffect } from 'react';
import Plotly from 'plotly.js-dist-min';
import { MathKeyboard } from '../components/MathKeyboard';
import { StepPanel } from '../components/StepPanel';
import {
  sampleVectorField,
  lineIntegral,
  surfaceIntegral,
  curl,
  divergence,
} from '../lib/vectorCalc';
import type { CurveParam, SurfaceParam } from '../lib/vectorCalc';
import { usePlotlyZoom } from '../hooks/usePlotlyZoom';
import { PlotlyZoomControls } from '../components/PlotlyZoomControls';
import { Wind, Keyboard } from 'lucide-react';
import { normalizeToCube, isInsideCube } from '../lib/cubeViewport';
import { buildStaticSceneExtras, buildFixedSceneLayout, getEqualizedDomain } from '../lib/scene3dStyle';

type VFMode = 'campo' | 'linea' | 'superficie';

export function VectorFieldModule() {
  const plotRef = useRef<HTMLDivElement>(null);
  const zoomContainerRef = useRef<HTMLDivElement>(null);
  const PRef = useRef<HTMLInputElement>(null);
  const QRef = useRef<HTMLInputElement>(null);
  const RRef = useRef<HTMLInputElement>(null);

  const [P, setP] = useState('-y');
  const [Q, setQ] = useState('x');
  const [R, setR] = useState('0');
  const [mode, setMode] = useState<VFMode>('campo');
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [activeRef, setActiveRef] = useState<React.RefObject<HTMLInputElement | null>>(PRef);
  const [activeVal, setActiveVal] = useState('');
  const [activeSet, setActiveSet] = useState<(v: string) => void>(() => setP);

  // Line integral params
  const [xCurve, setXCurve] = useState('cos(t)');
  const [yCurve, setYCurve] = useState('sin(t)');
  const [zCurve, setZCurve] = useState('0');
  const [tMin, setTMin] = useState(0);
  const [tMax, setTMax] = useState(2 * Math.PI);

  // Surface integral params
  const [xSurf, setXSurf] = useState('u*cos(v)');
  const [ySurf, setYSurf] = useState('u*sin(v)');
  const [zSurf, setZSurf] = useState('u');
  const [uMin, setUMin] = useState(0);
  const [uMax, setUMax] = useState(1);
  const [vMin, setVMin] = useState(0);
  const [vMax, setVMax] = useState(2 * Math.PI);

  // Domain
  const [xMin, setXMin] = useState(-3);
  const [xMax, setXMax] = useState(3);
  const [yMin, setYMin] = useState(-3);
  const [yMax, setYMax] = useState(3);
  const [zRange, setZRange] = useState([-3, 3] as [number, number]);

  const [viewport, setViewport] = useState({ xMin: -3, xMax: 3, yMin: -3, yMax: 3, zMin: -3, zMax: 3 });

  const [showCurl, setShowCurl] = useState(false);
  const [showDiv, setShowDiv] = useState(false);

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

  const [steps, setSteps] = useState<{ title: string; content: string }[]>([]);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Build Plotly traces for vector field
  const buildFieldTraces = (): Plotly.Data[] => {
    const field = sampleVectorField(P, Q, R, viewDomain.xMin, viewDomain.xMax, viewDomain.yMin, viewDomain.yMax, viewDomain.zMin, viewDomain.zMax, 5);

    const nx: number[] = [];
    const ny: number[] = [];
    const nz: number[] = [];
    const nu: number[] = [];
    const nv: number[] = [];
    const nw: number[] = [];
    const spanX = viewDomain.xMax - viewDomain.xMin;
    const spanY = viewDomain.yMax - viewDomain.yMin;
    const spanZ = viewDomain.zMax - viewDomain.zMin;

    for (let i = 0; i < field.x.length; i++) {
      const npx = normalizeToCube(field.x[i], viewDomain.xMin, viewDomain.xMax);
      const npy = normalizeToCube(field.y[i], viewDomain.yMin, viewDomain.yMax);
      const npz = normalizeToCube(field.z[i], viewDomain.zMin, viewDomain.zMax);
      if (isInsideCube(npx, npy, npz)) {
        nx.push(npx);
        ny.push(npy);
        nz.push(npz);
        nu.push(field.u[i] * 2 / spanX);
        nv.push(field.v[i] * 2 / spanY);
        nw.push(field.w[i] * 2 / spanZ);
      } else {
        nx.push(NaN); ny.push(NaN); nz.push(NaN);
        nu.push(0); nv.push(0); nw.push(0);
      }
    }

    const traces: Plotly.Data[] = [{
      type: 'cone',
      x: nx, y: ny, z: nz,
      u: nu, v: nv, w: nw,
      name: 'F',
      sizemode: 'scaled',
      sizeref: 0.5,
      anchor: 'tail',
      colorscale: 'Viridis',
      showscale: false,
      hovertemplate: 'F(%{x:.1f},%{y:.1f},%{z:.1f})<extra></extra>',
    } as Plotly.Data];

    if (showCurl) {
      const field2 = sampleVectorField(P, Q, R, viewDomain.xMin, viewDomain.xMax, viewDomain.yMin, viewDomain.yMax, viewDomain.zMin, viewDomain.zMax, 4);
      const cxNorm: number[] = [];
      const cyNorm: number[] = [];
      const czNorm: number[] = [];
      const cuNorm: number[] = [];
      const cvNorm: number[] = [];
      const cwNorm: number[] = [];

      for (let i = 0; i < field2.x.length; i++) {
        const [cx, cy, cz] = curl(P, Q, R, field2.x[i], field2.y[i], field2.z[i]);
        const npx = normalizeToCube(field2.x[i], viewDomain.xMin, viewDomain.xMax);
        const npy = normalizeToCube(field2.y[i], viewDomain.yMin, viewDomain.yMax);
        const npz = normalizeToCube(field2.z[i], viewDomain.zMin, viewDomain.zMax);
        if (isInsideCube(npx, npy, npz)) {
          cxNorm.push(npx);
          cyNorm.push(npy);
          czNorm.push(npz);
          cuNorm.push(cx * 2 / spanX);
          cvNorm.push(cy * 2 / spanY);
          cwNorm.push(cz * 2 / spanZ);
        } else {
          cxNorm.push(NaN); cyNorm.push(NaN); czNorm.push(NaN);
          cuNorm.push(0); cvNorm.push(0); cwNorm.push(0);
        }
      }

      traces.push({
        type: 'cone',
        x: cxNorm, y: cyNorm, z: czNorm,
        u: cuNorm, v: cvNorm, w: cwNorm,
        name: '∇×F (Curl)',
        sizemode: 'scaled',
        sizeref: 0.6,
        anchor: 'tail',
        colorscale: [[0, '#f97316'], [1, '#ef4444']],
        showscale: false,
        opacity: 0.75,
      } as Plotly.Data);
    }

    return traces;
  };

  useEffect(() => {
    const el = plotRef.current;
    if (!el) return;

    const nextVp = getEqualizedDomain(xMin, xMax, yMin, yMax, zRange[0], zRange[1]);
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

    const traces = buildFieldTraces();

    const onRelayout = (ev: Plotly.PlotRelayoutEvent) => {
      const cam = (ev as Record<string, unknown>)['scene.camera'];
      if (cam && typeof cam === 'object') {
        cameraRef.current = cam as any;
      }
    };

    const extras = buildStaticSceneExtras(viewDomain);
    const allTraces = [...extras.traces, ...traces];
    const titleText = `Campo vectorial F = ⟨${P}, ${Q}, ${R}⟩`;
    const layout = buildFixedSceneLayout(viewDomain, titleText, extras.annotations, cameraRef.current);

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
  }, [P, Q, R, xMin, xMax, yMin, yMax, zRange, showCurl, viewDomain, axisTicks, viewport]);

  const compute = () => {
    setError(null); setResult(null); setSteps([]);

    if (mode === 'linea') {
      const curve: CurveParam = { xExpr: xCurve, yExpr: yCurve, zExpr: zCurve, tMin, tMax };
      const res = lineIntegral(P, Q, R, curve);
      setSteps(res.steps);
      setResult(res.value !== null ? `∫_C F·dr ≈ ${res.value.toFixed(8)}` : null);
      setError(res.error);
    } else if (mode === 'superficie') {
      const surf: SurfaceParam = { xExpr: xSurf, yExpr: ySurf, zExpr: zSurf, uMin, uMax, vMin, vMax };
      const res = surfaceIntegral(P, Q, R, surf);
      setSteps(res.steps);
      setResult(res.value !== null ? `∬_S F·dS ≈ ${res.value.toFixed(8)}` : null);
      setError(res.error);
    } else {
      // Sample curl + div at origin
      const [cx, cy, cz] = curl(P, Q, R, 0, 0, 0);
      const div = divergence(P, Q, R, 0, 0, 0);
      setSteps([
        {
          title: 'Campo vectorial',
          content: `F = ⟨${P}, ${Q}, ${R}⟩`,
        },
        {
          title: 'Curl ∇×F en (0,0,0)',
          content: `∇×F = ⟨${cx.toFixed(5)}, ${cy.toFixed(5)}, ${cz.toFixed(5)}⟩`,
        },
        {
          title: 'Divergencia ∇·F en (0,0,0)',
          content: `∇·F = ${div.toFixed(5)}`,
        },
        {
          title: 'Interpretación',
          content: `• |∇×F| > 0 → campo con rotación\n• ∇·F > 0 → fuente (expansión)\n• ∇·F < 0 → sumidero (contracción)\n• ∇·F = 0 → campo solenoidal`,
        },
      ]);
      setResult(`∇·F(0,0,0) ≈ ${div.toFixed(5)}`);
    }
  };

  const focusInput = (ref: React.RefObject<HTMLInputElement | null>, val: string, set: (v: string) => void) => {
    setActiveRef(ref);
    setActiveVal(val);
    setActiveSet(() => set);
    setShowKeyboard(true);
  };

  return (
    <div className="module-layout">
      <div className="module-sidebar">
        <h2 className="module-title">
          <Wind size={18} /> Campos Vectoriales
        </h2>

        {/* F = <P, Q, R> */}
        <div className="field-group">
          <label className="field-label">F = ⟨P, Q, R⟩</label>
          {[
            { label: 'P(x,y,z)', ref: PRef, val: P, set: setP },
            { label: 'Q(x,y,z)', ref: QRef, val: Q, set: setQ },
            { label: 'R(x,y,z)', ref: RRef, val: R, set: setR },
          ].map((comp) => (
            <div key={comp.label} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
              <label style={{ fontSize: '12px', color: '#64748b', width: '68px', flexShrink: 0 }}>{comp.label}</label>
              <input
                ref={comp.ref}
                type="text"
                value={comp.val}
                onChange={e => comp.set(e.target.value)}
                onFocus={() => focusInput(comp.ref, comp.val, comp.set)}
                className="math-input"
                style={{ flex: 1 }}
              />
            </div>
          ))}
          <button onClick={() => setShowKeyboard(v => !v)} className="icon-btn" style={{ marginTop: '4px' }}>
            <Keyboard size={14} /> Teclado
          </button>
          {showKeyboard && (
            <MathKeyboard
              inputRef={activeRef}
              value={activeVal}
              onChange={(v) => {
                activeSet(v);
                setActiveVal(v);
              }}
              onEnter={() => setShowKeyboard(false)}
            />
          )}
        </div>

        {/* Mode */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
          {(['campo', 'linea', 'superficie'] as VFMode[]).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                flex: 1, padding: '7px 4px', borderRadius: '8px',
                border: `2px solid ${mode === m ? '#7c3aed' : '#e2e8f0'}`,
                background: mode === m ? '#7c3aed' : '#fff',
                color: mode === m ? '#fff' : '#475569',
                fontWeight: 700, fontSize: '11px', cursor: 'pointer',
              }}
            >
              {m === 'campo' ? '🌀 Campo' : m === 'linea' ? '〰️ Línea' : '🔲 Superficie'}
            </button>
          ))}
        </div>

        {/* Line integral params */}
        {mode === 'linea' && (
          <div className="field-group">
            <label className="field-label">Curva r(t) = ⟨x(t), y(t), z(t)⟩</label>
            {[
              { label: 'x(t)', val: xCurve, set: setXCurve },
              { label: 'y(t)', val: yCurve, set: setYCurve },
              { label: 'z(t)', val: zCurve, set: setZCurve },
            ].map(c => (
              <div key={c.label} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                <label style={{ fontSize: '12px', color: '#64748b', width: '40px', flexShrink: 0 }}>{c.label}</label>
                <input type="text" value={c.val} onChange={e => c.set(e.target.value)} className="math-input" style={{ flex: 1 }} />
              </div>
            ))}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              <div>
                <label style={{ fontSize: '11px', color: '#64748b' }}>t mín</label>
                <input type="number" step="any" value={tMin} onChange={e => setTMin(parseFloat(e.target.value) || 0)} className="number-input" />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: '#64748b' }}>t máx</label>
                <input type="number" step="any" value={tMax} onChange={e => setTMax(parseFloat(e.target.value) || 6.28)} className="number-input" />
              </div>
            </div>
          </div>
        )}

        {/* Surface integral params */}
        {mode === 'superficie' && (
          <div className="field-group">
            <label className="field-label">Superficie r(u,v) = ⟨x(u,v), y(u,v), z(u,v)⟩</label>
            {[
              { label: 'x(u,v)', val: xSurf, set: setXSurf },
              { label: 'y(u,v)', val: ySurf, set: setYSurf },
              { label: 'z(u,v)', val: zSurf, set: setZSurf },
            ].map(c => (
              <div key={c.label} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                <label style={{ fontSize: '12px', color: '#64748b', width: '55px', flexShrink: 0 }}>{c.label}</label>
                <input type="text" value={c.val} onChange={e => c.set(e.target.value)} className="math-input" style={{ flex: 1 }} />
              </div>
            ))}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              {[['u mín', uMin, setUMin], ['u máx', uMax, setUMax], ['v mín', vMin, setVMin], ['v máx', vMax, setVMax]].map(([l, v, s]) => (
                <div key={String(l)}>
                  <label style={{ fontSize: '11px', color: '#64748b' }}>{String(l)}</label>
                  <input type="number" step="any" value={v as number} onChange={e => (s as (n: number) => void)(parseFloat(e.target.value) || 0)} className="number-input" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Toggle curl/div */}
        {mode === 'campo' && (
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer', userSelect: 'none' }}>
              <input type="checkbox" checked={showCurl} onChange={e => setShowCurl(e.target.checked)} />
              Mostrar Curl ∇×F
            </label>
          </div>
        )}

        <button onClick={compute} className="btn-compute">Calcular</button>

        <div style={{ marginTop: '16px' }}>
          <StepPanel steps={steps} result={result} error={error} title="Campo Vectorial — Resultado" />
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
