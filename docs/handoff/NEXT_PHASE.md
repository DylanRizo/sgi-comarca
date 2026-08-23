# Next Gate — First Staging Inventory Transfer

FASE 6B is complete. The next action is a separately authorized operational
gate, not FASE 7 and not a new implementation phase.

Current state: **`STAGING_TRANSFER_WRITE_NOT_AUTHORIZED`**.

## Objective

Execute exactly one small, controlled inventory transfer in staging to validate
the complete path:

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

This document does not authorize the write. A human must approve the exact gate
after a fresh preflight.

## Required preconditions

- Git is clean and synchronized at the approved commit.
- Staging is operational and positively identified; do not rely only on a saved
  database name or old fingerprint.
- A new verified checkpoint exists and its restore path is understood.
- Read-only checks still report:
  - `InventoryTransfer = 0`;
  - `InventoryTransferItem = 0`;
  - `InventoryMovement = 1`, the approved FASE 5C adjustment only;
  - `TRANSFER_OUT = 0` and `TRANSFER_IN = 0`.
- Dylan is active and has effective `transfers.create` through
  `INVENTORY_MANAGER`; no direct DENY applies.
- Select an ordinary product, two approved distinct warehouses, a small positive
  decimal quantity, sufficient origin stock, and a non-sensitive reason.
- Avoid DGGR-X, CCWH-L, zero-cost review rows, missing-`observedAt` cases, and
  other legacy exceptions for this first transfer.
- Use one UI intention and its single generated idempotency key. Do not issue a
  second transfer or manually replay the request.

Any mismatch stops the gate before the write.

## Expected successful result

Exactly one successful transfer must produce:

- `InventoryTransfer +1`;
- `InventoryTransferItem +1`;
- `TRANSFER_OUT +1`;
- `TRANSFER_IN +1`;
- origin balance `-N`;
- destination balance `+N`;
- consolidated product stock unchanged;
- exactly one `inventory.transferred` audit event;
- no valuation creation, copy, or update;
- no second transfer and no unrelated mutation.

The OUT/IN movements must share the same transfer item, preserve correct
before/after balances, actor, warehouses, product, and magnitude, and appear in
the refreshed UI. A retry/reload must not create another transfer.

## Verification and stop conditions

Keep a before/after read-only evidence set. Stop and retain the operational gate
if any count, ledger pair, balance, audit, authorization, idempotency, valuation,
or privacy invariant differs. Do not repair historical rows manually or execute
a compensating second transfer without a new approved recovery procedure.

## Afterwards

Only after the single-transfer gate passes and is independently reviewed may the
owner consider declaring `PHASE_6_COMPLETE` and planning the following phase.
FASE 7 is not authorized by this handoff.

Until separate approval is granted, preserve:

- `STAGING_TRANSFER_WRITE_NOT_AUTHORIZED`;
- `FIRST_STAGING_IMPORT_COMMITTED`;
- `FIRST_STAGING_INVENTORY_ADJUSTMENT_PASS`;
- `PHASE_6B_COMPLETE`;
- `WAVES_3_PLUS_NOT_STARTED`.
