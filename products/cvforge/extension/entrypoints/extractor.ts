import { ExtractionError, extractJob, type ExtractedJob } from '../src/extract';

export type ExtractorResult =
  { ok: true; job: ExtractedJob } | { ok: false; reason: string; message: string };

/**
 * Injected into the active tab only when the user clicks "Extract" in the
 * popup (activeTab + scripting.executeScript). It reads the rendered DOM of
 * that tab once and returns the result. It does not read cookies or storage,
 * follow links, click anything, or stay resident.
 */
export default defineUnlistedScript((): ExtractorResult => {
  try {
    return { ok: true, job: extractJob(document, location.href) };
  } catch (e) {
    if (e instanceof ExtractionError) return { ok: false, reason: e.reason, message: e.message };
    return {
      ok: false,
      reason: 'error',
      message: 'Extraction failed on this page. Paste the description manually instead.',
    };
  }
});
