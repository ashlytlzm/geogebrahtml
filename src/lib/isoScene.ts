/**
 * isoScene.ts
 * Creates a reusable Three.js orthographic isometric scene with:
 *   - OrthographicCamera at true isometric position (1,1,1)·d
 *   - Colored axes: +X red, −X salmon, +Y green, −Y light green, +Z blue, −Z light blue
 *   - Canvas-texture text sprite labels at each positive axis tip
 *   - Adaptive XY-plane grid
 *   - OrbitControls with damping
 *   - Clean dispose on unmount
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// ─── Axis colors ───────────────────────────────────────────────────────────────
export const AXIS_HEX = {
  xPos: 0xef4444, xNeg: 0xfca5a5,
  yPos: 0x22c55e, yNeg: 0x86efac,
  zPos: 0x3b82f6, zNeg: 0x93c5fd,
} as const;

// ─── Text sprite helper ────────────────────────────────────────────────────────
function makeLabel(text: string, hexColor: number): THREE.Sprite {
  const sz = 128;
  const canvas = document.createElement('canvas');
  canvas.width = sz; canvas.height = sz;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, sz, sz);
  ctx.fillStyle = `#${hexColor.toString(16).padStart(6, '0')}`;
  ctx.font = `bold 68px 'Inter', Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, sz / 2, sz / 2);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(0.65, 0.65, 1);
  return sprite;
}

// ─── Colored axes with labels ──────────────────────────────────────────────────
function addColoredAxes(scene: THREE.Scene, len = 4.8): void {
  const axes = [
    { dir: new THREE.Vector3( 1, 0, 0), col: AXIS_HEX.xPos, lbl: '+X' },
    { dir: new THREE.Vector3(-1, 0, 0), col: AXIS_HEX.xNeg, lbl: '' },
    { dir: new THREE.Vector3( 0, 1, 0), col: AXIS_HEX.yPos, lbl: '+Y' },
    { dir: new THREE.Vector3( 0,-1, 0), col: AXIS_HEX.yNeg, lbl: '' },
    { dir: new THREE.Vector3( 0, 0, 1), col: AXIS_HEX.zPos, lbl: '+Z' },
    { dir: new THREE.Vector3( 0, 0,-1), col: AXIS_HEX.zNeg, lbl: '' },
  ];
  for (const { dir, col, lbl } of axes) {
    scene.add(new THREE.ArrowHelper(dir.clone().normalize(), new THREE.Vector3(), len, col, 0.28, 0.14));
    if (lbl) {
      const sprite = makeLabel(lbl, col);
      sprite.position.copy(dir.clone().multiplyScalar(len + 0.55));
      scene.add(sprite);
    }
  }
}

// ─── XY grid ──────────────────────────────────────────────────────────────────
function addXYGrid(scene: THREE.Scene, dark: boolean): void {
  const c1 = dark ? 0x334155 : 0xd1d5db;
  const c2 = dark ? 0x1e293b : 0xe5e7eb;
  const grid = new THREE.GridHelper(14, 28, c1, c2);
  grid.rotation.x = Math.PI / 2; // lay flat on XY plane
  grid.position.z = -0.02;
  grid.renderOrder = -1;
  scene.add(grid);
}

// ─── Public API ────────────────────────────────────────────────────────────────
export interface IsoSceneHandles {
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  solidGroup: THREE.Group;
  resetView: () => void;
  dispose: () => void;
}

const CAM_DIST = 18;
const ORTHO_HALF = 7;

export function createIsoScene(container: HTMLDivElement, dark = true): IsoSceneHandles {
  const w = Math.max(container.clientWidth, 100);
  const h = Math.max(container.clientHeight, 100);
  const aspect = w / h;

  // ── Renderer ──
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h);
  renderer.setClearColor(dark ? 0x0f172a : 0xf0f4f8);
  container.appendChild(renderer.domElement);

  // ── Scene ──
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(dark ? 0x0f172a : 0xf0f4f8);

  // ── Orthographic camera — true isometric (1,1,1) direction ──
  const camera = new THREE.OrthographicCamera(
    -ORTHO_HALF * aspect, ORTHO_HALF * aspect,
    ORTHO_HALF, -ORTHO_HALF,
    0.01, 500,
  );
  camera.position.set(CAM_DIST, CAM_DIST, CAM_DIST);
  camera.up.set(0, 0, 1);   // Z is "up" → matches z = f(x,y) convention
  camera.lookAt(0, 0, 0);

  // ── Lights ──
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const dir = new THREE.DirectionalLight(0xffffff, 1.1);
  dir.position.set(8, 10, 8);
  scene.add(dir);
  scene.add(new THREE.HemisphereLight(0x38bdf8, dark ? 0x0f172a : 0xf0f4f8, 0.35));

  // ── Axes + grid ──
  addColoredAxes(scene, 4.8);
  addXYGrid(scene, dark);

  // ── OrbitControls ──
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.screenSpacePanning = true;
  controls.mouseButtons = {
    LEFT:   THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT:  THREE.MOUSE.PAN,
  };

  // ── User geometry group ──
  const solidGroup = new THREE.Group();
  scene.add(solidGroup);

  // ── Resize ──
  let rafId = 0;
  const onResize = () => {
    const nw = container.clientWidth;
    const nh = container.clientHeight;
    const asp = nw / nh;
    camera.left   = -ORTHO_HALF * asp;
    camera.right  =  ORTHO_HALF * asp;
    camera.top    =  ORTHO_HALF;
    camera.bottom = -ORTHO_HALF;
    camera.updateProjectionMatrix();
    renderer.setSize(nw, nh);
  };
  window.addEventListener('resize', onResize);

  // ── Animation loop ──
  const animate = () => {
    rafId = requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  };
  animate();

  // ── Reset view ──
  const resetView = () => {
    camera.position.set(CAM_DIST, CAM_DIST, CAM_DIST);
    camera.up.set(0, 0, 1);
    camera.lookAt(0, 0, 0);
    camera.zoom = 1;
    camera.updateProjectionMatrix();
    controls.reset();
  };

  // ── Dispose ──
  const dispose = () => {
    cancelAnimationFrame(rafId);
    window.removeEventListener('resize', onResize);
    controls.dispose();
    renderer.dispose();
    if (container.contains(renderer.domElement)) {
      container.removeChild(renderer.domElement);
    }
  };

  return { scene, camera, renderer, controls, solidGroup, resetView, dispose };
}
