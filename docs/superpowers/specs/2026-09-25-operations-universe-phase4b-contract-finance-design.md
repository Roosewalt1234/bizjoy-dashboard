# Operations Universe Phase 4b: Contract Financial Position — Design

## Context

Phase 4a (real Schedules/PPM) is approved and unchanged by this document. This is Phase 4b:
making a real contract answer four questions using real data — what is it worth, what have we
received, what's outstanding, what's overdue — plus the next payment due, all read-only.

## Decisions carried forward from earlier this session (not re-litigated here)

- **No AMC/FM adapter-layer refactor.** The existing inline `domain === "AMC" ? ... : ...`
  branching throughout `useUniverseNodes.ts` stays the established pattern (confirmed sound in
  Phase 3a/4a reviews); this document's new fetchers follow the same style.
- **No filter-tab UI.** "FINANCE"/"OPERATIONS" as tabs that filter in place was explicitly
  declined for Phase 4 in favor of drill-down nodes reusing the existing click-to-recenter
  model — this document follows that same pattern.
- **No separate "Due" category.** FINANCE exposes Received / Outstanding / Overdue (the last
  only when non-zero) plus a direct link to the next unpaid payment — matching the brief's own
  worked example (§5) rather than the fuller four-way split mentioned elsewhere in the brief.
- **The contract's ring stops listing individual payments directly** (Phase 1 behavior) and
  gains one "FINANCE" summary node instead, per the brief's own progressive-disclosure
  instruction (§6).

## Financial definitions (established, not invented)

**This codebase already computes payment status in three places** — `computeStatus` in
`src/components/contracts-page.tsx:163-172`, `computePaymentStatus` in
`src/features/fm-contracts/fm-contracts-api.ts:61-70`, and `classifyPayment` in
`src/routes/_authenticated/accounts-outstanding.tsx:34-45` (whose own comment says it mirrors
the other two). All three compute the same real vocabulary **dynamically from `payment_date`/
`received_date`, ignoring the stored `status` column** (which goes stale after creation):

```
if (received_date) → "Received"
else if (!payment_date) → "Not Yet Due"
else diffDays = round((today - payment_date) / 86400000)
     diffDays <= 0  → "Not Yet Due"
     diffDays <= 15 → "Due"
     else           → "Overdue"
```

This document reuses this exact logic — not a new formula — for both AMC (`contract_payments`)
and FM (`fm_contract_payments`), which are structurally identical tables:
`id, contract_id, payment_date, value, status, received_date, sort_order, created_at`. Neither
table has a `reference`, `payment_method`, or VAT column — those fields from the brief's wish
list (§7) are simply not available data and are left out, not fabricated.

