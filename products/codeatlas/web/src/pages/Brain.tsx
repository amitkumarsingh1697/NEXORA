import { useEffect, useRef, useState } from 'react';
import type { BrainModel } from '@nexora/brain';
import { mountBrain } from '@nexora/brain/viewer';
import { api } from '../api';
import { Empty, ErrorBox, Spinner, useAsync } from '../components/ui';

/**
 * The architecture brain: the whole index drawn as a 3D brain with one lobe per part of the
 * system. Click a lobe to go inside, click a class or method to see its inputs, output,
 * callers and callees with the evidence for each link.
 */
export function BrainPage({ repoId, onOpen }: { repoId: number; onOpen: (id: number) => void }) {
  const d = useAsync(() => api<{ brain: BrainModel }>(`/api/repos/${repoId}/brain`), [repoId]);
  const host = useRef<HTMLDivElement>(null);
  const [no3d, setNo3d] = useState(false);
  // The parent passes a new callback on every render; keep the 3D scene mounted across them.
  const openRef = useRef(onOpen);
  openRef.current = onOpen;
  const brain = d.data?.brain;

  useEffect(() => {
    const el = host.current;
    if (!el || !brain) return;
    const viewer = mountBrain(el, brain, {
      openSourceLabel: 'Open in CodeAtlas',
      onOpenSource: (n) => {
        const id = Number(n.ref);
        if (Number.isInteger(id)) openRef.current(id);
      },
    });
    setNo3d(!viewer.has3d);
    return () => viewer.destroy();
  }, [brain]);

  if (d.loading && !d.data) return <Spinner label="Building the brain…" />;
  if (d.error) return <ErrorBox error={d.error} />;
  if (!brain || !brain.neurons.length)
    return <Empty>Nothing indexed yet. Index the repository to grow its brain.</Empty>;
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted">
        {brain.neurons.length} neurons and {brain.synapses.length} synapses. Lobe placement is
        inferred from paths and imports; each link shows whether it was observed or inferred.
        {no3d && ' WebGL is not available here, so the lists and details work without the 3D view.'}
      </p>
      <div
        ref={host}
        data-testid="brain"
        className="overflow-hidden rounded-lg border border-line"
        style={{ height: 'calc(100vh - 210px)', minHeight: 560 }}
      />
    </div>
  );
}
