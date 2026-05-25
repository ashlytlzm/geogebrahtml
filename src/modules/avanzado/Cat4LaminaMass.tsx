/**
 * Cat4LaminaMass.tsx — Category 4: Mass of a Lamina
 * Computes mass, moments, and center of mass for a lamina with density δ(x,y).
 * Visualizes the density field as a heatmap using Canvas 2D.
 */

import { useRef, useState, useCallback, useEffect } from 'react';
import { MathKeyboard } from '../../components/MathKeyboard';
import { StepPanel } from '../../components/StepPanel';
import { safeCompile, evalNumber } from '../../lib/mathEngine';
import { integrate1D } from '../../lib/numericalIntegration';
import { Keyboard } from 'lucide-react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

function KaTeX({ latex, display = false }: { latex: string; display?: boolean }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    try { katex.render(latex, ref.current, { displayMode: display, throwOnError: false, strict: false }); }
    catch { if (ref.current) ref.current.textContent = latex; }
  }, [latex, display]);
  return display
    ? <div ref={ref as React.RefObject<HTMLDivElement>} />
    : <span ref={ref as React.RefObject<HTMLSpanElement>} />;
}

// ─── Heatmap renderer ──────────────────────────────────────────────────────────
function renderHeatmap(
  canvas: HTMLCanvasElement,
  deltaExpr: string, y1Expr: string, y2Expr: string,
  xMin: number, xMax: number,
  cx_: number, cy_: number,
) {
  const ctx = canvas.getContext('2d')!;
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, W, H);

  const deltaFn = safeCompile(deltaExpr);
  const y1Fn   = safeCompile(y1Expr);
  const y2Fn   = safeCompile(y2Expr);
  if (!deltaFn || !y1Fn || !y2Fn) return;

  // Sample density to find range
  const N = 60;
  let maxD = 0;
  const vals: number[][] = [];
  for (let i = 0; i < N; i++) {
    const row: number[] = [];
    const x = xMin + (i / (N-1)) * (xMax - xMin);
    const yLo = evalNumber(y1Fn, { x }) ?? 0;
    const yHi = evalNumber(y2Fn, { x }) ?? 1;
    for (let j = 0; j < N; j++) {
      const y = yLo + (j / (N-1)) * (yHi - yLo);
      const d = Math.max(0, evalNumber(deltaFn, { x, y }) ?? 0);
      if (d > maxD) maxD = d;
      row.push(d);
    }
    vals.push(row);
  }
  if (maxD === 0) maxD = 1;

  // Global y range for pixel mapping
  let globalYMin = Infinity, globalYMax = -Infinity;
  for (let i = 0; i < N; i++) {
    const x = xMin + (i/(N-1))*(xMax-xMin);
    const yLo = evalNumber(y1Fn, { x }) ?? 0;
    const yHi = evalNumber(y2Fn, { x }) ?? 1;
    if (yLo < globalYMin) globalYMin = yLo;
    if (yHi > globalYMax) globalYMax = yHi;
  }

  const toPixX = (x: number) => ((x - xMin) / (xMax - xMin)) * W;
  const toPixY = (y: number) => H - ((y - globalYMin) / (globalYMax - globalYMin)) * H;

  // Draw heatmap columns
  for (let i = 0; i < N; i++) {
    const x = xMin + (i/(N-1))*(xMax-xMin);
    const yLo = evalNumber(y1Fn, { x }) ?? 0;
    const yHi = evalNumber(y2Fn, { x }) ?? 1;
    const px0 = toPixX(xMin + ((i-0.5)/(N-1))*(xMax-xMin));
    const px1 = toPixX(xMin + ((i+0.5)/(N-1))*(xMax-xMin));
    for (let j = 0; j < N; j++) {
      const y = yLo + (j/(N-1))*(yHi-yLo);
      const py0 = toPixY(yLo + ((j+0.5)/(N-1))*(yHi-yLo));
      const py1 = toPixY(yLo + ((j-0.5)/(N-1))*(yHi-yLo));
      const t = vals[i][j] / maxD;
      // Purple → teal gradient
      const r = Math.round(t * 45 + (1-t)*109);
      const g = Math.round(t * 212 + (1-t)*40);
      const b = Math.round(t * 191 + (1-t)*217);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(Math.min(px0,px1), Math.min(py0,py1), Math.abs(px1-px0)+1, Math.abs(py1-py0)+1);
    }
  }

  // Boundary curves
  ctx.strokeStyle = '#f1f5f9'; ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < N; i++) {
    const x = xMin + (i/(N-1))*(xMax-xMin);
    const y = evalNumber(y1Fn, { x }) ?? 0;
    const px = toPixX(x), py = toPixY(y);
    i===0 ? ctx.moveTo(px,py) : ctx.lineTo(px,py);
  }
  ctx.stroke();
  ctx.beginPath();
  for (let i = 0; i < N; i++) {
    const x = xMin + (i/(N-1))*(xMax-xMin);
    const y = evalNumber(y2Fn, { x }) ?? 1;
    const px = toPixX(x), py = toPixY(y);
    i===0 ? ctx.moveTo(px,py) : ctx.lineTo(px,py);
  }
  ctx.stroke();

  // Center of mass marker
  if (isFinite(cx_) && isFinite(cy_)) {
    const px = toPixX(cx_), py = toPixY(cy_);
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#fef3c7'; ctx.font = 'bold 10px Inter, Arial';
    ctx.fillText(`C̄(${cx_.toFixed(2)},${cy_.toFixed(2)})`, px+10, py-5);
  }

  // Axes labels
  ctx.fillStyle = '#94a3b8'; ctx.font = '10px Inter, Arial'; ctx.textAlign = 'left';
  ctx.fillText('δ(x,y) density', 6, 14);
  ctx.fillStyle = '#64748b'; ctx.textAlign = 'center';
  ctx.fillText('x', W/2, H-3);
}

