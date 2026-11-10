import type { BrainModel, BrainNeuron, BrainSynapse, SynapseKind } from './model';

/** How a synapse reads from each end, in plain words. */
export const SYNAPSE_WORDS: Record<SynapseKind, { out: string; in: string }> = {
  calls: { out: 'Calls', in: 'Called by' },
  renders: { out: 'Renders', in: 'Rendered by' },
  extends: { out: 'Extends', in: 'Extended by' },
  implements: { out: 'Implements', in: 'Implemented by' },
  instantiates: { out: 'Creates', in: 'Created by' },
  handles: { out: 'Handled by', in: 'Handles' },
  accesses_db: { out: 'Uses database', in: 'Used by' },
  reads_config: { out: 'Reads config', in: 'Read by' },
  writes_config: { out: 'Writes config', in: 'Written by' },
  calls_service: { out: 'Calls service', in: 'Called by' },
  imports: { out: 'Imports', in: 'Imported by' },
  starts: { out: 'Starts at', in: 'Started by' },
  reads_table: { out: 'Reads table', in: 'Read by' },
  writes_table: { out: 'Writes table', in: 'Written by' },
  references: { out: 'References', in: 'Referenced by' },
  builds: { out: 'Builds', in: 'Built by' },
  runs: { out: 'Runs', in: 'Run by' },
  includes: { out: 'Includes', in: 'Included by' },
  fires_on: { out: 'Fires on', in: 'Triggers' },
  indexes: { out: 'Indexes', in: 'Indexed by' },
};

export interface Relation {
  synapse: BrainSynapse;
  other: BrainNeuron;
}

export interface Relations {
  /** Where its input comes from: synapses pointing at it, grouped by kind. */
  incoming: Map<SynapseKind, Relation[]>;
  /** Where it sends work: synapses leaving it, grouped by kind. */
  outgoing: Map<SynapseKind, Relation[]>;
  members: BrainNeuron[];
  parent: BrainNeuron | undefined;
}

export class BrainIndex {
  readonly byId: Map<string, BrainNeuron>;
  private readonly out = new Map<string, BrainSynapse[]>();
  private readonly in = new Map<string, BrainSynapse[]>();
  private readonly children = new Map<string, BrainNeuron[]>();

  constructor(readonly model: BrainModel) {
    this.byId = new Map(model.neurons.map((n) => [n.id, n]));
    for (const s of model.synapses) {
      const o = this.out.get(s.source) ?? [];
      o.push(s);
      this.out.set(s.source, o);
      const i = this.in.get(s.target) ?? [];
      i.push(s);
      this.in.set(s.target, i);
    }
    for (const n of model.neurons)
      if (n.parent) {
        const c = this.children.get(n.parent) ?? [];
        c.push(n);
        this.children.set(n.parent, c);
      }
  }

  outgoing(id: string): BrainSynapse[] {
    return this.out.get(id) ?? [];
  }

  incoming(id: string): BrainSynapse[] {
    return this.in.get(id) ?? [];
  }

  relations(id: string): Relations {
    const group = (list: BrainSynapse[], end: 'source' | 'target') => {
      const m = new Map<SynapseKind, Relation[]>();
      for (const s of list) {
        const other = this.byId.get(s[end]);
        if (!other) continue;
        const g = m.get(s.kind) ?? [];
        g.push({ synapse: s, other });
        m.set(s.kind, g);
      }
      for (const g of m.values()) g.sort((a, b) => a.other.name.localeCompare(b.other.name));
      return m;
    };
    const n = this.byId.get(id);
    return {
      incoming: group(this.incoming(id), 'source'),
      outgoing: group(this.outgoing(id), 'target'),
      members: [...(this.children.get(id) ?? [])].sort((a, b) => (a.line ?? 0) - (b.line ?? 0)),
      parent: n?.parent ? this.byId.get(n.parent) : undefined,
    };
  }

  /**
   * Finds neurons by name or file. Exact names rank first, then names that start with the
   * query, then names and files that contain it.
   */
  search(query: string, limit = 12): BrainNeuron[] {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const scored: { n: BrainNeuron; score: number }[] = [];
    for (const n of this.model.neurons) {
      const name = n.name.toLowerCase();
      const short = name.split('.').pop() ?? name;
      let score = -1;
      if (name === q || short === q) score = 0;
      else if (short.startsWith(q) || name.startsWith(q)) score = 1;
      else if (name.includes(q)) score = 2;
      else if (n.file?.toLowerCase().includes(q)) score = 3;
      if (score >= 0) scored.push({ n, score });
    }
    scored.sort((a, b) => a.score - b.score || a.n.name.length - b.n.name.length);
    return scored.slice(0, limit).map((s) => s.n);
  }
}
