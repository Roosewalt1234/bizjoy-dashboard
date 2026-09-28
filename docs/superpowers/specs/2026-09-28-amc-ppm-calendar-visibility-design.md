# AMC Scheduling Calendar: Show PPM Dates from `contracts.ppm_schedule` — Design

**Status:** Approved by user, 2026-09-28.

## Problem

PPM dates scheduled for November 2026 (and every other month) on AMC contracts don't show up
on the AMC Scheduling calendar (`src/routes/_authenticated/amc-scheduling.tsx`), even though
they're entered and actively maintained by staff.

**Root cause (confirmed via live data):** the calendar's `calendarEvents` memo
(`amc-scheduling.tsx:288-335`) builds events from exactly three sources — `amc_ppm_visits` rows,
`contracts.water_tank_cleaning_date` / `ac_duct_cleaning_date`, and `work_orders` where
`module_type = 'AMC'`. None of these is where PPM dates actually live. The real PPM data sits in
`contracts.ppm_schedule`, a jsonb column shaped:

```json
{
  "dates":  { "ac_units": ["2026-11-05", ...], "water_pumps": [...], "electrical": [...], "plumbing": [...], "solar": [...], "water_tank": [...] },
  "status": { "ac_units": ["", "Scheduled", "Completed", ...], ... },
  "freq":   { "ac_units": 3, ... }
}
```

`dates[category][i]` and `status[category][i]` are aligned by index. `status` holds a manual
override (`"Scheduled"` or `"Completed"`) or `""` for auto-computed. This column is edited today
via the AMC contract edit dialog in `src/components/contracts-page.tsx`.

Live query confirmed: `amc_ppm_schedules` has 0 rows, `amc_ppm_visits` has only 2 rows total
(Sept 1 and Oct 1, 2026) — this newer parallel mechanism was built but never adopted. All 46 real
AMC contracts maintain their PPM data in `contracts.ppm_schedule` instead (18 with real November
2026 dates). Fix: read `ppm_schedule` live as a new calendar event source. Do not migrate data
into `amc_ppm_visits` — it would abandon the mechanism staff actually use today.

## Section A: New calendar event source

`amc-scheduling.tsx`'s `contracts` lookup query (`amc-scheduling.tsx:221-232`) adds
`ppm_schedule` to its `select(...)`:

```ts
.select("id, title, contract_no, customer_name, water_tank_cleaning_date, ac_duct_cleaning_date, ppm_schedule")
```

`ContractLookup` (`amc-scheduling.tsx:56-63`) gains:

```ts
type PpmScheduleJson = {
  dates?: Record<string, string[]>;
  status?: Record<string, string[]>;
  freq?: Record<string, number>;
};

type ContractLookup = {
  id: string;
  title: string;
  contract_no: string | null;
  customer_name: string | null;
  water_tank_cleaning_date: string | null;
  ac_duct_cleaning_date: string | null;
  ppm_schedule: PpmScheduleJson | null;
};
```

The `calendarEvents` memo (`amc-scheduling.tsx:288-335`) gains a fourth loop, reusing the exact
same category list and status logic `contracts-page.tsx` already uses (`PPM_SERVICES`,
`computePpmStatus`) so the calendar's computed status always agrees with the contract edit
dialog's:

```ts
const PPM_CATEGORY_LABELS: Record<string, string> = {
  ac_units: "AC Units",
  water_pumps: "Water Pumps & Motors",
  electrical: "Fixed Electrical Fittings",
  plumbing: "Plumbing Units",
  solar: "Solar Water Heater",
  water_tank: "Water Tank Cleaning",
};

function computePpmStatus(date: string, override: string): "Not Yet Due" | "Due" | "Overdue" | "Scheduled" | "Completed" {
  if (override === "Completed") return "Completed";
  if (override === "Scheduled") return "Scheduled";
  if (!date) return "Not Yet Due";
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const target = new Date(date); target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today.getTime() - target.getTime()) / 86400000);
  if (diffDays <= 0) return "Not Yet Due";
  if (diffDays <= 15) return "Due";
  return "Overdue";
}

function ppmEventColorClass(status: string): string {
  switch (status) {
    case "Completed": return "bg-emerald-100 text-emerald-900";
    case "Scheduled":  return "bg-sky-100 text-sky-900";
    case "Due":        return "bg-amber-100 text-amber-900";
    case "Overdue":    return "bg-red-100 text-red-900";
    default:           return "bg-slate-100 text-slate-700"; // Not Yet Due
  }
}

for (const contract of contracts) {
  const label = contract.contract_no ?? contract.customer_name ?? "Contract";
  const dates = contract.ppm_schedule?.dates ?? {};
  const overrides = contract.ppm_schedule?.status ?? {};
  for (const category of Object.keys(PPM_CATEGORY_LABELS)) {
    const categoryDates = dates[category] ?? [];
    const categoryOverrides = overrides[category] ?? [];
    categoryDates.forEach((date, i) => {
      if (!date) return;
      const status = computePpmStatus(date, categoryOverrides[i] ?? "");
      events.push({
        id: `ppm-${contract.id}-${category}-${i}`,
        date,
        title: `PPM: ${PPM_CATEGORY_LABELS[category]} — ${label}`,
        subtitle: status,
        colorClass: ppmEventColorClass(status),
      });
    });
  }
}
```

