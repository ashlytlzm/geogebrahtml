import { useState, useEffect, useRef } from 'react';
import { Trash2, Plus, FunctionSquare, Keyboard, LineChart, Box } from 'lucide-react';
import type { Point3DData, ViewMode } from '../types';
import {
  safeCompile,
  validateExpression,
  type GraphMode,
  type GraphRange,
} from '../lib/mathEngine';

interface SidebarProps {
  equation: string;
  setEquation: (eq: string) => void;
  points: Point3DData[];
  addPoint: (pt: Omit<Point3DData, 'id'>) => void;
  removePoint: (id: string) => void;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  graphMode: GraphMode;
  setGraphMode: (mode: GraphMode) => void;
  range: GraphRange;
  setRange: (range: GraphRange) => void;
}

// ─── Teclado Matemático ───────────────────────────────────────────────────────
type KbTab = '123' | 'f(x)' | 'ABC';

const KB_KEYS: Record<KbTab, { label: string; insert: string }[][]> = {
  '123': [
    [
      { label: 'x',  insert: 'x' },
      { label: 'y',  insert: 'y' },
      { label: 'z',  insert: 'z' },
      { label: 'π',  insert: 'pi' },
      { label: '7',  insert: '7' },
      { label: '8',  insert: '8' },
      { label: '9',  insert: '9' },
      { label: '×',  insert: '*' },
      { label: '÷',  insert: '/' },
    ],
    [
      { label: 'x²',  insert: '^2' },
      { label: 'xⁿ',  insert: '^' },
      { label: '√',   insert: 'sqrt(' },
      { label: 'e',   insert: 'e' },
      { label: '4',   insert: '4' },
      { label: '5',   insert: '5' },
      { label: '6',   insert: '6' },
      { label: '+',   insert: '+' },
      { label: '−',   insert: '-' },
    ],
    [
      { label: '<',   insert: '<' },
      { label: '>',   insert: '>' },
      { label: '|x|', insert: 'abs(' },
      { label: '±',   insert: '+-' },
      { label: '1',   insert: '1' },
      { label: '2',   insert: '2' },
      { label: '3',   insert: '3' },
      { label: '=',   insert: '=' },
      { label: '⌫',   insert: '__DEL__' },
    ],
    [
      { label: '(',   insert: '(' },
      { label: ')',   insert: ')' },
      { label: ',',   insert: ',' },
      { label: '0',   insert: '0' },
      { label: '.',   insert: '.' },
      { label: '↵',   insert: '__ENTER__' },
    ],
  ],
  'f(x)': [
    [
      { label: 'sin',   insert: 'sin(' },
      { label: 'cos',   insert: 'cos(' },
      { label: 'tan',   insert: 'tan(' },
      { label: 'ln',    insert: 'log(' },
      { label: 'log',   insert: 'log10(' },
    ],
    [
      { label: 'asin',  insert: 'asin(' },
      { label: 'acos',  insert: 'acos(' },
      { label: 'atan',  insert: 'atan(' },
      { label: 'atan2', insert: 'atan2(' },
      { label: 'exp',   insert: 'exp(' },
    ],
    [
      { label: 'sqrt',  insert: 'sqrt(' },
      { label: 'cbrt',  insert: 'cbrt(' },
      { label: 'abs',   insert: 'abs(' },
      { label: 'ceil',  insert: 'ceil(' },
      { label: 'floor', insert: 'floor(' },
    ],
    [
      { label: 'mod',   insert: '%' },
      { label: 'max',   insert: 'max(' },
      { label: 'min',   insert: 'min(' },
      { label: 'round', insert: 'round(' },
      { label: 'sign',  insert: 'sign(' },
    ],
  ],
  'ABC': [
    [
      ...'abcdefghi'.split('').map(c => ({ label: c, insert: c })),
    ],
    [
      ...'jklmnopqr'.split('').map(c => ({ label: c, insert: c })),
    ],
    [
      ...'stuvwxyz'.split('').map(c => ({ label: c, insert: c })),
    ],
  ],
};

interface MathKeyboardProps {
  inputRef: React.RefObject<HTMLInputElement | null>;
  value: string;
  onChange: (v: string) => void;
  onEnter: () => void;
}

