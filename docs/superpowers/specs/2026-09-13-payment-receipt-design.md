# Payment Receipt — Design

## Context

The third and final piece of the original three-part Accounts ask from earlier
in this project ("child navigation items, payment receipt, invoicing, and
outstanding amounts") — Outstanding Amounts and the Ledger's project-linking
already shipped. This adds "Payment Receipt": recording money received from a
customer, either against a specific outstanding invoice/installment, or as an
advance payment against a quotation.

## Goals

A new **"Payment Receipt"** button on the Ledger page
(`src/routes/_authenticated/accounts.tsx`), alongside the existing "Add
Expense" / "Add Invoice" buttons, opening a modal with:

1. **Date**.
2. **Type**: `Against Invoice` or `Advance Payment`.
3. **If Against Invoice**: a dropdown of every currently outstanding
   (Due/Overdue, not yet received) payment-schedule row across BOTH
   `contract_payments` (AMC) and `fm_contract_payments` (FM) — the exact same
   combined dataset `src/routes/_authenticated/accounts-outstanding.tsx`
   already computes (contract name, AMC/FM type, due date, amount owed).
   Selecting one pre-fills Amount with the outstanding value (still editable,
   for partial payments).
4. **If Advance Payment**: a dropdown of every row in `quotes` (quote number,
   customer name, total) — no status filtering, per explicit instruction to
   list "all the quotations".
5. **Amount**, **Description** (optional).

**On save:**
- Always inserts one `Income`-type row into `accounts_transactions` (the
  Ledger), tagged with a new `receipt_type` (`'invoice'` or `'advance'`).
- **Against Invoice**: also sets the Ledger row's existing `project_type`/
  `contract_id` columns (reused from the earlier Ledger project-linking
  feature — no duplicate columns needed) from the selected schedule row's
  contract, plus a new `payment_schedule_id` pointing at exactly which
  installment was settled. Then **updates that `contract_payments` or
  `fm_contract_payments` row's `received_date`** to the receipt date — the
  same mechanism the AMC/FM contract pages already use to mark a payment
  received, so it disappears from Outstanding Amounts with no changes needed
  there.
- **Advance Payment**: sets a new `quote_id` reference instead. No
  payment-schedule row exists yet for an advance, so nothing gets marked
  received.

## Non-goals

- No changes to `contracts` (AMC) or `fm_contracts` (FM) themselves, or to
  `contract_payments`/`fm_contract_payments`'s schema — only their
  `received_date` column is written to, exactly as the existing AMC/FM
  contract pages already do when marking a payment received.
- No status filtering on the quotations list — "all the quotations" is taken
  literally.
- No Payment Method field (Bank Transfer/Cash/PEMO) on the receipt — not
  requested; that concept exists for how the business *paid* an expense, not
  how a customer *paid* the business, and adding it wasn't asked for.
- No changes to how `/accounts-outstanding` itself queries or displays data —
  it will simply reflect fewer rows once a receipt marks one received,
  automatically, since it already re-queries live.
- No enforcement/validation beyond what's described (e.g. no partial-payment
  tracking across multiple receipts against the same installment — a single
  receipt fully marks that installment received, matching the existing
  binary Due/Overdue/Received model already in place).

## Data Model

```sql
alter table public.accounts_transactions
  add column receipt_type text check (receipt_type in ('invoice', 'advance')),
  add column payment_schedule_id uuid,
  add column quote_id uuid references public.quotes(id);
```

- `receipt_type` — nullable; only set on rows created via this new Payment
  Receipt flow. Regular "Add Expense"/"Add Invoice" rows leave it null.
- `payment_schedule_id` — nullable, no FK constraint (polymorphic: refers to
  `contract_payments.id` when the row's existing `project_type = 'AMC'`, or
  `fm_contract_payments.id` when `project_type = 'FM'` — the same
  type-discriminator pattern already used for `contract_id` on this same
  table).
- `quote_id` — nullable, real FK to `quotes.id` (single-target, so a normal
  constraint applies here, unlike the polymorphic `payment_schedule_id`).

## UI

**Payment Receipt dialog** (new, in `accounts.tsx`):
- Date (required).
- Type: `Against Invoice` / `Advance Payment` (required, no default).
- If `Against Invoice`: a dropdown sourced from the same merged/filtered
  query Outstanding Amounts already runs (both payment tables, Due/Overdue
  only, joined to their contract for the label). Selecting a row captures
  its `id`, `project_type` (AMC/FM), `contract_id`, and `value`
  (pre-filling Amount).
- If `Advance Payment`: a dropdown of all `quotes` rows, labeled
  `{quote_number} - {customer_name} (AED {total})`.
- Amount (required, pre-filled when Against Invoice, always editable).
- Description (optional).

**On submit:**
1. Insert into `accounts_transactions`: `type: "Income"`, `currency: "AED"`,
   `transaction_date`, `amount`, `description`, `receipt_type`, and either
   (`project_type`, `contract_id`, `payment_schedule_id`) or (`quote_id`),
   depending on which type was chosen.
2. If `Against Invoice`: update the selected row in `contract_payments` (AMC)
   or `fm_contract_payments` (FM) — whichever table `project_type` indicates
   — setting `received_date` to the receipt's date.
3. If step 2 fails after step 1 succeeded, show a non-blocking warning toast
   (matching the same partial-failure pattern already established for the
   PEMO linking feature) rather than rolling back the already-saved Ledger
   entry.

The main Ledger list view is unaffected — a receipt is just another Income
row there, distinguishable only by its (currently undisplayed)
`receipt_type`/link fields, consistent with how PEMO-linked expenses aren't
specially called out in the Ledger's own list either.

## Error Handling

Same pattern as every other page in this codebase: `useQuery` failures show
inline messages, `toast.error` on save failures. The two-step save
(Ledger insert, then payment-schedule update) follows the exact
already-established partial-failure precedent from the PEMO linking work —
insert first, then best-effort follow-up update, warn (don't fail the whole
operation) if the follow-up fails.

## Testing Approach

No test runner exists in this repo. Verification: `npx tsc --noEmit` clean,
plus manual verification via `npm run dev` — confirm the outstanding-invoice
dropdown matches what Outstanding Amounts shows, confirm picking one
pre-fills Amount, confirm saving marks that row received (and it disappears
from Outstanding Amounts on refresh), confirm the Advance Payment path lists
all quotations and saves without touching any payment-schedule table.
