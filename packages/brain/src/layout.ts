import { classifyFile } from './classify';
import { DEFAULT_REGIONS, type BrainModel, type BrainNeuron, type RegionId } from './model';

/** A point in brain space: x left-right, y up, z front (+) to back (-). */
export type Vec3 = [number, number, number];

export interface LobeShape {
  center: Vec3;
  radii: Vec3;
}

/**
 * Where each lobe sits, loosely following a human brain seen from the side: frontal lobe
 * at the front (frontend), parietal on top (backend), temporal below (database), occipital
 * at the back (DevOps), cerebellum under the back (core and shared code).
 */
export const LOBES: Record<RegionId, LobeShape> = {
  frontend: { center: [0, 0.35, 0.95], radii: [1.15, 0.7, 0.65] },
  backend: { center: [0, 0.85, -0.45], radii: [1.1, 0.42, 0.6] },
  database: { center: [0, -0.3, 0.2], radii: [1.15, 0.36, 0.7] },
  devops: { center: [0, 0.25, -1.3], radii: [1.0, 0.55, 0.38] },
  core: { center: [0, -0.8, -1.2], radii: [0.85, 0.38, 0.5] },
};

export interface LaidOutNeuron extends BrainNeuron {
  region: RegionId;
  regionReason: string;
  position: Vec3;
  /** Number of synapses in and out, used for size and label priority. */
  degree: number;
}

/** Small deterministic PRNG so the same model always draws the same brain. */
function seeded(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A random point inside the unit ball scaled by `scale`. */
function inBall(rand: () => number, scale: number): Vec3 {
  for (;;) {
    const p: Vec3 = [rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1];
    if (p[0] * p[0] + p[1] * p[1] + p[2] * p[2] <= 1)
      return [p[0] * scale, p[1] * scale, p[2] * scale];
  }
}

function insideLobe(region: RegionId, local: Vec3): Vec3 {
  const l = LOBES[region];
  return [
    l.center[0] + local[0] * l.radii[0],
    l.center[1] + local[1] * l.radii[1],
    l.center[2] + local[2] * l.radii[2],
  ];
}

/**
 * Fills in regions (from file paths when the producer left them out) and gives every neuron
 * a position inside its lobe. Code from one file clusters together, and members cluster
 * around their class, so related things sit side by side.
 */
export function layoutBrain(model: BrainModel): LaidOutNeuron[] {
  const regionIds = new Set((model.regions ?? DEFAULT_REGIONS).map((r) => r.id));
  const degree = new Map<string, number>();
  for (const s of model.synapses) {
    degree.set(s.source, (degree.get(s.source) ?? 0) + 1);
    degree.set(s.target, (degree.get(s.target) ?? 0) + 1);
  }
  const byId = new Map(model.neurons.map((n) => [n.id, n]));
  const placed = model.neurons.map((n) => {
    let region = n.region;
    let reason = n.regionReason ?? '';
    if (!region || !regionIds.has(region)) {
      const parent = n.parent ? byId.get(n.parent) : undefined;
      const p = parent?.region
        ? { region: parent.region, reason: parent.regionReason ?? 'same place as its parent' }
        : classifyFile(n.file, { kind: n.kind });
      region = regionIds.has(p.region) ? p.region : 'core';
      reason = reason || p.reason;
    }
    return { n, region, reason: reason || 'placed by the producer' };
  });

  // Cluster centres: one per (region, file).
  const clusterKey = (n: BrainNeuron, region: RegionId) => `${region}|${n.file ?? n.id}`;
  const clusterSize = new Map<string, number>();
  for (const { n, region } of placed) {
    const k = clusterKey(n, region);
    clusterSize.set(k, (clusterSize.get(k) ?? 0) + 1);
  }
  const centres = new Map<string, Vec3>();
  for (const k of clusterSize.keys()) {
    const region = k.split('|')[0] as RegionId;
    centres.set(k, insideLobe(region, inBall(seeded(k), 0.72)));
  }

  const out = new Map<string, LaidOutNeuron>();
  // Parents first so members can sit around them.
  const ordered = [...placed].sort((a, b) => (a.n.parent ? 1 : 0) - (b.n.parent ? 1 : 0));
  for (const { n, region, reason } of ordered) {
    const rand = seeded(n.id);
    const parent = n.parent ? out.get(n.parent) : undefined;
    let position: Vec3;
    if (parent && parent.region === region) {
      const o = inBall(rand, 0.09);
      position = [parent.position[0] + o[0], parent.position[1] + o[1], parent.position[2] + o[2]];
    } else {
      const k = clusterKey(n, region);
      const c = centres.get(k) as Vec3;
      const spread = Math.min(0.32, 0.05 + 0.025 * Math.sqrt(clusterSize.get(k) ?? 1));
      const o = inBall(rand, spread);
      position = [c[0] + o[0], c[1] + o[1], c[2] + o[2]];
    }
    out.set(n.id, {
      ...n,
      region,
      regionReason: reason,
      position,
      degree: degree.get(n.id) ?? 0,
    });
  }
  return model.neurons.map((n) => out.get(n.id) as LaidOutNeuron);
}
