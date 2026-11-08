import { validateBrain } from './model';
import { mountBrain } from './viewer';

/**
 * Entry point of the single-file brain page. The page carries its model in
 * <script id="brain-data" type="application/json">; it is validated before drawing.
 */
function start() {
  const root = document.getElementById('brain') as HTMLElement;
  const raw = document.getElementById('brain-data')?.textContent ?? '';
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    root.textContent = `This brain file is damaged: its data is not valid JSON (${(e as Error).message}).`;
    return;
  }
  const result = validateBrain(parsed);
  if (!result.ok) {
    root.textContent = `This brain file cannot be shown: ${result.errors.join(' ')}`;
    return;
  }
  for (const w of result.warnings) console.warn(`[brain] ${w}`);
  document.title = result.model.title;
  mountBrain(root, result.model);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
