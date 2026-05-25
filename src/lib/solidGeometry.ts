/**
 * solidGeometry.ts
 * Three.js BufferGeometry builders for domain-clipped solid regions.
 * Extracted for reuse across Cat1 and other math modules.
 */

import * as THREE from 'three';
import { safeCompile, evalNumber } from './mathEngine';
import type { DomainSpec } from './numericalIntegration';

// ─── Color palette ─────────────────────────────────────────────────────────────
export const SOLID_COLORS = {
  top:  new THREE.Color('hsl(174, 72%, 45%)'),
  bot:  new THREE.Color('hsl(174, 55%, 32%)'),
  side: new THREE.Color('hsl(174, 45%, 27%)'),
  wire: new THREE.Color('hsl(174, 30%, 18%)'),
} as const;

export const SOLID_OPACITY = 0.80;

export interface SolidBuildParams {
  topExpr: string;
  botExpr: string;
  domain: DomainSpec;
  N: number;
  showWire: boolean;
}

// ─── Geometry builders ─────────────────────────────────────────────────────────

function buildCapGeometry(
  xs: number[], ys: number[],
  valid: boolean[][], zGrid: number[][],
): THREE.BufferGeometry {
  const positions: number[] = [];
  const Nx = xs.length, Ny = ys.length;
  const push = (i: number, j: number) => { positions.push(xs[i], ys[j], zGrid[i][j]); };
  for (let i = 0; i < Nx - 1; i++) {
    for (let j = 0; j < Ny - 1; j++) {
      if (!valid[i][j] || !valid[i+1][j] || !valid[i][j+1] || !valid[i+1][j+1]) continue;
      push(i, j); push(i+1, j); push(i+1, j+1);
      push(i, j); push(i+1, j+1); push(i, j+1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

function buildRectSideWalls(
  xs: number[], ys: number[],
  valid: boolean[][], topGrid: number[][], botGrid: number[][],
): THREE.BufferGeometry {
  const pos: number[] = [];
  const Nx = xs.length, Ny = ys.length;
  const quad = (x0: number, y0: number, z0t: number, z0b: number,
                x1: number, y1: number, z1t: number, z1b: number) => {
    pos.push(x0,y0,z0b, x1,y1,z1b, x1,y1,z1t);
    pos.push(x0,y0,z0b, x1,y1,z1t, x0,y0,z0t);
  };
  for (let j = 0; j < Ny-1; j++) {
    if (valid[0][j] && valid[0][j+1])
      quad(xs[0],ys[j],topGrid[0][j],botGrid[0][j], xs[0],ys[j+1],topGrid[0][j+1],botGrid[0][j+1]);
  }
  for (let j = 0; j < Ny-1; j++) {
    if (valid[Nx-1][j] && valid[Nx-1][j+1])
      quad(xs[Nx-1],ys[j+1],topGrid[Nx-1][j+1],botGrid[Nx-1][j+1], xs[Nx-1],ys[j],topGrid[Nx-1][j],botGrid[Nx-1][j]);
  }
  for (let i = 0; i < Nx-1; i++) {
    if (valid[i][0] && valid[i+1][0])
      quad(xs[i+1],ys[0],topGrid[i+1][0],botGrid[i+1][0], xs[i],ys[0],topGrid[i][0],botGrid[i][0]);
  }
  for (let i = 0; i < Nx-1; i++) {
    if (valid[i][Ny-1] && valid[i+1][Ny-1])
      quad(xs[i],ys[Ny-1],topGrid[i][Ny-1],botGrid[i][Ny-1], xs[i+1],ys[Ny-1],topGrid[i+1][Ny-1],botGrid[i+1][Ny-1]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}

function buildCircleSideWalls(
  cx: number, cy: number, R: number,
  topFn: ReturnType<typeof safeCompile>,
  botFn: ReturnType<typeof safeCompile>,
  steps = 128,
): THREE.BufferGeometry {
  if (!topFn || !botFn) return new THREE.BufferGeometry();
  const pos: number[] = [];
  for (let k = 0; k < steps; k++) {
    const t0 = (k / steps) * 2 * Math.PI;
    const t1 = ((k+1) / steps) * 2 * Math.PI;
    const x0 = cx + R*Math.cos(t0), y0 = cy + R*Math.sin(t0);
    const x1 = cx + R*Math.cos(t1), y1 = cy + R*Math.sin(t1);
    const top0 = evalNumber(topFn, {x:x0,y:y0}) ?? 0;
    const bot0 = evalNumber(botFn, {x:x0,y:y0}) ?? 0;
    const top1 = evalNumber(topFn, {x:x1,y:y1}) ?? 0;
    const bot1 = evalNumber(botFn, {x:x1,y:y1}) ?? 0;
    pos.push(x0,y0,bot0, x1,y1,bot1, x1,y1,top1);
    pos.push(x0,y0,bot0, x1,y1,top1, x0,y0,top0);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}

function buildCustomSideWalls(
  xs: number[], ys: number[],
  valid: boolean[][], topGrid: number[][], botGrid: number[][],
  yMinFn: ReturnType<typeof safeCompile>,
  yMaxFn: ReturnType<typeof safeCompile>,
  topFn: ReturnType<typeof safeCompile>,
  botFn: ReturnType<typeof safeCompile>,
): THREE.BufferGeometry {
  if (!yMinFn || !yMaxFn || !topFn || !botFn) return new THREE.BufferGeometry();
  const pos: number[] = [];
  const Nx = xs.length, Ny = ys.length;
  const quad = (x0:number,y0:number,z0t:number,z0b:number,x1:number,y1:number,z1t:number,z1b:number) => {
    pos.push(x0,y0,z0b, x1,y1,z1b, x1,y1,z1t);
    pos.push(x0,y0,z0b, x1,y1,z1t, x0,y0,z0t);
  };
  for (let j=0; j<Ny-1; j++) {
    if (valid[0][j] && valid[0][j+1])
      quad(xs[0],ys[j+1],topGrid[0][j+1],botGrid[0][j+1], xs[0],ys[j],topGrid[0][j],botGrid[0][j]);
  }
  for (let j=0; j<Ny-1; j++) {
    if (valid[Nx-1][j] && valid[Nx-1][j+1])
      quad(xs[Nx-1],ys[j],topGrid[Nx-1][j],botGrid[Nx-1][j], xs[Nx-1],ys[j+1],topGrid[Nx-1][j+1],botGrid[Nx-1][j+1]);
  }
  for (let i=0; i<Nx-1; i++) {
    const x0=xs[i], x1=xs[i+1];
    const ylo0 = evalNumber(yMinFn,{x:x0}) ?? 0;
    const ylo1 = evalNumber(yMinFn,{x:x1}) ?? 0;
    const yhi0 = evalNumber(yMaxFn,{x:x0}) ?? 0;
    const yhi1 = evalNumber(yMaxFn,{x:x1}) ?? 0;
    quad(x1,ylo1,evalNumber(topFn,{x:x1,y:ylo1})??0,evalNumber(botFn,{x:x1,y:ylo1})??0,
         x0,ylo0,evalNumber(topFn,{x:x0,y:ylo0})??0,evalNumber(botFn,{x:x0,y:ylo0})??0);
    quad(x0,yhi0,evalNumber(topFn,{x:x0,y:yhi0})??0,evalNumber(botFn,{x:x0,y:yhi0})??0,
         x1,yhi1,evalNumber(topFn,{x:x1,y:yhi1})??0,evalNumber(botFn,{x:x1,y:yhi1})??0);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}

// ─── Main export ───────────────────────────────────────────────────────────────

export function buildSolidObjects(p: SolidBuildParams): THREE.Object3D[] {
  const { topExpr, botExpr, domain, N, showWire } = p;
  const topFn = safeCompile(topExpr);
  const botFn = safeCompile(botExpr);
  if (!topFn || !botFn) return [];

  let xMin: number, xMax: number, yMin: number, yMax: number;
  if (domain.type === 'rect') {
    ({ xMin, xMax, yMin, yMax } = domain);
  } else if (domain.type === 'circle') {
    xMin = domain.cx - domain.R; xMax = domain.cx + domain.R;
    yMin = domain.cy - domain.R; yMax = domain.cy + domain.R;
  } else {
    ({ xMin, xMax } = domain);
    yMin = -2; yMax = 2; // placeholder, will be overridden
  }

  const xs: number[] = [];
  for (let i = 0; i < N; i++) xs.push(xMin + (i / (N-1)) * (xMax - xMin));

  if (domain.type === 'custom') {
    const yMinFn = safeCompile(domain.yMinExpr);
    const yMaxFn = safeCompile(domain.yMaxExpr);
    let lo = Infinity, hi = -Infinity;
    if (yMinFn && yMaxFn) {
      for (const x of xs) {
        const a = evalNumber(yMinFn, { x }) ?? 0;
        const b = evalNumber(yMaxFn, { x }) ?? 0;
        if (a < lo) lo = a; if (b > hi) hi = b;
      }
    }
    yMin = isFinite(lo) ? lo : -2;
    yMax = isFinite(hi) ? hi :  2;
  }

  const ys: number[] = [];
  for (let j = 0; j < N; j++) ys.push(yMin + (j / (N-1)) * (yMax - yMin));

  const valid   = Array.from({ length: N }, () => new Array<boolean>(N).fill(false));
  const topGrid = Array.from({ length: N }, () => new Array<number>(N).fill(0));
  const botGrid = Array.from({ length: N }, () => new Array<number>(N).fill(0));
  let yMinFnCache: ReturnType<typeof safeCompile> | null = null;
  let yMaxFnCache: ReturnType<typeof safeCompile> | null = null;
  if (domain.type === 'custom') {
    yMinFnCache = safeCompile(domain.yMinExpr);
    yMaxFnCache = safeCompile(domain.yMaxExpr);
  }

  for (let i = 0; i < N; i++) {
    const x = xs[i];
    for (let j = 0; j < N; j++) {
      const y = ys[j];
      let inside = false;
      if (domain.type === 'rect') { inside = true; }
      else if (domain.type === 'circle') {
        const dx = x - domain.cx, dy = y - domain.cy;
        inside = dx*dx + dy*dy <= domain.R * domain.R;
      } else if (domain.type === 'custom') {
        const lo = yMinFnCache ? (evalNumber(yMinFnCache, { x }) ?? -Infinity) : -Infinity;
        const hi = yMaxFnCache ? (evalNumber(yMaxFnCache, { x }) ??  Infinity) :  Infinity;
        inside = y >= lo && y <= hi;
      }
      if (!inside) continue;
      const t = evalNumber(topFn, { x, y });
      const b = evalNumber(botFn, { x, y });
      if (t === null || b === null) continue;
      valid[i][j] = true;
      topGrid[i][j] = t;
      botGrid[i][j] = b;
    }
  }

  const mat = (col: THREE.Color) =>
    new THREE.MeshPhongMaterial({ color: col, side: THREE.DoubleSide, transparent: true, opacity: SOLID_OPACITY, depthWrite: false });
  const matTop  = mat(SOLID_COLORS.top);
  const matBot  = mat(SOLID_COLORS.bot);
  const matSide = mat(SOLID_COLORS.side);
  const matWire = new THREE.LineBasicMaterial({ color: SOLID_COLORS.wire, transparent: true, opacity: 0.35 });

  const objs: THREE.Object3D[] = [];

  const topGeo = buildCapGeometry(xs, ys, valid, topGrid);
  if (topGeo.getAttribute('position').count > 0) {
    objs.push(new THREE.Mesh(topGeo, matTop));
    if (showWire) objs.push(new THREE.LineSegments(new THREE.WireframeGeometry(topGeo), matWire));
  }
  const botGeo = buildCapGeometry(xs, ys, valid, botGrid);
  if (botGeo.getAttribute('position').count > 0) objs.push(new THREE.Mesh(botGeo, matBot));

  let sideGeo: THREE.BufferGeometry;
  if (domain.type === 'rect') {
    sideGeo = buildRectSideWalls(xs, ys, valid, topGrid, botGrid);
  } else if (domain.type === 'circle') {
    sideGeo = buildCircleSideWalls(domain.cx, domain.cy, domain.R, topFn, botFn, 128);
  } else {
    sideGeo = buildCustomSideWalls(xs, ys, valid, topGrid, botGrid, yMinFnCache, yMaxFnCache, topFn, botFn);
  }
  if (sideGeo.getAttribute('position')?.count > 0) objs.push(new THREE.Mesh(sideGeo, matSide));

  return objs;
}

/** Dispose all geometry/materials in a group */
export function disposeGroup(group: THREE.Group): void {
  group.traverse(obj => {
    if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
      obj.geometry.dispose();
      const m = obj.material;
      if (Array.isArray(m)) m.forEach(x => x.dispose()); else m.dispose();
    }
  });
  group.clear();
}
