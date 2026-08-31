# Fiz Fix ERP — full backend export (31 Aug 2026)

Generated from the live Lovable-managed backend immediately before disconnecting Cloud.

## Contents

| Folder / file | What it is |
| --- | --- |
| `schema/` | 63 migration files, in chronological filename order. Recreates all tables, enums, functions, triggers, RLS policies and grants. |
| `data-sql/<table>.sql` | One file per table with plain `INSERT` statements. |
| `data-sql/_all_tables.sql` | Every table's inserts in one file, wrapped in `SET session_replication_role = replica;` so FK order does not matter. |
| `data-csv/<table>.csv` | Same data as CSV, header row = column names. |
| `sequences.sql` | Restores document-number sequences. Run **after** the data import. |
| `auth/auth_users.json` / `.csv` | Auth user records (id, email, timestamps, metadata). Passwords **cannot** be exported. |
| `storage_manifest.json` | Buckets and their objects. All three buckets are currently empty (0 objects), so there are no files to move. |
| `row_counts.json` | Row count per table at export time — use this to verify the import. |

## Import order

1. Apply everything in `schema/` in filename order.
2. Run `data-sql/_all_tables.sql`.
3. Run `sequences.sql`.
4. Create the three storage buckets: `customer-documents`, `employee-images`, `service-photos` (all private).
5. Re-create the 3 auth users (see below), then verify counts against `row_counts.json`.

## Auth users → app records

Passwords are not exportable. Create each user in the new project **with the same UUID** (Auth Admin API accepts an `id`), or create them normally and then update the linked rows.

The auth user id is the join key for:

- `public.profiles.id`
- `public.user_roles.user_id`
- `public.employees.auth_user_id`
- `public.user_permissions.user_id`

| Auth user id | Email | Role |
| --- | --- | --- |
| `70299b80-a93b-4a27-af3a-5ce1128f3da0` | roosewalt@gmail.com | admin |
| `bacaa793-40b4-4030-957d-071e06eb9e2d` | info@fizfix.com | admin |
| `0ffb30c0-4f8f-4b8f-94a2-48121d291547` | info@fixfix.com | (no role row) |

If you cannot preserve the UUIDs, update `profiles.id`, `user_roles.user_id`, `employees.auth_user_id` and `user_permissions.user_id` to the new ids after creating the users.

## Row counts at export time

Key tables: customers 363, quotes 171, quote_items 19, contracts 41, contract_payments 101,
contract_assets 351, contract_line_items 17, contract_manpower_plans 11, contract_consumables 8,
contract_billing_lines 5, ppm_visits 12, ppm_schedules 6, sla_policies 5, service_categories 6,
fm_contracts 1, fm_work_orders 2, fm_cleaning_area_catalog 8, fm_cleaning_checklist_templates 8,
invoice_packs 1, invoice_pack_items 4, audit_log 808, profiles 3, user_roles 2, sales_leads 2,
work_orders 1, service_reports 1, weekly_reports 1, monthly_reports 1.

Full list in `row_counts.json`.

## After importing

Re-enable Google sign-in in the new project's Auth settings if it was in use, and confirm
`/permissions` loads for an admin user.
