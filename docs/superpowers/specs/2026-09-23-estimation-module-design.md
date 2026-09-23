# Estimation module — design spec

Date: 2026-09-23
Status: Approved by user, ready for implementation planning
Repo: `bizjoy-dashboard` only

## Problem

Cost estimation for variation/AMC jobs currently happens entirely outside the
dashboard, in a manually-maintained Excel sheet per job (see
`docs/superpowers/specs/2026-09-23-zoho-books-quotes-sync-design.md`'s
companion analysis of a real example, `FF-VAR26-192`). That sheet computes,
per line item, a cost buildup — material cost marked up, labor hours × a
flat rate, subcontractor cost marked up, then overhead added on top — and
the estimator manually transcribes the resulting numbers into a client
quotation. The dashboard already has a full quote creation flow
(`QuoteDialog` in `sales.tsx`, backed by `quotes`/`quote_items`) that
produces exactly that client-facing document, but nothing feeds it except
manual typing — there's no digitized version of the cost-buildup step.

## Design

### 1. Two new tables, mirroring `quotes`/`quote_items`

**`estimates`** (header, one row per job estimate):

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, pk | |
| `lead_id` | uuid, references `sales_leads(id)` | required — every estimate starts from a picked lead, same as quote creation already requires |
| `customer_name` | text | copied from the lead at creation time, same denormalization pattern `quotes.customer_name` already uses |
| `estimate_number` | text | free-text, auto-suggested via `next_doc_no('estimate')` (new kind, new `estimate_no_seq`, format `EST-0001`) but editable, matching how `quote_number` already works |
| `estimate_date` | date | |
| `status` | text | `'Draft'` or `'Converted'` |
| `quote_id` | uuid, references `quotes(id)`, nullable | set once converted; drives the read-only state |
| `notes` | text | |
| `created_at` / `updated_at` | timestamptz | |

**`estimate_items`** (lines, one row per cost-buildup line):

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, pk |
| `estimate_id` | uuid, references `estimates(id)` on delete cascade |
| `sort_order` | integer |
| `description` | text |
| `material_cost` | numeric, default 0 | "MC" in the sheet |
| `material_markup_pct` | numeric, default 15 | editable per line (sheet's 15%/10% become a single editable field, not two parallel columns — see §5) |
| `labor_hours` | numeric, default 0 |
| `labor_rate` | numeric, default 25 | editable per line |
| `subcontractor_cost` | numeric, default 0 |
| `subcontractor_markup_pct` | numeric, default 15 |
| `apply_overhead` | boolean, default true | unchecked automatically defaults for a line that's pure subcontractor cost (mirrors the sheet's actual behavior of skipping OH on subcontracted lines), but is a real checkbox the user can override either way |
| `overhead_pct` | numeric, default 25 |
| `sell_amount` | numeric | the computed result (see §2), stored like `quote_items.amount` already is — written by the app on save, not a generated SQL column, matching this codebase's existing convention of computing client-side then persisting the result |

### 2. The computation (per line, live in the UI)

```
material_sell = material_cost × (1 + material_markup_pct / 100)
labor_sell    = labor_hours × labor_rate
subcont_sell  = subcontractor_cost × (1 + subcontractor_markup_pct / 100)
line_subtotal = material_sell + labor_sell + subcont_sell
sell_amount   = apply_overhead
                  ? line_subtotal × (1 + overhead_pct / 100)
                  : line_subtotal
```

This is the exact formula chain already in the Excel sheet
(`E=D×115%`, `H=G×25`, `J=I×115%`, `K=E+H+J`, `M=K×125%`), just computed
live as the user types instead of via spreadsheet formulas. The estimate
total is `subtotal = Σ sell_amount`, `vat = subtotal × 5%`,
`grand_total = subtotal + vat` — identical shape to how `QuoteDialog`
already computes its own subtotal/VAT/grand total from `quote_items`.

### 3. Convert to Quote

A "Convert to Quote" button on a `Draft` estimate:

1. Creates one `quotes` row: `customer_name`/project info copied from the
   estimate's linked lead (same prefill `PickLeadForQuoteDialog` already
   produces for a manually-created quote), `quote_date` = today,
   `status` = `'Pending Quotation'`.
2. Creates one `quote_items` row per estimate line: `description` copied
   as-is, `quantity = 1`, `unit_price = sell_amount`, `amount =
   sell_amount`. The cost breakdown (material/labor/subcontractor/markup/
   overhead) never appears on the quote — only the final sell price, exactly
   as today.
3. Sets the estimate's `status = 'Converted'` and `quote_id` to the new
   quote's id.
4. Opens the newly-created quote in the existing `QuoteDialog` (not
   view-only) so the user can adjust customer details, dates, terms, or
   line wording before actually saving/sending it — the estimate hands off
   a fully-priced starting point, not a locked final document.

A `Converted` estimate becomes read-only and shows a link to the quote it
produced. There's no "un-convert" — if a job needs re-pricing later, the
user starts a fresh estimate (avoids re-conversion edge cases like a quote
that's since been edited independently).

### 4. Where it lives

A third tab on the existing Sales page (`sales.tsx`), next to "Sales
Funnel" and "Quotes" — labeled "Estimates". Same page shell, same
`sales` module permission (no new permission), same table/dialog visual
conventions already established on that page (the existing `QuoteDialog`'s
layout is the direct visual reference for the new estimate dialog).

### 5. What does NOT change

- The client-facing quote format (`quotes`/`quote_items`, `QuoteDialog`,
  the Zoho Books sync) — completely untouched. Estimates are a new step
  *before* quote creation, not a replacement for any part of it.
- The sheet's twin side-by-side margin-scenario columns (15% vs. 10%
  compared at once) are **not** replicated as two parallel totals — per
  the user's own explicit choice, each line has one editable markup field
  instead, since per-line flexibility already covers the "try a different
  number" use case without maintaining two live totals in the UI.
- No changes to `sales_leads`, `customers`, or any other existing table.

## Verification plan

- `npx tsc --noEmit` after each change.
- Live DB: confirm the new tables/columns match this spec exactly, confirm
  `next_doc_no('estimate')` produces `EST-0001`-style output and increments
  correctly across repeated calls.
- Manual: create a test estimate from a real lead, enter the exact FF-VAR26-192
  line-4 numbers (MC 1900, 48 labor hrs, 15% material markup, 25% overhead)
  and confirm the computed `sell_amount` matches the sheet's own result
  (AED 4,231.25) exactly. Convert it to a quote and confirm the resulting
  `quote_items` row has `unit_price = 4231.25` and the cost inputs are
  nowhere visible on the quote. Clean up the test estimate/quote/lead
  afterward.
