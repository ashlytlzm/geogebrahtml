import { useRef, useState, useEffect, type ReactNode } from 'react';
import Plotly from 'plotly.js-dist-min';
import { MathKeyboard } from '../components/MathKeyboard';
import { StepPanel } from '../components/StepPanel';
import type { Step } from '../components/StepPanel';
import {
  computeDoubleIntegral,
  computeTripleIntegral,
  sampleSurface,
} from '../lib/numericalIntegration';
import {
  symbolicDoubleIntegral,
  symbolicTripleIntegral,
  isBackendAvailable,
} from '../lib/symbolicApi';
import { safeCompile, evalNumber } from '../lib/mathEngine';
import { usePlotlyZoom } from '../hooks/usePlotlyZoom';
import { PlotlyZoomControls } from '../components/PlotlyZoomControls';
import { Sigma, Keyboard, Zap, Cpu, BookOpen, ChevronDown, ChevronRight, Layers, Target, Box } from 'lucide-react';
import { normalizeToCube, isInsideCube } from '../lib/cubeViewport';
import { buildStaticSceneExtras, buildFixedSceneLayout, getEqualizedDomain } from '../lib/scene3dStyle';

type IntegralMode = 'doble' | 'triple';

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

// ─── Preset examples ──────────────────────────────────────────────────────────
interface Preset {
  label: string;
  icon: string;
  mode: IntegralMode;
  description: string;
  techo: string;
  piso: string;
  pared: string;
  f: string;
  xMin: number; xMax: number;
  yMin: string; yMax: string;
  zMin: string; zMax: string;
}

const PRESETS: Preset[] = [
  {
    label: 'Paraboloide + Cilindro',
    icon: '🫙',
    mode: 'triple',
    description: 'Volumen bajo z = 4 − x² − y² sobre el cilindro x² + y² ≤ 1',
    techo: 'z = 4 − x² − y²  (paraboloide)',
    piso: 'z = 0  (plano xy)',
    pared: 'x² + y² = 1  → y: [−√(1−x²), √(1−x²)],  x: [−1, 1]',
    f: '1',
    xMin: -1, xMax: 1,
    yMin: '-sqrt(1 - x^2)', yMax: 'sqrt(1 - x^2)',
    zMin: '0', zMax: '4 - x^2 - y^2',
  },
  {
    label: 'Cuña lineal',
    icon: '📐',
    mode: 'triple',
    description: 'Volumen de la región E: 0 ≤ z ≤ 2−x−y, triángulo en xy',
    techo: 'z = 2 − x − y  (plano inclinado)',
    piso: 'z = 0  (plano xy)',
    pared: 'Triángulo: x ∈ [0,2], y ∈ [0, 2−x]',
    f: '1',
    xMin: 0, xMax: 2,
    yMin: '0', yMax: '2 - x',
    zMin: '0', zMax: '2 - x - y',
  },
  {
    label: 'Esfera unitaria',
    icon: '🌐',
    mode: 'triple',
    description: 'Volumen de la esfera x² + y² + z² ≤ 1',
    techo: 'z = √(1 − x² − y²)  (hemisferio sup.)',
    piso: 'z = −√(1 − x² − y²)  (hemisferio inf.)',
    pared: 'Círculo: x ∈ [−1,1], y ∈ [−√(1−x²), √(1−x²)]',
    f: '1',
    xMin: -1, xMax: 1,
    yMin: '-sqrt(1 - x^2)', yMax: 'sqrt(1 - x^2)',
    zMin: '-sqrt(1 - x^2 - y^2)', zMax: 'sqrt(1 - x^2 - y^2)',
  },
  {
    label: 'Integral doble simple',
    icon: '∬',
    mode: 'doble',
    description: '∬_D xy dA sobre el cuadrado [0,1]×[0,1]',
    techo: '—',
    piso: '—',
    pared: 'Cuadrado unitario: x,y ∈ [0,1]',
    f: 'x * y',
    xMin: 0, xMax: 1,
    yMin: '0', yMax: '1',
    zMin: '0', zMax: '1',
  },
];

// ─── Sampler for bounded surfaces ─────────────────────────────────────────────
function sampleParametricSurface(
  zExpr: string, // Piso or Techo expression
  outerMin: number,
  outerMax: number,
  middleMinExpr: string,
  middleMaxExpr: string,
  outerVar: string,
  middleVar: string,
  innerVar: string,
  n = 40
): { x: number[][], y: number[][], z: number[][] } | null {
  const zFn = safeCompile(zExpr);
  const middleMinFn = safeCompile(middleMinExpr);
  const middleMaxFn = safeCompile(middleMaxExpr);

  if (!zFn || !middleMinFn || !middleMaxFn) return null;

  const xGrid: number[][] = [];
  const yGrid: number[][] = [];
  const zGrid: number[][] = [];

  for (let j = 0; j < n; j++) {
    const v = j / (n - 1);
    const xRow: number[] = [];
    const yRow: number[] = [];
    const zRow: number[] = [];

    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      const outerVal = outerMin + u * (outerMax - outerMin);
      
      const middleMinVal = evalNumber(middleMinFn, { [outerVar]: outerVal }) ?? 0;
      const middleMaxVal = evalNumber(middleMaxFn, { [outerVar]: outerVal }) ?? 0;
      const middleVal = middleMinVal + v * (middleMaxVal - middleMinVal);

      const innerVal = evalNumber(zFn, { [outerVar]: outerVal, [middleVar]: middleVal }) ?? 0;

      // Map values to actual x, y, z coordinate axes
      const coords: Record<string, number> = {
        [outerVar]: outerVal,
        [middleVar]: middleVal,
        [innerVar]: innerVal,
      };

      xRow.push(coords['x'] ?? 0);
      yRow.push(coords['y'] ?? 0);
      zRow.push(coords['z'] ?? 0);
    }
    xGrid.push(xRow);
    yGrid.push(yRow);
    zGrid.push(zRow);
  }

  return { x: xGrid, y: yGrid, z: zGrid };
}

