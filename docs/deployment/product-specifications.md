# Product specifications — ADR-023 / PR #11

## Approved scope

Three nullable columns only in `20261020160000_product_enrichment_specs`:
materials description, per-SKU measurements and a safe HTTPS Drive folder link.
No backfill, import, file upload, stock change or historical snapshot rewrite.
The owner separately approved adding `products.specifications.manage` (catalog
28), granting it to ADMIN and initially to Luden, with audited administration.
The existing nine administrator-only capabilities remain reserved.

## Gates, in order

1. Finish lint, types, unit tests, real local PostgreSQL integration, production
   build and relevant Chromium tests, including mobile themes, access delegation
   and uncertain-response replay. Review the exact diff and CI before merging.
2. Revalidate Render's tracked branch/commit and the intended direct Neon main
   target read-only. Expect 14 finished migrations, no unfinished migration,
   51 triggers, 47 application tables, 27 permissions and exactly this pending
   migration. Historical migration checksums must match (allow line endings).
3. Create a fresh private full PostgreSQL custom-format backup outside Git.
   Verify header, TOC, SHA-256 and complete restoration into an isolated local
   temporary database. Compare consistent source/restore fingerprints including
   `sale_payment_parts`. Remove only that temporary database/archive copy; keep
   the private backup. Never print/store the connection string.
4. Apply only the approved migration using an explicitly scoped direct
   `DATABASE_URL`, then remove the variable. Expect 15 finished migrations,
   still 51 triggers and 47 application tables. Compare pre/post fingerprints;
   project Products without its three new keys and assert all new values NULL.
5. Apply the separately approved permission manifest with `db:bootstrap` on
   the positively verified target. Expect exactly one added permission and one
   ADMIN role grant; people, roles, credentials and existing exceptions stay
   unchanged. A live bootstrap deliberately does not seed Luden's grant.
6. Use the existing audited administration operation to grant Luden the new
   capability, preserving every other override. Verify the initial effective
   capability for Dylan/Luden only; no other grants or financial access change.
7. Deploy API first, then web at the exact tested/merged functional commit.
   Check health/readiness, private-route authentication, schema and permissions.
   Inspect the published form/detail without saving real product information.
   Record deployment IDs, commit and sanitized evidence in the handoff.

Stop on a failed gate; do not restore over later legitimate activity, delete
Neon branches, replay past sale corrections or mutate ledgers manually.

## Administration and Drive

Configuration → Edit access → `products.specifications.manage` lets the admin
grant, revoke or deny this capability. `products.manage` is also necessary and
DENY wins. Existing readers may consult the technical information; unauthorized
editors can still edit the ordinary product sheet without overwriting it.
The link does not share a Drive folder or change Google's access permissions.
