import type { ExplainedScore } from '@/lib/types';
import { Card } from './ui';

export function ScoreExplainer({ score }: { score: ExplainedScore }) {
  return (
    <Card title={`${score.name}: ${score.value ?? '—'}`} description={score.basis}>
      {score.range && score.range.low !== score.range.high && (
        <p className="mb-3 text-sm">
          Possible range once pending questions are answered:{' '}
          <strong>
            {score.range.low}–{score.range.high}
          </strong>
        </p>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-muted">
            <th className="py-1.5">Component</th>
            <th>Weight</th>
            <th>Score</th>
            <th>Basis</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {score.components.map((c) => (
            <tr key={c.key} className="align-top">
              <td className="py-2 pr-3 font-medium">{c.label}</td>
              <td className="pr-3 text-muted">
                {Math.round(c.weight * 100)}%
                {c.effectiveWeight !== c.weight && (
                  <span className="block text-xs">
                    effective {Math.round(c.effectiveWeight * 100)}%
                  </span>
                )}
              </td>
              <td className="pr-3">
                {c.score === null ? (
                  <span className="text-muted">n/a</span>
                ) : (
                  <div className="w-24">
                    <div className="h-1.5 rounded bg-canvas">
                      <div className="h-1.5 rounded bg-brand" style={{ width: `${c.score}%` }} />
                    </div>
                    <span className="text-xs">{c.score}</span>
                  </div>
                )}
              </td>
              <td className="text-muted">{c.explanation}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {[
          ['Positive evidence', score.positives],
          ['Missing evidence', score.gaps],
          ['Uncertainty', score.uncertainty],
          ['Recommended improvements', score.recommendations],
        ].map(([t, list]) => (
          <div key={t as string}>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
              {t as string}
            </h3>
            {(list as string[]).length ? (
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                {(list as string[]).map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-muted">None.</p>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
