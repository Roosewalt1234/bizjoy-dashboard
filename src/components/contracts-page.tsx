import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Check, ChevronsUpDown, Wrench, Droplets, Zap, Wind, Sun, Fan, FileText, Calendar, AlertCircle, CreditCard } from "lucide-react";
import { toast } from "sonner";
import { PaginationBar, PAGE_SIZE, paginate } from "@/components/pagination-bar";
import { ExportMenu } from "@/components/export-menu";
import { cn } from "@/lib/utils";

export type ModuleType = "AMC" | "FM";


const PAYMENT_TERMS = ["Monthly", "Quarterly", "Half Yearly", "Single Payment"] as const;
type PaymentTerm = typeof PAYMENT_TERMS[number];
const STATUS_OPTIONS = ["Draft", "Under Review", "Active", "Expired", "Terminated"];
const FM_SCOPE_TYPES = ["Home AMC", "Building AMC", "Facilities Management"] as const;
const BILLING_CYCLES = ["Monthly", "Quarterly", "Half Yearly", "Annual", "One Time"] as const;
const PAY_STATUS = ["Not Yet Due", "Due", "Overdue", "Received"] as const;
function payStatusClasses(s: string): string {
  switch (s) {
    case "Received":    return "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-200";
    case "Due":         return "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-200";
    case "Overdue":     return "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/40 dark:text-red-200";
    case "Not Yet Due": return "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800/60 dark:text-slate-200";
    default:            return "bg-muted text-muted-foreground border-border";
  }
}
const WATER_STATUS = ["Pending", "Scheduled", "Completed"] as const;
const CONTRACT_TYPES = ["Standard", "Premium", "Bespoke"] as const;
type ContractType = typeof CONTRACT_TYPES[number];
const SPARE_PARTS_BY_TYPE: Record<ContractType, number> = { Standard: 0, Premium: 1000, Bespoke: 0 };
const DEFAULT_HANDYMAN_HOURS = 60;
const PPM_SERVICES: { key: string; label: string; standard: number; premium: number; Icon: any }[] = [
  { key: "ac_units", label: "AC Units", standard: 3, premium: 4, Icon: Wind },
  { key: "water_pumps", label: "Water Pumps & Motors", standard: 3, premium: 4, Icon: Fan },
  { key: "electrical", label: "Fixed Electrical Fittings", standard: 2, premium: 3, Icon: Zap },
  { key: "plumbing", label: "Plumbing Units", standard: 2, premium: 3, Icon: Wrench },
  { key: "solar", label: "Solar Water Heater", standard: 2, premium: 2, Icon: Sun },
  { key: "water_tank", label: "Water Tank Cleaning", standard: 1, premium: 2, Icon: Droplets },
];

const PPM_STATUS_OPTIONS = ["Auto", "Scheduled", "Completed"] as const;
function computePpmStatus(date: string, override: string): "Not Yet Due" | "Due" | "Overdue" | "Scheduled" | "Completed" {
  if (override === "Completed") return "Completed";
  if (override === "Scheduled") return "Scheduled";
  if (!date) return "Not Yet Due";
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const target = new Date(date); target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today.getTime() - target.getTime()) / 86400000);
  // diffDays > 0 means today is past scheduled date
  if (diffDays <= 0) return "Not Yet Due";
  if (diffDays <= 15) return "Due";
  return "Overdue";
}
function ppmStatusClasses(s: string): string {
  switch (s) {
    case "Completed": return "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-200";
    case "Scheduled": return "bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-900/40 dark:text-sky-200";
    case "Due":       return "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-200";
    case "Overdue":   return "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/40 dark:text-red-200";
    default:          return "bg-muted text-muted-foreground border-border";
  }
}
function freqFor(type: ContractType, key: string, bespokeFreq?: Record<string, number>): number {
  if (type === "Bespoke") {
    const v = bespokeFreq?.[key];
    if (typeof v === "number" && v >= 0) return v;
    const s = PPM_SERVICES.find((x) => x.key === key);
    return s ? s.standard : 0;
  }
  const s = PPM_SERVICES.find((x) => x.key === key);
  if (!s) return 0;
  return type === "Premium" ? s.premium : s.standard;
}
function anchorDates(start: string, max: number): string[] {
  if (!start || max <= 0) return [];
  const step = 12 / max;
  return Array.from({ length: max }, (_, i) => addMonths(start, Math.round(i * step)));
}
function subsetDates(anchors: string[], n: number): string[] {
  if (n >= anchors.length) return anchors.slice();
  if (n <= 1) return anchors.slice(0, n);
  return [...anchors.slice(0, n - 1), anchors[anchors.length - 1]];
}
function waterTankDates(anchors: string[], type: ContractType): string[] {
  if (!anchors.length) return type === "Premium" ? ["", ""] : [""];
  if (type === "Premium") {
    const first = anchors[0];
    const third = anchors[2] ?? anchors[anchors.length - 1];
    return [first, third];
  }
  return [anchors[0]];
}
function generatePpmSchedule(
  start: string,
  type: ContractType,
  bespokeFreq?: Record<string, number>,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const s of PPM_SERVICES) {
    const freq = freqFor(type, s.key, bespokeFreq);
    if (freq <= 0) { out[s.key] = []; continue; }
    if (type !== "Bespoke" && s.key === "water_tank") {
      const max = type === "Premium" ? 4 : 3;
      const anchors = anchorDates(start, max);
      out[s.key] = start ? waterTankDates(anchors, type) : Array(freq).fill("");
    } else {
      const anchors = anchorDates(start, freq);
      out[s.key] = start ? anchors : Array(freq).fill("");
    }
  }
  return out;
}


type PaymentRow = {
  id?: string;
  payment_date: string;
  value: string;
  status: string;
  received_date: string;
};

