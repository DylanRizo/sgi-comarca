# Next Gate — FASE 7B Planning

FASE 7A is complete in the versioned repository: the sales schema foundation
and the `sales.read` bootstrap/RBAC change are implemented and tested. They have
not been deployed to staging.

Current state:

- **`PHASE_7A_SCHEMA_COMPLETE`**
- **`PHASE_7B_NOT_STARTED`**
- **`PHASE_7B_NOT_AUTHORIZED`**
- **`STAGING_PHASE_7A_MIGRATION_NOT_AUTHORIZED`**
- **`FIRST_STAGING_SALE_NOT_AUTHORIZED`**
- **`WAVES_3_PLUS_NOT_STARTED`**
- **`NEXT_GATE = PHASE_7B_PLANNING`**

This document authorizes no implementation, schema or RBAC deployment, legacy
import, or staging write.

## Objective of the planning gate

Produce an auditable implementation plan for the sales application layer and
REST API on top of the FASE 7A structural foundation. Planning must verify the
current migration, Prisma schema, permission manifest, transaction design, and
tests before defining any code change.

The planned FASE 7B scope is:

- a transactional create-sale service requiring `sales.create`, with multiple
  items and warehouses, deterministic balance locking, all-or-nothing stock
  consumption, one coherent `SALE` movement per line, canonical money
  calculations, actor-scoped idempotency, and one audit event;
- read endpoints guarded by `sales.read`;
- in-transit confirmation guarded by `sales.confirm_in_transit`, changing only
  fulfillment from `IN_TRANSIT` to `COMPLETED`, without a second stock
  deduction and without changing `paymentStatus`;
- total cancellation guarded by `sales.cancel`, only for an eligible
  `IN_TRANSIT + PENDING` sale, restoring each original warehouse balance
  exactly once and appending one coherent `SALE_CANCELLATION` per line;
- actor-scoped idempotency for creation, confirmation, and cancellation, with
  only the key hash and canonical request hash persisted;
- immutable ledger history, sanitized audit events, explicit RBAC checks, and
  concurrency coverage shared with adjustments and transfers.

Before implementation can be authorized, planning must resolve the still-open
operational source of current price and cost used to create the mandatory
non-negative item snapshots. The future DTO must not accept `saleNumber` or
`paymentStatus`; those rules are already fixed by the approved decisions and
the FASE 7A schema.

## Outside FASE 7B

FASE 7B does not include:

- sales UI;
- legacy `Ventas` import or any Wave 3+ materialization;
- resolution of legacy grouping, duplicates, missing movements, or historical
  state/payment ambiguities;
- finance or daily-closing implementation;
- applying FASE 7A to staging, running bootstrap against staging, or creating,
  confirming, or cancelling a real staging sale;
- any other persistent staging write.

Each excluded operational action requires its own explicit gate. In particular,
planning or implementing FASE 7B does not authorize
`STAGING_PHASE_7A_MIGRATION`, `FIRST_STAGING_SALE`, or a legacy import.

## State that must remain unchanged

- All 1,069 legacy `Movimientos` rows remain unimported.
- The 25 legacy rows classified as transfers remain unimported.
- Legacy sales remain deferred and unmaterialized.
- `WAVES_3_PLUS_NOT_STARTED` remains true.
- Historical ledger rows are never edited or deleted manually.
- The staging snapshot recorded on 2026-08-23 remains historical evidence, not
  live truth. Before a separate migration gate, revalidate the intended target
  read-only, including that all four sales tables remain empty.

## Required planning evidence

Follow the authority order in `AGENTS.md`, then reconcile at minimum:

- [CURRENT_STATE.md](CURRENT_STATE.md);
- [APPROVED_DECISIONS.md](APPROVED_DECISIONS.md);
- [phase-7a-sales-foundation.md](../database/phase-7a-sales-foundation.md);
- [transaction-design.md](../architecture/transaction-design.md);
- [authorization-matrix.md](../architecture/authorization-matrix.md);
- the current Prisma schema, migration SQL, permission manifest, and tests.

Historical planning and review documents remain evidence of how decisions were
reached; they do not override the implemented FASE 7A foundation.

## Stop conditions

Stop and request a separate decision before implementation if planning finds an
unresolved requirement involving schema, migration, RBAC, operational
price/cost selection, sales grouping, duplicate resolution, historical
state/payment interpretation, cancellation, in-transit behavior, idempotency
persistence, or a real staging write.

Completion of `PHASE_7B_PLANNING` may recommend an implementation sequence. It
does not authorize FASE 7B implementation, sales UI, legacy import, or staging
mutation.
