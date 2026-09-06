# ADR-015 — Operational UX, products, receipts and count corrections

Status: approved by the owner on 2026-09-04 through the implementation request.

## Decisions

- All four initial inventory managers may create/edit product information and receive stock, using explicit `products.manage` and `stock-receipts.create` permissions.
- `inventory.valuation.manage` belongs to FINANCE. Valuation operations additionally require financial reading. Inventory cost and historical cost reads require `finances.read`; sale reference prices remain available to authorized sellers.
- An explicitly supplied receipt cost replaces the current cost of that product/warehouse. Omitted values retain the current value; missing values are not converted to zero. Valuation history is append-only.
- Product creation and an optional first receipt commit atomically. Quantities use Decimal, receipts have immutable documents/items and movements, and retry identity is persisted as hashes scoped by actor and operation.
- Product codes are trimmed and uppercased. Code and unit cannot change after operational history. Product edits never change balances.
- Count corrections are allowed only while OPEN, require a reason, preserve the original expected balance, and record immutable before/after revisions with optimistic concurrency. Submission locks further correction. Approval retains the existing atomic drift checks and permissions.
- Theme preference is per account/browser, defaults to the device and contains no credential or session token.

## Boundaries

This decision authorizes local implementation, reproducible migrations and tests. External schema/bootstrap/deployment gates require target verification and their operational checkpoint. Legacy files and import mappings are not changed. No real products or transactions are inserted by application startup.
