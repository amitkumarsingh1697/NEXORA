# Release checklist

## Every release

- [ ] `pnpm install --frozen-lockfile` from a clean checkout
- [ ] `pnpm format:check`
- [ ] `pnpm check` (typecheck, lint, unit and integration tests) passes
- [ ] `pnpm --filter @nexora/cvforge-web e2e` passes
- [ ] `pnpm --filter @nexora/codeatlas-web e2e` passes
- [ ] `pnpm audit --prod` has no high/critical findings (or each is documented)
- [ ] New migrations reviewed; applied on a copy of production data; rollback plan written
- [ ] CHANGELOG updated; IMPLEMENTATION_STATUS and KNOWN_LIMITATIONS reflect reality
- [ ] No secrets in the diff (`git diff | grep -iE "secret|password|token"` reviewed)
- [ ] Logs sampled: no resume text, tokens or passwords

## CVForge production

- [ ] `APP_SECRET`, `APP_ORIGIN`, `DATABASE_URL` set; `NODE_ENV=production`
- [ ] TLS in front; cookies show `Secure`
- [ ] Retention job scheduled and its last run logged
- [ ] Backups verified by a restore test
- [ ] Health check wired to monitoring
- [ ] Hosted AI provider (if any) disclosed in the privacy notice and `AI_REMOTE_CONSENT` set deliberately

## Extension store submission

- [ ] Built against the production origin; host permission is only that origin
- [ ] Permissions justification: `activeTab` (read the current page on click), `scripting` (inject the extractor on click), `storage` (device credentials)
- [ ] Privacy disclosures match PRIVACY_AND_DATA_HANDLING
- [ ] Version bumped in `package.json`

## CodeAtlas

- [ ] Service still binds 127.0.0.1; token, Host and Origin tests pass
- [ ] Command allowlist unchanged or the change reviewed
- [ ] Web build present (`products/codeatlas/web/dist`)
