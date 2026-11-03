import { restrictStorageToTrustedContexts } from '../src/storage-access';

export default defineBackground(() => {
  void restrictStorageToTrustedContexts(browser.storage as never).catch((e: unknown) => {
    console.error(
      '[cvforge] could not restrict storage access:',
      e instanceof Error ? e.message : e,
    );
  });
});
