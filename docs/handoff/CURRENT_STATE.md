# SGI La Comarca — Current State

Updated: 2026-09-04.

This document is the repository handoff snapshot. Code, migrations, and tests
remain authoritative. Revalidate external operational state before acting on it.

## Free staging pilot (Render + Neon)

On 2026-09-03 the owner approved the bounded free staging pilot documented in
[ADR-013](../decisions/ADR-013-free-staging-pilot.md). An isolated Neon project
named `sgi-comarca-staging` was created in `aws-us-east-1` with PostgreSQL 18.
The direct read-only fingerprint confirmed database `sgi_comarca_staging`, role
`sgi_staging_owner`, one default branch named `main`, zero public tables and no
`_prisma_migrations` table. No connection string, credential or private ID was
written to the repository.

On 2026-09-04 the owner explicitly authorized the schema-only gate. The target
was revalidated by project, region, PostgreSQL major, branch, database and role;
the schema was still empty and all six previous Neon operations were finished.
The branch `checkpoint-empty-2026-09-04` was created from `main` without its own
compute. `pnpm db:migrate:deploy` then applied the seven versioned migrations to
`main`. Direct verification found 35 public tables, seven finished migration
rows, zero unfinished migrations, zero active Neon operations, and zero rows in
the inspected bootstrap and operational tables.

The owner then explicitly authorized the structural-bootstrap gate. After a
second positive target check, the branch
`checkpoint-pre-bootstrap-2026-09-04` was created from `main` without its own
compute. Two bootstrap attempts reached Prisma's default five-second
interactive-transaction timeout and rolled back completely. The focused fix
sets the bootstrap transaction timeout to 30 seconds while preserving
`Serializable` isolation; formatting, database-package lint/typecheck and the
7/7 bootstrap integration cases passed before the retry. The corrected
`pnpm db:bootstrap` run created exactly 6 roles, 20 permissions, 4 pending
users, 3 active warehouses, 11 active user-role grants, 20 active
role-permission grants, 2 active direct user grants and 1 bootstrap audit log.
Direct verification found no revoked grants, password credentials, sessions,
invitations, products, inventory balances or movements, sales, financial
entries, closings or inventory-count sessions, and no active Neon operation.

The owner explicitly authorized the Git publication gate on 2026-09-04. Branch
`codex/staging-pilot` was created from `main` at `37e97e4`; the bootstrap
timeout fix, reviewed UI polish, and Render/Neon pilot configuration were kept
in separate auditable commits and published only to that branch. Validation
passed Prisma schema validation, lint 8/8, typecheck 7/7, unit tests 61 files /
249 tests, integration tests 29 files / 318 tests, build 7/7 and Playwright
42/42. Every file in the gate passes an explicit Prettier check, `git diff
--check` and the secret scan. The repository-wide `pnpm format:check` remains
red on 223 pre-existing files outside this gate, including the untracked
`.agents/` plugin cache; those files were not reformatted or committed.

The owner explicitly authorized the Render-services gate on 2026-09-04. The
official Render CLI validated the manifest after removing the Free-tier-only
unsupported shutdown-delay setting and declaring the Git repository. Because
the dashboard browser was unavailable, the two manifest-equivalent services
were created directly with the CLI instead of attaching a Blueprint. Both use
the Free plan in Virginia, track `codex/staging-pilot` with automatic deploys
off, and deploy commit `3425351`; no Render database or paid resource exists.
The API uses the pooled Neon connection as a Render secret, and both HMAC
secrets were generated locally in memory and transmitted only to Render.

The initial web build exposed a clean-checkout defect: it did not generate the
Prisma client before Next.js typechecking. Adding `pnpm db:generate` to the web
build command fixed the deploy. Both services are now `live`; read-only HTTPS
checks returned 200 for API health, API readiness and the web login page. No
migration, bootstrap, import, invitation or business mutation ran from Render.
This remains a time-bound external snapshot, not permanent live truth. The full
HTTPS/cookie/cold-start smoke gate and every activation or data gate remain
separately controlled in the
[pilot runbook](../deployment/render-neon-staging-pilot.md).

## Git state

The current repository HEAD is always determined dynamically. This document
never records an authoritative "current" HEAD of its own, because any commit
that updates the handoff would immediately invalidate such a field.

- Repository: `DylanRizo/sgi-comarca`.
- Pilot deployment branch: `codex/staging-pilot`, based on `main` at `37e97e4`.
- Branch: `main`, except the FASE 9 work below, which lives on
  `migration/09-reports` and is not yet merged into `main`.
- Expected working tree before starting work: clean.
- Committed FASE 9B.1 physical count application and REST API on
  `migration/09-reports`; resolve its hash dynamically with `git log`.
- Committed FASE 9A schema/RBAC fixes (break-glass authorization matrix,
  legacy importer, migration column reference) on `migration/09-reports`:
  `b55aef9`.
- Committed FASE 9A physical count schema and RBAC foundation on
  `migration/09-reports`: `2671d5d`.
- Committed FASE 8C UI and its e2e suite, closing FASE 8 end to end:
  `1e304cf`.
- Committed FASE 8B application/API closure: `6090001`.
- Committed FASE 8B.1–8B.4 implementation baseline, including the transactional
  closing read fix: `a0b9cf64a11bbbc885a71dd0396f6db11310ad3c`.
- Committed FASE 7C implementation and initial E2E baseline:
  `fb21e2277b491a69fa41448246797bf4323f2be3`.
- Committed FASE 7B implementation baseline:
  `b75adfd102fcedfa60f26c37414de7c692478d75`.
- Functional baseline at FASE 7A completion:
  `e7eca53889a3554dea609be055fea2d38dfdd02f`.
- Previous functional baseline at FASE 6 completion:
  `07c00472e28a55b9706cff4514c96000a1799a85`.
- Initial cross-agent handoff commit:
  `e47b6ba87492fe991ce7cf63e17f0420e68a50a5`.

A newer documentation-only commit does not invalidate the functional baseline.
A newer commit touching code, schema, migrations, tests, or configuration does
require verification before acting.

Always resolve the real state with:

```bash
git status
git branch --show-current
git rev-parse HEAD
git rev-parse origin/main
git log -5 --oneline
```

Then confirm that every commit added after the functional baseline is either
documentation-only or an understood functional change already reflected in this
file.

## Phase history

