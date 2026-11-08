import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { LOBES, layoutBrain, type LaidOutNeuron, type Vec3 } from './layout';
import {
  DEFAULT_REGIONS,
  type BrainModel,
  type BrainNeuron,
  type BrainRegion,
  type NeuronKind,
  type RegionId,
  type SynapseKind,
} from './model';
import { BrainIndex, SYNAPSE_WORDS } from './relations';
import { VIEWER_CSS } from './viewer-css';

export interface BrainViewerOptions {
  /** Called when the reader asks to see a neuron's source. */
  onOpenSource?: (neuron: BrainNeuron) => void;
  /** Label for the open-source button. */
  openSourceLabel?: string;
}

export interface BrainViewer {
  /** Enter a lobe (or go back to the whole brain with null). */
  enterRegion(id: RegionId | null): void;
  /** Select a neuron, entering its lobe; null clears the selection. */
  select(id: string | null): void;
  destroy(): void;
  /** False when WebGL is not available; the lists and details still work. */
  readonly has3d: boolean;
}

export const REGION_COLORS: Record<RegionId, string> = {
  frontend: '#38bdf8',
  backend: '#a78bfa',
  database: '#34d399',
  devops: '#fbbf24',
  core: '#f472b6',
};

const SYNAPSE_COLORS: Record<SynapseKind, string> = {
  calls: '#7dd3fc',
  renders: '#93c5fd',
  extends: '#f9a8d4',
  implements: '#f9a8d4',
  instantiates: '#fda4af',
  handles: '#c4b5fd',
  accesses_db: '#6ee7b7',
  reads_config: '#fcd34d',
  writes_config: '#fcd34d',
  calls_service: '#fca5a5',
  imports: '#94a3b8',
  starts: '#fde68a',
};

const KIND_SIZE: Record<NeuronKind, number> = {
  database: 2.1,
  service: 1.9,
  class: 1.6,
  route: 1.35,
  component: 1.3,
  file: 1.1,
  function: 1.0,
  interface: 0.9,
  config: 0.9,
  method: 0.8,
};

const KIND_LABEL: Record<NeuronKind, string> = {
  class: 'Class',
  interface: 'Interface',
  function: 'Function',
  method: 'Method',
  component: 'Component',
  route: 'Route',
  file: 'File',
  database: 'Database',
  service: 'External service',
  config: 'Configuration',
};

const OVERVIEW_CAMERA: Vec3 = [3.9, 1.5, 2.8];
const OVERVIEW_TARGET: Vec3 = [0, 0.05, -0.1];
const CURVE_SEGMENTS = 8;
const MAX_PULSES = 360;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') ?? c.getContext('webgl'));
  } catch {
    return false;
  }
}

/** Soft round sprite for glowing neurons and pulses. */
function glowTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.65)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const CEREBRUM_REGIONS: RegionId[] = ['frontend', 'backend', 'database', 'devops'];

/** The lobe a point on the cortex belongs to: the nearest lobe centre, scaled by its size. */
function lobeAt(x: number, y: number, z: number, candidates: RegionId[]): RegionId {
  let best = candidates[0] as RegionId;
  let bestD = Infinity;
  for (const id of candidates) {
    const { center, radii } = LOBES[id];
    const d =
      ((x * 0.35 - center[0]) / radii[0]) ** 2 +
      ((y - center[1]) / radii[1]) ** 2 +
      ((z - center[2]) / radii[2]) ** 2;
    if (d < bestD) {
      bestD = d;
      best = id;
    }
  }
  return best;
}

export interface BrainPart {
  geometry: THREE.BufferGeometry;
  /** Region of each vertex, for colouring, fading and picking. */
  regionOfVertex: RegionId[];
}

/**
 * One hemisphere of the cerebrum: a long ellipsoid, flat on the inner wall and underside,
 * with folds (gyri and sulci) along its surface. Lobes are coloured regions of it.
 */
function hemisphere(side: -1 | 1): BrainPart {
  const g = new THREE.IcosahedronGeometry(1, 7);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const regionOfVertex: RegionId[] = [];
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const gyri =
      Math.sin(7.0 * v.x + 2.2 * Math.sin(4.1 * v.z)) *
        Math.sin(6.3 * v.y + 1.7 * Math.sin(3.3 * v.x)) *
        Math.sin(7.7 * v.z + 1.1 * v.y) +
      0.45 * Math.sin(15 * v.z + 4 * v.y) * Math.sin(13 * v.y - 3 * v.x);
    const r = 1 + 0.045 * gyri;
    let x = v.x * r * 0.92;
    let y = v.y * r * 1.0;
    const z = v.z * r * 1.72;
    if (x * side < 0) x *= 0.32; // flat inner wall, leaving the groove between hemispheres
    if (y < -0.25) y = -0.25 + (y + 0.25) * 0.55; // flatter underside
    x += side * 0.5;
    y += 0.22;
    pos.setXYZ(i, x, y, z - 0.05);
    regionOfVertex.push(lobeAt(x, y, z - 0.05, CEREBRUM_REGIONS));
  }
  g.computeVertexNormals();
  return { geometry: g, regionOfVertex };
}