// ─── Samplers for lateral boundary walls ──────────────────────────────────────
function sampleWallAlongMiddle(
  floorExpr: string,
  ceilExpr: string,
  outerMin: number,
  outerMax: number,
  middleMinExpr: string,
  middleMaxExpr: string,
  outerVar: string,
  middleVar: string,
  innerVar: string,
  isMinBoundary: boolean, // true if middleVar = middleMinExpr, false if middleVar = middleMaxExpr
  n = 30
): { x: number[][], y: number[][], z: number[][] } | null {
  const floorFn = safeCompile(floorExpr);
  const ceilFn = safeCompile(ceilExpr);
  const middleMinFn = safeCompile(middleMinExpr);
  const middleMaxFn = safeCompile(middleMaxExpr);

  if (!floorFn || !ceilFn || !middleMinFn || !middleMaxFn) return null;

  const xGrid: number[][] = [];
  const yGrid: number[][] = [];
  const zGrid: number[][] = [];

  for (let j = 0; j < n; j++) {
    const v = j / (n - 1); // height parameter
    const xRow: number[] = [];
    const yRow: number[] = [];
    const zRow: number[] = [];

    for (let i = 0; i < n; i++) {
      const u = i / (n - 1); // boundary parameter
      const outerVal = outerMin + u * (outerMax - outerMin);
      
      const middleMinVal = evalNumber(middleMinFn, { [outerVar]: outerVal }) ?? 0;
      const middleMaxVal = evalNumber(middleMaxFn, { [outerVar]: outerVal }) ?? 0;
      const middleVal = isMinBoundary ? middleMinVal : middleMaxVal;

      const context = { [outerVar]: outerVal, [middleVar]: middleVal };
      const zBottom = evalNumber(floorFn, context) ?? 0;
      const zTop = evalNumber(ceilFn, context) ?? 0;
      const innerVal = zBottom + v * (zTop - zBottom);

      const coords: Record<string, number> = {
        [outerVar]: outerVal,
        [middleVar]: middleVal,
        [innerVar]: innerVal,
      };

      xRow.push(coords['x'] ?? 0);
      yRow.push(coords['y'] ?? 0);
      zRow.push(coords['z'] ?? 0);
    }
    xGrid.push(xRow);
    yGrid.push(yRow);
    zGrid.push(zRow);
  }

  return { x: xGrid, y: yGrid, z: zGrid };
}

function sampleWallAlongOuter(
  floorExpr: string,
  ceilExpr: string,
  outerMin: number,
  outerMax: number,
  middleMinExpr: string,
  middleMaxExpr: string,
  outerVar: string,
  middleVar: string,
  innerVar: string,
  isMinBoundary: boolean, // true if outerVar = outerMin, false if outerVar = outerMax
  n = 30
): { x: number[][], y: number[][], z: number[][] } | null {
  const floorFn = safeCompile(floorExpr);
  const ceilFn = safeCompile(ceilExpr);
  const middleMinFn = safeCompile(middleMinExpr);
  const middleMaxFn = safeCompile(middleMaxExpr);

  if (!floorFn || !ceilFn || !middleMinFn || !middleMaxFn) return null;

  const xGrid: number[][] = [];
  const yGrid: number[][] = [];
  const zGrid: number[][] = [];

  for (let j = 0; j < n; j++) {
    const v = j / (n - 1); // height parameter
    const xRow: number[] = [];
    const yRow: number[] = [];
    const zRow: number[] = [];

    for (let i = 0; i < n; i++) {
      const u = i / (n - 1); // boundary parameter
      const outerVal = isMinBoundary ? outerMin : outerMax;
      
      const middleMinVal = evalNumber(middleMinFn, { [outerVar]: outerVal }) ?? 0;
      const middleMaxVal = evalNumber(middleMaxFn, { [outerVar]: outerVal }) ?? 0;
      const middleVal = middleMinVal + u * (middleMaxVal - middleMinVal);

      const context = { [outerVar]: outerVal, [middleVar]: middleVal };
      const zBottom = evalNumber(floorFn, context) ?? 0;
      const zTop = evalNumber(ceilFn, context) ?? 0;
      const innerVal = zBottom + v * (zTop - zBottom);

      const coords: Record<string, number> = {
        [outerVar]: outerVal,
        [middleVar]: middleVal,
        [innerVar]: innerVal,
      };

      xRow.push(coords['x'] ?? 0);
      yRow.push(coords['y'] ?? 0);
      zRow.push(coords['z'] ?? 0);
    }
    xGrid.push(xRow);
    yGrid.push(yRow);
    zGrid.push(zRow);
  }

  return { x: xGrid, y: yGrid, z: zGrid };
}

