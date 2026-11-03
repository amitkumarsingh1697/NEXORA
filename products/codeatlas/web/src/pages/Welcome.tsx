import { useState } from 'react';
import { api } from '../api';
import { Button, ErrorBox } from '../components/ui';

/** First-run screen (spec §5.12 screen 1). Shown until dismissed, and again after delete-all. */
export function Welcome({ onDone }: { onDone: () => void }) {
  const [error, setError] = useState<unknown>(null);
  return (
    <div className="mx-auto max-w-2xl space-y-5 px-4 py-12">
      <h1 className="text-2xl font-semibold">Welcome to CodeAtlas</h1>
      <p className="text-sm">
        CodeAtlas reads a repository on this computer and builds a map of it: modules, dependencies,
        request flows, ownership and risk. You can ask questions and get answers that cite the exact
        lines they come from, and investigate a bug through to a patch you approve.
      </p>
      <ul className="list-disc space-y-2 pl-5 text-sm">
        <li>
          <strong>Local first.</strong> The index lives in a database on this machine. Nothing is
          uploaded.
        </li>
        <li>
          <strong>Evidence labelled.</strong> Every relationship is marked observed, inferred or
          unknown, and the coverage report says what was not analysed.
        </li>
        <li>
          <strong>You stay in control.</strong> CodeAtlas never changes your files on its own.
          Patches are made in a separate worktree and only merged when you approve and confirm them.
        </li>
        <li>
          <strong>AI is optional.</strong> Answers use a local Ollama model if one is running.
          Without one you still get the map and evidence-only answers.
        </li>
      </ul>
      <Button
        onClick={async () => {
          try {
            await api('/api/settings/welcome', { method: 'POST' });
            onDone();
          } catch (e) {
            setError(e);
          }
        }}
      >
        Add your first repository
      </Button>
      <ErrorBox error={error} />
    </div>
  );
}
