// Converts due FM PPM visits into fm_work_orders. Meant to be called by an external
// scheduler (e.g. n8n) on a cron - n8n's job is scheduling + sending the Telegram
// notification; this function is the single source of truth for the conversion itself
// (WO numbering, SLA due-time calculation, field mapping), reused from the same logic
// as the in-app "Convert to Work Order" button so the two never drift apart.
//
// Auth: not a user-facing endpoint, so it does not use Supabase JWT auth. Instead it
// checks a shared secret header. Deploy with verify_jwt=false and set the
// AUTOMATION_SHARED_SECRET secret via the Supabase Dashboard before calling it.
//
// Modes (POST body):
//   { "visit_id": "<uuid>" }                 - convert exactly this visit (idempotent)
//   { "mode": "due", "within_days": 3 }      - convert every visit due within N days
//                                               (default 3) that isn't converted yet

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const AUTOMATION_SECRET = Deno.env.get("AUTOMATION_SHARED_SECRET");

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// ---- Ported 1:1 from src/lib/fm-sla.ts (pure functions, kept in sync manually) ----

type SlaPolicyLike = {
  id?: string | null;
  response_minutes?: number | null;
  completion_minutes?: number | null;
  response_hours?: number | null;
  completion_hours?: number | null;
  priority?: string | null;
  request_type?: string | null;
  service_category_id?: string | null;
};

function minutesFromPolicy(policy: SlaPolicyLike | null | undefined, kind: "response" | "completion") {
  if (!policy) return null;
  const minuteValue = kind === "response" ? policy.response_minutes : policy.completion_minutes;
  if (minuteValue != null && Number.isFinite(Number(minuteValue))) return Number(minuteValue);
  const hourValue = kind === "response" ? policy.response_hours : policy.completion_hours;
  if (hourValue != null && Number.isFinite(Number(hourValue))) return Number(hourValue) * 60;
  return null;
}

function addMinutesIso(baseIso: string | null | undefined, minutes: number | null) {
  if (!baseIso || minutes == null) return null;
  const base = new Date(baseIso);
  if (Number.isNaN(base.getTime())) return null;
  return new Date(base.getTime() + minutes * 60 * 1000).toISOString();
}

function isScheduleBasedPolicy(policy: SlaPolicyLike | null | undefined) {
  const response = minutesFromPolicy(policy, "response");
  const completion = minutesFromPolicy(policy, "completion");
  return !response && !completion;
}

function scheduleBasedDueTimes(scheduledDate: string | null | undefined) {
  if (!scheduledDate) return { response_due_at: null, completion_due_at: null };
  const due = new Date(`${scheduledDate}T23:59:59`);
  if (Number.isNaN(due.getTime())) return { response_due_at: null, completion_due_at: null };
  return { response_due_at: null, completion_due_at: due.toISOString() };
}

function calculateDueTimes(reportedAt: string | null | undefined, policy: SlaPolicyLike | null | undefined) {
  return {
    response_due_at: addMinutesIso(reportedAt, minutesFromPolicy(policy, "response")),
    completion_due_at: addMinutesIso(reportedAt, minutesFromPolicy(policy, "completion")),
  };
}

function calculateSlaStatus({ dueAt, actualAt, paused }: { dueAt?: string | null; actualAt?: string | null; paused?: boolean }) {
  if (paused) return "Paused";
  if (!dueAt) return "Not Applicable";
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) return "Not Applicable";
  if (actualAt) {
    const actual = new Date(actualAt);
    if (Number.isNaN(actual.getTime())) return "Not Applicable";
    return actual.getTime() <= due.getTime() ? "Within SLA" : "Breached";
  }
  const remainingMs = due.getTime() - Date.now();
  if (remainingMs < 0) return "Breached";
  if (remainingMs <= 2 * 60 * 60 * 1000) return "At Risk";
  return "Not Started";
}

// ---- Conversion logic (ported from src/lib/fm-ppm-convert.ts) ----

