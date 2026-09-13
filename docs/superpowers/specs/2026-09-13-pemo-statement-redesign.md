# PEMO Statement Redesign — Design

## Context

A follow-up revision to the just-shipped PEMO Management feature, based on direct
user feedback after using it:

1. PEMO should be a first-class Payment Type on expenses (alongside Credit and
   Cash), not nested two levels deep under Cash → Payment Method.
2. PEMO Management should read like an actual account statement (date,
   description, card, credit, debit, running balance, invoice reference) —
   not two separate "Deposits" and "Transactions" tables.
3. Manual transaction creation is removed entirely — a `pemo_transactions` row
   should only ever come from a linked Ledger expense or from OpenClaw.
4. Card management moves behind a "Manage Addon Cards" button/modal (renamed
   from "Add Card"), which shows the existing cards with edit/delete inline,
   not just a bare add form.

## Goals

### 1. Add Expense — flatten Payment Type

Payment Type becomes three flat options: `Credit`, `Cash`, `PEMO`.

- `Credit` → nothing further (unchanged).
- `Cash` → shows Payment Method: `Bank Transfer` or `Cash` (PEMO removed from
  this list, since it now lives one level up).
- `PEMO` → shows the Card dropdown immediately — no intermediate Payment
  Method step. On save, `payment_method` is still stored as `"PEMO"` for
  reporting consistency (the existing `payment_method` check constraint
  already permits this value; nothing there needs to change), it's just no
  longer a separate user-facing choice when Payment Type is already PEMO.

### 2. `accounts_transactions.payment_type` — widen the allowed values

```sql
alter table public.accounts_transactions drop constraint accounts_transactions_payment_type_check;
alter table public.accounts_transactions add constraint accounts_transactions_payment_type_check
  check (payment_type in ('Credit', 'Cash', 'PEMO'));
```

### 3. `pemo_transactions` gains `invoice_ref`

```sql
alter table public.pemo_transactions add column invoice_ref text;
```

Nullable, no default — same "OpenClaw-friendly" reasoning as every other
optional column on this table: it's the field OpenClaw fills in when it
captures a real invoice/receipt reference from the parsed WhatsApp message,
but nothing requires it.

### 4. PEMO Management — one unified statement, not two tables

Replace the separate "Deposits" table and "Transactions" table with a single
chronological statement, merging both sources:

| Date | Description | Card | Credit | Debit | Balance | Invoice Ref |
|---|---|---|---|---|---|---|

- A deposit row shows its amount under **Credit**, blank **Card**, blank
  **Invoice Ref** (deposits aren't invoice-backed).
- A transaction row shows its amount under **Debit**, its card's label under
  **Card**, and its `invoice_ref` if set.
- **Balance** is a running total: sorted oldest-first internally to compute
  each row's balance-as-of-that-point (`running += credit - debit`), then the
  whole list is reversed for display so the newest entry is on top — the
  same technique consumer banking apps use (compute forward, display
  backward).
- Each row keeps Edit/Delete actions, routed to the correct underlying table
  (`pemo_deposits` or `pemo_transactions`) based on which kind of row it is.
  Editing a transaction is how category/invoice-ref get filled in after the
  fact on an OpenClaw- or Ledger-created row — there's no separate "create"
  path for transactions anymore.
- The existing Card filter is kept, now filtering the statement to just that
  card's debit rows (deposits have no card, so they drop out of a
  card-filtered view — expected, since the filter is answering "what did
  this card spend on", not "what's the account's full activity").

### 5. Remove manual transaction creation

- The "Add Transaction" button and its create flow are removed entirely.
- The underlying Edit-transaction dialog stays (for the reasons above) —
  only the "Add" entry point goes away. `saveTx` becomes update-only.

### 6. "Manage Addon Cards"

- The page-level "Add Card" button is renamed **"Manage Addon Cards"** and
  now opens a modal containing the *existing* cards list (label, employee,
  active, Edit/Delete per row) — i.e. what used to be the inline "Cards"
  section on the page body moves inside this modal.
- Inside that modal, a small "+ Add Card" button opens the same create/edit
  card form as a nested dialog (the existing `CardDialog` pattern), just
  reached from within the manager modal instead of directly from the page.
  Nested dialogs are already an established pattern in this exact file (the
  delete-confirmation `AlertDialog` already nests inside the main `Dialog`
  for every resource on this page).

## Non-goals

- No changes to the linking logic itself (a PEMO expense still creates
  exactly one `pemo_transactions` row with `source: "ledger"`) — only how
  the Payment Type field that triggers it is presented.
- No changes to `contracts`/`fm_contracts` or any AMC-specific code.
- No new balance-reconciliation logic beyond the running-balance column
  itself — this is a display, not an accounting engine.

## Testing Approach

No test runner exists in this repo. Verification: `npx tsc --noEmit` clean,
plus manual verification via `npm run dev` — confirm Payment Type shows all
three flat options and PEMO reveals Card directly; confirm the statement
merges deposits and transactions correctly with a sane running balance;
confirm there's no way to manually create a transaction; confirm "Manage
Addon Cards" opens the cards list with working edit/delete/add-nested-dialog.
