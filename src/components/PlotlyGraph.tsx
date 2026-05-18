import { useCallback, useEffect, useRef, useState } from 'react';
import Plotly from 'plotly.js-dist-min';
import type { Config } from 'plotly.js';
import type { Point3DData } from '../types';
import { buildPlot } from '../lib/plotBuilder';
import { expandViewDomain, INITIAL_VIEW_DOMAIN } from '../lib/cubeViewport';
import { FIXED_CAMERA } from '../lib/scene3dStyle';
import type { GraphMode, GraphRange } from '../lib/mathEngine';
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

interface PlotlyGraphProps {
  equation: string;
  mode: GraphMode;
  range: GraphRange;
  points: Point3DData[];
}

function mergeViewDomain(base: GraphRange): GraphRange {
  return {
    ...base,
    xMin: INITIAL_VIEW_DOMAIN.xMin,
    xMax: INITIAL_VIEW_DOMAIN.xMax,
    yMin: INITIAL_VIEW_DOMAIN.yMin,
    yMax: INITIAL_VIEW_DOMAIN.yMax,
    zMin: INITIAL_VIEW_DOMAIN.zMin,
    zMax: INITIAL_VIEW_DOMAIN.zMax,
  };
}

type SceneCamera = typeof FIXED_CAMERA;

export function PlotlyGraph({ equation, mode, range, points }: PlotlyGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<SceneCamera>(FIXED_CAMERA);
  const [viewDomain, setViewDomain] = useState<GraphRange>(() => mergeViewDomain(range));

  useEffect(() => {
    setViewDomain((prev) => ({
      ...prev,
      samples2d: range.samples2d,
      samples3d: range.samples3d,
    }));
  }, [range.samples2d, range.samples3d]);

  useEffect(() => {
    setViewDomain((prev) => ({
      ...prev,
      xMin: range.xMin,
      xMax: range.xMax,
      yMin: range.yMin,
      yMax: range.yMax,
      zMin: range.xMin, // Keep Z same scale as X
      zMax: range.xMax,
    }));
  }, [range.xMin, range.xMax, range.yMin, range.yMax]);

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const zoomOut = e.deltaY > 0;
    setViewDomain((d) => expandViewDomain(d, zoomOut));
  }, []);

  const handleZoom = useCallback((zoomOut: boolean) => {
    const el = containerRef.current;
    if (!el) return;
    const factor = zoomOut ? 1.25 : 0.8;
    const cam = cameraRef.current;
    if (cam && cam.eye) {
      const newEye = {
        x: cam.eye.x * factor,
        y: cam.eye.y * factor,
        z: cam.eye.z * factor,
      };
      cameraRef.current = { ...cam, eye: newEye };
      Plotly.relayout(el, { 'scene.camera': cameraRef.current });
    }
  }, []);

  const handleReset = useCallback(() => {
    setViewDomain(mergeViewDomain(range));
    cameraRef.current = FIXED_CAMERA;
    const el = containerRef.current;
    if (el) {
      Plotly.relayout(el, { 'scene.camera': FIXED_CAMERA });
    }
  }, [range]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const { data, layout, config, error, resolvedMode } = buildPlot(
      equation,
      mode,
      viewDomain,
      points,
      cameraRef.current,
    );

    const plotConfig: Partial<Config> = {
      ...config,
      scrollZoom: resolvedMode !== 'surface3d',
      doubleClick: false,
      displaylogo: false,
    };

    const draw = () => {
      if (error && data.length === 0) {
        Plotly.react(el, [], layout, plotConfig);
        return;
      }
      Plotly.react(el, data, layout, plotConfig);
    };

    draw();

    const onRelayout = (ev: Plotly.PlotRelayoutEvent) => {
      const cam = (ev as Record<string, unknown>)['scene.camera'];
      if (cam && typeof cam === 'object') {
        cameraRef.current = cam as SceneCamera;
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: false });

    const plotEl = el as unknown as {
      on: (event: string, fn: (ev: Plotly.PlotRelayoutEvent) => void) => void;
      removeAllListeners: (event: string) => void;
    };
    plotEl.on('plotly_relayout', onRelayout);

    const onResize = () => Plotly.Plots.resize(el);
    window.addEventListener('resize', onResize);

    return () => {
      el.removeEventListener('wheel', handleWheel);
      plotEl.removeAllListeners('plotly_relayout');
      window.removeEventListener('resize', onResize);
      Plotly.purge(el);
    };
  }, [equation, mode, viewDomain, points, handleWheel]);

  return (
    <div className="relative w-full h-full min-h-0">
      <div
        ref={containerRef}
        className="w-full h-full bg-white"
        style={{ touchAction: 'none', overscrollBehavior: 'contain' }}
      />
      <div className="absolute top-4 right-4 flex flex-col gap-2 z-10">
        <button
          onClick={() => handleZoom(false)}
          className="p-2 bg-white/90 border border-slate-200 rounded-lg shadow-sm hover:bg-slate-50 text-slate-600 transition-colors"
          title="Acercar (Zoom In)"
        >
          <ZoomIn size={18} />
        </button>
        <button
          onClick={() => handleZoom(true)}
          className="p-2 bg-white/90 border border-slate-200 rounded-lg shadow-sm hover:bg-slate-50 text-slate-600 transition-colors"
          title="Alejar (Zoom Out)"
        >
          <ZoomOut size={18} />
        </button>
        <button
          onClick={handleReset}
          className="p-2 bg-white/90 border border-slate-200 rounded-lg shadow-sm hover:bg-slate-50 text-slate-600 transition-colors mt-2"
          title="Restablecer vista (Reset)"
        >
          <RotateCcw size={18} />
        </button>
      </div>
      <div className="absolute bottom-3 right-3 pointer-events-none text-[11px] text-slate-600 bg-white/90 border border-slate-200 rounded-md px-2.5 py-1.5 shadow-sm font-mono">
        x,y ∈ [{viewDomain.xMin.toFixed(1)}, {viewDomain.xMax.toFixed(1)}] · Rueda: dominio · Arrastrar: rotar
      </div>
    </div>
  );
}
