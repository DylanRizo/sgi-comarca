# Next Gate — FASE 7B Planning

FASE 7A is complete in the versioned repository: the sales schema foundation
and the `sales.read` bootstrap/RBAC change are implemented and tested. They have
not been deployed to staging.

Planning is complete and versioned in
[phase-7b-sales-application-plan.md](../reviews/phase-7b-sales-application-plan.md),
with the pricing/cost decision recorded in
[ADR-009](../decisions/ADR-009-sales-pricing-cost.md). The owner reviewed the
plan and authorized only its first implementation block.

Current state:

- **`PHASE_7A_SCHEMA_COMPLETE`**
- **`PHASE_7B_PLANNING_COMPLETE`**
- **`PHASE_7B_IMPLEMENTED_VERIFICATION_INCOMPLETE`** — blocks 7B.1 through 7B.4
  are implemented and committed; the owner delegated the remaining code work.
- **`PHASE_7B_COMPLETION_CANDIDATE_NOT_DECLARED`**
- **`STAGING_PHASE_7A_MIGRATION_NOT_AUTHORIZED`**
- **`FIRST_STAGING_SALE_NOT_AUTHORIZED`**
- **`WAVES_3_PLUS_NOT_STARTED`**
- **`NEXT_GATE = PHASE_7B_INTEGRATION_VERIFICATION`**

This document authorizes no schema or RBAC deployment, legacy import, UI, or
staging write. FASE 7B code exists but is unverified against real PostgreSQL.

## Next gate — integration verification

FASE 7B cannot be closed until, in a Docker-enabled session:

1. `pnpm test:integration` runs and the two new sales suites pass;
2. the concurrency suites required by the plan are added and pass;
3. the E2E baseline is re-run as regression.

See [phase-7b-completion-report.md](../reviews/phase-7b-completion-report.md)
for exactly what was and was not verified.

## FASE 7B.1 authorization — 2026-08-27

The owner authorized implementation of block 7B.1 only: HTTP contracts/DTOs,
pure Decimal money and shipping-allocation helpers, request canonicalization,
and typed domain errors, each with unit tests. No NestJS module, controller,
service, DB access, permission check, or route is in scope; those arrive in
7B.2+ under their own gates.

Three technical decisions were confirmed by the owner and bind 7B.1:

- **Minimal creation DTO.** No `deliveryPlace` or legacy free-text fields;
  extending the DTO with personal-data fields needs a separate exposure
  decision.
- **Cost hidden on read.** `unitCostSnapshot` is never exposed in `sales.read`
  responses; `sales.read` grants no financial permission.
- **Monetary rounding.** Line subtotals round to cents with `ROUND_HALF_UP`;
  the shipping residue is distributed one cent at a time by validated item
  ordinal so allocations sum exactly to `shippingAmount`.

These match [ADR-009](../decisions/ADR-009-sales-pricing-cost.md) and the
versioned plan. Blocks 7B.2 through 7B.5 remain unauthorized.

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
