/**
 * SolidVolumeModule.tsx
 * Renders the closed 3D solid bounded by z=f(x,y) (top) and z=g(x,y) (bottom)
 * over a user-defined domain D, using raw Three.js BufferGeometry.
 * No geometry is emitted outside the domain — clean boundary clipping by construction.
 */

import { useRef, useState, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { MathKeyboard } from '../components/MathKeyboard';
import { StepPanel } from '../components/StepPanel';
import { safeCompile, evalNumber } from '../lib/mathEngine';
import { computeVolumeSolid, type DomainSpec } from '../lib/numericalIntegration';
import { Layers, Keyboard, RotateCcw } from 'lucide-react';
import { AXIS_HEX } from '../lib/isoScene';
import katex from 'katex';
import 'katex/dist/katex.min.css';

// ─── Teal palette ─────────────────────────────────────────────────────────────
const COLOR_TOP   = new THREE.Color('hsl(174, 72%, 45%)');
const COLOR_BOT   = new THREE.Color('hsl(174, 55%, 32%)');
const COLOR_SIDE  = new THREE.Color('hsl(174, 45%, 27%)');
const COLOR_WIRE  = new THREE.Color('hsl(174, 30%, 18%)');
const OPACITY     = 0.82;

// ─── KaTeX inline renderer ─────────────────────────────────────────────────────
function MathInline({ latex }: { latex: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    try {
      katex.render(latex, ref.current, { displayMode: false, throwOnError: false, strict: false });
    } catch {
      if (ref.current) ref.current.textContent = latex;
    }
  }, [latex]);
  return <span ref={ref} />;
}

// ─── Types ─────────────────────────────────────────────────────────────────────
type DomainType = 'rect' | 'circle' | 'custom';

// ─── Geometry builders ─────────────────────────────────────────────────────────

/**
 * Build top or bottom cap geometry from a grid sampled over D.
 * `zFn` returns the z value for a given vertex index.
 * Triangles are only emitted when all 4 corners of a quad are valid.
 */