function termCount(t: PaymentTerm): number {
  return t === "Monthly" ? 12 : t === "Quarterly" ? 4 : t === "Half Yearly" ? 2 : 1;
}
function monthStep(t: PaymentTerm): number {
  return t === "Monthly" ? 1 : t === "Quarterly" ? 3 : t === "Half Yearly" ? 6 : 0;
}
function addMonths(iso: string, m: number): string {
  const d = new Date(iso);
  d.setMonth(d.getMonth() + m);
  return d.toISOString().slice(0, 10);
}
function addYearMinusDay(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  d.setFullYear(d.getFullYear() + 1);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}
function computeStatus(payment_date: string, received_date: string): string {
  if (received_date) return "Received";
  if (!payment_date) return "Not Yet Due";
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const target = new Date(payment_date); target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today.getTime() - target.getTime()) / 86400000);
  if (diffDays <= 0) return "Not Yet Due";
  if (diffDays <= 15) return "Due";
  return "Overdue";
}
function generateSchedule(start: string, term: PaymentTerm, total: number): PaymentRow[] {
  if (!start || !term) return [];
  const n = termCount(term);
  const step = monthStep(term);
  const per = total && n ? +(total / n).toFixed(2) : 0;
  return Array.from({ length: n }, (_, i) => {
    const payment_date = step ? addMonths(start, i * step) : start;
    return {
      payment_date,
      value: per ? String(per) : "",
      // First installment is due immediately on the contract start date
      status: i === 0 ? "Due" : computeStatus(payment_date, ""),
      received_date: "",
    };
  });
}

function typeBadgeClasses(t: string): string {
  switch (t) {
    case "Premium": return "bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-900/40 dark:text-violet-200";
    case "Bespoke": return "bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-900/40 dark:text-sky-200";
    case "Standard": return "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800/60 dark:text-slate-200";
    default: return "bg-muted text-muted-foreground border-border";
  }
}
function termBadgeClasses(t: string): string {
  switch (t) {
    case "Monthly": return "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-200";
    case "Quarterly": return "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-200";
    case "Half Yearly": return "bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-900/40 dark:text-indigo-200";
    case "Single Payment": return "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-900/40 dark:text-rose-200";
    default: return "bg-muted text-muted-foreground border-border";
  }
}
function todayISO(): string {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}
function nextServiceDate(row: any, key: string): string {
  const sched = row?.ppm_schedule ?? {};
  const dates: string[] = Array.isArray(sched?.dates?.[key])
    ? sched.dates[key]
    : Array.isArray(sched?.[key]) ? sched[key] : [];
  const statuses: string[] = Array.isArray(sched?.status?.[key]) ? sched.status[key] : [];
  const pending = dates
    .map((d, i) => ({ d, s: statuses[i] ?? "Auto" }))
    .filter((x) => x.d && x.s !== "Completed" && x.s !== "Not Applicable")
    .map((x) => x.d)
    .sort();
  if (!pending.length) return "";
  const t = todayISO();
  return pending.find((d) => d >= t) ?? pending[0];
}
function DateCell({ date }: { date: string }) {
  if (!date) return <span className="text-muted-foreground">—</span>;
  const overdue = date < todayISO();
  return <span className={overdue ? "text-red-600 font-medium dark:text-red-400" : ""}>{date}</span>;
}

function PaymentDueBadge({ date, status }: { date: string; status: string }) {
  const [showStatus, setShowStatus] = useState(false);
  if (!date) return <span className="text-muted-foreground">—</span>;
  const classes =
    status === "Overdue"
      ? payStatusClasses("Overdue")
      : status === "Due"
      ? payStatusClasses("Due")
      : "";
  if (!classes) return <span>{date}</span>;
  return (
    <Badge
      variant="outline"
      className={cn("font-medium cursor-pointer select-none", classes)}
      onClick={() => setShowStatus((v) => !v)}
      title={showStatus ? "Click to show date" : "Click to show status"}
    >
      {showStatus ? status : date}
    </Badge>
  );
}


