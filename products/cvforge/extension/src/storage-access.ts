/**
 * Restrict extension storage to the extension's own pages and service worker.
 *
 * Chrome exposes `storage.local` to content scripts by default, and scripts
 * injected with `scripting.executeScript` (our job extractor) are content
 * scripts. `TRUSTED_CONTEXTS` keeps the refresh token out of their reach.
 * Source: https://developer.chrome.com/docs/extensions/reference/api/storage
 * (research R4). Called from the background on every service-worker start and
 * from the popup before any credential is written.
 */
export interface AccessLevelArea {
  setAccessLevel?: (options: { accessLevel: 'TRUSTED_CONTEXTS' }) => Promise<void>;
}

export async function restrictStorageToTrustedContexts(areas: {
  local: AccessLevelArea;
  session: AccessLevelArea;
}): Promise<{ restricted: string[]; unsupported: string[] }> {
  const restricted: string[] = [];
  const unsupported: string[] = [];
  for (const [name, area] of Object.entries(areas)) {
    if (typeof area.setAccessLevel !== 'function') {
      unsupported.push(name);
      continue;
    }
    await area.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
    restricted.push(name);
  }
  return { restricted, unsupported };
}
