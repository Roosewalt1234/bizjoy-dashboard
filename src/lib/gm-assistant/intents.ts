// src/lib/gm-assistant/intents.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  detectAllExceptions,
  detectOverduePpm,
  detectStaffAttendanceIssues,
} from "@/features/operations-universe/exceptions";
import { buildMorningSummary } from "@/features/operations-universe/attention-summary";
import { computePaymentStatus } from "@/features/operations-universe/payment-status";
import type { AssistantContext, NavigationCommand, Suggestion } from "./types";

export interface IntentResult {
  answer: string;
  navigation?: NavigationCommand;
  suggestions: Suggestion[];
}

export interface IntentDefinition {
  name: string;
  matches: (normalizedQuestion: string) => boolean;
  run: (
    question: string,
    context: AssistantContext | undefined,
    supabase: SupabaseClient<Database>,
  ) => Promise<IntentResult>;
}

function normalize(question: string): string {
  return question.trim().toLowerCase();
}

function includesAny(text: string, phrases: string[]): boolean {
  return phrases.some((phrase) => text.includes(phrase));
}

export const INTENTS: IntentDefinition[] = [
  {
    name: "attention_summary",
    matches: (q) =>
      includesAny(q, [
        "needs my attention",
        "what needs attention",
        "attention summary",
        "critical issues",
        "show attention",
        "what's overdue",
      ]),
    async run() {
      const exceptions = await detectAllExceptions();
      const { operational, dataQuality } = buildMorningSummary(exceptions);
      return {
        answer: dataQuality ? `${operational} ${dataQuality}` : operational,
        navigation: { type: "open_attention" },
        suggestions: [{ label: "Show Attention", question: "Show attention" }],
      };
    },
  },
  {
    name: "overdue_ppm_list",
    matches: (q) => includesAny(q, ["overdue ppm", "overdue ppms"]),
    async run() {
      const overdue = await detectOverduePpm();
      return {
        answer:
          overdue.length === 0
            ? "No overdue PPM visits were found."
            : `${overdue.length} PPM visit${overdue.length === 1 ? " is" : "s are"} overdue.`,
        navigation: {
          type: "focus_entity",
          entity: { kind: "attention-type", category: "operations", title: "Overdue PPM" },
        },
        suggestions: [{ label: "Show Attention", question: "What needs my attention?" }],
      };
    },
  },
  {
    name: "staff_no_attendance",
    matches: (q) =>
      includesAny(q, [
        "no attendance",
        "hasn't checked in",
        "attendance exceptions",
        "who has no attendance",
      ]),
    async run() {
      const issues = await detectStaffAttendanceIssues();
      const names = issues.map((issue) => issue.recordLabel);
      return {
        answer:
          names.length === 0
            ? "Everyone assigned open work today has an attendance record."
            : `${names.length} staff member${names.length === 1 ? "" : "s"} with open work ${
                names.length === 1 ? "has" : "have"
              } no attendance today: ${names.join(", ")}.`,
        suggestions: [{ label: "Show Attention", question: "What needs my attention?" }],
      };
    },
  },
  {
    name: "staff_available_today",
    matches: (q) => includesAny(q, ["staff available", "available today", "how many staff"]),
    async run(_question, _context, supabase) {
      const { data, error } = await supabase.from("employees").select("id").eq("status", "Active");
      if (error) throw error;
      return {
        answer: `${data?.length ?? 0} active staff members are on file today.`,
        suggestions: [{ label: "Attendance issues", question: "Who has no attendance today?" }],
      };
    },
  },
  {
    name: "contract_outstanding",
    matches: (q) => includesAny(q, ["outstanding", "how much is owed", "what's owed"]),
    async run(_question, context, supabase) {
      const entity = context?.centerEntity;
      if (!entity || (entity.kind !== "contract" && entity.kind !== "contract-finance")) {
        return {
          answer:
            "Which contract? Open a contract in the Universe first, or ask me to show it by name.",
          suggestions: [],
        };
      }
      if (entity.domain !== "AMC") {
        return {
          answer: "This FM contract has no real payment records on file yet.",
          suggestions: [],
        };
      }
      const { data: payments, error } = await supabase
        .from("contract_payments")
        .select("value, payment_date, received_date")
        .eq("contract_id", entity.id);
      if (error) throw error;
      let outstanding = 0;
      let overdue = 0;
      for (const payment of payments ?? []) {
        const status = computePaymentStatus(payment.payment_date, payment.received_date);
        if (status === "Due" || status === "Overdue") outstanding += payment.value ?? 0;
        if (status === "Overdue") overdue += payment.value ?? 0;
      }
      const answer =
        overdue > 0
          ? `${context.displayLabel} has AED ${outstanding} outstanding. AED ${overdue} is overdue.`
          : `${context.displayLabel} has AED ${outstanding} outstanding.`;
      return {
        answer,
        suggestions: [
          { label: "View Finance", question: "Show its payments" },
          { label: "Show Attention", question: "What needs my attention?" },
        ],
      };
    },
  },
  {
    name: "contract_payments_navigation",
    matches: (q) => includesAny(q, ["show its payments", "show payments", "show finance"]),
    async run(_question, context) {
      const entity = context?.centerEntity;
      if (!entity || (entity.kind !== "contract" && entity.kind !== "contract-finance")) {
        return {
          answer: "Open a contract first, then ask me to show its payments.",
          suggestions: [],
        };
      }
      return {
        answer: `Opening ${context.displayLabel}'s payments.`,
        navigation: {
          type: "focus_entity",
          entity: { kind: "contract-finance", domain: entity.domain, id: entity.id },
        },
        suggestions: [],
      };
    },
  },
  {
    name: "work_order_assignee",
    matches: (q) =>
      includesAny(q, ["who is assigned", "who's working on this", "who is working on this"]),
    async run(_question, context, supabase) {
      const entity = context?.centerEntity;
      if (!entity || entity.kind !== "work-order") {
        return {
          answer: "Open a work order first, then ask who's assigned to it.",
          suggestions: [],
        };
      }
      const table = entity.domain === "AMC" ? "work_orders" : "fm_work_orders";
      const { data: workOrder, error: workOrderError } = await supabase
        .from(table)
        .select("technician_id")
        .eq("id", entity.id)
        .maybeSingle();
      if (workOrderError) throw workOrderError;
      if (!workOrder?.technician_id) {
        return {
          answer: "No technician is currently assigned to this work order.",
          suggestions: [],
        };
      }
      const { data: employee, error: employeeError } = await supabase
        .from("employees")
        .select("full_name, first_name, last_name")
        .eq("id", workOrder.technician_id)
        .maybeSingle();
      if (employeeError) throw employeeError;
      const name =
        employee?.full_name ?? `${employee?.first_name ?? ""} ${employee?.last_name ?? ""}`.trim();
      return {
        answer: name ? `${name} is assigned to this work order.` : "Assigned technician not found.",
        suggestions: [],
      };
    },
  },
  {
    name: "customer_contracts",
    matches: (q) => includesAny(q, ["other contracts", "customer's contracts", "show contracts"]),
    async run(_question, context, supabase) {
      const entity = context?.centerEntity;
      if (!entity || entity.kind !== "customer") {
        return {
          answer: "Open a customer first, then ask to see their contracts.",
          suggestions: [],
        };
      }
      const [amc, fm] = await Promise.all([
        supabase.from("contracts").select("id, title").eq("customer_id", entity.id),
        supabase.from("fm_contracts").select("id, title").eq("customer_id", entity.id),
      ]);
      const titles = [...(amc.data ?? []), ...(fm.data ?? [])].map((c) => c.title);
      return {
        answer:
          titles.length === 0
            ? `${context.displayLabel} has no other contracts on file.`
            : `${context.displayLabel} has ${titles.length} contract${titles.length === 1 ? "" : "s"}: ${titles.join(", ")}.`,
        suggestions: [],
      };
    },
  },
  {
    name: "next_ppm_visit",
    matches: (q) => includesAny(q, ["next visit", "next ppm", "when is the next"]),
    async run(_question, context, supabase) {
      const entity = context?.centerEntity;
      if (!entity || (entity.kind !== "contract" && entity.kind !== "contract-finance")) {
        return { answer: "Open a contract first, then ask about its next visit.", suggestions: [] };
      }
      const table = entity.domain === "FM" ? "ppm_visits" : "amc_ppm_visits";
      const todayStr = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from(table)
        .select("planned_date, due_date")
        .eq("contract_id", entity.id)
        .is("work_order_id", null)
        .not("status", "in", "(Completed,Skipped,Cancelled)")
        .gte("planned_date", todayStr)
        .order("planned_date", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      const date = data?.due_date ?? data?.planned_date;
      return {
        answer: date ? `The next PPM visit is on ${date}.` : "No upcoming PPM visit is scheduled.",
        suggestions: [],
      };
    },
  },
  {
    // Positioned deliberately late in this array: its `matches` trigger ("show "/"open "/etc.)
    // is broad enough to shadow more specific "show X" intents above (attention_summary's
    // "show attention", overdue_ppm_list's "show overdue ppms", contract_payments_navigation's
    // "show its payments", customer_contracts' "show contracts") if checked first. Since
    // findMatchingIntent returns the FIRST array match, every more specific "show ..." intent
    // must stay earlier in this array than this one.
    name: "focus_entity_by_name",
    matches: (q) => includesAny(q, ["show ", "open ", "go to ", "find ", "search for "]),
    async run(question, _context, supabase) {
      // Not anchored to the start: `matches` above only requires the trigger phrase to appear
      // ANYWHERE in the question (so "Can you show me X?" is selected), so stripping must find
      // the trigger wherever it actually occurs too, not just at position 0 - an anchored strip
      // here would leave the whole "Can you show me..." lead-in in the search term and never
      // match a real title. The optional "please "/"me " handles the two most common fillers
      // around the trigger word without trying to parse full natural language.
      const term = question
        .replace(/^.*?\b(?:please\s+)?(show|open|go to|find|search for)(?:\s+me)?\s+/i, "")
        .replace(/[?.!]+$/, "")
        .trim();
      if (!term) return { answer: "What would you like me to show?", suggestions: [] };

      const [amcContracts, fmContracts] = await Promise.all([
        supabase.from("contracts").select("id, title").ilike("title", `%${term}%`).limit(3),
        supabase.from("fm_contracts").select("id, title").ilike("title", `%${term}%`).limit(3),
      ]);
      const matches = [
        ...(amcContracts.data ?? []).map((c) => ({
          domain: "AMC" as const,
          id: c.id,
          title: c.title,
        })),
        ...(fmContracts.data ?? []).map((c) => ({
          domain: "FM" as const,
          id: c.id,
          title: c.title,
        })),
      ];

      if (matches.length === 0) {
        return { answer: `I couldn't find a contract matching "${term}".`, suggestions: [] };
      }
      if (matches.length > 1) {
        return {
          answer: `I found ${matches.length} matching contracts. Which one do you mean?`,
          suggestions: matches.map((match) => ({
            label: match.title,
            question: `Show ${match.title}`,
          })),
        };
      }
      const match = matches[0];
      return {
        answer: `Opening ${match.title}.`,
        navigation: {
          type: "focus_entity",
          entity: { kind: "contract", domain: match.domain, id: match.id },
        },
        suggestions: [],
      };
    },
  },
  {
    name: "write_action_requested",
    matches: (q) =>
      includesAny(q, [
        "assign ",
        "mark complete",
        "mark as complete",
        "record attendance",
        "send a message",
        "modify the",
        "update the contract",
        "create a quotation",
        "cancel the",
        "delete the",
      ]),
    async run() {
      return {
        answer: "I can show you that information, but actions are not enabled yet.",
        suggestions: [],
      };
    },
  },
];

export const OUT_OF_SCOPE_ANSWER =
  "I'm your FizzFix assistant. I can help with FizzFix operations, contracts, staff, schedules and finance.";

// Cache the QUESTION PATTERN (which intent it maps to), never the business answer - every
// cache hit still re-runs that intent's `run()` against live data. Process-scoped (a Worker
// cold start just falls back to re-classifying), which is fine since this is purely an
// optimization, never a correctness requirement.
const intentPatternCache = new Map<string, string>();

export function findMatchingIntent(question: string): IntentDefinition | undefined {
  const normalized = normalize(question);
  return INTENTS.find((intent) => intent.matches(normalized));
}

export function findIntentByName(name: string): IntentDefinition | undefined {
  return INTENTS.find((intent) => intent.name === name);
}

export function getCachedIntentName(question: string): string | undefined {
  return intentPatternCache.get(normalize(question));
}

export function cacheIntentName(question: string, intentName: string): void {
  intentPatternCache.set(normalize(question), intentName);
}
