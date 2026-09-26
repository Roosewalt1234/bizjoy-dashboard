// src/lib/gm-assistant/actions.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { WO_STATUS } from "@/lib/work-orders";
import { createActionToken } from "./action-tokens";
import type { AssistantContext, PendingAction, Suggestion } from "./types";

type WorkOrderStatus = (typeof WO_STATUS)[number];

export interface ActionResult {
  answer: string;
  suggestions: Suggestion[];
  pendingAction?: PendingAction;
}

export interface ActionDefinition {
  name: "assign_technician" | "update_work_order_status";
  matches: (normalizedQuestion: string) => boolean;
  buildPreview: (
    question: string,
    context: AssistantContext | undefined,
    supabase: SupabaseClient<Database>,
    userId: string,
  ) => Promise<ActionResult>;
}

// The trailing (?=...) lookahead bounds each capture at the first clause boundary (a
// coordinating conjunction or sentence punctuation) instead of sweeping to end-of-string, so a
// compound sentence like "reassign this to John and mark it complete" extracts "John" rather
// than "John and mark it complete".
const CLAUSE_BOUNDARY = String.raw`(?=\s+and\b|\s+but\b|[,.!?]|$)`;
const ASSIGN_PATTERNS: RegExp[] = [
  /\bassign\s+(.+?)\s+to\s+(?:this|it)\b/i,
  new RegExp(
    String.raw`\breassign\s+(?:this\s+)?(?:work\s*order\s+)?to\s+(.+?)${CLAUSE_BOUNDARY}`,
    "i",
  ),
  new RegExp(String.raw`\bchange\s+(?:the\s+)?technician\s+to\s+(.+?)${CLAUSE_BOUNDARY}`, "i"),
  new RegExp(String.raw`\bchange\s+it\s+to\s+(.+?)${CLAUSE_BOUNDARY}`, "i"),
];

function extractAssigneeName(question: string): string | null {
  for (const pattern of ASSIGN_PATTERNS) {
    const match = question.match(pattern);
    const name = match?.[1]?.replace(/[?.!]+$/, "").trim();
    if (name) return name;
  }
  return null;
}

const STATUS_KEYWORDS: Array<{ pattern: RegExp; status: WorkOrderStatus }> = [
  {
    pattern:
      /\bmark\s+(?:this|it)(?:\s+job|\s+work\s*order)?\s+(?:as\s+)?(?:complete|completed|done)\b/i,
    status: "Completed",
  },
  {
    pattern: /\bmark\s+(?:this|it)(?:\s+job|\s+work\s*order)?\s+(?:as\s+)?cancel(?:led|ed)?\b/i,
    status: "Cancelled",
  },
  { pattern: /\bcancel\s+(?:this|it)(?:\s+job|\s+work\s*order)?\b/i, status: "Cancelled" },
  {
    pattern: /\bmark\s+(?:this|it)(?:\s+job|\s+work\s*order)?\s+(?:as\s+)?in\s*progress\b/i,
    status: "In Progress",
  },
  { pattern: /\breopen\s+(?:this|it)\b/i, status: "Open" },
  {
    pattern: /\bmark\s+(?:this|it)(?:\s+job|\s+work\s*order)?\s+(?:as\s+)?open\b/i,
    status: "Open",
  },
  {
    pattern: /\bmark\s+(?:this|it)(?:\s+job|\s+work\s*order)?\s+(?:as\s+)?scheduled\b/i,
    status: "Scheduled",
  },
];

function extractTargetStatus(question: string): WorkOrderStatus | null {
  for (const { pattern, status } of STATUS_KEYWORDS) {
    if (pattern.test(question)) return status;
  }
  return null;
}

interface WorkOrderRow {
  id: string;
  wo_no: string | null;
  technician_id: string | null;
  technician_name: string | null;
  status: string;
}

export function workOrderTable(domain: "AMC" | "FM"): "work_orders" | "fm_work_orders" {
  return domain === "AMC" ? "work_orders" : "fm_work_orders";
}

