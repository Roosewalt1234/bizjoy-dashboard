# Disconnect Lovable Cloud and move to your own Supabase project

## Confirmed current state

- The live backend binding is a Lovable-managed backend (`bhrtkfmssvmqzkezmocu`), reported as **Managed by Lovable: true**, instance size Tiny, not paused.
- The repository still names your own project in `supabase/config.toml` (`evcaehadjzoxtdlnmehk`).
- An export already exists in the repo under `Supabase export from lovable/` (schema migrations, per-table SQL and CSV dumps, auth user metadata, sequence values, storage manifest). It was generated on **16 Aug 2026** — two weeks old.

## Where the setting is

- **Cloud view**: the stacked-layers icon in the top toolbar (right of `</>`) opens the **More** tab. Pick **Cloud** in the sidebar, then **Overview → Advanced settings**. The Disconnect action lives there.
- There is no "Project Settings → Integrations → Lovable Cloud" entry; Cloud is managed from the Cloud view, not from Connectors.
- Disconnecting requires **workspace admin** rights. If the action is missing or greyed out, you are not an admin on this workspace.

## Critical warning

Disconnecting Lovable Cloud is **irreversible**. It permanently deletes the managed database, storage, and functions behind this project. Restoring an older project version does not bring the data back. The app will be non-functional until it is rebound to your own Supabase project with the schema and data imported.

Do not click Disconnect until Phase 1 and Phase 2 below are done and verified.

## Plan

### Phase 1 — Take a fresh export (before anything else)
1. Regenerate the full export from the current live backend so it reflects data added since 16 Aug: all public tables as SQL inserts plus CSV, sequence values, auth user metadata, storage object listing.
2. Deliver it as a downloadable zip and keep a copy committed in the repo.
3. Record row counts per table so the import can be verified against them.

### Phase 2 — Load your own Supabase project
1. In your own Supabase project (`evcaehadjzoxtdlnmehk`), apply the schema migrations from the export in chronological order.
2. Import the table data, then restore sequences (`work_order_no_seq`, `service_report_no_seq`).
3. Recreate the storage buckets: `customer-documents`, `employee-images`, `service-photos`.
4. Re-create the auth users (passwords cannot be exported — they will need password resets or re-invites) and confirm their IDs match the rows in `profiles`, `user_roles`, and `employees`.
5. Verify row counts and key relationships against the numbers recorded in Phase 1.

### Phase 3 — Disconnect and rebind
1. Workspace admin opens **More → Cloud → Advanced settings → Disconnect** and confirms the data-deletion warning.
2. Reconnect this project to your own Supabase project through the connector flow.
3. Let the platform rebind the runtime environment (`SUPABASE_URL`, publishable key, service role key).

### Phase 4 — Verify, then publish
1. Restart the dev server, run build and typecheck.
2. Verify sign-in, a read of contracts/customers, and that `/permissions` loads.
3. Re-enable Google sign-in in your Supabase Auth settings if it was in use.
4. Only after all of the above passes, publish to `fizfix.ansearly.io`.

## What I can and cannot do

I can produce the fresh export, prepare the import scripts, and verify the app after rebinding. I cannot click Disconnect or authorize the connection to your Supabase account — both are human actions in the Lovable UI by a workspace admin.

## Recommended first step

Approve this plan and I will start with Phase 1: a fresh, complete export of the current backend, delivered as a downloadable zip with row counts.