async function convertVisit(visitId: string) {
  const { data: visit, error: visitError } = await supabase
    .from("ppm_visits")
    .select(
      "id, contract_id, asset_id, service_category_id, planned_date, due_date, notes, work_order_id, ppm_schedules:ppm_schedule_id(schedule_name), contract_assets:asset_id(asset_tag, description, asset_type, location), service_categories:service_category_id(name)",
    )
    .eq("id", visitId)
    .single();
  if (visitError) throw new Error(`Visit not found: ${visitError.message}`);
  if (visit.work_order_id) {
    const { data: existing } = await supabase
      .from("fm_work_orders")
      .select("id, wo_no")
      .eq("id", visit.work_order_id)
      .maybeSingle();
    return { visit_id: visitId, work_order_id: visit.work_order_id, wo_no: existing?.wo_no ?? null, already_converted: true };
  }

  const { data: contract } = await supabase
    .from("fm_contracts")
    .select("customer_id, customer_name, site_name")
    .eq("id", visit.contract_id)
    .maybeSingle();

  const assets = visit.contract_assets as any;
  const categories = visit.service_categories as any;
  const schedules = visit.ppm_schedules as any;
  const assetLabel = assets?.asset_tag ?? assets?.description ?? assets?.asset_type ?? "";
  const categoryName = categories?.name ?? "PPM";
  const plannedDate = visit.planned_date ?? visit.due_date ?? null;

  const { data: woNo } = await supabase.rpc("next_doc_no", { kind: "work_order" });

  const payload: Record<string, unknown> = {
    wo_no: woNo ?? null,
    contract_id: visit.contract_id,
    customer_id: contract?.customer_id ?? null,
    customer_name: contract?.customer_name ?? null,
    requested_date: new Date().toISOString().slice(0, 10),
    scheduled_date: plannedDate,
    service_type: categoryName,
    location: assets?.location ?? contract?.site_name ?? null,
    priority: "Medium",
    problem_reported: `${categoryName} planned preventive maintenance${assetLabel ? ` - ${assetLabel}` : ""}`,
    work_requested: schedules?.schedule_name ?? "Complete planned preventive maintenance visit",
    notes: visit.notes ?? null,
    status: "Open",
    asset_id: visit.asset_id ?? null,
    ppm_visit_id: visit.id,
    service_category_id: visit.service_category_id ?? null,
    request_type: "PPM",
    reported_at: new Date().toISOString(),
  };

  const { data: policies } = await supabase
    .from("sla_policies")
    .select("*")
    .eq("active", true)
    .eq("contract_id", visit.contract_id);

  const ppmTypes = ["PPM", "Preventive Maintenance", "Planned Preventive Maintenance"];
  const candidates = ((policies ?? []) as SlaPolicyLike[]).filter(
    (item) => !item.service_category_id || item.service_category_id === payload.service_category_id,
  );
  const policy =
    candidates.find((item) => ppmTypes.includes(item.request_type ?? "")) ??
    candidates.find((item) => !item.priority || item.priority === "P3 Medium") ??
    null;

  const dueTimes =
    !policy || isScheduleBasedPolicy(policy)
      ? scheduleBasedDueTimes(plannedDate as string | null)
      : calculateDueTimes(payload.reported_at as string, policy);
  payload.response_due_at = dueTimes.response_due_at;
  payload.completion_due_at = dueTimes.completion_due_at;
  payload.response_sla_status = calculateSlaStatus({ dueAt: payload.response_due_at as string | null });
  payload.completion_sla_status = calculateSlaStatus({ dueAt: payload.completion_due_at as string | null });

  const { data: inserted, error: insertError } = await supabase
    .from("fm_work_orders")
    .insert(payload)
    .select("id, wo_no")
    .single();
  if (insertError) throw new Error(`Insert failed: ${insertError.message}`);

  const { error: updateError } = await supabase
    .from("ppm_visits")
    .update({ work_order_id: inserted.id, status: "Converted" })
    .eq("id", visit.id);
  if (updateError) throw new Error(`Visit update failed: ${updateError.message}`);

  return {
    visit_id: visitId,
    work_order_id: inserted.id,
    wo_no: inserted.wo_no,
    already_converted: false,
    contract_id: visit.contract_id,
    customer_name: contract?.customer_name ?? null,
    site_name: contract?.site_name ?? null,
    scheduled_date: plannedDate,
    service_type: categoryName,
    location: payload.location,
    priority: payload.priority,
  };
}

Deno.serve(async (req: Request) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type, x-automation-secret",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  if (!AUTOMATION_SECRET || req.headers.get("x-automation-secret") !== AUTOMATION_SECRET) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));

    if (body.visit_id) {
      const result = await convertVisit(body.visit_id);
      return new Response(JSON.stringify(result), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    // "due" mode: find and convert every not-yet-converted visit within the window.
    const withinDays = Number.isFinite(Number(body.within_days)) ? Number(body.within_days) : 3;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + withinDays);
    const cutoffIso = cutoff.toISOString().slice(0, 10);

    const { data: dueVisits, error: dueError } = await supabase
      .from("ppm_visits")
      .select("id")
      .is("work_order_id", null)
      .eq("status", "Planned")
      .lte("planned_date", cutoffIso);
    if (dueError) throw new Error(dueError.message);

    const results = [];
    for (const v of dueVisits ?? []) {
      try {
        results.push(await convertVisit(v.id));
      } catch (err) {
        results.push({ visit_id: v.id, error: (err as Error).message });
      }
    }
    return new Response(JSON.stringify({ converted: results.length, results }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
