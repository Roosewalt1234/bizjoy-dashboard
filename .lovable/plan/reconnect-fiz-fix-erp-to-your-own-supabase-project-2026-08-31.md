# Reconnect Fiz Fix ERP to your own Supabase project

## Goal
Switch the live runtime binding of this Lovable project from the current Lovable-managed backend to your own Supabase project (`evcaehadjzoxtdlnmehk`), preserving the schema and data.

## Confirmed current state

- This project is currently bound at runtime to a Lovable-managed backend (`bhrtkfmssvmqzkezmocu`).
- The repository still identifies the intended original project in `supabase/config.toml` (`evcaehadjzoxtdlnmehk`).
- Historical commits through `86071fe` show the app environment pointing to the original project.
- A full data export was already produced (`fizfix-supabase-export-2026-08-16.zip`) containing schema migrations, SQL/CSV dumps for ~40 tables, auth metadata, and a storage manifest.

## Important constraints

- **This cannot be done by editing code or env files alone.** The runtime binding is controlled by the Lovable platform, not by `src/integrations/supabase/client.ts` or `.env`.
- **Disconnecting Lovable Cloud is irreversible** and permanently deletes the managed database, storage, and functions backing this project. The app will stop working until it is reconnected to another backend.
- **Only a workspace admin** can disconnect Cloud. If you are not the admin, you need to ask one to do it.
- After disconnect, the project can be reconnected to your own Supabase project (the one you own).

## Migration plan

### Phase 1 — Prepare your own Supabase project
1. Ensure the target Supabase project (`evcaehadjzoxtdlnmehk`) is provisioned and accessible in your Supabase account.
2. Create a fresh database or empty schema in that project.
3. Note the project URL and publishable/service-role keys.

### Phase 2 — Import schema and data
1. Apply the migration files from `Supabase export from lovable/schema/` in chronological order to recreate the full schema (tables, enums, functions, triggers, RLS policies, grants).
2. Apply `Supabase export from lovable/sequences.sql` to restore document-number sequence values.
3. Import the data dumps from `Supabase export from lovable/data-sql/` (or the CSV equivalents) into the corresponding tables.
4. Verify row counts and key relationships (customers, quotes, contracts, FM tables, auth/profiles/roles).

### Phase 3 — Recreate storage and auth
1. Recreate the storage buckets (`customer-documents`, `employee-images`, `service-photos`) in your project.
2. Re-create or invite the auth users and re-link them to `public.profiles` / `public.user_roles` / `public.employees` using the exported auth metadata.
3. Reconfigure any social OAuth providers (Google) in your Supabase Auth settings if they were enabled.

### Phase 4 — Disconnect Lovable Cloud and reconnect your project
1. A workspace admin opens the Lovable editor, goes to **Cloud Tab → Advanced**, and clicks **Disconnect**.
2. Confirm the warning that all cloud data will be deleted.
3. After disconnect, use the project settings / Connectors flow to connect this Lovable project to your own Supabase project (`evcaehadjzoxtdlnmehk`).
4. Let Lovable rebind the runtime secrets (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`).

### Phase 5 — Verify and publish
1. Restart the dev server and run a build/typecheck.
2. Verify sign-in, a read-only database request, and the `/permissions` page load against the new backend.
3. Confirm the app is pointing to your project (no `bhrtkfmssvmqzkezmocu` references remain active).
4. Publish to `fizfix.ansearly.io` only after verification.

## Risks and prerequisites

- **Data loss risk**: The managed backend will be deleted on disconnect. Do not disconnect until the target project has the schema and data imported successfully.
- **Admin access required**: The disconnect step requires workspace admin rights.
- **OAuth reconfiguration**: Google sign-in may need to be re-enabled/configured in the new Supabase project.
- **Custom domain**: Publishing after reconnection will deploy against the new backend.

## What I can do now

I can prepare and validate the migration package, but I cannot click Disconnect or authorize the reconnection to your Supabase account — that requires a human workspace admin action in the Lovable UI.

If you approve this plan, the first step is to confirm you are a workspace admin and that the target Supabase project is ready to receive the data.
