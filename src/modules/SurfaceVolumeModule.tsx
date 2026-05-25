import { useRef, useState, useEffect } from 'react';
import Plotly from 'plotly.js-dist-min';
import { MathKeyboard } from '../components/MathKeyboard';
import { StepPanel } from '../components/StepPanel';
import { sampleSurface, computeVolumeBetweenSurfaces } from '../lib/numericalIntegration';
import { usePlotlyZoom } from '../hooks/usePlotlyZoom';
import { PlotlyZoomControls } from '../components/PlotlyZoomControls';
import { Keyboard, Plus, Trash2, Layers } from 'lucide-react';
import { normalizeToCube, isInsideCube } from '../lib/cubeViewport';
import { buildStaticSceneExtras, buildFixedSceneLayout, getEqualizedDomain } from '../lib/scene3dStyle';
import { safeCompile, evalNumber } from '../lib/mathEngine';

interface SurfaceEntry {
  id: string;
  expr: string;
  color: string;
  label: string;
}

interface ImplicitSurfaceEntry {
  id: string;
  expr: string;
  c: number;
  color: string;
  label: string;
}

const SURFACE_COLORS = ['#2563eb', '#0891b2', '#7c3aed', '#db2777'];
const VOLUME_COLOR = 'rgba(20, 184, 166, 0.45)'; // teal 50% opacity
const PLANE_COLOR = '#f97316'; // orange

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

function sampleImplicitSurface(
  expr: string,
  constC: number,
  domain: { xMin: number; xMax: number; yMin: number; yMax: number; zMin: number; zMax: number },
  color: string,
  name: string,
  opacity: number
): Plotly.Data | null {
  const fn = safeCompile(expr);
  if (!fn) return null;

  const n = 30; // Grid density
  const xs: number[] = [];
  const ys: number[] = [];
  const zs: number[] = [];
  for (let i = 0; i < n; i++) {
    const val = -1 + (i / (n - 1)) * 2;
    xs.push(val);
    ys.push(val);
    zs.push(val);
  }

  const xFlat: number[] = [];
  const yFlat: number[] = [];
  const zFlat: number[] = [];
  const valFlat: number[] = [];

  for (const zVal of zs) {
    const zOrig = domain.zMin + ((zVal + 1) / 2) * (domain.zMax - domain.zMin);
    for (const yVal of ys) {
      const yOrig = domain.yMin + ((yVal + 1) / 2) * (domain.yMax - domain.yMin);
      for (const xVal of xs) {
        const xOrig = domain.xMin + ((xVal + 1) / 2) * (domain.xMax - domain.xMin);
        let val = evalNumber(fn, { x: xOrig, y: yOrig, z: zOrig });
        if (val === null || !isFinite(val)) {
          val = NaN;
        }
        xFlat.push(xVal);
        yFlat.push(yVal);
        zFlat.push(zVal);
        valFlat.push(val);
      }
    }
  }

  return {
    type: 'isosurface',
    x: xFlat,
    y: yFlat,
    z: zFlat,
    value: valFlat,
    isomin: constC,
    isomax: constC,
    surface: { show: true, count: 1, fill: 0.95 },
    caps: { x: { show: false }, y: { show: false }, z: { show: false } },
    name,
    colorscale: [[0, color], [1, color]],
    showscale: false,
    opacity,
    hovertemplate: `${name} = ${constC}<extra></extra>`,
  } as unknown as Plotly.Data;
}

