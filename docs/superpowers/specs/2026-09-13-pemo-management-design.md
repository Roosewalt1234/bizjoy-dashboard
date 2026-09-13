# PEMO Management & Expense Payment Tracking — Design

## Context

Follows the Ledger project-linking feature. Adds payment-method tracking to
Ledger expenses, and a brand-new "PEMO Management" module tracking spend on
the company's PEMO corporate cards — a completely separate system from the
Ledger, deliberately designed to also be written to automatically by an
external WhatsApp-parsing automation ("OpenClaw") that the user runs outside
this codebase.

PEMO (per the user, and https://www.pemo.io/) is a UAE/MENA corporate card
and spend-management platform: the company deposits funds into a PEMO
account, employees hold physical PEMO cards drawing from that account, and
each card swipe is a real-world transaction that needs recording.

## Goals

1. **Add Expense form**: capture how an expense was paid.
   - **Payment Type**: `Credit` or `Cash` (i.e. paid immediately vs. paid
     later).
   - **Payment Method** (only when Payment Type = `Cash`): `PEMO`,
     `Bank Transfer`, or `Cash`.
   - **Card/Employee** (only when Payment Method = `PEMO`): which of the
     configured PEMO cards was used.
   - This is Expense-only — Add Invoice (Income) is unaffected; "how we paid
     for something" isn't a meaningful concept for money coming in.
2. **PEMO Management**: a new page (child nav under Accounts, alongside
   Ledger and Outstanding Amounts) tracking:
   - **Balance**: total deposited into the PEMO account minus total spent
     across all cards.
   - **Transactions**: the spend log — date, amount, vendor/description,
     category, which card, and where the row came from (`manual` /
     `ledger` / `openclaw`).
   - **Deposits**: top-ups into the PEMO account.
   - **Cards**: the small list of 2-3 physical cards and which employee
     holds each.
3. **Linking**: saving an Expense with Payment Method = `PEMO` automatically
   inserts a matching row into the PEMO transaction log (so there's one entry
   point for a human filling out the Ledger, and the PEMO record stays in
   sync without manual double-entry).
4. **OpenClaw-friendly schema**: the PEMO transaction table must accept a
   row with minimal information (OpenClaw parses a WhatsApp message/invoice
   and may not always know the exact card or category) — most columns
   nullable, sensible defaults, no requirement that every insert come through
   the app's own form.

## Non-goals

- No new UI or automation is built for OpenClaw itself — that's the user's
  own external tool. This task only makes the schema simple enough for a
  direct Supabase insert to work.
- No changes to `contracts` (AMC) or `fm_contracts` (FM) — this feature is
  entirely within the shared `accounts_transactions` table plus three new,
  unrelated PEMO tables.
- No receipt/invoice image storage — the user explicitly did not ask for
  this (declined when offered during design).
- No enforcement that a `Credit` purchase must later be reconciled/paid back
  — not requested; only the Type/Method/Card fields described above.
- No new permission module — PEMO Management is gated the same way Ledger
  and Outstanding Amounts already are, under the existing `accounts` module
  permission.

## Data Model

### Modify `accounts_transactions`

```sql
alter table public.accounts_transactions
  add column payment_type text check (payment_type in ('Credit', 'Cash')),
  add column payment_method text check (payment_method in ('PEMO', 'Bank Transfer', 'Cash')),
  add column pemo_card_id uuid references public.pemo_cards(id);
```

**Migration ordering:** `pemo_cards` (below) must be created before this
`alter table` runs, since `pemo_card_id` references it — the implementation
plan sequences table creation before this alter accordingly. All three new
columns are nullable. The app enforces "Payment Method is
required when Payment Type is Cash" and "Card is required when Payment
Method is PEMO" at the form level, the same way `project_type`/`contract_id`
consistency is already enforced at the form level rather than via a
cross-column DB constraint (consistent with the existing Ledger feature).

### New tables

```sql
create table public.pemo_cards (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  employee_id uuid references public.employees(id),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.pemo_deposits (
  id uuid primary key default gen_random_uuid(),
  deposited_on date not null default current_date,
  amount numeric not null,
  note text,
  created_at timestamptz not null default now()
);

create table public.pemo_transactions (
  id uuid primary key default gen_random_uuid(),
  occurred_on date not null default current_date,
  amount numeric not null,
  description text,
  category text,
  card_id uuid references public.pemo_cards(id),
  source text not null default 'manual' check (source in ('manual', 'ledger', 'openclaw')),
  accounts_transaction_id uuid references public.accounts_transactions(id) on delete set null,
  created_at timestamptz not null default now()
);
```

- `pemo_cards.employee_id` is nullable (a card can exist unassigned).
- `pemo_transactions.card_id`/`category`/`description` are all nullable —
  this is the "OpenClaw-friendly" requirement: a bare `{amount, occurred_on}`
  insert is valid.
- `source` defaults to `'manual'` (someone using PEMO Management's own "Add
  Transaction" button); the app sets it to `'ledger'` when creating the
  linked row from an Expense save; OpenClaw is expected to set it to
  `'openclaw'` explicitly (not required — defaults to `'manual'` if
  omitted, which is an acceptable fallback, not a hard requirement on
  OpenClaw's insert).
- `accounts_transaction_id` uses `ON DELETE SET NULL`, not cascade: if the
  originating Ledger expense is later deleted, the real-world PEMO charge
  still happened, so the PEMO transaction record must survive — it just
  loses its back-reference.
- **Balance** = `sum(pemo_deposits.amount) - sum(pemo_transactions.amount)`,
  computed client-side (no stored running-balance column, avoiding a
  denormalized value that could drift — consistent with how Outstanding
  Amounts computes its totals client-side rather than storing them).
- No currency column anywhere here — always AED, matching the Ledger's
  existing convention.

### RLS / permissions

All three new tables get the same four policies as `accounts_transactions`
(`accounts_transactions_select/insert/update/delete`, gated on
`app_private.can(auth.uid(), 'accounts', <action>)`), applied per-table.
This is a straightforward extension of the existing `accounts` module — no
new module needed.

**For OpenClaw specifically**: it is not an app user, so it cannot hold an
`app_private.can()`-gated session unless the user provisions one. The
simplest path (mentioned to the user, not something this task builds) is
for OpenClaw to use the Supabase **service-role key**, which bypasses RLS
entirely — appropriate for a trusted server-side automation the user
controls, and requires no additional schema or policy work. If the user
later wants OpenClaw to authenticate as a real (lower-privilege) user
instead, that's a follow-up decision, not blocked by anything in this
schema.

## UI

### Add Expense dialog (`src/routes/_authenticated/accounts.tsx`)

Three new fields, inserted after Amount, shown only for the Expense flow
(Payment Type mapped to a new dialog title? No — dialog title stays as
today; these are just three additional fields appearing only when
`activeType === "Expense"`):

- **Payment Type** (Select: `Credit` / `Cash`, no default/blank until
  chosen — matches how `Project Type` defaults to `none` rather than
  pre-selecting one).
- **Payment Method** (Select: `PEMO` / `Bank Transfer` / `Cash`), rendered
  only when Payment Type = `Cash`.
- **Card** (Select, populated from `pemo_cards` where `active = true`,
  labeled with the card's `label` + assigned employee name), rendered only
  when Payment Method = `PEMO`.

Switching Payment Type away from `Cash` clears `payment_method` and
`pemo_card_id` in form state (same "switching a parent field clears its
dependent child" pattern already used for Project Type → Project).
Switching Payment Method away from `PEMO` clears `pemo_card_id` alone.

**On save**, if `payment_method === "PEMO"`, after the `accounts_transactions`
insert succeeds, insert one row into `pemo_transactions`:
```
occurred_on: <the expense's transaction_date>
amount: <the expense's amount>
description: <the expense's description>
card_id: <the expense's pemo_card_id>
source: "ledger"
accounts_transaction_id: <the newly-inserted accounts_transactions row's id>
```
(`category` is left null here — the Ledger form has no category concept for
this, matching the "not requested" scope; PEMO Management's own form can set
it directly for manually-entered or OpenClaw-tagged rows.)

Editing an existing expense does not attempt to re-sync or delete its linked
PEMO transaction — matching the Ledger's existing edit philosophy (Type and
Currency are also fixed at creation time, not re-derived on edit). This is
a deliberate scope limit: edit-time re-sync of a linked record is real
complexity (what if the amount changed? what if Payment Method changed away
from PEMO after a linked row already exists?) that wasn't asked for and
would need its own design if wanted later.

### PEMO Management page (new: `src/routes/_authenticated/pemo-management.tsx`)

- Balance summary: three stat cards (Total Deposited, Total Spent, Balance),
  matching the stat-card visual style already established on Outstanding
  Amounts / FM Contracts / FM Manpower.
- A **Cards** section: a small table of `pemo_cards` (label, assigned
  employee, active toggle) with add/edit — this is a short, low-volume list
  (2-3 rows), so a simple inline table with an "Add Card" button is enough,
  no need for the full pagination machinery used elsewhere.
- A **Deposits** section: a table of `pemo_deposits` with an "Add Deposit"
  button (date, amount, note).
- A **Transactions** section: the main spend log, with a Card filter, a
  Source badge (manual/ledger/openclaw, so it's visually obvious which rows
  came from automation vs. which were entered by hand), and an "Add
  Transaction" button for manual entries (source defaults to `manual`).

### Sidebar

`src/components/app-sidebar.tsx` — add a third child to the existing
"Accounts" group:
```ts
{ title: "PEMO Management", url: "/pemo-management", module: "accounts" },
```

## Error Handling

Same pattern as every other page in this codebase: `useQuery` failures show
a simple error state, form submission failures show `toast.error`. One
specific case worth naming: if the `accounts_transactions` insert succeeds
but the follow-up `pemo_transactions` insert fails, the Ledger entry still
exists (it already saved) but has no linked PEMO record — the save flow
should show a toast warning about this partial-success case (e.g. "Expense
saved, but the linked PEMO record failed — add it manually in PEMO
Management") rather than silently losing that information or rolling back
an already-successful Ledger save.

## Testing Approach

No test runner exists in this repo. Verification: `npx tsc --noEmit` clean,
plus manual verification via `npm run dev` — confirm the new Expense form
fields cascade correctly (Credit hides Payment Method entirely; Cash shows
Payment Method; PEMO shows Card), confirm saving a PEMO expense creates both
rows, confirm PEMO Management's balance math updates after adding a deposit
or transaction, and confirm a card marked inactive stops appearing in the
Expense form's Card dropdown but still displays correctly on old
transactions that reference it.