export function ContractsPage({ moduleType = "AMC" }: { moduleType?: ModuleType }) {
  const isFM = moduleType === "FM";
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [page, setPage] = useState(1);
  const [filterTitle, setFilterTitle] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPayment, setFilterPayment] = useState("all");


  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["contracts", moduleType],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contracts")
        .select("*")
        .eq("module_type", moduleType)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });


  const filteredRows = useMemo(() => {
    return rows.filter((r: any) => {
      const titleMatch =
        filterTitle === "all" ||
        (isFM ? (r.contract_scope_type || "") === filterTitle : (r.contract_type || "") === filterTitle);
      const statusMatch = filterStatus === "all" || (r.status || "").toLowerCase() === filterStatus.toLowerCase();
      const paymentMatch =
        filterPayment === "all" ||
        (isFM
          ? (r.billing_cycle || "").toLowerCase() === filterPayment.toLowerCase()
          : (r.payment_terms || "").toLowerCase() === filterPayment.toLowerCase());

      return titleMatch && statusMatch && paymentMatch;
    });
  }, [rows, filterTitle, filterStatus, filterPayment, isFM]);


  const { data: handymanLog = [] } = useQuery({
    queryKey: ["handyman_hours_log_all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("handyman_hours_log")
        .select("contract_id, hours");
      if (error) throw error;
      return data ?? [];
    },
  });

  const handymanUsedByContract = useMemo(() => {
    const m: Record<string, number> = {};
    for (const h of handymanLog as any[]) {
      if (!h.contract_id) continue;
      m[h.contract_id] = (m[h.contract_id] ?? 0) + (Number(h.hours) || 0);
    }
    return m;
  }, [handymanLog]);

  const { data: allPayments = [] } = useQuery({
    queryKey: ["contract_payments_all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contract_payments")
        .select("contract_id, payment_date, received_date, value")
        .order("payment_date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const nextPaymentInfoByContract = useMemo(() => {
    const m: Record<string, { payment_date: string; status: string; value: number }> = {};
    for (const p of allPayments as any[]) {
      if (p.received_date) continue;
      if (!p.payment_date) continue;
      const status = computeStatus(p.payment_date, "");
      if (!m[p.contract_id] || p.payment_date < m[p.contract_id].payment_date) {
        m[p.contract_id] = { payment_date: p.payment_date, status, value: Number(p.value) || 0 };
      }
    }
    return m;
  }, [allPayments]);

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const nextMonthDate = new Date(currentYear, currentMonth + 1, 1);
  const nextMonthYear = nextMonthDate.getFullYear();
  const nextMonth = nextMonthDate.getMonth();

  const totalContracts = filteredRows.length;
  const totalPaymentDue = useMemo(() => {
    return (allPayments as any[])
      .filter((p) => {
        if (p.received_date || !p.payment_date) return false;
        const status = computeStatus(p.payment_date, "");
        return ["Due", "Overdue"].includes(status);
      })
      .reduce((sum, p) => sum + (Number(p.value) || 0), 0);
  }, [allPayments]);
  const contractsExpiringThisMonth = useMemo(() => {
    return filteredRows.filter((r: any) => {
      if (!r.end_date) return false;
      const d = new Date(r.end_date);
      return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
    }).length;
  }, [filteredRows, currentYear, currentMonth]);
  const paymentsDueNextMonth = useMemo(() => {
    return (allPayments as any[]).filter((p) => {
      if (!p.payment_date || p.received_date) return false;
      const d = new Date(p.payment_date);
      return d.getFullYear() === nextMonthYear && d.getMonth() === nextMonth;
    }).length;
  }, [allPayments, nextMonthYear, nextMonth]);

  function fmtAED(n: number) {
    return new Intl.NumberFormat("en-AE", { style: "currency", currency: "AED", maximumFractionDigits: 0 }).format(n);
  }

  const total = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
  const pageRows = paginate(filteredRows, page);

  async function remove(id: string) {
    const { error } = await supabase.from("contracts").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Deleted");
    qc.invalidateQueries({ queryKey: ["contracts"] });
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{moduleType === "FM" ? "FM Contracts" : "AMC Contracts"}</h1>
          <p className="text-muted-foreground">
            {moduleType === "FM" ? "Facilities management contracts and site operations." : "Home / standard AMC service contracts."}
          </p>

        </div>
        <div className="flex items-center gap-2">
          <ExportMenu
            filename={isFM ? "fm-contracts" : "amc-contracts"}
            sheetName={isFM ? "FM Contracts" : "AMC Contracts"}
            rows={filteredRows as any[]}
            columns={isFM ? [
              { key: "contract_no", label: "Contract No" },
              { key: "title", label: "Contract / Site" },
              { key: "customer_name", label: "Client" },
              { key: "site_name", label: "Site" },
              { key: "building_type", label: "Building Type" },
              { key: "contract_scope_type", label: "Scope" },
              { key: "start_date", label: "Start Date" },
              { key: "end_date", label: "End Date" },
              { key: "value", label: "Contract Value" },
              { key: "billing_cycle", label: "Billing Cycle" },
              { key: "vat_percent", label: "VAT %" },
              { key: "retention_percent", label: "Retention %" },
              { key: "status", label: "Status" },
              { key: "remark", label: "Remark" },
            ] : [
              { key: "amc_ref_no", label: "AMC Ref No" },
              { key: "title", label: "Title" },
              { key: "customer_name", label: "Customer" },
              { key: "contract_type", label: "Type" },
              { key: "start_date", label: "Start Date" },
              { key: "end_date", label: "End Date" },
              { key: "value", label: "Value" },
              { key: "spare_parts_amount", label: "Spare Parts (AED)" },
              { key: "payment_terms", label: "Payment Terms" },
              { key: "status", label: "Status" },
              { key: "water_tank_cleaning_date", label: "Water Tank Cleaning Date" },
              { key: "water_tank_cleaning_status", label: "Water Tank Status" },
              { key: "ac_duct_cleaning_date", label: "AC Duct Cleaning Date" },
              { key: "ac_duct_cleaning_status", label: "AC Duct Status" },
              { key: "remark", label: "Remark" },
            ]}
          />
          <Button onClick={() => { setEditing(null); setOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" /> {isFM ? "New FM Contract" : "New AMC Contract"}

          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 flex items-center gap-4 bg-gradient-to-br from-blue-50 to-white dark:from-blue-950/30 dark:to-background border-blue-100 dark:border-blue-900/40">
          <div className="p-3 rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Total Contracts</p>
            <p className="text-2xl font-bold">{totalContracts}</p>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-4 bg-gradient-to-br from-amber-50 to-white dark:from-amber-950/30 dark:to-background border-amber-100 dark:border-amber-900/40">
          <div className="p-3 rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
            <CreditCard className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Total Payment Due</p>
            <p className="text-2xl font-bold">{fmtAED(totalPaymentDue)}</p>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-4 bg-gradient-to-br from-rose-50 to-white dark:from-rose-950/30 dark:to-background border-rose-100 dark:border-rose-900/40">
          <div className="p-3 rounded-xl bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300">
            <Calendar className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Expiring This Month</p>
            <p className="text-2xl font-bold">{contractsExpiringThisMonth}</p>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-4 bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/30 dark:to-background border-emerald-100 dark:border-emerald-900/40">
          <div className="p-3 rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
            <AlertCircle className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Payments Due Next Month</p>
            <p className="text-2xl font-bold">{paymentsDueNextMonth}</p>
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="w-full sm:w-48">
            <Label htmlFor="filter-title" className="text-xs">{isFM ? "Scope" : "Title"}</Label>
            <Select value={filterTitle} onValueChange={(v) => { setFilterTitle(v); setPage(1); }}>
              <SelectTrigger id="filter-title">
                <SelectValue placeholder={isFM ? "All Scopes" : "All Titles"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isFM ? "All Scopes" : "All Titles"}</SelectItem>
                {(isFM ? FM_SCOPE_TYPES : CONTRACT_TYPES).map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="w-full sm:w-48">
            <Label htmlFor="filter-status" className="text-xs">Status</Label>
            <Select value={filterStatus} onValueChange={(v) => { setFilterStatus(v); setPage(1); }}>
              <SelectTrigger id="filter-status">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="w-full sm:w-48">
            <Label htmlFor="filter-payment" className="text-xs">{isFM ? "Billing Cycle" : "Payment"}</Label>
            <Select value={filterPayment} onValueChange={(v) => { setFilterPayment(v); setPage(1); }}>
              <SelectTrigger id="filter-payment">
                <SelectValue placeholder={isFM ? "All Billing Cycles" : "All Payments"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isFM ? "All Billing Cycles" : "All Payments"}</SelectItem>
                {(isFM ? BILLING_CYCLES : PAYMENT_TERMS).map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>


        </div>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            {isFM ? (
              <TableRow>
                <TableHead>Contract / Site</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Start</TableHead>
                <TableHead>End</TableHead>
                <TableHead>Contract Value</TableHead>
                <TableHead>Billing Cycle</TableHead>
                <TableHead>VAT / Retention</TableHead>
                <TableHead>Next Payment Due</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-32 text-right">Actions</TableHead>
              </TableRow>
            ) : (
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Start</TableHead>
                <TableHead>End</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead>Next Service Due</TableHead>
                <TableHead>WT Cleaning</TableHead>
                <TableHead>Next Payment Due</TableHead>
                <TableHead>Handyman Hrs</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-32 text-right">Actions</TableHead>
              </TableRow>
            )}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={12} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={12} className="text-center py-8 text-muted-foreground">No contracts yet.</TableCell></TableRow>
            ) : pageRows.map((r: any) => (
              <TableRow key={r.id}>
                {isFM ? (
                  <>
                    <TableCell className="font-medium">
                      <div className="space-y-0.5">
                        <div className="font-semibold">{r.title ?? r.contract_no ?? "—"}</div>
                        {r.contract_no ? (
                          <div className="text-xs text-muted-foreground">{r.contract_no}</div>
                        ) : null}
                        {r.site_name ? (
                          <div className="text-xs text-muted-foreground">{r.site_name}</div>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>{r.customer_name ?? "—"}</TableCell>
                    <TableCell>
                      {r.contract_scope_type ? (
                        <Badge variant="outline" className="font-medium">{r.contract_scope_type}</Badge>
                      ) : "—"}
                    </TableCell>
                    <TableCell>{r.start_date ?? "—"}</TableCell>
                    <TableCell>{r.end_date ?? "—"}</TableCell>
                    <TableCell>{r.value ?? "—"}</TableCell>
                    <TableCell>
                      {r.billing_cycle ? (
                        <Badge variant="outline" className={cn("font-medium", termBadgeClasses(r.billing_cycle))}>{r.billing_cycle}</Badge>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.vat_percent != null ? `${r.vat_percent}%` : "—"} / {r.retention_percent != null ? `${r.retention_percent}%` : "—"}
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const info = nextPaymentInfoByContract[r.id];
                        if (!info) return <span className="text-muted-foreground">—</span>;
                        return <PaymentDueBadge date={info.payment_date} status={info.status} />;
                      })()}
                    </TableCell>
                    <TableCell>{r.status ?? "—"}</TableCell>
                  </>
                ) : (
                  <>
                    <TableCell className="font-medium">{r.customer_name ?? "—"}</TableCell>
                    <TableCell>
                      {r.contract_type ? (
                        <Badge variant="outline" className={cn("font-medium", typeBadgeClasses(r.contract_type))}>{r.contract_type}</Badge>
                      ) : "—"}
                    </TableCell>
                    <TableCell>{r.start_date ?? "—"}</TableCell>
                    <TableCell>{r.end_date ?? "—"}</TableCell>
                    <TableCell>{r.value ?? "—"}</TableCell>
                    <TableCell>
                      {r.payment_terms ? (
                        <Badge variant="outline" className={cn("font-medium", termBadgeClasses(r.payment_terms))}>{r.payment_terms}</Badge>
                      ) : "—"}
                    </TableCell>
                    <TableCell><DateCell date={nextServiceDate(r, "ac_units")} /></TableCell>
                    <TableCell><DateCell date={nextServiceDate(r, "water_tank")} /></TableCell>
                    <TableCell>
                      {(() => {
                        const info = nextPaymentInfoByContract[r.id];
                        if (!info) return <span className="text-muted-foreground">—</span>;
                        return <PaymentDueBadge date={info.payment_date} status={info.status} />;
                      })()}
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const allotted = Number(r.handyman_hours ?? 0);
                        const used = handymanUsedByContract[r.id] ?? 0;
                        const remaining = allotted - used;
                        const cls = remaining < 0
                          ? "bg-red-50 text-red-700 border-red-200"
                          : remaining <= allotted * 0.2
                            ? "bg-amber-50 text-amber-700 border-amber-200"
                            : "bg-emerald-50 text-emerald-700 border-emerald-200";
                        return (
                          <div className="flex flex-col gap-1">
                            <Badge variant="outline" className={cn("font-medium w-fit", cls)}>{remaining} h left</Badge>
                            <span className="text-xs text-muted-foreground">{used} / {allotted} used</span>
                          </div>
                        );
                      })()}
                    </TableCell>
                    <TableCell>{r.status ?? "—"}</TableCell>
                  </>
                )}

                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="icon" variant="ghost" asChild>
                      <Link to={moduleType === "FM" ? "/fm-contracts/$id" : "/amc-contracts/$id"} params={{ id: r.id }}>
                        <FileText className="h-4 w-4" />
                      </Link>

                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => { setEditing(r); setOpen(true); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="icon" variant="ghost"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete this contract?</AlertDialogTitle>
                          <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => remove(r.id)}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <PaginationBar page={page} total={total} onPageChange={setPage} />
      </Card>

      {open && (
        <ContractDialog
          open={open}
          onOpenChange={setOpen}
          editing={editing}
          moduleType={moduleType}
          onSaved={() => qc.invalidateQueries({ queryKey: ["contracts"] })}
        />
      )}
    </div>
  );
}

function ContractDialog({
  open, onOpenChange, editing, onSaved, moduleType = "AMC",
}: { open: boolean; onOpenChange: (o: boolean) => void; editing: any | null; onSaved: () => void; moduleType?: ModuleType }) {
  const isFM = moduleType === "FM";
  const [customerId, setCustomerId] = useState<string | null>(editing?.customer_id ?? null);

  const [customerName, setCustomerName] = useState<string>(editing?.customer_name ?? "");
  const [title, setTitle] = useState(editing?.title ?? "");
  const [contractType, setContractType] = useState<ContractType>((editing?.contract_type as ContractType) ?? "Standard");
  const [sparePartsAmount, setSparePartsAmount] = useState<string>(
    editing?.spare_parts_amount != null ? String(editing.spare_parts_amount) : String(SPARE_PARTS_BY_TYPE[(editing?.contract_type as ContractType) ?? "Standard"])
  );
  const [amcRefNo, setAmcRefNo] = useState<string>(editing?.amc_ref_no ?? "");
  const [contractNo, setContractNo] = useState<string>(editing?.contract_no ?? "");
  const [value, setValue] = useState<string>(editing?.value != null ? String(editing.value) : "");
  const [startDate, setStartDate] = useState(editing?.start_date ?? "");
  const [endDate, setEndDate] = useState(editing?.end_date ?? "");
  const [paymentTerms, setPaymentTerms] = useState<PaymentTerm | "">(editing?.payment_terms ?? "");
  const [status, setStatus] = useState(editing?.status ?? "Draft");
  // Normalize legacy ppm_schedule (Record<string,string[]>) → { dates, status, freq }
  const _initialPpm = (() => {
    const raw = editing?.ppm_schedule ?? {};
    if (raw && typeof raw === "object" && ("dates" in raw || "status" in raw || "freq" in raw)) {
      return {
        dates: (raw.dates ?? {}) as Record<string, string[]>,
        status: (raw.status ?? {}) as Record<string, string[]>,
        freq: (raw.freq ?? {}) as Record<string, number>,
      };
    }
    return { dates: (raw ?? {}) as Record<string, string[]>, status: {} as Record<string, string[]>, freq: {} as Record<string, number> };
  })();
  const [ppmSchedule, setPpmSchedule] = useState<Record<string, string[]>>(_initialPpm.dates);
  const [ppmStatus, setPpmStatus] = useState<Record<string, string[]>>(_initialPpm.status);
  const [bespokeFreq, setBespokeFreq] = useState<Record<string, number>>(() => {
    const seed: Record<string, number> = {};
    for (const s of PPM_SERVICES) {
      const fromFreq = _initialPpm.freq[s.key];
      const fromDates = _initialPpm.dates[s.key]?.length;
      seed[s.key] = typeof fromFreq === "number" ? fromFreq : (fromDates ?? s.standard);
    }
    return seed;
  });
  const [handymanHours, setHandymanHours] = useState<string>(
    editing?.handyman_hours != null ? String(editing.handyman_hours) : String(DEFAULT_HANDYMAN_HOURS),
  );
  const [acDuctDate, setAcDuctDate] = useState(editing?.ac_duct_cleaning_date ?? "");
  const [acDuctStatus, setAcDuctStatus] = useState(editing?.ac_duct_cleaning_status ?? "");
  const [remark, setRemark] = useState(editing?.remark ?? "");
  const [contractScopeType, setContractScopeType] = useState<string>(
    editing?.contract_scope_type ?? (moduleType === "FM" ? "Facilities Management" : "Home AMC"),
  );

  const [siteName, setSiteName] = useState(editing?.site_name ?? "");
  const [siteAddress, setSiteAddress] = useState(editing?.site_address ?? "");
  const [buildingType, setBuildingType] = useState(editing?.building_type ?? "");
  const [billingCycle, setBillingCycle] = useState<string>(editing?.billing_cycle ?? "");
  const [retentionPercent, setRetentionPercent] = useState(
    editing?.retention_percent != null ? String(editing.retention_percent) : "",
  );
  const [vatPercent, setVatPercent] = useState(
    editing?.vat_percent != null ? String(editing.vat_percent) : "",
  );
  const [contractManagerId, setContractManagerId] = useState<string>(editing?.contract_manager_id ?? "none");
  const [slaProfileId, setSlaProfileId] = useState<string>(editing?.sla_profile_id ?? "none");
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();
  const [newQuote, setNewQuote] = useState({ quote_number: "", subject: "", quote_date: "", total: "", status: "Draft" });
  const [addingQuote, setAddingQuote] = useState(false);

  async function addQuotation() {
    if (!customerName) { toast.error("Select a customer first"); return; }
    if (!newQuote.quote_number && !newQuote.subject) { toast.error("Enter quote number or subject"); return; }
    setAddingQuote(true);
    try {
      const { error } = await supabase.from("quotes").insert({
        customer_id: customerId,
        customer_name: customerName,
        quote_number: newQuote.quote_number || null,
        subject: newQuote.subject || null,
        quote_date: newQuote.quote_date || null,
        total: newQuote.total ? Number(newQuote.total) : null,
        status: newQuote.status || "Draft",
      } as any);
      if (error) throw error;
      toast.success("Quotation added");
      setNewQuote({ quote_number: "", subject: "", quote_date: "", total: "", status: "Draft" });
      qc.invalidateQueries({ queryKey: ["customer-quotes", customerName] });
    } catch (e: any) {
      toast.error(e.message ?? "Failed to add quotation");
    } finally {
      setAddingQuote(false);
    }
  }

  const { data: customers = [] } = useQuery({
    queryKey: ["customers-lookup"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, display_name, company_name")
        .order("display_name", { ascending: true })
        .limit(10000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: contractManagers = [] } = useQuery({
    queryKey: ["contract-managers-lookup"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, full_name, first_name, last_name")
        .order("full_name", { ascending: true })
        .limit(10000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: slaProfiles = [] } = useQuery({
    queryKey: ["sla-profiles-lookup"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("sla_policies")
        .select("id, name")
        .eq("active", true)
        .order("name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: customerQuotes = [] } = useQuery({
    queryKey: ["customer-quotes", customerName],
    enabled: !!customerName,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select("id, quote_number, subject, total, status, quote_date")
        .eq("customer_name", customerName)
        .order("quote_date", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Load existing payments when editing
  useEffect(() => {
    (async () => {
      if (!editing?.id) return;
      const { data } = await supabase
        .from("contract_payments")
        .select("*")
        .eq("contract_id", editing.id)
        .order("sort_order", { ascending: true });
      setPayments((data ?? []).map((p: any) => ({
        id: p.id,
        payment_date: p.payment_date ?? "",
        value: p.value != null ? String(p.value) : "",
        status: computeStatus(p.payment_date ?? "", p.received_date ?? ""),
        received_date: p.received_date ?? "",
      })));
    })();
  }, [editing?.id]);

  // Auto-generate schedule when terms + start + value are set (only if empty)
  const canGenerate = paymentTerms && startDate;
  function regenerate() {
    if (!canGenerate) return;
    setPayments(generateSchedule(startDate, paymentTerms as PaymentTerm, Number(value) || 0));
  }
  useEffect(() => {
    if (payments.length === 0 && canGenerate) regenerate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentTerms, startDate, value]);

  function updatePayment(i: number, patch: Partial<PaymentRow>) {
    setPayments((prev) => prev.map((p, idx) => {
      if (idx !== i) return p;
      const merged = { ...p, ...patch };
      if ("payment_date" in patch || "received_date" in patch) {
        merged.status = computeStatus(merged.payment_date, merged.received_date);
      }
      return merged;
    }));
  }

  // Auto-fill end date (+1 year -1 day) and PPM schedule when start date changes
  function handleStartDateChange(v: string) {
    setStartDate(v);
    if (v) {
      setEndDate(addYearMinusDay(v));
      setPpmSchedule(generatePpmSchedule(v, contractType, bespokeFreq));
    }
  }

  // Regenerate PPM schedule when contract type or bespoke frequencies change
  useEffect(() => {
    if (startDate) setPpmSchedule(generatePpmSchedule(startDate, contractType, bespokeFreq));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractType, bespokeFreq]);

  function adjustBespokeFreq(key: string, delta: number) {
    setBespokeFreq((prev) => {
      const current = prev[key] ?? 0;
      const next = Math.max(0, Math.min(24, current + delta));
      return { ...prev, [key]: next };
    });
  }

  function updatePpmDate(key: string, idx: number, val: string) {
    setPpmSchedule((prev) => {
      const arr = (prev[key] ?? []).slice();
      arr[idx] = val;
      return { ...prev, [key]: arr };
    });
  }
  function updatePpmStatus(key: string, idx: number, val: string) {
    setPpmStatus((prev) => {
      const arr = (prev[key] ?? []).slice();
      arr[idx] = val === "Auto" ? "" : val;
      return { ...prev, [key]: arr };
    });
  }

  async function save() {
    if (!customerName) { toast.error("Select a client"); return; }
    if (isFM && !title.trim()) { toast.error("Enter a contract / site title"); return; }
    const finalTitle = title || `${customerName} – ${contractType} Contract`;
    setSaving(true);
    try {
      const common: any = {
        title: finalTitle,
        contract_no: contractNo || null,
        customer_id: customerId,
        customer_name: customerName,
        start_date: startDate || null,
        end_date: endDate || null,
        value: value ? Number(value) : null,
        payment_terms: paymentTerms || null,
        status,
        remark: remark || null,
        module_type: moduleType,
      };

      const payload: any = isFM
        ? {
            ...common,
            contract_scope_type: contractScopeType || null,
            site_name: siteName || null,
            site_address: siteAddress || null,
            building_type: buildingType || null,
            billing_cycle: billingCycle || null,
            retention_percent: retentionPercent ? Number(retentionPercent) : null,
            vat_percent: vatPercent ? Number(vatPercent) : null,
            contract_manager_id: contractManagerId === "none" ? null : contractManagerId,
            sla_profile_id: slaProfileId === "none" ? null : slaProfileId,
            handyman_hours: 0,
          }
        : {
            ...common,
            contract_type: contractType,
            spare_parts_amount: sparePartsAmount ? Number(sparePartsAmount) : 0,
            amc_ref_no: amcRefNo || null,
            handyman_hours: handymanHours === "" ? DEFAULT_HANDYMAN_HOURS : Number(handymanHours),
            ppm_schedule: { dates: ppmSchedule, status: ppmStatus, freq: contractType === "Bespoke" ? bespokeFreq : {} },
            water_tank_cleaning_date: null,
            water_tank_cleaning_status: null,
            ac_duct_cleaning_date: acDuctDate || null,
            ac_duct_cleaning_status: acDuctStatus || null,
            contract_scope_type: contractScopeType || null,
          };


      let contractId = editing?.id as string | undefined;
      if (editing) {
        const { error } = await supabase.from("contracts").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("contracts").insert(payload).select("id").single();
        if (error) throw error;
        contractId = data.id;
      }

      if (contractId) {
        await supabase.from("contract_payments").delete().eq("contract_id", contractId);
        if (payments.length > 0) {
          const rows = payments.map((p, idx) => ({
            contract_id: contractId,
            payment_date: p.payment_date || null,
            value: p.value ? Number(p.value) : null,
            status: p.status || "Not Yet Due",
            received_date: p.received_date || null,
            sort_order: idx,
          }));
          const { error } = await supabase.from("contract_payments").insert(rows);
          if (error) throw error;
        }
      }

      toast.success(editing ? "Contract updated" : "Contract created");
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Contract" : "New Contract"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Contract No */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Contract No</Label>
              <Input
                placeholder="e.g. CN-2026-0001"
                value={contractNo}
                onChange={(e) => setContractNo(e.target.value)}
              />
            </div>
          </div>

          {/* Customer + Title */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Customer *</Label>
              <Popover open={customerPickerOpen} onOpenChange={setCustomerPickerOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className="w-full justify-between">
                    {customerName || "Select customer..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[420px] p-0 pointer-events-auto" align="start">
                  <Command>
                    <CommandInput placeholder="Search customer..." />
                    <CommandList>
                      <CommandEmpty>No customer found.</CommandEmpty>
                      <CommandGroup>
                        {customers.map((c: any) => (
                          <CommandItem
                            key={c.id}
                            value={`${c.display_name} ${c.company_name ?? ""}`}
                            onSelect={() => {
                              setCustomerId(c.id);
                              setCustomerName(c.display_name);
                              setCustomerPickerOpen(false);
                            }}
                          >
                            <Check className={cn("mr-2 h-4 w-4", customerId === c.id ? "opacity-100" : "opacity-0")} />
                            <div className="flex flex-col">
                              <span>{c.display_name}</span>
                              {c.company_name && <span className="text-xs text-muted-foreground">{c.company_name}</span>}
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1">
              <Label>Contract Title *</Label>
              <div className="flex gap-4 items-center pt-1">
                {CONTRACT_TYPES.map((t) => (
                  <label key={t} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="contract_type"
                      value={t}
                      checked={contractType === t}
                      onChange={() => {
                        setContractType(t);
                        setSparePartsAmount(String(SPARE_PARTS_BY_TYPE[t]));
                      }}
                    />
                    {t} Contract
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Spare parts + AMC Ref No + Handyman Hours + status */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <Label>Spare Parts Amount (AED)</Label>
              <Input
                type="number"
                step="0.01"
                value={sparePartsAmount}
                onChange={(e) => setSparePartsAmount(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Auto-set by contract type ({contractType} = AED {SPARE_PARTS_BY_TYPE[contractType].toLocaleString()}).
              </p>
            </div>
            <div className="space-y-1">
              <Label>AMC Ref No.</Label>
              <Input
                placeholder="e.g. AMC-2026-0001"
                value={amcRefNo}
                onChange={(e) => setAmcRefNo(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Handyman Hours</Label>
              <Input
                type="number"
                min="0"
                step="1"
                value={handymanHours}
                onChange={(e) => setHandymanHours(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Default {DEFAULT_HANDYMAN_HOURS} hours/year.</p>
            </div>
            <div className="space-y-1">
              <Label>Contract Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>


          <Card className="p-4 space-y-4">
            <div>
              <Label className="text-sm font-medium">FM Contract Details</Label>
              <p className="text-xs text-muted-foreground">
                Optional fields for Building AMC and Facilities Management contracts.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <Label>Scope Type</Label>
                <Select value={contractScopeType} onValueChange={setContractScopeType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FM_SCOPE_TYPES.map((scope) => <SelectItem key={scope} value={scope}>{scope}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Site Name</Label>
                <Input value={siteName} onChange={(e) => setSiteName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Building Type</Label>
                <Input value={buildingType} onChange={(e) => setBuildingType(e.target.value)} />
              </div>
              <div className="space-y-1 md:col-span-3">
                <Label>Site Address</Label>
                <Textarea rows={2} value={siteAddress} onChange={(e) => setSiteAddress(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Billing Cycle</Label>
                <Select value={billingCycle || undefined} onValueChange={setBillingCycle}>
                  <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>
                    {BILLING_CYCLES.map((cycle) => <SelectItem key={cycle} value={cycle}>{cycle}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Retention %</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={retentionPercent}
                  onChange={(e) => setRetentionPercent(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>VAT %</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={vatPercent}
                  onChange={(e) => setVatPercent(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Contract Manager</Label>
                <Select value={contractManagerId} onValueChange={setContractManagerId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {contractManagers.map((employee: any) => {
                      const name = employee.full_name || [employee.first_name, employee.last_name].filter(Boolean).join(" ");
                      return <SelectItem key={employee.id} value={employee.id}>{name || "Unnamed employee"}</SelectItem>;
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>SLA Profile</Label>
                <Select value={slaProfileId} onValueChange={setSlaProfileId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {slaProfiles.map((profile: any) => (
                      <SelectItem key={profile.id} value={profile.id}>{profile.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Card>


          {/* Quotes for customer */}
          {customerName && (
            <div className="space-y-2">
              <Label className="text-sm">Quotations for {customerName}</Label>
              <Card className="max-h-72 overflow-y-auto">
                {customerQuotes.length === 0 ? (
                  <div className="p-4 space-y-3">
                    <div className="text-sm text-muted-foreground text-center">No quotations found. Add one below.</div>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                      <Input placeholder="Quote #" value={newQuote.quote_number}
                        onChange={(e) => setNewQuote({ ...newQuote, quote_number: e.target.value })} />
                      <Input placeholder="Subject" value={newQuote.subject}
                        onChange={(e) => setNewQuote({ ...newQuote, subject: e.target.value })} />
                      <Input type="date" value={newQuote.quote_date}
                        onChange={(e) => setNewQuote({ ...newQuote, quote_date: e.target.value })} />
                      <Input type="number" step="0.01" placeholder="Total" value={newQuote.total}
                        onChange={(e) => setNewQuote({ ...newQuote, total: e.target.value })} />
                      <Input placeholder="Status" value={newQuote.status}
                        onChange={(e) => setNewQuote({ ...newQuote, status: e.target.value })} />
                    </div>
                    <div className="flex justify-end">
                      <Button type="button" size="sm" onClick={addQuotation} disabled={addingQuote}>
                        {addingQuote ? "Adding..." : "Add Quotation"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Quote #</TableHead>
                        <TableHead>Subject</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {customerQuotes.map((q: any) => (
                        <TableRow key={q.id}>
                          <TableCell>{q.quote_number ?? "—"}</TableCell>
                          <TableCell>{q.subject ?? "—"}</TableCell>
                          <TableCell>{q.quote_date ?? "—"}</TableCell>
                          <TableCell>{q.status ?? "—"}</TableCell>
                          <TableCell className="text-right">{q.total ?? "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </Card>
            </div>
          )}

          {/* Contract terms */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <Label>Contract Value</Label>
              <Input type="number" step="0.01" value={value} onChange={(e) => setValue(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Start Date</Label>
              <Input type="date" value={startDate} onChange={(e) => handleStartDateChange(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>End Date</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Payment Terms</Label>
              <Select value={paymentTerms} onValueChange={(v) => setPaymentTerms(v as PaymentTerm)}>
                <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_TERMS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Payment schedule */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Payment Schedule</Label>
              <Button type="button" variant="outline" size="sm" onClick={regenerate} disabled={!canGenerate}>
                Regenerate
              </Button>
            </div>
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Payment Date</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Received Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-4 text-muted-foreground text-sm">
                      Select payment terms and start date to generate the schedule.
                    </TableCell></TableRow>
                  ) : payments.map((p, i) => (
                    <TableRow key={i}>
                      <TableCell>{i + 1}</TableCell>
                      <TableCell>
                        <Input type="date" value={p.payment_date} onChange={(e) => updatePayment(i, { payment_date: e.target.value })} />
                      </TableCell>
                      <TableCell>
                        <Input type="number" step="0.01" value={p.value} onChange={(e) => updatePayment(i, { value: e.target.value })} />
                      </TableCell>
                      <TableCell>
                        <Select value={p.status} onValueChange={(v) => updatePayment(i, { status: v })}>
                          <SelectTrigger className={cn("h-8 font-medium border", payStatusClasses(p.status))}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PAY_STATUS.map((s) => (
                              <SelectItem key={s} value={s}>
                                <span className={cn("inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium", payStatusClasses(s))}>{s}</span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input type="date" value={p.received_date} onChange={(e) => updatePayment(i, { received_date: e.target.value })} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </div>

          {/* PPM service schedule */}
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <Label className="text-sm font-medium">PPM Service Schedule</Label>
                <p className="text-xs text-muted-foreground">
                  {contractType} package • dates auto-generated from start date. Status auto-computes from today; override to Scheduled or Completed as needed.
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className={cn("inline-flex items-center rounded-md border px-2 py-0.5", ppmStatusClasses("Not Yet Due"))}>Not Yet Due</span>
                <span className={cn("inline-flex items-center rounded-md border px-2 py-0.5", ppmStatusClasses("Due"))}>Due ≤15d</span>
                <span className={cn("inline-flex items-center rounded-md border px-2 py-0.5", ppmStatusClasses("Overdue"))}>Overdue</span>
                <span className={cn("inline-flex items-center rounded-md border px-2 py-0.5", ppmStatusClasses("Scheduled"))}>Scheduled</span>
                <span className={cn("inline-flex items-center rounded-md border px-2 py-0.5", ppmStatusClasses("Completed"))}>Completed</span>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {PPM_SERVICES.map((s) => {
                const freq = freqFor(contractType, s.key, bespokeFreq);
                const dates = ppmSchedule[s.key] ?? [];
                const overrides = ppmStatus[s.key] ?? [];
                const Icon = s.Icon;
                const isBespoke = contractType === "Bespoke";
                return (
                  <Card key={s.key} className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-md bg-primary/10 text-primary flex items-center justify-center">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div>
                          <div className="text-sm font-semibold leading-tight">{s.label}</div>
                          <div className="text-xs text-muted-foreground">{freq} visit{freq === 1 ? "" : "s"} / year</div>
                        </div>
                      </div>
                      {isBespoke ? (
                        <div className="flex items-center gap-1">
                          <Button type="button" size="icon" variant="outline" className="h-7 w-7" onClick={() => adjustBespokeFreq(s.key, -1)} disabled={freq <= 0}>−</Button>
                          <span className="min-w-8 text-center text-sm font-semibold tabular-nums">{freq}</span>
                          <Button type="button" size="icon" variant="outline" className="h-7 w-7" onClick={() => adjustBespokeFreq(s.key, +1)}>+</Button>
                        </div>
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">{freq}/yr</Badge>
                      )}
                    </div>
                    {freq === 0 && (
                      <div className="text-xs text-muted-foreground italic">Not included in this contract.</div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {Array.from({ length: freq }).map((_, i) => {
                        const date = dates[i] ?? "";
                        const override = overrides[i] ?? "";
                        const computed = computePpmStatus(date, override);
                        return (
                          <div key={i} className="rounded-md border bg-card/50 p-2.5 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Visit {i + 1}</span>
                              <span className={cn("inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium", ppmStatusClasses(computed))}>
                                {computed}
                              </span>
                            </div>
                            <Input
                              type="date"
                              className="h-8 text-sm"
                              value={date}
                              onChange={(e) => updatePpmDate(s.key, i, e.target.value)}
                            />
                            <Select value={override || "Auto"} onValueChange={(v) => updatePpmStatus(s.key, i, v)}>
                              <SelectTrigger className="h-7 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {PPM_STATUS_OPTIONS.map((o) => (
                                  <SelectItem key={o} value={o} className="text-xs">{o}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>


          {/* AC duct */}



          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>
                AC Duct Cleaning Date
                {contractType === "Standard" && (
                  <span className="ml-2 text-xs text-muted-foreground">(not included in Standard)</span>
                )}
              </Label>
              <Input
                type="date"
                value={acDuctDate}
                onChange={(e) => setAcDuctDate(e.target.value)}
                disabled={contractType === "Standard"}
              />
            </div>
            <div className="space-y-1">
              <Label>AC Duct Cleaning Status</Label>
              <Select value={acDuctStatus} onValueChange={setAcDuctStatus} disabled={contractType === "Standard"}>
                <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  {WATER_STATUS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label>Remark</Label>
            <Textarea rows={3} value={remark} onChange={(e) => setRemark(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving..." : editing ? "Update Contract" : "Create Contract"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