| Metric | AMC | FM | Source |
|---|---|---|---|
| **Contract Value** | `contracts.value` | `fm_contracts.value` | Sole source — no amendment/addendum/revision table exists in this schema (re-confirmed). |
| **Received** | sum of `contract_payments.value` where `received_date` is set | same, `fm_contract_payments` | Real, not derived from the stale `status` column. |
| **Outstanding** | sum of `value` where `received_date` is NOT set (every non-received row, regardless of timing) | same | Everything not yet received — "Not Yet Due" + "Due" + "Overdue" combined. Always shown, even AED 0. |
| **Overdue** | sum of `value` where the computed status is "Overdue" | same | A subset of Outstanding. Only shown as a ring node when > 0 (per the brief's §18 empty-state rule). |
| **Next Payment** | earliest un-received row with a `payment_date` set (same approach as this codebase's existing `nextPaymentInfoByContract`, `contracts-page.tsx:329-340`) | same | Only shown when one exists. |

**VAT**: `contracts`/`fm_contracts` do have a `vat_percent` column — confirmed **NULL on all 46
real AMC contracts and the 1 real FM contract**. It cannot be used to determine whether stored
values are VAT-inclusive or exclusive. All figures in this document are treated as opaque
totals exactly as stored, with no VAT adjustment attempted — this is a real, reported
limitation, not a guess.

**Mathematical invariant check** (per the brief's explicit request, §20): "Received + Remaining
≈ Contract Value" holds within AED 1 for 41 of 44 real AMC contracts with both a value and
payments — 2 contracts have a payment schedule that sums to *more* than the contract value, 4
sum to *less*. **This is not enforced as a hard rule** — it's reported as a soft tendency, not
asserted or corrected. Anomaly checks otherwise came back clean: 0 negative values, 0 zero
values, 0 duplicate payment rows across all 120 real AMC payments.

**FM reality check**: `fm_contract_payments` has **zero rows**, and the one real `fm_contracts`
row has `value = NULL`. FM's Financial Position will always show a genuine, honest empty state
right now — same asymmetry pattern as every other real-data branch built this session.

## Architecture

Three new `CenterEntity` variants, following the established "hub → category → item" shape
already used for Schedules (Phase 4a) and Contracts (Phase 1):

```ts
| { kind: "contract-finance"; domain: ContractDomain; id: string }   // id = contractId
| { kind: "payment-category"; domain: ContractDomain; contractId: string; category: "received" | "outstanding" | "overdue" }
| { kind: "payment"; domain: ContractDomain; id: string }
```

A shared pure function `summarizePayments(payments: {value, paymentDate, receivedDate}[])`
computes `{received, outstanding, overdue, nextPayment}` from a raw payment array using the
formula above — used both by the contract's ring (reusing data it already fetches) and by the
`contract-finance` screen (its own fresh fetch, matching the established "each screen re-fetches
independently" pattern from every prior phase this session).

### Contract's ring: FINANCE replaces the flat payment list

`fetchContractConnections`'s existing payment query gains `received_date` to its `select`
(already fetching `id, value, status, payment_date`). The existing loop that pushes one
non-clickable `payment:${id}` node per row is deleted. In its place, one node:

- `kind: "contract-finance"` (new visual kind), `label: "FINANCE"`, `sublabel`: a one-line real
  preview (e.g. `"AED 12,000 outstanding"`, or `"Fully paid"` when outstanding is 0), `exception:
  true` when overdue > 0, `clickable: true`, `center: { kind: "contract-finance", domain, id:
  contractId }`.
- Not shown at all only if the contract has literally zero payment rows AND a null value (true
  "nothing to say" case) — otherwise shown, since Contract Value alone is always a real fact
  worth surfacing, and an honest "No payment records available" empty state (§18) is itself
  useful information, not nothing.

The contract's own `centerDetail` (Reference/Status/Customer/Value/End Date) is **unchanged** —
the full financial breakdown lives on the `contract-finance` screen, matching where the brief's
own worked example (§5) puts it; this avoids touching already-shipped Phase 1 behavior beyond
the one ring-node swap this phase explicitly calls for.

### `contract-finance` screen

Ring (each only when applicable, per the empty-state rules above):
- **Received** — always shown (even AED 0), `center: { kind: "payment-category", ..., category:
  "received" }`.
- **Outstanding** — always shown (even AED 0), same shape, `category: "outstanding"`.
- **Next Payment** — shown only when one exists; routes **directly** to that specific payment's
  own center (`{ kind: "payment", domain, id }`) rather than through a category screen, since
  the brief (§10) wants it immediately clickable, not a two-hop detour through "Outstanding."
- **Overdue** — shown only when the overdue sum is > 0, `exception: true`, `category:
  "overdue"`.

`centerDetail`: Contract Value, Received, Outstanding, Overdue, Next Payment (amount + due
date) — the exact five-line summary from the brief's §5 example, each real, AED-formatted
(`AED 12,000`, matching the existing formatting convention already used elsewhere in this file,
e.g. `fetchContractConnections`'s existing `Value` field).

If the contract has zero payment rows: the ring shows a single non-clickable informational leaf
reading "No payment records available" (the brief's own §18 wording) instead of the four
category nodes above.

### `payment-category` screen (Received / Outstanding / Overdue for one contract)

Real payment rows for that bucket, one clickable ring node each (`center: { kind: "payment",
domain, id }`). Empty case: a single non-clickable leaf, wording matched to the category (e.g.
"No overdue payments" — this case only reachable for "received"/"outstanding" since "overdue"
itself is only shown when non-empty).

### `payment` screen (an individual real payment)

`centerDetail`: Amount, Payment Date, Received Date (or "Not yet received"), Status (the
computed value, not the stale stored column). Ring: one "Back to Contract" node, matching the
established pattern used by every other detail screen in this file.

## Relationship metadata

Every new edge gets a real `relationshipReason`, matching the established convention:
- Contract → Finance: `"<Contract>'s financial position."`
- Finance → Received/Outstanding/Overdue: `"<label> payments under this contract."`
- Finance → Next Payment: `"The next payment due on this contract."`
- Payment-category → Payment: `"This payment is <received/outstanding/overdue> on this
  contract."`
- Payment → Contract (back-link): `"This payment was made against this contract."`

## Payment → Customer

Confirmed reliably derivable only as a 2-hop path (payment → contract → customer, both real FKs
already established) — not built as a direct edge, since no direct payment→customer
relationship exists in the schema. A payment's "Back to Contract" node already gets the user one
click from the real customer (via the contract's own existing customer node), satisfying the
brief's §13 without inventing a shortcut relationship the database doesn't have.

## TODAY hub

**Not touched**, continuing the decision already made and explained in the Phase 4a design doc:
no hub tile on TODAY has ever shown a real count in this feature (not Contracts, not Staff, not
Schedules even after going real), and the brief's own §23 hedges this as optional ("TODAY *may*
display..."). Adding it now, for Finance only, would be the first inconsistency across five
phases. Deferred, not dropped.

## Out of scope for this document

- Payment `reference`/`payment method` fields — don't exist in the schema.
- VAT-adjusted figures — `vat_percent` is unpopulated on every real row; all figures are shown
  as stored, unadjusted.
- A separate "Due" (due-within-15-days) drill-down category — folded into Outstanding + Next
  Payment per the confirmed decision above.
- Search extension to payment identifiers — not requested for this phase.
- The `scheduled_date`/`completion_due_at` overdue-definition inconsistency flagged at the end
  of Phase 4a — explicitly deferred per the brief's own §29, not touched here.
