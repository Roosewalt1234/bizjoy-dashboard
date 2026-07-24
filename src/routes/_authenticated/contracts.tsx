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
import { Plus, Pencil, Trash2, Check, ChevronsUpDown } from "lucide-react";
import { toast } from "sonner";
import { PaginationBar, PAGE_SIZE, paginate } from "@/components/pagination-bar";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/contracts")({
  component: ContractsPage,
});

const PAYMENT_TERMS = ["Monthly", "Quarterly", "Half Yearly", "Single Payment"] as const;
type PaymentTerm = typeof PAYMENT_TERMS[number];
const STATUS_OPTIONS = ["Draft", "Active", "Expired", "Terminated"];
const PAY_STATUS = ["Pending", "Due", "Received"] as const;
const WATER_STATUS = ["Pending", "Scheduled", "Completed"] as const;

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
  if (!payment_date) return "Pending";
  const today = new Date().toISOString().slice(0, 10);
  return payment_date < today ? "Pending" : "Due";
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
  const [value, setValue] = useState<string>(editing?.value != null ? String(editing.value) : "");
  const [startDate, setStartDate] = useState(editing?.start_date ?? "");
  const [endDate, setEndDate] = useState(editing?.end_date ?? "");
  const [paymentTerms, setPaymentTerms] = useState<PaymentTerm | "">(editing?.payment_terms ?? "");
  const [status, setStatus] = useState(editing?.status ?? "Draft");
  const [ppm1, setPpm1] = useState(editing?.ppm_1_date ?? "");
  const [ppm2, setPpm2] = useState(editing?.ppm_2_date ?? "");
  const [ppm3, setPpm3] = useState(editing?.ppm_3_date ?? "");
  const [ppm4, setPpm4] = useState(editing?.ppm_4_date ?? "");
  const [wtcDate, setWtcDate] = useState(editing?.water_tank_cleaning_date ?? "");
  const [wtcStatus, setWtcStatus] = useState(editing?.water_tank_cleaning_status ?? "");
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
        status: p.status ?? "Pending",
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

  // Auto-fill end date (+1 year -1 day) and PPM dates when start date changes
  function handleStartDateChange(v: string) {
    setStartDate(v);
    if (v) {
      if (!endDate) setEndDate(addYearMinusDay(v));
      setPpm1((prev: string) => prev || addMonths(v, 3));
      setPpm2((prev: string) => prev || addMonths(v, 6));
      setPpm3((prev: string) => prev || addMonths(v, 9));
      setPpm4((prev: string) => prev || addMonths(v, 12));
    }
  }

  async function save() {
    if (!customerName) { toast.error("Select a customer"); return; }
    if (!title) { toast.error("Enter a contract title"); return; }
    setSaving(true);
    try {
      const payload: any = {
        title,
        customer_id: customerId,
        customer_name: customerName,
        start_date: startDate || null,
        end_date: endDate || null,
        value: value ? Number(value) : null,
        payment_terms: paymentTerms || null,
        status,
        ppm_1_date: ppm1 || null,
        ppm_2_date: ppm2 || null,
        ppm_3_date: ppm3 || null,
        ppm_4_date: ppm4 || null,
        water_tank_cleaning_date: wtcDate || null,
        water_tank_cleaning_status: wtcStatus || null,
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
            status: p.status || "Pending",
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
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Villa AMC 2026" />
            </div>
          </div>

          {/* Quotes for customer */}
          {customerName && (
            <div className="space-y-2">
              <Label className="text-sm">Quotations for {customerName}</Label>
              <Card className="max-h-56 overflow-y-auto">
                {customerQuotes.length === 0 ? (
                  <div className="p-4 text-sm text-muted-foreground text-center">No quotations found.</div>
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
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {PAY_STATUS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
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

          {/* PPM dates */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">PPM Dates</Label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-1"><Label className="text-xs">1st PPM</Label><Input type="date" value={ppm1} onChange={(e) => setPpm1(e.target.value)} /></div>
              <div className="space-y-1"><Label className="text-xs">2nd PPM</Label><Input type="date" value={ppm2} onChange={(e) => setPpm2(e.target.value)} /></div>
              <div className="space-y-1"><Label className="text-xs">3rd PPM</Label><Input type="date" value={ppm3} onChange={(e) => setPpm3(e.target.value)} /></div>
              <div className="space-y-1"><Label className="text-xs">4th PPM</Label><Input type="date" value={ppm4} onChange={(e) => setPpm4(e.target.value)} /></div>
            </div>
          </div>

          {/* Water tank cleaning + status */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label>Water Tank Cleaning Date</Label>
              <Input type="date" value={wtcDate} onChange={(e) => setWtcDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Water Tank Cleaning Status</Label>
              <Select value={wtcStatus} onValueChange={setWtcStatus}>
                <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  {WATER_STATUS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
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
