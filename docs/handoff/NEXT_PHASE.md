# Next Gate — FASE 7 Planning

FASE 6 is complete. Its transfer foundation, movement-history and transfer
API/UI, first controlled staging transfer, and post-gate concurrency fix all
passed their approved gates.

Current state:

- **`PHASE_6_COMPLETE`**
- **`FIRST_STAGING_TRANSFER_PASS`**
- **`PHASE_6_CONCURRENCY_FIX_PASS`**
- **`PHASE_7_NOT_STARTED`**
- **`PHASE_7_NOT_AUTHORIZED`**
- **`NEXT_GATE = PHASE_7_PLANNING`**

This document authorizes no implementation and no staging write.

## Why FASE 7 is the defined next phase

The versioned roadmap, migration runbook, architecture boundaries, and
traceability matrix consistently define FASE 7 as the sales phase. Its target
domain includes sales and sale items, multi-warehouse stock consumption,
completed and in-transit states, confirmation, cancellation, idempotency, and
auditability.

The phase identity is therefore unambiguous. Its exact implementation and
legacy-import scope still require a planning gate before work begins.

## Objective of the planning gate

Reconcile the authoritative implementation, schema, approved business rules,
legacy evidence, and open decisions into an auditable FASE 7 plan. At minimum,
planning must distinguish:

- operational `Sale`/`SaleItem` creation from any legacy Sales import;
- stock consumption at creation from in-transit confirmation, which must not
  deduct stock again;
- eligible full cancellation and exactly-once stock restoration;
- multi-item and multi-warehouse locking and transaction boundaries;
- actor, permission, idempotency, immutable movement, and audit requirements;
- historical sales grouping, duplicates, orphans, state/payment ambiguity, and
  unresolved mappings;
- dependencies on deferred legacy Movimientos and later finance/closing phases.

Planning must produce explicit gates for any schema, RBAC, legacy mapping, or
persistent staging mutation. It must not silently combine operational sales
implementation with Waves 3+ import work.

## Evidence to review before planning

Follow the authority order in `AGENTS.md`, then review at least:

- [CURRENT_STATE.md](CURRENT_STATE.md);
- [APPROVED_DECISIONS.md](APPROVED_DECISIONS.md);
- [phased-roadmap.md](../migration/phased-roadmap.md);
- [runbook.md](../migration/runbook.md), especially FASE 7;
- [traceability-matrix.md](../migration/traceability-matrix.md);
- [transaction-design.md](../architecture/transaction-design.md);
- [module-boundaries.md](../architecture/module-boundaries.md);
- [open-decisions.md](../legacy/open-decisions.md);
- the current Prisma schema, sales-related tests, and legacy evidence.

Do not treat historical documents as overriding later approved decisions or
tested code.

## State that must remain unchanged during planning

- The single approved staging transfer remains a consumed, non-repeatable gate.
- Further staging writes require separate explicit authorization.
- All 1,069 legacy `Movimientos` rows remain unimported.
- The 25 legacy rows classified as transfers remain unimported.
- Legacy sales and later finance/closing materialization remain pending.
- `WAVES_3_PLUS_NOT_STARTED` remains true.
- No manual edit or deletion of historical ledger rows is permitted.

## Stop conditions

Stop and request a separate decision before implementation if planning finds an
unresolved requirement involving schema, migration, RBAC, sales grouping,
duplicate resolution, historical state/payment interpretation, cancellation,
in-transit behavior, idempotency persistence, or a real staging write.

Completion of `PHASE_7_PLANNING` may recommend an implementation sequence. It
does not itself authorize FASE 7 implementation, legacy import, or staging
mutation.
