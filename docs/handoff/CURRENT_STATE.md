# SGI La Comarca — Current State

Updated: 2026-08-29.

This document is the repository handoff snapshot. Code, migrations, and tests
remain authoritative. Revalidate external operational state before acting on it.

## Git state

The current repository HEAD is always determined dynamically. This document
never records an authoritative "current" HEAD of its own, because any commit
that updates the handoff would immediately invalidate such a field.

- Repository: `DylanRizo/sgi-comarca`.
- Branch: `main`.
- Expected working tree before starting work: clean.
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

## Current milestone

- `PHASE_6_COMPLETE`
- `PHASE_7A_SCHEMA_COMPLETE`
- `PHASE_7B_COMPLETE`
- `PHASE_7C_COMPLETE`
- `PHASE_8A_SCHEMA_COMPLETE`
- `PHASE_8B_COMPLETE`
- `PHASE_8C_COMPLETE`
- `PHASE_8_COMPLETE`
- `FIRST_STAGING_IMPORT_COMMITTED`
- `FIRST_STAGING_INVENTORY_ADJUSTMENT_PASS`
- `FIRST_STAGING_TRANSFER_PASS`
- `PHASE_6_CONCURRENCY_FIX_PASS`
- `STAGING_PHASE_7A_MIGRATION_NOT_AUTHORIZED`
- `FIRST_STAGING_SALE_NOT_AUTHORIZED`
- `WAVES_3_PLUS_NOT_STARTED`

The first staging transfer gate is closed and passed. That authorization covered
exactly one transfer; it is not general authorization to use transfers in
staging. Further staging writes remain gate-controlled and require explicit
authorization. FASE 7A is complete only in the versioned repository. Its
migration and bootstrap/RBAC change have not been applied to staging, and no
staging sale is authorized. FASE 7B and FASE 7C are closed in the versioned
repository and verified locally; neither is deployed and neither touched
staging. FASE 8 (schema, application/API, and UI — blocks 8A through 8C) is
closed end to end in the versioned repository, verified directly against
local PostgreSQL; none of it is deployed and none touched staging. No closed
phase authorizes an operational action. The next gate is
described in [NEXT_PHASE.md](NEXT_PHASE.md); that document authorizes neither
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

This staging snapshot remains the operational snapshot verified on 2026-08-23.
On 2026-08-29 a read-only safeguard check reconfirmed its latest migration as
`20260820170000_phase_6a_transfer_foundation` and the recorded counts for
products (144), balances (357), movements (3), transfers (1), and import batches
(1). No test targeted staging and no row was written. Before any future staging
migration gate, positively verify the target and revalidate read-only
that `sales`, `sale_items`, `sale_cancellations`, and
`in_transit_confirmations` are still empty. The recorded empty state is an
operational precondition to revalidate, not live truth.

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

- The manifest contains 16 permissions and 15 role grants.
- `inventory.read → INVENTORY_MANAGER`.
- `inventory.adjust → INVENTORY_MANAGER`.
- `transfers.create → INVENTORY_MANAGER`.
- `sales.read → SALES`, exclusively; `ADMIN`, `FINANCE`,
  `INVENTORY_MANAGER`, `PARTNER`, and `READ_ONLY` do not receive it.
- `sales.cancel` remains one direct grant only to Dylan; no role grants it.
- `FINANCE` receives exactly `finances.read`, `finances.manual.create`,
  `closings.read`, `closings.create`, and `closings.reopen` through its role.
- `ADMIN` is not a superuser and has no permission bypass.
- An active direct `DENY` overrides direct and role grants.
- Authentication and active-user state remain prerequisites for every private
  capability.

The full matrix is in
[authorization-matrix.md](../architecture/authorization-matrix.md).

## Current migrations

All versioned migrations, in order:

1. `20260804044231_phase_3a_initial_structure`;
2. `20260804164613_phase_3b_authentication_models`;
3. `20260806042328_phase_3b_user_permission_effect`;
4. `20260820170000_phase_6a_transfer_foundation`;
5. `20260826232758_phase_7a_sales_foundation`;
6. `20260829144239_phase_8a_finances_closings_foundation`.

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
read-only, FASE 7A is still not migrated there, and no real staging sale is
authorized.

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
