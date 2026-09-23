# Zoho Books quotes/estimates daily sync — design spec

Date: 2026-09-23
Status: Approved by user, ready for implementation planning
Repo: `bizjoy-dashboard` only

## Problem

Quotations are created in Zoho Books (org ID `850831183`, global/`zoho.com`
data center — confirmed against the user's own Zoho Books URL). Today
they only exist in the dashboard's `quotes`/`quote_items` tables as a
one-time historical import (170 of 171 existing rows already carry a
`zoho_quote_id`, and that column already has a unique constraint — clearly
built for exactly this purpose, but nothing keeps it updated). New quotes
created in Zoho Books, and changes to existing ones, never make it into
the dashboard's Sales → Quotes view. The user wants this kept in sync
automatically, three times a day (7:00, 13:00, 18:00 Gulf Standard Time),
including full line items.

Note on terminology: Zoho Books' API calls this document type
"**Estimate**" (`/books/v3/estimates`), even though the Zoho Books UI and
this dashboard both call it "Quote." This spec uses "quote" for the
dashboard side and "estimate" when specifically talking about the Zoho
Books API.

## Design

### 1. Where the sync runs

A new Supabase Edge Function, `zoho-books-quotes-sync`, does the actual
work — refreshing a Zoho OAuth token, paging through Zoho Books' Estimates
API, and upserting into `quotes`/`quote_items`. It's invoked by three
`pg_cron` jobs (7:00, 13:00, 18:00 GST — i.e. 03:00, 09:00, 14:00 UTC,
since `pg_cron` schedules run in UTC) that call it over HTTP via `pg_net`
(already available on this project, same as `pg_cron`). This mirrors the
architecture already built for the attendance auto-checkout job: Postgres
triggers the work on a schedule, the actual logic lives in
TypeScript/Deno rather than raw SQL, which is far more practical for
OAuth token handling, pagination, and JSON mapping than PL/pgSQL would be.

### 2. Zoho authentication (one-time setup, user's side)

Zoho's OAuth model requires a registered API client plus a long-lived
refresh token, generated once by the account owner:

1. In the [Zoho API Console](https://api-console.zoho.com) (for the
   `zoho.com` data center), register a **Self Client** (simplest option
   for a server-to-server, no-user-interaction integration like this).
2. Generate a grant token scoped to `ZohoBooks.estimates.READ` — read-only,
   since this integration never writes back to Zoho.
3. Exchange that grant token for a refresh token (one-time, via a single
   API call — exact command given in the implementation plan).
4. The resulting **Client ID**, **Client Secret**, and **Refresh Token**
   are stored as Supabase Edge Function secrets (`supabase secrets set`),
   never committed to the repo, never exposed to the frontend.

The Edge Function exchanges the refresh token for a short-lived access
token (~1 hour) at the start of every sync run — refresh tokens for Self
Clients don't expire under normal use, so this is a one-time setup, not a
recurring task.

### 3. What gets synced, and how it maps

For each Zoho Books estimate, the sync upserts one `quotes` row (matched
on `zoho_quote_id`, which already has a unique constraint) and replaces
that quote's `quote_items` rows entirely:

| `quotes` column | Zoho Books estimate field |
|---|---|
| `zoho_quote_id` | `estimate_id` |
| `zoho_customer_id` | `customer_id` |
| `quote_number` | `estimate_number` |
| `quote_date` | `date` |
| `expiry_date` | `expiry_date` |
| `customer_name` | `customer_name` |
| `status` | `status` (lowercased, to match the existing funnel-stage mapping already in `sales.tsx`) |
| `subtotal` | `sub_total` |
| `total` | `total` |
| `vat_amount` | `tax_total` |
| `currency` | `currency_code` |
| `terms` | `terms` |
| `purchase_order` | `reference_number` |
| `notes` | `notes` |

`quote_items` rows (one per Zoho line item, `sort_order` following the
order Zoho returns them in):

| `quote_items` column | Zoho Books line item field |
|---|---|
| `description` | `name` + `description` (combined if both present) |
| `quantity` | `quantity` |
| `unit_price` | `rate` |
| `amount` | `item_total` |

**Open item to confirm during implementation:** a couple of dashboard
columns (`salesperson`, `subject`, `project_name`) don't have an obvious
standard Zoho Books estimate field — Zoho Books' schema is invoice/
accounting-oriented, not a CRM-style opportunity record, so these may not
exist on the Zoho side at all. This gets confirmed against one real
`GET /books/v3/estimates/{id}` response early in implementation rather
than guessed here; if no matching Zoho field exists, those columns are
simply left untouched by the sync (not overwritten with nulls).

**Fields the sync never touches:** `probability` and `quote_type` are set
manually by the sales team in this dashboard and have no Zoho equivalent.
The upsert explicitly lists which columns it writes — it never does a
blanket "overwrite the whole row," so these two columns (and anything
else not in the mapping table above) are preserved exactly as staff left
them, on every sync run, forever.

### 4. Sync mechanics

- **Listing:** `GET /books/v3/estimates?organization_id=850831183`,
  paginated (Zoho returns ~200 per page with a `page_context` cursor).
- **Detail (for line items):** `GET /books/v3/estimates/{estimate_id}?organization_id=850831183`
  per estimate — the list endpoint alone doesn't include line items.
- **Rate limiting:** Zoho Books' standard API limits comfortably cover
  ~171 estimates × 1 detail call, three times a day. The function should
  still add a small delay between requests as a courtesy and to avoid
  transient 429s, and retry once on a rate-limit response.
- **Failure visibility:** since this runs unattended, a new
  `zoho_sync_log` table records each run (timestamp, quotes synced,
  quotes failed, error summary if any) so a broken sync is visible on the
  dashboard rather than silently going stale. A future task could surface
  this on a settings/admin page; this spec just ensures the data exists.

### 5. What does NOT change

- No write-back to Zoho Books — this is strictly one-directional
  (Zoho → dashboard).
- Quotes/quote items are never deleted by the sync, even if they
  disappear from Zoho's results (confirmed with user — "just keep
  last-known data").
- `probability` and `quote_type` (and any other dashboard-only field) —
  never overwritten.
- The existing Sales page funnel/Quotes list UI (`sales.tsx`) — it already
  reads from `quotes`/`quote_items`, so synced data shows up there
  automatically with no UI changes needed.
- The existing one-time-imported 170 quotes — the sync's upsert-on-
  `zoho_quote_id` means these get updated in place with fresh data, not
  duplicated.

## Verification plan

- `npx tsc --noEmit` / Edge Function typecheck after each change.
- A manual, one-off invocation of the Edge Function (before wiring up the
  cron schedule) against the real Zoho Books account, checking: the
  correct number of quotes appear/update in `quotes`, line items appear
  correctly in `quote_items`, a spot-checked quote's `probability`/
  `quote_type` (if already set) are unchanged after the sync, and the
  `zoho_sync_log` row for that run shows success.
- Confirm the three `pg_cron` schedules register correctly at the right
  UTC times (`select * from cron.job;`).
- Live DB: after the first scheduled run actually fires, spot-check that
  a known Zoho estimate's data landed correctly end-to-end.
- Disclose to the user: full end-to-end proof against their real,
  populated Zoho Books account can only be done once their API
  credentials exist — this can't be simulated or faked in advance.
