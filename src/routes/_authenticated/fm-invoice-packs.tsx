/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, FileText, Pencil, Plus, Printer, RefreshCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ExportMenu } from "@/components/export-menu";
import { PAGE_SIZE, paginate, PaginationBar } from "@/components/pagination-bar";
import {
  INVOICE_ITEM_TYPES,
  INVOICE_PACK_STATUSES,
  buildClientSubmissionSummary,
  buildInvoiceItemsFromContractLineItems,
  buildInvoiceItemsFromBillingLines,
  buildParksideInvoiceItems,
  calculateInvoiceTotals,
  getBillingMonthRange,
  getInvoiceStatusBadgeVariant,
  money,
} from "@/lib/fm-invoice";

export const Route = createFileRoute("/_authenticated/fm-invoice-packs")({
  component: ContractInvoicePacksPage,
});

const fmDb = supabase as any;

const emptyItemForm = {
  item_type: "Additional Work",
  description: "",
  quantity: "1",
  unit: "month",
  unit_rate: "0",
  amount: "0",
  vat_applicable: true,
  remarks: "",
};

function formatAED(value: unknown) {
  return new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency: "AED",
    maximumFractionDigits: 2,
  }).format(money(value));
}

function ContractInvoicePacksPage() {
  const qc = useQueryClient();
  const [contractFilter, setContractFilter] = useState("all");
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [selectedPack, setSelectedPack] = useState<any | null>(null);
  const [editingPack, setEditingPack] = useState<any | null>(null);
  const [itemDialog, setItemDialog] = useState<{ mode: "add" | "edit"; row?: any } | null>(null);
  const [itemForm, setItemForm] = useState(emptyItemForm);
  const [generating, setGenerating] = useState(false);
  const [templateConfirm, setTemplateConfirm] = useState<any[] | null>(null);

  const { data: contracts = [] } = useQuery({
    queryKey: ["invoice-contracts"],
    queryFn: async () => {
      const { data, error } = await fmDb
        .from("contracts")
        .select("id, title, contract_no, customer_name, site_name, vat_percent, retention_percent")
        .order("created_at", { ascending: false })
        .limit(10000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: packs = [], isLoading } = useQuery({
    queryKey: ["invoice_packs"],
    queryFn: async () => {
      const { data, error } = await fmDb
        .from("invoice_packs")
        .select(
          "*, contracts:contract_id(id, title, contract_no, customer_name, site_name), monthly_reports:monthly_report_id(id, report_no, status, sla_compliance_percent, ppm_compliance_percent, manpower_variance, report_data)",
        )
        .order("billing_period_start", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: items = [] } = useQuery({
    queryKey: ["invoice_pack_items", selectedPack?.id],
    enabled: Boolean(selectedPack?.id),
    queryFn: async () => {
      const { data, error } = await fmDb
        .from("invoice_pack_items")
        .select("*, contract_line_items:contract_line_item_id(description)")
        .eq("invoice_pack_id", selectedPack.id)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const filteredPacks = useMemo(
    () =>
      (packs as any[]).filter((row) => {
        const rowMonth = row.invoice_month ?? row.billing_period_start?.slice(0, 7);
        if (contractFilter !== "all" && row.contract_id !== contractFilter) return false;
        if (statusFilter !== "all" && row.status !== statusFilter) return false;
        if (month && rowMonth !== month) return false;
        return true;
      }),
    [packs, contractFilter, statusFilter, month],
  );

  const selectedTotals = useMemo(
    () =>
      calculateInvoiceTotals(
        items as any[],
        selectedPack?.vat_percent ?? selectedPack?.contracts?.vat_percent ?? 5,
        selectedPack?.retention_percent ?? selectedPack?.contracts?.retention_percent ?? 0,
      ),
    [items, selectedPack],
  );

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(filteredPacks.length / PAGE_SIZE));
    if (page > totalPages) setPage(totalPages);
  }, [filteredPacks.length, page]);

  async function fetchPackSource(contractId: string, start: string, end: string) {
    const [
      contract,
      lineItems,
      monthlyReport,
      workOrders,
      ppmVisits,
      attendanceLogs,
      manpowerPlans,
      manpowerAssignments,
      serviceReports,
    ] = await Promise.all([
      fmDb.from("contracts").select("*").eq("id", contractId).single(),
      fmDb
        .from("contract_line_items")
        .select("*")
        .eq("contract_id", contractId)
        .order("line_no", { ascending: true }),
      fmDb
        .from("monthly_reports")
        .select("*")
        .eq("contract_id", contractId)
        .eq("month_start", start)
        .eq("month_end", end)
        .maybeSingle(),
      fmDb.from("work_orders").select("*").eq("contract_id", contractId),
      fmDb.from("ppm_visits").select("*").eq("contract_id", contractId),
      fmDb.from("attendance_logs").select("*").eq("contract_id", contractId),
      fmDb.from("contract_manpower_plans").select("*").eq("contract_id", contractId),
      fmDb.from("contract_manpower_assignments").select("*").eq("contract_id", contractId),
      fmDb.from("service_reports").select("*").eq("contract_id", contractId),
    ]);
    for (const result of [
      contract,
      lineItems,
      monthlyReport,
      workOrders,
      ppmVisits,
      attendanceLogs,
      manpowerPlans,
      manpowerAssignments,
      serviceReports,
    ]) {
      if (result.error) throw result.error;
    }
    return {
      contract: contract.data,
      lineItems: lineItems.data ?? [],
      monthlyReport: monthlyReport.data,
      workOrders: workOrders.data ?? [],
      ppmVisits: ppmVisits.data ?? [],
      attendanceLogs: attendanceLogs.data ?? [],
      manpowerPlans: manpowerPlans.data ?? [],
      manpowerAssignments: manpowerAssignments.data ?? [],
      serviceReports: serviceReports.data ?? [],
    };
  }

  async function ensureReportingPeriod(contractId: string, start: string, end: string) {
    const existing = await fmDb
      .from("reporting_periods")
      .select("id")
      .eq("contract_id", contractId)
      .eq("period_type", "Monthly")
      .eq("period_start", start)
      .eq("period_end", end)
      .maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data?.id) return existing.data.id;
    const created = await fmDb
      .from("reporting_periods")
      .insert({
        contract_id: contractId,
        period_type: "Monthly",
        period_start: start,
        period_end: end,
        label: `Invoice ${start.slice(0, 7)}`,
        status: "Open",
      })
      .select("id")
      .single();
    if (created.error) throw created.error;
    return created.data.id;
  }

  async function generateInvoicePack() {
    if (contractFilter === "all") {
      toast.error("Select a contract first");
      return;
    }
    const range = getBillingMonthRange(month);
    const existing = (packs as any[]).find(
      (pack) =>
        pack.contract_id === contractFilter &&
        (pack.invoice_month === month || pack.billing_period_start === range.start),
    );
    if (existing) {
      toast.info("Invoice pack already exists for this month");
      setSelectedPack(existing);
      return;
    }

    setGenerating(true);
    try {
      const source = await fetchPackSource(contractFilter, range.start, range.end);
      const reportingPeriodId = await ensureReportingPeriod(contractFilter, range.start, range.end);
      const generatedItems = buildInvoiceItemsFromContractLineItems(source.lineItems);
      const vatPercent = money(source.contract?.vat_percent) || 5;
      const retentionPercent = money(source.contract?.retention_percent);
      const totals = calculateInvoiceTotals(generatedItems, vatPercent, retentionPercent);
      const reportData = buildClientSubmissionSummary({
        ...source,
        invoiceItems: generatedItems,
        start: range.start,
        end: range.end,
      });
      const created = await fmDb
        .from("invoice_packs")
        .insert({
          contract_id: contractFilter,
          reporting_period_id: reportingPeriodId,
          monthly_report_id: source.monthlyReport?.id ?? null,
          invoice_no: `INV-${month}`,
          invoice_number: `INV-${month}`,
          period_start: range.start,
          period_end: range.end,
          billing_period_start: range.start,
          billing_period_end: range.end,
          invoice_month: month,
          status: "Draft",
          base_contract_amount: totals.subtotal,
          subtotal_amount: totals.subtotal,
          vat_percent: vatPercent,
          vat_amount: totals.vatAmount,
          retention_percent: retentionPercent,
          retention_amount: totals.retentionAmount,
          deductions_amount: totals.deductionAmount,
          deduction_amount: totals.deductionAmount,
          adjustment_amount: totals.adjustmentAmount,
          gross_amount: totals.grossAmount,
          total_amount: totals.netPayable,
          net_payable: totals.netPayable,
          report_data: reportData,
          notes: "",
          remarks: "",
        })
        .select(
          "*, contracts:contract_id(id, title, contract_no, customer_name, site_name), monthly_reports:monthly_report_id(id, report_no, status, sla_compliance_percent, ppm_compliance_percent, manpower_variance, report_data)",
        )
        .single();
      if (created.error) throw created.error;
      if (generatedItems.length) {
        const { error } = await fmDb.from("invoice_pack_items").insert(
          generatedItems.map((item) => ({
            ...item,
            invoice_pack_id: created.data.id,
          })),
        );
        if (error) throw error;
      }
      toast.success("Invoice pack generated");
      setSelectedPack(created.data);
      qc.invalidateQueries({ queryKey: ["invoice_packs"] });
      qc.invalidateQueries({ queryKey: ["invoice_pack_items", created.data.id] });
    } catch (error: any) {
      toast.error(error.message ?? "Invoice pack generation failed");
    } finally {
      setGenerating(false);
    }
  }

  async function refreshPackData(pack = selectedPack) {
    if (!pack) return;
    try {
      const start = pack.billing_period_start ?? pack.period_start;
      const end = pack.billing_period_end ?? pack.period_end;
      const source = await fetchPackSource(pack.contract_id, start, end);
      const currentItems = pack.id === selectedPack?.id ? (items as any[]) : [];
      const reportData = buildClientSubmissionSummary({
        ...source,
        invoiceItems: currentItems,
        start,
        end,
      });
      const totals = calculateInvoiceTotals(
        currentItems,
        pack.vat_percent ?? source.contract?.vat_percent ?? 5,
        pack.retention_percent ?? source.contract?.retention_percent ?? 0,
      );
      const { error } = await fmDb
        .from("invoice_packs")
        .update(buildPackTotalsPayload(totals, { report_data: reportData }))
        .eq("id", pack.id);
      if (error) throw error;
      toast.success("Invoice pack refreshed");
      qc.invalidateQueries({ queryKey: ["invoice_packs"] });
    } catch (error: any) {
      toast.error(error.message ?? "Refresh failed");
    }
  }

  function startAddItem(type = "Additional Work") {
    setItemForm({ ...emptyItemForm, item_type: type });
    setItemDialog({ mode: "add" });
  }

  function startEditItem(row: any) {
    setItemForm({
      item_type: row.item_type ?? "Other",
      description: row.description ?? "",
      quantity: String(row.quantity ?? 1),
      unit: row.unit ?? "",
      unit_rate: String(row.unit_rate ?? 0),
      amount: String(row.amount ?? 0),
      vat_applicable: row.vat_applicable !== false,
      remarks: row.remarks ?? "",
    });
    setItemDialog({ mode: "edit", row });
  }

  async function saveItem() {
    if (!selectedPack) return;
    const quantity = money(itemForm.quantity) || 1;
    const unitRate = money(itemForm.unit_rate);
    const amount = money(itemForm.amount) || quantity * unitRate;
    const payload = {
      item_type: itemForm.item_type,
      description: itemForm.description,
      quantity,
      unit: itemForm.unit,
      unit_rate: unitRate,
      amount,
      vat_applicable: itemForm.vat_applicable,
      remarks: itemForm.remarks,
    };
    if (!payload.description.trim()) {
      toast.error("Description is required");
      return;
    }
    const result =
      itemDialog?.mode === "edit"
        ? await fmDb.from("invoice_pack_items").update(payload).eq("id", itemDialog.row.id)
        : await fmDb.from("invoice_pack_items").insert({
            ...payload,
            invoice_pack_id: selectedPack.id,
            sort_order: (items as any[]).length + 1,
          });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success(itemDialog?.mode === "edit" ? "Item updated" : "Item added");
    setItemDialog(null);
    await afterItemsChanged();
  }

  async function deleteItem(row: any) {
    const { error } = await fmDb.from("invoice_pack_items").delete().eq("id", row.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Item deleted");
    await afterItemsChanged();
  }

  async function addParksideLines() {
    if (!selectedPack && contractFilter === "all") {
      toast.error("Select or open a contract first");
      return;
    }
    if (!selectedPack) {
      await generateInvoicePack();
      return;
    }
    const newItems = buildParksideInvoiceItems(items as any[]);
    if (newItems.length === 0) {
      toast.info("48 Parkside invoice lines already exist");
      return;
    }
    const { error } = await fmDb.from("invoice_pack_items").insert(
      newItems.map((item) => ({
        ...item,
        invoice_pack_id: selectedPack.id,
      })),
    );
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("48 Parkside invoice lines added");
    await afterItemsChanged();
  }

  async function generateFromBillingTemplate(replaceExisting = false) {
    if (!selectedPack) {
      toast.error("Open an invoice pack first");
      return;
    }
    const { data: lines, error } = await fmDb
      .from("contract_billing_lines")
      .select("*")
      .eq("contract_id", selectedPack.contract_id)
      .order("sort_order", { ascending: true });
    if (error) {
      toast.error(error.message);
      return;
    }
    const newItems = buildInvoiceItemsFromBillingLines(lines ?? []);
    if (newItems.length === 0) {
      toast.error("No billable billing template lines for this contract");
      return;
    }
    const existingGenerated = (items as any[]).filter((row) => row.item_type === "Contract Service");
    if (existingGenerated.length > 0 && !replaceExisting) {
      setTemplateConfirm(newItems);
      return;
    }
    if (replaceExisting && existingGenerated.length > 0) {
      const del = await fmDb
        .from("invoice_pack_items")
        .delete()
        .eq("invoice_pack_id", selectedPack.id)
        .eq("item_type", "Contract Service");
      if (del.error) {
        toast.error(del.error.message);
        return;
      }
    }
    const insert = await fmDb
      .from("invoice_pack_items")
      .insert(newItems.map((item) => ({ ...item, invoice_pack_id: selectedPack.id })));
    if (insert.error) {
      toast.error(insert.error.message);
      return;
    }
    setTemplateConfirm(null);
    toast.success(`${newItems.length} invoice lines generated from billing template`);
    await afterItemsChanged();
  }

  async function afterItemsChanged() {
    if (!selectedPack) return;
    await qc.invalidateQueries({ queryKey: ["invoice_pack_items", selectedPack.id] });
    const refreshedItems = await fmDb
      .from("invoice_pack_items")
      .select("*")
      .eq("invoice_pack_id", selectedPack.id);
    if (refreshedItems.error) {
      toast.error(refreshedItems.error.message);
      return;
    }
    const totals = calculateInvoiceTotals(
      refreshedItems.data ?? [],
      selectedPack.vat_percent ?? 5,
      selectedPack.retention_percent ?? 0,
    );
    const { error } = await fmDb
      .from("invoice_packs")
      .update(buildPackTotalsPayload(totals))
      .eq("id", selectedPack.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    qc.invalidateQueries({ queryKey: ["invoice_packs"] });
  }

  async function updatePackStatus(status: string) {
    if (!selectedPack) return;
    const payload: any = { status };
    if (status === "Submitted") payload.submitted_at = new Date().toISOString();
    if (status === "Approved") payload.approved_at = new Date().toISOString();
    const { error } = await fmDb.from("invoice_packs").update(payload).eq("id", selectedPack.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Invoice pack marked ${status}`);
    qc.invalidateQueries({ queryKey: ["invoice_packs"] });
    setSelectedPack({ ...selectedPack, ...payload });
  }

  async function savePackEdit() {
    if (!editingPack) return;
    const { error } = await fmDb
      .from("invoice_packs")
      .update({
        invoice_number: editingPack.invoice_number,
        invoice_no: editingPack.invoice_number,
        client_reference: editingPack.client_reference,
        prepared_by: editingPack.prepared_by,
        reviewed_by: editingPack.reviewed_by,
        remarks: editingPack.remarks,
        notes: editingPack.remarks,
      })
      .eq("id", editingPack.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Invoice pack updated");
    setEditingPack(null);
    qc.invalidateQueries({ queryKey: ["invoice_packs"] });
  }

  async function deleteDraftPack(row: any) {
    if (row.status !== "Draft") {
      toast.error("Only draft invoice packs can be deleted");
      return;
    }
    const { error } = await fmDb.from("invoice_packs").delete().eq("id", row.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Draft invoice pack deleted");
    if (selectedPack?.id === row.id) setSelectedPack(null);
    qc.invalidateQueries({ queryKey: ["invoice_packs"] });
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">FM Invoice Packs</h1>
          <p className="text-muted-foreground">
            Prepare monthly FM billing and client submission packs.
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <ExportMenu
            filename="invoice-packs"
            sheetName="Invoice Packs"
            rows={filteredPacks}
            columns={[
              { key: "invoice_number", label: "Invoice Number" },
              { key: "invoice_month", label: "Invoice Month" },
              { key: "status", label: "Status" },
              { key: "subtotal_amount", label: "Subtotal" },
              { key: "vat_amount", label: "VAT" },
              { key: "net_payable", label: "Net Payable" },
            ]}
          />
          <Button onClick={generateInvoicePack} disabled={generating || contractFilter === "all"}>
            <Plus className="h-4 w-4 mr-2" /> Generate Invoice Pack
          </Button>
        </div>
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Filter label="Contract" value={contractFilter} onValueChange={setContractFilter}>
            <SelectItem value="all">All Contracts</SelectItem>
            {contracts.map((contract: any) => (
              <SelectItem key={contract.id} value={contract.id}>
                {contract.contract_no
                  ? `${contract.contract_no} - ${contract.site_name ?? contract.title}`
                  : contract.title}
              </SelectItem>
            ))}
          </Filter>
          <div>
            <Label className="text-xs">Billing Month</Label>
            <Input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
          </div>
          <Filter label="Status" value={statusFilter} onValueChange={setStatusFilter}>
            <SelectItem value="all">All Statuses</SelectItem>
            {INVOICE_PACK_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {status}
              </SelectItem>
            ))}
          </Filter>
          <div className="flex items-end">
            <Button
              variant="outline"
              className="w-full"
              onClick={addParksideLines}
              disabled={contractFilter === "all" && !selectedPack}
            >
              Add 48 Parkside Invoice Lines
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice</TableHead>
              <TableHead>Contract</TableHead>
              <TableHead>Period</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Subtotal</TableHead>
              <TableHead className="text-right">VAT</TableHead>
              <TableHead className="text-right">Net Payable</TableHead>
              <TableHead className="w-40 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : paginate(filteredPacks, page).length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  No invoice packs found.
                </TableCell>
              </TableRow>
            ) : (
              paginate(filteredPacks, page).map((row: any) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">
                    {row.invoice_number ?? row.invoice_no ?? "Draft invoice"}
                  </TableCell>
                  <TableCell>
                    {row.contracts?.contract_no ?? row.contracts?.site_name ?? row.contracts?.title}
                  </TableCell>
                  <TableCell>
                    {row.billing_period_start ?? row.period_start} to{" "}
                    {row.billing_period_end ?? row.period_end}
                  </TableCell>
                  <TableCell>
                    <Badge variant={getInvoiceStatusBadgeVariant(row.status) as any}>
                      {row.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">{formatAED(row.subtotal_amount)}</TableCell>
                  <TableCell className="text-right">{formatAED(row.vat_amount)}</TableCell>
                  <TableCell className="text-right">{formatAED(row.net_payable)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" onClick={() => setSelectedPack(row)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => setEditingPack(row)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="icon" variant="ghost" disabled={row.status !== "Draft"}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete draft invoice pack?</AlertDialogTitle>
                            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteDraftPack(row)}>
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <PaginationBar page={page} total={filteredPacks.length} onPageChange={setPage} />
      </Card>

      {selectedPack && (
        <InvoicePackDetail
          pack={selectedPack}
          items={items as any[]}
          totals={selectedTotals}
          onAddItem={() => startAddItem("Additional Work")}
          onAddDeduction={() => startAddItem("Deduction")}
          onAddAdjustment={() => startAddItem("Variation")}
          onEditItem={startEditItem}
          onDeleteItem={deleteItem}
          onGenerateFromTemplate={() => generateFromBillingTemplate(false)}
          onRefresh={() => refreshPackData()}
          onStatus={updatePackStatus}
        />
      )}

      <PackEditDialog
        pack={editingPack}
        setPack={setEditingPack}
        onClose={() => setEditingPack(null)}
        onSave={savePackEdit}
      />
      <ItemDialog
        open={Boolean(itemDialog)}
        form={itemForm}
        setForm={setItemForm}
        onClose={() => setItemDialog(null)}
        onSave={saveItem}
      />
      <Dialog
        open={Boolean(templateConfirm)}
        onOpenChange={(open) => !open && setTemplateConfirm(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Replace existing contract service lines?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This pack already has contract service lines. Generating from the billing template will
            replace them with {templateConfirm?.length ?? 0} billable lines (the TOTAL row is always
            excluded). Deductions and adjustments are kept.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateConfirm(null)}>
              Cancel
            </Button>
            <Button onClick={() => generateFromBillingTemplate(true)}>Replace lines</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>

  );
}

function buildPackTotalsPayload(totals: ReturnType<typeof calculateInvoiceTotals>, extra = {}) {
  return {
    base_contract_amount: totals.subtotal,
    subtotal_amount: totals.subtotal,
    vat_amount: totals.vatAmount,
    retention_amount: totals.retentionAmount,
    deductions_amount: totals.deductionAmount,
    deduction_amount: totals.deductionAmount,
    adjustment_amount: totals.adjustmentAmount,
    gross_amount: totals.grossAmount,
    total_amount: totals.netPayable,
    net_payable: totals.netPayable,
    ...extra,
  };
}

function InvoicePackDetail({
  pack,
  items,
  totals,
  onAddItem,
  onAddDeduction,
  onAddAdjustment,
  onEditItem,
  onDeleteItem,
  onRefresh,
  onGenerateFromTemplate,
  onStatus,
}: {
  pack: any;
  items: any[];
  totals: ReturnType<typeof calculateInvoiceTotals>;
  onAddItem: () => void;
  onAddDeduction: () => void;
  onAddAdjustment: () => void;
  onEditItem: (row: any) => void;
  onDeleteItem: (row: any) => void;
  onRefresh: () => void;
  onGenerateFromTemplate: () => void;
  onStatus: (status: string) => void;
}) {
  const summary = pack.report_data ?? {};
  return (
    <Card className="p-4 space-y-4 print:shadow-none">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            <h2 className="text-xl font-semibold">
              {pack.invoice_number ?? pack.invoice_no ?? "Invoice Pack"}
            </h2>
            <Badge variant={getInvoiceStatusBadgeVariant(pack.status) as any}>{pack.status}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {pack.contracts?.title ?? pack.contracts?.contract_no ?? "Contract"} ·{" "}
            {pack.billing_period_start ?? pack.period_start} to{" "}
            {pack.billing_period_end ?? pack.period_end}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={onRefresh}>
            <RefreshCcw className="h-4 w-4 mr-2" /> Generate / Refresh Pack Data
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-2" /> Print / Save as PDF
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <Metric label="Subtotal" value={formatAED(totals.subtotal)} />
        <Metric label="VAT" value={formatAED(totals.vatAmount)} />
        <Metric label="Retention" value={formatAED(totals.retentionAmount)} />
        <Metric label="Deductions" value={formatAED(totals.deductionAmount)} />
        <Metric label="Adjustments" value={formatAED(totals.adjustmentAmount)} />
        <Metric label="Net Payable" value={formatAED(totals.netPayable)} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={onAddItem}>
          <Plus className="h-4 w-4 mr-2" /> Add Item
        </Button>
        <Button size="sm" variant="outline" onClick={onGenerateFromTemplate}>
          <FileText className="h-4 w-4 mr-2" /> Generate from Billing Template
        </Button>
        <Button size="sm" variant="outline" onClick={onAddDeduction}>
          Add Deduction
        </Button>
        <Button size="sm" variant="outline" onClick={onAddAdjustment}>
          Add Adjustment
        </Button>
        <Button size="sm" variant="outline" onClick={() => onStatus("Submitted")}>
          Mark Submitted
        </Button>
        <Button size="sm" variant="outline" onClick={() => onStatus("Approved")}>
          Mark Approved
        </Button>
        <Button size="sm" variant="outline" onClick={() => onStatus("Invoiced")}>
          Mark Invoiced
        </Button>
        <Button size="sm" variant="outline" onClick={() => onStatus("Paid")}>
          Mark Paid
        </Button>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Qty</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead className="text-right">Rate</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  No invoice items yet.
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.item_type}</TableCell>
                  <TableCell className="font-medium">{item.description}</TableCell>
                  <TableCell>{item.quantity}</TableCell>
                  <TableCell>{item.unit ?? "—"}</TableCell>
                  <TableCell className="text-right">{formatAED(item.unit_rate)}</TableCell>
                  <TableCell className="text-right">{formatAED(item.amount)}</TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" onClick={() => onEditItem(item)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => onDeleteItem(item)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <div>
        <h3 className="font-semibold mb-3">Client Submission Pack</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <SubmissionSection title="Monthly Report" rows={summary.monthlyReport} />
          <SubmissionSection title="Work Orders" rows={summary.workOrders} />
          <SubmissionSection title="PPM" rows={summary.ppm} />
          <SubmissionSection title="Attendance / Manpower" rows={summary.manpower} />
          <SubmissionSection title="Service Reports / WCR" rows={summary.serviceReports} />
          <SubmissionSection
            title="Deductions / Adjustments"
            rows={summary.deductionsAdjustments}
          />
        </div>
      </div>

      <Card className="p-3">
        <div className="font-medium">Client Notes</div>
        <p className="text-sm whitespace-pre-wrap text-muted-foreground mt-1">
          {pack.remarks || pack.notes || "No client notes added."}
        </p>
      </Card>
    </Card>
  );
}

function SubmissionSection({ title, rows }: { title: string; rows: any }) {
  return (
    <Card className="p-3">
      <div className="font-medium mb-2">{title}</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
        {Object.entries(rows ?? {})
          .filter(([, value]) => typeof value !== "object")
          .map(([key, value]) => (
            <div key={key}>
              <span className="text-muted-foreground">{key}: </span>
              {String(value)}
            </div>
          ))}
      </div>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-bold">{value}</div>
    </Card>
  );
}

function Filter({
  label,
  value,
  onValueChange,
  children,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>{children}</SelectContent>
      </Select>
    </div>
  );
}

function PackEditDialog({
  pack,
  setPack,
  onClose,
  onSave,
}: {
  pack: any | null;
  setPack: (value: any | null) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  if (!pack) return null;
  return (
    <Dialog open={Boolean(pack)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Invoice Pack</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field
            label="Invoice Number"
            value={pack.invoice_number ?? ""}
            onChange={(value) => setPack({ ...pack, invoice_number: value })}
          />
          <Field
            label="Client Reference"
            value={pack.client_reference ?? ""}
            onChange={(value) => setPack({ ...pack, client_reference: value })}
          />
          <Field
            label="Prepared By"
            value={pack.prepared_by ?? ""}
            onChange={(value) => setPack({ ...pack, prepared_by: value })}
          />
          <Field
            label="Reviewed By"
            value={pack.reviewed_by ?? ""}
            onChange={(value) => setPack({ ...pack, reviewed_by: value })}
          />
          <div className="md:col-span-2">
            <Label className="text-xs">Remarks</Label>
            <Textarea
              value={pack.remarks ?? ""}
              onChange={(event) => setPack({ ...pack, remarks: event.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ItemDialog({
  open,
  form,
  setForm,
  onClose,
  onSave,
}: {
  open: boolean;
  form: typeof emptyItemForm;
  setForm: (value: typeof emptyItemForm) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Invoice Item</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Filter
            label="Item Type"
            value={form.item_type}
            onValueChange={(value) => setForm({ ...form, item_type: value })}
          >
            {INVOICE_ITEM_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {type}
              </SelectItem>
            ))}
          </Filter>
          <Field
            label="Description"
            value={form.description}
            onChange={(value) => setForm({ ...form, description: value })}
          />
          <Field
            label="Quantity"
            type="number"
            value={form.quantity}
            onChange={(value) => setForm({ ...form, quantity: value })}
          />
          <Field
            label="Unit"
            value={form.unit}
            onChange={(value) => setForm({ ...form, unit: value })}
          />
          <Field
            label="Unit Rate"
            type="number"
            value={form.unit_rate}
            onChange={(value) => {
              const quantity = money(form.quantity) || 1;
              setForm({ ...form, unit_rate: value, amount: String(quantity * money(value)) });
            }}
          />
          <Field
            label="Amount"
            type="number"
            value={form.amount}
            onChange={(value) => setForm({ ...form, amount: value })}
          />
          <div className="md:col-span-2">
            <Label className="text-xs">Remarks</Label>
            <Textarea
              value={form.remarks}
              onChange={(event) => setForm({ ...form, remarks: event.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSave}>Save Item</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}
