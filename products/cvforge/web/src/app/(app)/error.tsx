'use client';

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="rounded-xl border border-missing-soft bg-white p-6">
      <h1 className="font-semibold">Something went wrong</h1>
      <p className="mt-1 text-sm text-muted">
        The error was logged. Your data has not been changed by this failure.
      </p>
      <button onClick={reset} className="mt-3 rounded-md bg-brand px-4 py-2 text-sm text-white">
        Try again
      </button>
    </div>
  );
}