// ─── Guide Step Card ──────────────────────────────────────────────────────────
interface GuideCardProps {
  step: number;
  icon: ReactNode;
  color: string;
  title: string;
  content: string;
  field: ReactNode;
}
function GuideCard({ step, icon, color, title, content, field }: GuideCardProps) {
  return (
    <div style={{
      border: `1.5px solid ${color}33`,
      borderRadius: '10px',
      background: `${color}08`,
      padding: '12px',
      marginBottom: '10px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <div style={{
          width: '22px', height: '22px', borderRadius: '50%',
          background: color, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '11px', fontWeight: 800, flexShrink: 0,
        }}>{step}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ color }}>{icon}</span>
          <span style={{ fontSize: '12px', fontWeight: 700, color: '#1e293b' }}>{title}</span>
        </div>
      </div>
      <p style={{ fontSize: '11px', color: '#64748b', margin: '0 0 8px', lineHeight: 1.5 }}>{content}</p>
      {field}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function IntegralsModule() {
  const plotRef = useRef<HTMLDivElement>(null);
  const zoomContainerRef = useRef<HTMLDivElement>(null);
  const activeInputRef = useRef<HTMLInputElement | null>(null);
  const [activeInput, setActiveInput] = useState<'f' | 'zMin' | 'zMax' | 'yMin' | 'yMax' | 'xMin' | 'xMax'>('f');

  const [mode, setMode] = useState<IntegralMode>('doble');
  const [order, setOrder] = useState<string>('dydx');
  const [fExpr, setFExpr] = useState('x * y');
  const [xMin, setXMin] = useState('0');
  const [xMax, setXMax] = useState('1');
  const [yMinExpr, setYMinExpr] = useState('0');
  const [yMaxExpr, setYMaxExpr] = useState('1');
  const [zMinExpr, setZMinExpr] = useState('0');
  const [zMaxExpr, setZMaxExpr] = useState('1');
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);
  const [resultText, setResultText] = useState<string | null>(null);
  const [resultLatex, setResultLatex] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [source, setSource] = useState<'sympy' | 'fallback' | 'mathjs'>('mathjs');
  const [backendOk, setBackendOk] = useState<boolean | null>(null);
  const [computing, setComputing] = useState(false);

  // Guide state
  const [guideOpen, setGuideOpen] = useState(true);
  const [activePreset, setActivePreset] = useState<number | null>(null);

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

  useEffect(() => {
    isBackendAvailable().then(ok => setBackendOk(ok));
  }, []);

  // Load a preset
  const loadPreset = (i: number) => {
    const p = PRESETS[i];
    setMode(p.mode);
    setFExpr(p.f);
    setXMin(String(p.xMin)); setXMax(String(p.xMax));
    setYMinExpr(p.yMin); setYMaxExpr(p.yMax);
    setZMinExpr(p.zMin); setZMaxExpr(p.zMax);
    setActivePreset(i);
    setSteps([]); setResultText(null); setResultLatex(null); setErrorText(null);
    cameraRef.current = {
      projection: { type: 'perspective' as const },
      eye: { x: 1.5, y: 1.5, z: 1.0 },
      center: { x: 0, y: 0, z: 0 },
      up: { x: 0, y: 0, z: 1 }
    };
  };

  const compute = async () => {
    setComputing(true);
    setErrorText(null); setResultText(null); setResultLatex(null); setSteps([]);

    const xMinVal = evalNumber(safeCompile(xMin), {}) ?? 0;
    const xMaxVal = evalNumber(safeCompile(xMax), {}) ?? 1;

    if (mode === 'doble') {
      const sym = await symbolicDoubleIntegral(fExpr, xMin, xMax, yMinExpr, yMaxExpr, order);
      if (sym && sym.value !== null && sym.value !== undefined) {
        setSteps(sym.steps.map(s => ({ title: s.title, content: s.content, latex: s.latex })));
        setResultText(`∬_D f dA = ${sym.value?.toFixed(10)}`);
        setResultLatex(sym.symbolic ? `\\iint_D f\\,dA = ${sym.symbolic}` : null);
        setSource(sym.error ? 'fallback' : 'sympy');
        setErrorText(sym.error ?? null);
        setComputing(false);
        return;
      }
      const r = computeDoubleIntegral(fExpr, { xMin: xMinVal, xMax: xMaxVal, yMinExpr, yMaxExpr, order: order as 'dydx' | 'dxdy' });
      setSteps(r.steps);
      setResultText(r.value !== null ? `∬_D f dA ≈ ${r.value.toFixed(10)}` : null);
      setResultLatex(r.value !== null ? `\\iint_D f\\,dA \\approx ${r.value.toFixed(8)}` : null);
      setSource('mathjs');
      setErrorText(r.error);
    } else {
      const sym = await symbolicTripleIntegral(fExpr, xMin, xMax, yMinExpr, yMaxExpr, zMinExpr, zMaxExpr, order);
      if (sym && sym.value !== null && sym.value !== undefined) {
        setSteps(sym.steps.map(s => ({ title: s.title, content: s.content, latex: s.latex })));
        setResultText(`∭_E f dV = ${sym.value?.toFixed(10)}`);
        setResultLatex(sym.symbolic ? `\\iiint_E f\\,dV = ${sym.symbolic}` : null);
        setSource(sym.error ? 'fallback' : 'sympy');
        setErrorText(sym.error ?? null);
        setComputing(false);
        return;
      }
      const r = computeTripleIntegral(fExpr, { xMin: xMinVal, xMax: xMaxVal, yMinExpr, yMaxExpr, zMinExpr, zMaxExpr, order: order as any });
      setSteps(r.steps);
      setResultText(r.value !== null ? `∭_E f dV ≈ ${r.value.toFixed(10)}` : null);
      setResultLatex(r.value !== null ? `\\iiint_E f\\,dV \\approx ${r.value.toFixed(8)}` : null);
      setSource('mathjs');
      setErrorText(r.error);
    }
    setComputing(false);
  };

  // Colors for the three guide steps
  const C_TECHO = '#7c3aed';
  const C_PISO  = '#0891b2';
  const C_PARED = '#059669';

  // Visualize region and surfaces in 3D
  useEffect(() => {
    const el = plotRef.current;
    if (!el) return;

    const isTriple = mode === 'triple';
    const innerVar = isTriple ? order[1] : (order === 'dydx' ? 'y' : 'x');
    const middleVar = isTriple ? order[3] : (order === 'dydx' ? 'y' : 'x');
    const outerVar = isTriple ? order[5] : (order === 'dydx' ? 'x' : 'y');

    const xMinVal = evalNumber(safeCompile(xMin), {}) ?? 0;
    const xMaxVal = evalNumber(safeCompile(xMax), {}) ?? 1;

    let computedXMin = xMinVal;
    let computedXMax = xMaxVal;
    let computedYMin = -3;
    let computedYMax = 3;
    let computedZMin = -3;
    let computedZMax = 3;

    let xMinSampled = Infinity;
    let xMaxSampled = -Infinity;
    let yMinSampled = Infinity;
    let yMaxSampled = -Infinity;
    let zMinSampled = Infinity;
    let zMaxSampled = -Infinity;

    const updateBounds = (grid: { x: number[][], y: number[][], z: number[][] } | null) => {
      if (!grid) return;
      for (let i = 0; i < grid.x.length; i++) {
        for (let j = 0; j < grid.x[i].length; j++) {
          const vx = grid.x[i][j];
          const vy = grid.y[i][j];
          const vz = grid.z[i][j];
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
      }
    };

    let s: any = null;
    let base: any = null;
    let techo: any = null;
    let piso: any = null;

    if (mode === 'doble') {
      s = sampleParametricSurface(fExpr, xMinVal, xMaxVal, yMinExpr, yMaxExpr, outerVar, middleVar, 'z', 40);
      base = sampleParametricSurface('0', xMinVal, xMaxVal, yMinExpr, yMaxExpr, outerVar, middleVar, 'z', 30);
      updateBounds(s);
      updateBounds(base);
    } else {
      techo = sampleParametricSurface(zMaxExpr, xMinVal, xMaxVal, yMinExpr, yMaxExpr, outerVar, middleVar, innerVar, 40);
      piso = sampleParametricSurface(zMinExpr, xMinVal, xMaxVal, yMinExpr, yMaxExpr, outerVar, middleVar, innerVar, 40);
      updateBounds(techo);
      updateBounds(piso);
    }

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

    const traces: Plotly.Data[] = [];

    if (mode === 'doble') {
      if (s) {
        const ns = normalizeGrid(s, viewDomain);
        traces.push({
          type: 'surface',
          x: ns.x,
          y: ns.y,
          z: ns.z,
          name: `f(x,y) = ${fExpr}`,
          colorscale: 'Blues',
          showscale: false,
          opacity: 0.85,
          lighting: { ambient: 0.8, diffuse: 0.9 },
          hovertemplate: 'x=%{x:.2f} y=%{y:.2f} z=%{z:.3f}<extra></extra>',
          contours: {
            x: { show: true, start: -1, end: 1, size: 0.05, color: '#ffffff', width: 1.2, highlight: false },
            y: { show: true, start: -1, end: 1, size: 0.05, color: '#ffffff', width: 1.2, highlight: false },
          },
        } as Plotly.Data);
      }

      if (base) {
        const nbase = normalizeGrid(base, viewDomain);
        traces.push({
          type: 'surface',
          x: nbase.x,
          y: nbase.y,
          z: nbase.z,
          name: 'Región D (z=0)',
          colorscale: [[0, 'rgba(5, 150, 105, 0.45)'], [1, 'rgba(5, 150, 105, 0.45)']],
          showscale: false,
          opacity: 0.4,
          lighting: { ambient: 0.9 },
          hovertemplate: 'x=%{x:.2f} y=%{y:.2f}<extra>Región D</extra>',
          contours: {
            x: { show: true, start: -1, end: 1, size: 0.05, color: '#ffffff', width: 1.2, highlight: false },
            y: { show: true, start: -1, end: 1, size: 0.05, color: '#ffffff', width: 1.2, highlight: false },
          },
        } as Plotly.Data);
      }
    } else {
      if (techo) {
        const ntecho = normalizeGrid(techo, viewDomain);
        traces.push({
          type: 'surface',
          x: ntecho.x,
          y: ntecho.y,
          z: ntecho.z,
          name: `Techo: ${innerVar} = ${zMaxExpr}`,
          colorscale: [[0, C_TECHO], [1, C_TECHO]],
          showscale: false,
          opacity: 0.8,
          lighting: { ambient: 0.7, diffuse: 0.8 },
          hovertemplate: 'x=%{x:.2f} y=%{y:.2f} z=%{z:.3f}<extra>Techo</extra>',
          contours: {
            x: { show: true, start: -1, end: 1, size: 0.05, color: '#ffffff', width: 1.2, highlight: false },
            y: { show: true, start: -1, end: 1, size: 0.05, color: '#ffffff', width: 1.2, highlight: false },
          },
        } as Plotly.Data);
      }

      if (piso) {
        const npiso = normalizeGrid(piso, viewDomain);
        traces.push({
          type: 'surface',
          x: npiso.x,
          y: npiso.y,
          z: npiso.z,
          name: `Piso: ${innerVar} = ${zMinExpr}`,
          colorscale: [[0, C_PISO], [1, C_PISO]],
          showscale: false,
          opacity: 0.6,
          lighting: { ambient: 0.7, diffuse: 0.8 },
          hovertemplate: 'x=%{x:.2f} y=%{y:.2f} z=%{z:.3f}<extra>Piso</extra>',
          contours: {
            x: { show: true, start: -1, end: 1, size: 0.05, color: '#ffffff', width: 1.2, highlight: false },
            y: { show: true, start: -1, end: 1, size: 0.05, color: '#ffffff', width: 1.2, highlight: false },
          },
        } as Plotly.Data);
      }
    }

    // ─── Generate and Add Bounding Lateral Walls ─────────────────────────────────
    const floorExpr = mode === 'doble' ? '0' : zMinExpr;
    const ceilExpr = mode === 'doble' ? fExpr : zMaxExpr;
    const wallInnerVar = mode === 'doble' ? 'z' : innerVar;

    const wallMinMiddle = sampleWallAlongMiddle(
      floorExpr,
      ceilExpr,
      xMinVal,
      xMaxVal,
      yMinExpr,
      yMaxExpr,
      outerVar,
      middleVar,
      wallInnerVar,
      true,
      30
    );
    const wallMaxMiddle = sampleWallAlongMiddle(
      floorExpr,
      ceilExpr,
      xMinVal,
      xMaxVal,
      yMinExpr,
      yMaxExpr,
      outerVar,
      middleVar,
      wallInnerVar,
      false,
      30
    );
    const wallMinOuter = sampleWallAlongOuter(
      floorExpr,
      ceilExpr,
      xMinVal,
      xMaxVal,
      yMinExpr,
      yMaxExpr,
      outerVar,
      middleVar,
      wallInnerVar,
      true,
      30
    );
    const wallMaxOuter = sampleWallAlongOuter(
      floorExpr,
      ceilExpr,
      xMinVal,
      xMaxVal,
      yMinExpr,
      yMaxExpr,
      outerVar,
      middleVar,
      wallInnerVar,
      false,
      30
    );

    const wallTraces = [
      { grid: wallMinMiddle, name: `Pared: ${middleVar} = ${yMinExpr}` },
      { grid: wallMaxMiddle, name: `Pared: ${middleVar} = ${yMaxExpr}` },
      { grid: wallMinOuter, name: `Pared: ${outerVar} = ${xMin}` },
      { grid: wallMaxOuter, name: `Pared: ${outerVar} = ${xMax}` },
    ];

    wallTraces.forEach(({ grid, name }) => {
      if (grid) {
        const ngrid = normalizeGrid(grid, viewDomain);
        traces.push({
          type: 'surface',
          x: ngrid.x,
          y: ngrid.y,
          z: ngrid.z,
          name: name,
          colorscale: [[0, C_PARED], [1, C_PARED]],
          showscale: false,
          opacity: 0.35,
          lighting: { ambient: 0.8, diffuse: 0.8 },
          hovertemplate: 'x=%{x:.2f} y=%{y:.2f} z=%{z:.3f}<extra>Pared</extra>',
          contours: {
            x: { show: false },
            y: { show: false },
          },
        } as Plotly.Data);
      }
    });

    const titleText = mode === 'doble' ? `f(x,y) = ${fExpr}` : `Sólido E: ${innerVar} entre ${zMinExpr} y ${zMaxExpr}`;

    const onRelayout = (ev: Plotly.PlotRelayoutEvent) => {
      const cam = (ev as Record<string, unknown>)['scene.camera'];
      if (cam && typeof cam === 'object') {
        cameraRef.current = cam as any;
      }
    };

    const extras = buildStaticSceneExtras(viewDomain);
    const allTraces = [...extras.traces, ...traces];
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
  }, [fExpr, mode, xMin, xMax, yMinExpr, yMaxExpr, zMinExpr, zMaxExpr, viewDomain, axisTicks, viewport]);

  return (
    <div className="module-layout">
      {/* ── Left Panel ── */}
      <div className="module-sidebar">
        <h2 className="module-title">
          <Sigma size={18} /> Integrales Múltiples
        </h2>

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
          {backendOk === null ? 'Verificando backend…' : backendOk ? 'SymPy backend activo' : 'Modo numérico (math.js)'}
        </div>

        {/* Mode selector */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          {(['doble', 'triple'] as IntegralMode[]).map(m => (
            <button key={m} onClick={() => {
              setMode(m);
              setOrder(m === 'doble' ? 'dydx' : 'dzdydx');
            }} style={{
              flex: 1, padding: '8px', borderRadius: '8px',
              border: `2px solid ${mode === m ? '#7c3aed' : '#e2e8f0'}`,
              background: mode === m ? '#7c3aed' : '#ffffff',
              color: mode === m ? '#ffffff' : '#475569',
              fontWeight: 700, fontSize: '13px', cursor: 'pointer', transition: 'all 0.15s',
            }}>
              {m === 'doble' ? '∬ Doble' : '∭ Triple'}
            </button>
          ))}
        </div>

        {/* Orden de integración */}
        <div className="field-group" style={{ marginBottom: '16px' }}>
          <label className="field-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Sigma size={13} color="#7c3aed" /> Orden de integración
          </label>
          <select
            value={order}
            onChange={e => setOrder(e.target.value)}
            className="math-input"
            style={{
              width: '100%',
              background: '#ffffff',
              cursor: 'pointer',
              fontWeight: 600,
              color: '#334155',
              padding: '6px 10px',
              borderRadius: '8px',
              border: '1.5px solid #cbd5e1',
            }}
          >
            {mode === 'doble' ? (
              <>
                <option value="dydx">dy dx (Tipo I)</option>
                <option value="dxdy">dx dy (Tipo II)</option>
              </>
            ) : (
              <>
                <option value="dzdydx">dz dy dx</option>
                <option value="dzdxdy">dz dx dy</option>
                <option value="dydzdx">dy dz dx</option>
                <option value="dydxdz">dy dx dz</option>
                <option value="dxdzdy">dx dz dy</option>
                <option value="dxdydz">dx dy dz</option>
              </>
            )}
          </select>
        </div>

        {/* ── Integrando f ── */}
        <div className="field-group">
          <label className="field-label">Integrando f({mode === 'doble' ? 'x,y' : 'x,y,z'})</label>
          <div style={{ position: 'relative' }}>
            <input
              ref={el => {
                if (activeInput === 'f') {
                  activeInputRef.current = el;
                }
              }}
              type="text"
              value={fExpr}
              onChange={e => setFExpr(e.target.value)}
              onFocus={() => { setActiveInput('f'); setShowKeyboard(true); }}
              className="math-input"
              style={{ paddingRight: '36px' }}
              placeholder="ej. 1 (para volumen puro)"
            />
            <button
              onClick={() => setShowKeyboard(v => !v)}
              style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#7c3aed', padding: 0 }}
            >
              <Keyboard size={15} />
            </button>
          </div>
        </div>

        {/* ── Límites de Integración (Siempre Visibles) ── */}
        {(() => {
          const isTriple = mode === 'triple';
          const innerVar = isTriple ? order[1] : (order === 'dydx' ? 'y' : 'x');
          const middleVar = isTriple ? order[3] : null;
          const outerVar = isTriple ? order[5] : (order === 'dydx' ? 'x' : 'y');

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '13px', fontWeight: 800, color: '#334155', margin: '4px 0 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Layers size={14} color="#7c3aed" /> Límites de Integración
              </h3>

              {isTriple && (
                <div className="field-group" style={{ margin: 0 }}>
                  <label className="field-label" style={{ color: C_TECHO }}>
                    Límites en {innerVar} (Interna - puede usar {outerVar} y {middleVar})
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                    <div>
                      <label style={{ fontSize: '11px', color: '#64748b' }}>{innerVar} mín</label>
                      <input
                        ref={el => {
                          if (activeInput === 'zMin') {
                            activeInputRef.current = el;
                          }
                        }}
                        type="text"
                        value={zMinExpr}
                        onChange={e => setZMinExpr(e.target.value)}
                        onFocus={() => { setActiveInput('zMin'); setShowKeyboard(true); }}
                        className="math-input"
                        placeholder="ej. 0"
                        style={{ borderColor: `${C_PISO}44`, fontSize: '12px' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', color: '#64748b' }}>{innerVar} máx</label>
                      <input
                        ref={el => {
                          if (activeInput === 'zMax') {
                            activeInputRef.current = el;
                          }
                        }}
                        type="text"
                        value={zMaxExpr}
                        onChange={e => setZMaxExpr(e.target.value)}
                        onFocus={() => { setActiveInput('zMax'); setShowKeyboard(true); }}
                        className="math-input"
                        placeholder={`ej. 4 - ${outerVar}^2 - ${middleVar}^2`}
                        style={{ borderColor: `${C_TECHO}44`, fontSize: '12px' }}
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="field-group" style={{ margin: 0 }}>
                <label className="field-label" style={{ color: C_PARED }}>
                  Límites en {isTriple ? middleVar : innerVar} ({isTriple ? 'Media' : 'Interna'} - puede usar {outerVar})
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                  <div>
                    <label style={{ fontSize: '11px', color: '#64748b' }}>{isTriple ? middleVar : innerVar} mín</label>
                    <input
                      ref={el => {
                        if (activeInput === 'yMin') {
                          activeInputRef.current = el;
                        }
                      }}
                      type="text"
                      value={yMinExpr}
                      onChange={e => setYMinExpr(e.target.value)}
                      onFocus={() => { setActiveInput('yMin'); setShowKeyboard(true); }}
                      className="math-input"
                      placeholder="ej. 0"
                      style={{ borderColor: `${C_PARED}44`, fontSize: '12px' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', color: '#64748b' }}>{isTriple ? middleVar : innerVar} máx</label>
                    <input
                      ref={el => {
                        if (activeInput === 'yMax') {
                          activeInputRef.current = el;
                        }
                      }}
                      type="text"
                      value={yMaxExpr}
                      onChange={e => setYMaxExpr(e.target.value)}
                      onFocus={() => { setActiveInput('yMax'); setShowKeyboard(true); }}
                      className="math-input"
                      placeholder={`ej. sqrt(1 - ${outerVar}^2)`}
                      style={{ borderColor: `${C_PARED}44`, fontSize: '12px' }}
                    />
                  </div>
                </div>
              </div>

              <div className="field-group" style={{ margin: 0 }}>
                <label className="field-label" style={{ color: '#475569' }}>
                  Límites en {outerVar} (Externa - constantes)
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                  <div>
                    <label style={{ fontSize: '11px', color: '#64748b' }}>{outerVar} mín</label>
                    <input
                      ref={el => {
                        if (activeInput === 'xMin') {
                          activeInputRef.current = el;
                        }
                      }}
                      type="text"
                      value={xMin}
                      onChange={e => setXMin(e.target.value)}
                      onFocus={() => { setActiveInput('xMin'); setShowKeyboard(true); }}
                      className="math-input"
                      style={{ fontSize: '12px' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', color: '#64748b' }}>{outerVar} máx</label>
                    <input
                      ref={el => {
                        if (activeInput === 'xMax') {
                          activeInputRef.current = el;
                        }
                      }}
                      type="text"
                      value={xMax}
                      onChange={e => setXMax(e.target.value)}
                      onFocus={() => { setActiveInput('xMax'); setShowKeyboard(true); }}
                      className="math-input"
                      style={{ fontSize: '12px' }}
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Math Keyboard Container */}
        {showKeyboard && (
          <div style={{ marginBottom: '16px' }}>
            <MathKeyboard
              inputRef={activeInputRef}
              value={
                activeInput === 'f' ? fExpr :
                activeInput === 'zMin' ? zMinExpr :
                activeInput === 'zMax' ? zMaxExpr :
                activeInput === 'yMin' ? yMinExpr :
                activeInput === 'yMax' ? yMaxExpr :
                activeInput === 'xMin' ? xMin :
                xMax
              }
              onChange={val => {
                if (activeInput === 'f') setFExpr(val);
                else if (activeInput === 'zMin') setZMinExpr(val);
                else if (activeInput === 'zMax') setZMaxExpr(val);
                else if (activeInput === 'yMin') setYMinExpr(val);
                else if (activeInput === 'yMax') setYMaxExpr(val);
                else if (activeInput === 'xMin') setXMin(val);
                else if (activeInput === 'xMax') setXMax(val);
              }}
              onEnter={() => setShowKeyboard(false)}
            />
          </div>
        )}

        {/* ── Guía Didáctica (Fines Educativos) ── */}
        <div style={{
          border: '1.5px solid #e2e8f0',
          borderRadius: '12px',
          marginBottom: '16px',
          overflow: 'hidden',
        }}>
          {/* Header accordion */}
          <button
            onClick={() => setGuideOpen(v => !v)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: '8px',
              padding: '10px 12px', background: guideOpen ? '#f5f3ff' : '#f8fafc',
              border: 'none', cursor: 'pointer',
              borderBottom: guideOpen ? '1px solid #e2e8f0' : 'none',
              transition: 'background 0.15s',
            }}
          >
            <BookOpen size={14} color="#7c3aed" />
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#7c3aed', flex: 1, textAlign: 'left' }}>
              Estrategia: Techo · Piso · Paredes
            </span>
            {guideOpen ? <ChevronDown size={14} color="#7c3aed" /> : <ChevronRight size={14} color="#7c3aed" />}
          </button>

          {guideOpen && (
            <div style={{ padding: '12px' }}>
              {/* Intro */}
              <p style={{ fontSize: '11px', color: '#64748b', margin: '0 0 12px', lineHeight: 1.6 }}>
                Para plantear una integral triple, identifica <strong>quién es el Techo, quién es el Piso y cuáles son las Paredes</strong> del sólido E.
              </p>

              {/* Step 1: Techo */}
              <GuideCard
                step={1} color={C_TECHO}
                icon={<Layers size={13} />}
                title="TECHO — límite superior de z"
                content="La superficie que está ARRIBA del sólido. Escríbela como z = f(x,y)."
                field={
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', background: `${C_TECHO}11`, padding: '6px 10px', borderRadius: '6px', border: `1.5px solid ${C_TECHO}22` }}>
                    <span style={{ fontWeight: 700, color: C_TECHO }}>z máx =</span>
                    <code style={{ fontFamily: 'JetBrains Mono, monospace', color: '#1e293b' }}>{zMaxExpr || '—'}</code>
                  </div>
                }
              />

              {/* Step 2: Piso */}
              <GuideCard
                step={2} color={C_PISO}
                icon={<Target size={13} />}
                title="PISO — límite inferior de z"
                content="La superficie que está ABAJO del sólido. Puede ser z = 0 u otra función."
                field={
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', background: `${C_PISO}11`, padding: '6px 10px', borderRadius: '6px', border: `1.5px solid ${C_PISO}22` }}>
                    <span style={{ fontWeight: 700, color: C_PISO }}>z mín =</span>
                    <code style={{ fontFamily: 'JetBrains Mono, monospace', color: '#1e293b' }}>{zMinExpr || '—'}</code>
                  </div>
                }
              />

              {/* Step 3: Paredes / Sombra D */}
              <GuideCard
                step={3} color={C_PARED}
                icon={<Box size={13} />}
                title="PAREDES — sombra D en el plano xy"
                content='Aplasta el sólido desde arriba: ¿qué forma tiene la "sombra"? Esa región D define los límites de y (puede depender de x) y los límites de x.'
                field={
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px', background: `${C_PARED}11`, padding: '8px 10px', borderRadius: '6px', border: `1.5px solid ${C_PARED}22` }}>
                    <div>
                      <span style={{ fontWeight: 700, color: C_PARED }}>x ∈</span>{' '}
                      <code style={{ fontFamily: 'JetBrains Mono, monospace', color: '#1e293b' }}>[{xMin}, {xMax}]</code>
                    </div>
                    <div>
                      <span style={{ fontWeight: 700, color: C_PARED }}>y ∈</span>{' '}
                      <code style={{ fontFamily: 'JetBrains Mono, monospace', color: '#1e293b' }}>[{yMinExpr || '—'}, {yMaxExpr || '—'}]</code>
                    </div>
                  </div>
                }
              />

              {/* Hint box */}
              <div style={{
                background: 'linear-gradient(135deg, #fdf4ff, #f0f9ff)',
                border: '1px solid #e9d5ff',
                borderRadius: '8px', padding: '8px 10px',
                fontSize: '11px', color: '#6b21a8', lineHeight: 1.5,
              }}>
                💡 <strong>Tip:</strong> Si la "pared" es un cilindro <code>x²+y²=r²</code>, los límites de y son <code>±√(r²−x²)</code> y x va de <code>−r</code> a <code>r</code>. ¡O usa coordenadas cilíndricas para más facilidad!
              </div>
            </div>
          )}
        </div>

        {/* ── Preset Examples ── */}
        <div style={{ marginBottom: '16px' }}>
          <label className="field-label">Ejemplos de clase</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {PRESETS.map((p, i) => (
              <button
                key={i}
                onClick={() => loadPreset(i)}
                style={{
                  width: '100%', textAlign: 'left', padding: '9px 12px',
                  borderRadius: '8px', cursor: 'pointer', transition: 'all 0.15s',
                  border: `1.5px solid ${activePreset === i ? '#7c3aed' : '#e2e8f0'}`,
                  background: activePreset === i ? '#f5f3ff' : '#ffffff',
                  color: activePreset === i ? '#7c3aed' : '#475569',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '16px' }}>{p.icon}</span>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 700 }}>{p.label}</div>
                    <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '1px' }}>{p.description}</div>
                  </div>
                </div>
                {activePreset === i && (
                  <div style={{
                    marginTop: '8px', padding: '8px', borderRadius: '6px',
                    background: '#ede9fe', fontSize: '10px', color: '#6d28d9',
                    lineHeight: 1.6,
                  }}>
                    <div>🏔 <strong>Techo:</strong> {p.techo}</div>
                    <div>🧱 <strong>Piso:</strong> {p.piso}</div>
                    <div>🚧 <strong>Paredes (D):</strong> {p.pared}</div>
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        <button onClick={compute} disabled={computing} className="btn-compute" style={{ opacity: computing ? 0.7 : 1 }}>
          {computing ? 'Calculando…' : 'Calcular Integral'}
        </button>

        <div style={{ marginTop: '16px' }}>
          <StepPanel
            steps={steps}
            result={resultText}
            resultLatex={resultLatex ?? undefined}
            error={errorText}
            source={source}
            title={mode === 'doble' ? 'Integral Doble — Pasos' : 'Integral Triple — Pasos'}
          />
        </div>
      </div>

      {/* ── Right: Visualization ── */}
      <div className="module-viewer" style={{ position: 'relative' }} ref={zoomContainerRef}>
        <div ref={plotRef} style={{ width: '100%', height: '100%' }} />
        <PlotlyZoomControls viewDomain={viewDomain} onZoomIn={zoomIn} onZoomOut={zoomOut} onReset={resetZoomWithCamera} plotRef={plotRef} />

        {mode === 'triple' && (
          <div style={{
            position: 'absolute',
            top: '16px',
            right: '56px',
            zIndex: 10,
            background: 'rgba(255, 255, 255, 0.9)',
            backdropFilter: 'blur(8px)',
            border: '1px solid #e2e8f0',
            borderRadius: '12px',
            padding: '12px 16px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
            width: '260px',
            pointerEvents: 'auto',
          }}>
            <h3 style={{ color: '#1e293b', fontWeight: 800, margin: '0 0 8px 0', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Sigma size={14} color="#7c3aed" /> Límites del Sólido E
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {[
                { color: C_TECHO, label: 'Techo (z máx)', val: zMaxExpr },
                { color: C_PISO,  label: 'Piso (z mín)',  val: zMinExpr },
                { color: C_PARED, label: 'D: x',           val: `[${xMin}, ${xMax}]` },
                { color: C_PARED, label: 'D: y',           val: `[${yMinExpr}, ${yMaxExpr}]` },
              ].map(row => (
                <div key={row.label + row.val} style={{
                  fontSize: '11px',
                  padding: '4px 8px',
                  borderRadius: '6px',
                  background: `${row.color}0a`,
                  border: `1px solid ${row.color}22`,
                }}>
                  <span style={{ fontWeight: 700, color: row.color, marginRight: '4px' }}>{row.label}:</span>
                  <code style={{ fontFamily: 'JetBrains Mono, monospace', color: '#334155' }}>{row.val}</code>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