/** The cerebellum, under the back of the brain, with its fine horizontal folds. */
function cerebellum(): BrainPart {
  const g = new THREE.SphereGeometry(1, 96, 64);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const { center, radii } = LOBES.core;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const r = 1 + 0.035 * Math.sin(40 * v.y) - 0.18 * Math.exp(-(v.x * v.x) / 0.01);
    pos.setXYZ(
      i,
      center[0] + v.x * r * radii[0] * 1.15,
      center[1] + v.y * r * radii[1] * 1.25,
      center[2] + v.z * r * radii[2] * 1.2,
    );
  }
  g.computeVertexNormals();
  return { geometry: g, regionOfVertex: new Array<RegionId>(pos.count).fill('core') };
}

/** Mounts an interactive 3D brain for `model` inside `root`. */
export function mountBrain(
  root: HTMLElement,
  model: BrainModel,
  options: BrainViewerOptions = {},
): BrainViewer {
  const regions: BrainRegion[] = model.regions ?? DEFAULT_REGIONS;
  const neurons = layoutBrain(model);
  const nById = new Map(neurons.map((n, i) => [n.id, { n, i }]));
  const index = new BrainIndex({ ...model, neurons });
  const synapses = model.synapses.filter((s) => nById.has(s.source) && nById.has(s.target));
  const reducedMotion =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- DOM ----------
  root.classList.add('nb-root');
  const style = el('style');
  style.textContent = VIEWER_CSS;
  root.append(style);
  const stage = el('div', { class: 'nb-stage' });
  const labels = el('div', { class: 'nb-labels', 'aria-hidden': 'true' });
  const tooltip = el('div', { class: 'nb-tooltip', 'aria-hidden': 'true' });
  stage.append(labels, tooltip);

  const top = el('div', { class: 'nb-top' });
  const titleEl = el('h2', { class: 'nb-title' }, model.title);
  const crumbs = el('nav', { class: 'nb-crumbs', 'aria-label': 'Where you are in the brain' });
  const searchWrap = el('div', { class: 'nb-search' });
  const searchInput = el('input', {
    type: 'search',
    placeholder: 'Recall anything: class, method, file…',
    'aria-label': 'Search the brain',
    autocomplete: 'off',
  });
  const results = el('ul', { class: 'nb-results', role: 'listbox', 'aria-label': 'Matches' });
  searchWrap.append(searchInput, results);
  top.append(titleEl, crumbs, searchWrap);

  const left = el('aside', { class: 'nb-left', 'aria-label': 'Brain regions' });
  const right = el('aside', { class: 'nb-right', 'aria-label': 'Details', hidden: '' });
  const status = el('p', { class: 'nb-status', role: 'status', 'aria-live': 'polite' });
  const legend = el('div', { class: 'nb-legend' });
  legend.innerHTML =
    '<span><i class="nb-line nb-observed"></i>observed</span><span><i class="nb-line nb-inferred"></i>inferred</span><span><i class="nb-dot nb-in"></i>input from</span><span><i class="nb-dot nb-out"></i>output to</span>';
  root.append(stage, top, left, right, legend, status);

  // ---------- 3D ----------
  const has3d = webglAvailable();
  let renderer: THREE.WebGLRenderer | null = null;
  let frame = 0;
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x05060d, 0.07);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 100);
  camera.position.set(...OVERVIEW_CAMERA);
  let controls: OrbitControls | null = null;
  const parts: { shell: THREE.Mesh; wire: THREE.Mesh; regionOfVertex: RegionId[] }[] = [];
  let instanced: THREE.InstancedMesh | null = null;
  let glow: THREE.Points | null = null;
  let lines: THREE.LineSegments | null = null;
  let pulses: THREE.Points | null = null;
  const curve = new Float32Array(synapses.length * (CURVE_SEGMENTS + 1) * 3);
  const baseScale = new Float32Array(neurons.length).fill(1);
  const baseColors: THREE.Color[] = neurons.map((n) =>
    new THREE.Color(REGION_COLORS[n.region]).lerp(new THREE.Color('#ffffff'), 0.25),
  );
  const pulseState: { link: number; t: number; speed: number; reverse: boolean }[] = [];

  const camTarget = new THREE.Vector3(...OVERVIEW_TARGET);
  const camGoal = new THREE.Vector3(...OVERVIEW_CAMERA);
  let flying = false;

  if (has3d) {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setClearColor(0x05060d, 1);
    renderer.domElement.setAttribute('aria-label', `3D brain of ${model.title}`);
    renderer.domElement.setAttribute('role', 'img');
    stage.prepend(renderer.domElement);
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.copy(camTarget);
    controls.autoRotate = !reducedMotion;
    controls.autoRotateSpeed = 0.45;
    controls.minDistance = 0.15;
    controls.maxDistance = 14;
    controls.addEventListener('start', () => {
      flying = false;
    });

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.PointLight(0xbfdcff, 40, 30);
    key.position.set(4, 5, 4);
    scene.add(key);
    const rim = new THREE.PointLight(0xf0abfc, 25, 30);
    rim.position.set(-5, -2, -4);
    scene.add(rim);

    for (const part of [hemisphere(-1), hemisphere(1), cerebellum()]) {
      const count = part.regionOfVertex.length;
      part.geometry.setAttribute(
        'color',
        new THREE.BufferAttribute(new Float32Array(count * 4), 4),
      );
      const shell = new THREE.Mesh(
        part.geometry,
        new THREE.MeshStandardMaterial({
          vertexColors: true,
          emissive: 0x1e293b,
          roughness: 0.6,
          metalness: 0.05,
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      const wire = new THREE.Mesh(
        part.geometry,
        new THREE.MeshBasicMaterial({
          vertexColors: true,
          wireframe: true,
          transparent: true,
          opacity: 0.18,
          depthWrite: false,
        }),
      );
      scene.add(shell, wire);
      parts.push({ shell, wire, regionOfVertex: part.regionOfVertex });
    }
    // Brain stem, for the silhouette.
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.14, 1.1, 24, 1, true),
      new THREE.MeshStandardMaterial({
        color: 0x64748b,
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    stem.position.set(0, -1.25, -0.55);
    stem.rotation.x = 0.35;
    scene.add(stem);

    // Neurons.
    const sphere = new THREE.SphereGeometry(0.017, 12, 10);
    instanced = new THREE.InstancedMesh(
      sphere,
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
      neurons.length,
    );
    const m = new THREE.Matrix4();
    const glowPos = new Float32Array(neurons.length * 3);
    neurons.forEach((n, i) => {
      const s = KIND_SIZE[n.kind] * (1 + Math.min(1, n.degree / 30) * 0.6);
      baseScale[i] = s;
      m.makeScale(s, s, s).setPosition(...n.position);
      instanced?.setMatrixAt(i, m);
      instanced?.setColorAt(i, baseColors[i] as THREE.Color);
      glowPos.set(n.position, i * 3);
    });
    scene.add(instanced);
    const glowGeo = new THREE.BufferGeometry();
    glowGeo.setAttribute('position', new THREE.BufferAttribute(glowPos, 3));
    glowGeo.setAttribute(
      'color',
      new THREE.BufferAttribute(new Float32Array(baseColors.flatMap((c) => [c.r, c.g, c.b])), 3),
    );
    const sprite = glowTexture();
    glow = new THREE.Points(
      glowGeo,
      new THREE.PointsMaterial({
        size: 0.11,
        map: sprite,
        vertexColors: true,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    scene.add(glow);

    // Synapses as gentle curves.
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const p = new THREE.Vector3();
    const segPos = new Float32Array(synapses.length * CURVE_SEGMENTS * 2 * 3);
    synapses.forEach((s, li) => {
      a.set(...(nById.get(s.source)?.n.position as Vec3));
      b.set(...(nById.get(s.target)?.n.position as Vec3));
      c.addVectors(a, b).multiplyScalar(0.5);
      c.add(
        c
          .clone()
          .sub(new THREE.Vector3(0, 0, -0.1))
          .multiplyScalar(0.22),
      );
      for (let k = 0; k <= CURVE_SEGMENTS; k++) {
        const t = k / CURVE_SEGMENTS;
        p.set(0, 0, 0)
          .addScaledVector(a, (1 - t) * (1 - t))
          .addScaledVector(c, 2 * (1 - t) * t)
          .addScaledVector(b, t * t);
        curve.set([p.x, p.y, p.z], (li * (CURVE_SEGMENTS + 1) + k) * 3);
      }
      for (let k = 0; k < CURVE_SEGMENTS; k++) {
        const o = (li * CURVE_SEGMENTS + k) * 6;
        const from = (li * (CURVE_SEGMENTS + 1) + k) * 3;
        segPos.set(curve.subarray(from, from + 6), o);
      }
    });
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.BufferAttribute(segPos, 3));
    lineGeo.setAttribute(
      'color',
      new THREE.BufferAttribute(new Float32Array(synapses.length * CURVE_SEGMENTS * 2 * 3), 3),
    );
    lines = new THREE.LineSegments(
      lineGeo,
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    scene.add(lines);

    const pulseGeo = new THREE.BufferGeometry();
    pulseGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(MAX_PULSES * 3), 3),
    );
    pulseGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAX_PULSES * 3), 3));
    pulses = new THREE.Points(
      pulseGeo,
      new THREE.PointsMaterial({
        size: 0.09,
        map: sprite,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    scene.add(pulses);
  } else {
    stage.append(
      el(
        'p',
        { class: 'nb-no3d' },
        'This browser cannot show 3D graphics (WebGL is off). Use the lists on the left to explore the brain.',
      ),
    );
  }

  // ---------- state ----------
  let region: RegionId | null = null;
  let selected: string | null = null;
  let hovered: number | null = null;

  const regionLabel = (id: RegionId) => regions.find((r) => r.id === id)?.label ?? id;

  function setLineColors() {
    if (!lines) return;
    const col = lines.geometry.getAttribute('color') as THREE.BufferAttribute;
    const arr = col.array as Float32Array;
    const tmp = new THREE.Color();
    synapses.forEach((s, li) => {
      const src = nById.get(s.source)?.n as LaidOutNeuron;
      const dst = nById.get(s.target)?.n as LaidOutNeuron;
      let k = 0.07;
      if (selected) {
        if (s.target === selected) k = 0.9;
        else if (s.source === selected) k = 0.9;
        else k = 0.012;
      } else if (region) {
        const inside = src.region === region && dst.region === region;
        const touches = src.region === region || dst.region === region;
        k = inside ? 0.22 : touches ? 0.045 : 0.004;
      }
      if (s.confidence !== 'observed') k *= 0.6;
      if (selected && s.target === selected) tmp.set('#38bdf8');
      else if (selected && s.source === selected) tmp.set('#fb923c');
      else tmp.set(SYNAPSE_COLORS[s.kind]);
      tmp.multiplyScalar(k);
      for (let v = 0; v < CURVE_SEGMENTS * 2; v++)
        arr.set([tmp.r, tmp.g, tmp.b], (li * CURVE_SEGMENTS * 2 + v) * 3);
    });
    col.needsUpdate = true;
  }

  function setNeuronColors() {
    if (!instanced || !glow) return;
    const near = new Set<string>();
    if (selected) {
      near.add(selected);
      for (const s of index.incoming(selected)) near.add(s.source);
      for (const s of index.outgoing(selected)) near.add(s.target);
    }
    const gcol = glow.geometry.getAttribute('color') as THREE.BufferAttribute;
    const tmp = new THREE.Color();
    const m = new THREE.Matrix4();
    neurons.forEach((n, i) => {
      tmp.copy(baseColors[i] as THREE.Color);
      // Parts outside the focus shrink and fade so they do not block the view up close.
      let scale = 1;
      if (selected) {
        if (n.id === selected) tmp.set('#ffffff');
        else if (!near.has(n.id)) {
          tmp.multiplyScalar(n.region === region ? 0.18 : 0.05);
          scale = n.region === region ? 0.7 : 0.3;
        }
      } else if (region && n.region !== region) {
        tmp.multiplyScalar(0.06);
        scale = 0.3;
      }
      const s = (baseScale[i] ?? 1) * scale;
      m.makeScale(s, s, s).setPosition(...n.position);
      instanced?.setMatrixAt(i, m);
      instanced?.setColorAt(i, tmp);
      gcol.setXYZ(i, tmp.r, tmp.g, tmp.b);
    });
    instanced.instanceMatrix.needsUpdate = true;
    if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true;
    gcol.needsUpdate = true;
  }

  function setLobeOpacity() {
    const tmp = new THREE.Color();
    for (const { shell, regionOfVertex } of parts) {
      const col = shell.geometry.getAttribute('color') as THREE.BufferAttribute;
      regionOfVertex.forEach((id, i) => {
        const shown = id === region;
        const alpha = region === null ? 0.2 : shown ? 0.09 : 0.03;
        tmp.set(REGION_COLORS[id]);
        if (region !== null && !shown) tmp.multiplyScalar(0.5);
        col.setXYZW(i, tmp.r, tmp.g, tmp.b, alpha);
      });
      col.needsUpdate = true;
    }
  }

  function seedPulses() {
    pulseState.length = 0;
    const candidates: number[] = [];
    synapses.forEach((s, li) => {
      if (s.kind === 'imports') return;
      if (selected) {
        if (s.source === selected || s.target === selected) candidates.push(li);
      } else if (region) {
        const src = nById.get(s.source)?.n as LaidOutNeuron;
        const dst = nById.get(s.target)?.n as LaidOutNeuron;
        if (src.region === region || dst.region === region) candidates.push(li);
      } else candidates.push(li);
    });
    const count = Math.min(MAX_PULSES, selected ? candidates.length * 3 : candidates.length);
    for (let i = 0; i < count; i++) {
      const link = candidates[i % candidates.length] as number;
      pulseState.push({
        link,
        t: Math.random(),
        speed: 0.18 + Math.random() * 0.25,
        reverse: false,
      });
    }
  }

  function flyTo(target: Vec3, from: Vec3) {
    camTarget.set(...target);
    camGoal.set(...from);
    flying = true;
    if (controls) controls.autoRotate = false;
  }

  function lobeView(id: RegionId) {
    const { center, radii } = LOBES[id];
    const r = Math.max(...radii);
    const dir = new THREE.Vector3(
      center[0] + 1.2,
      center[1] * 0.6 + 0.35,
      center[2] + 0.4,
    ).normalize();
    const pos = new THREE.Vector3(...center).addScaledVector(dir, r * 1.9);
    return { target: center, from: [pos.x, pos.y, pos.z] as Vec3 };
  }

  // ---------- panels ----------
  function renderCrumbs() {
    crumbs.replaceChildren();
    const add = (label: string, onClick?: () => void) => {
      if (crumbs.childElementCount) crumbs.append(el('span', { class: 'nb-sep' }, '›'));
      if (onClick) {
        const b = el('button', { type: 'button' }, label);
        b.addEventListener('click', onClick);
        crumbs.append(b);
      } else crumbs.append(el('span', { 'aria-current': 'location' }, label));
    };
    const sel = selected ? nById.get(selected)?.n : undefined;
    add('Whole brain', region || selected ? () => api.enterRegion(null) : undefined);
    const rid = sel?.region ?? region;
    if (rid) add(regionLabel(rid), sel ? () => api.enterRegion(rid) : undefined);
    const parent = sel?.parent ? nById.get(sel.parent)?.n : undefined;
    if (parent) add(parent.name, () => api.select(parent.id));
    if (sel) add(sel.name.split('.').pop() ?? sel.name);
  }

  function neuronButton(n: BrainNeuron, extra?: string): HTMLButtonElement {
    const b = el('button', { type: 'button', class: 'nb-link', 'data-neuron': n.id });
    const dot = el('i', { class: 'nb-swatch' });
    const laid = nById.get(n.id)?.n;
    if (laid) dot.style.background = REGION_COLORS[laid.region];
    b.append(dot, document.createTextNode(n.name));
    if (extra) b.append(el('small', {}, ` ${extra}`));
    b.addEventListener('click', () => api.select(n.id));
    return b;
  }

  function renderLeft() {
    left.replaceChildren();
    if (!region) {
      left.append(el('h3', {}, 'Regions'));
      const ul = el('ul', { class: 'nb-regions' });
      for (const r of regions) {
        const count = neurons.filter((n) => n.region === r.id).length;
        const li = el('li');
        const b = el('button', { type: 'button', class: 'nb-region', 'data-region': r.id });
        const sw = el('i', { class: 'nb-swatch' });
        sw.style.background = REGION_COLORS[r.id];
        b.append(sw, el('strong', {}, r.label), el('small', {}, `${count} parts`));
        b.title = r.description;
        b.addEventListener('click', () => api.enterRegion(r.id));
        li.append(b, el('p', {}, r.description));
        ul.append(li);
      }
      left.append(ul);
      if (model.notes?.length) {
        const notes = el('details', { class: 'nb-notes' });
        notes.append(el('summary', {}, 'About this brain'));
        const nl = el('ul');
        for (const t of model.notes) nl.append(el('li', {}, t));
        notes.append(nl);
        left.append(notes);
      }
      return;
    }
    const back = el('button', { type: 'button', class: 'nb-back' }, '← Whole brain');
    back.addEventListener('click', () => api.enterRegion(null));
    left.append(back, el('h3', {}, regionLabel(region)));
    // Group the region's top-level neurons by file.
    const top = neurons.filter((n) => n.region === region && !n.parent);
    const byFile = new Map<string, LaidOutNeuron[]>();
    for (const n of top) {
      const k = n.file ?? 'Routes, services and settings';
      const g = byFile.get(k) ?? [];
      g.push(n);
      byFile.set(k, g);
    }
    const files = [...byFile.entries()].sort((x, y) => x[0].localeCompare(y[0]));
    left.append(el('p', { class: 'nb-hint' }, `${top.length} parts in ${files.length} files`));
    const list = el('div', { class: 'nb-files' });
    for (const [file, items] of files) {
      const d = el('details');
      if (files.length <= 6) d.open = true;
      d.append(el('summary', {}, file));
      const ul = el('ul');
      for (const n of items.sort((x, y) => (x.line ?? 0) - (y.line ?? 0))) {
        const li = el('li');
        li.append(neuronButton(n, KIND_LABEL[n.kind].toLowerCase()));
        ul.append(li);
      }
      d.append(ul);
      list.append(d);
    }
    left.append(list);
  }

  function relationSection(
    title: string,
    groups: Map<
      SynapseKind,
      {
        synapse: { confidence: string; file?: string; line?: number; detail?: string };
        other: BrainNeuron;
      }[]
    >,
    dir: 'in' | 'out',
  ): HTMLElement | null {
    if (!groups.size) return null;
    const sec = el('section', { class: `nb-rel nb-rel-${dir}` });
    sec.append(el('h4', {}, title));
    for (const [kind, items] of groups) {
      sec.append(
        el(
          'h5',
          {},
          `${dir === 'in' ? SYNAPSE_WORDS[kind].in : SYNAPSE_WORDS[kind].out} (${items.length})`,
        ),
      );
      const ul = el('ul');
      for (const { synapse, other } of items.slice(0, 40)) {
        const li = el('li');
        li.append(neuronButton(other));
        const where = synapse.file
          ? `${synapse.file}${synapse.line ? `:${synapse.line}` : ''}`
          : '';
        li.append(
          el(
            'small',
            { class: `nb-conf nb-${synapse.confidence}` },
            `${synapse.confidence}${where ? ` · ${where}` : ''}`,
          ),
        );
        ul.append(li);
      }
      if (items.length > 40)
        ul.append(el('li', { class: 'nb-hint' }, `and ${items.length - 40} more`));
      sec.append(ul);
    }
    return sec;
  }

  function renderRight() {
    const n = selected ? nById.get(selected)?.n : undefined;
    if (!n) {
      right.hidden = true;
      right.replaceChildren();
      return;
    }
    right.hidden = false;
    right.replaceChildren();
    const close = el(
      'button',
      { type: 'button', class: 'nb-close', 'aria-label': 'Close details' },
      '×',
    );
    close.addEventListener('click', () => api.select(null));
    const head = el('header');
    head.append(
      el('p', { class: 'nb-kind' }, `${KIND_LABEL[n.kind]} · ${regionLabel(n.region)}`),
      el('h3', {}, n.name),
      close,
    );
    right.append(head);
    if (n.file)
      right.append(el('p', { class: 'nb-file' }, `${n.file}${n.line ? `:${n.line}` : ''}`));
    if (options.onOpenSource && (n.file || n.ref !== undefined)) {
      const open = el(
        'button',
        { type: 'button', class: 'nb-open' },
        options.openSourceLabel ?? 'Open source',
      );
      open.addEventListener('click', () => options.onOpenSource?.(n));
      right.append(open);
    }
    if (n.doc) right.append(el('p', { class: 'nb-doc' }, n.doc));
    if (n.signature) right.append(el('pre', { class: 'nb-sig' }, n.signature));

    const rel = index.relations(n.id);
    if (n.params || n.returns) {
      const io = el('section', { class: 'nb-io' });
      io.append(el('h4', {}, 'Inputs and output'));
      const ul = el('ul');
      if (n.params?.length)
        for (const p of n.params)
          ul.append(el('li', {}, `in  ${p.name}${p.optional ? '?' : ''}: ${p.type}`));
      else if (n.params) ul.append(el('li', {}, 'in  (no parameters)'));
      if (n.returns) {
        const callers = rel.incoming.get('calls')?.length ?? 0;
        ul.append(
          el(
            'li',
            {},
            `out ${n.returns}${n.returnsDeclared === false ? '  (worked out by TypeScript)' : ''}${callers ? `, returned to ${callers} caller${callers === 1 ? '' : 's'}` : ''}`,
          ),
        );
      }
      io.append(ul);
      right.append(io);
    }
    if (rel.members.length) {
      const sec = el('section', { class: 'nb-members' });
      sec.append(el('h4', {}, `Members (${rel.members.length})`));
      const ul = el('ul');
      for (const m of rel.members) {
        const li = el('li');
        li.append(neuronButton(m, KIND_LABEL[m.kind].toLowerCase()));
        ul.append(li);
      }
      sec.append(ul);
      right.append(sec);
    }
    const inc = relationSection('Where its input comes from', rel.incoming, 'in');
    const out = relationSection('Where it sends work and data', rel.outgoing, 'out');
    if (inc) right.append(inc);
    if (out) right.append(out);
    if (!inc && !out && !rel.members.length)
      right.append(el('p', { class: 'nb-hint' }, 'No connections were found for this part.'));
    right.append(
      el(
        'p',
        { class: 'nb-hint' },
        `Placed in ${regionLabel(n.region)}: ${n.regionReason} (inferred).`,
      ),
    );
  }

  function renderAll() {
    renderCrumbs();
    renderLeft();
    renderRight();
    setLineColors();
    setNeuronColors();
    setLobeOpacity();
    seedPulses();
  }

  // ---------- search ----------
  let active = -1;
  function showResults() {
    const found = index.search(searchInput.value);
    results.replaceChildren();
    active = -1;
    found.forEach((n, i) => {
      const li = el('li', { role: 'option', id: `nb-opt-${i}`, 'aria-selected': 'false' });
      const laid = nById.get(n.id)?.n;
      li.append(
        el('strong', {}, n.name),
        el('small', {}, ` ${KIND_LABEL[n.kind]}${laid ? ` · ${regionLabel(laid.region)}` : ''}`),
      );
      li.addEventListener('mousedown', (e) => {
        e.preventDefault();
        pick(n.id);
      });
      results.append(li);
    });
    results.hidden = found.length === 0;
  }
  function pick(id: string) {
    results.hidden = true;
    searchInput.value = '';
    api.select(id);
  }
  searchInput.addEventListener('input', showResults);
  searchInput.addEventListener('keydown', (e) => {
    const items = [...results.children] as HTMLElement[];
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!items.length) return;
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items.forEach((it, i) => it.setAttribute('aria-selected', String(i === active)));
      searchInput.setAttribute('aria-activedescendant', `nb-opt-${active}`);
    } else if (e.key === 'Enter') {
      const found = index.search(searchInput.value);
      const n = found[Math.max(0, active)];
      if (n) pick(n.id);
    } else if (e.key === 'Escape') {
      results.hidden = true;
    }
  });
  searchInput.addEventListener('blur', () => {
    results.hidden = true;
  });
  results.hidden = true;

  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || e.target === searchInput) return;
    if (selected) api.select(null);
    else if (region) api.enterRegion(null);
  };
  root.addEventListener('keydown', onKey);

  // ---------- picking ----------
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let downAt: [number, number] | null = null;
  function pickAt(ev: PointerEvent): { neuron?: number; region?: RegionId } {
    if (!renderer || !instanced) return {};
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(
      ((ev.clientX - rect.left) / rect.width) * 2 - 1,
      -((ev.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObject(instanced, false)[0];
    if (hit && hit.instanceId !== undefined) {
      const n = neurons[hit.instanceId];
      if (n && (!region || n.region === region || selected)) return { neuron: hit.instanceId };
    }
    if (!region) {
      const hitPart = raycaster.intersectObjects(
        parts.map((p) => p.shell),
        false,
      )[0];
      const part = parts.find((p) => p.shell === hitPart?.object);
      if (hitPart?.face && part) return { region: part.regionOfVertex[hitPart.face.a] };
    }
    return {};
  }
  if (renderer) {
    const canvas = renderer.domElement;
    canvas.addEventListener('pointerdown', (e) => {
      downAt = [e.clientX, e.clientY];
    });
    canvas.addEventListener('pointerup', (e) => {
      if (!downAt) return;
      const moved = Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]);
      downAt = null;
      if (moved > 5) return;
      const p = pickAt(e);
      if (p.neuron !== undefined) api.select((neurons[p.neuron] as LaidOutNeuron).id);
      else if (p.region) api.enterRegion(p.region);
    });
    canvas.addEventListener('pointermove', (e) => {
      const p = pickAt(e);
      hovered = p.neuron ?? null;
      canvas.style.cursor = p.neuron !== undefined || p.region ? 'pointer' : 'grab';
      if (p.neuron !== undefined) {
        const n = neurons[p.neuron] as LaidOutNeuron;
        tooltip.textContent = `${n.name} · ${KIND_LABEL[n.kind]}`;
      } else if (p.region) tooltip.textContent = `${regionLabel(p.region)}: click to go inside`;
      else tooltip.textContent = '';
      tooltip.style.left = `${e.offsetX + 14}px`;
      tooltip.style.top = `${e.offsetY + 10}px`;
      tooltip.hidden = !tooltip.textContent;
    });
    canvas.addEventListener('pointerleave', () => {
      tooltip.hidden = true;
      hovered = null;
    });
  }

  // ---------- labels ----------
  const labelPool: HTMLElement[] = [];
  function labelTargets(): { text: string; pos: Vec3; cls: string }[] {
    const out: { text: string; pos: Vec3; cls: string }[] = [];
    if (!region && !selected) {
      for (const r of regions) {
        const { center, radii } = LOBES[r.id];
        out.push({
          text: r.label,
          pos: [center[0], center[1] + radii[1] * 0.95, center[2]],
          cls: `nb-lbl-region nb-r-${r.id}`,
        });
      }
      return out;
    }
    if (selected) {
      const ids = new Set<string>([selected]);
      for (const s of index.incoming(selected)) ids.add(s.source);
      for (const s of index.outgoing(selected)) ids.add(s.target);
      for (const id of [...ids].slice(0, 40)) {
        const n = nById.get(id)?.n;
        if (n)
          out.push({
            text: n.name,
            pos: n.position,
            cls: id === selected ? 'nb-lbl-sel' : 'nb-lbl',
          });
      }
      return out;
    }
    const inRegion = neurons
      .filter((n) => n.region === region && !n.parent)
      .sort((a, b) => b.degree - a.degree)
      .slice(0, 28);
    for (const n of inRegion) out.push({ text: n.name, pos: n.position, cls: 'nb-lbl' });
    return out;
  }
  const v3 = new THREE.Vector3();
  function placeLabels(w: number, h: number) {
    const targets = labelTargets();
    if (hovered !== null) {
      const n = neurons[hovered] as LaidOutNeuron;
      targets.push({ text: n.name, pos: n.position, cls: 'nb-lbl-hover' });
    }
    while (labelPool.length < targets.length) {
      const d = el('div');
      labels.append(d);
      labelPool.push(d);
    }
    labelPool.forEach((d, i) => {
      const t = targets[i];
      if (!t) {
        d.hidden = true;
        return;
      }
      v3.set(...t.pos).project(camera);
      if (v3.z > 1 || Math.abs(v3.x) > 1.1 || Math.abs(v3.y) > 1.1) {
        d.hidden = true;
        return;
      }
      d.hidden = false;
      d.className = t.cls;
      if (d.textContent !== t.text) d.textContent = t.text;
      d.style.transform = `translate(${((v3.x + 1) / 2) * w}px, ${((1 - v3.y) / 2) * h}px)`;
    });
  }

  // ---------- loop ----------
  const timer = new THREE.Timer();
  function resize() {
    if (!renderer) return;
    const w = stage.clientWidth || 800;
    const h = stage.clientHeight || 600;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
  ro?.observe(stage);
  function tick() {
    frame = requestAnimationFrame(tick);
    if (!renderer || !controls) return;
    timer.update();
    const elapsed = Math.min(0.5, timer.getDelta());
    const dt = Math.min(0.05, elapsed);
    if (flying) {
      // Ease by elapsed time, not per frame, so slow devices still arrive.
      const f = reducedMotion ? 1 : 1 - Math.exp(-elapsed * 4.5);
      controls.target.lerp(camTarget, f);
      camera.position.lerp(camGoal, f);
      if (
        camera.position.distanceTo(camGoal) < 0.005 &&
        controls.target.distanceTo(camTarget) < 0.005
      ) {
        camera.position.copy(camGoal);
        controls.target.copy(camTarget);
        flying = false;
      }
    }
    controls.update();
    if (pulses && !reducedMotion) {
      const pos = pulses.geometry.getAttribute('position') as THREE.BufferAttribute;
      const col = pulses.geometry.getAttribute('color') as THREE.BufferAttribute;
      const tmp = new THREE.Color();
      for (let i = 0; i < MAX_PULSES; i++) {
        const ps = pulseState[i];
        if (!ps) {
          pos.setXYZ(i, 0, -50, 0);
          continue;
        }
        ps.t += ps.speed * dt;
        if (ps.t > 1) ps.t -= 1;
        const f = ps.t * CURVE_SEGMENTS;
        const k = Math.min(CURVE_SEGMENTS - 1, Math.floor(f));
        const frac = f - k;
        const base = (ps.link * (CURVE_SEGMENTS + 1) + k) * 3;
        pos.setXYZ(
          i,
          (curve[base] as number) + ((curve[base + 3] as number) - (curve[base] as number)) * frac,
          (curve[base + 1] as number) +
            ((curve[base + 4] as number) - (curve[base + 1] as number)) * frac,
          (curve[base + 2] as number) +
            ((curve[base + 5] as number) - (curve[base + 2] as number)) * frac,
        );
        const s = synapses[ps.link];
        if (s && selected && s.target === selected) tmp.set('#38bdf8');
        else if (s && selected && s.source === selected) tmp.set('#fb923c');
        else tmp.set(s ? SYNAPSE_COLORS[s.kind] : '#ffffff');
        col.setXYZ(i, tmp.r, tmp.g, tmp.b);
      }
      pos.needsUpdate = true;
      col.needsUpdate = true;
    }
    renderer.render(scene, camera);
    placeLabels(stage.clientWidth, stage.clientHeight);
  }

  const api: BrainViewer = {
    has3d,
    enterRegion(id) {
      selected = null;
      region = id;
      if (id) {
        const v = lobeView(id);
        flyTo(v.target, v.from);
        status.textContent = `Inside ${regionLabel(id)}.`;
      } else {
        flyTo(OVERVIEW_TARGET, OVERVIEW_CAMERA);
        if (controls) controls.autoRotate = !reducedMotion;
        status.textContent = 'Whole brain.';
      }
      renderAll();
    },
    select(id) {
      const n = id ? nById.get(id)?.n : undefined;
      if (!n) {
        selected = null;
        renderAll();
        if (region) {
          const v = lobeView(region);
          flyTo(v.target, v.from);
        }
        return;
      }
      selected = n.id;
      region = n.region;
      // Look from outside the brain towards the part, so little sits between it and the camera.
      const out = new THREE.Vector3(...n.position).add(new THREE.Vector3(0.6, 0.25, 0.3));
      out.normalize().multiplyScalar(1.1);
      flyTo(n.position, [n.position[0] + out.x, n.position[1] + out.y, n.position[2] + out.z]);
      status.textContent = `Selected ${n.name}.`;
      renderAll();
    },
    destroy() {
      cancelAnimationFrame(frame);
      ro?.disconnect();
      root.removeEventListener('keydown', onKey);
      controls?.dispose();
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        mesh.geometry?.dispose();
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat?.dispose();
      });
      renderer?.dispose();
      root.replaceChildren();
      root.classList.remove('nb-root');
    },
  };

  resize();
  renderAll();
  status.textContent = `${neurons.length} parts and ${synapses.length} connections.`;
  tick();
  return api;
}