async function loadWorkOrder(
  supabase: SupabaseClient<Database>,
  domain: "AMC" | "FM",
  id: string,
): Promise<WorkOrderRow | null> {
  const { data, error } = await supabase
    .from(workOrderTable(domain))
    .select("id, wo_no, technician_id, technician_name, status")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

interface EmployeeMatch {
  id: string;
  name: string;
}

/** Mirrors the real eligibility rule the existing technician pickers already use: active
 * employees only, matched by substring against the same displayed name a human would type into
 * the existing picker's combobox - not a new/invented matching heuristic. */
async function findActiveEmployees(
  supabase: SupabaseClient<Database>,
  name: string,
): Promise<EmployeeMatch[]> {
  const { data, error } = await supabase
    .from("employees")
    .select("id, full_name, first_name, last_name")
    .eq("status", "Active");
  if (error) throw error;
  const term = name.trim().toLowerCase();
  return (data ?? [])
    .map((e) => ({
      id: e.id,
      name: e.full_name ?? `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim(),
    }))
    .filter((e) => e.name.toLowerCase().includes(term));
}

export async function getEmployeeDisplayName(
  supabase: SupabaseClient<Database>,
  employeeId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("employees")
    .select("full_name, first_name, last_name")
    .eq("id", employeeId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return data.full_name ?? (`${data.first_name ?? ""} ${data.last_name ?? ""}`.trim() || null);
}

/** The one real, reusable "is this technician busy" signal in this codebase - open (status NOT
 * IN Completed/Cancelled) work orders across both domains. Informational only, never blocking -
 * there is no real per-date scheduling-conflict data anywhere in this app to check against. */
async function countOpenWorkOrders(
  supabase: SupabaseClient<Database>,
  employeeId: string,
): Promise<number> {
  const [amc, fm] = await Promise.all([
    supabase
      .from("work_orders")
      .select("id", { count: "exact", head: true })
      .eq("technician_id", employeeId)
      .not("status", "in", "(Completed,Cancelled)"),
    supabase
      .from("fm_work_orders")
      .select("id", { count: "exact", head: true })
      .eq("technician_id", employeeId)
      .not("status", "in", "(Completed,Cancelled)"),
  ]);
  return (amc.count ?? 0) + (fm.count ?? 0);
}

export const ACTIONS: ActionDefinition[] = [
  {
    name: "assign_technician",
    matches: (q) => ASSIGN_PATTERNS.some((pattern) => pattern.test(q)),
    async buildPreview(question, context, supabase, userId) {
      const entity = context?.centerEntity;
      if (!entity || entity.kind !== "work-order") {
        return {
          answer: "Open a work order first, then ask me to assign someone to it.",
          suggestions: [],
        };
      }
      const name = extractAssigneeName(question);
      if (!name) {
        return { answer: "Who would you like me to assign?", suggestions: [] };
      }

      const workOrder = await loadWorkOrder(supabase, entity.domain, entity.id);
      if (!workOrder) {
        return { answer: "I couldn't find that work order anymore.", suggestions: [] };
      }

      const candidates = await findActiveEmployees(supabase, name);
      if (candidates.length === 0) {
        return {
          answer: `I couldn't find an active employee named "${name}".`,
          suggestions: [],
        };
      }
      if (candidates.length > 1) {
        return {
          answer: `I found ${candidates.length} active employees matching "${name}". Which one do you mean?`,
          suggestions: candidates.map((c) => ({
            label: c.name,
            question: `Assign ${c.name} to this`,
          })),
        };
      }
      const chosen = candidates[0];

      const openCount = await countOpenWorkOrders(supabase, chosen.id);
      const openNote =
        openCount > 0
          ? ` ${chosen.name} already has ${openCount} open work order${openCount === 1 ? "" : "s"}.`
          : "";

      const woLabel = workOrder.wo_no ?? workOrder.id;
      const currentLabel = workOrder.technician_name || "— unassigned —";
      const preview =
        `Proposed Change\n` +
        `Work Order: ${woLabel}\n` +
        `Current Technician: ${currentLabel}\n` +
        `New Technician: ${chosen.name}`;

      const token = createActionToken({
        action: "assign_technician",
        domain: entity.domain,
        workOrderId: workOrder.id,
        expectedCurrentValue: workOrder.technician_id,
        proposedNewValue: chosen.id,
        userId,
      });

      return {
        answer: preview + openNote,
        suggestions: [],
        pendingAction: { token, preview: preview + openNote, actionLabel: "Assign Technician" },
      };
    },
  },
  {
    name: "update_work_order_status",
    matches: (q) => STATUS_KEYWORDS.some(({ pattern }) => pattern.test(q)),
    async buildPreview(question, context, supabase, userId) {
      const entity = context?.centerEntity;
      if (!entity || entity.kind !== "work-order") {
        return {
          answer: "Open a work order first, then ask me to update its status.",
          suggestions: [],
        };
      }
      const targetStatus = extractTargetStatus(question);
      if (!targetStatus) {
        return { answer: "What status should I set?", suggestions: [] };
      }

      const workOrder = await loadWorkOrder(supabase, entity.domain, entity.id);
      if (!workOrder) {
        return { answer: "I couldn't find that work order anymore.", suggestions: [] };
      }

      const woLabel = workOrder.wo_no ?? workOrder.id;
      if (workOrder.status === targetStatus) {
        return { answer: `${woLabel} is already marked ${targetStatus}.`, suggestions: [] };
      }

      const preview =
        `Proposed Change\n` +
        `Work Order: ${woLabel}\n` +
        `Current Status: ${workOrder.status}\n` +
        `New Status: ${targetStatus}`;

      const token = createActionToken({
        action: "update_work_order_status",
        domain: entity.domain,
        workOrderId: workOrder.id,
        expectedCurrentValue: workOrder.status,
        proposedNewValue: targetStatus,
        userId,
      });

      return {
        answer: preview,
        suggestions: [],
        pendingAction: { token, preview, actionLabel: "Update Status" },
      };
    },
  },
];

export function findMatchingAction(question: string): ActionDefinition | undefined {
  const normalized = question.trim().toLowerCase();
  return ACTIONS.find((action) => action.matches(normalized));
}
