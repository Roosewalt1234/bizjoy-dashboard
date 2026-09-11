# Outstanding Amounts — Design

## Context

This is the first of three planned additions to the Accounts section (Outstanding
Amounts, Payment Receipt, Invoicing), scoped and built separately since they sit
at very different levels of maturity:

- **Outstanding Amounts** (this spec): combines data that already exists on both
  the AMC and FM sides into one read-only report. No new tables.
- **Payment Receipt** (future): today, "receiving a payment" is just editing a
  `received_date` field buried inside the AMC/FM contract's own edit dialog —
  there's no receipt number or dedicated recording flow anywhere. Out of scope
  here.
- **Invoicing** (future): FM already has a mature feature for this
  (`/fm-invoice-packs`, backed by `invoice_packs`/`invoice_pack_items`, FK'd to
  `fm_contracts`). AMC has no equivalent — AMC contracts have no line-item
  billing at all (confirmed: "when AMC contract is selected, there is no
  billing" — AMC just has the flat payment-schedule rows described below). Out
  of scope here.

## Problem

There is currently no single place to see which invoices/payments are
currently due or overdue across the whole business. The data exists — split
across two parallel, structurally-identical tables:

- `contract_payments` — the AMC payment schedule. FK's `contract_id` →
  `contracts.id` (AMC). Columns: `payment_date`, `value`, `received_date`,
  `status`. Currently 114 rows: 16 Overdue, 8 Due, 45 Received, 45 Not Yet Due.
- `fm_contract_payments` — the FM payment schedule, identical shape. FK's
  `contract_id` → `fm_contracts.id` (FM). Currently 0 rows (no FM contract has
  had its payment schedule populated yet).

Both sides already compute a live Due/Overdue/Received/Not-Yet-Due status from
`payment_date`/`received_date` rather than trusting the stored `status` column
verbatim — `computeStatus` in `src/components/contracts-page.tsx:163-172` (AMC,
not exported) and `computePaymentStatus` in
`src/features/fm-contracts/fm-contracts-api.ts:59-68` (FM, exported) are
identical implementations:

```ts
function computeStatus(payment_date: string, received_date: string): string {
  if (received_date) return "Received";
  if (!payment_date) return "Not Yet Due";
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const target = new Date(payment_date); target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today.getTime() - target.getTime()) / 86400000);
  if (diffDays <= 0) return "Not Yet Due";
  if (diffDays <= 15) return "Due";
  return "Overdue";
}
```

"Outstanding" for this feature means exactly the rows this function would
classify as `"Due"` or `"Overdue"` — i.e. `received_date` is empty and
`payment_date` is more than 0 days in the past. This must reuse this exact
threshold (0 days = not yet due, 1–15 days = Due, 16+ = Overdue) so the badges
mean the same thing as everywhere else in the app — not a new definition.

## Goals

- One page showing every outstanding (Due or Overdue) payment across both AMC
  and FM contracts, sorted by urgency.
- Summary totals at a glance (total outstanding, overdue amount, due amount).
- Filterable by type (All / FM / AMC), exportable to spreadsheet, matching
  existing list-page conventions in this codebase.
- Restructure the "Accounts" sidebar entry into a collapsible group so this
  new page has a natural home, and future siblings (Payment Receipt,
  Invoicing) can be added later without another nav restructure.

## Non-goals

- No "mark as received" action on this page — purely a visibility report.
  Recording a payment stays exactly where it is today (inside the AMC/FM
  contract edit dialogs) until the Payment Receipt feature is designed.
- No new database tables or columns. This reads existing data only.
- No changes to `contracts`, `contract_payments`'s AMC-side write paths, or
  any AMC-specific file — this feature only *reads* `contract_payments` (a
  SELECT, no writes), consistent with the standing rule that AMC data is
  never modified. `fm_contract_payments`/`fm_contracts` are FM-only tables
  (confirmed via FK inspection) and are also only read, not written, here.
- No change to how AMC or FM contract pages themselves display payments —
  they keep their own local `computeStatus`/`PaymentDueBadge` as-is.

## Data Model

No schema changes. Two read queries, run in parallel:

```ts
// AMC
supabase.from("contract_payments")
  .select("id, contract_id, payment_date, received_date, value, contracts:contract_id(title, contract_no, customer_name)")

// FM
supabase.from("fm_contract_payments")
  .select("id, contract_id, payment_date, received_date, value, fm_contracts:contract_id(title, contract_no, customer_name)")
```

Each result set is tagged with its type (`"AMC"` or `"FM"`) client-side, then
both are filtered to rows where `received_date` is empty and `payment_date` is
strictly before today (the exact condition `computeStatus`/`computePaymentStatus`
would classify as `"Due"` or `"Overdue"`), merged into one array, and each row's
status label is computed with the same date-diff logic shown above (this page
defines its own local copy, matching this codebase's existing convention of
duplicating this exact small function per file — `contracts-page.tsx` and
`fm-contracts-api.ts` already each have their own copy rather than sharing one).

## UI

**New route:** `src/routes/_authenticated/accounts-outstanding.tsx`

- Three stat cards at the top, matching the stat-card style already used on
  `src/components/contracts-page.tsx` and
  `src/features/fm-contracts/fm-contracts-list.tsx`:
  - **Total Outstanding** — count + summed `value` of every outstanding row.
  - **Overdue** — count + summed `value` of rows classified `"Overdue"`.
  - **Due** — count + summed `value` of rows classified `"Due"`.
  - Amounts are formatted as `AED {value.toLocaleString()}` (no existing
    shared currency-formatting helper was found to reuse — `money()` in
    `src/lib/fm-invoice.ts` is just a `Number(value) || 0` coercion, not a
    display formatter, so this page formats amounts inline rather than
    pretending to reuse something that isn't actually a formatter).
- A **Type** filter (`All` / `FM` / `AMC`), defaulting to `All`.
- An `ExportMenu` (existing shared component) for a spreadsheet export of the
  currently-filtered rows.
- A table with columns: **Type** (badge, "FM" or "AMC"), **Contract /
  Customer** (`contracts.title` or `fm_contracts.title`, with
  `customer_name` as a secondary line — same pattern as the contract-no /
  customer-name display already used in `fm-manpower.tsx`'s contract
  dropdown), **Due Date** (`payment_date`), **Days Since Due** (computed, `diffDays` from
  the status function — always a positive integer here since day-0-and-earlier
  rows are excluded as not-yet-due; a "Due" row might show e.g. "5", an
  "Overdue" row might show "22" — the label is "Days Since Due" rather than
  "Days Overdue" specifically because it's shown for both statuses, not only
  the overdue ones), **Status** (badge: "Due" in one color,
  "Overdue" in another — reusing the same two-color convention as the
  existing `PaymentDueBadge` components, redefined locally here rather than
  imported, consistent with those two existing copies), **Amount**.
- Sort order: `"Overdue"` rows first (most days overdue first), then
  `"Due"` rows (soonest due date first) — an aging-list convention, most
  urgent first.
- No row actions. No pagination for v1 given current volume (24 outstanding
  rows today across both tables combined) — if this becomes a concern later
  as data grows, pagination can be added the same way `PaginationBar` is used
  elsewhere in this codebase; not needed now.

**Nav change:** `src/components/app-sidebar.tsx` — convert the flat `Accounts`
entry into a collapsible group (matching the existing `AMC Contracts` / `FM
Projects` pattern):

```ts
{
  title: "Accounts",
  url: "/accounts",
  icon: Wallet,
  module: "accounts",
  children: [
    { title: "Ledger", url: "/accounts", module: "accounts" },
    { title: "Outstanding Amounts", url: "/accounts-outstanding", module: "accounts" },
  ],
},
```

The existing `/accounts` route/page is untouched other than this nav-label
change (it keeps its own URL and content — "Ledger" is only how it's labeled
in the sidebar sub-item).

## Permissions

The new route is gated the same way every other page in this sidebar is: the
`module: "accounts"` entries above mean the page only appears for users with
`accounts` view permission, and the page component should itself rely on the
existing RLS policies on `contract_payments`/`fm_contract_payments` (no new
grants needed — reading, not writing).

**Known limitation, inherited, not fixed by this task:** `contract_payments`
and `fm_contract_payments` are both currently gated by RLS on the `contracts`
module permission (`app_private.can(auth.uid(), 'contracts', 'view')`), not
`accounts`. A user who has `accounts` view but not `contracts` view will see
this new page render successfully but with zero rows (RLS silently returns no
rows, not an error) rather than an explicit permission message. This is the
same class of pre-existing cross-module permission coupling already noted
during an earlier feature's review (HR's "Assigned To" column reading
`contract_manpower_assignments`, gated by the same `contracts` permission).
Not something this task will restructure — flagging it here so it isn't
mistaken for a new bug if it comes up during testing.

## Error Handling

Standard pattern already used throughout this codebase: `useQuery` failures
surface via whatever this page's loading/error state renders (a simple
"Could not load outstanding amounts" message), consistent with how
`src/routes/_authenticated/hr.tsx` and other list pages already handle query
errors. Nothing outstanding-amounts-specific needs new error handling — the
two source queries are plain reads with no side effects to roll back.

## Testing Approach

No test runner exists in this repo (consistent with every prior feature).
Verification: `npx tsc --noEmit` clean, plus manual verification via
`npm run dev` — confirm the stat cards, filter, table, sort order, and export
all behave as described, and confirm the page reflects live data changes made
on the AMC/FM contract pages' payment schedules (e.g. marking a payment
received there should make it disappear from this list on refresh).
