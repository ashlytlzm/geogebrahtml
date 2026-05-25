import { useState, useEffect } from 'react';
// ── Existing Grapher tab (UNCHANGED) ──────────────────────────────────────
import { Sidebar } from './components/Sidebar';
import { Scene3D } from './components/Scene3D';
import { PlotlyGraph } from './components/PlotlyGraph';
import type { Point3DData, ViewMode } from './types';
import { DEFAULT_RANGE, type GraphMode, type GraphRange } from './lib/mathEngine';
// ── New modules ───────────────────────────────────────────────────────────
import { SurfaceVolumeModule } from './modules/SurfaceVolumeModule';
import { IntegralsModule } from './modules/IntegralsModule';
import { CoordinatesModule } from './modules/CoordinatesModule';
import { VectorFieldModule } from './modules/VectorFieldModule';
import { TheoremsModule } from './modules/TheoremsModule';
import { GradientModule } from './modules/GradientModule';
import { SolidVolumeModule } from './modules/SolidVolumeModule';

// ─── Tab definitions ──────────────────────────────────────────────────────
type TabId =
  | 'grapher'
  | 'superficies'
  | 'integrales'
  | 'coordenadas'
  | 'campos'
  | 'teoremas'
  | 'gradiente'
  | 'solido';

interface Tab {
  id: TabId;
  icon: string;
  label: string;
  color: string;
}

const TABS: Tab[] = [
  { id: 'grapher',     icon: '📊', label: 'Graficador',      color: '#2563eb' },
  { id: 'superficies', icon: '🔷', label: 'Superficies',     color: '#0891b2' },
  { id: 'integrales',  icon: '∫',  label: 'Integrales',      color: '#7c3aed' },
  { id: 'coordenadas', icon: '🌐', label: 'Coordenadas',     color: '#059669' },
  { id: 'campos',      icon: '🌀', label: 'Campos Vectoriales', color: '#db2777' },
  { id: 'teoremas',    icon: '📐', label: 'Teoremas',         color: '#d97706' },
  { id: 'gradiente',   icon: '∇',  label: 'Gradiente',        color: '#dc2626' },
  { id: 'solido',      icon: '🧊', label: 'Sólido',           color: '#0d9488' },
];

// ─── Grapher Tab (keeps existing unchanged logic) ─────────────────────────
function GrapherTab() {
  const [equation, setEquation] = useState<string>('sin(x) * sin(y)');
  const [points, setPoints] = useState<Point3DData[]>([
    { id: '1', x: 0, y: 0, z: 1 },
  ]);
  const [viewMode, setViewMode] = useState<ViewMode>('plotly');
  const [graphMode, setGraphMode] = useState<GraphMode>('auto');
  const [range, setRange] = useState<GraphRange>(DEFAULT_RANGE);

  const addPoint = (pt: Omit<Point3DData, 'id'>) => {
    setPoints((prev) => [...prev, { ...pt, id: Date.now().toString() }]);
  };
  const removePoint = (id: string) => {
    setPoints((prev) => prev.filter((p) => p.id !== id));
  };

  return (
    <div className="w-full h-full bg-slate-50 overflow-hidden relative font-sans flex">
      <Sidebar
        equation={equation}
        setEquation={setEquation}
        points={points}
        addPoint={addPoint}
        removePoint={removePoint}
        viewMode={viewMode}
        setViewMode={setViewMode}
        graphMode={graphMode}
        setGraphMode={setGraphMode}
        range={range}
        setRange={setRange}
      />
      <main className="flex-1 h-full ml-80 min-w-0 relative">
        {viewMode === 'plotly' ? (
          <PlotlyGraph
             equation={equation}
             mode={graphMode}
             range={range}
             points={points}
          />
        ) : (
          <Scene3D equation={equation} points={points} />
        )}
      </main>
    </div>
  );
}

// ─── App Root ─────────────────────────────────────────────────────────────
function App() {
  const [activeTab, setActiveTab] = useState<TabId>('grapher');

  // Trigger resize event when tab switches so Plotly graphs recalculate sizes to fill display: block elements
  useEffect(() => {
    const timer = setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 50);
    return () => clearTimeout(timer);
  }, [activeTab]);

  return (
    <div className="app-shell">
      {/* ── Tab Bar ── */}
      <nav className="tab-bar" role="tablist">
        <span className="tab-bar-logo">Calc 3D</span>
        <div className="tab-bar-divider" />
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`tab-btn${activeTab === tab.id ? ' active' : ''}`}
            style={activeTab === tab.id ? {
              color: tab.color,
              boxShadow: `inset 0 -2px 0 ${tab.color}`,
            } : {}}
          >
            <span className="tab-icon" aria-hidden="true">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </nav>

      {/* ── Tab Content (persists DOM to save state) ── */}
      <div className="tab-content">
        <div style={{ display: activeTab === 'grapher' ? 'block' : 'none', width: '100%', height: '100%' }}>
          <GrapherTab />
        </div>
        <div style={{ display: activeTab === 'superficies' ? 'block' : 'none', width: '100%', height: '100%' }}>
          <SurfaceVolumeModule />
        </div>
        <div style={{ display: activeTab === 'integrales' ? 'block' : 'none', width: '100%', height: '100%' }}>
          <IntegralsModule />
        </div>
        <div style={{ display: activeTab === 'coordenadas' ? 'block' : 'none', width: '100%', height: '100%' }}>
          <CoordinatesModule />
        </div>
        <div style={{ display: activeTab === 'campos' ? 'block' : 'none', width: '100%', height: '100%' }}>
          <VectorFieldModule />
        </div>
        <div style={{ display: activeTab === 'teoremas' ? 'block' : 'none', width: '100%', height: '100%' }}>
          <TheoremsModule />
        </div>
        <div style={{ display: activeTab === 'gradiente' ? 'block' : 'none', width: '100%', height: '100%' }}>
          <GradientModule />
        </div>
        <div style={{ display: activeTab === 'solido' ? 'block' : 'none', width: '100%', height: '100%' }}>
          <SolidVolumeModule />
        </div>
      </div>
    </div>
  );
}

export default App;
