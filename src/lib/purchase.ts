import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Shared bits for Vendor Management and Purchase Management.
 *
 * The purchase tables and RPCs (supabase/migrations/20261018120000_purchase_management.sql)
 * are not in the generated Supabase types yet, so queries go through this untyped client.
 * Every write goes through an RPC (create_vendor, save_purchase_order, save_purchase_bill,
 * record_vendor_payment, delete_vendor_payment, void_purchase_bill) - the same calls an AI
 * agent makes - so the Ledger / PEMO posting rules live in one place.
 */
export const db = supabase as any;

export type Classification = "project" | "capex" | "opex";
export type BillPaymentMethod = "PEMO" | "Cash" | "Bank Transfer" | "Credit";
export type PaymentMethod = "PEMO" | "Cash" | "Bank Transfer" | "Cheque";

export const CLASSIFICATIONS: { value: Classification; label: string; short: string }[] = [
  { value: "project", label: "Project (FM / AMC contract)", short: "Project" },
  { value: "capex", label: "Asset (Capex)", short: "Asset" },
  { value: "opex", label: "Operational Expense (Opex)", short: "Opex" },
];

export const BILL_PAYMENT_METHODS: BillPaymentMethod[] = ["PEMO", "Cash", "Bank Transfer", "Credit"];
export const PAYMENT_METHODS: PaymentMethod[] = ["Bank Transfer", "Cash", "Cheque", "PEMO"];

export const ASSET_CATEGORIES = [
  "Vehicles",
  "Tools & Equipment",
  "Machinery",
  "IT & Electronics",
  "Furniture & Fixtures",
  "Building Improvements",
  "Other Asset",
];

export const EXPENSE_CATEGORIES = [
  "Fuel",
  "Rent",
  "Utilities",
  "Office Supplies",
  "Consumables",
  "Repairs & Maintenance",
  "Vehicle Expenses",
  "Telecom & Internet",
  "Software & Subscriptions",
  "Professional Fees",
  "Staff Welfare",
  "Visa & Government Fees",
  "Travel",
  "Marketing",
  "Other Expense",
];

export const CLASSIFICATION_BADGE: Record<Classification, string> = {
  project: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/40 dark:text-blue-200",
  capex: "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/40 dark:text-purple-200",
  opex: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-200",
};

export const BILL_STATUS_BADGE: Record<string, string> = {
  Unpaid: "bg-yellow-100 text-yellow-800 border-yellow-200",
  "Partially Paid": "bg-orange-100 text-orange-800 border-orange-200",
  Paid: "bg-green-100 text-green-800 border-green-200",
  Overdue: "bg-red-100 text-red-800 border-red-200",
  Void: "bg-muted text-muted-foreground border-transparent",
};

export const PO_STATUS_BADGE: Record<string, string> = {
  Draft: "bg-slate-100 text-slate-700 border-slate-200",
  Issued: "bg-blue-100 text-blue-800 border-blue-200",
  Billed: "bg-green-100 text-green-800 border-green-200",
  Cancelled: "bg-muted text-muted-foreground border-transparent",
};

