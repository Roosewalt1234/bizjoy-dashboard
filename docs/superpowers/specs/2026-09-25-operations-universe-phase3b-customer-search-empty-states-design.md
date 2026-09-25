# Operations Universe Phase 3b: Real Customer Node, Search Extension, Empty States — Design

## Context

A detailed "Phase 3" brief was received requesting real-data integration for the CONTRACTS
branch of Operations Universe (`/universe`). Before writing any code, this branch's current
state was verified against the brief's assumptions — and most of what the brief asks for
**already shipped in Phase 1**, before this session's Staff work (Phase 3a) began. Specifically,
already real and unchanged by this document:

- CONTRACTS hub → real AMC/FM categories with real counts → real contracts, each showing real
  work orders, PPM visits, payments, service reports, manpower (FM), and a timeline
- Clicking a work order makes it the real center with real contract/customer/technician/
  status/priority/scheduled-date/service-report data
- A work order's assigned technician already routes to the real `employee` CenterEntity that
  Phase 3a built out (real attendance, real assigned work orders)
- Canonical, typed node IDs (`contract:AMC:<id>`, `work-order:FM:<id>`, `employee:<id>`, ...)
  and `relationshipReason` on every edge (the "why is this connected?" feature)
- TODAY stays a static 3-node hub with no data fetch until a branch is opened
- Fully read-only, RLS-respecting (the existing `supabase` anon client), no service-role usage

**The brief's own stated Success Definition — Contract → Open Work Order → Assigned
Technician → Work Order → Contract, without leaving the Universe — already works on `main` as
of Phase 3a's merge.** This document covers only the genuine, verified gaps.

## Decisions already made (via user Q&A this session)

1. **No test infrastructure added.** This repo has no test runner (`package.json` has no
   `test` script, no vitest/jest dependency) — confirmed again for this phase. Verification
   stays `npx tsc --noEmit` + `npx eslint` + direct SQL cross-checks + manual click-through,
   matching every prior phase in this feature.
2. **No AMC/FM adapter-layer refactor.** The brief's §12 asked for named adapter functions
   (`getContractUniverseNode()`, etc.) replacing the inline `domain === "AMC" ? ... : ...`
   branching already used throughout `useUniverseNodes.ts`. That inline pattern was reviewed
   as sound during Phase 3a's final review and is unchanged working Phase 1 code — introducing
   a new abstraction now would be exactly the "unnecessarily refactor working functionality"
   the brief itself warns against elsewhere. Not done.
3. **A customer's ring shows their other real contracts** (both AMC and FM), not just a bare
   detail panel — using the exact same `contracts`/`fm_contracts` query pattern already used
   everywhere else in this file, not a new "Customer Universe."

## Confirmed schema facts (verified live against project `evcaehadjzoxtdlnmehk`, not assumed)

- **No per-work-order multi-technician table exists.** `select table_name from
  information_schema.tables where table_name ilike '%assign%'` returns only
  `contract_manpower_assignments` (FM-contract-level, already used, unrelated to individual
  work orders). Each work order has exactly one `technician_id` column. **A work order can
  only ever show one assigned technician** — the brief's §10 two-technician example
  (`WO-123 ↙↘ Shankar Sameer`) is not buildable from this schema. Flagged, not built.
