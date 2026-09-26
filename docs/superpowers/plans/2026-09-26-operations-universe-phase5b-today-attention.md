# Operations Universe Phase 5b (TODAY/ATTENTION UI) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Phase 5a exception engine visible in the Operations Universe graph: a live
ATTENTION node on TODAY, progressive disclosure down to individual exceptions, navigation from
an exception into the real business entity behind it, reverse navigation (entity → its active
exceptions), a deterministic morning summary, and an "Attention Only" review mode. Strictly
read-only.

**Architecture:** Four new `CenterEntity` screens reuse the existing one-ring-per-screen shape
(`layoutAround`) and the established "one `EntityKind` serves both a root and a leaf screen"
pattern already used by Schedules. A shared react-query cache entry
(`["operational-exceptions"]`) backs both TODAY's live counts and a new `appendAttentionNode`
helper injected into five existing entity screens, with zero changes to those screens' own
fetcher internals.

**Tech Stack:** bizjoy-dashboard (TanStack Start + Supabase + `@tanstack/react-query` v5 +
`@xyflow/react`, project `evcaehadjzoxtdlnmehk`).

**Design doc:**
`docs/superpowers/specs/2026-09-26-operations-universe-phase5b-today-attention-design.md`

**Testing note:** no automated test runner in this repo (confirmed again). Verified via `npx tsc
--noEmit`, `npx eslint`, and direct comparison of every new UI aggregation against
`detectAllExceptions()`/`detectExceptionCounts()` output via the Supabase MCP `execute_sql` tool
(project id `evcaehadjzoxtdlnmehk`) — never a reimplementation of detection logic in React.

**Scope boundary:** Read-only. No fix/assign/complete/mark-received actions (Phase 6). No new
demo data. `layout.ts` is not modified.

---

### Task 1: Extend `types.ts` — new screens, entity kinds, severity field

**Files:**
- Modify: `src/features/operations-universe/types.ts`

- [ ] **Step 1: Add the severity type (moved here as the canonical source to avoid a circular
  import between `types.ts` and `exceptions.ts` — both already import from `types.ts`, never the
  reverse)**

Find:

```ts
export type ContractDomain = "AMC" | "FM";
export type StaffCategory = "available" | "booked" | "absent";
export type ScheduleCategory = "today" | "upcoming" | "overdue";
```

Replace with:

```ts
export type ContractDomain = "AMC" | "FM";
export type StaffCategory = "available" | "booked" | "absent";
export type ScheduleCategory = "today" | "upcoming" | "overdue";
export type ExceptionCategory = "operations" | "people" | "finance" | "contracts" | "data-quality";
export type ExceptionSeverity = "attention" | "important" | "critical";
```

- [ ] **Step 2: Add the 4 new `CenterEntity` variants**

Find:

```ts
  | { kind: "schedule-category"; category: ScheduleCategory | "__root__" }
  | { kind: "employee"; id: string; name: string; position?: string };
```

Replace with:

```ts
  | { kind: "schedule-category"; category: ScheduleCategory | "__root__" }
  | { kind: "employee"; id: string; name: string; position?: string }
  | { kind: "attention"; category: ExceptionCategory | "__root__" }
  | { kind: "attention-type"; category: ExceptionCategory; title: string }
  | { kind: "exception"; id: string }
  | { kind: "entity-attention"; target: CenterEntity };
```

(A self-referencing union member — `entity-attention`'s `target: CenterEntity` — is valid
TypeScript for a `type` alias like this one; no special handling needed.)

- [ ] **Step 3: Add the 3 new `EntityKind` values**

Find:

```ts
  | "staff-category"
  | "schedule-category";
```

Replace with:

```ts
  | "staff-category"
  | "schedule-category"
  | "attention-hub"
  | "attention-category"
  | "exception";
```

- [ ] **Step 4: Add `severity` to `UniverseNodeData`**

Find:

```ts
  exception?: boolean;
```

Replace with:

```ts
  exception?: boolean;
  /** only set by attention/exception-related nodes; drives severity-tiered styling in UniverseNodeComponent */
  severity?: ExceptionSeverity;
```

- [ ] **Step 5: Add the 4 new `centerEntityKey()` cases**

Find:

```ts
    case "employee":
      return `employee:${center.id}`;
  }
}
```

Replace with:

```ts
    case "employee":
      return `employee:${center.id}`;
    case "attention":
      return `attention:${center.category}`;
    case "attention-type":
      return `attention-type:${center.category}:${center.title}`;
    case "exception":
      return `exception:${center.id}`;
    case "entity-attention":
      return `entity-attention:${centerEntityKey(center.target)}`;
  }
}
```

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit`

Expected: errors in `UniverseNodeComponent.tsx` (missing `ICONS`/`COLORS` entries for the 3 new
`EntityKind` values — expected until Task 4) and possibly none elsewhere yet. This is the same
"add the type first, fix the map next" ordering already used successfully in Phase 4a/4b — note
the exact error list, it must shrink to zero once Task 4 lands.

- [ ] **Step 7: Commit**

```bash
git add src/features/operations-universe/types.ts
git commit -m "$(cat <<'EOF'
feat: attention UI - types, new screens, severity field

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Extend `exceptions.ts` — record labels, relevant date/amount, `worstSeverity`

**Files:**
- Modify: `src/features/operations-universe/exceptions.ts`

- [ ] **Step 1: Make `types.ts` the canonical source for `ExceptionSeverity`**

Find:

```ts
import { supabase } from "@/integrations/supabase/client";
import type { CenterEntity, ContractDomain } from "./types";
import { computePaymentStatus } from "./payment-status";

export type ExceptionSeverity = "attention" | "important" | "critical";
export type ExceptionCategory = "operations" | "people" | "finance" | "contracts" | "data-quality";
```

Replace with:

```ts
import { supabase } from "@/integrations/supabase/client";
import type { CenterEntity, ContractDomain, ExceptionSeverity, ExceptionCategory } from "./types";
import { computePaymentStatus } from "./payment-status";

export type { ExceptionSeverity, ExceptionCategory };
```

(Folded into the existing `./types` import rather than a second, separate import statement from
the same module — then re-exported by name, so `exceptions.ts`'s public API stays identical:
everything that already imports `ExceptionSeverity`/`ExceptionCategory` from `"./exceptions"`
keeps working. `types.ts` becomes the single canonical definition, since it also needs these two
types for the new `CenterEntity` variants added in Task 1.)

- [ ] **Step 2: Extend the `OperationalException` interface**

Find:

```ts
export interface OperationalException {
  id: string;
  category: ExceptionCategory;
  severity: ExceptionSeverity;
  title: string;
  reason: string;
  target: CenterEntity;
  contractId?: string;
  contractDomain?: ContractDomain;
}
```

Replace with:

```ts
export interface OperationalException {
  id: string;
  category: ExceptionCategory;
  severity: ExceptionSeverity;
  title: string;
  reason: string;
  target: CenterEntity;
  contractId?: string;
  contractDomain?: ContractDomain;
  /** concise graph-node label, e.g. "WO-123", "Villa 77", "Shankar" - never the full reason string */
  recordLabel: string;
  /** short supporting label under recordLabel, e.g. "32 days overdue" */
  recordSublabel?: string;
  /** structured date for the exception context panel - not parsed out of `reason` */
  relevantDate?: string;
  /** structured AED amount for the exception context panel, where applicable */
  relevantAmount?: number;
}
```

- [ ] **Step 3: Populate the 2 new required/optional fields in `detectOverdueWorkOrders`**

Find:

```ts
    exceptions.push({
      id: `operations:overdue-work-order:${wo.domain}:${wo.id}`,
      category: "operations",
      severity: daysOverdue > 30 ? "critical" : "important",
      title: "Overdue Work Order",
      reason: `${wo.wo_no ?? "This work order"} requires attention because its completion due date was ${wo.completion_due_at.slice(0, 10)} and it remains open.`,
      target: { kind: "work-order", domain: wo.domain, id: wo.id },
      contractId: wo.contract_id ?? undefined,
      contractDomain: wo.contract_id ? wo.domain : undefined,
    });
```

Replace with:

```ts
    exceptions.push({
      id: `operations:overdue-work-order:${wo.domain}:${wo.id}`,
      category: "operations",
      severity: daysOverdue > 30 ? "critical" : "important",
      title: "Overdue Work Order",
      reason: `${wo.wo_no ?? "This work order"} requires attention because its completion due date was ${wo.completion_due_at.slice(0, 10)} and it remains open.`,
      target: { kind: "work-order", domain: wo.domain, id: wo.id },
      contractId: wo.contract_id ?? undefined,
      contractDomain: wo.contract_id ? wo.domain : undefined,
      recordLabel: wo.wo_no ?? "Work Order",
      recordSublabel: `${daysOverdue} day${daysOverdue === 1 ? "" : "s"} overdue`,
      relevantDate: wo.completion_due_at.slice(0, 10),
    });
```

- [ ] **Step 4: Populate in `detectOverduePpm`**

Find:

```ts
    exceptions.push({
      id: `operations:overdue-ppm:${visit.domain}:${visit.id}`,
      category: "operations",
      severity: "important",
      title: "Overdue PPM",
      reason: `This PPM visit was due on ${date} and remains unresolved.`,
      target: { kind: "ppm-visit", domain: visit.domain, id: visit.id },
      contractId: visit.contract_id,
      contractDomain: visit.domain,
    });
```

Replace with:

```ts
    exceptions.push({
      id: `operations:overdue-ppm:${visit.domain}:${visit.id}`,
      category: "operations",
      severity: "important",
      title: "Overdue PPM",
      reason: `This PPM visit was due on ${date} and remains unresolved.`,
      target: { kind: "ppm-visit", domain: visit.domain, id: visit.id },
      contractId: visit.contract_id,
      contractDomain: visit.domain,
      recordLabel: "PPM Visit",
      recordSublabel: `Due ${date}`,
      relevantDate: date,
    });
```

- [ ] **Step 5: Populate in `detectStaffAttendanceIssues`**

Find:

```ts
    exceptions.push({
      id: `people:no-attendance:${employee.id}`,
      category: "people",
      severity: "important",
      title: "No Attendance Recorded",
      reason: `${name} has ${totalCount} open work order${totalCount === 1 ? "" : "s"} assigned (${breakdown.join(", ")}) but no attendance record for today.`,
      target: { kind: "employee", id: employee.id, name, position: employee.position ?? undefined },
    });
```

Replace with:

```ts
    exceptions.push({
      id: `people:no-attendance:${employee.id}`,
      category: "people",
      severity: "important",
      title: "No Attendance Recorded",
      reason: `${name} has ${totalCount} open work order${totalCount === 1 ? "" : "s"} assigned (${breakdown.join(", ")}) but no attendance record for today.`,
      target: { kind: "employee", id: employee.id, name, position: employee.position ?? undefined },
      recordLabel: name,
      recordSublabel: "No attendance today",
      relevantDate: todayStr,
    });
```

- [ ] **Step 6: Populate in `detectOverduePayments`**

Find:

```ts
    exceptions.push({
      id: `finance:overdue-payment:${domain}:${contractId}`,
      category: "finance",
      severity: "critical",
      title: "Overdue Payment",
      reason: `${title} has ${count} payment${count === 1 ? "" : "s"} totaling AED ${total} that remain unpaid more than 15 days after the due date.`,
      target: { kind: "contract-finance", domain, id: contractId },
      contractId,
      contractDomain: domain,
    });
```

Replace with:

```ts
    exceptions.push({
      id: `finance:overdue-payment:${domain}:${contractId}`,
      category: "finance",
      severity: "critical",
      title: "Overdue Payment",
      reason: `${title} has ${count} payment${count === 1 ? "" : "s"} totaling AED ${total} that remain unpaid more than 15 days after the due date.`,
      target: { kind: "contract-finance", domain, id: contractId },
      contractId,
      contractDomain: domain,
      recordLabel: title,
      recordSublabel: "Payment overdue",
      relevantAmount: total,
    });
```

- [ ] **Step 7: Populate in `detectExpiringContracts`**

Find:

```ts
    exceptions.push({
      id: `contracts:expiring:${contract.domain}:${contract.id}`,
      category: "contracts",
      severity: "attention",
      title: "Expiring Contract",
      reason: `${contract.title ?? "This contract"} is active and ends on ${contract.end_date}, within the next 60 days.`,
      target: { kind: "contract", domain: contract.domain, id: contract.id },
      contractId: contract.id,
      contractDomain: contract.domain,
    });
```

Replace with:

```ts
    exceptions.push({
      id: `contracts:expiring:${contract.domain}:${contract.id}`,
      category: "contracts",
      severity: "attention",
      title: "Expiring Contract",
      reason: `${contract.title ?? "This contract"} is active and ends on ${contract.end_date}, within the next 60 days.`,
      target: { kind: "contract", domain: contract.domain, id: contract.id },
      contractId: contract.id,
      contractDomain: contract.domain,
      recordLabel: contract.title ?? "This contract",
      recordSublabel: `Ends ${contract.end_date}`,
      relevantDate: contract.end_date,
    });
```

- [ ] **Step 8: Populate in `detectReconciliationIssues`**

Find:

```ts
    exceptions.push({
      id: `data-quality:reconciliation:${domain}:${contract.id}`,
      category: "data-quality",
      severity: "attention",
      title: "Payment Schedule Mismatch",
      reason: `${contract.title ?? "This contract"}'s payment schedule totals AED ${scheduledTotal}, but the contract value is AED ${contractValue}.`,
      target: { kind: "contract", domain, id: contract.id },
      contractId: contract.id,
      contractDomain: domain,
    });
```

Replace with:

```ts
    exceptions.push({
      id: `data-quality:reconciliation:${domain}:${contract.id}`,
      category: "data-quality",
      severity: "attention",
      title: "Payment Schedule Mismatch",
      reason: `${contract.title ?? "This contract"}'s payment schedule totals AED ${scheduledTotal}, but the contract value is AED ${contractValue}.`,
      target: { kind: "contract", domain, id: contract.id },
      contractId: contract.id,
      contractDomain: domain,
      recordLabel: contract.title ?? "This contract",
      recordSublabel: `AED ${delta} mismatch`,
      relevantAmount: delta,
    });
```

- [ ] **Step 9: Add `worstSeverity`, a small shared aggregation helper needed by the UI layer**

Add at the end of the file, after `groupExceptionsByContract`:

```ts
export function worstSeverity(
  exceptions: OperationalException[],
): ExceptionSeverity | undefined {
  if (exceptions.some((exception) => exception.severity === "critical")) return "critical";
  if (exceptions.some((exception) => exception.severity === "important")) return "important";
  if (exceptions.some((exception) => exception.severity === "attention")) return "attention";
  return undefined;
}
```

- [ ] **Step 10: Verify**

Run: `npx tsc --noEmit`

Expected: zero errors related to `exceptions.ts` itself. The Task 1 `UniverseNodeComponent.tsx`
errors (missing `ICONS`/`COLORS` map entries) are still expected at this point.

- [ ] **Step 11: Cross-check against real data**

Using the Supabase MCP tool (project id `evcaehadjzoxtdlnmehk`), spot-check that the new fields
produce sensible real values for one real exception of each of the 6 detectors — e.g. confirm one
real overdue work order's `recordLabel` equals its real `wo_no`, one real expiring contract's
`relevantDate` equals its real `end_date`, one real reconciliation mismatch's `relevantAmount`
equals its real computed delta. This is a manual trace-through against the same real IDs already
catalogued in Phase 5a's Task 6 cross-check (not new queries — reuse those IDs).

- [ ] **Step 12: Commit**

```bash
git add src/features/operations-universe/exceptions.ts
git commit -m "$(cat <<'EOF'
feat: attention UI - record labels, relevant date/amount, worstSeverity

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Create `attention-summary.ts` — morning summary + "why connected" text

**Files:**
- Create: `src/features/operations-universe/attention-summary.ts`

- [ ] **Step 1: Create the file**

