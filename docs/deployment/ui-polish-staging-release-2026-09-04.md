# UI polish staging release — 2026-09-04

## Scope

- Environment: staging.
- Public web URL: `https://sgi.lacomarcanic.com`.
- Source branch: `codex/staging-pilot`.
- Deployed application commit: `273a316d290219569cf84be40509de6e9619c583`.
- Deployment scope: web service only. The API was intentionally not redeployed because the release contains no backend, schema, migration, RBAC, or contract changes.

## Authorization and release result

- The operator explicitly authorized the staging deployment before the final deploy action.
- Render built and started the web service successfully.
- Result observed in Render: `Deploy succeeded | Live`.
- Recorded deployment duration: 1 minute 44 seconds.
- Previous known-good web revision available for rollback: `5a668ae010be3be93275bec9438838210a0cd739`.

## Pre-deployment quality gates

- `pnpm lint`: passed, 8 of 8 tasks.
- `pnpm typecheck`: passed, 7 of 7 tasks.
- `pnpm test`: passed, 61 files and 249 tests.
- `pnpm test:integration`: passed, 29 files and 318 tests.
- `pnpm build`: passed, 7 of 7 packages and 19 web routes generated.
- Final targeted Playwright suite: passed, 22 of 22 tests.
- Full Playwright suite for the first visual phase: passed, 42 of 42 tests.
- Impeccable detector, Prettier check, staged secret scan, and `git diff --check`: passed.

## Post-deployment verification

The following read-only smoke checks passed against the custom staging domains:

| Probe | Result | Observed time |
| --- | --- | --- |
| Web login page | HTTP 200 | 0.639281 s |
| API health | HTTP 200 | 0.577082 s |
| API readiness | HTTP 200 | 0.379739 s |

The deployed interface was also inspected in the browser. The login recovery guidance and the invalid activation-link recovery state rendered correctly and provided actionable Spanish instructions.

## Data-safety record

This release did not run migrations, change persistent data, create invitations, authenticate as a business user, alter permissions, or execute any business mutation. No secrets, private identifiers, database credentials, or session values are recorded in this evidence.
