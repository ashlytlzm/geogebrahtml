/**
 * Cat1SolidVolume.tsx — Category 1: Volume of a Solid
 * Enhanced solid-volume tool using IsoViewer with coordinate system detection,
 * automatic domain suggestion, and full integral notation.
 */

import { useRef, useState, useCallback, useEffect } from 'react';
import * as THREE from 'three';
import { IsoViewer } from '../../components/IsoViewer';
import { MathKeyboard } from '../../components/MathKeyboard';
import { StepPanel } from '../../components/StepPanel';
import type { IsoSceneHandles } from '../../lib/isoScene';
import { buildSolidObjects, disposeGroup } from '../../lib/solidGeometry';
import { computeVolumeSolid, type DomainSpec } from '../../lib/numericalIntegration';
import { detectCoordSystem, coordSystemLabel, integralLatex } from '../../lib/coordDetect';
import { Layers, Keyboard } from 'lucide-react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

type DomainType = 'rect' | 'circle' | 'custom';

function KaTeX({ latex, display = false }: { latex: string; display?: boolean }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    try { katex.render(latex, ref.current, { displayMode: display, throwOnError: false, strict: false }); }
    catch { if (ref.current) ref.current.textContent = latex; }
  }, [latex, display]);
  return display ? <div ref={ref as React.RefObject<HTMLDivElement>} /> : <span ref={ref as React.RefObject<HTMLSpanElement>} />;
}