```ts
import type { OperationalException } from "./exceptions";

const EXCEPTION_TITLE_PHRASES: Record<string, { singular: string; plural: string }> = {
  "Overdue Work Order": { singular: "overdue work order", plural: "overdue work orders" },
  "Overdue PPM": { singular: "overdue PPM visit", plural: "overdue PPM visits" },
  "No Attendance Recorded": {
    singular: "staff attendance issue",
    plural: "staff attendance issues",
  },
  "Overdue Payment": {
    singular: "contract with an overdue payment",
    plural: "contracts with overdue payments",
  },
  "Expiring Contract": { singular: "expiring contract", plural: "expiring contracts" },
  "Payment Schedule Mismatch": {
    singular: "payment schedule requiring reconciliation",
    plural: "payment schedules requiring reconciliation",
  },
};

// Data quality is deliberately reported in its own trailing sentence, never merged into the
// operational summary - a schedule/value mismatch isn't a business emergency by itself
// (see exceptions.ts's detectReconciliationIssues).
const DATA_QUALITY_TITLE = "Payment Schedule Mismatch";

function countByTitle(exceptions: OperationalException[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const exception of exceptions) {
    counts.set(exception.title, (counts.get(exception.title) ?? 0) + 1);
  }
  return counts;
}

function phraseFor(title: string, count: number): string {
  const phrase = EXCEPTION_TITLE_PHRASES[title];
  if (!phrase) return `${count} ${title.toLowerCase()}${count === 1 ? "" : "s"}`;
  return `${count} ${count === 1 ? phrase.singular : phrase.plural}`;
}

function joinPhrases(phrases: string[]): string {
  if (phrases.length === 0) return "";
  if (phrases.length === 1) return phrases[0];
  return `${phrases.slice(0, -1).join(", ")} and ${phrases[phrases.length - 1]}`;
}

export function buildMorningSummary(exceptions: OperationalException[]): {
  operational: string;
  dataQuality?: string;
} {
  const counts = countByTitle(exceptions);
  const dataQualityCount = counts.get(DATA_QUALITY_TITLE) ?? 0;

  const operationalPhrases: string[] = [];
  for (const [title, count] of counts) {
    if (title === DATA_QUALITY_TITLE || count === 0) continue;
    operationalPhrases.push(phraseFor(title, count));
  }

  const operational =
    operationalPhrases.length === 0
      ? "Nothing requires your attention today."
      : `Today requires attention: ${joinPhrases(operationalPhrases)}.`;

  const dataQuality =
    dataQualityCount > 0
      ? `Data quality: ${phraseFor(DATA_QUALITY_TITLE, dataQualityCount)}.`
      : undefined;

  return { operational, dataQuality };
}

export function buildAttentionRelationshipReason(
  entityLabel: string,
  exceptions: OperationalException[],
): string {
  if (exceptions.length === 0) {
    return `${entityLabel} has no active exceptions.`;
  }
  const counts = countByTitle(exceptions);
  const phrases = [...counts.entries()].map(([title, count]) => phraseFor(title, count));
  return `${entityLabel} is connected to Attention because it has ${exceptions.length} active exception${exceptions.length === 1 ? "" : "s"}: ${joinPhrases(phrases)}.`;
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`

Expected: zero new errors from this file.

- [ ] **Step 3: Manual trace-through (no test runner)**

Using the real per-title counts already confirmed in Phase 5a (2 Overdue Work Order, 2 Overdue
PPM, 2 No Attendance Recorded, 7 Overdue Payment, 3 Expiring Contract, 5 Payment Schedule
Mismatch), trace `buildMorningSummary` by hand and confirm it produces:

```
operational: "Today requires attention: 2 overdue work orders, 2 overdue PPM visits, 2 staff attendance issues, 7 contracts with overdue payments and 3 expiring contracts."
dataQuality: "Data quality: 5 payment schedules requiring reconciliation."
```

- [ ] **Step 4: Commit**

```bash
git add src/features/operations-universe/attention-summary.ts
git commit -m "$(cat <<'EOF'
feat: attention UI - deterministic morning summary and relationship-reason text

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `UniverseNodeComponent.tsx` — new icons/colors, severity-aware styling

**Files:**
- Modify: `src/features/operations-universe/UniverseNodeComponent.tsx`

- [ ] **Step 1: Import 2 more icons**

Find:

```ts
import {
  Sparkles,
  FileText,
  Users,
  CalendarClock,
  Layers,
  Building2,
  Wrench,
  CalendarCheck,
  Receipt,
  Banknote,
  ClipboardCheck,
  HardHat,
  Clock,
  User,
  UserCircle2,
  Info,
  ListChecks,
  Wallet,
} from "lucide-react";
```

Replace with:

```ts
import {
  Sparkles,
  FileText,
  Users,
  CalendarClock,
  Layers,
  Building2,
  Wrench,
  CalendarCheck,
  Receipt,
  Banknote,
  ClipboardCheck,
  HardHat,
  Clock,
  User,
  UserCircle2,
  Info,
  ListChecks,
  Wallet,
  AlertTriangle,
  AlertCircle,
} from "lucide-react";
```

- [ ] **Step 2: Add the 3 new `ICONS`/`COLORS` entries (together, in the same commit as Task 1's
  new `EntityKind`s, per this codebase's established gotcha where a `Record<EntityKind, ...>`
  breaks if the type and the map are updated in separate commits)**

Find:

```ts
  "staff-detail": Info,
  "schedule-category": ListChecks,
};
```

Replace with:

```ts
  "staff-detail": Info,
  "schedule-category": ListChecks,
  "attention-hub": AlertTriangle,
  "attention-category": Layers,
  exception: AlertCircle,
};
```

Find:

```ts
  "staff-detail": "#8a93a3",
  "schedule-category": "#5b9bd5",
};
```

Replace with:

```ts
  "staff-detail": "#8a93a3",
  "schedule-category": "#5b9bd5",
  "attention-hub": "#5b6270",
  "attention-category": "#5b9bd5",
  exception: "#e89a4a",
};
```

(`"attention-hub"`'s `COLORS` entry is a fallback only — Step 3 below overrides it dynamically
based on live severity. `"attention-category"` and `"exception"` keep a static, non-dynamic
base color; only their border/glow become severity-tiered, per the design doc's "severity
nuance is node-level border/glow only" decision, not a fill-color change.)

- [ ] **Step 3: Add severity-aware fill (for `attention-hub` only) and border/glow (for any node
  carrying `severity`)**

Find:

```ts
export function UniverseNodeComponent({ data }: NodeProps<Node<UniverseNodeData>>) {
  const isMobile = useIsMobile();
  const Icon = ICONS[data.kind];
  const baseColor = COLORS[data.kind] ?? "#5b9bd5";
  const isDimmed = !data.clickable;
  const isException = Boolean(data.exception);
  const maxLabelLength = isMobile ? 14 : 18;
  const labelFontSize = isMobile ? 11 : 10;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        borderRadius: 999,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: isDimmed ? "#2a2f38" : baseColor,
        border: isException ? "3px solid #dc4c4c" : "2px solid rgba(0,0,0,0.15)",
        color: isDimmed ? "#8a93a3" : "#0d1117",
        opacity: isDimmed ? 0.55 : 1,
        cursor: data.clickable ? "pointer" : "default",
        textAlign: "center",
        padding: 6,
        boxShadow: isException ? "0 0 12px rgba(220,76,76,0.6)" : "none",
      }}
      title={data.sublabel ? `${data.label} - ${data.sublabel}` : data.label}
    >
```

Replace with:

```ts
type Severity = "attention" | "important" | "critical";

const SEVERITY_BORDER: Record<Severity, string> = {
  attention: "2px solid #e8b44a",
  important: "3px solid #e89a4a",
  critical: "3px solid #dc4c4c",
};
const SEVERITY_GLOW: Record<Severity, string> = {
  attention: "none",
  important: "0 0 8px rgba(232,154,74,0.5)",
  critical: "0 0 12px rgba(220,76,76,0.6)",
};
const SEVERITY_HUB_FILL: Record<Severity, string> = {
  attention: "#e8b44a",
  important: "#e89a4a",
  critical: "#dc4c4c",
};

