const TEST_RE = /(^|\/)(__tests__|e2e)\/|[._-](test|spec)\.[cm]?[jt]sx?$/;
/** Test helpers and fixtures: code that supports tests but is not part of the architecture. */
const TEST_SUPPORT_RE = /(^|\/)(test|tests|__mocks__|fixtures?)\//;

/** A test file (`x.test.ts`, `x.spec.js`, `__tests__/`, `e2e/`). */
export function isTestPath(p: string): boolean {
  return TEST_RE.test(p);
}

/** A test file, or a helper or fixture under a test, mocks or fixtures folder. */
export function isTestSupportPath(p: string): boolean {
  return TEST_RE.test(p) || TEST_SUPPORT_RE.test(p);
}
