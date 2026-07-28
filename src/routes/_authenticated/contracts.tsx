import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
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
import { Plus, Pencil, Trash2, Check, ChevronsUpDown, Wrench, Droplets, Zap, Wind, Sun, Fan } from "lucide-react";
import { toast } from "sonner";
import { PaginationBar, PAGE_SIZE, paginate } from "@/components/pagination-bar";
import { ExportMenu } from "@/components/export-menu";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/contracts")({
  component: ContractsPage,
});

const PAYMENT_TERMS = ["Monthly", "Quarterly", "Half Yearly", "Single Payment"] as const;
type PaymentTerm = typeof PAYMENT_TERMS[number];
const STATUS_OPTIONS = ["Draft", "Active", "Expired", "Terminated"];
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
const CONTRACT_TYPES = ["Standard", "Premium"] as const;
type ContractType = typeof CONTRACT_TYPES[number];
const SPARE_PARTS_BY_TYPE: Record<ContractType, number> = { Standard: 0, Premium: 1000 };
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
function freqFor(type: ContractType, key: string): number {
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
  // Standard: once/year aligned with 1st PPM. Premium: twice/year — 1st PPM and 3rd PPM.
  if (!anchors.length) return type === "Premium" ? ["", ""] : [""];
  if (type === "Premium") {
    const first = anchors[0];
    const third = anchors[2] ?? anchors[anchors.length - 1];
    return [first, third];
  }
  return [anchors[0]];
}
function generatePpmSchedule(start: string, type: ContractType): Record<string, string[]> {
  const max = type === "Premium" ? 4 : 3;
  const anchors = anchorDates(start, max);
  const out: Record<string, string[]> = {};
  for (const s of PPM_SERVICES) {
    const freq = type === "Premium" ? s.premium : s.standard;
    if (s.key === "water_tank") {
      out[s.key] = start ? waterTankDates(anchors, type) : Array(freq).fill("");
    } else {
      out[s.key] = start ? subsetDates(anchors, freq) : Array(freq).fill("");
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
      status: computeStatus(payment_date, ""),
      received_date: "",
    };
  });
}

function ContractsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [page, setPage] = useState(1);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["contracts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("contracts").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
  const pageRows = paginate(rows, page);

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
          <h1 className="text-3xl font-bold tracking-tight">Contracts</h1>
          <p className="text-muted-foreground">Manage customer contracts.</p>
        </div>
        <Button onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" /> New Contract
        </Button>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Start</TableHead>
              <TableHead>End</TableHead>
              <TableHead>Value</TableHead>
              <TableHead>Terms</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No contracts yet.</TableCell></TableRow>
            ) : pageRows.map((r: any) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.title ?? "—"}</TableCell>
                <TableCell>{r.customer_name ?? "—"}</TableCell>
                <TableCell>{r.start_date ?? "—"}</TableCell>
                <TableCell>{r.end_date ?? "—"}</TableCell>
                <TableCell>{r.value ?? "—"}</TableCell>
                <TableCell>{r.payment_terms ?? "—"}</TableCell>
                <TableCell>{r.status ?? "—"}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
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
          onSaved={() => qc.invalidateQueries({ queryKey: ["contracts"] })}
        />
      )}
    </div>
  );
}

function ContractDialog({
  open, onOpenChange, editing, onSaved,
}: { open: boolean; onOpenChange: (o: boolean) => void; editing: any | null; onSaved: () => void }) {
  const [customerId, setCustomerId] = useState<string | null>(editing?.customer_id ?? null);
  const [customerName, setCustomerName] = useState<string>(editing?.customer_name ?? "");
  const [title, setTitle] = useState(editing?.title ?? "");
  const [contractType, setContractType] = useState<ContractType>((editing?.contract_type as ContractType) ?? "Standard");
  const [sparePartsAmount, setSparePartsAmount] = useState<string>(
    editing?.spare_parts_amount != null ? String(editing.spare_parts_amount) : String(SPARE_PARTS_BY_TYPE[(editing?.contract_type as ContractType) ?? "Standard"])
  );
  const [amcRefNo, setAmcRefNo] = useState<string>(editing?.amc_ref_no ?? "");
  const [value, setValue] = useState<string>(editing?.value != null ? String(editing.value) : "");
  const [startDate, setStartDate] = useState(editing?.start_date ?? "");
  const [endDate, setEndDate] = useState(editing?.end_date ?? "");
  const [paymentTerms, setPaymentTerms] = useState<PaymentTerm | "">(editing?.payment_terms ?? "");
  const [status, setStatus] = useState(editing?.status ?? "Draft");
  // Normalize legacy ppm_schedule (Record<string,string[]>) → { dates, status }
  const _initialPpm = (() => {
    const raw = editing?.ppm_schedule ?? {};
    if (raw && typeof raw === "object" && ("dates" in raw || "status" in raw)) {
      return { dates: (raw.dates ?? {}) as Record<string, string[]>, status: (raw.status ?? {}) as Record<string, string[]> };
    }
    return { dates: (raw ?? {}) as Record<string, string[]>, status: {} as Record<string, string[]> };
  })();
  const [ppmSchedule, setPpmSchedule] = useState<Record<string, string[]>>(_initialPpm.dates);
  const [ppmStatus, setPpmStatus] = useState<Record<string, string[]>>(_initialPpm.status);
  const [acDuctDate, setAcDuctDate] = useState(editing?.ac_duct_cleaning_date ?? "");
  const [acDuctStatus, setAcDuctStatus] = useState(editing?.ac_duct_cleaning_status ?? "");
  const [remark, setRemark] = useState(editing?.remark ?? "");
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
      if (!endDate) setEndDate(addYearMinusDay(v));
      setPpmSchedule(generatePpmSchedule(v, contractType));
    }
  }

  // Regenerate PPM schedule when contract type changes (only if start date set)
  useEffect(() => {
    if (startDate) setPpmSchedule(generatePpmSchedule(startDate, contractType));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractType]);

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
    if (!customerName) { toast.error("Select a customer"); return; }
    const finalTitle = title || `${customerName} – ${contractType} Contract`;
    setSaving(true);
    try {
      const payload: any = {
        title: finalTitle,
        contract_type: contractType,
        spare_parts_amount: sparePartsAmount ? Number(sparePartsAmount) : 0,
        amc_ref_no: amcRefNo || null,
        customer_id: customerId,
        customer_name: customerName,
        start_date: startDate || null,
        end_date: endDate || null,
        value: value ? Number(value) : null,
        payment_terms: paymentTerms || null,
        status,
        ppm_schedule: { dates: ppmSchedule, status: ppmStatus },
        water_tank_cleaning_date: null,
        water_tank_cleaning_status: null,
        ac_duct_cleaning_date: acDuctDate || null,
        ac_duct_cleaning_status: acDuctStatus || null,
        remark: remark || null,
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

          {/* Spare parts + AMC Ref No + status */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
              <Label>Contract Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>



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
                const freq = freqFor(contractType, s.key);
                const dates = ppmSchedule[s.key] ?? [];
                const overrides = ppmStatus[s.key] ?? [];
                const Icon = s.Icon;
                return (
                  <Card key={s.key} className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-md bg-primary/10 text-primary flex items-center justify-center">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div>
                          <div className="text-sm font-semibold leading-tight">{s.label}</div>
                          <div className="text-xs text-muted-foreground">{freq} visit{freq > 1 ? "s" : ""} / year</div>
                        </div>
                      </div>
                      <Badge variant="secondary" className="text-[10px]">{freq}/yr</Badge>
                    </div>
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