export function aed(n: number | string | null | undefined): string {
  return `AED ${Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function daysPastDue(dueDate: string | null): number {
  if (!dueDate) return 0;
  const today = new Date(todayISO());
  const due = new Date(dueDate);
  return Math.floor((today.getTime() - due.getTime()) / 86_400_000);
}

export type Vendor = {
  id: string;
  vendor_code: string;
  name: string;
  company_name: string | null;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  trn: string | null;
  address: string | null;
  payment_terms_days: number;
  bank_name: string | null;
  bank_account_name: string | null;
  bank_iban: string | null;
  opening_balance: number;
  notes: string | null;
  is_active: boolean;
  created_at: string;
};

export type Bill = {
  id: string;
  bill_number: string;
  vendor_bill_ref: string | null;
  vendor_id: string;
  purchase_order_id: string | null;
  bill_date: string;
  due_date: string;
  classification: Classification;
  project_type: "FM" | "AMC" | null;
  contract_id: string | null;
  asset_name: string | null;
  asset_category: string | null;
  expense_category: string | null;
  payment_method: BillPaymentMethod;
  pemo_card_id: string | null;
  subtotal: number;
  vat_amount: number;
  total: number;
  amount_paid: number;
  status: "Unpaid" | "Partially Paid" | "Paid" | "Void";
  notes: string | null;
  created_at: string;
};

export type PurchaseOrder = {
  id: string;
  po_number: string;
  vendor_id: string;
  order_date: string;
  expected_date: string | null;
  status: "Draft" | "Issued" | "Billed" | "Cancelled";
  classification: Classification;
  project_type: "FM" | "AMC" | null;
  contract_id: string | null;
  asset_name: string | null;
  asset_category: string | null;
  expense_category: string | null;
  subtotal: number;
  vat_amount: number;
  total: number;
  notes: string | null;
  created_at: string;
};

export type VendorPayment = {
  id: string;
  payment_number: string;
  vendor_id: string;
  bill_id: string;
  payment_date: string;
  amount: number;
  payment_method: PaymentMethod;
  pemo_card_id: string | null;
  reference: string | null;
  notes: string | null;
  is_auto: boolean;
  created_at: string;
};

export type LineItem = {
  id?: string;
  description: string;
  quantity: number;
  unit_price: number;
  vat_rate: number;
};

/** Effective status: an unpaid / part-paid credit bill past its due date shows as Overdue. */
export function billDisplayStatus(b: Pick<Bill, "status" | "due_date">): string {
  if ((b.status === "Unpaid" || b.status === "Partially Paid") && daysPastDue(b.due_date) > 0) return "Overdue";
  return b.status;
}

export function billBalance(b: Pick<Bill, "total" | "amount_paid" | "status">): number {
  return b.status === "Void" ? 0 : Math.max(0, Number(b.total) - Number(b.amount_paid));
}

export type ContractOption = {
  id: string;
  title: string | null;
  contract_no: string | null;
  customer_name: string | null;
};

export function contractLabel(c: ContractOption | undefined | null): string {
  if (!c) return "—";
  return (c.contract_no ? `${c.contract_no} - ` : "") + (c.customer_name ?? c.title ?? "Untitled");
}

export function useVendors() {
  return useQuery({
    queryKey: ["vendors"],
    queryFn: async () => {
      const { data, error } = await db.from("vendors").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as Vendor[];
    },
  });
}

export function useBills() {
  return useQuery({
    queryKey: ["purchase_bills"],
    queryFn: async () => {
      const { data, error } = await db.from("purchase_bills").select("*").order("bill_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Bill[];
    },
  });
}

export function usePurchaseOrders() {
  return useQuery({
    queryKey: ["purchase_orders"],
    queryFn: async () => {
      const { data, error } = await db.from("purchase_orders").select("*").order("order_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PurchaseOrder[];
    },
  });
}

export function useVendorPayments() {
  return useQuery({
    queryKey: ["vendor_payments"],
    queryFn: async () => {
      const { data, error } = await db.from("vendor_payments").select("*").order("payment_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as VendorPayment[];
    },
  });
}

/** FM + AMC contracts for the project picker, keyed by project type. */
export function useContractOptions() {
  return useQuery({
    queryKey: ["purchase-contract-options"],
    queryFn: async () => {
      const [fm, amc] = await Promise.all([
        supabase.from("fm_contracts").select("id, title, contract_no, customer_name"),
        supabase.from("contracts").select("id, title, contract_no, customer_name"),
      ]);
      if (fm.error) throw fm.error;
      if (amc.error) throw amc.error;
      return { FM: (fm.data ?? []) as ContractOption[], AMC: (amc.data ?? []) as ContractOption[] };
    },
  });
}

export function usePemoCards() {
  return useQuery({
    queryKey: ["purchase-pemo-cards"],
    queryFn: async () => {
      const { data, error } = await supabase.from("pemo_cards").select("id, label").eq("active", true).order("label");
      if (error) throw error;
      return (data ?? []) as { id: string; label: string }[];
    },
  });
}

/** One-line "what was this bought for" text used in tables and exports. */
export function purposeLabel(
  row: Pick<Bill, "classification" | "project_type" | "contract_id" | "asset_name" | "asset_category" | "expense_category">,
  contracts?: { FM: ContractOption[]; AMC: ContractOption[] },
): string {
  if (row.classification === "project") {
    const list = row.project_type && contracts ? contracts[row.project_type] : [];
    const c = list.find((x) => x.id === row.contract_id);
    return `${row.project_type ?? ""} · ${c ? contractLabel(c) : "Contract"}`;
  }
  if (row.classification === "capex") return [row.asset_name, row.asset_category].filter(Boolean).join(" · ");
  return row.expense_category ?? "—";
}

export function errorMessage(err: any): string {
  return err?.message ?? "Something went wrong";
}
