import { supabase } from "@/integrations/supabase/client";

export const FM_SCOPE_TYPES = ["Building AMC", "Facilities Management"] as const;
export const BILLING_CYCLES = ["Monthly", "Quarterly", "Half Yearly", "Annual", "One Time"] as const;
export const PAYMENT_TERMS = ["Monthly", "Quarterly", "Half Yearly", "Single Payment"] as const;
export type PaymentTerm = typeof PAYMENT_TERMS[number];
export const STATUS_OPTIONS = ["Draft", "Under Review", "Active", "Expired", "Terminated"];
export const PAY_STATUS = ["Not Yet Due", "Due", "Overdue", "Received"] as const;

export type FmContractPaymentRow = {
  id?: string;
  payment_date: string;
  value: string;
  status: string;
  received_date: string;
};

export type FmContractInput = {
  contract_no: string;
  customer_id: string | null;
  customer_name: string;
  title: string;
  contract_scope_type: string;
  site_name: string;
  site_address: string;
  building_type: string;
  billing_cycle: string;
  retention_percent: string;
  vat_percent: string;
  contract_manager_id: string | null;
  sla_profile_id: string | null;
  value: string;
  start_date: string;
  end_date: string;
  payment_terms: string;
  status: string;
  remark: string;
  payments: FmContractPaymentRow[];
};

function termCount(t: PaymentTerm): number {
  return t === "Monthly" ? 12 : t === "Quarterly" ? 4 : t === "Half Yearly" ? 2 : 1;
}
function monthStep(t: PaymentTerm): number {
  return t === "Monthly" ? 1 : t === "Quarterly" ? 3 : t === "Half Yearly" ? 6 : 0;
}
export function addMonths(iso: string, m: number): string {
  const d = new Date(iso);
  d.setMonth(d.getMonth() + m);
  return d.toISOString().slice(0, 10);
}
export function addYearMinusDay(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  d.setFullYear(d.getFullYear() + 1);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}
export function computePaymentStatus(payment_date: string, received_date: string): string {
  if (received_date) return "Received";
  if (!payment_date) return "Not Yet Due";
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const target = new Date(payment_date); target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today.getTime() - target.getTime()) / 86400000);
  if (diffDays <= 0) return "Not Yet Due";
  if (diffDays <= 15) return "Due";
  return "Overdue";
}
export function generatePaymentSchedule(start: string, term: PaymentTerm, total: number): FmContractPaymentRow[] {
  if (!start || !term) return [];
  const n = termCount(term);
  const step = monthStep(term);
  const per = total && n ? +(total / n).toFixed(2) : 0;
  return Array.from({ length: n }, (_, i) => {
    const payment_date = step ? addMonths(start, i * step) : start;
    return {
      payment_date,
      value: per ? String(per) : "",
      status: i === 0 ? "Due" : computePaymentStatus(payment_date, ""),
      received_date: "",
    };
  });
}

/**
 * Single write path for FM contract create/update, including its payment schedule.
 * No page or component should call supabase.from("fm_contracts"/"fm_contract_payments")
 * directly for writes - everything goes through here.
 */
export async function saveFmContract(input: FmContractInput, editingId?: string): Promise<string> {
  const payload = {
    contract_no: input.contract_no || null,
    customer_id: input.customer_id,
    customer_name: input.customer_name,
    title: input.title,
    contract_scope_type: input.contract_scope_type || null,
    site_name: input.site_name || null,
    site_address: input.site_address || null,
    building_type: input.building_type || null,
    billing_cycle: input.billing_cycle || null,
    retention_percent: input.retention_percent ? Number(input.retention_percent) : null,
    vat_percent: input.vat_percent ? Number(input.vat_percent) : null,
    contract_manager_id: input.contract_manager_id,
    sla_profile_id: input.sla_profile_id,
    value: input.value ? Number(input.value) : null,
    start_date: input.start_date || null,
    end_date: input.end_date || null,
    payment_terms: input.payment_terms || null,
    status: input.status,
    remark: input.remark || null,
  };

  let contractId: string;
  if (editingId) {
    const { error } = await supabase.from("fm_contracts").update(payload).eq("id", editingId);
    if (error) throw error;
    contractId = editingId;
  } else {
    const { data, error } = await supabase.from("fm_contracts").insert(payload).select("id").single();
    if (error) throw error;
    contractId = data.id;
  }

  await supabase.from("fm_contract_payments").delete().eq("contract_id", contractId);
  if (input.payments.length > 0) {
    const rows = input.payments.map((p, idx) => ({
      contract_id: contractId,
      payment_date: p.payment_date || null,
      value: p.value ? Number(p.value) : null,
      status: p.status || "Not Yet Due",
      received_date: p.received_date || null,
      sort_order: idx,
    }));
    const { error } = await supabase.from("fm_contract_payments").insert(rows);
    if (error) throw error;
  }

  return contractId;
}

export async function deleteFmContract(id: string): Promise<void> {
  const { error } = await supabase.from("fm_contracts").delete().eq("id", id);
  if (error) throw error;
}

export async function fetchFmContractPayments(contractId: string): Promise<FmContractPaymentRow[]> {
  const { data, error } = await supabase
    .from("fm_contract_payments")
    .select("*")
    .eq("contract_id", contractId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((p: any) => ({
    id: p.id,
    payment_date: p.payment_date ?? "",
    value: p.value != null ? String(p.value) : "",
    status: computePaymentStatus(p.payment_date ?? "", p.received_date ?? ""),
    received_date: p.received_date ?? "",
  }));
}
