import { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { Scene3D } from './components/Scene3D';
import { PlotlyGraph } from './components/PlotlyGraph';
import type { Point3DData, ViewMode } from './types';
import { DEFAULT_RANGE, type GraphMode, type GraphRange } from './lib/mathEngine';

function App() {
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
    <div className="w-full h-screen bg-slate-50 overflow-hidden relative font-sans flex">
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

export default App;
