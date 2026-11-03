import type { ReactNode } from 'react';
import { Ask } from './pages/Ask';
import { Investigate } from './pages/Investigate';
import { Overview } from './pages/Overview';
import {
  Dependencies,
  Flows,
  KnowledgePage,
  Modules,
  OwnershipPage,
  Risk,
  SearchPage,
} from './pages/Views';

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
  { id: 'modules', label: 'Modules', render: (p) => <Modules {...p} /> },
  { id: 'dependencies', label: 'Dependencies', render: (p) => <Dependencies {...p} /> },
  { id: 'flows', label: 'Flows', render: (p) => <Flows {...p} /> },
  { id: 'risk', label: 'Risk', render: (p) => <Risk {...p} /> },
  { id: 'ownership', label: 'Ownership', render: (p) => <OwnershipPage repoId={p.repoId} /> },
  { id: 'knowledge', label: 'Knowledge', render: (p) => <KnowledgePage {...p} /> },
  { id: 'search', label: 'Search', render: (p) => <SearchPage {...p} /> },
  { id: 'ask', label: 'Ask', render: (p) => <Ask repoId={p.repoId} /> },
  { id: 'investigate', label: 'Investigate', render: (p) => <Investigate repoId={p.repoId} /> },
];
