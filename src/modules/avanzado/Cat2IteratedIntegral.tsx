/**
 * Cat2IteratedIntegral.tsx — Category 2: Evaluate Any Iterated Integral
 * Double or triple integral with variable bounds, region visualization, and CoV suggestion.
 */

import { useRef, useState, useCallback, useEffect } from 'react';
import * as THREE from 'three';
import { IsoViewer } from '../../components/IsoViewer';
import { MathKeyboard } from '../../components/MathKeyboard';
import { StepPanel } from '../../components/StepPanel';
import type { IsoSceneHandles } from '../../lib/isoScene';
import { computeDoubleIntegral, computeTripleIntegral } from '../../lib/numericalIntegration';
import { detectCoordSystem } from '../../lib/coordDetect';
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

// ─── Region box visualizer ─────────────────────────────────────────────────────
function buildRegionBox(group: THREE.Group, x0:number,x1:number,y0:number,y1:number,z0:number,z1:number) {
  group.traverse(o => {
    if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) {
      o.geometry.dispose();
      if (Array.isArray(o.material)) o.material.forEach(m=>m.dispose()); else o.material.dispose();
    }
  });
  group.clear();

  const geo = new THREE.BoxGeometry(x1-x0, y1-y0, z1-z0);
  const mat = new THREE.MeshPhongMaterial({ color: 0x6d28d9, side: THREE.DoubleSide, transparent:true, opacity:0.35, depthWrite:false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set((x0+x1)/2, (y0+y1)/2, (z0+z1)/2);
  group.add(mesh);

  const edges = new THREE.EdgesGeometry(geo);
  const lineMat = new THREE.LineBasicMaterial({ color: 0xa855f7, transparent:true, opacity:0.7 });
  const wireframe = new THREE.LineSegments(edges, lineMat);
  wireframe.position.copy(mesh.position);
  group.add(wireframe);
}

export function Cat2IteratedIntegral() {
  const handlesRef = useRef<IsoSceneHandles | null>(null);
  const fRef = useRef<HTMLInputElement | null>(null);

  const [isTriple, setIsTriple] = useState(false);
  const [fExpr, setFExpr] = useState('x + y');
  const [xMin, setXMin] = useState(0); const [xMax, setXMax] = useState(1);
  const [yMinExpr, setYMinExpr] = useState('0'); const [yMaxExpr, setYMaxExpr] = useState('1');
  const [zMinExpr, setZMinExpr] = useState('0'); const [zMaxExpr, setZMaxExpr] = useState('1');
  const [order, setOrder] = useState<'dydx'|'dxdy'>('dydx');
  const [showKbd, setShowKbd] = useState(false);
  const [steps, setSteps] = useState<{ title:string; content:string; latex?:string }[]>([]);
  const [result, setResult] = useState<string|null>(null);
  const [resultLatex, setResultLatex] = useState<string|null>(null);
  const [error, setError] = useState<string|null>(null);
  const [coordHint, setCoordHint] = useState('');

  const onReady = useCallback((h: IsoSceneHandles) => {
    handlesRef.current = h;
    buildRegionBox(h.solidGroup, xMin, xMax, parseFloat(yMinExpr)||0, parseFloat(yMaxExpr)||1, parseFloat(zMinExpr)||0, parseFloat(zMaxExpr)||1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const compute = useCallback(() => {
    setError(null); setResult(null); setResultLatex(null);
    const sys = detectCoordSystem([fExpr]);
    if (sys !== 'cartesian') setCoordHint(`💡 Podría simplificarse en coordenadas ${sys === 'cylindrical' ? 'cilíndricas' : 'esféricas'}`);
    else setCoordHint('');

    let res;
    if (isTriple) {
      res = computeTripleIntegral(fExpr, { xMin, xMax, yMinExpr, yMaxExpr, zMinExpr, zMaxExpr });
    } else {
      res = computeDoubleIntegral(fExpr, { xMin, xMax, yMinExpr, yMaxExpr, order });
    }
    setSteps(res.steps);
    setError(res.error);
    if (res.value !== null) {
      setResult(`≈ ${res.value.toFixed(8)}`);
      const integralSign = isTriple ? '\\iiint' : '\\iint';
      setResultLatex(`${integralSign}_D (${fExpr})\\,dV \\approx ${res.value.toFixed(6)}`);
    }
    if (handlesRef.current) {
      buildRegionBox(handlesRef.current.solidGroup,
        xMin, xMax,
        parseFloat(yMinExpr)||0, parseFloat(yMaxExpr)||1,
        isTriple ? (parseFloat(zMinExpr)||0) : 0,
        isTriple ? (parseFloat(zMaxExpr)||1) : 0.05);
    }
  }, [fExpr, xMin, xMax, yMinExpr, yMaxExpr, zMinExpr, zMaxExpr, order, isTriple]);

  const integralDisplay = isTriple
    ? `\\int_{${xMin}}^{${xMax}}\\int_{${yMinExpr}}^{${yMaxExpr}}\\int_{${zMinExpr}}^{${zMaxExpr}}(${fExpr})\\,dz\\,dy\\,dx`
    : order === 'dydx'
      ? `\\int_{${xMin}}^{${xMax}}\\int_{${yMinExpr}}^{${yMaxExpr}}(${fExpr})\\,dy\\,dx`
      : `\\int_{${yMinExpr}}^{${yMaxExpr}}\\int_{${xMin}}^{${xMax}}(${fExpr})\\,dx\\,dy`;

  return (
    <div className="module-layout">
      <div className="module-sidebar">
        <h2 className="module-title" style={{ color: '#7c3aed' }}>∬ Integral Iterada</h2>

        {/* Type toggle */}
        <div className="field-group" style={{ display:'flex', gap:6 }}>
          {(['Doble','Triple'] as const).map((t, i) => (
            <button key={t} onClick={() => setIsTriple(i===1)} style={{
              flex:1, padding:'7px', borderRadius:8, border:'1.5px solid',
              borderColor: isTriple===(i===1) ? '#7c3aed' : '#e2e8f0',
              background: isTriple===(i===1) ? '#f5f3ff' : '#f8fafc',
              color: isTriple===(i===1) ? '#7c3aed' : '#64748b',
              fontWeight:700, fontSize:12, cursor:'pointer',
            }}>{t}</button>
          ))}
        </div>

        {/* Integrand */}
        <div className="field-group">
          <label className="field-label">Integrando f({isTriple?'x,y,z':'x,y'})</label>
          <div style={{ display:'flex', gap:6 }}>
            <input ref={fRef} type="text" className="math-input" value={fExpr}
              onChange={e=>setFExpr(e.target.value)} onFocus={()=>setShowKbd(true)}/>
            <button className="icon-btn" onClick={()=>setShowKbd(v=>!v)}><Keyboard size={14}/></button>
          </div>
          {showKbd && <MathKeyboard inputRef={fRef} value={fExpr} onChange={setFExpr} onEnter={()=>setShowKbd(false)}/>}
        </div>

        {/* Bounds */}
        <div className="field-group">
          <label className="field-label">Límites de x</label>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
            <div><label style={{fontSize:11,color:'#64748b'}}>x min</label><input type="number" step="any" value={xMin} onChange={e=>setXMin(+e.target.value||0)} className="number-input"/></div>
            <div><label style={{fontSize:11,color:'#64748b'}}>x max</label><input type="number" step="any" value={xMax} onChange={e=>setXMax(+e.target.value||1)} className="number-input"/></div>
          </div>
        </div>
        <div className="field-group">
          <label className="field-label">Límites de y (función de x)</label>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
            <div><label style={{fontSize:11,color:'#64748b'}}>y_min</label><input type="text" value={yMinExpr} onChange={e=>setYMinExpr(e.target.value)} className="math-input" style={{padding:'5px 8px',height:32}}/></div>
            <div><label style={{fontSize:11,color:'#64748b'}}>y_max</label><input type="text" value={yMaxExpr} onChange={e=>setYMaxExpr(e.target.value)} className="math-input" style={{padding:'5px 8px',height:32}}/></div>
          </div>
        </div>
        {isTriple && (
          <div className="field-group">
            <label className="field-label">Límites de z (función de x,y)</label>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
              <div><label style={{fontSize:11,color:'#64748b'}}>z_min</label><input type="text" value={zMinExpr} onChange={e=>setZMinExpr(e.target.value)} className="math-input" style={{padding:'5px 8px',height:32}}/></div>
              <div><label style={{fontSize:11,color:'#64748b'}}>z_max</label><input type="text" value={zMaxExpr} onChange={e=>setZMaxExpr(e.target.value)} className="math-input" style={{padding:'5px 8px',height:32}}/></div>
            </div>
          </div>
        )}

        {/* Order (double only) */}
        {!isTriple && (
          <div className="field-group">
            <label className="field-label">Orden de integración</label>
            <div style={{ display:'flex', gap:6 }}>
              {(['dydx','dxdy'] as const).map(o => (
                <button key={o} onClick={()=>setOrder(o)} style={{
                  flex:1, padding:'5px', borderRadius:7, border:'1.5px solid',
                  borderColor: order===o ? '#7c3aed' : '#e2e8f0',
                  background: order===o ? '#f5f3ff' : '#f8fafc',
                  color: order===o ? '#7c3aed' : '#64748b',
                  fontWeight:700, fontSize:12, cursor:'pointer',
                }}>d{o==='dydx'?'y dx':'x dy'}</button>
              ))}
            </div>
          </div>
        )}

        {/* Integral preview */}
        <div style={{ marginBottom:12, padding:'8px 12px', background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:8, overflowX:'auto' }}>
          <KaTeX latex={integralDisplay} display />
        </div>

        {coordHint && (
          <div style={{ marginBottom:10, padding:'6px 10px', background:'#fef3c7', border:'1px solid #fde68a', borderRadius:7, fontSize:11, color:'#92400e' }}>
            {coordHint}
          </div>
        )}

        <button onClick={compute} className="btn-compute">Calcular</button>

        {resultLatex && !error && (
          <div style={{ marginTop:12, padding:'10px 14px', background:'linear-gradient(135deg,#f5f3ff,#ede9fe)', border:'1px solid #c4b5fd', borderRadius:10, textAlign:'center' }}>
            <KaTeX latex={resultLatex} display />
          </div>
        )}

        <div style={{ marginTop:12 }}>
          <StepPanel steps={steps} result={result} resultLatex={resultLatex??undefined} error={error} title="Resolución paso a paso"/>
        </div>
      </div>

      <div className="module-viewer" style={{ background:'#0f172a' }}>
        <IsoViewer onReady={onReady}>
          <div style={{ position:'absolute', bottom:12, left:'50%', transform:'translateX(-50%)', background:'rgba(15,23,42,0.75)', backdropFilter:'blur(6px)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:20, padding:'4px 14px', fontSize:11, color:'#a78bfa', pointerEvents:'none' }}>
            Región de integración (vista isométrica)
          </div>
        </IsoViewer>
      </div>
    </div>
  );
}
