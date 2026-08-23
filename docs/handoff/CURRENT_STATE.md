# SGI La Comarca — Current State

Updated: 2026-08-23.

This document is the repository handoff snapshot. Code, migrations, and tests
remain authoritative. Revalidate external operational state before acting on it.

## Git state

The current repository HEAD is always determined dynamically. This document
never records an authoritative "current" HEAD of its own, because any commit
that updates the handoff would immediately invalidate such a field.

- Repository: `DylanRizo/sgi-comarca`.
- Branch: `main`.
- Expected working tree before starting work: clean.
- Functional baseline at FASE 6B completion:
  `070545dc206d67836d7668c9396b3a595377bffb`.
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
| 6 gate | The first controlled staging transfer was authorized, executed exactly once from the UI, and verified on 2026-08-23. FASE 6 is a completion candidate pending independent review. |

## Current milestone

- `PHASE_6B_COMPLETE`
- `FIRST_STAGING_IMPORT_COMMITTED`
- `FIRST_STAGING_INVENTORY_ADJUSTMENT_PASS`
- `FIRST_STAGING_TRANSFER_PASS`
- `PHASE_6_COMPLETE_CANDIDATE`
- `WAVES_3_PLUS_NOT_STARTED`

The first staging transfer gate is closed and passed. That authorization covered
exactly one transfer; it is not general authorization to use transfers in
staging, and FASE 7 is not authorized. The next planning target is described in
[NEXT_PHASE.md](NEXT_PHASE.md); it is not authorization to execute anything.

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
import batch, raw legacy record, and reconciliation models. Their presence does
not mean deferred business modules are implemented or imported.

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

## First staging transfer evidence

The FASE 6 gate executed exactly one transfer of quantity 1 from `CASA_DYLAN`
to `CASA_LUDEN`, performed from the UI by Dylan through `INVENTORY_MANAGER`,
and verified read-only against PostgreSQL:

- one `InventoryTransfer` `dfb517ff-ed78-43d6-acba-47485fba1adc` and one
  `InventoryTransferItem` `963fbb9f-9250-4c13-a789-578c674c8ca1`;
- one `TRANSFER_OUT` `8a83131c-5fb0-46db-bf24-f35202a9cdba` with delta -1 and
  one `TRANSFER_IN` `0318b076-5924-4136-85dc-5a1372f92a68` with delta +1, both
  linked to the same transfer item;
- exactly two balances changed, origin -1 and destination +1, both moving from
  `version` 1 to 2; consolidated product stock unchanged; zero negative
  balances;
- exactly one `inventory.transferred` audit event with sanitized metadata
  referencing the transfer, item, product, warehouses, quantity, and both
  movement ids;
- only the SHA-256 of the idempotency key and the canonical request hash are
  persisted; the original key exists nowhere in the database;
- the FASE 5C `ADJUSTMENT` row was untouched, and product, balance, valuation,
  reconciliation, import, sales, and legacy counts were unchanged.

Idempotency was reverified read-only through the persisted hashes and the
active unique, check, and immutability constraints. No replay request was
issued against staging; replay behavior remains covered by the
integration/concurrency suites.

## Current RBAC

- `inventory.read → INVENTORY_MANAGER`.
- `inventory.adjust → INVENTORY_MANAGER`.
- `transfers.create → INVENTORY_MANAGER`.
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
4. `20260820170000_phase_6a_transfer_foundation`.

No later migration is part of this handoff.

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

## Last green baseline

Revalidated on 2026-08-23 before the FASE 6 gate, on the current commit: 125
unit tests, 148 integration/concurrency tests, and 17 Chromium E2E tests
passed; format, lint, typecheck, Prisma validation, and build also passed, with
lint, typecheck, and build additionally re-executed with the Turborepo cache
bypassed. Integration and E2E used only temporary local databases created and
dropped per run; staging was never used as a test target. A new agent must
rerun the relevant baseline rather than assuming this result is still current.

## Historical-document caveats

Some versioned documents intentionally preserve earlier snapshots:

- the FASE 3B completion report has the RBAC counts and grants as they existed
  before `inventory.read` and the FASE 6A transfer grant;
- portions of the FASE 4 readiness documents and roadmap predate the approved
  first persistent staging import;
- portions of module-boundary/system-context documentation still describe the
  transfer application as future or GitHub as private;
- documents written before 2026-08-23 may still describe the first staging
  transfer as pending, unauthorized, or never executed.

Do not rewrite those historical decisions as if later state always existed. For
current RBAC, transfer implementation, repository exposure, and operational
milestones, follow the authority order in `AGENTS.md` and verify code/tests plus
this handoff. These known documentation lags are not authorization to modify
functionality or external state.
