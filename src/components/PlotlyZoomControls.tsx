import { useState } from 'react';
import { ZoomIn, ZoomOut, RotateCcw, Box } from 'lucide-react';
import type { ViewDomain } from '../hooks/usePlotlyZoom';
import Plotly from 'plotly.js-dist-min';

interface Props {
  viewDomain: ViewDomain;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  plotRef: React.RefObject<HTMLDivElement | null>;
}

const btnStyle: React.CSSProperties = {
  padding: 7,
  background: 'rgba(255,255,255,0.92)',
  border: '1px solid #e2e8f0',
  borderRadius: 8,
  boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
  cursor: 'pointer',
  color: '#475569',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'background 0.15s, color 0.15s',
};

export function PlotlyZoomControls({ viewDomain, onZoomIn, onZoomOut, onReset, plotRef }: Props) {
  const [isCloseUp, setIsCloseUp] = useState(false);

  const toggleCloseUp = () => {
    const gd = plotRef?.current;
    if (!gd) return;

    const layout = (gd as any).layout;
    const camera = layout?.scene?.camera;
    const eye = camera?.eye || { x: 1.5, y: 1.5, z: 1.0 };

    const { x, y, z } = eye;
    const d = Math.sqrt(x * x + y * y + z * z);

    // Toggle target distance
    const nextCloseUp = !isCloseUp;
    setIsCloseUp(nextCloseUp);

    // Close-up distance: ~1.15, Normal distance: ~2.3
    const targetD = nextCloseUp ? 1.15 : 2.3;
    const factor = targetD / d;

    const newEye = {
      x: x * factor,
      y: y * factor,
      z: z * factor
    };

    Plotly.relayout(gd, { 'scene.camera.eye': newEye });
  };

  return (
    <>
      {/* Zoom buttons — top-right corner */}
      <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', flexDirection: 'column', gap: 6, zIndex: 10 }}>
        <button
          onClick={onZoomIn}
          style={btnStyle}
          title="Acercar (Zoom In)"
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#f1f5f9'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.92)'; }}
        >
          <ZoomIn size={17} />
        </button>
        <button
          onClick={onZoomOut}
          style={btnStyle}
          title="Alejar (Zoom Out)"
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#f1f5f9'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.92)'; }}
        >
          <ZoomOut size={17} />
        </button>
        <button
          onClick={toggleCloseUp}
          style={{
            ...btnStyle,
            marginTop: 4,
            background: isCloseUp ? '#e0e7ff' : 'rgba(255,255,255,0.92)',
            color: isCloseUp ? '#4f46e5' : '#475569',
            borderColor: isCloseUp ? '#c7d2fe' : '#e2e8f0',
          }}
          title={isCloseUp ? "Vista cámara normal" : "Ver cubo de cerca"}
          onMouseEnter={e => { if (!isCloseUp) (e.currentTarget as HTMLButtonElement).style.background = '#f1f5f9'; }}
          onMouseLeave={e => { if (!isCloseUp) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.92)'; }}
        >
          <Box size={17} />
        </button>
        <button
          onClick={() => {
            setIsCloseUp(false);
            onReset();
          }}
          style={{ ...btnStyle, marginTop: 4 }}
          title="Restablecer vista (Reset)"
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#f1f5f9'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.92)'; }}
        >
          <RotateCcw size={17} />
        </button>
      </div>

      {/* Domain indicator — bottom-right */}
      <div style={{
        position: 'absolute',
        bottom: 10,
        right: 10,
        pointerEvents: 'none',
        fontSize: 11,
        color: '#64748b',
        background: 'rgba(255,255,255,0.9)',
        border: '1px solid #e2e8f0',
        borderRadius: 7,
        padding: '4px 10px',
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        fontFamily: 'JetBrains Mono, monospace',
        zIndex: 10,
      }}>
        x,y&thinsp;∈&thinsp;[{viewDomain.xMin.toFixed(1)},&thinsp;{viewDomain.xMax.toFixed(1)}]
        &nbsp;·&nbsp;Rueda: zoom
      </div>
    </>
  );
}
