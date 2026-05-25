/**
 * Cat3ChangeOfVariable.tsx — Category 3: Double Integral Change of Variable
 * Auto-suggests substitutions, computes Jacobian symbolically, and shows
 * a 2D side-by-side canvas of the original and transformed regions.
 */

import { useRef, useState, useCallback, useEffect } from 'react';
import { MathKeyboard } from '../../components/MathKeyboard';
import { StepPanel } from '../../components/StepPanel';
import { computeDoubleIntegral } from '../../lib/numericalIntegration';
import { computeJacobian2D } from '../../lib/jacobian';
import { safeCompile, evalNumber } from '../../lib/mathEngine';
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

// ─── Auto-suggest substitution ─────────────────────────────────────────────────
function autoSuggest(expr: string): { u: string; v: string; hint: string } | null {
  const s = expr.replace(/\s/g, '');
  if (/x\^2\+y\^2/.test(s) || /sqrt\(x\^2\+y\^2/.test(s)) {
    return { u: 'sqrt(x^2 + y^2)', v: 'atan2(y, x)', hint: 'Coordenadas polares: u = r, v = θ' };
  }
  if (/x\+y/.test(s) && /x-y/.test(s)) {
    return { u: 'x + y', v: 'x - y', hint: 'Sustitución diagonal: u = x+y, v = x−y' };
  }
  if (/x\+y/.test(s)) {
    return { u: 'x + y', v: 'x - y', hint: 'Sugerencia: u = x+y, v = x−y' };
  }
  return null;
}

// ─── Draw region on canvas ─────────────────────────────────────────────────────
function drawRegion(
  canvas: HTMLCanvasElement,
  xMin: number, xMax: number, yMin: number, yMax: number,
  uExpr: string, vExpr: string, label: string, color: string, transformed = false,
) {
  const ctx = canvas.getContext('2d')!;
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, W, H);

  // Grid
  ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 0.5;
  for (let i = 0; i <= 10; i++) {
    const x = (i / 10) * W; const y = (i / 10) * H;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }

  // Axes
  ctx.strokeStyle = '#475569'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(W/2, 0); ctx.lineTo(W/2, H); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, H/2); ctx.lineTo(W, H/2); ctx.stroke();

  const uFn = safeCompile(uExpr);
  const vFn = safeCompile(vExpr);

  const toPixX = (u: number) => ((u - xMin) / (xMax - xMin)) * W;
  const toPixY = (v: number) => H - ((v - yMin) / (yMax - yMin)) * H;

  // Fill region
  const N = 40;
  ctx.fillStyle = color + '55';
  ctx.beginPath();
  let first = true;
  for (let i = 0; i <= N; i++) {
    const x = xMin + (i / N) * (xMax - xMin);
    const y = yMin;
    const px = transformed && uFn && vFn ? toPixX(evalNumber(uFn, { x, y }) ?? x) : toPixX(x);
    const py = transformed && uFn && vFn ? toPixY(evalNumber(vFn, { x, y }) ?? y) : toPixY(y);
    if (first) { ctx.moveTo(px, py); first = false; } else ctx.lineTo(px, py);
  }
  for (let j = 0; j <= N; j++) {
    const x = xMax;
    const y = yMin + (j / N) * (yMax - yMin);
    const px = transformed && uFn && vFn ? toPixX(evalNumber(uFn, { x, y }) ?? x) : toPixX(x);
    const py = transformed && uFn && vFn ? toPixY(evalNumber(vFn, { x, y }) ?? y) : toPixY(y);
    ctx.lineTo(px, py);
  }
  for (let i = N; i >= 0; i--) {
    const x = xMin + (i / N) * (xMax - xMin);
    const y = yMax;
    const px = transformed && uFn && vFn ? toPixX(evalNumber(uFn, { x, y }) ?? x) : toPixX(x);
    const py = transformed && uFn && vFn ? toPixY(evalNumber(vFn, { x, y }) ?? y) : toPixY(y);
    ctx.lineTo(px, py);
  }
  for (let j = N; j >= 0; j--) {
    const x = xMin;
    const y = yMin + (j / N) * (yMax - yMin);
    const px = transformed && uFn && vFn ? toPixX(evalNumber(uFn, { x, y }) ?? x) : toPixX(x);
    const py = transformed && uFn && vFn ? toPixY(evalNumber(vFn, { x, y }) ?? y) : toPixY(y);
    ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();

  // Label
  ctx.fillStyle = '#94a3b8'; ctx.font = 'bold 12px Inter, Arial'; ctx.textAlign = 'center';
  ctx.fillText(label, W / 2, 16);
}