export function UniverseNodeComponent({ data }: NodeProps<Node<UniverseNodeData>>) {
  const isMobile = useIsMobile();
  const Icon = ICONS[data.kind];
  const isDimmed = !data.clickable;
  const isException = Boolean(data.exception);
  const severity = data.severity as Severity | undefined;
  const isAttentionHub = data.kind === "attention-hub";
  // The ATTENTION node's own fill reflects the worst live severity (calm gray when clear) -
  // every other kind keeps its static COLORS fill and only gets a severity-tiered border/glow.
  const baseColor = isAttentionHub
    ? (severity ? SEVERITY_HUB_FILL[severity] : "#5b6270")
    : (COLORS[data.kind] ?? "#5b9bd5");
  const border =
    severity && !isAttentionHub
      ? SEVERITY_BORDER[severity]
      : isException
        ? "3px solid #dc4c4c"
        : "2px solid rgba(0,0,0,0.15)";
  const glow =
    severity && !isAttentionHub
      ? SEVERITY_GLOW[severity]
      : isException
        ? "0 0 12px rgba(220,76,76,0.6)"
        : "none";
  const maxLabelLength = isMobile ? 14 : 18;
  const labelFontSize = isMobile ? 11 : 10;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        borderRadius: 999,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: isDimmed ? "#2a2f38" : baseColor,
        border,
        color: isDimmed ? "#8a93a3" : "#0d1117",
        opacity: isDimmed ? 0.55 : 1,
        cursor: data.clickable ? "pointer" : "default",
        textAlign: "center",
        padding: 6,
        boxShadow: glow,
      }}
      title={data.sublabel ? `${data.label} - ${data.sublabel}` : data.label}
    >
```

(Every existing kind never sets `data.severity`, so `severity` is `undefined` for all of them
and `border`/`glow` fall through to exactly the same expressions as before this change — zero
behavior change for Phases 1-5a's nodes.)

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit`

Expected: zero errors anywhere in the repo — this closes out the errors intentionally left open
at the end of Tasks 1 and 2.

Run: `npx eslint src/features/operations-universe/UniverseNodeComponent.tsx`

Expected: no new findings.

- [ ] **Step 5: Commit**

```bash
git add src/features/operations-universe/UniverseNodeComponent.tsx
git commit -m "$(cat <<'EOF'
feat: attention UI - icons, colors, and severity-tiered node styling

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: `useUniverseNodes.ts` — ATTENTION root and category screens

**Files:**
- Modify: `src/features/operations-universe/useUniverseNodes.ts`

- [ ] **Step 1: Add imports**

Find:

```ts
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { layoutAround } from "./layout";
import type { CenterEntity, CenterDetailField, UniverseNodeData } from "./types";
import { centerEntityKey } from "./types";
import { computePaymentStatus } from "./payment-status";
```

Replace with:

```ts
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { layoutAround } from "./layout";
import type { CenterEntity, CenterDetailField, UniverseNodeData } from "./types";
import { centerEntityKey } from "./types";
import { computePaymentStatus } from "./payment-status";
import {
  detectAllExceptions,
  groupExceptionsByContract,
  worstSeverity,
  type ExceptionCategory,
  type OperationalException,
} from "./exceptions";
import { buildAttentionRelationshipReason } from "./attention-summary";
```

- [ ] **Step 2: Add a shared category-label lookup and a shared cached-exceptions fetch helper**

Add just before `async function fetchContractCategoryCounts()` (the file's first fetcher):

```ts
const EXCEPTION_CATEGORY_LABELS: Record<ExceptionCategory, string> = {
  operations: "Operations",
  people: "People",
  finance: "Finance",
  contracts: "Contracts",
  "data-quality": "Data Quality",
};
const EXCEPTION_CATEGORY_ORDER: ExceptionCategory[] = [
  "operations",
  "people",
  "finance",
  "contracts",
  "data-quality",
];

// One shared react-query cache entry for the whole operational-exceptions dataset. Every
// screen that needs it (the ATTENTION drill-down, and reverse-navigation on existing entity
// screens) goes through this, so navigating between them never re-runs all 6 detectors -
// only the first call in any given staleTime window actually hits Supabase.
function fetchCachedExceptions(queryClient: QueryClient): Promise<OperationalException[]> {
  return queryClient.fetchQuery({
    queryKey: ["operational-exceptions"],
    queryFn: detectAllExceptions,
    staleTime: 60_000,
  });
}
```

- [ ] **Step 3: Add the ATTENTION root fetcher**

Add directly after `fetchCachedExceptions`:

```ts
async function fetchAttentionCategoryRoot(
  queryClient: QueryClient,
): Promise<{ id: string; data: UniverseNodeData }[]> {
  const exceptions = await fetchCachedExceptions(queryClient);
  const byCategory = new Map<ExceptionCategory, OperationalException[]>();
  for (const exception of exceptions) {
    const current = byCategory.get(exception.category) ?? [];
    current.push(exception);
    byCategory.set(exception.category, current);
  }

  const nodes: { id: string; data: UniverseNodeData }[] = [];
  for (const category of EXCEPTION_CATEGORY_ORDER) {
    const inCategory = byCategory.get(category) ?? [];
    if (inCategory.length === 0) continue;
    nodes.push({
      id: `attention-category:${category}`,
      data: {
        kind: "attention-category",
        label: EXCEPTION_CATEGORY_LABELS[category].toUpperCase(),
        sublabel: `${inCategory.length} issue${inCategory.length === 1 ? "" : "s"}`,
        severity: worstSeverity(inCategory),
        exception: true,
        clickable: true,
        center: { kind: "attention", category },
        groupKey: category,
        relationshipReason: `${EXCEPTION_CATEGORY_LABELS[category]} groups exceptions of this kind together.`,
      },
    });
  }
  return nodes;
}
```

- [ ] **Step 4: Add the category → exception-type fetcher**

```ts
async function fetchAttentionCategoryTypes(
  queryClient: QueryClient,
  category: ExceptionCategory,
): Promise<{ id: string; data: UniverseNodeData }[]> {
  const exceptions = await fetchCachedExceptions(queryClient);
  const inCategory = exceptions.filter((exception) => exception.category === category);

  const byTitle = new Map<string, OperationalException[]>();
  for (const exception of inCategory) {
    const current = byTitle.get(exception.title) ?? [];
    current.push(exception);
    byTitle.set(exception.title, current);
  }

  return [...byTitle.entries()].map(([title, items]) => ({
    id: `attention-type:${category}:${title}`,
    data: {
      kind: "attention-category",
      label: title,
      sublabel: `${items.length} record${items.length === 1 ? "" : "s"}`,
      severity: worstSeverity(items),
      exception: true,
      clickable: true,
      center: { kind: "attention-type", category, title },
      groupKey: title,
      relationshipReason: `${title} groups the individual affected records.`,
    },
  }));
}
```

- [ ] **Step 5: Wire both into `useUniverseGraph`'s if-chain**

Find:

```ts
      if (centerEntity.kind === "employee") {
        const { centerLabel, centerSublabel, centerDetail, ringOne } =
          await fetchEmployeeConnections(centerEntity.id);
        const centerData: UniverseNodeData = {
          kind: "employee-info",
          label: centerLabel,
          sublabel: centerSublabel,
          clickable: false,
        };
        return {
          ...layoutAround({ centerId: `employee:${centerEntity.id}`, centerData, ringOne }),
          centerDetail,
        };
      }

      // Later tasks add the remaining CenterEntity cases here.
      throw new Error(`No handler yet for center entity kind: ${centerEntity.kind}`);
```

Replace with:

```ts
      if (centerEntity.kind === "employee") {
        const { centerLabel, centerSublabel, centerDetail, ringOne } =
          await fetchEmployeeConnections(centerEntity.id);
        const centerData: UniverseNodeData = {
          kind: "employee-info",
          label: centerLabel,
          sublabel: centerSublabel,
          clickable: false,
        };
        return {
          ...layoutAround({ centerId: `employee:${centerEntity.id}`, centerData, ringOne }),
          centerDetail,
        };
      }

      if (centerEntity.kind === "attention" && centerEntity.category === "__root__") {
        const ringOne = await fetchAttentionCategoryRoot(queryClient);
        const centerData: UniverseNodeData = {
          kind: "attention-hub",
          label: "ATTENTION",
          clickable: false,
        };
        return {
          ...layoutAround({ centerId: "attention-hub", centerData, ringOne }),
          centerDetail: undefined,
        };
      }

      if (centerEntity.kind === "attention") {
        const ringOne = await fetchAttentionCategoryTypes(queryClient, centerEntity.category);
        const centerData: UniverseNodeData = {
          kind: "attention-category",
          label: EXCEPTION_CATEGORY_LABELS[centerEntity.category].toUpperCase(),
          clickable: false,
        };
        return {
          ...layoutAround({
            centerId: `attention-category:${centerEntity.category}`,
            centerData,
            ringOne,
          }),
          centerDetail: undefined,
        };
      }

      // Later tasks add the remaining CenterEntity cases here.
      throw new Error(`No handler yet for center entity kind: ${centerEntity.kind}`);
