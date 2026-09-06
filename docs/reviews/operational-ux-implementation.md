# Operational UX implementation

Approved plan: ADR-015. Baseline: application `273a316`, documentation HEAD `dd2f844` on `codex/staging-pilot`.

## Gates

- [ ] 1. Shared controls, account/theme and operational home.
- [ ] 2. Products, receipts, valuation, catalogs, schema and explicit permissions.
- [ ] 3. Movement actions/history and persistent adjustment idempotency.
- [ ] 4. Guided counts, paginated selection and audited corrections.
- [ ] 5. Unit/integration/build/Playwright and visual verification.

Existing uncommitted deployment/custom-domain documentation and configuration are preserved. No commit, push, external database mutation or deployment has been performed for this plan.

## Validation run — 2026-09-05

Local gates on `codex/staging-pilot`, working tree uncommitted, against the
ephemeral PostgreSQL database the E2E runner creates and drops. Staging was
never a target.

| Gate | Result |
|---|---|
| `pnpm lint` | pass |
| `pnpm typecheck` | pass |
| `pnpm test` | pass — 62 files, 251 tests |
| `pnpm test:integration` | pass — 30 files, 330 tests |
| `pnpm build` | pass — 7/7 tasks |
| `node apps/web/e2e/run-e2e.mjs` | pass — 47 tests across chromium, tablet and mobile, 11.2 min |

The sales concurrency suite that had been intermittently failing under parallel
load (`SALE_CONCURRENCY_CONFLICT`) passed in the full integration run. It is
prior debt and remains worth watching rather than considered resolved.

Accepted plan behaviour covered by the passing browser suites: product and
first receipt created from an empty catalogue with a lost response replayed
without duplicating product, balance or movement; search and count of the
product past number 100; correction of an open count with immutable history and
locking after submission; and light/dark appearance retained across navigation
and reload.

### Test-harness defects found and fixed during validation

None of these were product defects; the implementation under review was not
changed.

1. `apps/web/e2e/run-e2e.mjs` waited 60 s for readiness. A cold
   `tsx src/main.ts` needs about 104 s on a developer Windows machine, so a
   healthy API timed out. The budget is now 240 s and `SGI_E2E_READY_TIMEOUT_MS`
   overrides it.
2. `next dev` compiled each route on its first request, 7 s to 68 s, inside the
   tests. The runner now requests every page route once first, deriving the list
   from `apps/web/app` so it cannot go stale.
3. Fixture transactions used Prisma's 2 s default wait and failed as `Unable to
   start a transaction in the given time` on a busy local PostgreSQL. Fixture
   setup now waits 30 s.
4. `06-inventory-counts` navigated without waiting for the login response, so
   the next page arrived anonymous and bounced to `/login`.
5. `getByLabel('Bodega', { exact: true })` never matched: when a `<label>`
   wraps a `<select>`, Playwright's label text includes the option text.
   Verified in isolation, then replaced with
   `getByRole('combobox', { name: 'Bodega', exact: true })`, which uses the real
   accessible name. The `FormField` markup is correct and was left alone.
6. `getByRole('alert')` also matched Next.js's route announcer. Both call sites
   are now scoped to `getByRole('main')`; one had been masked by `.first()`,
   which could have asserted against the announcer instead of the application.
7. Three `01-authentication` tests still expected the session identifier and the
   password link on Inicio. Stage 1 deliberately moved both to Cuenta, so they
   now assert there.

## Visual review — 2026-09-05

Walked Inicio, Movimientos, Conteos (list and guided detail) and Nuevo producto
on desktop, tablet (768) and mobile (375), in light and dark, against an
ephemeral database holding the 155 synthetic products and three warehouses. The
environment was torn down afterwards and left no database behind.

### Defects found and fixed

1. The mobile header broke below about 380px: the appearance select clipped its
   own longest option (99px of text in an 80px box) and the account link
   collapsed to 47px across two lines. The responsive suite cannot see this —
   the page reports no horizontal overflow at 375px. `globals.css` now gives the
   select a minimum width, lets the session row wrap and keeps the account link
   on one line.
2. Movements showed "No hay movimientos que coincidan con los filtros" with no
   filters applied. The plan requires "nothing yet" and "nothing matches" to
   read differently, which the product catalogue already did. It now offers the
   operations that would produce a first movement.
3. Checkboxes and radios rendered in the browser's blue against the green
   identity. `accent-color: var(--accent)` follows the theme.
4. Preparing a count showed an empty bordered box while the warehouses loaded.
   It now says so, and reports a load failure.
5. `Almacen` in the adjustment dialog was missing its accent, and its error
   message also read "ya no esta disponible".

### Terminology unified to "bodega"

The interface mixed "Almacén" (movements, sales, inventory, transfers) with
"Bodega" (counts, receipts, home) for the same entity, whose instances are named
Casa Dylan, Casa Jean and Casa Luden. The owner chose "bodega". Forty-one
strings across ten components and the inventory spec were changed with gender
agreement, not by mechanical substitution: "Todos los almacenes" became "Todas
las bodegas", "Sin saldo en ese almacén" became "en esa bodega", and so on. The
E2E fixture product named "Producto multi-almacén" is test data and was left
alone.

### Reported but not defects

A black band when scrolling was an artifact of the screenshot pane, not CSS: the
document measured its full height with `scrollTop` legitimately at its maximum.
Grey cards in light mode were a stale repaint from emulating the colour scheme
and rendered correctly after a reload. The pale "Crear y comenzar a contar"
button is genuinely `disabled` until a warehouse is chosen.

### Re-verification

`pnpm lint`, `pnpm typecheck` and the full 47-test Playwright suite pass after
both the visual fixes and the rename. One typecheck run failed on
`.next/dev/types/*` syntax errors; those are generated artifacts a killed dev
server had left half-written, and the check passes once regenerated.

### Still outstanding

- Commit, diff review and deployment. The two migrations and the 23-permission
  manifest have not been applied to staging and need an explicit gate,
  preflight and checkpoint.
