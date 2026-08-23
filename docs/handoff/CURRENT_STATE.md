# SGI La Comarca — Current State

Updated: 2026-08-23.

This document is the repository handoff snapshot. Code, migrations, and tests
remain authoritative. Revalidate external operational state before acting on it.

## Repository

- Repository: `DylanRizo/sgi-comarca`.
- Branch: `main`.
- HEAD at this handoff: `070545dc206d67836d7668c9396b3a595377bffb`.
- `origin/main` at this handoff: `070545dc206d67836d7668c9396b3a595377bffb`.
- Working tree at handoff start: clean.

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
| 6B | Movement history API/UI and transfer API/UI complete. FASE 6 remains `IN_PROGRESS` until its separate staging transfer gate is approved and passes. |

## Current milestone

- `PHASE_6B_COMPLETE`
- `FIRST_STAGING_IMPORT_COMMITTED`
- `FIRST_STAGING_INVENTORY_ADJUSTMENT_PASS`
- `STAGING_TRANSFER_WRITE_NOT_AUTHORIZED`
- `WAVES_3_PLUS_NOT_STARTED`

The next authorized planning target is described in [NEXT_PHASE.md](NEXT_PHASE.md).
It is not authorization to execute that gate.

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

The transfer write path is implemented and tested, but no real transfer has
been executed in staging. A separate human authorization is mandatory.

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

This is non-secret operational evidence supplied at handoff, not a substitute
for a fresh read-only preflight:

| Entity or fact | Count/state |
|---|---:|
| `Product` | 144 |
| `InventoryBalance` | 357 |
| `ProductWarehouseValuation` | 357 |
| `InventoryMovement` | 1 |
| `InventoryTransfer` | 0 |
| `InventoryTransferItem` | 0 |
| `TRANSFER_OUT` | 0 |
| `TRANSFER_IN` | 0 |
| `ReconciliationIssue` | 189 |
| `ImportBatch` | one, `COMMITTED` |

The only real post-import inventory mutation is the controlled `ADJUSTMENT`
validated in FASE 5C. No transfer has been persisted in staging.

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
first adjustment, and pre/post FASE 6A schema deployment. Backups are private,
not stored in Git, and will not be present on a new clone. Their existence,
integrity, tooling version, and restore evidence must be revalidated before a
gate that relies on them.

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

At FASE 6B completion: 125 unit tests, 148 integration/concurrency tests, and
17 Chromium E2E tests passed; format, lint, typecheck, Prisma validation, and
build also passed. A new agent must rerun the relevant baseline rather than
assuming this historical result is still current.

## Historical-document caveats

Some versioned documents intentionally preserve earlier snapshots:

- the FASE 3B completion report has the RBAC counts and grants as they existed
  before `inventory.read` and the FASE 6A transfer grant;
- portions of the FASE 4 readiness documents and roadmap predate the approved
  first persistent staging import;
- portions of module-boundary/system-context documentation still describe the
  transfer application as future or GitHub as private.

Do not rewrite those historical decisions as if later state always existed. For
current RBAC, transfer implementation, repository exposure, and operational
milestones, follow the authority order in `AGENTS.md` and verify code/tests plus
this handoff. These known documentation lags are not authorization to modify
functionality or external state.
