import { lazy, Suspense, type ReactNode } from 'react';
import { Ask } from './pages/Ask';
import { Spinner } from './components/ui';
import { IntegrationsPage } from './pages/Integrations';
import { Investigate } from './pages/Investigate';
import { Overview } from './pages/Overview';
import { StructurePage } from './pages/Structure';
import {
  Dependencies,
  Flows,
  KnowledgePage,
  Modules,
  OwnershipPage,
  Risk,
  SearchPage,
} from './pages/Views';

// three.js is large; load the brain only when its tab opens.
const BrainPage = lazy(() => import('./pages/Brain').then((m) => ({ default: m.BrainPage })));

export interface TabProps {
  repoId: number;
  onOpen: (id: number) => void;
}

export interface TabDef {
  id: string;
  label: string;
  render: (p: TabProps) => ReactNode;
}

/** Repository tabs. Feature modules (Ask, Investigate) append to this list. */
export const TABS: TabDef[] = [
  { id: 'overview', label: 'Overview', render: (p) => <Overview repoId={p.repoId} /> },
  {
    id: 'brain',
    label: 'Brain',
    render: (p) => (
      <Suspense fallback={<Spinner label="Loading the brain viewer…" />}>
        <BrainPage {...p} />
      </Suspense>
    ),
  },
  { id: 'structure', label: 'Structure', render: (p) => <StructurePage {...p} /> },
  { id: 'modules', label: 'Modules', render: (p) => <Modules {...p} /> },
  { id: 'dependencies', label: 'Dependencies', render: (p) => <Dependencies {...p} /> },
  { id: 'flows', label: 'Flows', render: (p) => <Flows {...p} /> },
  { id: 'integrations', label: 'Integrations', render: (p) => <IntegrationsPage {...p} /> },
  { id: 'risk', label: 'Risk', render: (p) => <Risk {...p} /> },
  { id: 'ownership', label: 'Ownership', render: (p) => <OwnershipPage repoId={p.repoId} /> },
  { id: 'knowledge', label: 'Knowledge', render: (p) => <KnowledgePage {...p} /> },
  { id: 'search', label: 'Search', render: (p) => <SearchPage {...p} /> },
  { id: 'ask', label: 'Ask', render: (p) => <Ask repoId={p.repoId} /> },
  { id: 'investigate', label: 'Investigate', render: (p) => <Investigate repoId={p.repoId} /> },
];