export function SurfaceVolumeModule() {
  const plotRef = useRef<HTMLDivElement>(null);
  const zoomContainerRef = useRef<HTMLDivElement>(null);
  const activeInputRef = useRef<HTMLInputElement | null>(null);

  type SurfaceTypeMode = 'explicita' | 'implicita';
  const [typeMode, setTypeMode] = useState<SurfaceTypeMode>('explicita');

  const [surfaces, setSurfaces] = useState<SurfaceEntry[]>([
    { id: '1', expr: 'x^2 + y^2', color: SURFACE_COLORS[0], label: 'f₁(x,y)' },
  ]);
  const [implicitSurfaces, setImplicitSurfaces] = useState<ImplicitSurfaceEntry[]>([
    { id: '1', expr: 'x^2 + y^2 + z^2', c: 4, color: SURFACE_COLORS[0], label: 'F₁(x,y,z) = 4' }
  ]);
  const [newImplicitExpr, setNewImplicitExpr] = useState('');
  const [newImplicitC, setNewImplicitC] = useState('0');

  const [planeExpr, setPlaneExpr] = useState('4');
  const [xMin, setXMin] = useState(-3);
  const [xMax, setXMax] = useState(3);
  const [yMin, setYMin] = useState(-3);
  const [yMax, setYMax] = useState(3);
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [activeInput, setActiveInput] = useState<'surface' | 'plane' | 'surface-list' | 'implicit-surface' | 'implicit-surface-list'>('surface');
  const [activeIdx, setActiveIdx] = useState(0);
  const [transparency, setTransparency] = useState(0.5);
  const [steps, setSteps] = useState<{ title: string; content: string }[]>([]);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newExpr, setNewExpr] = useState('');

  const [viewport, setViewport] = useState({ xMin: -3, xMax: 3, yMin: -3, yMax: 3, zMin: -3, zMax: 3 });

  // Camera state persistence
  const cameraRef = useRef({
    projection: { type: 'perspective' as const },
    eye: { x: 1.5, y: 1.5, z: 1.0 },
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
      eye: { x: 1.5, y: 1.5, z: 1.0 },
      center: { x: 0, y: 0, z: 0 },
      up: { x: 0, y: 0, z: 1 }
    };
    resetZoom();
  };

  const addSurface = () => {
    if (!newExpr.trim()) return;
    const idx = surfaces.length;
    setSurfaces(prev => [...prev, {
      id: Date.now().toString(),
      expr: newExpr.trim(),
      color: SURFACE_COLORS[idx % SURFACE_COLORS.length],
      label: `f${idx + 1}(x,y)`,
    }]);
    setNewExpr('');
  };

  const removeSurface = (id: string) => {
    setSurfaces(prev => prev.filter(s => s.id !== id));
  };

  const addImplicitSurface = () => {
    if (!newImplicitExpr.trim()) return;
    const idx = implicitSurfaces.length;
    const cVal = parseFloat(newImplicitC) || 0;
    const rawExpr = newImplicitExpr.trim();
    const label = rawExpr.includes('=')
      ? `F${idx + 1}(x,y,z)`
      : `F${idx + 1}(x,y,z) = ${cVal}`;

    setImplicitSurfaces(prev => [...prev, {
      id: Date.now().toString(),
      expr: rawExpr,
      c: rawExpr.includes('=') ? 0 : cVal,
      color: SURFACE_COLORS[idx % SURFACE_COLORS.length],
      label,
    }]);
    setNewImplicitExpr('');
    setNewImplicitC('0');
  };

  const removeImplicitSurface = (id: string) => {
    setImplicitSurfaces(prev => prev.filter(s => s.id !== id));
  };

  const compute = () => {
    if (surfaces.length < 1) return;

    const topExpr = surfaces[0].expr;
    const bottomExpr = surfaces.length > 1 ? surfaces[1].expr : planeExpr;

    const res = computeVolumeBetweenSurfaces(topExpr, bottomExpr, xMin, xMax, yMin, yMax);
    setSteps(res.steps);
    setResult(res.value !== null ? `V ≈ ${res.value.toFixed(6)} unidades³` : null);
    setError(res.error);
  };

  useEffect(() => {
    const el = plotRef.current;
    if (!el) return;

    let computedZMin = -3;
    let computedZMax = 3;

    if (typeMode === 'explicita') {
      let sampledZMin = Infinity;
      let sampledZMax = -Infinity;

      surfaces.forEach((surf) => {
        const s = sampleSurface(surf.expr, xMin, xMax, yMin, yMax, 50);
        if (s) {
          for (const row of s.z) {
            for (const val of row) {
              if (typeof val === 'number' && isFinite(val)) {
                if (val < sampledZMin) sampledZMin = val;
                if (val > sampledZMax) sampledZMax = val;
              }
            }
          }
        }
      });

      const planeVal = parseFloat(planeExpr);
      if (!isNaN(planeVal)) {
        if (planeVal < sampledZMin) sampledZMin = planeVal;
        if (planeVal > sampledZMax) sampledZMax = planeVal;
      }

      if (isFinite(sampledZMin) && isFinite(sampledZMax)) {
        computedZMin = sampledZMin;
        computedZMax = sampledZMax;
      }
    } else {
      computedZMin = xMin;
      computedZMax = xMax;
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

    if (typeMode === 'explicita') {
      const n = 50;

      // Render each surface
      surfaces.forEach((surf, i) => {
        const s = sampleSurface(surf.expr, xMin, xMax, yMin, yMax, n);
        if (!s) return;
        const ns = normalizeGrid(s, viewDomain);
        traces.push({
          type: 'surface',
          x: ns.x,
          y: ns.y,
          z: ns.z,
          name: surf.label,
          colorscale: [[0, surf.color], [1, surf.color]],
          showscale: false,
          opacity: i === 0 ? 1 : transparency,
          lighting: { ambient: 0.7, diffuse: 0.9 },
          hovertemplate: `${surf.label}<extra></extra>`,
          contours: {
            x: { show: true, start: -1, end: 1, size: 0.05, color: '#ffffff', width: 1.2, highlight: false },
            y: { show: true, start: -1, end: 1, size: 0.05, color: '#ffffff', width: 1.2, highlight: false },
          },
        } as Plotly.Data);
      });

      // Render cutting plane (z = constant or z = expression)
      const planeFn = () => {
        try {
          const v = parseFloat(planeExpr);
          if (!isNaN(v)) {
            const xs = [xMin, xMax];
            const ys = [yMin, yMax];

            const pxGrid: number[][] = [];
            const pyGrid: number[][] = [];
            const pzGrid: number[][] = [];
            for (let i = 0; i < ys.length; i++) {
              const xr: number[] = [];
              const yr: number[] = [];
              const zr: number[] = [];
              for (let j = 0; j < xs.length; j++) {
                const npx = normalizeToCube(xs[j], viewDomain.xMin, viewDomain.xMax);
                const npy = normalizeToCube(ys[i], viewDomain.yMin, viewDomain.yMax);
                const npz = normalizeToCube(v, viewDomain.zMin, viewDomain.zMax);
                if (isInsideCube(npx, npy, npz)) {
                  xr.push(npx); yr.push(npy); zr.push(npz);
                } else {
                  xr.push(NaN); yr.push(NaN); zr.push(NaN);
                }
              }
              pxGrid.push(xr);
              pyGrid.push(yr);
              pzGrid.push(zr);
            }

            traces.push({
              type: 'surface',
              x: pxGrid,
              y: pyGrid,
              z: pzGrid,
              name: `Plano z = ${planeExpr}`,
              colorscale: [[0, PLANE_COLOR], [1, PLANE_COLOR]],
              showscale: false,
              opacity: 0.6,
              hovertemplate: `z = ${planeExpr}<extra>Plano de corte</extra>`,
              contours: {
                x: { show: true, start: -1, end: 1, size: 0.05, color: '#ffffff', width: 1.2, highlight: false },
                y: { show: true, start: -1, end: 1, size: 0.05, color: '#ffffff', width: 1.2, highlight: false },
              },
            } as Plotly.Data);
          }
        } catch { /* skip */ }
      };
      planeFn();
    } else {
      // Render implicit surfaces
      implicitSurfaces.forEach((surf) => {
        const isEq = surf.expr.includes('=');
        const targetC = isEq ? 0 : surf.c;
        const s = sampleImplicitSurface(surf.expr, targetC, viewDomain, surf.color, surf.label, transparency);
        if (s) {
          traces.push(s);
        }
      });
    }

    const onRelayout = (ev: Plotly.PlotRelayoutEvent) => {
      const cam = (ev as Record<string, unknown>)['scene.camera'];
      if (cam && typeof cam === 'object') {
        cameraRef.current = cam as any;
      }
    };

    const extras = buildStaticSceneExtras(viewDomain);
    const allTraces = [...extras.traces, ...traces];
    const titleText = 'Superficies y Volumen';
    const layout = buildFixedSceneLayout(viewDomain, titleText, extras.annotations, cameraRef.current);
    if (layout.scene) {
      layout.scene.showlegend = true;
      layout.scene.legend = { x: 0.01, y: 0.99, bgcolor: 'rgba(255,255,255,0.8)', bordercolor: '#e2e8f0', borderwidth: 1 };
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
  }, [typeMode, surfaces, implicitSurfaces, planeExpr, xMin, xMax, yMin, yMax, transparency, viewDomain, axisTicks, viewport]);

  return (
    <div className="module-layout">
      {/* ── Left Panel ── */}
      <div className="module-sidebar">
        <h2 className="module-title">
          <Layers size={18} /> Superficies &amp; Volumen
        </h2>

        {/* Mode Switcher */}
        <div style={{ display: 'flex', background: '#f1f5f9', padding: '3px', borderRadius: '8px', marginBottom: '16px' }}>
          <button
            onClick={() => setTypeMode('explicita')}
            style={{
              flex: 1,
              padding: '6px 12px',
              borderRadius: '6px',
              border: 'none',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              background: typeMode === 'explicita' ? '#ffffff' : 'transparent',
              color: typeMode === 'explicita' ? '#1e293b' : '#64748b',
              boxShadow: typeMode === 'explicita' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.2s'
            }}
          >
            Explícitas
          </button>
          <button
            onClick={() => setTypeMode('implicita')}
            style={{
              flex: 1,
              padding: '6px 12px',
              borderRadius: '6px',
              border: 'none',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              background: typeMode === 'implicita' ? '#ffffff' : 'transparent',
              color: typeMode === 'implicita' ? '#1e293b' : '#64748b',
              boxShadow: typeMode === 'implicita' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.2s'
            }}
          >
            Implícitas
          </button>
        </div>

        {typeMode === 'explicita' ? (
          <>
            {/* Explicit Surfaces */}
            <div className="field-group">
              <label className="field-label">Superficies z = f(x,y)</label>
              {surfaces.map((s, i) => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                  <span style={{
                    width: '12px', height: '12px', borderRadius: '3px', flexShrink: 0,
                    background: s.color,
                  }} />
                  <input
                    ref={el => {
                      if (activeInput === 'surface-list' && activeIdx === i) {
                        activeInputRef.current = el;
                      }
                    }}
                    type="text"
                    value={s.expr}
                    onChange={e => {
                      const val = e.target.value;
                      setSurfaces(prev => prev.map(item => item.id === s.id ? { ...item, expr: val } : item));
                    }}
                    onFocus={() => {
                      setActiveInput('surface-list');
                      setActiveIdx(i);
                      setShowKeyboard(true);
                    }}
                    className="math-input"
                    style={{ flex: 1, padding: '4px 8px', fontSize: '13px', height: '30px' }}
                  />
                  <button
                    onClick={() => removeSurface(s.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '2px' }}
                    title="Eliminar superficie"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}

              {surfaces.length === 0 && (
                <div style={{ fontSize: '12px', color: '#f59e0b', background: '#fffbeb', border: '1px solid #fef3c7', padding: '8px 12px', borderRadius: '8px', marginBottom: '10px' }}>
                  ⚠️ No hay superficies en la lista. Agrega una abajo.
                </div>
              )}

              <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                <input
                  ref={el => {
                    if (activeInput === 'surface') {
                      activeInputRef.current = el;
                    }
                  }}
                  type="text"
                  value={newExpr}
                  onChange={e => setNewExpr(e.target.value)}
                  onFocus={() => { setActiveInput('surface'); setActiveIdx(0); setShowKeyboard(true); }}
                  placeholder="nueva superficie…"
                  className="math-input"
                  style={{ flex: 1 }}
                  onKeyDown={e => e.key === 'Enter' && addSurface()}
                />
                <button
                  onClick={() => { setShowKeyboard(v => !v); }}
                  className="icon-btn"
                  title="Teclado matemático"
                >
                  <Keyboard size={15} />
                </button>
                <button onClick={addSurface} className="btn-primary-sm">
                  <Plus size={15} />
                </button>
              </div>
            </div>

            {/* Cutting Plane */}
            <div className="field-group">
              <label className="field-label" style={{ color: PLANE_COLOR }}>Plano de corte: z =</label>
              <input
                ref={el => {
                  if (activeInput === 'plane') {
                    activeInputRef.current = el;
                  }
                }}
                type="text"
                value={planeExpr}
                onChange={e => setPlaneExpr(e.target.value)}
                onFocus={() => { setActiveInput('plane'); setShowKeyboard(true); }}
                className="math-input"
                placeholder="ej. 4"
              />
              <p style={{ fontSize: '11px', color: '#94a3b8', margin: '4px 0 0' }}>El volumen se computa entre la primera superficie y este plano.</p>
            </div>
          </>
        ) : (
          <>
            {/* Implicit Surfaces */}
            <div className="field-group">
              <label className="field-label">Superficies Implícitas f(x,y,z) = c</label>
              {implicitSurfaces.map((s, i) => (
                <div key={s.id} style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '10px', background: '#f8fafc', padding: '8px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{
                      width: '12px', height: '12px', borderRadius: '3px', flexShrink: 0,
                      background: s.color,
                    }} />
                    <input
                      ref={el => {
                        if (activeInput === 'implicit-surface-list' && activeIdx === i) {
                          activeInputRef.current = el;
                        }
                      }}
                      type="text"
                      value={s.expr}
                      onChange={e => {
                        const val = e.target.value;
                        setImplicitSurfaces(prev => prev.map(item => item.id === s.id ? { ...item, expr: val } : item));
                      }}
                      onFocus={() => {
                        setActiveInput('implicit-surface-list');
                        setActiveIdx(i);
                        setShowKeyboard(true);
                      }}
                      className="math-input"
                      style={{ flex: 1, padding: '4px 8px', fontSize: '13px', height: '30px' }}
                    />
                    <button
                      onClick={() => removeImplicitSurface(s.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '2px' }}
                      title="Eliminar superficie"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  {!s.expr.includes('=') && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', paddingLeft: '18px' }}>
                      <span style={{ fontSize: '11px', color: '#64748b' }}>Constante c =</span>
                      <input
                        type="number"
                        step="any"
                        value={s.c}
                        onChange={e => {
                          const val = parseFloat(e.target.value) || 0;
                          setImplicitSurfaces(prev => prev.map(item => item.id === s.id ? { ...item, c: val, label: `F${i + 1}(x,y,z) = ${val}` } : item));
                        }}
                        className="number-input"
                        style={{ width: '70px', height: '24px', padding: '2px 6px', fontSize: '11px' }}
                      />
                    </div>
                  )}
                </div>
              ))}

              {implicitSurfaces.length === 0 && (
                <div style={{ fontSize: '12px', color: '#f59e0b', background: '#fffbeb', border: '1px solid #fef3c7', padding: '8px 12px', borderRadius: '8px', marginBottom: '10px' }}>
                  ⚠️ No hay superficies en la lista. Agrega una abajo.
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px', background: '#f8fafc', padding: '8px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#475569' }}>NUEVA SUPERFICIE IMPLÍCITA</span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input
                    ref={el => {
                      if (activeInput === 'implicit-surface') {
                        activeInputRef.current = el;
                      }
                    }}
                    type="text"
                    value={newImplicitExpr}
                    onChange={e => setNewImplicitExpr(e.target.value)}
                    onFocus={() => { setActiveInput('implicit-surface'); setActiveIdx(0); setShowKeyboard(true); }}
                    placeholder="ej: x^2+y^2+z^2-4 o x^2+y^2-z^2=0"
                    className="math-input"
                    style={{ flex: 1 }}
                    onKeyDown={e => e.key === 'Enter' && addImplicitSurface()}
                  />
                  <button
                    onClick={() => { setShowKeyboard(v => !v); }}
                    className="icon-btn"
                    title="Teclado matemático"
                  >
                    <Keyboard size={15} />
                  </button>
                </div>
                {!newImplicitExpr.includes('=') && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '12px', color: '#64748b' }}>Constante c =</span>
                    <input
                      type="text"
                      value={newImplicitC}
                      onChange={e => setNewImplicitC(e.target.value)}
                      placeholder="0"
                      className="number-input"
                      style={{ width: '80px' }}
                    />
                  </div>
                )}
                <button onClick={addImplicitSurface} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', padding: '6px 12px' }}>
                  <Plus size={14} /> Agregar Superficie
                </button>
              </div>
            </div>
          </>
        )}

        {showKeyboard && (
          <MathKeyboard
            inputRef={activeInputRef}
            value={
              activeInput === 'surface' ? newExpr :
              activeInput === 'plane' ? planeExpr :
              activeInput === 'implicit-surface' ? newImplicitExpr :
              activeInput === 'implicit-surface-list' ? (implicitSurfaces[activeIdx]?.expr || '') :
              surfaces[activeIdx]?.expr || ''
            }
            onChange={val => {
              if (activeInput === 'surface') setNewExpr(val);
              else if (activeInput === 'plane') setPlaneExpr(val);
              else if (activeInput === 'implicit-surface') setNewImplicitExpr(val);
              else if (activeInput === 'implicit-surface-list') {
                setImplicitSurfaces(prev => prev.map((item, idx) => idx === activeIdx ? { ...item, expr: val } : item));
              } else {
                setSurfaces(prev => prev.map((item, idx) => idx === activeIdx ? { ...item, expr: val } : item));
              }
            }}
            onEnter={() => setShowKeyboard(false)}
          />
        )}

        {/* Domain */}
        <div className="field-group">
          <label className="field-label">Dominio D</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
            {([['xMin', xMin, setXMin], ['xMax', xMax, setXMax], ['yMin', yMin, setYMin], ['yMax', yMax, setYMax]] as const).map(([k, v, s]) => (
              <div key={k}>
                <label style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '2px' }}>{k}</label>
                <input
                  type="number" step="any"
                  value={v}
                  onChange={e => (s as (n: number) => void)(parseFloat(e.target.value) || 0)}
                  className="number-input"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Transparency */}
        <div className="field-group">
          <label className="field-label">Transparencia del sólido: {Math.round(transparency * 100)}%</label>
          <input
            type="range" min="0.1" max="1" step="0.05"
            value={transparency}
            onChange={e => setTransparency(parseFloat(e.target.value))}
            style={{ width: '100%', accentColor: '#0891b2' }}
          />
        </div>

        {typeMode === 'explicita' && (
          <>
            <button onClick={compute} className="btn-compute">
              Calcular Volumen
            </button>

            <div style={{ marginTop: '16px' }}>
              <StepPanel steps={steps} result={result} error={error} title="Cálculo de Volumen" />
            </div>
          </>
        )}
      </div>

      {/* ── Right: 3D Plot ── */}
      <div className="module-viewer" style={{ position: 'relative' }} ref={zoomContainerRef}>
        <div ref={plotRef} style={{ width: '100%', height: '100%' }} />
        <PlotlyZoomControls viewDomain={viewDomain} onZoomIn={zoomIn} onZoomOut={zoomOut} onReset={resetZoomWithCamera} plotRef={plotRef} />
      </div>
    </div>
  );
}