- **`quotes` still has no FK to `contracts`/`fm_contracts`/`customers`** (confirmed again;
  same finding as Phase 3a's investigation). The brief's §5 "Quotation" relationship on a
  contract is not reliably buildable. Flagged, not built.
- **Real work order statuses are still just `Open`/`Completed`** (FM) and `Completed` (AMC, 1
  row total). §7's Open/Scheduled/In Progress/Completed distinction is not stored data — same
  finding as Phase 3a. Not addressed here (already-shipped Phase 1 work-order rings already
  bucket into pending/completed/cancelled via `groupKey`, which is the honest ceiling of what
  the stored status column supports).
- `pg_trgm` is enabled on this project (confirmed in Phase 3a's investigation), but Supabase-js
  has no first-class helper for trigram similarity search without a database RPC function. Per
  the brief's own §18 ("use existing query/search mechanisms... do not create unnecessary
  broad database scans"), adding a new RPC/database function is out of scope for this
  read-only phase. Search stays on the same `ilike` mechanism the existing contract/work-order
  search already uses — extended to two more tables, not upgraded to a new matching algorithm.

## What this document actually builds

### A. Contract's and work order's customer becomes a real, clickable node

`useUniverseNodes.ts:178-183` (inside `fetchContractConnections`) and `useUniverseNodes.ts:387-
393` (inside `fetchWorkOrderConnections`) both currently push a customer ring node with
`clickable: false` — just a label. Both become `clickable: true` with `center: { kind:
"customer", id: contract.customer_id }` (contract case) / `{ kind: "customer", id:
wo.customer_id }` (work-order case, once `customer_id` is added to that query's `select`).

A new `customer` CenterEntity variant is added: `{ kind: "customer"; id: string }`. A new
`fetchCustomerConnections(customerId)` function:
- Queries the `customers` row for real detail-panel fields.
- Queries `contracts` and `fm_contracts` where `customer_id = customerId`, building one
  clickable ring node per contract (`center: { kind: "contract", domain, id }`), reusing the
  existing contract ring-node shape.
- If neither query returns a row, the ring gets one empty-state leaf node (see section C).

`centerLabel`/`centerSublabel` come from the customer's `display_name`/`company_name`.
`centerDetail` surfaces whatever real fields the `customers` table has that make sense in a
context panel (display name, company name, email, phone, city — no billing/financial fields
beyond what's already shown elsewhere, since this phase doesn't add new financial UI).

`OperationsUniverse.tsx`'s `DETAIL_ENTITY_KINDS` gains `"customer"` so the context panel
auto-opens on navigating to a customer, matching contract/work-order/employee behavior.

### B. Real search: employees and customers, with debounce

`searchUniverse()` currently searches real `contracts`, `fm_contracts`, `work_orders`,
`fm_work_orders` via `ilike`, each `.limit(5)`. Two more blocks are added in the same style:

- `employees` where `status = 'Active'` and `full_name ilike %query%`, `.limit(5)`, routing to
  `{ kind: "employee", id, name, position }` — the same real employee entity the STAFF branch
  and work-order technician links already use.
- `customers` where `display_name ilike %query%` or `company_name ilike %query%`, `.limit(5)`,
  routing to the new `{ kind: "customer", id }`.

`UniverseSearch.tsx`'s `handleChange` currently calls `searchUniverse` on every keystroke with
no debounce. A 300ms debounce is added (the component already tracks a `requestIdRef` to
discard stale responses — that logic is kept as-is, the debounce is a separate `setTimeout`
gate in front of it, not a replacement for it).

### C. Empty-state leaf node for "no open work orders"

The brief's own acceptance journey (§28, Journey E) specifically tests: open a real contract
with no pending/open jobs, and confirm the Universe clearly shows there are none rather than
showing nothing. `fetchContractConnections` already buckets work orders into `groupKey:
"work-order-pending"` / `"work-order-completed"` / `"work-order-cancelled"`. After building
the ring, if no node has `groupKey === "work-order-pending"`, one synthetic non-clickable leaf
is pushed: `kind: "staff-detail"` (the existing generic "informational fact" leaf kind — Phase
3a already established this as a cross-domain informational node, not staff-specific in
practice; it's what renders an employee's attendance status today), `label: "No open work
orders"`, `groupKey: "work-order-pending"`.

The same mechanism is applied to `fetchCustomerConnections`'s contract ring: if a customer has
no real contracts in either domain, one leaf reads `"No contracts on file"`.

**Not built** (already handled correctly by existing code, verified rather than assumed): a
work order with no technician already skips the technician ring node entirely (`if
(wo.technician_name) { ... }` in `fetchWorkOrderConnections` — no node, no crash); a contract
with no `customer_id` already skips the customer ring node entirely. Neither needs new code —
"nothing shown" is already the correct behavior for those two cases specifically because
there's no there there, as opposed to "we looked and found zero" which is what the new leaf
nodes communicate for open work orders and customer contracts.

## Out of scope for this document (explicitly deferred, not silently dropped)

- Progressive disclosure / pagination for large contract categories (§4) — the current largest
  real category is AMC's 46 contracts, not "hundreds"; no pagination mechanism is built until
  a category's real count actually demands it.
- Payment status rollups (Paid/Pending/Overdue aggregation, §16) — individual payment nodes
  with real status already show on a contract; aggregating them into a summary is a Finance-
  adjacent enhancement the brief itself says not to let derail this phase.
- A browsable top-level Customers hub (distinct from reaching a customer via a contract) — not
  requested by this brief; if wanted later, it is a separate, larger design question (which
  customers to list — all 245, or only the ~47 with a real contract — already explored in an
  earlier, different sub-phasing proposal this session and left unresolved by the user).
- Schedules/PPM real-data integration — untouched, still demo, `(Example)` banner stays.
