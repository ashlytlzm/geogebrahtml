/**
 * IsoViewer.tsx
 * React wrapper around createIsoScene.
 * Pass onReady to receive IsoSceneHandles; add/remove geometry via solidGroup.
 */

import { useRef, useEffect } from 'react';
import { RotateCcw } from 'lucide-react';
import { createIsoScene, type IsoSceneHandles } from '../lib/isoScene';

interface IsoViewerProps {
  /** Called once after the scene is initialized */
  onReady: (handles: IsoSceneHandles) => void;
  dark?: boolean;
  /** Overlay elements rendered on top of the canvas */
  children?: React.ReactNode;
}

/**
 * IsoViewer — Renders a Three.js isometric scene inside a full-size div.
 * Parent receives handles via onReady and uses solidGroup to add geometry.
 */
export function IsoViewer({ onReady, dark = true, children }: IsoViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const handlesRef   = useRef<IsoSceneHandles | null>(null);
  const onReadyRef   = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    // Defer one tick so container has final layout dimensions
    const id = setTimeout(() => {
      const h = createIsoScene(el, dark);
      handlesRef.current = h;
      onReadyRef.current(h);
    }, 0);
    return () => {
      clearTimeout(id);
      handlesRef.current?.dispose();
      handlesRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dark]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* Reset-view button */}
      <button
        onClick={() => handlesRef.current?.resetView()}
        title="Restablecer vista isométrica"
        style={{
          position: 'absolute', top: 10, left: 10,
          background: 'rgba(15,23,42,0.78)',
          backdropFilter: 'blur(6px)',
          border: '1px solid rgba(255,255,255,0.12)',
          color: '#94a3b8',
          borderRadius: 8, padding: '5px 10px',
          cursor: 'pointer', fontSize: 11, fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 5,
          transition: 'color .15s',
          fontFamily: "'Inter', sans-serif",
        }}
        onMouseEnter={e => (e.currentTarget.style.color = '#e2e8f0')}
        onMouseLeave={e => (e.currentTarget.style.color = '#94a3b8')}
      >
        <RotateCcw size={12} /> Reset
      </button>

      {/* Axis legend */}
      <div style={{
        position: 'absolute', top: 10, right: 10,
        background: 'rgba(15,23,42,0.78)',
        backdropFilter: 'blur(6px)',
        border: '1px solid rgba(255,255,255,0.10)',
        borderRadius: 8, padding: '8px 12px',
        fontSize: 10, fontWeight: 700,
        fontFamily: "'Inter', sans-serif",
        display: 'flex', flexDirection: 'column', gap: 3,
        pointerEvents: 'none',
        letterSpacing: '0.04em',
      }}>
        {[
          { label: '+X', color: '#ef4444' }, { label: '−X', color: '#fca5a5' },
          { label: '+Y', color: '#22c55e' }, { label: '−Y', color: '#86efac' },
          { label: '+Z', color: '#3b82f6' }, { label: '−Z', color: '#93c5fd' },
        ].map(({ label, color }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
            <span style={{ color }}>{label}</span>
          </div>
        ))}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: 3, paddingTop: 4, color: '#475569', fontSize: 9 }}>
          🖱 drag · scroll · right-pan
        </div>
      </div>

      {children}
    </div>
  );
}
