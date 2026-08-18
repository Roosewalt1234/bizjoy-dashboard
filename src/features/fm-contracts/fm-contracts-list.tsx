import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, FileText, Calendar, AlertCircle, CreditCard } from "lucide-react";
import { toast } from "sonner";
import { PaginationBar, PAGE_SIZE, paginate } from "@/components/pagination-bar";
import { ExportMenu } from "@/components/export-menu";
import { cn } from "@/lib/utils";
import { FM_SCOPE_TYPES, BILLING_CYCLES, STATUS_OPTIONS, computePaymentStatus, deleteFmContract } from "./fm-contracts-api";
import { useFmContractModal } from "./use-fm-contract-modal";
import { FmContractModal } from "./fm-contract-modal";

function payStatusClasses(s: string): string {
  switch (s) {
    case "Received":    return "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-200";
    case "Due":         return "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-200";
    case "Overdue":     return "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/40 dark:text-red-200";
    case "Not Yet Due": return "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800/60 dark:text-slate-200";
    default:            return "bg-muted text-muted-foreground border-border";
  }
}
function billingCycleBadgeClasses(t: string): string {
  switch (t) {
    case "Monthly": return "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-200";
    case "Quarterly": return "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-200";
    case "Half Yearly": return "bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-900/40 dark:text-indigo-200";
    default: return "bg-muted text-muted-foreground border-border";
  }
}
function fmtAED(n: number) {
  return new Intl.NumberFormat("en-AE", { style: "currency", currency: "AED", maximumFractionDigits: 0 }).format(n);
}