export function Cat4LaminaMass() {
  const fRef = useRef<HTMLInputElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [deltaExpr, setDeltaExpr] = useState('1 + x^2 + y^2');
  const [y1Expr, setY1Expr]     = useState('0');
  const [y2Expr, setY2Expr]     = useState('sqrt(1 - x^2)');
  const [xMin, setXMin]         = useState(-1);
  const [xMax, setXMax]         = useState(1);
  const [showKbd, setShowKbd]   = useState(false);
  const [computeMom, setComputeMom] = useState(true);

  const [mass, setMass]   = useState<number | null>(null);
  const [Mx, setMx]       = useState<number | null>(null);
  const [My, setMy]       = useState<number | null>(null);
  const [xBar, setXBar]   = useState<number | null>(null);
  const [yBar, setYBar]   = useState<number | null>(null);
  const [steps, setSteps] = useState<{ title: string; content: string; latex?: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  const redraw = useCallback(() => {
    if (canvasRef.current) {
      renderHeatmap(canvasRef.current, deltaExpr, y1Expr, y2Expr, xMin, xMax, xBar ?? NaN, yBar ?? NaN);
    }
  }, [deltaExpr, y1Expr, y2Expr, xMin, xMax, xBar, yBar]);

  useEffect(() => { redraw(); }, [redraw]);

  const compute = useCallback(() => {
    setError(null);
    const N = 80;
    const allSteps: typeof steps = [];

    const deltaFn = safeCompile(deltaExpr);
    const y1Fn   = safeCompile(y1Expr);
    const y2Fn   = safeCompile(y2Expr);
    if (!deltaFn || !y1Fn || !y2Fn) { setError('Expresión inválida.'); return; }

    try {
      const innerMass = (x: number) => {
        const y1 = evalNumber(y1Fn, { x }) ?? 0;
        const y2 = evalNumber(y2Fn, { x }) ?? 1;
        return integrate1D((y: number) => Math.max(0, evalNumber(deltaFn, { x, y }) ?? 0), y1, y2, N);
      };
      const m = integrate1D(innerMass, xMin, xMax, N);
      setMass(m);
      allSteps.push({
        title: 'Masa de la lámina',
        content: `m = ∬_R δ(x,y) dA ≈ ${m.toFixed(8)}`,
        latex: `m = \\iint_R \\delta(x,y)\\,dA \\approx ${m.toFixed(6)}`,
      });

      if (computeMom && Math.abs(m) > 1e-12) {
        const innerMx = (x: number) => {
          const y1 = evalNumber(y1Fn, { x }) ?? 0;
          const y2 = evalNumber(y2Fn, { x }) ?? 1;
          return integrate1D((y: number) => y * Math.max(0, evalNumber(deltaFn, { x, y }) ?? 0), y1, y2, N);
        };
        const innerMy = (x: number) => {
          const y1 = evalNumber(y1Fn, { x }) ?? 0;
          const y2 = evalNumber(y2Fn, { x }) ?? 1;
          return integrate1D((y: number) => x * Math.max(0, evalNumber(deltaFn, { x, y }) ?? 0), y1, y2, N);
        };
        const mx = integrate1D(innerMx, xMin, xMax, N);
        const my = integrate1D(innerMy, xMin, xMax, N);
        const xb = my / m, yb = mx / m;
        setMx(mx); setMy(my); setXBar(xb); setYBar(yb);
        allSteps.push({
          title: 'Momentos',
          content: `M_x = ∬ y·δ dA ≈ ${mx.toFixed(6)}\nM_y = ∬ x·δ dA ≈ ${my.toFixed(6)}`,
          latex: `M_x \\approx ${mx.toFixed(4)},\\quad M_y \\approx ${my.toFixed(4)}`,
        });
        allSteps.push({
          title: 'Centro de masa',
          content: `(x̄, ȳ) = (M_y/m, M_x/m) ≈ (${xb.toFixed(6)}, ${yb.toFixed(6)})`,
          latex: `\\bar{x} = \\frac{M_y}{m} \\approx ${xb.toFixed(4)},\\quad \\bar{y} = \\frac{M_x}{m} \\approx ${yb.toFixed(4)}`,
        });
      }
      setSteps(allSteps);
    } catch (e) { setError(String(e)); }
  }, [deltaExpr, y1Expr, y2Expr, xMin, xMax, computeMom]);

  return (
    <div className="module-layout">
      <div className="module-sidebar">
        <h2 className="module-title" style={{ color: '#db2777' }}>⚖️ Masa de Lámina</h2>

        <div className="field-group">
          <label className="field-label">Densidad δ(x,y)</label>
          <div style={{ display:'flex', gap:6 }}>
            <input ref={fRef} type="text" className="math-input" value={deltaExpr}
              onChange={e => setDeltaExpr(e.target.value)} onFocus={() => setShowKbd(true)}
              style={{ borderColor:'#db2777' }}/>
            <button className="icon-btn" onClick={() => setShowKbd(v=>!v)}><Keyboard size={14}/></button>
          </div>
          {showKbd && <MathKeyboard inputRef={fRef} value={deltaExpr} onChange={setDeltaExpr} onEnter={() => setShowKbd(false)}/>}
        </div>

        <div className="field-group">
          <label className="field-label">Curvas límite y₁(x) ≤ y ≤ y₂(x)</label>
          <label style={{fontSize:11,color:'#64748b',display:'block',marginBottom:2}}>y₁(x) = (inferior)</label>
          <input type="text" className="math-input" value={y1Expr} onChange={e=>setY1Expr(e.target.value)} style={{marginBottom:6}}/>
          <label style={{fontSize:11,color:'#64748b',display:'block',marginBottom:2}}>y₂(x) = (superior)</label>
          <input type="text" className="math-input" value={y2Expr} onChange={e=>setY2Expr(e.target.value)}/>
        </div>

        <div className="field-group">
          <label className="field-label">Rango de x</label>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
            <div><label style={{fontSize:11,color:'#64748b'}}>x min</label><input type="number" step="any" value={xMin} onChange={e=>setXMin(+e.target.value||0)} className="number-input"/></div>
            <div><label style={{fontSize:11,color:'#64748b'}}>x max</label><input type="number" step="any" value={xMax} onChange={e=>setXMax(+e.target.value||1)} className="number-input"/></div>
          </div>
        </div>

        <div className="field-group" style={{ display:'flex', alignItems:'center', gap:10 }}>
          <input id="c4-mom" type="checkbox" checked={computeMom} onChange={e=>setComputeMom(e.target.checked)} style={{accentColor:'#db2777',width:15,height:15}}/>
          <label htmlFor="c4-mom" style={{fontSize:13,color:'#334155',fontWeight:600,cursor:'pointer'}}>Calcular momentos y centro de masa</label>
        </div>

        <button onClick={compute} className="btn-compute" style={{background:'linear-gradient(135deg,#db2777,#be185d)'}}>
          Calcular masa
        </button>

        {mass !== null && !error && (
          <div style={{ marginTop:14 }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
              {[
                { label:'Masa m', val:mass, latex:'m', color:'#db2777' },
                { label:'M_x', val:Mx, latex:'M_x', color:'#7c3aed' },
                { label:'M_y', val:My, latex:'M_y', color:'#2563eb' },
              ].filter(r=>r.val!==null).map(row => (
                <div key={row.label} style={{ padding:'10px', borderRadius:8, border:`1px solid ${row.color}44`, background:`${row.color}08`, textAlign:'center' }}>
                  <div style={{ fontSize:10, fontWeight:700, color:row.color, marginBottom:3, textTransform:'uppercase', letterSpacing:'0.06em' }}>{row.label}</div>
                  <div style={{ fontSize:13, fontWeight:700, color:'#1e293b', fontFamily:'monospace' }}>{(row.val!).toFixed(4)}</div>
                </div>
              ))}
              {xBar !== null && (
                <div style={{ gridColumn:'1/-1', padding:'10px', borderRadius:8, border:'1px solid #fbbf2444', background:'#fef3c7', textAlign:'center' }}>
                  <KaTeX latex={`\\bar{x} \\approx ${xBar.toFixed(4)},\\quad \\bar{y} \\approx ${yBar?.toFixed(4)}`} display />
                </div>
              )}
            </div>
          </div>
        )}

        <div style={{ marginTop:12 }}>
          <StepPanel steps={steps} result={mass!==null?`m ≈ ${mass.toFixed(6)}`:null} error={error} title="Pasos"/>
        </div>
      </div>

      {/* Heatmap */}
      <div className="module-viewer" style={{ background:'#0f172a', display:'flex', flexDirection:'column', alignItems:'stretch', justifyContent:'center', padding:12 }}>
        <canvas ref={canvasRef} width={500} height={450} style={{ width:'100%', height:'100%', borderRadius:10, display:'block', objectFit:'contain' }}/>
        <div style={{ textAlign:'center', marginTop:8, fontSize:11, color:'#64748b' }}>
          Mapa de densidad δ(x,y) · Punto amarillo = centro de masa
        </div>
      </div>
    </div>
  );
}