| Phase | Versioned result |
|---|---|
| 0 | Legacy functional/data audit completed. |
| 1 | Project brief, target architecture, traceability, and ADR baseline completed. |
| 2 | Reproducible pnpm/Turborepo monorepo foundation completed. |
| 3A | Structural PostgreSQL/Prisma model and bootstrap foundation completed. |
| 3B | Authentication, sessions, authorization, user administration API, and auth UI complete. |
| 3C | Deterministic, read-only XLSX profiler complete. |
| 4 | Importer framework and guarded commit engine completed; Waves 1–2 were committed and verified in staging. The overall phase remains `IN_PROGRESS` because Waves 3+ have not started. |
| 5A | Product/inventory read model and API complete. |
| 5B | Product/inventory UI complete. |
| 5C | Audited transactional inventory adjustments complete; the first controlled staging adjustment passed. |
| 6A | Transfer RBAC and persistent transfer/ledger foundation complete. |
| 6B | Movement history API/UI and transfer API/UI complete. |
| 6 gate | The first controlled staging transfer was authorized, executed exactly once from the UI, and verified on 2026-08-23. `FIRST_STAGING_TRANSFER_PASS`. |
| 6 regression | Concurrent shared-session renewal defect fixed and validated. `PHASE_6_CONCURRENCY_FIX_PASS`. |
| 6 | Transfer foundation, movement history, transfer API/UI, operational gate, and post-gate concurrency regression are complete. `PHASE_6_COMPLETE`. |
| 7A | Sales schema foundation and the `sales.read` role grant completed. This includes structural integrity for operational sales; it does not include the sales application/API, UI, legacy import, or any staging deployment. `PHASE_7A_SCHEMA_COMPLETE`. |
| 7B | Sales application layer and REST API complete in blocks 7B.1–7B.4: contracts and pure domain, read endpoints, transactional creation, and lifecycle. PostgreSQL integration, the plan §14 concurrency matrix, E2E regression, static checks and build passed locally on 2026-08-28. A money-scale defect on the read surface was found by that run and fixed. The owner reviewed the diff and evidence and declared the phase closed on 2026-08-28. This closes the versioned implementation only; no staging deployment, sales UI, or legacy import is included. `PHASE_7B_COMPLETE`. |
| 7C | Sales UI complete in blocks 7C.1–7C.4: list and detail, multi-line and multi-warehouse creation, in-transit confirmation, total cancellation, and Playwright coverage of the critical flows. Verification on 2026-08-28 passed 24/24 Chromium E2E tests plus the full integration and quality baseline, and found a defect that hid the public sales error codes behind a generic response; it was fixed. The owner reviewed the diff and evidence and declared the phase closed on 2026-08-28. This closes the versioned implementation only; nothing was deployed and staging was never touched. `PHASE_7C_COMPLETE`. |
| 8A | Finances and daily closings schema foundation complete: financial categories and entries, daily closings and their reopening history, with the ADR-010 rules enforced by CHECK constraints and triggers. A persisted entry is always manual, the closing formula excludes expenses, the applied tolerance is recorded per closing, and figures and history are immutable. Verified on 2026-08-29 against the local Docker Compose PostgreSQL: migration applies cleanly and 213/213 integration tests pass. Not deployed; staging was verified untouched. `PHASE_8A_SCHEMA_COMPLETE`. |
| 8B | Contracts and pure finance domain, read API, manual financial entries, and daily closing creation/reopening are implemented and closed in blocks 8B.1-8B.5. The 8B.5 closure verification ran directly against the local PostgreSQL on 2026-08-29: 55 files / 194 unit tests, 25 files / 244 integration tests, 24/24 Chromium E2E, lint 8/8, typecheck 7/7, build 7/7, format and Prisma schema clean, an in-memory OpenAPI check (36 total paths, 6 finance/closing, none public), and a manual security review with no findings. The local staging database was reconfirmed untouched: still at the 6A migration, no FASE 8A tables, sales/sale_items present since 3A with zero rows. `PHASE_8B_COMPLETE`. |
| 8C | Finances and daily closings UI complete in Spanish over the closed FASE 8B API: a merged finance list (manual entries plus sale income derived at read time, never a persisted or editable entry), category/type/date filters, period totals, manual entry creation, closing list/detail with frozen figures and reopening history, closing creation, and a reopen action gated by permission and by closing status. Verified directly on 2026-08-29: 58 files / 203 unit tests, 32/32 Chromium E2E (24 regression plus 8 new), lint 8/8, typecheck 7/7, build 7/7, format clean, and a manual security review with no findings. Building it exposed and fixed a real cross-suite E2E ordering bug (an exact product count in 02-inventory.e2e.ts depended on file discovery order rather than an explicit one) and a cross-module 403-message bug naming the wrong permission. Not deployed; nothing was written to staging. `PHASE_8C_COMPLETE`. This closes FASE 8 end to end: schema, application/API, and UI. `PHASE_8_COMPLETE`. |
| 9A | Physical inventory count schema and RBAC foundation complete on `migration/09-reports` (not yet merged into `main`): `InventoryCountSession` (lifecycle `OPEN → PENDING_APPROVAL → APPROVED`, or `CANCELLED` from either non-terminal state, with separate creator/approver/canceller actors and actor-scoped idempotency), `InventoryCountSessionWarehouse` (explicit session scope, so a missing line is distinguishable from a warehouse never meant to be counted, per AT-AUD-02), and `InventoryCountLine` (expected/counted/difference, linked immutably to the generated adjustment via a unique `adjustment_movement_id`). The session never writes stock itself; a deferred constraint trigger requires the linked movement to be an `ADJUSTMENT` matching the line's product, warehouse, and magnitude, so the FASE 5C atomic adjustment path remains the only stock-writing route. Named to avoid colliding with the existing `InventoryAuditService` (audit log), per the plan's §6. RBAC adds `inventory.audit.create`, `inventory.audit.approve`, `reports.read`, and `analytics.read` as direct grants to the sole admin only; no role grants any of the four, preserving the still-open role-grant decision in the FASE 9 plan. No API and no UI. Commit `2671d5d` added the foundation; commit `b55aef9` fixed a break-glass authorization-matrix gap (it was checking only `sales.cancel` as the lone direct grant and ignoring the four new ones), a legacy-importer reference, and a migration column reference, and added full integration coverage. Verified directly against PostgreSQL 18.4 on 2026-08-30: lint 8/8, typecheck 7/7, unit 58 files/204 tests, integration 26 files/262 tests, build 7/7, `format:check` and `db:validate` clean. Not deployed; staging remains on the FASE 7A/8A migration. `PHASE_9A_SCHEMA_COMPLETE`. |
| 9B.1 | Physical count application and REST API complete on `migration/09-reports` (not yet merged into `main`): the `inventory-counts` module implements session creation, count capture, submission, approval and cancellation over the closed 9A schema. Approval delegates every stock change to the FASE 5C atomic adjustment path inside one transaction, so no second stock-writing route exists; it refuses the whole approval when a balance moved since the count (`INVENTORY_COUNT_BALANCE_CHANGED`) rather than recomputing against the new balance, and reports uncounted in-scope products as `pendingItems` instead of assuming zero (AT-AUD-02). Approving requires `inventory.audit.approve` and `inventory.adjust` on the same actor; reads and cancellation accept either audit capability, since 9A defined no read permission. `RequirePermission` gained additive any-of support (a single code still stores plain string metadata). No migration and no RBAC change were needed. See ["Current inventory-count application"](#current-inventory-count-application-fase-9b1-migration09-reports-only). Verified directly against PostgreSQL 18.4 on 2026-08-30. Not deployed; no UI (that is 9C). `PHASE_9B_1_COMPLETE`. |

## Current inventory-count application (FASE 9B.1, `migration/09-reports` only)

The `inventory-counts` module turns the 9A schema into an API. It is versioned
and locally verified only: nothing is deployed and no UI exists (that is 9C).

- `POST /api/v1/inventory/counts` creates an `OPEN` session declaring its
  warehouse scope, guarded by `inventory.audit.create`, with a mandatory
  `Idempotency-Key` hashed under the creator's scope exactly as transfers do.
- `POST /api/v1/inventory/counts/:id/lines` captures one count. The expected
  quantity is the balance at capture time (zero when no balance row exists)
  and the difference is computed by the application, because the schema stores
  it rather than generating it. Capture is idempotent on the natural key
  `(session, product, warehouse)` behind an advisory lock; recapturing the same
  quantity replays, a different quantity is refused — a captured line is
  immutable, and correcting a miscount means cancelling the session.
- `POST /api/v1/inventory/counts/:id/submit` moves `OPEN → PENDING_APPROVAL`
  and refuses an empty session, which could never be approved.
- `POST /api/v1/inventory/counts/:id/approve` requires
  `inventory.audit.approve` **and** `inventory.adjust` on the same actor,
  because it delegates every adjustment to the FASE 5C atomic path. In one
  transaction it locks the session, locks every affected balance in a single
  ordered statement, verifies each still equals the line's stored expected
  quantity, produces one `ADJUSTMENT` per differing line, links each movement
  to its line, marks the session `APPROVED`, and appends one audit event.
- `POST /api/v1/inventory/counts/:id/cancel` accepts either capability: the
  capture side may abandon any non-terminal session, and an approver may stop
  a submitted one — the schema has no `REJECTED` state, so cancellation is the
  only terminal stop.
- Reads accept either `inventory.audit.create` or `inventory.audit.approve`,
  since 9A defined no read permission and a pure approver must be able to
  review what it approves. `RequirePermission` now accepts several codes
  meaning "any of them"; a single code still stores plain string metadata, so
  every pre-existing route and its boundary specs are unchanged.

Two rules carry the weight and are covered by tests:

- **Balance drift refuses the whole approval.** The schema only checks the
  adjustment against the stored difference, never against the live balance, so
  if stock moved between counting and approval the counted quantity is no
  longer physical truth. The service rejects with
  `INVENTORY_COUNT_BALANCE_CHANGED` instead of silently landing on a different
  number. There is no partial approval.
- **A missing count is never a zero.** Products holding a balance inside the
  declared scope with no captured line are reported as `pendingItems` and never
  adjusted, per AT-AUD-02.

Line immutability is an application invariant, not a schema one: 9A has no
`BEFORE UPDATE` trigger on `inventory_count_lines`, so the service issues no
UPDATE against a line other than the one-time adjustment link, and the suite
covers it.

`InventoryAdjustmentService.adjustInTransaction` became public for this;
nothing about its locking, validation, audit event or signature changed.
| 9B.2 | Reports complete on `migration/09-reports` (unmerged): inventory, movements, sales, and finances, each server-paginated, filterable, and exportable to CSV. Two rules are enforced in the controller rather than left to the reader. Reporting is a capability, not an access grant: every route additionally requires the domain's own read permission, so `reports.read` alone discloses nothing. And monetary columns additionally require `finances.read`, keeping the FASE 9 separation of financial reading intact; when absent the columns are emitted as null rather than dropped, so a CSV keeps one stable shape regardless of who exports it. No report selects `unitCostSnapshot`, an idempotency or request hash, a delivery place, or legacy free text, and a test asserts their absence across all four reports. Stock value is computed on exact scaled integers, never floating point. CSV quotes any value containing a delimiter, quote, or newline and prefixes anything a spreadsheet would evaluate as a formula, since product names and entry descriptions are operator-supplied. Exports carry exactly the requested page, so a report can never become an unbounded ledger scan. No migration and no RBAC change: the existing indexes on `business_date`, `(type, occurred_at)`, `(product_id, warehouse_id, occurred_at)` and their peers already back every filter. Verified directly against PostgreSQL 18.4 on 2026-08-30: lint 8/8, typecheck 7/7, unit 60 files/224 tests, integration 12/12 for the new spec, build 7/7, format and `db:validate` clean. `PHASE_9B_2_COMPLETE`. |
| 9B.3 | Analytics complete on `migration/09-reports` (unmerged): inventory KPIs (distinct products, stock-outs, cost/price review alerts, total value) and sales analytics (volume by day/week/month, top products, per-seller totals, gross profit and margin). Same two rules as 9B.2: analytics never widens access, so each route also requires its domain's read permission, and every monetary figure additionally requires `finances.read`. Margin follows DEC-015 rather than averaging silently. A cost that is absent, or zero — which the data uses as a review flag — excludes its line from **both** sides of the subtraction, because counting it as free stock would inflate profit, and dividing full revenue by partial cost would report a margin no line earned. Every response carries a `marginCoverage` (covered/excluded/total lines and ratio), and a period with no trustworthy cost reports a null margin rather than zero, since unknown is not the same as none. Inventory valuation applies the identical rule and reports its own coverage. All ratios and money use exact integer arithmetic. Sales aggregation is capped at 366 days and restricted to `COMPLETED` sales, backed by the existing `(status, business_date)` index. Analytics keeps the shared quantity helper's trimmed decimals, unlike reports which pin the scale, because a dashboard reads better with `15` than `15.0000`. No migration and no RBAC change. Verified directly against PostgreSQL 18.4 on 2026-08-30: lint 8/8, typecheck 7/7, unit 61 files/236 tests, integration 11/11 for the new spec, build 7/7, format and `db:validate` clean. `PHASE_9B_3_COMPLETE`. |
| 9C | FASE 9 interface complete on `migration/09-reports` (unmerged), closing FASE 9 end to end. Three surfaces: the physical count flow (session list and creation declaring its warehouse scope, count capture, submit, approve, cancel), the four reports with date filters and CSV export, and a sales analytics view. The operational home replaced the session-diagnostics screen: stock health, stock-outs and cost-review alerts now lead, with session facts and permissions kept below for support. Coverage always travels with the figure it qualifies — a margin computed over half the lines renders its covered/total count beside it — and money never renders when the API returns null, so an actor without `finances.read` sees no monetary column anywhere. `globals.css` became a token system (colour, radius, shadow, motion, type) with OS-driven dark mode and transitions honouring `prefers-reduced-motion`; because it is written against the class names the pages already used, every earlier screen was restyled without a rename, and the Playwright suite still selects on the same hooks. Building it exposed two real regressions of its own: dashboard shortcuts duplicated the always-visible header navigation, giving two links one accessible name, and an earlier draft dropped the permissions list the FASE 3B suite asserts on. Both were fixed rather than worked around in the tests. Verified directly on 2026-08-31: lint 8/8, typecheck 7/7, unit 61 files/236 tests, build 7/7, and 32/32 Chromium E2E. Nothing deployed; staging untouched. `PHASE_9C_COMPLETE`, `PHASE_9_COMPLETE`. |

## Current milestone

- `PHASE_6_COMPLETE`
- `PHASE_7A_SCHEMA_COMPLETE`
- `PHASE_7B_COMPLETE`
- `PHASE_7C_COMPLETE`
- `PHASE_8A_SCHEMA_COMPLETE`
- `PHASE_8B_COMPLETE`
- `PHASE_8C_COMPLETE`
- `PHASE_8_COMPLETE`
- `PHASE_9A_SCHEMA_COMPLETE` (on `migration/09-reports`, not yet merged into
  `main`)
- `PHASE_9B_1_COMPLETE` (on `migration/09-reports`, not yet merged into `main`)
- `FIRST_STAGING_IMPORT_COMMITTED`
- `FIRST_STAGING_INVENTORY_ADJUSTMENT_PASS`
- `FIRST_STAGING_TRANSFER_PASS`
- `PHASE_6_CONCURRENCY_FIX_PASS`
- `STAGING_PHASE_7A_8A_SCHEMA_APPLIED`
- `STAGING_PHASE_9_SCHEMA_RBAC_APPLIED`
- `FIRST_STAGING_INVENTORY_COUNT_NOT_AUTHORIZED`
- `FIRST_STAGING_SALE_NOT_AUTHORIZED`
- `FIRST_STAGING_FINANCIAL_ENTRY_NOT_AUTHORIZED`
- `FIRST_STAGING_CLOSING_NOT_AUTHORIZED`
- `WAVES_3_PLUS_NOT_STARTED`

The first staging transfer gate is closed and passed. That authorization covered
exactly one transfer; it is not general authorization to use transfers in
staging. Further staging writes remain gate-controlled and require explicit
authorization. FASE 7A and 8A are complete in the versioned repository, and
on 2026-08-30 the owner authorized applying their migrations and
bootstrap/RBAC change to staging; see
["FASE 7A/8A schema deployed to staging"](#fase-7a8a-schema-deployed-to-staging--2026-08-30)
below. That deployment covers schema and RBAC only — no staging sale,
financial entry, or closing is authorized. FASE 7B and FASE 7C are closed in
the versioned repository and verified locally; neither is deployed and
neither touched staging. FASE 8 (schema, application/API, and UI — blocks 8A
through 8C) is closed end to end in the versioned repository, verified
directly against local PostgreSQL; only its 8A schema and RBAC are deployed
to staging, and 8B/8C remain undeployed. No closed phase, and no schema
deployment, authorizes an operational write. The next gate is described in
[NEXT_PHASE.md](NEXT_PHASE.md); that document authorizes neither
implementation nor an operational write.

## Current capabilities

Read capabilities implemented:

- products and product detail;
- units and warehouses;
- inventory balances and warehouse/product views;
- product/warehouse valuations;
- inventory movement history and movement detail, with filters and pagination.

Write capabilities implemented:

- audited atomic inventory adjustment;
- atomic inventory transfer API and UI with persistent idempotency.

Structural sales capabilities implemented:

- persistent sales origin, operational numbering, actor-scoped idempotency,
  lifecycle, immutability, monetary checks, and sale-item/ledger coherence;
- `sales.read` in the bootstrap/RBAC manifest, granted only through `SALES`.

Sales application capabilities implemented by FASE 7B, versioned only:

- `GET /api/v1/sales` and `GET /api/v1/sales/:id` guarded by `sales.read`,
  which never select or emit `unitCostSnapshot`, hashes, delivery place, or
  legacy free text;
- `POST /api/v1/sales` guarded by `sales.create`: one transaction, deterministic
  locking in `(product_id, warehouse_id)` order, ADR-009 price/cost resolution
  from the locked balance, server-side money, one coherent `SALE` movement per
  line, actor-scoped idempotency, and one sanitized audit event;
- `POST /api/v1/sales/:id/confirm-in-transit` guarded by
  `sales.confirm_in_transit`, which changes only fulfillment and never touches
  inventory or payment;
- `POST /api/v1/sales/:id/cancel` guarded by `sales.cancel`, total only,
  restoring each original balance exactly once.

This code was validated on 2026-08-28 against temporary PostgreSQL databases,
including lifecycle, shared-stock concurrency with adjustments/transfers and
the existing E2E regression. A closed phase is not authorization to create,
confirm, cancel, import, or expose a real sale. See
[phase-7b-completion-report.md](../reviews/phase-7b-completion-report.md).

Sales UI capabilities completed by FASE 7C:

- paginated list and detail views guarded by `sales.read`, without cost or
  margin exposure;
- multi-line and multi-warehouse sale creation with canonical server totals,
  idempotency, validation feedback, and double-submit prevention;
- in-transit confirmation and total cancellation with explicit confirmation,
  permission-aware controls, and lifecycle feedback;
- critical Chromium coverage for stock deduction/restoration, lifecycle,
  missing cost, insufficient stock, direct `DENY`, and hidden create controls.

This UI is versioned and locally verified only. It was not deployed to staging
and no real sale was created, confirmed, or cancelled.

Finance and closing capabilities implemented through FASE 8B.4, versioned
only:

- merged, paginated finance reads derive completed-sale income at query time;
  persisted `FinancialEntry` rows remain manual and immutable;
- manual income/expense creation validates the active category and responsible
  user, persists actor-scoped SHA-256 idempotency hashes, and appends one
  sanitized audit event in the same transaction;
- daily closing creation freezes completed sales for the civil business date,
  reports in-transit sales separately, applies the recorded tolerance, and
  never changes sales or inventory;
- reopening follows accepted DEC-025: configurable 30-day default window,
  reason/actor/time history, later closings do not block an earlier reopening,
  and a reopened closing is never reclosed. The reopening document is inserted
  before the only allowed `CLOSED → REOPENED` update.

These paths were verified against PostgreSQL and its unmodified FASE 8A
constraints/triggers, closed by the 8B.5 verification on 2026-08-29. See
[phase-8b-completion-report.md](../reviews/phase-8b-completion-report.md).

Finance and closing UI capabilities completed by FASE 8C:

- a merged finance list and period totals guarded by `finances.read`, with
  category/type/date filters; a `SALE` line never renders as editable or
  deletable, and cost is never shown, matching what the API exposes;
- manual entry creation guarded by `finances.manual.create`, with
  idempotency and double-submit prevention;
- closing list and detail guarded by `closings.read`, showing frozen figures
  and the full reopening history;
- closing creation guarded by `closings.create`; reopening guarded by
  `closings.reopen`, visible only while the closing is still `CLOSED`, with a
  mandatory reason.

Verified on 2026-08-29 with 32/32 Chromium E2E (24 regression plus 8 new).
See [phase-8c-completion-report.md](../reviews/phase-8c-completion-report.md).
This closes FASE 8 end to end. No sales UI, finance UI, or closing was
deployed to staging, and no real entry, sale, or closing was created there.

The transfer write path is implemented, tested, and validated end to end in
staging by exactly one authorized transfer on 2026-08-23. Each further real
staging transfer still requires its own explicit human authorization.

## Current inventory schema

- `Product` belongs optionally to a `Unit`.
- `Warehouse` is an explicit catalog.
- `InventoryBalance` is unique by product and warehouse and cannot become
  negative through approved commands.
- `ProductWarehouseValuation` preserves warehouse-specific price/cost evidence.
- `InventoryMovement` is the append-only stock ledger.
- `InventoryTransfer` is the immutable transfer document and idempotency scope.
- `InventoryTransferItem` links a product and positive quantity to a transfer.

The broader schema also contains authentication, audit, sales, legacy source,
import batch, raw legacy record, and reconciliation models. FASE 7A hardens the
sales schema, FASE 7B provides the application/API, and FASE 7C provides the
UI. None of those repository capabilities means staging
deployment or legacy sales import occurred.

## Current inventory-count schema (FASE 9A, `migration/09-reports` only)

- `InventoryCountSession` is the audit session document: lifecycle
  `OPEN → PENDING_APPROVAL → APPROVED`, or `CANCELLED` from either
  non-terminal state, with separate creator, approver, and canceller actors
  and an actor-scoped idempotency hash.
- `InventoryCountSessionWarehouse` declares which warehouses a session
  covers, so a line that is simply missing is distinguishable from a
  warehouse the session never intended to count.
- `InventoryCountLine` carries expected quantity, counted quantity, and the
  difference, and links immutably to the generated adjustment through a
  unique `adjustment_movement_id`. It never writes stock itself: a deferred
  constraint trigger requires the linked movement to be an `ADJUSTMENT`
  matching the line's product, warehouse, and magnitude, so the FASE 5C
  atomic adjustment path stays the only stock-writing route.
- Named `InventoryCountSession`/`InventoryCountLine` rather than reusing
  "audit" to avoid colliding with the pre-existing `InventoryAuditService`,
  which writes `AuditLog` rows and is unrelated to physical counting.
- RBAC: `inventory.audit.create`, `inventory.audit.approve`, `reports.read`,
  and `analytics.read` exist as direct grants to the sole admin only. No
  role grants any of the four yet; which role(s) should is still an open
  business decision (see `docs/reviews/phase-9-audits-reports-plan.md` §2).
- No API and no UI exist yet for this schema, and nothing was applied to
  staging or any persistent database. This schema lives only on
  `migration/09-reports`, which has not merged into `main`.

## Last verified staging snapshot

This is non-secret operational evidence verified read-only on 2026-08-23,
immediately after the FASE 6 transfer gate. It is not a substitute for a fresh
read-only preflight:

| Entity or fact | Count/state |
|---|---:|
| `Product` | 144 |
| `InventoryBalance` | 357 |
| `ProductWarehouseValuation` | 357 |
| `InventoryMovement` | 3 |
| `InventoryTransfer` | 1 |
| `InventoryTransferItem` | 1 |
| `TRANSFER_OUT` | 1 |
| `TRANSFER_IN` | 1 |
| `ReconciliationIssue` | 189 |
| `ImportBatch` | one, `COMMITTED` |

The only real post-import inventory mutations are the controlled `ADJUSTMENT`
validated in FASE 5C and the single controlled transfer validated by the FASE 6
gate. Consolidated product stock was invariant across the transfer, no balance
row was created, and no valuation was created, copied, or modified.

These counts (products, balances, valuations, movements, transfers, transfer
items, reconciliation issues, import batches) remained unchanged through the
2026-08-30 FASE 7/8 schema deployment below; they are the invariant this gate
was checked against, not merely historical evidence.

## FASE 7A/8A schema deployed to staging — 2026-08-30

The owner authorized deploying the FASE 7A and 8A migrations and the
`sales.read` bootstrap/RBAC change to staging. This deploys schema and
permissions only. It does not create any sale, financial entry, or daily
closing, and `FIRST_STAGING_SALE_NOT_AUTHORIZED` remains in force.

Target was positively verified before any write: container
`sgi-comarca-postgres-1` (`postgres:18.4-alpine`, healthy), database
`sgi_comarca_staging` on `localhost:5433`, latest migration
`20260820170000_phase_6a_transfer_foundation`, and the exact RBAC baseline
(6 roles, 15 permissions, 14 active role_permissions, 4 users with the
manifest's exact display names/roles, 1 direct grant, 3 warehouses) matching
`packages/database/src/bootstrap/manifest.ts` in every field except the
still-missing `sales.read` permission and its `SALES` grant.

Checkpoints (custom-format `pg_dump`, verified restorable with
`pg_restore --list`, not committed — `backups/` stays out of Git):

| Checkpoint | File | Size | SHA-256 |
|---|---|---:|---|
| Pre-deploy | `backups/phase-7-8-staging-deploy/staging/sgi_comarca_staging_pre_phase7_8_deploy_20260830T004324Z.dump` | 530,289 bytes | `cd8152b60828d6171f1f8de41df143394d82407b54895832180daa1bc00fbcf0` |
| Post-deploy | `backups/phase-7-8-staging-deploy/staging/sgi_comarca_staging_post_phase7_8_deploy_20260830T004535Z.dump` | 581,483 bytes | `1c1d17890a80621a3c96f9cf853c07c00ce4c1e2a4d078b95e6b80affab0fc39` |

`prisma migrate deploy` applied `20260826232758_phase_7a_sales_foundation`
and `20260829144239_phase_8a_finances_closings_foundation` in order; both are
now recorded in `_prisma_migrations`. `runBootstrap` then ran against the
same target and, exactly as predicted from the pre-deploy diff, created only
one `Permission` (`sales.read`), one `RolePermission`
(`SALES → sales.read`), and one `SYSTEM_BOOTSTRAP_APPLIED` audit log row —
zero roles, users, warehouses, user roles, or user permissions were touched.

Read-only verification after both steps: all pre-existing counts identical
to the pre-deploy snapshot (products 144, balances 357, valuations 357,
movements 3, transfers 1, transfer items 1, reconciliation issues 189, import
batches 1, users 4, roles 6, warehouses 3); `sales`, `sale_items`,
`sale_cancellations`, `in_transit_confirmations`, `financial_categories`,
`financial_entries`, `daily_closings`, and `daily_closing_reopenings` all at
0 rows; the FASE 7A/8A triggers (`sales_write_guard`,
`sale_items_operational_guard`, `financial_entries_write_guard`,
`daily_closings_write_guard`, and the rest) present and active; permissions
now 16, active role_permissions now 15, with `SALES → sales.read` confirmed
present.

`STAGING_PHASE_7A_MIGRATION_NOT_AUTHORIZED` and its FASE 8A equivalent are
retired: the schema and RBAC are deployed. `FIRST_STAGING_SALE_NOT_AUTHORIZED`
remains: no application server was pointed at staging during this gate, and
no sale, entry, or closing was created, confirmed, cancelled, or reopened
there. Each of those remains its own future gate.

## FASE 9 schema and RBAC deployed to staging — 2026-09-01

The owner authorized deploying the FASE 9A migration and the FASE 9 RBAC
grants to staging. This deploys schema and permissions only. No physical
count, sale, financial entry, or closing was created, and
`FIRST_STAGING_INVENTORY_COUNT_NOT_AUTHORIZED` is now in force.

Target was positively verified before any write: container
`sgi-comarca-postgres-1` (`postgres:18.4-alpine`), database
`sgi_comarca_staging` on `localhost:5433`, latest migration
`20260829144239_phase_8a_finances_closings_foundation`, no
`inventory_count%` table present, and the exact RBAC baseline (6 roles, 16
permissions, 15 active role_permissions, 1 direct grant, 4 users, 11 active
user roles). Every invariant count matched the record from the FASE 7A/8A
deployment.

Checkpoints (custom-format `pg_dump`, verified restorable with
`pg_restore --list`, not committed — `backups/` stays out of Git):

| Checkpoint | File | Size | SHA-256 |
|---|---|---:|---|
| Pre-deploy | `backups/phase-9-staging-deploy/staging/sgi_comarca_staging_pre_phase9_deploy_20260901T044417Z.dump` | 581,483 bytes | `608be904884bce5967a095fc04ac9853076d1a804255a0808cda59565807fb51` |
| Post-deploy | `backups/phase-9-staging-deploy/staging/sgi_comarca_staging_post_phase9_deploy_20260901T051726Z.dump` | 606,884 bytes | `8dabba8ca2f7144fa9c99e2bc1b84689e9775cc15bc29e1153f6455fc5a339c6` |

**The first bootstrap attempt failed, and the failure was correct.**
`runBootstrap` takes a stricter path once a database holds credentials or
sessions, and that path required the live direct grants to match the manifest
exactly. FASE 9 had added `inventory.audit.approve` as the first new direct
grant since this database was seeded, so the run aborted — before it could
create the permission that grant refers to, which meant no ordering of steps
could satisfy it. The transaction rolled back cleanly: RBAC stayed at
16/15/1 and every invariant count was unchanged. The migration, applied in a
separate step beforehand, remained applied. Commit `1bddb33` fixed the
baseline check to reject unexpected grants while tolerating ones the manifest
newly declares, which the main body then creates additively under its own
guards. Two tests cover both directions.

`prisma migrate deploy` then applied
`20260830181934_phase_9a_inventory_count_foundation`; seven migrations are
now recorded. `runBootstrap` created exactly what the pre-deploy diff
predicted: 4 permissions (`inventory.audit.create`,
`inventory.audit.approve`, `reports.read`, `analytics.read`), 5
role_permissions (`INVENTORY_MANAGER` → audit.create, reports.read,
analytics.read; `SALES` → reports.read, analytics.read), 1 user_permission
(`dylan` → `inventory.audit.approve`), and one `SYSTEM_BOOTSTRAP_APPLIED`
audit row recording 10 mutations. Zero roles, users, warehouses, or user
roles were touched.

Read-only verification after both steps: all pre-existing counts identical
to the pre-deploy snapshot (products 144, balances 357, valuations 357,
movements 3, transfers 1, transfer items 1, reconciliation issues 189,
import batches 1, users 4, roles 6, warehouses 3, active user roles 11);
`inventory_count_sessions`, `inventory_count_session_warehouses`, and
`inventory_count_lines` present with 7 active triggers and 0 rows; `sales`,
`financial_entries`, and `daily_closings` still at 0; permissions now 20,
active role_permissions 20, direct grants 2.

No application server was pointed at staging during this gate. The first
real physical count there remains its own future gate.

## First staging transfer evidence

The FASE 6 gate executed exactly one operational transfer of quantity 1 between
two approved warehouses from the UI and verified it read-only against
PostgreSQL:

- one `InventoryTransfer` and one `InventoryTransferItem` were created;
- one `TRANSFER_OUT` with delta -1 and one `TRANSFER_IN` with delta +1 were
  linked to the same transfer item;
- exactly two balances changed: origin decreased by 1 and destination increased
  by 1; consolidated product stock remained unchanged and no balance was
  negative;
- the ledger contained three rows after the gate: the existing FASE 5C
  `ADJUSTMENT`, one `TRANSFER_OUT`, and one `TRANSFER_IN`;
- exactly one `inventory.transferred` audit event contained sanitized metadata;
- no valuation was created, copied, or modified;
- the original idempotency key was not persisted, no second transfer was
  executed, and legacy data was unchanged.

Idempotency was reverified read-only through the persisted hashes and the
active unique, check, and immutability constraints. No replay request was
issued against staging; replay behavior remains covered by the
integration/concurrency suites.

## Current RBAC

- On `main`, the manifest contains 16 permissions and 15 role grants.
- On `migration/09-reports` (unmerged), it contains 20 permissions, 20 role
  grants, and 2 direct grants. On 2026-08-31 the owner approved the FASE 9
  grants, moving counting, reports and analytics onto roles and leaving only
  `sales.cancel` and `inventory.audit.approve` as direct.
- `inventory.read → INVENTORY_MANAGER`.
- `inventory.adjust → INVENTORY_MANAGER`.
- `transfers.create → INVENTORY_MANAGER`.
- `sales.read → SALES`, exclusively; `ADMIN`, `FINANCE`,
  `INVENTORY_MANAGER`, `PARTNER`, and `READ_ONLY` do not receive it.
- `sales.cancel` remains one direct grant only to Dylan; no role grants it.
- `inventory.audit.create → INVENTORY_MANAGER`, so anyone managing inventory
  may capture a physical count.
- `reports.read` and `analytics.read → INVENTORY_MANAGER` and `SALES`. This is
  safe by construction rather than by trust: every report and KPI additionally
  requires its domain's own read permission, and every monetary column
  requires `finances.read`, which neither role carries.
- `inventory.audit.approve` remains one direct grant to Dylan; no role grants
  it. Approving a count writes stock through the FASE 5C adjustment path, so
  whoever counted a warehouse cannot approve their own count into the ledger.
- `FINANCE` receives exactly `finances.read`, `finances.manual.create`,
  `closings.read`, `closings.create`, and `closings.reopen` through its role.
- `ADMIN` is not a superuser and has no permission bypass.
- An active direct `DENY` overrides direct and role grants.
- Authentication and active-user state remain prerequisites for every private
  capability.

The full matrix is in
[authorization-matrix.md](../architecture/authorization-matrix.md).

## Current migrations

On `main`, in order:

1. `20260804044231_phase_3a_initial_structure`;
2. `20260804164613_phase_3b_authentication_models`;
3. `20260806042328_phase_3b_user_permission_effect`;
4. `20260820170000_phase_6a_transfer_foundation`;
5. `20260826232758_phase_7a_sales_foundation`;
6. `20260829144239_phase_8a_finances_closings_foundation`.

On `migration/09-reports` (unmerged), additionally:

7. `20260830181934_phase_9a_inventory_count_foundation`.

## Current transfer architecture

- A successful transfer creates one `InventoryTransfer`, one item for the
  current single-product API, and exactly one `TRANSFER_OUT` plus one
  `TRANSFER_IN` linked to the same `transferItemId`.
- PostgreSQL deferred constraints require a complete, coherent OUT/IN pair and
  immutable transfer history.
- One transaction updates both balances, creates the document/item and ledger,
  and appends exactly one `inventory.transferred` audit event.
- Locks are acquired deterministically; the destination balance may be created
  at zero atomically when absent.
- `Idempotency-Key` is mandatory. The original key is never persisted; its
  SHA-256 and a canonical request hash are stored under actor scope.
- Same actor/key/payload replays the committed result without a second stock
  change or audit event. Reusing the key with another payload returns HTTP 409.
- Consolidated product stock is invariant across a transfer.
- A transfer never creates, copies, or modifies a valuation.

See [transaction-design.md](../architecture/transaction-design.md) and
[phase-6a-transfer-foundation.md](../database/phase-6a-transfer-foundation.md).

## Current sales architecture

- `SaleOrigin` has exactly `OPERATIONAL` and `LEGACY_IMPORT`. `origin` is
  required and has no Prisma or PostgreSQL default, so every writer must state
  intent explicitly.
- Operational `saleNumber` values come from
  `operational_sale_number_seq`, a `BIGINT` sequence from 1 through 999999999
  with `NO CYCLE`, formatted as `VTA-000000001`. The client must never provide
  an operational number, and no writer may derive it with `MAX + 1`. Sequence
  gaps are accepted.
- `createdByUserId` is physically nullable for future legacy preservation but
  required by CHECK for `OPERATIONAL`; its user FK uses `ON DELETE RESTRICT ON
  UPDATE RESTRICT`.
- Creation, cancellation, and in-transit confirmation persist only a lowercase
  SHA-256 idempotency-key hash and a canonical request hash, each scoped by its
  actor. The original idempotency key is never persisted.
- Constraints, partial unique indexes, functions, immediate guards, and
  deferred constraint triggers protect immutable business fields, lifecycle,
  terminal documents, and ledger coherence. A deferred trigger rejects an
  operational sale without at least one `SaleItem` at commit.
- Every operational line requires exactly one coherent `SALE` movement. A sale
  without cancellation requires zero `SALE_CANCELLATION` movements; a cancelled
  operational sale requires exactly one coherent `SALE_CANCELLATION` per line.
- Header money and present item snapshots cannot be negative. Operational item
  snapshots are mandatory; legacy snapshots may remain null but cannot be
  negative when present.

See [phase-7a-sales-foundation.md](../database/phase-7a-sales-foundation.md),
[transaction-design.md](../architecture/transaction-design.md), and
[APPROVED_DECISIONS.md](APPROVED_DECISIONS.md).

## Backups and external state

Operational checkpoints exist conceptually for pre/post first import, pre/post
first adjustment, pre/post FASE 6A schema deployment, and pre/post the first
staging transfer. The FASE 6 gate produced a new pre-transfer and post-transfer
custom-format checkpoint with PostgreSQL 18.4, each recorded with its size and
SHA-256 and each verified with `pg_restore --list`; earlier checkpoints were
preserved and nothing was restored. Backups are private, not stored in Git, and
will not be present on a new clone. Their existence, integrity, tooling
version, and restore evidence must be revalidated before a gate that relies on
them.

The real staging database, environment secrets, private XLSX source, profiler
evidence, importer reports, and operational backups are deliberately absent
from Git.

## Legacy state

- All 1,069 legacy `Movimientos` rows remain unimported.
- The 25 legacy rows historically classified as transfers remain unimported.
- Legacy sales remain deferred; no new mapping may be inferred from transfer
  implementation.
- Waves 3+ have not started.

## Resolved issue after the first transfer gate

Concurrent HTTP requests sharing one session could renew `last_seen_at` out of
order, violate PostgreSQL check constraint `23514`, and intermittently return
HTTP 500. Commit `07c00472e28a55b9706cff4514c96000a1799a85`
(`fix(auth): renew a shared session monotonically`) resolved the race by using
`GREATEST` for monotonic renewal while `LEAST` continues to bound the idle
expiry by the absolute expiry. Revocation, RBAC, and absolute-expiry behavior
were not relaxed.

Fresh regression evidence: 20/20 focused repetitions, 400 concurrent HTTP
responses, zero HTTP 500 responses, and 149/149 integration/concurrency tests.
`PHASE_6_CONCURRENCY_FIX_PASS`.

## Last green baseline

Revalidated on 2026-08-30 on `migration/09-reports` (unmerged into `main`) at
the FASE 9B.1 closure, run directly against the same local PostgreSQL: lint
8/8 tasks, typecheck 7/7 tasks, unit 59 files / 207 tests, build 7/7 tasks,
`format:check` and `db:validate` clean. The new
`inventory-count-lifecycle.integration.spec.ts` passes 18/18 on its own,
covering the balance-drift refusal, approval idempotency, concurrent double
approval, line immutability, `pendingItems`, and RBAC denial for both audit
capabilities. Extending `RequirePermission` to accept several codes was made
additive precisely so the four existing HTTP-boundary specs that assert on its
metadata keep passing unchanged; they do. No Playwright E2E was needed: 9B.1
adds no UI. Staging was not touched.

The full integration run was **279/280 across 27 files, not a clean sweep**:
`sales-concurrency.integration.spec.ts > serializes a sale with cancellation
of another sale on the same pairs` failed once with `SALE_CONCURRENCY_CONFLICT`
under parallel suite load, then passed 9/9 when its file was run in isolation.
This is the same pre-existing flake recorded at the 8B.5 closure below, and it
is a transaction-serialization conflict inside `CreateSaleService`, unrelated
to authorization or to the count module. It is nonetheless **more likely now
than before**: 9B.1 adds a 27th spec file, raising parallel contention on the
shared PostgreSQL container. Treat a green run as requiring either isolation of
that file or a rerun, and consider constraining integration concurrency a
candidate for the technical-debt list rather than assuming it will stay rare.

Earlier the same day, after committing the FASE 9A schema/RBAC fixes
(`b55aef9`), run directly
against the local Docker Compose PostgreSQL (`sgi-comarca-postgres-1`,
`postgres:18.4-alpine`): lint 8/8 tasks, typecheck 7/7 tasks, unit 58 files /
204 tests, integration 26 files / 262 tests (up from 25/244 at the 8B.5
baseline below, by one new spec file covering the FASE 9A count schema plus
the updated bootstrap/schema/authentication specs), build 7/7 tasks,
`format:check` clean, and `db:validate` clean. No Playwright E2E run was
needed: FASE 9A is schema and RBAC only, with no API or UI surface to
exercise yet. Staging was not touched.

Revalidated on 2026-08-29 at the 8C closure, run directly: 58 files / 203
unit tests, and 32/32 Chromium E2E tests (24 regression plus 8 new
finances/closings flows) passed. Lint 8/8, typecheck 7/7, build 7/7, and
`format:check` passed. Building 8C exposed and fixed two real bugs: an
02-inventory.e2e.ts product-count assertion that only held because file
discovery happened to run it before any suite left a permanent sale-linked
product behind (fixed by numbering every spec file 01-04 and documenting the
requirement in playwright.config.ts, instead of relying on alphabetical
order), and a shared 403 message that named `inventory.read` even for sales
and finances denials. See
[phase-8c-completion-report.md](../reviews/phase-8c-completion-report.md).

Earlier the same day, at the 8B.5 closure, run directly (not by a
sub-agent report): 55 files / 194 unit tests, 25 files / 244 PostgreSQL
integration tests, and 24/24 Chromium E2E tests passed. Lint passed 8/8 tasks,
typecheck and build each passed 7/7 tasks, `format:check` and `db:validate`
passed. An in-memory OpenAPI check (SwaggerModule.createDocument, never
`.setup`, no route mounted) found 36 total paths including the 6 finance/
closing ones, all private. A manual security pass over the finance module
found no critical or high issue: exact RBAC per route, raw SQL with constant
text and user values only as positional parameters, sanitized audit metadata,
strict DTO whitelisting. See
[phase-8b-completion-report.md](../reviews/phase-8b-completion-report.md).

Earlier the same day, after verifying FASE 8B.3 and 8B.4: 55 files / 194
unit tests, 25 files / 243 PostgreSQL integration and concurrency tests, and
24/24 Chromium E2E tests passed. Lint passed 8/8 tasks, typecheck and build each
passed 7/7 tasks, and the repository passed `format:check`. The focused mutation
evidence was 12/12 for manual financial entries and 9/9 for the daily-closing
lifecycle.

The first full integration attempt exposed two differences and was not counted
as green: the new 8B.3 immutability assertion expected raw SQLSTATE `55000`
instead of Prisma's `P2010` wrapper, and one historical sales-concurrency case
returned its typed conflict under parallel suite load. The assertion now checks
both `P2010` and nested `originalCode = 55000`; the unchanged sales spec then
passed 9/9 in isolation, and the complete rerun passed 243/243. No sales service
or database integrity rule changed.

Previously revalidated on 2026-08-28 at FASE 7C closure: 53 files / 175
unit tests, 21 files / 195 PostgreSQL integration and concurrency tests, and
24/24 Chromium E2E tests passed. Format, lint (8/8 tasks), typecheck (7/7 tasks)
and build (7/7 tasks) also passed. The E2E total comprises the existing 17
regressions plus 7 sales UI flows.

Integration and E2E used only temporary local databases created and dropped by
their runners against the positively verified container
`sgi-comarca-postgres-1` (`postgres:18.4-alpine`) on `localhost:5433`. The
development target was positively identified as `sgi_comarca_dev` / `sgi_dev`.
The E2E run ended with zero sessions to terminate and `DROP DATABASE`; a final
catalog query found no `sgi_e2e_*`, `sgi_phase8b3_*`, or `sgi_phase8b4_*`
database. Staging was never a test target. Its safeguard revalidation was
read-only. FASE 7A and 8A were later migrated there on 2026-08-30 (see
["FASE 7A/8A schema deployed to staging"](#fase-7a8a-schema-deployed-to-staging--2026-08-30)),
and no real staging sale, financial entry, or closing is authorized.

The prior evidence gap after `d982477` is closed by this run. The E2E runner
needed two retries before executing tests because cold local API startup twice
exceeded its 60-second health timeout; both aborted runs dropped their temporary
databases. A warm diagnostic start confirmed the API health endpoint, and the
subsequent complete run passed. This is an environmental startup-time risk, not
a test failure or authorization to change the runner silently.

## Historical-document caveats

Some versioned documents intentionally preserve earlier snapshots:

- the FASE 3B completion report has the RBAC counts and grants as they existed
  before `inventory.read` and the FASE 6A transfer grant;
- portions of the FASE 4 readiness documents and roadmap predate the approved
  first persistent staging import;
- portions of module-boundary/system-context documentation still describe the
  transfer application as future or GitHub as private;
- documents written before the FASE 6 closeout may still describe the first
  staging transfer as pending, unauthorized, or never executed, or FASE 6 as
  merely a completion candidate;
- the FASE 7 planning review and approval-time wording in
  `APPROVED_DECISIONS.md` may still describe the FASE 7A implementation or
  `sales.read` bootstrap change as future. They preserve their earlier decision
  context; the implementation status is now established by the versioned
  migration, Prisma schema, bootstrap manifest, tests, and this handoff.

Do not rewrite those historical decisions as if later state always existed. For
current RBAC, transfer and FASE 7A implementation, repository exposure, and
operational milestones, follow the authority order in `AGENTS.md` and verify
code/tests plus this handoff. These known documentation lags are not
authorization to modify functionality or external state.