function PaymentDueBadge({ date, status }: { date: string; status: string }) {
  const [showStatus, setShowStatus] = useState(false);
  if (!date) return <span className="text-muted-foreground">—</span>;
  const classes = status === "Overdue" ? payStatusClasses("Overdue") : status === "Due" ? payStatusClasses("Due") : "";
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

/**
 * FM Contracts list page. Only triggers the shared FmContractModal - it doesn't own any
 * of the modal's field state or save logic, just tells it when to open and what to edit.
 */
export function FmContractsListPage() {
  const qc = useQueryClient();
  const modal = useFmContractModal();
  const [page, setPage] = useState(1);
  const [filterScope, setFilterScope] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterBillingCycle, setFilterBillingCycle] = useState("all");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["fm-contracts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fm_contracts")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const filteredRows = useMemo(() => {
    return rows.filter((r: any) => {
      const scopeMatch = filterScope === "all" || (r.contract_scope_type || "") === filterScope;
      const statusMatch = filterStatus === "all" || (r.status || "").toLowerCase() === filterStatus.toLowerCase();
      const billingMatch = filterBillingCycle === "all" || (r.billing_cycle || "").toLowerCase() === filterBillingCycle.toLowerCase();
      return scopeMatch && statusMatch && billingMatch;
    });
  }, [rows, filterScope, filterStatus, filterBillingCycle]);

  const { data: allPayments = [] } = useQuery({
    queryKey: ["fm_contract_payments_all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fm_contract_payments")
        .select("contract_id, payment_date, received_date, value")
        .order("payment_date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const nextPaymentInfoByContract = useMemo(() => {
    const m: Record<string, { payment_date: string; status: string; value: number }> = {};
    for (const p of allPayments as any[]) {
      if (p.received_date || !p.payment_date) continue;
      const status = computePaymentStatus(p.payment_date, "");
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

  const totalContracts = filteredRows.length;
  const totalPaymentDue = useMemo(() => {
    return (allPayments as any[])
      .filter((p) => {
        if (p.received_date || !p.payment_date) return false;
        return ["Due", "Overdue"].includes(computePaymentStatus(p.payment_date, ""));
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
      return d.getFullYear() === nextMonthDate.getFullYear() && d.getMonth() === nextMonthDate.getMonth();
    }).length;
  }, [allPayments, nextMonthDate]);

  const total = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
  const pageRows = paginate(filteredRows, page);

  async function remove(id: string) {
    try {
      await deleteFmContract(id);
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["fm-contracts"] });
    } catch (e: any) {
      toast.error(e.message ?? "Delete failed");
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">FM Contracts</h1>
          <p className="text-muted-foreground">Facilities management contracts and site operations.</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportMenu
            filename="fm-contracts"
            sheetName="FM Contracts"
            rows={filteredRows as any[]}
            columns={[
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
            ]}
          />
          <Button onClick={modal.openCreate}>
            <Plus className="h-4 w-4 mr-2" /> New FM Contract
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 flex items-center gap-4 bg-gradient-to-br from-blue-50 to-white dark:from-blue-950/30 dark:to-background border-blue-100 dark:border-blue-900/40">
          <div className="p-3 rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300"><FileText className="h-5 w-5" /></div>
          <div><p className="text-sm text-muted-foreground">Total Contracts</p><p className="text-2xl font-bold">{totalContracts}</p></div>
        </Card>
        <Card className="p-4 flex items-center gap-4 bg-gradient-to-br from-amber-50 to-white dark:from-amber-950/30 dark:to-background border-amber-100 dark:border-amber-900/40">
          <div className="p-3 rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300"><CreditCard className="h-5 w-5" /></div>
          <div><p className="text-sm text-muted-foreground">Total Payment Due</p><p className="text-2xl font-bold">{fmtAED(totalPaymentDue)}</p></div>
        </Card>
        <Card className="p-4 flex items-center gap-4 bg-gradient-to-br from-rose-50 to-white dark:from-rose-950/30 dark:to-background border-rose-100 dark:border-rose-900/40">
          <div className="p-3 rounded-xl bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300"><Calendar className="h-5 w-5" /></div>
          <div><p className="text-sm text-muted-foreground">Expiring This Month</p><p className="text-2xl font-bold">{contractsExpiringThisMonth}</p></div>
        </Card>
        <Card className="p-4 flex items-center gap-4 bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/30 dark:to-background border-emerald-100 dark:border-emerald-900/40">
          <div className="p-3 rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300"><AlertCircle className="h-5 w-5" /></div>
          <div><p className="text-sm text-muted-foreground">Payments Due Next Month</p><p className="text-2xl font-bold">{paymentsDueNextMonth}</p></div>
        </Card>
      </div>

      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="w-full sm:w-48">
            <Label htmlFor="filter-scope" className="text-xs">Scope</Label>
            <Select value={filterScope} onValueChange={(v) => { setFilterScope(v); setPage(1); }}>
              <SelectTrigger id="filter-scope"><SelectValue placeholder="All Scopes" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Scopes</SelectItem>
                {FM_SCOPE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="w-full sm:w-48">
            <Label htmlFor="filter-status" className="text-xs">Status</Label>
            <Select value={filterStatus} onValueChange={(v) => { setFilterStatus(v); setPage(1); }}>
              <SelectTrigger id="filter-status"><SelectValue placeholder="All Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="w-full sm:w-48">
            <Label htmlFor="filter-billing" className="text-xs">Billing Cycle</Label>
            <Select value={filterBillingCycle} onValueChange={(v) => { setFilterBillingCycle(v); setPage(1); }}>
              <SelectTrigger id="filter-billing"><SelectValue placeholder="All Billing Cycles" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Billing Cycles</SelectItem>
                {BILLING_CYCLES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <Card>
        <Table>
          <TableHeader>
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
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">No FM contracts yet.</TableCell></TableRow>
            ) : pageRows.map((r: any) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">
                  <div className="space-y-0.5">
                    <div className="font-semibold">{r.title ?? r.contract_no ?? "—"}</div>
                    {r.contract_no ? <div className="text-xs text-muted-foreground">{r.contract_no}</div> : null}
                    {r.site_name ? <div className="text-xs text-muted-foreground">{r.site_name}</div> : null}
                  </div>
                </TableCell>
                <TableCell>{r.customer_name ?? "—"}</TableCell>
                <TableCell>{r.contract_scope_type ? <Badge variant="outline" className="font-medium">{r.contract_scope_type}</Badge> : "—"}</TableCell>
                <TableCell>{r.start_date ?? "—"}</TableCell>
                <TableCell>{r.end_date ?? "—"}</TableCell>
                <TableCell>{r.value ?? "—"}</TableCell>
                <TableCell>{r.billing_cycle ? <Badge variant="outline" className={cn("font-medium", billingCycleBadgeClasses(r.billing_cycle))}>{r.billing_cycle}</Badge> : "—"}</TableCell>
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
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="icon" variant="ghost" asChild>
                      <Link to="/fm-contracts/$id" params={{ id: r.id }}><FileText className="h-4 w-4" /></Link>
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => modal.openEdit(r)}>
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

      <FmContractModal
        {...modal.dialogProps}
        onSaved={() => qc.invalidateQueries({ queryKey: ["fm-contracts"] })}
      />
    </div>
  );
}
