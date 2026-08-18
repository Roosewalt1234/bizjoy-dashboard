# Fiz Fix ERP — full database export

Generated 2026-08-16 UTC. Source: Lovable Cloud managed Postgres (Supabase).

## Contents
- `schema/` — 50 SQL migration files, in filename order. Run these first on the new project.
- `data-sql/` — one `<table>.sql` of INSERT statements per table, plus `_all_tables.sql`
  (all tables in one transaction with `session_replication_role = replica` so FK/trigger
  order doesn't matter — this also avoids re-firing the audit_log triggers).
- `data-csv/` — same data as CSV with headers (one file per table), for `\copy` or tooling.
- `auth/auth_users.json` / `auth_users.csv` — 3 auth users (id, email, providers, metadata,
  timestamps). Passwords/hashes cannot be exported; recreate users with the same UUIDs via
  the Admin API (`POST /auth/v1/admin/users` accepts an explicit `id`) or invite them.
- `sequences.sql` — run after import to restore WO/SR numbering.
- `row_counts.json`, `storage_manifest.json`.

## Auth ID mapping
`public.profiles.id` = `auth.users.id` (1:1, created by the `handle_new_user` trigger).
`public.user_roles.user_id` -> `auth.users.id` (roles: admin/user).
`public.user_permissions.user_id` -> `auth.users.id` (per-module CRUD flags).
`public.followup_remarks.user_id` and `audit_log.user_id` also reference auth users.
`public.employees` has **no** auth link — employees are standalone records.

## Import order
1. Create the new Supabase project, run `schema/` migrations in order.
2. Recreate auth users first (same UUIDs) so FKs on profiles/user_roles resolve.
   Temporarily disable the `on_auth_user_created` trigger, or delete the auto-created
   profile rows before importing `profiles.sql`.
3. `psql "$NEW_DB_URL" -f data-sql/_all_tables.sql`
4. `psql "$NEW_DB_URL" -f sequences.sql`
5. Re-point the app: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`.

## Storage
Buckets `customer-documents`, `employee-images`, `service-photos` all exist but are **empty**
(0 objects) — nothing to migrate. Recreate the buckets as private with the policies from `schema/`.

## Totals
1,943 data rows across 40 tables; 3 auth users; 0 storage objects.