export function Cat1SolidVolume() {
  const handlesRef = useRef<IsoSceneHandles | null>(null);
  const activeInputRef = useRef<HTMLInputElement | null>(null);

  const [topExpr, setTopExpr] = useState('sqrt(4 - x^2 - y^2)');
  const [botExpr, setBotExpr] = useState('sqrt(x^2 + y^2)');
  const [domType, setDomType] = useState<DomainType>('circle');

  const [xMin, setXMin] = useState(-2); const [xMax, setXMax] = useState(2);
  const [yMin, setYMin] = useState(-2); const [yMax, setYMax] = useState(2);
  const [cx, setCx] = useState(0); const [cy, setCy] = useState(0); const [radius, setRadius] = useState(Math.sqrt(2));
  const [cxMin, setCxMin] = useState(0); const [cxMax, setCxMax] = useState(1);
  const [yMinExpr, setYMinExpr] = useState('0'); const [yMaxExpr, setYMaxExpr] = useState('sqrt(x)');

  const [resolution, setResolution] = useState(45);
  const [showWire, setShowWire] = useState(true);
  const [showKbd, setShowKbd] = useState(false);
  const [activeInput, setActiveInput] = useState<'top'|'bot'|'ymin'|'ymax'>('top');

  const [steps, setSteps] = useState<{ title: string; content: string; latex?: string }[]>([]);
  const [resultText, setResultText] = useState<string | null>(null);
  const [resultLatex, setResultLatex] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [coordSys, setCoordSys] = useState('cartesian');
  const [builtDomain, setBuiltDomain] = useState<DomainSpec>({ type: 'circle', cx: 0, cy: 0, R: Math.sqrt(2) });

  const buildDomain = useCallback((): DomainSpec => {
    if (domType === 'rect')   return { type: 'rect', xMin, xMax, yMin, yMax };
    if (domType === 'circle') return { type: 'circle', cx, cy, R: radius };
    return { type: 'custom', xMin: cxMin, xMax: cxMax, yMinExpr, yMaxExpr };
  }, [domType, xMin, xMax, yMin, yMax, cx, cy, radius, cxMin, cxMax, yMinExpr, yMaxExpr]);

  const buildGeometry = useCallback((h: IsoSceneHandles, params: { topExpr: string; botExpr: string; domain: DomainSpec; N: number; showWire: boolean }) => {
    disposeGroup(h.solidGroup);
    buildSolidObjects(params).forEach(o => h.solidGroup.add(o));
  }, []);

  const compute = useCallback(() => {
    const domain = buildDomain();
    const sys = detectCoordSystem([topExpr, botExpr]);
    setCoordSys(sys);
    setBuiltDomain(domain);

    const res = computeVolumeSolid(topExpr, botExpr, domain, 60);
    setSteps(res.steps);
    setError(res.error);

    if (res.value !== null) {
      setResultText(`V ≈ ${res.value.toFixed(6)} u³`);
      const domStr = domain.type === 'rect' ? `[${xMin},${xMax}]\\times[${yMin},${yMax}]` :
                     domain.type === 'circle' ? `x^2+y^2\\leq${radius}^2` : 'D';
      setResultLatex(`V = \\iint_{D}\\bigl[f-g\\bigr]\\,dA \\approx ${res.value.toFixed(6)}`);
      void integralLatex(topExpr, botExpr, sys, domStr); // for coord info display
    } else { setResultText(null); setResultLatex(null); }

    if (handlesRef.current) {
      buildGeometry(handlesRef.current, { topExpr, botExpr, domain, N: resolution, showWire });
    }
  }, [topExpr, botExpr, buildDomain, xMin, xMax, yMin, yMax, radius, resolution, showWire, buildGeometry]);

  const onReady = useCallback((h: IsoSceneHandles) => {
    handlesRef.current = h;
    const domain = buildDomain();
    buildGeometry(h, { topExpr, botExpr, domain, N: resolution, showWire });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const kbdVal = () => activeInput === 'top' ? topExpr : activeInput === 'bot' ? botExpr : activeInput === 'ymin' ? yMinExpr : yMaxExpr;
  const kbdSet = (v: string) => { if (activeInput === 'top') setTopExpr(v); else if (activeInput === 'bot') setBotExpr(v); else if (activeInput === 'ymin') setYMinExpr(v); else setYMaxExpr(v); };
  const focus = (w: typeof activeInput, el: HTMLInputElement | null) => { setActiveInput(w); activeInputRef.current = el; setShowKbd(true); };

  const coordColor = coordSys === 'spherical' ? '#7c3aed' : coordSys === 'cylindrical' ? '#0d9488' : '#2563eb';

  return (
    <div className="module-layout">
      <div className="module-sidebar">
        <h2 className="module-title" style={{ color: '#0d9488' }}><Layers size={18} /> Volumen Sólido</h2>

        {/* Coord detection badge */}
        <div style={{ marginBottom: 14, padding: '6px 10px', borderRadius: 8, background: `${coordColor}14`, border: `1px solid ${coordColor}44`, fontSize: 11, fontWeight: 700, color: coordColor, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>📐</span> Sistema detectado: {coordSystemLabel(coordSys as 'cartesian'|'cylindrical'|'spherical')}
        </div>

        <div className="field-group">
          <label className="field-label">Superficie superior z = f(x,y)</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <input type="text" className="math-input" value={topExpr} onChange={e => setTopExpr(e.target.value)}
              onFocus={e => focus('top', e.target)} style={{ borderColor: '#14b8a6' }} />
            <button className="icon-btn" onClick={() => setShowKbd(v => !v)}><Keyboard size={14} /></button>
          </div>
        </div>
        <div className="field-group">
          <label className="field-label">Superficie inferior z = g(x,y)</label>
          <input type="text" className="math-input" value={botExpr} onChange={e => setBotExpr(e.target.value)}
            onFocus={e => focus('bot', e.target)} style={{ borderColor: '#0f766e' }} />
        </div>

        {showKbd && <MathKeyboard inputRef={activeInputRef} value={kbdVal()} onChange={kbdSet} onEnter={() => setShowKbd(false)} />}

        <div className="field-group">
          <label className="field-label">Dominio D</label>
          <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
            {(['rect','circle','custom'] as DomainType[]).map(dt => (
              <button key={dt} onClick={() => setDomType(dt)} style={{
                flex:1, padding:'5px 0', borderRadius:7, border:'1.5px solid',
                borderColor: domType===dt ? '#0d9488' : '#e2e8f0',
                background: domType===dt ? '#ccfbf1' : '#f8fafc',
                color: domType===dt ? '#0f766e' : '#64748b',
                fontWeight:700, fontSize:11, cursor:'pointer', transition:'all .15s',
              }}>
                {dt==='rect'?'⬜ Rect.':dt==='circle'?'⭕ Circ.':'〰️ Custom'}
              </button>
            ))}
          </div>

          {domType === 'rect' && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
              {([['xMin',xMin,setXMin],['xMax',xMax,setXMax],['yMin',yMin,setYMin],['yMax',yMax,setYMax]] as const).map(([k,v,s]) => (
                <div key={k}><label style={{fontSize:11,color:'#64748b',display:'block',marginBottom:2}}>{k}</label>
                  <input type="number" step="any" value={v} onChange={e=>(s as (n:number)=>void)(parseFloat(e.target.value)||0)} className="number-input"/></div>
              ))}
            </div>
          )}
          {domType === 'circle' && (
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
              {([['cx',cx,setCx],['cy',cy,setCy],['R',radius,setRadius]] as const).map(([k,v,s]) => (
                <div key={k}><label style={{fontSize:11,color:'#64748b',display:'block',marginBottom:2}}>{k}</label>
                  <input type="number" step="any" value={v} onChange={e=>(s as (n:number)=>void)(parseFloat(e.target.value)||0)} className="number-input"/></div>
              ))}
              <div style={{gridColumn:'1/-1',fontSize:11,color:'#94a3b8',padding:'3px 0'}}>
                <KaTeX latex={`(x-${cx})^2+(y-${cy})^2\\leq ${radius.toFixed(3)}^2`} />
              </div>
            </div>
          )}
          {domType === 'custom' && (
            <>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,marginBottom:6}}>
                {([['xMin',cxMin,setCxMin],['xMax',cxMax,setCxMax]] as const).map(([k,v,s]) => (
                  <div key={k}><label style={{fontSize:11,color:'#64748b',display:'block',marginBottom:2}}>{k}</label>
                    <input type="number" step="any" value={v} onChange={e=>(s as (n:number)=>void)(parseFloat(e.target.value)||0)} className="number-input"/></div>
                ))}
              </div>
              <label style={{fontSize:11,color:'#64748b',display:'block',marginBottom:2}}>y_min(x) =</label>
              <input type="text" className="math-input" value={yMinExpr} onChange={e=>setYMinExpr(e.target.value)} onFocus={e=>focus('ymin',e.target)} style={{marginBottom:6}}/>
              <label style={{fontSize:11,color:'#64748b',display:'block',marginBottom:2}}>y_max(x) =</label>
              <input type="text" className="math-input" value={yMaxExpr} onChange={e=>setYMaxExpr(e.target.value)} onFocus={e=>focus('ymax',e.target)}/>
            </>
          )}
        </div>

        <div className="field-group">
          <label className="field-label">Resolución: {resolution}×{resolution}</label>
          <input type="range" min={15} max={75} step={1} value={resolution} onChange={e=>setResolution(+e.target.value)} style={{width:'100%',accentColor:'#0d9488'}}/>
        </div>
        <div className="field-group" style={{display:'flex',alignItems:'center',gap:10}}>
          <input id="c1-wire" type="checkbox" checked={showWire} onChange={e=>setShowWire(e.target.checked)} style={{accentColor:'#0d9488',width:15,height:15}}/>
          <label htmlFor="c1-wire" style={{fontSize:13,color:'#334155',fontWeight:600,cursor:'pointer'}}>Wireframe</label>
        </div>

        <button onClick={compute} className="btn-compute" style={{background:'linear-gradient(135deg,#0d9488,#0f766e)',boxShadow:'0 2px 8px rgba(13,148,136,.3)'}}>
          Calcular Volumen
        </button>

        {resultLatex && !error && (
          <div style={{marginTop:14,padding:'11px 14px',background:'linear-gradient(135deg,#f0fdfa,#ccfbf1)',border:'1px solid #5eead4',borderRadius:10,textAlign:'center'}}>
            <div style={{fontSize:12,color:'#0f766e',fontWeight:700,marginBottom:5}}>Volumen calculado</div>
            <KaTeX latex={resultLatex} display />
          </div>
        )}

        {/* Integral notation */}
        {builtDomain && (
          <div style={{marginTop:10,padding:'8px 12px',background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:8}}>
            <div style={{fontSize:11,color:'#64748b',fontWeight:700,marginBottom:4}}>Planteamiento de la integral</div>
            <KaTeX latex={integralLatex(topExpr,botExpr,coordSys as 'cartesian'|'cylindrical'|'spherical',
              builtDomain.type==='rect'?`[${xMin},${xMax}]\\times[${yMin},${yMax}]`:
              builtDomain.type==='circle'?`R=${radius.toFixed(2)}`:'D')} display />
          </div>
        )}

        <div style={{marginTop:12}}>
          <StepPanel steps={steps} result={resultText} resultLatex={resultLatex??undefined} error={error} title="Pasos del cálculo"/>
        </div>
      </div>

      <div className="module-viewer" style={{background:'#0f172a'}}>
        <IsoViewer onReady={onReady}>
          <div style={{position:'absolute',bottom:12,left:'50%',transform:'translateX(-50%)',background:'rgba(15,23,42,0.75)',backdropFilter:'blur(6px)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:20,padding:'4px 14px',fontSize:11,color:'#94a3b8',pointerEvents:'none'}}>
            {builtDomain.type==='circle' && <KaTeX latex={`(x-${cx})^2+(y-${cy})^2\\leq${radius.toFixed(2)}^2`}/>}
            {builtDomain.type==='rect' && <KaTeX latex={`[${xMin},${xMax}]\\times[${yMin},${yMax}]`}/>}
            {builtDomain.type==='custom' && <KaTeX latex={`y\\in[${yMinExpr},\\,${yMaxExpr}]`}/>}
          </div>
        </IsoViewer>
      </div>
    </div>
  );
}