```

- [ ] **Step 6: Give `useUniverseGraph` access to the query client**

Find:

```ts
export function useUniverseGraph(centerEntity: CenterEntity, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["universe-graph", centerEntityKey(centerEntity)],
    enabled: options?.enabled ?? true,
    queryFn: async () => {
```

Replace with:

```ts
export function useUniverseGraph(centerEntity: CenterEntity, options?: { enabled?: boolean }) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: ["universe-graph", centerEntityKey(centerEntity)],
    enabled: options?.enabled ?? true,
    queryFn: async () => {
```

- [ ] **Step 7: Verify**

Run: `npx tsc --noEmit`

Expected: zero errors.

- [ ] **Step 8: Cross-check against real data**

Using the Supabase MCP tool, confirm the category counts `fetchAttentionCategoryRoot` would
produce match `detectExceptionCounts()`'s real distribution (operations 4, people 2, finance 7,
contracts 3, data-quality 5 — 21 total, per Phase 5a's own final cross-check), and that
`fetchAttentionCategoryTypes` for `"operations"` would produce exactly 2 type-buckets ("Overdue
Work Order" with 2 records, "Overdue PPM" with 2 records).

- [ ] **Step 9: Commit**

```bash
git add src/features/operations-universe/useUniverseNodes.ts
git commit -m "$(cat <<'EOF'
feat: attention UI - ATTENTION root and category screens

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: `useUniverseNodes.ts` — exception-type and exception-record screens

**Files:**
- Modify: `src/features/operations-universe/useUniverseNodes.ts`

- [ ] **Step 1: Add a shared exception → ring-node converter**

Add directly after `fetchAttentionCategoryTypes` (from Task 5):

```ts
function exceptionToRingNode(exception: OperationalException): {
  id: string;
  data: UniverseNodeData;
} {
  return {
    id: `exception:${exception.id}`,
    data: {
      kind: "exception",
      label: exception.recordLabel,
      sublabel: exception.recordSublabel,
      severity: exception.severity,
      exception: true,
      clickable: true,
      center: { kind: "exception", id: exception.id },
      groupKey: exception.title,
      relationshipReason: exception.reason,
    },
  };
}
```

- [ ] **Step 2: Add the exception-type records fetcher**

```ts
async function fetchAttentionTypeRecords(
  queryClient: QueryClient,
  category: ExceptionCategory,
  title: string,
): Promise<{ id: string; data: UniverseNodeData }[]> {
  const exceptions = await fetchCachedExceptions(queryClient);
  return exceptions
    .filter((exception) => exception.category === category && exception.title === title)
    .map(exceptionToRingNode);
}
```

- [ ] **Step 3: Add the affected-entity label lookup and the exception-detail fetcher**

```ts
const AFFECTED_ENTITY_LABELS: Record<CenterEntity["kind"], string> = {
  today: "Today",
  "contract-category": "Contract Category",
  contract: "Contract",
  customer: "Customer",
  "work-order": "Work Order",
  "ppm-visit": "PPM Visit",
  "contract-finance": "Contract Finance",
  "payment-category": "Payment Category",
  payment: "Payment",
  "staff-category": "Staff",
  "schedule-category": "Schedule",
  employee: "Employee",
  attention: "Attention",
  "attention-type": "Attention",
  exception: "Exception",
  "entity-attention": "Attention",
};

async function fetchExceptionDetail(
  queryClient: QueryClient,
  exceptionId: string,
): Promise<{
  centerLabel: string;
  centerSublabel: string;
  severity: OperationalException["severity"];
  centerDetail: CenterDetailField[];
  ringOne: { id: string; data: UniverseNodeData }[];
}> {
  const exceptions = await fetchCachedExceptions(queryClient);
  const exception = exceptions.find((item) => item.id === exceptionId);
  if (!exception) throw new Error("Exception not found");

  const affectedLabel = AFFECTED_ENTITY_LABELS[exception.target.kind];

  const centerDetail: CenterDetailField[] = [
    { label: "Issue", value: exception.title },
    { label: "Why", value: exception.reason },
    {
      label: "Severity",
      value: exception.severity.charAt(0).toUpperCase() + exception.severity.slice(1),
    },
    { label: "Affected Entity", value: `${affectedLabel} · ${exception.recordLabel}` },
  ];
  if (exception.relevantDate) {
    centerDetail.push({ label: "Relevant Date", value: exception.relevantDate });
  }
  if (exception.relevantAmount != null) {
    centerDetail.push({ label: "Relevant Amount", value: `AED ${exception.relevantAmount}` });
  }
  centerDetail.push({
    label: "Suggested Navigation",
    value: `${affectedLabel} · ${exception.recordLabel}`,
  });

  const ringOne: { id: string; data: UniverseNodeData }[] = [
    {
      id: `go-to:${centerEntityKey(exception.target)}`,
      data: {
        kind: exception.target.kind,
        label: `Go to ${affectedLabel}`,
        sublabel: exception.recordLabel,
        clickable: true,
        center: exception.target,
        groupKey: "navigate",
        relationshipReason: `This exception affects ${exception.recordLabel}.`,
      },
    },
  ];

  return {
    centerLabel: exception.recordLabel,
    centerSublabel: exception.title,
    severity: exception.severity,
    centerDetail,
    ringOne,
  };
}
```

- [ ] **Step 4: Wire both into `useUniverseGraph`'s if-chain**

Find:

```ts
      // Later tasks add the remaining CenterEntity cases here.
      throw new Error(`No handler yet for center entity kind: ${centerEntity.kind}`);
```

Replace with:

```ts
      if (centerEntity.kind === "attention-type") {
        const ringOne = await fetchAttentionTypeRecords(
          queryClient,
          centerEntity.category,
          centerEntity.title,
        );
        const centerData: UniverseNodeData = {
          kind: "attention-category",
          label: centerEntity.title,
          clickable: false,
        };
        return {
          ...layoutAround({
            centerId: `attention-type:${centerEntity.category}:${centerEntity.title}`,
            centerData,
            ringOne,
          }),
          centerDetail: undefined,
        };
      }

      if (centerEntity.kind === "exception") {
        const { centerLabel, centerSublabel, severity, centerDetail, ringOne } =
          await fetchExceptionDetail(queryClient, centerEntity.id);
        const centerData: UniverseNodeData = {
          kind: "exception",
          label: centerLabel,
          sublabel: centerSublabel,
          severity,
          exception: true,
          clickable: false,
        };
        return {
          ...layoutAround({ centerId: `exception:${centerEntity.id}`, centerData, ringOne }),
          centerDetail,
        };
      }

      // Later tasks add the remaining CenterEntity cases here.
      throw new Error(`No handler yet for center entity kind: ${centerEntity.kind}`);
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit`

Expected: zero errors.

- [ ] **Step 6: Cross-check against real data**

Confirm one real overdue work order's exception id (e.g. the FM one from Phase 5a's Task 6
dedup trace) resolves through `fetchExceptionDetail` to a `centerDetail` whose "Affected Entity"
and "Suggested Navigation" values both reference its real `wo_no`, and whose single `ringOne`
node's `center` is exactly `{ kind: "work-order", domain: "FM", id: <that real id> }` — i.e.
clicking it would land on the real, already-existing work-order screen, not a new fake one.

- [ ] **Step 7: Commit**

```bash
git add src/features/operations-universe/useUniverseNodes.ts
git commit -m "$(cat <<'EOF'
feat: attention UI - exception-type and exception-record screens

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: `useUniverseNodes.ts` — reverse navigation and contract rollup

**Files:**
- Modify: `src/features/operations-universe/useUniverseNodes.ts`

- [ ] **Step 1: Add the entity-scoped exception lookup and `appendAttentionNode`**

Add directly after `fetchExceptionDetail` (from Task 6):

```ts
function findExceptionsForEntity(
  exceptions: OperationalException[],
  target: CenterEntity,
): OperationalException[] {
  // Contract and Contract Finance are two screens over the same real contract - both route
  // through groupExceptionsByContract so a contract's rollup includes every exception that
  // carries its contractId, not only exceptions whose own target IS a contract (e.g. an
  // overdue work order that happens to belong to this contract also counts).
  if (target.kind === "contract" || target.kind === "contract-finance") {
    const grouped = groupExceptionsByContract(exceptions);
    return grouped.get(`${target.domain}:${target.id}`) ?? [];
  }
  return exceptions.filter(
    (exception) => centerEntityKey(exception.target) === centerEntityKey(target),
  );
}

async function appendAttentionNode(
  ringOne: { id: string; data: UniverseNodeData }[],
  queryClient: QueryClient,
  centerEntity: CenterEntity,
  entityLabel: string,
): Promise<void> {
  const exceptions = await fetchCachedExceptions(queryClient);
  const matching = findExceptionsForEntity(exceptions, centerEntity);
  if (matching.length === 0) return;
  ringOne.push({
    id: `attention-hub:${centerEntityKey(centerEntity)}`,
    data: {
      kind: "attention-hub",
      label: "ATTENTION",
      sublabel: `${matching.length}`,
      severity: worstSeverity(matching),
      exception: true,
      clickable: true,
      center: { kind: "entity-attention", target: centerEntity },
      groupKey: "attention",
      relationshipReason: buildAttentionRelationshipReason(entityLabel, matching),
    },
  });
}

async function fetchEntityAttentionRecords(
  queryClient: QueryClient,
  target: CenterEntity,
): Promise<{ id: string; data: UniverseNodeData }[]> {
  const exceptions = await fetchCachedExceptions(queryClient);
  return findExceptionsForEntity(exceptions, target).map(exceptionToRingNode);
}
```

- [ ] **Step 2: Wire `appendAttentionNode` into the 5 existing entity screens**

Find:

```ts
      if (centerEntity.kind === "contract") {
        const { centerLabel, centerSublabel, centerDetail, ringOne } =
          await fetchContractConnections(centerEntity.domain, centerEntity.id);
        const centerData: UniverseNodeData = {
```

Replace with:

```ts
      if (centerEntity.kind === "contract") {
        const { centerLabel, centerSublabel, centerDetail, ringOne } =
          await fetchContractConnections(centerEntity.domain, centerEntity.id);
        await appendAttentionNode(ringOne, queryClient, centerEntity, centerLabel);
        const centerData: UniverseNodeData = {
```

Find:

```ts
      if (centerEntity.kind === "work-order") {
        const { centerLabel, centerSublabel, exception, centerDetail, ringOne } =
          await fetchWorkOrderConnections(centerEntity.domain, centerEntity.id);
        const centerData: UniverseNodeData = {
```

Replace with:

```ts
      if (centerEntity.kind === "work-order") {
        const { centerLabel, centerSublabel, exception, centerDetail, ringOne } =
          await fetchWorkOrderConnections(centerEntity.domain, centerEntity.id);
        await appendAttentionNode(ringOne, queryClient, centerEntity, centerLabel);
        const centerData: UniverseNodeData = {
```

Find:

```ts
      if (centerEntity.kind === "ppm-visit") {
        const { centerLabel, centerSublabel, exception, centerDetail, ringOne } =
          await fetchPpmVisitConnections(centerEntity.domain, centerEntity.id);
        const centerData: UniverseNodeData = {
```

Replace with:

```ts
      if (centerEntity.kind === "ppm-visit") {
        const { centerLabel, centerSublabel, exception, centerDetail, ringOne } =
          await fetchPpmVisitConnections(centerEntity.domain, centerEntity.id);
        await appendAttentionNode(ringOne, queryClient, centerEntity, centerLabel);
        const centerData: UniverseNodeData = {
```

Find:

```ts
      if (centerEntity.kind === "contract-finance") {
        const { centerLabel, centerSublabel, centerDetail, ringOne } =
          await fetchContractFinanceConnections(centerEntity.domain, centerEntity.id);
        const centerData: UniverseNodeData = {
```

Replace with:

```ts
      if (centerEntity.kind === "contract-finance") {
        const { centerLabel, centerSublabel, centerDetail, ringOne } =
          await fetchContractFinanceConnections(centerEntity.domain, centerEntity.id);
        await appendAttentionNode(ringOne, queryClient, centerEntity, centerLabel);
        const centerData: UniverseNodeData = {
```

Find:

```ts
      if (centerEntity.kind === "employee") {
        const { centerLabel, centerSublabel, centerDetail, ringOne } =
          await fetchEmployeeConnections(centerEntity.id);
        const centerData: UniverseNodeData = {
          kind: "employee-info",
```

Replace with:

```ts
      if (centerEntity.kind === "employee") {
        const { centerLabel, centerSublabel, centerDetail, ringOne } =
          await fetchEmployeeConnections(centerEntity.id);
        await appendAttentionNode(ringOne, queryClient, centerEntity, centerLabel);
        const centerData: UniverseNodeData = {
          kind: "employee-info",
```

(These 5 edits are the only changes to their surrounding branches — the 5 existing fetcher
functions `fetchContractConnections`, `fetchWorkOrderConnections`, `fetchPpmVisitConnections`,
`fetchContractFinanceConnections`, `fetchEmployeeConnections` are not touched at all, per the
design doc's explicit regression-safety goal.)

- [ ] **Step 3: Add the `entity-attention` screen**

Find:

```ts
      // Later tasks add the remaining CenterEntity cases here.
      throw new Error(`No handler yet for center entity kind: ${centerEntity.kind}`);
```

Replace with:

```ts
      if (centerEntity.kind === "entity-attention") {
        const ringOne = await fetchEntityAttentionRecords(queryClient, centerEntity.target);
        const centerData: UniverseNodeData = {
          kind: "attention-category",
          label: "ATTENTION",
          clickable: false,
        };
        return {
          ...layoutAround({
            centerId: `entity-attention:${centerEntityKey(centerEntity.target)}`,
            centerData,
            ringOne,
          }),
          centerDetail: undefined,
        };
      }

      // Later tasks add the remaining CenterEntity cases here.
      throw new Error(`No handler yet for center entity kind: ${centerEntity.kind}`);
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit`

Expected: zero errors — every `CenterEntity["kind"]` variant now has a handler, so this is the
last task where that final `throw` is still reachable in principle (it stays as a defensive
fallback, matching the file's existing style).

Run: `npx eslint src/features/operations-universe/useUniverseNodes.ts`

Expected: no new findings.

- [ ] **Step 5: Cross-check against real data — reverse navigation and rollup**

Using the Supabase MCP tool:
- Pick one of the 7 real AMC contracts with an overdue payment (from Phase 5a's cross-check) and
  confirm `findExceptionsForEntity` (traced by hand against `groupExceptionsByContract`'s real
  output) would surface exactly that contract's real exception(s) — and, if that same contract
  also happens to be one of the 3 expiring contracts or one of the 5 reconciliation contracts
  (check the real ID sets for overlap), confirm ALL of its exceptions appear together under one
  `entity-attention` screen, not as separate duplicate contract nodes (item 11's requirement).
- Pick one of the 2 real staff-attendance-issue employees and confirm `findExceptionsForEntity`
  (the non-contract path, via `centerEntityKey` equality) surfaces exactly their 1 real
  exception.
- Confirm a real employee/contract with **zero** active exceptions produces an EMPTY
  `findExceptionsForEntity` result, so `appendAttentionNode` correctly adds nothing to their ring
  (no "ATTENTION (0)" clutter node ever appears).

- [ ] **Step 6: Commit**

```bash
git add src/features/operations-universe/useUniverseNodes.ts
git commit -m "$(cat <<'EOF'
feat: attention UI - reverse navigation and contract rollup

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: `OperationsUniverse.tsx` — TODAY becomes live

**Files:**
- Modify: `src/features/operations-universe/OperationsUniverse.tsx`

- [ ] **Step 1: Add imports**

Find:

```ts
import { useCallback, useEffect, useMemo, useState } from "react";
import { ReactFlow, Background, Controls, applyNodeChanges } from "@xyflow/react";
import type { Node, Edge, NodeChange } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { layoutAround } from "./layout";
import { UniverseNodeComponent } from "./UniverseNodeComponent";
import { useUniverseGraph } from "./useUniverseNodes";
import { EntityDetailPanel } from "./EntityDetailPanel";
import { UniverseSearch } from "./UniverseSearch";
import type { CenterEntity, UniverseNodeData } from "./types";
import { useIsMobile } from "@/hooks/use-mobile";
```

Replace with:

```ts
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ReactFlow, Background, Controls, applyNodeChanges } from "@xyflow/react";
import type { Node, Edge, NodeChange } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { layoutAround } from "./layout";
import { UniverseNodeComponent } from "./UniverseNodeComponent";
import { useUniverseGraph } from "./useUniverseNodes";
import { EntityDetailPanel } from "./EntityDetailPanel";
import { UniverseSearch } from "./UniverseSearch";
import type { CenterEntity, ExceptionCategory, UniverseNodeData } from "./types";
import { useIsMobile } from "@/hooks/use-mobile";
import { detectAllExceptions, worstSeverity, type OperationalException } from "./exceptions";
import { buildMorningSummary } from "./attention-summary";
```

- [ ] **Step 2: Make `todayGraph()` a function of live attention data**

Find:

```ts
function todayGraph() {
  const centerData: UniverseNodeData = { kind: "today", label: "TODAY", clickable: false };
  const ringOne: { id: string; data: UniverseNodeData }[] = [
    {
      id: "hub:contracts",
      data: {
        kind: "contracts-hub",
        label: "CONTRACTS",
        sublabel: "What must we deliver?",
        clickable: true,
        center: { kind: "contract-category", domain: "AMC", status: "__root__" },
        groupKey: "contracts",
      },
    },
    {
      id: "hub:staff",
      data: {
        kind: "staff-hub",
        label: "STAFF",
        sublabel: "Who do I have?",
        clickable: true,
        center: { kind: "staff-category" },
        groupKey: "staff",
      },
    },
    {
      id: "hub:schedules",
      data: {
        kind: "schedules-hub",
        label: "SCHEDULES",
        sublabel: "What is happening?",
        clickable: true,
        center: { kind: "schedule-category", category: "__root__" },
        groupKey: "schedules",
      },
    },
  ];
  return layoutAround({ centerId: "today", centerData, ringOne });
}
```

Replace with:

```ts
interface TodayAttention {
  totalCount: number;
  worstSeverity: OperationalException["severity"] | undefined;
  categoryCounts: Record<ExceptionCategory, number>;
  morningSummary: { operational: string; dataQuality?: string };
}

function todayGraph(attention: TodayAttention | undefined) {
  const operationsCount = attention?.categoryCounts.operations ?? 0;
  const peopleCount = attention?.categoryCounts.people ?? 0;
  const contractsBucketCount = attention
    ? attention.categoryCounts.finance +
      attention.categoryCounts.contracts +
      attention.categoryCounts["data-quality"]
    : 0;

  const centerData: UniverseNodeData = { kind: "today", label: "TODAY", clickable: false };
  const ringOne: { id: string; data: UniverseNodeData }[] = [
    {
      id: "hub:attention",
      data: {
        kind: "attention-hub",
        label: "ATTENTION",
        sublabel: attention ? `${attention.totalCount}` : "…",
        severity: attention?.worstSeverity,
        exception: Boolean(attention && attention.totalCount > 0),
        clickable: true,
        center: { kind: "attention", category: "__root__" },
        groupKey: "attention",
      },
    },
    {
      id: "hub:contracts",
      data: {
        kind: "contracts-hub",
        label: "CONTRACTS",
        sublabel: contractsBucketCount > 0 ? `${contractsBucketCount} attention` : "What must we deliver?",
        exception: contractsBucketCount > 0,
        clickable: true,
        center: { kind: "contract-category", domain: "AMC", status: "__root__" },
        groupKey: "contracts",
      },
    },
    {
      id: "hub:staff",
      data: {
        kind: "staff-hub",
        label: "STAFF",
        sublabel: peopleCount > 0 ? `${peopleCount} attention` : "Who do I have?",
        exception: peopleCount > 0,
        clickable: true,
        center: { kind: "staff-category" },
        groupKey: "staff",
      },
    },
    {
      id: "hub:schedules",
      data: {
        kind: "schedules-hub",
        label: "SCHEDULES",
        sublabel: operationsCount > 0 ? `${operationsCount} attention` : "What is happening?",
        exception: operationsCount > 0,
        clickable: true,
        center: { kind: "schedule-category", category: "__root__" },
        groupKey: "schedules",
      },
    },
  ];
  return layoutAround({ centerId: "today", centerData, ringOne });
}
```

- [ ] **Step 3: Fetch live exceptions and derive `TodayAttention`, replacing the pure-static
  memo**

Find:

```ts
  const isToday = centerEntity.kind === "today";
  const {
    data: fetchedGraph,
    isLoading,
    error,
    refetch,
  } = useUniverseGraph(centerEntity, { enabled: !isToday });
  // Empty deps: todayGraph() is pure with no inputs, so this is computed once and
  // stays referentially stable for the life of the component.
  const todayGraphMemo = useMemo(() => todayGraph(), []);
  const graph = isToday ? todayGraphMemo : (fetchedGraph ?? EMPTY_GRAPH);
```

Replace with:

```ts
  const isToday = centerEntity.kind === "today";
  const {
    data: fetchedGraph,
    isLoading,
    error,
    refetch,
  } = useUniverseGraph(centerEntity, { enabled: !isToday });

  // Always enabled (not gated by isToday) - reverse-navigation on other entity screens shares
  // this exact cache entry via useUniverseGraph's own queryClient.fetchQuery calls, so a click
  // into a Contract right after viewing TODAY reuses this result instead of re-running all 6
  // detectors.
  const { data: exceptionsData } = useQuery({
    queryKey: ["operational-exceptions"],
    queryFn: detectAllExceptions,
    staleTime: 60_000,
  });

  const todayAttention: TodayAttention | undefined = useMemo(() => {
    if (!exceptionsData) return undefined;
    const categoryCounts: Record<ExceptionCategory, number> = {
      operations: 0,
      people: 0,
      finance: 0,
      contracts: 0,
      "data-quality": 0,
    };
    for (const exception of exceptionsData) {
      categoryCounts[exception.category] += 1;
    }
    return {
      totalCount: exceptionsData.length,
      worstSeverity: worstSeverity(exceptionsData),
      categoryCounts,
      morningSummary: buildMorningSummary(exceptionsData),
    };
  }, [exceptionsData]);

  const todayGraphMemo = useMemo(() => todayGraph(todayAttention), [todayAttention]);
  const graph = isToday ? todayGraphMemo : (fetchedGraph ?? EMPTY_GRAPH);
```

- [ ] **Step 4: Render the morning-summary banner (TODAY only, bottom-left — the breadcrumb bar
  that normally lives there is hidden on TODAY, so this spot is free)**

Find:

```ts
      {relationshipReason && (
```

Replace with:

```ts
      {isToday && todayAttention && (
        <div
          style={{
            position: "absolute",
            bottom: 16,
            left: 16,
            zIndex: 10,
            maxWidth: 320,
            background: "#1c2128",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 8,
            padding: "10px 14px",
            color: "#e6edf3",
            fontSize: 12,
            boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
          }}
        >
          <div>{todayAttention.morningSummary.operational}</div>
          {todayAttention.morningSummary.dataQuality && (
            <div style={{ marginTop: 6, color: "#8a93a3" }}>
              {todayAttention.morningSummary.dataQuality}
            </div>
          )}
        </div>
      )}
      {relationshipReason && (
```

- [ ] **Step 5: Add a manual refresh control for attention data (item 19 — the GM must be able to
  refresh without a full browser reload)**

`useUniverseGraph`'s existing error state already has a "Retry" button that calls its own
`refetch()`; this is the equivalent for the `["operational-exceptions"]` cache entry
specifically, since that query runs independently of whichever screen is centered.

Find:

```ts
  const isMobile = useIsMobile();
  const [centerEntity, setCenterEntity] = useState<CenterEntity>({ kind: "today" });
```

Replace with:

```ts
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const [centerEntity, setCenterEntity] = useState<CenterEntity>({ kind: "today" });
```

Find:

```ts
      {isToday && todayAttention && (
        <div
          style={{
            position: "absolute",
            bottom: 16,
            left: 16,
            zIndex: 10,
            maxWidth: 320,
            background: "#1c2128",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 8,
            padding: "10px 14px",
            color: "#e6edf3",
            fontSize: 12,
            boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
          }}
        >
          <div>{todayAttention.morningSummary.operational}</div>
          {todayAttention.morningSummary.dataQuality && (
            <div style={{ marginTop: 6, color: "#8a93a3" }}>
              {todayAttention.morningSummary.dataQuality}
            </div>
          )}
        </div>
      )}
```

Replace with:

```ts
      {isToday && todayAttention && (
        <div
          style={{
            position: "absolute",
            bottom: 16,
            left: 16,
            zIndex: 10,
            maxWidth: 320,
            background: "#1c2128",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 8,
            padding: "10px 14px",
            color: "#e6edf3",
            fontSize: 12,
            boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
            <div>
              <div>{todayAttention.morningSummary.operational}</div>
              {todayAttention.morningSummary.dataQuality && (
                <div style={{ marginTop: 6, color: "#8a93a3" }}>
                  {todayAttention.morningSummary.dataQuality}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["operational-exceptions"] })}
              title="Refresh attention data"
              style={{
                flexShrink: 0,
                background: "none",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 6,
                color: "#e6edf3",
                cursor: "pointer",
                fontSize: 11,
                fontWeight: 600,
                padding: "4px 8px",
              }}
            >
              Refresh
            </button>
          </div>
        </div>
      )}
```

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit`

Expected: zero errors.

- [ ] **Step 7: Cross-check against real data**

Confirm `todayAttention.categoryCounts` and `totalCount`, once the query resolves against real
data, equal `detectExceptionCounts()`'s real output (operations 4, people 2, finance 7,
contracts 3, data-quality 5, total 21) and that the rendered morning-summary banner text matches
Task 3's manually-traced expected string exactly.

- [ ] **Step 8: Commit**

```bash
git add src/features/operations-universe/OperationsUniverse.tsx
git commit -m "$(cat <<'EOF'
feat: attention UI - TODAY becomes live with real exception counts

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: `OperationsUniverse.tsx` — Attention Only mode

**Files:**
- Modify: `src/features/operations-universe/OperationsUniverse.tsx`

- [ ] **Step 1: Add the toggle state and the dimmed node/edge transforms**

Find:

```ts
  const onNodesChange = useCallback(
    (changes: NodeChange<Node<UniverseNodeData>>[]) =>
      setNodes((nds) => applyNodeChanges(changes, nds)),
    [],
  );
```

Replace with:

```ts
  const onNodesChange = useCallback(
    (changes: NodeChange<Node<UniverseNodeData>>[]) =>
      setNodes((nds) => applyNodeChanges(changes, nds)),
    [],
  );

  const [attentionOnly, setAttentionOnly] = useState(false);

  // Purely a render-time transform over the already-computed nodes/edges - no new fetching.
  // The center node and any node/edge flagged `exception` stay full-strength; everything else
  // dims. Works on any screen, not just TODAY/ATTENTION, so it "travels" with navigation.
  const displayNodes = useMemo(() => {
    if (!attentionOnly) return nodes;
    const centerId = graph.nodes[0]?.id;
    return nodes.map((node) =>
      node.id === centerId || node.data.exception
        ? node
        : { ...node, style: { ...node.style, opacity: 0.25 } },
    );
  }, [nodes, attentionOnly, graph.nodes]);

  const displayEdges = useMemo(() => {
    if (!attentionOnly) return graph.edges;
    return graph.edges.map((edge) => {
      const targetNode = nodes.find((node) => node.id === edge.target);
      return targetNode?.data.exception
        ? edge
        : { ...edge, style: { ...edge.style, opacity: 0.25 } };
    });
  }, [graph.edges, attentionOnly, nodes]);
```

- [ ] **Step 2: Render with the dimmed arrays and add the toggle button**

Find:

```ts
      <ReactFlow
        nodes={nodes}
        edges={graph.edges}
        nodeTypes={nodeTypes}
```

Replace with:

```ts
      <ReactFlow
        nodes={displayNodes}
        edges={displayEdges}
        nodeTypes={nodeTypes}
```

Find:

```ts
      <UniverseSearch
        onSelect={(entity) => navigateTo(entity)}
        avoidTopLeftRow={centerEntity.kind !== "today"}
      />
```

Replace with:

```ts
      <UniverseSearch
        onSelect={(entity) => navigateTo(entity)}
        avoidTopLeftRow={centerEntity.kind !== "today"}
      />
      <button
        type="button"
        onClick={() => setAttentionOnly((value) => !value)}
        style={{
          position: "absolute",
          bottom: 16,
          right: 16,
          zIndex: 11,
          background: attentionOnly ? "#dc4c4c" : "#1c2128",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 8,
          color: "#e6edf3",
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 700,
          padding: "8px 12px",
          boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
        }}
      >
        {attentionOnly ? "NORMAL VIEW" : "ATTENTION ONLY"}
      </button>
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`

Expected: zero errors.

Run: `npx eslint src/features/operations-universe/OperationsUniverse.tsx`

Expected: no new findings.

- [ ] **Step 4: Commit**

```bash
git add src/features/operations-universe/OperationsUniverse.tsx
git commit -m "$(cat <<'EOF'
feat: attention UI - Attention Only review mode

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Final verification and regression cross-checks

This is the "prove it" task, matching Phase 5a's own final task. No code changes.

**Files:** none.

- [ ] **Step 1: Full `npx tsc --noEmit` and `npx eslint` pass**

Run both across the whole `src/features/operations-universe/` directory. Expected: zero errors,
zero new warnings (any pre-existing prettier-only findings in `layout.ts`/`types.ts` untouched by
this plan are not regressions — confirm via `git blame` on any flagged line, same check Phase 5a
did).

- [ ] **Step 2: Cross-check every new UI aggregation against the engine directly**

Using the Supabase MCP tool, independently re-derive `detectExceptionCounts()`'s real category
distribution and total, and confirm: the ATTENTION root screen's per-category counts, the
branch-indicator sublabels (STAFF/CONTRACTS/SCHEDULES), and the morning-summary sentence all
agree with it exactly — no re-implemented detection logic drifting from the engine's own output.

- [ ] **Step 3: Confirm no double-counting across branch indicators**

Sum STAFF's count + SCHEDULES' count + CONTRACTS' count and confirm it equals the real total from
`detectExceptionCounts()` (21) — i.e. every exception is represented in exactly one hub's
sublabel, never zero or more than one.

- [ ] **Step 4: Re-confirm the PPM/work-order dedup guarantee through the new screens**

Trace, by the same real IDs Phase 5a's Task 6 already confirmed, that a converted PPM visit's
spawned work order appears exactly once across the ATTENTION tree (under Operations →
"Overdue Work Order", never also under "Overdue PPM") — the new screens must not introduce a
second counting path around Phase 5a's existing dedup rule.

- [ ] **Step 5: Regression-check every pre-5b screen still works**

Re-verify, by reading the current code and tracing at least one real record through each: STAFF
(employee list + attendance), CONTRACTS (AMC/FM/customer/work-order relationships), SCHEDULES
(PPM/work-order schedule), FINANCE (contract financial position), SEARCH (real entity search),
HISTORY (Back / Return to Today), and WHY CONNECTED (`relationshipReason` popovers) all still
navigate and render exactly as before — the riskiest change in this plan was injecting
`appendAttentionNode` into 5 shared if-chain branches, so this is not optional.

- [ ] **Step 6: Confirm no write action was added anywhere**

Grep the whole `src/features/operations-universe/` directory for `.insert(`, `.update(`,
`.delete(`, `.upsert(` — expected: zero matches. Every new screen/query added by this plan is
read-only, per the phase's explicit scope boundary.

- [ ] **Step 7: Report**

Summarize: the Phase 4b/5a reconciliation-count explanation (already resolved before
implementation began), the live TODAY ATTENTION count and category breakdown, the morning
summary's real output, the branch-indicator counts, confirmed reverse-navigation and
contract-rollup examples (with real IDs), confirmed dedup guarantee, `tsc`/`eslint` clean
confirmation, and an explicit statement that authenticated browser verification was not
performed (no credentials in this environment) rather than a claim that it was. This feeds
directly into the completion report format the user's brief (item 28) requires.