export function Cat3ChangeOfVariable() {
  const fRef = useRef<HTMLInputElement | null>(null);
  const canvasXY = useRef<HTMLCanvasElement | null>(null);
  const canvasUV = useRef<HTMLCanvasElement | null>(null);

  const [fExpr, setFExpr] = useState('(x + y)^2');
  const [xMin, setXMin] = useState(0); const [xMax, setXMax] = useState(1);
  const [yMin, setYMin] = useState(0); const [yMax, setYMax] = useState(1);
  const [uExpr, setUExpr] = useState('x + y');
  const [vExpr, setVExpr] = useState('x - y');
  const [showKbd, setShowKbd] = useState(false);
  const [jacobian, setJacobian] = useState<ReturnType<typeof computeJacobian2D>>(null);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [steps, setSteps] = useState<{ title: string; content: string; latex?: string }[]>([]);
  const [result, setResult] = useState<string | null>(null);
  const [resultLatex, setResultLatex] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const updateCanvas = useCallback(() => {
    if (canvasXY.current) drawRegion(canvasXY.current, xMin, xMax, yMin, yMax, uExpr, vExpr, 'Plano xy', '#22c55e', false);
    if (canvasUV.current) drawRegion(canvasUV.current, xMin, xMax, yMin, yMax, uExpr, vExpr, 'Plano uv (transformado)', '#a855f7', true);
  }, [xMin, xMax, yMin, yMax, uExpr, vExpr]);

  useEffect(() => { updateCanvas(); }, [updateCanvas]);

  const applySuggestion = () => {
    const s = autoSuggest(fExpr);
    if (s) { setUExpr(s.u); setVExpr(s.v); setSuggestion(s.hint); }
    else setSuggestion('No se encontró sustitución automática.');
  };

  const compute = useCallback(() => {
    setError(null); setResult(null); setResultLatex(null);

    const J = computeJacobian2D(uExpr, vExpr);
    setJacobian(J);

    const allSteps: { title: string; content: string; latex?: string }[] = [];
    if (J) {
      allSteps.push({
        title: 'Jacobiano ∂(u,v)/∂(x,y)',
        content: `∂u/∂x = ${J.dudx}\n∂u/∂y = ${J.dudy}\n∂v/∂x = ${J.dvdx}\n∂v/∂y = ${J.dvdy}`,
        latex: `J = \\begin{vmatrix}${J.dudx} & ${J.dudy} \\\\ ${J.dvdx} & ${J.dvdy}\\end{vmatrix} = ${J.detExpr}`,
      });
      if (J.detNumeric !== null) {
        allSteps.push({ title: 'Determinante en (1,1)', content: `|J| ≈ ${J.detNumeric.toFixed(6)}` });
      }
    }

    // Evaluate original integral numerically
    const res = computeDoubleIntegral(fExpr, { xMin, xMax, yMinExpr: String(yMin), yMaxExpr: String(yMax), order: 'dydx' });
    allSteps.push(...res.steps);
    setSteps(allSteps);
    setError(res.error);

    if (res.value !== null) {
      const detStr = J?.detNumeric?.toFixed(4) ?? 'J';
      setResult(`≈ ${res.value.toFixed(8)}`);
      setResultLatex(`\\iint_D (${fExpr})\\,dA \\approx ${res.value.toFixed(6)}`);
      allSteps.push({
        title: 'Con cambio de variable',
        content: `∫∫ f(x,y) dA = ∫∫ f(x(u,v),y(u,v)) |J|⁻¹ du dv\n|J| en (1,1) ≈ ${detStr}`,
      });
    }
    updateCanvas();
  }, [fExpr, xMin, xMax, yMin, yMax, uExpr, vExpr, updateCanvas]);

  return (
    <div className="module-layout">
      <div className="module-sidebar">
        <h2 className="module-title" style={{ color: '#2563eb' }}>🔄 Cambio de Variable</h2>

        <div className="field-group">
          <label className="field-label">Integrando f(x,y)</label>
          <div style={{ display:'flex', gap:6 }}>
            <input ref={fRef} type="text" className="math-input" value={fExpr}
              onChange={e => setFExpr(e.target.value)} onFocus={() => setShowKbd(true)} />
            <button className="icon-btn" onClick={() => setShowKbd(v => !v)}><Keyboard size={14}/></button>
          </div>
          {showKbd && <MathKeyboard inputRef={fRef} value={fExpr} onChange={setFExpr} onEnter={() => setShowKbd(false)} />}
        </div>

        <div className="field-group">
          <label className="field-label">Dominio rectangular [xMin,xMax]×[yMin,yMax]</label>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
            {([['xMin',xMin,setXMin],['xMax',xMax,setXMax],['yMin',yMin,setYMin],['yMax',yMax,setYMax]] as const).map(([k,v,s]) => (
              <div key={k}><label style={{fontSize:11,color:'#64748b'}}>{k}</label>
                <input type="number" step="any" value={v} onChange={e=>(s as (n:number)=>void)(parseFloat(e.target.value)||0)} className="number-input"/></div>
            ))}
          </div>
        </div>

        <div className="field-group">
          <label className="field-label">Sustitución</label>
          <button onClick={applySuggestion} style={{width:'100%',marginBottom:8,padding:'6px',borderRadius:7,border:'1px dashed #3b82f6',background:'#eff6ff',color:'#2563eb',fontWeight:700,fontSize:11,cursor:'pointer'}}>
            ✨ Sugerir sustitución automática
          </button>
          {suggestion && <div style={{marginBottom:8,fontSize:11,color:'#1d4ed8',background:'#dbeafe',padding:'5px 8px',borderRadius:6}}>{suggestion}</div>}
          <label style={{fontSize:11,color:'#64748b',display:'block',marginBottom:2}}>u =</label>
          <input type="text" className="math-input" value={uExpr} onChange={e=>setUExpr(e.target.value)} style={{marginBottom:6}}/>
          <label style={{fontSize:11,color:'#64748b',display:'block',marginBottom:2}}>v =</label>
          <input type="text" className="math-input" value={vExpr} onChange={e=>setVExpr(e.target.value)}/>
        </div>

        {jacobian && (
          <div style={{marginBottom:12,padding:'8px 12px',background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:8}}>
            <div style={{fontSize:11,color:'#64748b',fontWeight:700,marginBottom:4}}>Jacobiano</div>
            <KaTeX latex={jacobian.matrixLatex} display />
            <div style={{marginTop:6,fontSize:11,color:'#475569'}}>det = {jacobian.detExpr}</div>
          </div>
        )}

        <button onClick={compute} className="btn-compute" style={{background:'linear-gradient(135deg,#2563eb,#1d4ed8)'}}>
          Calcular con cambio de variable
        </button>

        {resultLatex && !error && (
          <div style={{marginTop:12,padding:'10px 14px',background:'linear-gradient(135deg,#eff6ff,#dbeafe)',border:'1px solid #93c5fd',borderRadius:10,textAlign:'center'}}>
            <KaTeX latex={resultLatex} display />
          </div>
        )}
        <div style={{marginTop:12}}>
          <StepPanel steps={steps} result={result} resultLatex={resultLatex??undefined} error={error} title="Pasos"/>
        </div>
      </div>

      {/* 2D Region Visualizer */}
      <div className="module-viewer" style={{background:'#0f172a',display:'flex',flexDirection:'column',gap:0}}>
        <div style={{flex:1,padding:'12px',display:'flex',gap:12}}>
          <div style={{flex:1}}>
            <canvas ref={canvasXY} width={300} height={280} style={{width:'100%',height:'100%',borderRadius:8,display:'block'}}/>
          </div>
          <div style={{flex:1}}>
            <canvas ref={canvasUV} width={300} height={280} style={{width:'100%',height:'100%',borderRadius:8,display:'block'}}/>
          </div>
        </div>
        <div style={{padding:'8px',textAlign:'center',fontSize:11,color:'#64748b',borderTop:'1px solid #1e293b'}}>
          Izquierda: región D en plano xy &nbsp;·&nbsp; Derecha: región transformada (u, v)
        </div>
      </div>
    </div>
  );
}
