/**
 * usePlotlyZoom — Reusable hook for mouse-wheel zoom on Plotly 3D/2D plots.
 *
 * Mirrors the zoom behaviour from PlotlyGraph (graficadora):
 *   • Mouse wheel expands / contracts the axis domain
 *   • Tick values automatically adapt to the new range (showing decimals)
 *   • Zoom-in / zoom-out / reset buttons supported via returned callbacks
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { tickValues, formatTick } from '../lib/cubeViewport';

export interface ViewDomain {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  zMin: number;
  zMax: number;
}

// ── Zoom constants ──────────────────────────────────────────────────────────────
const ZOOM_WHEEL_FACTOR = 1.12;
const ZOOM_BTN_IN       = 0.8;
const ZOOM_BTN_OUT      = 1.25;
const MIN_HALF_SPAN     = 0.1;
const MAX_HALF_SPAN     = 100;

function clampHalf(h: number) {
  return Math.max(MIN_HALF_SPAN, Math.min(MAX_HALF_SPAN, h));
}

function scaleDomain(d: ViewDomain, factor: number): ViewDomain {
  const cx = (d.xMin + d.xMax) / 2;
  const cy = (d.yMin + d.yMax) / 2;
  const cz = (d.zMin + d.zMax) / 2;
  const hx = clampHalf(((d.xMax - d.xMin) / 2) * factor);
  const hy = clampHalf(((d.yMax - d.yMin) / 2) * factor);
  const hz = clampHalf(((d.zMax - d.zMin) / 2) * factor);
  return {
    xMin: cx - hx, xMax: cx + hx,
    yMin: cy - hy, yMax: cy + hy,
    zMin: cz - hz, zMax: cz + hz,
  };
}

/**
 * Attach zoom behaviour to a Plotly chart container.
 *
 * @param plotRef  — React ref to the container `<div>` where Plotly is mounted
 * @param baseXMin / baseXMax / … — the "home" range (what Reset goes back to)
 * @param baseZMin / baseZMax     — optional; defaults to ±4
 */
export function usePlotlyZoom(
  plotRef: React.RefObject<HTMLDivElement | null>,
  baseXMin: number,
  baseXMax: number,
  baseYMin: number,
  baseYMax: number,
  baseZMin = -4,
  baseZMax = 4,
) {
  const makeBase = (): ViewDomain => ({
    xMin: baseXMin, xMax: baseXMax,
    yMin: baseYMin, yMax: baseYMax,
    zMin: baseZMin, zMax: baseZMax,
  });

  const [viewDomain, setViewDomain] = useState<ViewDomain>(makeBase);
  const baseRef = useRef(makeBase());

  // Keep base in sync when the inputs change
  useEffect(() => {
    const b = makeBase();
    baseRef.current = b;
    setViewDomain(b);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseXMin, baseXMax, baseYMin, baseYMax, baseZMin, baseZMax]);

  // ── Wheel handler ───────────────────────────────────────────────────────────
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const factor = e.deltaY > 0 ? ZOOM_WHEEL_FACTOR : 1 / ZOOM_WHEEL_FACTOR;
    setViewDomain(d => scaleDomain(d, factor));
  }, []);

  // Auto-attach / detach the wheel listener
  useEffect(() => {
    const el = plotRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [plotRef, handleWheel]);

  // ── Button handlers ─────────────────────────────────────────────────────────
  const zoomIn  = useCallback(() => setViewDomain(d => scaleDomain(d, ZOOM_BTN_IN)), []);
  const zoomOut = useCallback(() => setViewDomain(d => scaleDomain(d, ZOOM_BTN_OUT)), []);
  const reset   = useCallback(() => setViewDomain(baseRef.current), []);

  // ── Axis tick helper — returns { tickvals, ticktext } for a Plotly axis ────
  const axisTicks = useCallback((min: number, max: number) => {
    const vals = tickValues(min, max);
    return {
      tickvals: vals,
      ticktext: vals.map(formatTick),
    };
  }, []);

  return { viewDomain, zoomIn, zoomOut, reset, axisTicks } as const;
}