Both `computePpmStatus` and the category list/labels are duplicated (not imported) from
`contracts-page.tsx`, since that file doesn't currently export them and the two route files
aren't otherwise coupled — matching the existing pattern where `amc-scheduling.tsx` already
carries its own local `ContractLookup` shape rather than importing one.

## Section B: Clicking a PPM event — a small status-update dialog

`SchedulingCalendar`'s `onEventClick` only hands back the clicked `CalendarEvent` — no click
position — and every existing event type already responds to a click by opening a centered
`Dialog` (`openOneOffEdit`, `openCleaningEditor`, the work-order dialog), not a popover anchored
to the chip. A `ppm_schedule`-sourced event follows the same pattern rather than introducing a
new positioning mechanism into `SchedulingCalendar`.

`handleCalendarEventClick` (`amc-scheduling.tsx:337-362`) gains a branch:

```ts
if (event.id.startsWith("ppm-")) {
  const [, contractId, category, indexStr] = event.id.split("-");
  // category itself may contain hyphens (it doesn't today, but guard anyway) —
  // parse from the right instead:
  const parts = event.id.split("-");
  const index = Number(parts[parts.length - 1]);
  const categoryKey = parts.slice(2, -1).join("-");
  const contractIdParsed = parts[1];
  const contract = contracts.find((c) => c.id === contractIdParsed);
  if (contract) {
    setPpmEditTarget({ contract, category: categoryKey, index });
    setPpmEditOpen(true);
  }
  return;
}
```

(The plan will replace this sketch with a clean, unambiguous ID scheme — e.g. joining with a
separator that can't collide, such as `ppm|<contractId>|<category>|<index>` — rather than
splitting on `-`, since `contract.id` is itself a UUID containing hyphens. Flagging here so the
implementation doesn't copy the collision-prone version above.)

A new small `Dialog` (sized like the existing one-off-visit dialog, not the full multi-tab
contract editor) shows:
- Contract name + contract no
- Category label
- The date (read-only in this dialog)
- A `Select` with `PPM_STATUS_OPTIONS = ["Auto", "Scheduled", "Completed"]` (same values
  `contracts-page.tsx` already uses), pre-filled with the current override or `"Auto"`
- A **Save** button that persists the change (Section C)
- A **View full contract** button/link (Section D)

## Section C: Saving a status change

On Save, the dialog:
1. Takes the target contract's current `ppm_schedule` (already in the cached `contracts` query
   result — no extra fetch).
2. Clones it and sets `status[category][index]` to the new value (`""` for `"Auto"`), extending
   the `status[category]` array with `""` entries if it's shorter than `dates[category]` (mirrors
   how `contracts-page.tsx` already tolerates a shorter/missing status array via `overrides[i] ??
   ""`).
3. Runs `supabase.from("contracts").update({ ppm_schedule: updated }).eq("id", contract.id)` —
   only this one column, not a full contract save.
4. On success: `queryClient.invalidateQueries({ queryKey: ["contracts-lookup-amc-scheduling"] })`
   so the calendar's chip color/subtitle updates immediately, closes the dialog, and shows a
   `toast.success(...)` (matching this file's existing toast usage elsewhere, e.g. after saving a
   one-off visit).
5. On error: `toast.error(...)`, dialog stays open so the user can retry.

## Section D: "View full contract" — a small new deep-link, not an existing mechanism

Investigation finding that changes the original framing: there is **no existing way** to jump to
a specific contract's edit dialog from another route. `/amc-contracts` (`ContractsPage` in
`contracts-page.tsx`) is the only place the PPM edit `Select` controls exist, and its edit dialog
opens purely from in-memory list-row state (`setEditing(r); setOpen(true)`) — no URL param drives
it today. The separate `/amc-contracts/$id` route (`ContractWorkspace`) is a different, read-only
summary workspace with no PPM-editing controls, so it isn't a substitute.

This section is therefore a small, contained addition, not a reuse of something that already
exists:

- `ContractsPage` (`contracts-page.tsx`) reads an `edit` search param via TanStack Router's
  `Route.useSearch()` (the `/amc-contracts` route gains a `validateSearch` that accepts an
  optional `edit?: string`). On mount, if `edit` is present and matches a loaded contract row,
  it calls the same `setEditing(row); setOpen(true)` the row-level Edit button already calls, then
  clears the param (`navigate({ search: {} , replace: true })`) so a refresh doesn't reopen it.
- "View full contract" in the new PPM dialog navigates to `/amc-contracts?edit=<contract.id>`.

This is the smallest change that gives a real "jump straight into this contract, ready to edit"
experience, reusing the exact same dialog and `Select` controls staff already use today — the
only new code is the search-param wiring to auto-open it.

## What does NOT change

- `contracts-page.tsx`'s own PPM editing UI and its full contract edit dialog — untouched except
  for the new `edit` search-param auto-open in Section D.
- `amc_ppm_visits`, `amc_ppm_schedules`, water/AC cleaning dates, work orders — all three existing
  calendar sources keep working exactly as they do today; this is purely additive.
- No schema migration — `ppm_schedule` already exists and is already fully populated.
- `ContractWorkspace` (`/amc-contracts/$id`) — untouched, not part of this fix.

## Deferred (separate sub-projects, not part of this spec)

- User Permissions page "select all" button.
- AMC Scheduling *modal* (the Add/Edit Schedule dialog, a different feature from this calendar's
  event display) gaining a time field and contract-date auto-population.