function buildCapGeometry(
  xs: number[], ys: number[],
  valid: boolean[][],       // valid[i][j] — i=col(x), j=row(y)
  zGrid: number[][],        // zGrid[i][j]
): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[]   = [];
  const Nx = xs.length;
  const Ny = ys.length;

  const push = (i: number, j: number) => {
    positions.push(xs[i], ys[j], zGrid[i][j]);
    normals.push(0, 0, 1);
  };

  for (let i = 0; i < Nx - 1; i++) {
    for (let j = 0; j < Ny - 1; j++) {
      if (!valid[i][j] || !valid[i+1][j] || !valid[i][j+1] || !valid[i+1][j+1]) continue;
      // Two triangles per quad (counter-clockwise for top face)
      push(i,   j  ); push(i+1, j  ); push(i+1, j+1);
      push(i,   j  ); push(i+1, j+1); push(i,   j+1);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal',   new THREE.Float32BufferAttribute(normals,   3));
  geo.computeVertexNormals();
  return geo;
}

/**
 * Build side wall geometry for a rectangular domain.
 * Walks the 4 edges and emits vertical quads from g(x,y) to f(x,y).
 */
function buildRectSideWalls(
  xs: number[], ys: number[],
  valid: boolean[][],
  topGrid: number[][], botGrid: number[][],
): THREE.BufferGeometry {
  const positions: number[] = [];
  const Nx = xs.length;
  const Ny = ys.length;

  const quad = (
    x0: number, y0: number, z0t: number, z0b: number,
    x1: number, y1: number, z1t: number, z1b: number,
  ) => {
    // Two triangles forming a vertical quad
    positions.push(x0, y0, z0b, x1, y1, z1b, x1, y1, z1t);
    positions.push(x0, y0, z0b, x1, y1, z1t, x0, y0, z0t);
  };

  // Left edge: x = xs[0], sweep j
  for (let j = 0; j < Ny - 1; j++) {
    if (!valid[0][j] || !valid[0][j+1]) continue;
    quad(xs[0], ys[j], topGrid[0][j], botGrid[0][j],
         xs[0], ys[j+1], topGrid[0][j+1], botGrid[0][j+1]);
  }
  // Right edge: x = xs[Nx-1]
  for (let j = 0; j < Ny - 1; j++) {
    if (!valid[Nx-1][j] || !valid[Nx-1][j+1]) continue;
    quad(xs[Nx-1], ys[j+1], topGrid[Nx-1][j+1], botGrid[Nx-1][j+1],
         xs[Nx-1], ys[j],   topGrid[Nx-1][j],   botGrid[Nx-1][j]);
  }
  // Bottom edge: y = ys[0], sweep i
  for (let i = 0; i < Nx - 1; i++) {
    if (!valid[i][0] || !valid[i+1][0]) continue;
    quad(xs[i+1], ys[0], topGrid[i+1][0], botGrid[i+1][0],
         xs[i],   ys[0], topGrid[i][0],   botGrid[i][0]);
  }
  // Top edge: y = ys[Ny-1]
  for (let i = 0; i < Nx - 1; i++) {
    if (!valid[i][Ny-1] || !valid[i+1][Ny-1]) continue;
    quad(xs[i], ys[Ny-1], topGrid[i][Ny-1], botGrid[i][Ny-1],
         xs[i+1], ys[Ny-1], topGrid[i+1][Ny-1], botGrid[i+1][Ny-1]);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

/**
 * Build side wall geometry for circular or custom domain boundaries.
 * Detects boundary quads (quads where exactly some corners are invalid) and emits
 * the corresponding side face.
 * Also builds the outer ring wall at domain boundary via a separate 128-step loop.
 */
function buildCircleSideWalls(
  cx: number, cy: number, R: number,
  topFn: ReturnType<typeof safeCompile>,
  botFn:  ReturnType<typeof safeCompile>,
  steps = 128,
): THREE.BufferGeometry {
  if (!topFn || !botFn) return new THREE.BufferGeometry();
  const positions: number[] = [];

  for (let k = 0; k < steps; k++) {
    const t0 = (k / steps) * 2 * Math.PI;
    const t1 = ((k + 1) / steps) * 2 * Math.PI;
    const x0 = cx + R * Math.cos(t0), y0 = cy + R * Math.sin(t0);
    const x1 = cx + R * Math.cos(t1), y1 = cy + R * Math.sin(t1);

    const top0 = evalNumber(topFn, { x: x0, y: y0 }) ?? 0;
    const bot0 = evalNumber(botFn, { x: x0, y: y0 }) ?? 0;
    const top1 = evalNumber(topFn, { x: x1, y: y1 }) ?? 0;
    const bot1 = evalNumber(botFn, { x: x1, y: y1 }) ?? 0;

    // Outward-facing quad: (x0,y0,bot0) → (x1,y1,bot1) → (x1,y1,top1) → (x0,y0,top0)
    positions.push(x0, y0, bot0, x1, y1, bot1, x1, y1, top1);
    positions.push(x0, y0, bot0, x1, y1, top1, x0, y0, top0);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

/**
 * Build boundary side walls for custom y-bound domains.
 * Emits walls along x=xMin, x=xMax, and along the y-bound curves.
 */
function buildCustomSideWalls(
  xs: number[], ys: number[],
  valid: boolean[][],
  topGrid: number[][], botGrid: number[][],
  yMinFn: ReturnType<typeof safeCompile>,
  yMaxFn: ReturnType<typeof safeCompile>,
  topFn: ReturnType<typeof safeCompile>,
  botFn: ReturnType<typeof safeCompile>,
): THREE.BufferGeometry {
  if (!yMinFn || !yMaxFn || !topFn || !botFn) return new THREE.BufferGeometry();
  const positions: number[] = [];
  const Nx = xs.length;
  const Ny = ys.length;

  const quad = (
    x0: number, y0: number, z0t: number, z0b: number,
    x1: number, y1: number, z1t: number, z1b: number,
  ) => {
    positions.push(x0, y0, z0b, x1, y1, z1b, x1, y1, z1t);
    positions.push(x0, y0, z0b, x1, y1, z1t, x0, y0, z0t);
  };

  // Left wall x=xMin (outermost valid column, left face)
  for (let j = 0; j < Ny - 1; j++) {
    if (!valid[0][j] || !valid[0][j+1]) continue;
    quad(xs[0], ys[j+1], topGrid[0][j+1], botGrid[0][j+1],
         xs[0], ys[j],   topGrid[0][j],   botGrid[0][j]);
  }
  // Right wall x=xMax
  for (let j = 0; j < Ny - 1; j++) {
    if (!valid[Nx-1][j] || !valid[Nx-1][j+1]) continue;
    quad(xs[Nx-1], ys[j], topGrid[Nx-1][j], botGrid[Nx-1][j],
         xs[Nx-1], ys[j+1], topGrid[Nx-1][j+1], botGrid[Nx-1][j+1]);
  }

  // Along y-bound curves: detect where valid[i][j] = true but valid[i][j-1] = false (lower boundary)
  for (let i = 0; i < Nx - 1; i++) {
    const x0 = xs[i], x1 = xs[i+1];
    const ylo0 = evalNumber(yMinFn, { x: x0 }) ?? 0;
    const ylo1 = evalNumber(yMinFn, { x: x1 }) ?? 0;
    const yhi0 = evalNumber(yMaxFn, { x: x0 }) ?? 0;
    const yhi1 = evalNumber(yMaxFn, { x: x1 }) ?? 0;

    const t_lo0 = evalNumber(topFn, { x: x0, y: ylo0 }) ?? 0;
    const b_lo0 = evalNumber(botFn, { x: x0, y: ylo0 }) ?? 0;
    const t_lo1 = evalNumber(topFn, { x: x1, y: ylo1 }) ?? 0;
    const b_lo1 = evalNumber(botFn, { x: x1, y: ylo1 }) ?? 0;
    // lower wall
    quad(x1, ylo1, t_lo1, b_lo1, x0, ylo0, t_lo0, b_lo0);

    const t_hi0 = evalNumber(topFn, { x: x0, y: yhi0 }) ?? 0;
    const b_hi0 = evalNumber(botFn, { x: x0, y: yhi0 }) ?? 0;
    const t_hi1 = evalNumber(topFn, { x: x1, y: yhi1 }) ?? 0;
    const b_hi1 = evalNumber(botFn, { x: x1, y: yhi1 }) ?? 0;
    // upper wall
    quad(x0, yhi0, t_hi0, b_hi0, x1, yhi1, t_hi1, b_hi1);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

// ─── Scene builder ─────────────────────────────────────────────────────────────

interface BuildParams {
  topExpr: string;
  botExpr: string;
  domain: DomainSpec;
  N: number;
  showWire: boolean;
}

function buildSolidObjects(p: BuildParams): THREE.Object3D[] {
  const { topExpr, botExpr, domain, N, showWire } = p;
  const topFn = safeCompile(topExpr);
  const botFn = safeCompile(botExpr);
  if (!topFn || !botFn) return [];

  // Sample grid (always rectangular bounding box; valid[][] masks the domain)
  let xMin: number, xMax: number, yMin: number, yMax: number;
  if (domain.type === 'rect') {
    ({ xMin, xMax, yMin, yMax } = domain);
  } else if (domain.type === 'circle') {
    xMin = domain.cx - domain.R; xMax = domain.cx + domain.R;
    yMin = domain.cy - domain.R; yMax = domain.cy + domain.R;
  } else {
    ({ xMin, xMax } = domain);
    yMin = -Infinity; yMax = Infinity;
    // Will compute yBounds per-column
  }

  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < N; i++) {
    xs.push(xMin + (i / (N - 1)) * (xMax - xMin));
  }

  // For custom domain: global y range from sampling yMin/yMax expressions
  if (domain.type === 'custom') {
    const yMinFn = safeCompile(domain.yMinExpr);
    const yMaxFn = safeCompile(domain.yMaxExpr);
    let lo = Infinity, hi = -Infinity;
    if (yMinFn && yMaxFn) {
      for (const x of xs) {
        const a = evalNumber(yMinFn, { x }) ?? 0;
        const b = evalNumber(yMaxFn, { x }) ?? 0;
        if (a < lo) lo = a;
        if (b > hi) hi = b;
      }
    }
    yMin = isFinite(lo) ? lo : -2;
    yMax = isFinite(hi) ? hi :  2;
  }

  for (let j = 0; j < N; j++) {
    ys.push(yMin + (j / (N - 1)) * (yMax - yMin));
  }

  // valid[i][j], topGrid[i][j], botGrid[i][j]
  const valid:   boolean[][] = Array.from({ length: N }, () => new Array(N).fill(false));
  const topGrid: number[][]  = Array.from({ length: N }, () => new Array(N).fill(0));
  const botGrid: number[][]  = Array.from({ length: N }, () => new Array(N).fill(0));

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
      let inDomain = false;
      if (domain.type === 'rect') {
        inDomain = true; // all grid points are within rect by construction
      } else if (domain.type === 'circle') {
        const dx = x - domain.cx, dy = y - domain.cy;
        inDomain = dx * dx + dy * dy <= domain.R * domain.R;
      } else if (domain.type === 'custom') {
        const lo = yMinFnCache ? (evalNumber(yMinFnCache, { x }) ?? -Infinity) : -Infinity;
        const hi = yMaxFnCache ? (evalNumber(yMaxFnCache, { x }) ??  Infinity) :  Infinity;
        inDomain = y >= lo && y <= hi;
      }
      if (!inDomain) continue;
      const t = evalNumber(topFn, { x, y });
      const b = evalNumber(botFn, { x, y });
      if (t === null || b === null) continue;
      valid[i][j]   = true;
      topGrid[i][j] = t;
      botGrid[i][j] = b;
    }
  }

  const matTop  = new THREE.MeshPhongMaterial({ color: COLOR_TOP,  side: THREE.DoubleSide, transparent: true, opacity: OPACITY, depthWrite: false });
  const matBot  = new THREE.MeshPhongMaterial({ color: COLOR_BOT,  side: THREE.DoubleSide, transparent: true, opacity: OPACITY, depthWrite: false });
  const matSide = new THREE.MeshPhongMaterial({ color: COLOR_SIDE, side: THREE.DoubleSide, transparent: true, opacity: OPACITY, depthWrite: false });
  const matWire = new THREE.LineBasicMaterial({ color: COLOR_WIRE, transparent: true, opacity: 0.35 });

  const objects: THREE.Object3D[] = [];

  // Top cap
  const topGeo = buildCapGeometry(xs, ys, valid, topGrid);
  if (topGeo.getAttribute('position').count > 0) {
    objects.push(new THREE.Mesh(topGeo, matTop));
    if (showWire) {
      const wGeo = new THREE.WireframeGeometry(topGeo);
      objects.push(new THREE.LineSegments(wGeo, matWire));
    }
  }

  // Bottom cap
  const botGeo = buildCapGeometry(xs, ys, valid, botGrid);
  if (botGeo.getAttribute('position').count > 0) {
    objects.push(new THREE.Mesh(botGeo, matBot));
  }

  // Side walls
  let sideGeo: THREE.BufferGeometry;
  if (domain.type === 'rect') {
    sideGeo = buildRectSideWalls(xs, ys, valid, topGrid, botGrid);
  } else if (domain.type === 'circle') {
    sideGeo = buildCircleSideWalls(domain.cx, domain.cy, domain.R, topFn, botFn, 128);
  } else {
    sideGeo = buildCustomSideWalls(xs, ys, valid, topGrid, botGrid, yMinFnCache, yMaxFnCache, topFn, botFn);
  }
  if (sideGeo.getAttribute('position')?.count > 0) {
    objects.push(new THREE.Mesh(sideGeo, matSide));
  }

  return objects;
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function SolidVolumeModule() {
  const canvasRef  = useRef<HTMLDivElement>(null);
  const rendRef    = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef   = useRef<THREE.Scene | null>(null);
  const cameraRef  = useRef<THREE.OrthographicCamera | null>(null);
  const ctrlRef    = useRef<OrbitControls | null>(null);
  const solidGroup = useRef<THREE.Group | null>(null);
  const rafRef     = useRef<number>(0);
  const activeInputRef = useRef<HTMLInputElement | null>(null);

  // ── UI State ──
  const [topExpr, setTopExpr] = useState('x^2 + y^2');
  const [botExpr, setBotExpr] = useState('0');
  const [domType, setDomType] = useState<DomainType>('rect');

  // Rectangular
  const [xMin, setXMin] = useState(-2);
  const [xMax, setXMax] = useState(2);
  const [yMin, setYMin] = useState(-2);
  const [yMax, setYMax] = useState(2);

  // Circular
  const [cx, setCx] = useState(0);
  const [cy, setCy] = useState(0);
  const [radius, setRadius] = useState(2);

  // Custom y-bounds
  const [cxMin, setCxMin] = useState(0);
  const [cxMax, setCxMax] = useState(1);
  const [yMinExpr, setYMinExpr] = useState('0');
  const [yMaxExpr, setYMaxExpr] = useState('sqrt(x)');

  // Render options
  const [resolution, setResolution] = useState(45);
  const [showWire, setShowWire] = useState(true);

  // Keyboard
  const [showKbd, setShowKbd] = useState(false);
  const [activeInput, setActiveInput] = useState<'top' | 'bot' | 'ymin' | 'ymax'>('top');

  // Results
  const [steps, setSteps] = useState<{ title: string; content: string; latex?: string }[]>([]);
  const [resultText, setResultText] = useState<string | null>(null);
  const [resultLatex, setResultLatex] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Active build params (committed on Calcular)
  const [buildParams, setBuildParams] = useState<BuildParams>({
    topExpr: 'x^2 + y^2',
    botExpr: '0',
    domain: { type: 'rect', xMin: -2, xMax: 2, yMin: -2, yMax: 2 },
    N: 45,
    showWire: true,
  });

  // ── Three.js scene setup ──
  useEffect(() => {
    const container = canvasRef.current;
    if (!container) return;

    const w = container.clientWidth;
    const h = container.clientHeight;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(w, h);
    renderer.setClearColor(0x0f172a, 1);
    container.appendChild(renderer.domElement);
    rendRef.current = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a);
    sceneRef.current = scene;

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(5, 8, 6);
    scene.add(dirLight);
    const hemi = new THREE.HemisphereLight(0x38bdf8, 0x0f172a, 0.4);
    scene.add(hemi);

    // Colored axes (+X red, -X salmon, +Y green, -Y ltgreen, +Z blue, -Z ltblue)
    const axLen = 4.5;
    const axDefs = [
      { dir: new THREE.Vector3( 1,0,0), col: AXIS_HEX.xPos },
      { dir: new THREE.Vector3(-1,0,0), col: AXIS_HEX.xNeg },
      { dir: new THREE.Vector3( 0,1,0), col: AXIS_HEX.yPos },
      { dir: new THREE.Vector3( 0,-1,0), col: AXIS_HEX.yNeg },
      { dir: new THREE.Vector3( 0,0,1), col: AXIS_HEX.zPos },
      { dir: new THREE.Vector3( 0,0,-1), col: AXIS_HEX.zNeg },
    ];
    axDefs.forEach(({ dir, col }) => {
      scene.add(new THREE.ArrowHelper(dir.normalize(), new THREE.Vector3(), axLen, col, 0.25, 0.12));
    });

    // Grid helper (XY plane at z=0)
    const grid = new THREE.GridHelper(10, 20, 0x334155, 0x1e293b);
    grid.rotation.x = Math.PI / 2; // make it XY-plane
    grid.position.z = -0.01;
    scene.add(grid);

    // ── Orthographic isometric camera ──
    const orthoHalf = 7;
    const camDist   = 15;
    const camera = new THREE.OrthographicCamera(
      -orthoHalf * (w / h), orthoHalf * (w / h),
      orthoHalf, -orthoHalf,
      0.01, 500,
    );
    camera.position.set(camDist, camDist, camDist);
    camera.up.set(0, 0, 1);  // Z is "up" — matches z = f(x,y) surfaces
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.screenSpacePanning = true;
    controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    ctrlRef.current = controls;

    // Solid group
    const group = new THREE.Group();
    scene.add(group);
    solidGroup.current = group;

    // Render loop
    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Resize
    const onResize = () => {
      const nw = container.clientWidth;
      const nh = container.clientHeight;
      const asp = nw / nh;
      camera.left   = -orthoHalf * asp;
      camera.right  =  orthoHalf * asp;
      camera.top    =  orthoHalf;
      camera.bottom = -orthoHalf;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    };
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(rafRef.current);
      controls.dispose();
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, []);

  // ── Rebuild solid geometry when buildParams changes ──
  useEffect(() => {
    const group = solidGroup.current;
    if (!group) return;

    // Dispose old objects
    group.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else obj.material.dispose();
      }
    });
    group.clear();

    const objs = buildSolidObjects(buildParams);
    objs.forEach(o => group.add(o));
  }, [buildParams]);

  // ── Compute handler ──
  const compute = useCallback(() => {
    const domain: DomainSpec =
      domType === 'rect'   ? { type: 'rect', xMin, xMax, yMin, yMax } :
      domType === 'circle' ? { type: 'circle', cx, cy, R: radius } :
                             { type: 'custom', xMin: cxMin, xMax: cxMax, yMinExpr, yMaxExpr };

    const res = computeVolumeSolid(topExpr, botExpr, domain, 60);
    setSteps(res.steps);
    setError(res.error);
    if (res.value !== null) {
      setResultText(`V ≈ ${res.value.toFixed(6)} u³`);
      setResultLatex(`V = \\iint_D \\bigl[f - g\\bigr]\\,dA \\approx ${res.value.toFixed(6)}`);
    } else {
      setResultText(null);
      setResultLatex(null);
    }

    setBuildParams({
      topExpr, botExpr, domain,
      N: resolution, showWire,
    });
  }, [topExpr, botExpr, domType, xMin, xMax, yMin, yMax, cx, cy, radius, cxMin, cxMax, yMinExpr, yMaxExpr, resolution, showWire]);

  // ── Initial render on mount ──
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { compute(); }, []);

  // ── Input helper ──
  const kbdValue = () => {
    if (activeInput === 'top')  return topExpr;
    if (activeInput === 'bot')  return botExpr;
    if (activeInput === 'ymin') return yMinExpr;
    return yMaxExpr;
  };
  const kbdSet = (v: string) => {
    if (activeInput === 'top')  setTopExpr(v);
    else if (activeInput === 'bot')  setBotExpr(v);
    else if (activeInput === 'ymin') setYMinExpr(v);
    else setYMaxExpr(v);
  };

  const focusInput = (which: typeof activeInput, ref: HTMLInputElement | null) => {
    setActiveInput(which);
    activeInputRef.current = ref;
    setShowKbd(true);
  };

  return (
    <div className="module-layout">
      {/* ── Sidebar ── */}
      <div className="module-sidebar">
        <h2 className="module-title" style={{ color: '#0d9488' }}>
          <Layers size={18} /> Sólido de Volumen
        </h2>

        {/* Surfaces */}
        <div className="field-group">
          <label className="field-label">Superficie superior z = f(x,y)</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type="text" className="math-input"
              value={topExpr}
              onChange={e => setTopExpr(e.target.value)}
              onFocus={e => focusInput('top', e.target)}
              placeholder="ej. x^2 + y^2"
              style={{ borderColor: '#0d9488' }}
            />
            <button className="icon-btn" onClick={() => setShowKbd(v => !v)} title="Teclado">
              <Keyboard size={14} />
            </button>
          </div>
        </div>

        <div className="field-group">
          <label className="field-label">Superficie inferior z = g(x,y)</label>
          <input
            type="text" className="math-input"
            value={botExpr}
            onChange={e => setBotExpr(e.target.value)}
            onFocus={e => focusInput('bot', e.target)}
            placeholder="ej. 0"
            style={{ borderColor: '#0f766e' }}
          />
        </div>

        {showKbd && (
          <MathKeyboard
            inputRef={activeInputRef}
            value={kbdValue()}
            onChange={kbdSet}
            onEnter={() => setShowKbd(false)}
          />
        )}

        {/* Domain selector */}
        <div className="field-group">
          <label className="field-label">Tipo de dominio D</label>
          <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
            {(['rect', 'circle', 'custom'] as DomainType[]).map(dt => (
              <button
                key={dt}
                onClick={() => setDomType(dt)}
                style={{
                  flex: 1, padding: '6px 0', borderRadius: 7, border: '1.5px solid',
                  borderColor: domType === dt ? '#0d9488' : '#e2e8f0',
                  background: domType === dt ? '#ccfbf1' : '#f8fafc',
                  color: domType === dt ? '#0f766e' : '#64748b',
                  fontWeight: 700, fontSize: 11, cursor: 'pointer',
                  transition: 'all .15s',
                }}
              >
                {dt === 'rect' ? '⬜ Rect.' : dt === 'circle' ? '⭕ Circular' : '〰️ Custom'}
              </button>
            ))}
          </div>

          {domType === 'rect' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {([['xMin', xMin, setXMin], ['xMax', xMax, setXMax],
                 ['yMin', yMin, setYMin], ['yMax', yMax, setYMax]] as const).map(([k, v, s]) => (
                <div key={k}>
                  <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 2 }}>{k}</label>
                  <input type="number" step="any" value={v}
                    onChange={e => (s as (n: number) => void)(parseFloat(e.target.value) || 0)}
                    className="number-input" />
                </div>
              ))}
            </div>
          )}

          {domType === 'circle' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {([['cx', cx, setCx], ['cy', cy, setCy], ['R', radius, setRadius]] as const).map(([k, v, s]) => (
                <div key={k}>
                  <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 2 }}>{k}</label>
                  <input type="number" step="any" value={v}
                    onChange={e => (s as (n: number) => void)(parseFloat(e.target.value) || 0)}
                    className="number-input" />
                </div>
              ))}
              <div style={{ gridColumn: '1/-1', fontSize: 11, color: '#94a3b8', padding: '4px 0' }}>
                <MathInline latex={`(x-${cx})^2+(y-${cy})^2 \\leq ${radius}^2`} />
              </div>
            </div>
          )}

          {domType === 'custom' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6 }}>
                {([['xMin', cxMin, setCxMin], ['xMax', cxMax, setCxMax]] as const).map(([k, v, s]) => (
                  <div key={k}>
                    <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 2 }}>{k}</label>
                    <input type="number" step="any" value={v}
                      onChange={e => (s as (n: number) => void)(parseFloat(e.target.value) || 0)}
                      className="number-input" />
                  </div>
                ))}
              </div>
              <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 2 }}>y_min(x) =</label>
              <input type="text" className="math-input" value={yMinExpr}
                onChange={e => setYMinExpr(e.target.value)}
                onFocus={e => focusInput('ymin', e.target)}
                placeholder="ej. 0" style={{ marginBottom: 6 }} />
              <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 2 }}>y_max(x) =</label>
              <input type="text" className="math-input" value={yMaxExpr}
                onChange={e => setYMaxExpr(e.target.value)}
                onFocus={e => focusInput('ymax', e.target)}
                placeholder="ej. sqrt(x)" />
            </>
          )}
        </div>

        {/* Render options */}
        <div className="field-group">
          <label className="field-label">Resolución: {resolution}×{resolution}</label>
          <input type="range" min={15} max={80} step={1} value={resolution}
            onChange={e => setResolution(parseInt(e.target.value))}
            style={{ width: '100%', accentColor: '#0d9488' }} />
        </div>

        <div className="field-group" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input id="wire-toggle" type="checkbox" checked={showWire}
            onChange={e => setShowWire(e.target.checked)}
            style={{ accentColor: '#0d9488', width: 16, height: 16 }} />
          <label htmlFor="wire-toggle" style={{ fontSize: 13, color: '#334155', fontWeight: 600, cursor: 'pointer' }}>
            Mostrar malla (wireframe)
          </label>
        </div>

        <button
          onClick={compute}
          className="btn-compute"
          style={{ background: 'linear-gradient(135deg, #0d9488, #0f766e)', boxShadow: '0 2px 8px rgba(13,148,136,.35)' }}
        >
          Calcular Sólido
        </button>

        {/* Volume formula display */}
        {resultLatex && !error && (
          <div style={{
            marginTop: 14, padding: '12px 14px',
            background: 'linear-gradient(135deg, #f0fdfa, #ccfbf1)',
            border: '1px solid #5eead4', borderRadius: 10,
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 13, color: '#0f766e', fontWeight: 700, marginBottom: 6 }}>Volumen calculado</div>
            <div style={{ fontSize: 15, color: '#134e4a' }}>
              <MathInline latex={resultLatex} />
            </div>
          </div>
        )}

        <div style={{ marginTop: 14 }}>
          <StepPanel
            steps={steps}
            result={resultText}
            resultLatex={resultLatex ?? undefined}
            error={error}
            title="Configuración del sólido"
          />
        </div>
      </div>

      {/* ── 3D Viewer ── */}
      <div
        className="module-viewer"
        style={{ background: '#0f172a', position: 'relative' }}
      >
        <div ref={canvasRef} style={{ width: '100%', height: '100%' }} />

        {/* Reset view button */}
        <button
          onClick={() => {
            const cam = cameraRef.current;
            const ctrl = ctrlRef.current;
            if (!cam || !ctrl) return;
            cam.position.set(15, 15, 15);
            cam.up.set(0, 0, 1);
            cam.lookAt(0, 0, 0);
            cam.zoom = 1;
            cam.updateProjectionMatrix();
            ctrl.reset();
          }}
          title="Restablecer vista isométrica"
          style={{
            position: 'absolute', top: 10, left: 10,
            background: 'rgba(15,23,42,0.78)', backdropFilter: 'blur(6px)',
            border: '1px solid rgba(255,255,255,0.12)', color: '#94a3b8',
            borderRadius: 8, padding: '5px 10px', cursor: 'pointer',
            fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5,
            fontFamily: "'Inter', sans-serif",
          }}
        >
          <RotateCcw size={12} /> Reset vista
        </button>

        {/* Legend overlay */}
        <div style={{
          position: 'absolute', top: 14, right: 14,
          background: 'rgba(15,23,42,0.82)',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 10,
          padding: '10px 14px',
          display: 'flex', flexDirection: 'column', gap: 6,
          fontSize: 12, color: '#cbd5e1',
          pointerEvents: 'none',
        }}>
          <div style={{ fontWeight: 700, color: '#94a3b8', marginBottom: 2, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Leyenda</div>
          {[
            { color: '#14b8a6', label: `Tapa superior: z = ${buildParams.topExpr}` },
            { color: '#0f766e', label: `Tapa inferior: z = ${buildParams.botExpr}` },
            { color: '#0d4f4a', label: 'Paredes laterales' },
          ].map(({ color, label }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: color, flexShrink: 0 }} />
              <span style={{ fontSize: 11 }}>{label}</span>
            </div>
          ))}
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: 4, paddingTop: 6, fontSize: 10, color: '#64748b' }}>
            🖱 Arrastrar · Scroll zoom · Click derecho pan
          </div>
        </div>

        {/* Domain label */}
        <div style={{
          position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(15,23,42,0.75)',
          backdropFilter: 'blur(6px)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 20, padding: '5px 16px',
          fontSize: 12, color: '#94a3b8',
          pointerEvents: 'none',
        }}>
          {buildParams.domain.type === 'rect' && (
            <MathInline latex={`D = [${xMin},${xMax}]\\times[${yMin},${yMax}]`} />
          )}
          {buildParams.domain.type === 'circle' && (
            <MathInline latex={`(x-${cx})^2+(y-${cy})^2\\leq ${radius}^2`} />
          )}
          {buildParams.domain.type === 'custom' && (
            <MathInline latex={`x\\in[${cxMin},${cxMax}],\\;${yMinExpr}\\leq y\\leq ${yMaxExpr}`} />
          )}
        </div>
      </div>
    </div>
  );
}
