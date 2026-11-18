# Marketplace monitor and remote actions — ADR-024 / PR #13

## Verified release — 2026-11-17

PR #13 was merged as `d59b328798e58d3792860f3d5cd4b3487e4c5908` after
green CI. Its tree equals candidate `a27e5d6`; the merged commit's CI also
passed. Both API and web were deployed at that exact commit, in that order.
The owner explicitly approved the normal fast-forward of `codex/staging-pilot`
to the same commit. Service configuration still tracks that branch.

Read-only preflight verified the intended Neon main target, PostgreSQL 18,
15 completed migrations, zero unfinished migrations, 28 permissions and exactly
one pending migration. A fresh full PostgreSQL custom-format backup passed
header, table-of-contents and SHA-256 checks. Full restoration into an isolated
local PostgreSQL container matched fingerprints of all 48 source tables.
The source matched that checkpoint immediately before migration.

Only `20261113180000_marketplace_bot_monitor` was applied. Verification found
16 completed migrations, none unfinished or pending, two initially empty monitor
tables, and no changed data in the 47 pre-existing application tables when the
new integration-key column was excluded from comparison. Permissions stayed at
28. The source migration checksums match, allowing CRLF/LF normalization.

The local bot received a focused monitor client compatible with its current
lead reporting and Windows/Mac secret storage. Its complete 433-test suite
passed. A separately scoped installation-bound synchronization key was created
through `IntegrationKeyService.create`, with an audit event, and encrypted in
the worker's Windows account. The selected lifetime is 90 days, expiring on
2027-02-15. Credentials and real configuration remain private.

The worker was restarted after verifying idle state, zero running queue or
listing actions and no unresolved publish-intent files. A real outbound HTTPS
heartbeat reached the SGI and subsequent heartbeats continued. Read-only
application projections verified an ONLINE instance for all four authorized
active readers, with control disabled. No command rows were created. Render's control flag
is absent and uses the application's false default. Health and readiness return
200, the web/login routes respond, and unauthenticated monitor API reads return
401. Authenticated live visual inspection remains pending.

## Remote control activation — 2026-11-17

The owner explicitly approved enabling administrative actions and testing one
listing-review request. The local client implements the 13 ADR-024 command
adapters through the existing bot services. Durable receipts and results use
SQLite settings. IDs are claimed before effects, repeated deliveries reuse the
result, expired orders are rejected and results survive lost acknowledgments.
An interrupted execution is reported for local-state verification before a
new request. The existing worker process lock serializes normal execution.

All 470 bot tests passed, including 37 new command tests. The SGI passed lint,
types, all 408 unit tests, its 16-case PostgreSQL integration file for keys and
commands, focused command-validation units and production build. Its runtime
code is the existing deployed commit `d59b328`.

A fresh full checkpoint restored successfully with all 50 table fingerprints
matching. PostgreSQL 18.4 initially rejected `pg_attver` from the source's newer
attribute metadata. The successful isolated restore used PostgreSQL 18.7,
matching Neon, and the complete unmodified archive. This compatibility behavior
is documented in the upstream attribute-versioning change. Private evidence
records the archive checksum and restore image. The local SQLite backup also
passed integrity verification. [PostgreSQL change](https://www.postgresql.org/message-id/E1xQQFr-000000003OT-3txh%40gemulon.postgresql.org)

`sgi.monitor.control_enabled=true` was set locally and the idle worker was
restarted. `MARKETPLACE_BOT_CONTROL_ENABLED=true` was set on the intended Render
API service, preserving the other environment values. API was redeployed at
the same exact commit and verified live with readiness 200. Web uses the
server-computed control capability and continues at the same commit.

One REQUEST_SCAN was queued through the existing application service, with a
privately persisted request ID. Its local receipt completed and was
acknowledged. The scan subsequently succeeded. The SGI command is COMPLETED
with exactly one queue audit and one result audit. The administrative account
has control; the other three active accounts have consultation access.
Unauthenticated monitor reads return 401. Visual inspection of the enabled
buttons remains pending in the owner's authenticated session.

Actions on listings register work in the local queue. The command result
confirms that request; the worker executes the underlying action through its
normal schedule and safety rules. The snapshot reports subsequent progress.

## Listing safeguards — 2026-11-17

PR #15 incorporated the original #14 commit and added explicit duplicate
verification across the bot, API and panel. The sync endpoint accepts JSON up
to 1 MB. The panel hides actions for twins, unknown states and old snapshots
until the updated client confirms listing eligibility.

The owner approved merging and deploying. Both the PR and its merge commit
passed GitHub Actions. The merge tree matched the tested PR exactly. Local
verification passed 414 unit tests, 422 PostgreSQL integration tests, four
Chromium cases with both control settings, and 479 bot tests.

The idle worker restarted after a SQLite backup passed `integrity_check`. Render
released `4e2487b6de90357702398e7569230b3a1ad9a9b0` from
`codex/staging-pilot`, first on the API and then on the web service. Both services
were verified live. The API readiness route and panel entry returned 200, and
the unauthenticated API monitor returned 401. The worker stayed online and a
live heartbeat after both deployments stored the marker on all 50 transmitted
listings. Read-only database checks verified 16 completed migrations and 28
permissions. The restarted bot-client code and this deployment record are
local working-tree changes.

## Revalidation and recovery

1. Verify the intended Neon project, region, main branch, database, role and
   migration ledger read-only before any subsequent persistent operation.
2. Verify Render's tracked branch and exact live API/web commit. Validate the
   private full backup and its isolated restore evidence before another schema
   gate. Private operational records stay outside Git.
3. Create synchronization credentials through the existing audited integration
   service or settings panel, bound to the same stable installation identifier.
   Store them with the local platform secret store. Keep catalog and monitor
   credentials independently scoped and revocable.
4. Check the heartbeat in **Bot Marketplace**. Pulses run between worker cycles,
   approximately every 30 seconds, including while publication is paused. A
   long-running worker operation can delay a pulse.
5. For application rollback, select the previous verified functional commit
   `24978808c09278bfb619cdd05dfc7a99cd489f88` and use the approved deployment gate.
   The schema addition preserves the existing catalog-key behavior. A database
   recovery needs its own approved destination and reconciliation of later
   legitimate activity.

To disable control through an approved operational gate, set the Render control
flag and local control option to false, redeploy the same API commit and restart
the idle worker. Preserve command records, local receipts and audits for
reconciliation. The consultation protocol continues to send commercial
projections. Credentials retain their separate revocation mechanism.
