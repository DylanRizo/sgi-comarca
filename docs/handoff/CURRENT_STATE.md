# SGI La Comarca — Current State

Updated: 2026-08-28.

This document is the repository handoff snapshot. Code, migrations, and tests
remain authoritative. Revalidate external operational state before acting on it.

## Git state

The current repository HEAD is always determined dynamically. This document
never records an authoritative "current" HEAD of its own, because any commit
that updates the handoff would immediately invalidate such a field.

- Repository: `DylanRizo/sgi-comarca`.
- Branch: `main`.
- Expected working tree before starting work: clean.
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
| 7C.1 | Sales read UI complete: list with server-side filters and pagination, and sale detail with lines and totals. Static checks, build and the unit suite passed locally on 2026-08-28. Versioned only; no staging deployment and no sale mutation surface. `PHASE_7C_1_COMPLETE`. |

## Current milestone

- `PHASE_6_COMPLETE`
- `PHASE_7A_SCHEMA_COMPLETE`
- `PHASE_7B_COMPLETE`
- `PHASE_7C_SELECTED`
- `PHASE_7C_1_COMPLETE`
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
staging sale is authorized. FASE 7B is closed in the versioned repository and
verified locally; it is not deployed, has no UI, and did not touch staging.
Closing FASE 7B authorizes no operational action. The next gate is described in
[NEXT_PHASE.md](NEXT_PHASE.md); that document authorizes neither implementation
nor an operational write.

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

Sales UI capabilities implemented by FASE 7C.1, versioned only:

- `/sales`, a list with server-resolved filters for fulfillment, payment,
  warehouse and a civil date range, server-side pagination, and the mobile
  presentation the shared table styles already provide;
- `/sales/[id]`, a detail view with each line's product, warehouse, quantity,
  unit price, subtotal and shipping allocation, plus header totals;
- a `Ventas` navigation entry rendered only with `sales.read`, which is
  navigation and not authorization: the API still authorizes every request;
- no cost or margin anywhere on either screen, and fulfillment and payment
  always rendered as two independent states;
- no mutation surface: creating, confirming, and cancelling a sale are FASE
  7C.2 and 7C.3.

The warehouse filter requests the warehouse catalog only when the session holds
`inventory.read`, which a `SALES` account does not; otherwise it is built from
the warehouses present in the loaded sales. A failed catalog read never hides
readable sales.

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
import batch, raw legacy record, and reconciliation models. The sales schema is
now hardened by FASE 7A, but its presence still does not mean the deferred sales
application, UI, or legacy import is implemented.

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

This staging snapshot remains exactly the read-only snapshot verified on
2026-08-23. FASE 7A did not mutate or revalidate staging. Before any future
staging migration gate, positively verify the target and revalidate read-only
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
5. `20260826232758_phase_7a_sales_foundation`.

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

Revalidated on 2026-08-28 after the FASE 7B verification fix: 51 files / 162
unit tests, 21 files / 195 PostgreSQL integration and concurrency tests, and
17/17 Chromium E2E tests passed. The dedicated sales concurrency suite passed
9/9. Format, lint (8/8 tasks), typecheck (7/7 tasks), Prisma validation and
build (7/7 tasks) also passed. OpenAPI was generated only in memory and included
the four sales path forms; Swagger remains unmounted.

Integration and E2E used only temporary local databases created and dropped by
their runners against the positively verified Docker Compose PostgreSQL 18.4
on port 5433. Staging was never a test target or revalidated. The operational
staging snapshot remains the historical read-only snapshot from 2026-08-23;
FASE 7A is still not migrated there and no real staging sale is authorized.

One commit postdates that run. `d982477` corrected a misleading unit-test
fixture and added contract/mapper comments about decimal scale; it changes no
runtime behavior, and the unit baseline it produced is 51 files / 163 tests
with lint, typecheck and build green. The integration and E2E suites were not
re-executed after it, because no Docker harness was available in that session.

## FASE 7C.1 verification and its limits

Verified on 2026-08-28 in the session that implemented FASE 7C.1: Prettier
`--check` over the repository, Prisma validation, and lint, typecheck and build
green for every workspace whose dependencies could be installed, plus 35 files
/ 136 unit tests passing.

That scope is narrower than the FASE 7B baseline, and the reason is
environmental rather than a regression. `packages/legacy-profiler` declares
`xlsx` from `https://cdn.sheetjs.com`, a host the session's network policy
refuses, so `pnpm install` could not complete for that package or for
`packages/legacy-importer`, which depends on it. Their lint, typecheck, build
and unit tests were therefore not executed. Nothing in FASE 7C.1 touches either
package.

Integration and E2E were likewise not executed: no Docker harness was available.
The pending debt to re-run `pnpm test:integration` recorded in
[NEXT_PHASE.md](NEXT_PHASE.md) is therefore still open, and now also covers
FASE 7C.1. FASE 7C.1 is frontend-only and adds no server behaviour, but a
Playwright flow for the sales read surface has not been written yet.

The next agent with a full network and Docker should close both gaps by running
the complete `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`
and `pnpm build` baselines.
Re-running `pnpm test:integration` at the next opportunity would close that
small evidence gap.

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
