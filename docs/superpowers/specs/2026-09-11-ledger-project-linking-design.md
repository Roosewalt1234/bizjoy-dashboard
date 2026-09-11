# Ledger Project Linking — Design

## Context

Follows directly from the just-shipped "Add Expense / Add Invoice" button split
on the Ledger page (`src/routes/_authenticated/accounts.tsx`). That change
replaced the single generic "Add" button with two preset-typed ones. This
spec replaces the Ledger form's remaining generic fields (`Category`,
`Currency`, the now-redundant `Type` selector) with a proper link from each
ledger entry to the AMC or FM contract it belongs to — or no contract at all,
for general expenses.

## Problem

The Ledger (`accounts_transactions`) currently has no way to associate an
income/expense entry with a specific project. `category` is a free-text field
that doesn't connect to anything. There is no column on `accounts_transactions`
referencing either `contracts` (AMC) or `fm_contracts` (FM) today.
`accounts_transactions` currently has 0 rows — no historical data to migrate
or preserve.

## Goals

- Every Ledger entry can optionally be tagged with a specific AMC or FM
  contract (project-level linking, not required — general expenses like rent
  or salaries have no project).
- The Add Expense / Add Invoice form: pick a Project Type (None / FM / AMC),
  and if FM or AMC is picked, a second dropdown appears listing that type's
  actual contracts.
- `Type` (Income/Expense) and `Currency` are no longer shown as form fields —
  `Type` is implied by which button was clicked (unchanged from the prior
  feature), `Currency` is always `AED`.
- The Ledger list view shows which project (if any) each entry belongs to,
  replacing the `Category`/`Currency` columns.

## Non-goals

- No changes to `contracts` (AMC) or `fm_contracts` (FM) themselves — this
  only adds a read-only reference *from* `accounts_transactions` *to* them.
  Confirmed no AMC table is modified anywhere in this feature.
- No enforcement/validation beyond what's described (e.g. no requirement that
  an Invoice-type entry must have a project, or that an Expense must not —
  the "optional" decision applies uniformly to both).
- No change to the Outstanding Amounts feature or `contract_payments`/
  `fm_contract_payments` — those remain the source of truth for payment
  schedules; the Ledger is a separate, general-purpose accounting record.
- No changes to the Projects page (`src/routes/_authenticated/projects.tsx`)
  or its use of `CrudModule` — it doesn't use the `addButtons` feature being
  reverted here (see below) and needs no changes.

## Data Model

Migration on `accounts_transactions` (currently 0 rows, so this is a clean
schema change with nothing to backfill):

```sql
alter table public.accounts_transactions
  drop column category,
  add column project_type text check (project_type in ('FM', 'AMC')),
  add column contract_id uuid;
```

- `project_type` — nullable. `NULL` means "no project" (a general expense).
- `contract_id` — nullable, no foreign key constraint. This is a
  polymorphic reference: when `project_type = 'FM'`, `contract_id` refers to
  `fm_contracts.id`; when `project_type = 'AMC'`, it refers to `contracts.id`.
  A single-target FK constraint isn't possible here since the target table
  varies by row. The application is responsible for joining against the
  correct table based on `project_type` — this is the same "type discriminator
  instead of a DB-level constraint" pattern this codebase already relies on
  elsewhere (e.g. `module_type` on the AMC `contracts` table itself).
- No RLS changes needed: `accounts_transactions`'s existing policies are
  gated on the `accounts` module permission and already cover the new
  columns, the same way `employees.staffing_model` needed no new RLS when it
  was added.
- **Known limitation, inherited, not fixed by this task:** populating the
  Project dropdown requires reading `contracts` and `fm_contracts`, both
  gated by the AMC "Contracts" module permission (`app_private.can(auth.uid(),
  'contracts', 'view')`), not `accounts`. A user with Accounts access but not
  Contracts access will see the Project Type selector but get an empty
  contract list when picking FM or AMC. This is the same pre-existing
  cross-module permission coupling already flagged during the Outstanding
  Amounts and HR "Assigned To" features — not something this task
  restructures.

## UI

**`src/routes/_authenticated/accounts.tsx` becomes a dedicated page component**
(no longer using the generic `CrudModule`), following the same shape as
`src/routes/_authenticated/hr.tsx` — its own `useQuery` for the transactions
list, its own `Dialog`/form state, its own `Table`. This is the right call
because a cross-field dependent dropdown (Project Type determines which
contract list to show) is domain-specific logic `CrudModule` shouldn't need
to know about; `CrudModule` stays a generic flat-field CRUD helper for pages
like Projects that don't need this.

**Two lookup queries**, fetched once and reused across both Add dialogs:
```ts
supabase.from("fm_contracts").select("id, title, contract_no, customer_name")
supabase.from("contracts").select("id, title, contract_no, customer_name")
```

**Form fields**, in order: Date (required, unchanged) → Project Type (Select:
`None` / `FM` / `AMC`, defaulting to `None`) → Project (Select, rendered only
when Project Type is `FM` or `AMC`; options are that type's contracts, label
formatted the same way the FM Manpower page already formats them —
`contract_no - customer_name`) → Description (textarea, unchanged) → Amount
(number, unchanged). No Type field (set via which button opened the dialog,
exactly as the prior feature already established) and no Currency field
(payload always sets `currency: "AED"`).

Switching Project Type away from `FM`/`AMC` back to `None` clears any
previously-selected `contract_id` in the form state, so a stale selection
can't silently survive a type change.

**List view**: replace the `Category`/`Currency` columns with a single
**Project** column — for a row with a `project_type`/`contract_id`, resolve
and show the contract's `contract_no`/`title` plus a small FM/AMC badge
(reusing the same badge-coloring convention as the Outstanding Amounts page:
blue for FM, purple for AMC); for a row with no project, show "—".

## Error Handling

Same pattern as every other page in this codebase: `useQuery` failures
surface via a simple error state in the table body; form submission failures
show a `toast.error`. Nothing about this feature needs bespoke error handling
beyond what `hr.tsx` and other dedicated pages already do.

## Cleanup

The `addButtons`/`AddButtonDef` addition made to `src/components/crud-module.tsx`
for the prior feature becomes dead code once the Ledger page stops using
`CrudModule` — it was added specifically for the Ledger's two-button need, and
`projects.tsx` (the only other `CrudModule` consumer) never used it. This
task reverts that addition, restoring `CrudModule` to its single-`Add`-button
form (as it was before the prior feature), so the shared component doesn't
carry unused surface area.

## Testing Approach

No test runner exists in this repo. Verification: `npx tsc --noEmit` clean,
plus manual verification via `npm run dev` — confirm both Add dialogs show
the new field order, confirm switching Project Type shows/hides/repopulates
the Project dropdown correctly, confirm a saved entry's project shows
correctly in the list (badge + contract name), and confirm a general expense
with Project Type left at `None` saves and displays with "—" in the Project
column.