function MathKeyboard({ inputRef, value, onChange, onEnter }: MathKeyboardProps) {
  const [tab, setTab] = useState<KbTab>('123');

  const insert = (token: string) => {
    const el = inputRef.current;
    if (!el) return;

    if (token === '__DEL__') {
      const start = el.selectionStart ?? value.length;
      const end   = el.selectionEnd   ?? value.length;
      if (start !== end) {
        onChange(value.slice(0, start) + value.slice(end));
        setTimeout(() => el.setSelectionRange(start, start), 0);
      } else if (start > 0) {
        onChange(value.slice(0, start - 1) + value.slice(start));
        setTimeout(() => el.setSelectionRange(start - 1, start - 1), 0);
      }
      return;
    }
    if (token === '__ENTER__') { onEnter(); return; }

    const start = el.selectionStart ?? value.length;
    const end   = el.selectionEnd   ?? value.length;
    const newVal = value.slice(0, start) + token + value.slice(end);
    onChange(newVal);
    const cursor = start + token.length;
    setTimeout(() => { el.focus(); el.setSelectionRange(cursor, cursor); }, 0);
  };

  const tabs: KbTab[] = ['123', 'f(x)', 'ABC'];

  return (
    <div style={{
      background: '#f1f5f9',
      border: '1px solid #e2e8f0',
      borderRadius: '12px',
      padding: '10px 8px 8px',
      marginTop: '6px',
      userSelect: 'none',
    }}>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
        {tabs.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '4px 12px',
            borderRadius: '20px',
            border: 'none',
            background: tab === t ? '#7c3aed' : '#e2e8f0',
            color: tab === t ? '#fff' : '#475569',
            fontWeight: 700,
            fontSize: '12px',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}>{t}</button>
        ))}
      </div>

      {/* Key rows */}
      {KB_KEYS[tab].map((row, ri) => (
        <div key={ri} style={{ display: 'flex', gap: '4px', marginBottom: '4px', flexWrap: 'wrap' }}>
          {row.map((key, ki) => (
            <button
              key={ki}
              onMouseDown={(e) => { e.preventDefault(); insert(key.insert); }}
              style={{
                flex: key.label === '↵' ? '2 1 auto' : '1 1 auto',
                minWidth: '30px',
                padding: '8px 4px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                background: key.label === '⌫' || key.label === '↵'
                  ? '#dde3ea'
                  : 'white',
                color: '#1e293b',
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer',
                boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                transition: 'background 0.1s',
              }}
            >
              {key.label}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── Sidebar Principal ────────────────────────────────────────────────────────
const GRAPH_MODE_OPTIONS: { value: GraphMode; label: string }[] = [
  { value: 'auto', label: 'Automático' },
  { value: 'curve2d', label: 'Curva 2D y=f(x)' },
  { value: 'contour', label: 'Contorno / mapa' },
  { value: 'surface3d', label: 'Superficie 3D z=f(x,y)' },
  { value: 'implicit3d', label: 'Implícita 3D f(x,y,z)=0' },
];

export function Sidebar({
  equation,
  setEquation,
  points,
  addPoint,
  removePoint,
  viewMode,
  setViewMode,
  graphMode,
  setGraphMode,
  range,
  setRange,
}: SidebarProps) {
  const [eqInput, setEqInput] = useState(equation);
  const [error, setError] = useState<string | null>(null);
  const [showKeyboard, setShowKeyboard] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  
  const [newX, setNewX] = useState('0');
  const [newY, setNewY] = useState('0');
  const [newZ, setNewZ] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      const err = validateExpression(eqInput);
      if (err) {
        setError(err);
      } else {
        setEquation(eqInput);
        setError(null);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [eqInput, setEquation]);

  const handleAddPoint = (e: React.FormEvent) => {
    e.preventDefault();
    const x = parseFloat(newX);
    const y = parseFloat(newY);
    if (isNaN(x) || isNaN(y)) return;

    // If Z is provided manually, use it
    const manualZ = parseFloat(newZ);
    if (!isNaN(manualZ)) {
      addPoint({ x, y, z: manualZ });
      return;
    }

    // Otherwise, try to evaluate Z from the equation
    const fn = safeCompile(equation);
    if (fn) {
      try {
        const z = fn.evaluate({ x, y });
        addPoint({ x, y, z: typeof z === 'number' && isFinite(z) ? z : 0 });
        return;
      } catch { /* fallback */ }
    }
    addPoint({ x, y, z: 0 });
  };

  return (
    <div className="w-80 h-full bg-white/80 backdrop-blur-md border-r border-slate-200 p-6 flex flex-col gap-6 text-slate-800 z-10 absolute left-0 top-0 overflow-y-auto">
      <div>
        <h1 className="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-purple-500 bg-clip-text text-transparent mb-1">
          Calculadora 3D
        </h1>
        <p className="text-xs text-slate-500">de Juan Pablo Vera</p>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setViewMode('plotly')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold border transition-colors ${
            viewMode === 'plotly'
              ? 'bg-purple-600 text-white border-purple-600'
              : 'bg-white text-slate-600 border-slate-200 hover:border-purple-300'
          }`}
        >
          <LineChart size={14} /> Plotly 2D/3D
        </button>
        <button
          type="button"
          onClick={() => setViewMode('webgl')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold border transition-colors ${
            viewMode === 'webgl'
              ? 'bg-cyan-600 text-white border-cyan-600'
              : 'bg-white text-slate-600 border-slate-200 hover:border-cyan-300'
          }`}
        >
          <Box size={14} /> WebGL 3D
        </button>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-semibold text-slate-600">Tipo de gráfica</label>
        <select
          value={graphMode}
          onChange={(e) => setGraphMode(e.target.value as GraphMode)}
          className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
        >
          {GRAPH_MODE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        {(['xMin', 'xMax', 'yMin', 'yMax'] as const).map((key) => (
          <div key={key}>
            <label className="text-slate-500 block mb-0.5">{key}</label>
            <input
              type="number"
              step="any"
              value={range[key]}
              onChange={(e) => setRange({ ...range, [key]: parseFloat(e.target.value) || 0 })}
              className="w-full bg-white border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-purple-500"
            />
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <label className="text-sm font-semibold flex items-center gap-2">
          <FunctionSquare size={16} className="text-cyan-400" />
          Ecuación — varias con ;
        </label>
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={eqInput}
            onChange={(e) => setEqInput(e.target.value)}
            onFocus={() => setShowKeyboard(true)}
            className={`w-full bg-white border ${error ? 'border-red-500' : 'border-slate-300'} rounded-lg px-4 py-2 pr-10 focus:outline-none focus:ring-2 focus:ring-cyan-500 font-mono text-sm shadow-sm`}
            placeholder="ej. sin(x)*sin(y)  ó  x^2+y^2=z"
          />
          {/* Botón teclado */}
          <button
            type="button"
            onClick={() => setShowKeyboard(v => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-purple-500 transition-colors"
            title="Teclado matemático"
          >
            <Keyboard size={16} />
          </button>
          {error && <span className="text-xs text-red-500 absolute -bottom-5 left-0">{error}</span>}
        </div>

        {/* Teclado matemático desplegable */}
        {showKeyboard && (
          <MathKeyboard
            inputRef={inputRef}
            value={eqInput}
            onChange={setEqInput}
            onEnter={() => setShowKeyboard(false)}
          />
        )}
      </div>

      <div className="w-full h-px bg-slate-200 my-2" />

      <div className="flex-1 space-y-4">
        <label className="text-sm font-semibold flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-red-500" />
          Puntos de Referencia
        </label>
        
        <form onSubmit={handleAddPoint} className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-3">
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-slate-500 mb-1 block">X</label>
              <input 
                type="number" step="any"
                value={newX} onChange={(e) => setNewX(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded p-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-slate-500 mb-1 block">Y</label>
              <input 
                type="number" step="any"
                value={newY} onChange={(e) => setNewY(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded p-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-slate-500 mb-1 block">Z</label>
              <input 
                type="number" step="any"
                value={newZ} onChange={(e) => setNewZ(e.target.value)}
                placeholder="auto"
                className="w-full bg-white border border-slate-200 rounded p-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
            </div>
          </div>
          <button 
            type="submit"
            className="w-full flex items-center justify-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-md py-1.5 text-sm transition-colors shadow-sm"
          >
            <Plus size={16} /> Añadir Punto
          </button>
        </form>

        <div className="space-y-2 mt-4">
          {points.length === 0 ? (
            <p className="text-xs text-slate-500 text-center italic">No hay puntos en la escena</p>
          ) : (
            points.map((pt) => (
              <div key={pt.id} className="flex items-center justify-between bg-white p-2 rounded border border-slate-200 hover:border-slate-300 transition-colors shadow-sm">
                <div className="font-mono text-xs text-slate-600">
                  ({pt.x.toFixed(1)}, {pt.y.toFixed(1)}, {pt.z.toFixed(1)})
                </div>
                <button 
                  onClick={() => removePoint(pt.id)}
                  className="text-slate-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

