# EVA CRM module awareness

## What is built

The 2026-11-01 Fiz Fix CRM schema is mapped to 28 module groups and 64 business tables. All 73 public tables are accounted for: nine internal/authentication/notification tables are explicitly excluded. Field allowlists exclude credentials, NFC tokens, banking/identity identifiers, arbitrary JSON payloads, and private document paths. Employees expose only basic operational fields. Excluded modules are awareness-only, not hidden query tools.

The existing deployed `eva-cloud` version 2 was read from Supabase and captured in this repository before extending it. The new query path is **disabled by default**, behind `EVA_CRM_CATALOG_ENABLED=true`. The prior SSE response format, authentication, pilot budget admission/reservation/settlement, timeout and quota-stop mechanisms remain in place. The enabled path reserves once and settles both planner and answer usage together. An incomplete model request retains the reservation, as in the original pilot.

## Runtime flow

1. Verify the caller's existing Supabase session.
2. Check module permissions through `eva_crm_can_read` and retrieve relevant catalogue entries.
3. Ask the existing model for a bounded JSON query plan; no generated SQL is executed.
4. Validate the complete plan: approved tables/fields, typed literal filters, row limits, and declared foreign-key references only.
5. Recheck permissions for every step before reading business records. All business reads use the user's token and the publishable key, never the service-role key.
6. Fetch fresh records, exact counts, or bounded complete aggregates. Reject ambiguous name resolution and incomplete totals.
7. Stream a concise answer grounded in this turn's evidence. Keep selection IDs for subsequent follow-ups.

Common reads need two model calls (planning then answer). This can increase latency relative to the old deterministic routes. Measure on the phone before enabling for regular use; add tested deterministic shortcuts for the frequent questions after measuring, rather than caching business answers.

## Business definitions inspected in source

- `src/routes/_authenticated/accounts-outstanding.tsx`: a payment due today is Not Yet Due, 1–15 calendar days late is Due, 16+ is Overdue; received_date overrides these. Outstanding is Due + Overdue **contract schedule** values. This is not an unpaid invoice balance.
- `src/lib/fm-invoice.ts`: FM invoice packs have stored net payable, VAT, deductions and retention. Invoice packs do not establish whether an invoice is unpaid.
- `src/lib/nav-items.ts`: module permissions and navigation coverage.
- The live foreign keys distinguish AMC and FM families, including attendance_logs.amc_contract_id versus attendance_logs.contract_id.
- quotes has customer_name and zoho_customer_id, not customer_id. No invented UUID relationship is allowed.
- Relative dates resolve in Asia/Dubai. Latest quote ordering is explicitly quote_date, created_at, id descending; this definition must be stated where relevant.

## Current limits

- At most four query steps, ten displayed rows per step, eight AND filters per step.
- References must resolve to one record through a declared foreign key. Multi-contract customer rollups, arbitrary joins, OR logic, grouping, comparisons not represented in the plan, and customer-name joins to quotes need additional tested functions or a clarification.
- Aggregates are bounded; the executor refuses to label a partial scan as a total. A changed result count or duplicate ID during pagination also fails. Multi-page REST aggregates cannot provide a transaction-wide snapshot during concurrent edits; migrate high-value multi-page financial reports to a single-snapshot database RPC before relying on them for reconciliation.
- Sensitive HR fields, stored files, audit payloads, write operations and permission administration are not exposed.
- Catalogue coverage is not a claim that every possible business question has been implemented. Each supported plan still needs module-level acceptance examples against the CRM.
- The schema catalogue is versioned, not a live data cache. New database fields do not become queryable automatically.

## Verification performed here

Run `node --test supabase/functions/eva-cloud/crm-query.test.mjs` and `node scripts/build-eva-catalog.mjs --check`. The tests exercise real planner/executor/adapter/handler code with mocked model and authenticated HTTP responses. They do not claim to validate the installed Android app or the actual model's plans.

Live schema checks confirmed columns, foreign keys and RLS enabled for every public table. Some existing policies are permissive; this change does not rewrite them. The additional module gate is mandatory even with RLS enabled.

## Activation procedure for the Windows Codex session

1. Determine EVA's **actual active backend** from its current local source/configuration. The GitHub Android repository predates some recent Hermes changes. Do not replace the installed APK or assume it uses eva-cloud simply because that endpoint exists.
2. If the actual backend is Hermes, register the catalogue/planner/executor with that backend using the same user-bound authorization model. Preserve the working speech and task/note paths. If it uses eva-cloud, continue below.
3. Apply `supabase/eva-crm-permissions.sql` using the project's normal migration workflow, preserving its contents in migration history. Validate that a missing or unprivileged caller is denied and that each authorised module is allowed. Never grant a module merely to make a test pass.
4. Deploy the function sources with the catalogue switch disabled. Preserve existing secrets and `EVA_CLOUD_PILOT_AUTHORIZED`. Do not raise or reset the pilot budget.
5. With an existing authorised session token held privately on the machine, test one question per module; compare results against the matching CRM screen. Include duplicate names, AMC/FM ambiguity, no records, date boundaries, permission revocation, result truncation and backend outages. Do not paste session tokens in chat or commit them.
6. Exercise counts, latest quotation, a named quotation's items, today's attendance, vendor bills, an FM site's PPM, and both family payment schedules. Confirm queries fetch the intended columns and return concise referenced answers. Unsupported rollups must ask a question or explain the limitation.
7. Enable `EVA_CRM_CATALOG_ENABLED=true` for the bounded pilot; repeat the acceptance checks through EVA's installed app, including a second/third-record follow-up. Record total and first-audio latency.
8. If checks fail, disable the switch to restore the original route. Keep evidence of failed cases and fix them before repeating the rollout.

## Refreshing the catalogue

Export public information_schema.columns metadata to schema-snapshot.json and declared foreign keys to relationships.json, retaining the existing formats. These exports contain metadata, not business records. Review changes to permissions, sensitive fields, and module mapping in scripts/build-eva-catalog.mjs. Run the generator, the drift check, and the tests. An unmapped new table fails generation until reviewed. Commit the snapshot, generator and generated catalogue together. Add a CI/live-schema comparison to the normal database migration workflow when the active backend is confirmed.
