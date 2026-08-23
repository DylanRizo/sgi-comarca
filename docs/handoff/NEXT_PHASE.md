# Next Gate — Independent Review of the First Staging Transfer

The first staging inventory transfer gate is closed and passed. FASE 6B is
complete and FASE 6 is a completion candidate.

Current state: **`FIRST_STAGING_TRANSFER_PASS`** and
**`PHASE_6_COMPLETE_CANDIDATE`**.

FASE 7 is not authorized by this document, and neither is any further staging
write.

## What the closed gate covered

On 2026-08-23 exactly one authorized transfer of quantity 1 was executed from
the UI by Dylan and verified read-only. The complete path was validated:

```text
UI
  → API
  → transfers.create
  → Idempotency-Key
  → atomic transaction
  → InventoryTransfer + InventoryTransferItem
  → TRANSFER_OUT + TRANSFER_IN
  → InventoryBalance updates
  → exactly one AuditLog
  → UI refresh
```

Evidence, identifiers, and the resulting operational snapshot are recorded in
[CURRENT_STATE.md](CURRENT_STATE.md). Pre-transfer and post-transfer
checkpoints exist outside Git with recorded size, SHA-256, and a passing
`pg_restore --list`.

That authorization was consumed by that single transfer. It does not permit a
second transfer, a compensating reverse transfer, or general transfer use in
staging.

## Objective of the next gate

Independent review of the executed transfer, so the owner can decide whether to
declare `PHASE_6_COMPLETE`. The review is read-only and changes no data.

The reviewer should reconfirm, against staging and the repository:

- exactly one `InventoryTransfer` and one `InventoryTransferItem` exist;
- exactly one coherent `TRANSFER_OUT`/`TRANSFER_IN` pair shares the transfer
  item, with correct product, warehouses, actor, magnitude, and before/after
  balances;
- exactly two balances changed, consolidated product stock is unchanged, and no
  balance is negative;
- exactly one `inventory.transferred` audit event exists, with sanitized
  metadata and no original idempotency key anywhere in the database;
- product, valuation, reconciliation, import, sales, and legacy counts are
  unchanged;
- the FASE 5C `ADJUSTMENT` row is untouched;
- the versioned test baseline still passes on the reviewed commit.

## Stop conditions

Stop and report before any remediation if a count, ledger pair, balance, audit,
authorization, idempotency, valuation, or privacy invariant differs from
[CURRENT_STATE.md](CURRENT_STATE.md). Do not repair historical rows manually,
do not execute a compensating transfer, and do not restore a checkpoint without
a new approved recovery procedure.

## Afterwards

If the review is clean, the owner may declare `PHASE_6_COMPLETE` and then plan
the following phase. Planning is not execution.

Until separate approval is granted for each item, preserve:

- `FIRST_STAGING_TRANSFER_PASS` as a single, non-repeated operation;
- `FIRST_STAGING_IMPORT_COMMITTED`;
- `FIRST_STAGING_INVENTORY_ADJUSTMENT_PASS`;
- `PHASE_6B_COMPLETE`;
- `WAVES_3_PLUS_NOT_STARTED`.

No further staging transfer, no legacy `Movimientos` import, no sales module
work, and no FASE 7 activity is authorized by this document.
