# Operations Universe (Phase 1: Contracts) — Design

## Problem

The CRM today is a conventional set of table/card dashboards — one route per entity type, no way to see how a contract, its work orders, its payments, and the people on site relate to each other without navigating between separate pages and mentally reassembling the picture. The user wants an Obsidian-style interactive graph: a visual map of the company where any entity can become the center of the view, with its real relationships radiating outward, so you can visually travel through the business (Today → Contracts → a contract → its pending work order → the technician on it) instead of clicking through a menu tree.

## Scope: Phase 1 only

This is explicitly the first of several phases. Phase 1 delivers:
1. The core navigation engine — the "become the new center" mechanic, generically.
2. One fully-realized vertical slice through it: **Contracts**.

Deliberately **not** in Phase 1: a working Staff branch, a working Schedules branch, the employee-assignment write action, cross-branch travel beyond what a contract's own connections allow, a Quotation node, and a dedicated exceptions subsystem beyond what's naturally visible within the Contracts slice. These are candidates for later phases, once the interaction model is proven here.

## Architecture

A new route, `/universe`, in the existing TanStack Router app (`bizjoy-dashboard`). Pure visualization/navigation layer — **no new business tables, no duplicated business logic**. Every node's data comes from the existing Supabase tables via the existing `supabase-js` client, under the same RLS / `app_private.can()` permission model already gating the rest of the CRM (the route is gated on the existing `contracts` module `view` permission — the same permission that already gates `/contracts` and `/amc-contracts`, so nothing new needs to be granted to existing users of those pages).

**Rendering**: React Flow (`@xyflow/react`) — a new dependency (no graph/node-based UI library exists in this codebase today). Nodes render as ordinary React components styled with the existing Tailwind/shadcn primitives (`Badge`, `Card`, etc.) rather than a separate theming system.

**Layout**: a pure function `layoutAround(centerEntity, connections): NodePosition[]` places the centered node at the canvas center and arranges its direct connections in concentric rings, grouped by relationship category (e.g. all pending work orders cluster together on one ring, financial nodes on another). This is the "hybrid" style approved during design: clean, predictable ring placement (not free-floating physics), with each node's move to its new position on recenter animated as a smooth transition rather than a hard cut, so it reads as organic movement rather than a page swap.

**State**: a single piece of client state — `centerEntity: { type: EntityType; id: string } | 'today'` — drives everything. Clicking a node sets this; a `useConnections(centerEntity)` hook fetches that entity's real connections fresh from Supabase and the layout recomputes. No client-side graph-traversal cache or precomputed graph structure — this keeps the data always current and avoids building a second source of truth over the existing schema.

## The rule for what counts as a connection

A node only appears as a directly connected entity if a real foreign key or unambiguous relationship exists in the schema today. Nothing is shown via fuzzy/approximate matching (e.g. matching by customer name text). Where the ideal relationship in the user's original request only exists via an intermediate entity, it's reached by drilling into that intermediate entity, not fabricated as a direct link. Two concrete cases decided during design:

- **Quotations**: `quotes` has no `customer_id` FK (Zoho-sourced, denormalized `customer_name` only) and no link to `contracts` at all. Omitted from the Contract view entirely for Phase 1.
- **Documents and Variation leads**: `customer_documents` and `sales_leads` (which is what a "Variation Job" lead is, per this repo's existing lead-intake flow) both relate to the **customer**, not the contract — `sales_leads` doesn't even have a `contract_id` column, so a lead can't be tied to one specific contract when a customer has several. Both are reachable by drilling into the Customer node (one ring further out), not shown as a direct first-ring connection of the contract.

Invoices and Payments are **not** subject to this caveat — `invoice_packs.contract_id` and `contract_payments.contract_id` (and the FM equivalents) are real, direct FKs, so both appear as first-ring contract connections, even though they aren't linked to *each other*.

## The Today screen

Center node "TODAY". Three nodes around it:
- **CONTRACTS** — live, clickable, leads into the Phase 1 slice below.
- **STAFF** — visible, visually dimmed, labeled "Coming soon", not clickable.
- **SCHEDULES** — same treatment as Staff.

This keeps the final shape of the universe visible from day one even though only one branch works yet, per the earlier design discussion.

## The Contracts slice

**Contracts → categories → list.** Clicking CONTRACTS progressively reveals categories (grouped by `status`, matching the existing status vocabulary already used on `/contracts` and `/amc-contracts`), then the real contracts within a chosen category. This covers both `contracts` (AMC-domain) and `fm_contracts` (FM-domain) — both are real tables in this schema with parallel structure, so the category view spans both, each contract tagged by its domain.

**A contract as center.** Clicking a specific contract recenters on it. Its first-ring connections, all via real FKs:
- **Customer** (`contracts.customer_id` / `fm_contracts.customer_id`)
- **Contract facts** shown as inline detail on the center node itself (not separate nodes): status, value, start/end dates, contract number.
- **PPM** — `ppm_schedules`/`ppm_visits` (AMC) or `amc_ppm_schedules`/`amc_ppm_visits` where applicable, upcoming visits highlighted.
- **Pending work orders** — `work_orders`/`fm_work_orders` where `contract_id` matches and status is not a terminal/completed state.
- **Completed work orders** — same tables, terminal status.
- **Assigned manpower** — `contract_manpower_assignments` (AMC) where applicable.
- **Invoices** — `invoice_packs`.
- **Payments** — `contract_payments` / `fm_contract_payments`.
- **Service reports** — `service_reports` / `fm_service_reports`.
- **Timeline** — not a separate table; derived by collecting the real dates already present across the nodes above (contract start, each PPM visit, each work order's key timestamps, each invoice's period, each payment's date, contract end) into one ordered strip. Timeline entries are clickable and recenter on the entity they represent, same as any other node.

**Drilling into Pending Work Orders** reveals the actual pending work orders as nodes around the contract (not a redundant intermediate screen — clicking the category node and seeing the real list happen together, consistent with the "progressive reveal" pattern used for Contracts categories).

**A work order as center.** Clicking one recenters on it, showing: Contract (back-link), Customer, Location, Scheduled date, Status, Priority, Assigned employee(s) (from `technician_id`/`technician_name` — shown as informational nodes, see below), Required trade (from the employee's `position` field — the closest existing proxy for "skill", there is no dedicated skills table), Service history (prior service reports for the same contract/asset where traceable), Related service report if one exists (`service_reports.work_order_id` / `fm_service_reports.work_order_id`).

**Assigned-employee nodes are informational only in Phase 1** — clicking one shows a small summary card (name, position) rather than recentering the whole universe on them, since a full Staff branch (their today's jobs, availability, etc.) doesn't exist yet. This is called out explicitly so it isn't mistaken for a bug later.

## Exceptions

Scoped to what's already visible within this slice — no separate exceptions subsystem. Two concrete rules for Phase 1:
- A work order past its `completion_due_at` (or `response_due_at` for one not yet responded to) without a completion timestamp renders with a distinct visual treatment (red ring/badge) instead of its normal status color.
- A contract with `end_date` within 30 days renders with the same distinct treatment on the Today→Contracts path, so an expiring contract stands out before you've even clicked into it.

Both rules reuse fields that already exist on `work_orders`/`fm_work_orders`/`contracts`/`fm_contracts` — no new columns.

## Error handling

Every fetch (connections for the centered entity) follows the same pattern already used elsewhere in this codebase: a loading state on the recentering node, and a visible inline error state (not a silent failure) if the Supabase query fails, with a retry action. If a centered entity is deleted or becomes inaccessible between load and click (e.g. a permission change), recentering on it shows an explicit "not found" state rather than an empty or broken graph.

## Testing

This codebase has no automated test runner (confirmed: no `test` script in `package.json`). Consistent with how every other feature in this project has been verified this session: manual browser verification of the actual rendered graph against real data (a real contract with real work orders/invoices/payments), plus direct SQL checks confirming the connection-fetching logic returns the right rows for a given contract id, run before and reported alongside the implementation.
