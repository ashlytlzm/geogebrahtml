import { useRef, useState, useEffect } from 'react';
import Plotly from 'plotly.js-dist-min';
import { StepPanel } from '../components/StepPanel';
import {
  type CoordSystem,
  jacobianFormula,
  substitutionFormulas,
  variableNames,
  generateRegionPoints,
  reformulateIntegral,
} from '../lib/coordTransform';
import { computeDoubleIntegral } from '../lib/numericalIntegration';
import { usePlotlyZoom } from '../hooks/usePlotlyZoom';
import { PlotlyZoomControls } from '../components/PlotlyZoomControls';
import { Globe2 } from 'lucide-react';
import { normalizeToCube, isInsideCube } from '../lib/cubeViewport';
import { buildStaticSceneExtras, buildFixedSceneLayout, getEqualizedDomain } from '../lib/scene3dStyle';

const SYSTEMS: { value: CoordSystem; label: string; icon: string }[] = [
  { value: 'cartesiano', label: 'Cartesiano', icon: '🟦' },
  { value: 'polar', label: 'Polar', icon: '🔵' },
  { value: 'cilindrico', label: 'Cilíndrico', icon: '🟢' },
  { value: 'esferico', label: 'Esférico', icon: '🟡' },
];

export function CoordinatesModule() {
  const plotRef = useRef<HTMLDivElement>(null);
  const zoomContainerRef = useRef<HTMLDivElement>(null);

  const [fExpr, setFExpr] = useState('x^2 + y^2');
  const [fromSystem, setFromSystem] = useState<CoordSystem>('cartesiano');
  const [toSystem, setToSystem] = useState<CoordSystem>('polar');
  const [p1Min, setP1Min] = useState(0);
  const [p1Max, setP1Max] = useState(2);
  const [p2Min, setP2Min] = useState(0);
  const [p2Max, setP2Max] = useState(Math.PI * 2);
  const [steps, setSteps] = useState<{ title: string; content: string }[]>([]);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [viewport, setViewport] = useState({ xMin: -3, xMax: 3, yMin: -3, yMax: 3, zMin: -3, zMax: 3 });

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

  const vars = variableNames(toSystem);

  const convert = () => {
    const boundsDesc = `${vars.v1} ∈ [${p1Min.toFixed(3)}, ${p1Max.toFixed(3)}]\n${vars.v2} ∈ [${p2Min.toFixed(3)}, ${p2Max.toFixed(3)}]`;
    const converted = reformulateIntegral(fExpr, fromSystem, toSystem, boundsDesc);
    setSteps(converted.steps);
    setError(null);
    setResult(null);
  };

  const computeNumerical = () => {
    // Compute the integral in the target coord system numerically using Cartesian bounds
    const res = computeDoubleIntegral(fExpr, {
      xMin: p1Min,
      xMax: p1Max,
      yMinExpr: p2Min.toString(),
      yMaxExpr: p2Max.toString(),
    });
    setResult(res.value !== null ? `∬ f · J dA ≈ ${res.value.toFixed(8)}` : null);
    setError(res.error);
  };

  // Visualize the region in both Cartesian and target coordinate system
  useEffect(() => {
    const el = plotRef.current;
    if (!el) return;

    const pts = generateRegionPoints(toSystem, p1Min, p1Max, p2Min, p2Max, -1, 1, 25);

    let xMinSampled = Infinity;
    let xMaxSampled = -Infinity;
    let yMinSampled = Infinity;
    let yMaxSampled = -Infinity;
    let zMinSampled = Infinity;
    let zMaxSampled = -Infinity;

    for (let i = 0; i < pts.x.length; i++) {
      const vx = pts.x[i];
      const vy = pts.y[i];
      const vz = pts.z[i];
      if (isFinite(vx)) {
        if (vx < xMinSampled) xMinSampled = vx;
        if (vx > xMaxSampled) xMaxSampled = vx;
      }
      if (isFinite(vy)) {
        if (vy < yMinSampled) yMinSampled = vy;
        if (vy > yMaxSampled) yMaxSampled = vy;
      }
      if (isFinite(vz)) {
        if (vz < zMinSampled) zMinSampled = vz;
        if (vz > zMaxSampled) zMaxSampled = vz;
      }
    }

    let computedXMin = -3, computedXMax = 3;
    let computedYMin = -3, computedYMax = 3;
    let computedZMin = -3, computedZMax = 3;

    if (isFinite(xMinSampled) && isFinite(xMaxSampled)) {
      computedXMin = xMinSampled;
      computedXMax = xMaxSampled;
    }
    if (isFinite(yMinSampled) && isFinite(yMaxSampled)) {
      computedYMin = yMinSampled;
      computedYMax = yMaxSampled;
    }
    if (isFinite(zMinSampled) && isFinite(zMaxSampled)) {
      computedZMin = zMinSampled;
      computedZMax = zMaxSampled;
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

    const xNorm: number[] = [];
    const yNorm: number[] = [];
    const zNorm: number[] = [];
    for (let i = 0; i < pts.x.length; i++) {
      const nx = normalizeToCube(pts.x[i], viewDomain.xMin, viewDomain.xMax);
      const ny = normalizeToCube(pts.y[i], viewDomain.yMin, viewDomain.yMax);
      const nz = normalizeToCube(pts.z[i], viewDomain.zMin, viewDomain.zMax);
      if (isInsideCube(nx, ny, nz)) {
        xNorm.push(nx);
        yNorm.push(ny);
        zNorm.push(nz);
      } else {
        xNorm.push(NaN);
        yNorm.push(NaN);
        zNorm.push(NaN);
      }
    }

    const traces: Plotly.Data[] = [
      {
        type: 'scatter3d',
        mode: 'markers',
        x: xNorm,
        y: yNorm,
        z: zNorm,
        name: `Región (${toSystem})`,
        marker: {
          size: 2.5,
          color: zNorm,
          colorscale: 'Viridis',
          opacity: 0.7,
        },
        hoverinfo: 'none',
      } as Plotly.Data,
    ];

    const onRelayout = (ev: Plotly.PlotRelayoutEvent) => {
      const cam = (ev as Record<string, unknown>)['scene.camera'];
      if (cam && typeof cam === 'object') {
        cameraRef.current = cam as any;
      }
    };

    const extras = buildStaticSceneExtras(viewDomain);
    const allTraces = [...extras.traces, ...traces];
    const titleText = `Región de integración — ${toSystem}`;
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
  }, [toSystem, p1Min, p1Max, p2Min, p2Max, viewDomain, axisTicks, viewport]);

  return (
    <div className="module-layout">
      {/* ── Left Panel ── */}
      <div className="module-sidebar">
        <h2 className="module-title">
          <Globe2 size={18} /> Sistemas de Coordenadas
        </h2>

        {/* Function */}
        <div className="field-group">
          <label className="field-label">Función f</label>
          <input
            type="text"
            value={fExpr}
            onChange={e => setFExpr(e.target.value)}
            className="math-input"
            placeholder="ej. x^2 + y^2"
          />
        </div>

        {/* From / To */}
        <div className="field-group">
          <label className="field-label">Sistema original</label>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {SYSTEMS.map(s => (
              <button
                key={s.value}
                onClick={() => setFromSystem(s.value)}
                style={{
                  padding: '6px 10px',
                  borderRadius: '8px',
                  border: `2px solid ${fromSystem === s.value ? '#2563eb' : '#e2e8f0'}`,
                  background: fromSystem === s.value ? '#eff6ff' : '#fff',
                  color: fromSystem === s.value ? '#1d4ed8' : '#475569',
                  fontWeight: 600,
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                {s.icon} {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="field-group">
          <label className="field-label">Convertir a</label>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {SYSTEMS.map(s => (
              <button
                key={s.value}
                onClick={() => setToSystem(s.value)}
                style={{
                  padding: '6px 10px',
                  borderRadius: '8px',
                  border: `2px solid ${toSystem === s.value ? '#7c3aed' : '#e2e8f0'}`,
                  background: toSystem === s.value ? '#f5f3ff' : '#fff',
                  color: toSystem === s.value ? '#6d28d9' : '#475569',
                  fontWeight: 600,
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                {s.icon} {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Bounds */}
        <div className="field-group">
          <label className="field-label">Límites de integración</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
            <div>
              <label style={{ fontSize: '11px', color: '#64748b' }}>{vars.v1} mín</label>
              <input type="number" step="any" value={p1Min} onChange={e => setP1Min(parseFloat(e.target.value) || 0)} className="number-input" />
            </div>
            <div>
              <label style={{ fontSize: '11px', color: '#64748b' }}>{vars.v1} máx</label>
              <input type="number" step="any" value={p1Max} onChange={e => setP1Max(parseFloat(e.target.value) || 1)} className="number-input" />
            </div>
            <div>
              <label style={{ fontSize: '11px', color: '#64748b' }}>{vars.v2} mín</label>
              <input type="number" step="any" value={p2Min} onChange={e => setP2Min(parseFloat(e.target.value) || 0)} className="number-input" />
            </div>
            <div>
              <label style={{ fontSize: '11px', color: '#64748b' }}>{vars.v2} máx</label>
              <input type="number" step="any" value={p2Max} onChange={e => setP2Max(parseFloat(e.target.value) || Math.PI * 2)} className="number-input" />
            </div>
          </div>
        </div>

        {/* Jacobian display */}
        <div style={{
          background: '#faf5ff',
          border: '1px solid #e9d5ff',
          borderRadius: '8px',
          padding: '10px 12px',
          marginBottom: '12px',
        }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#7c3aed', marginBottom: '6px', textTransform: 'uppercase' }}>
            Jacobiano
          </div>
          <code style={{ fontSize: '13px', color: '#4c1d95' }}>{jacobianFormula(toSystem)}</code>
          <div style={{ marginTop: '8px', fontSize: '11px', color: '#6d28d9' }}>
            {substitutionFormulas(toSystem).join('  ·  ')}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={convert} className="btn-compute" style={{ flex: 1 }}>
            Convertir Integral
          </button>
          <button onClick={computeNumerical} className="btn-secondary" style={{ flex: 1 }}>
            Calcular Numér.
          </button>
        </div>

        <div style={{ marginTop: '16px' }}>
          <StepPanel
            steps={steps}
            result={result}
            error={error}
            title="Conversión de Coordenadas"
          />
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
