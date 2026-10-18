import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Ban, Banknote, Eye, FileInput, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PaginationBar, paginate } from "@/components/pagination-bar";
import { ExportMenu } from "@/components/export-menu";
import type { ExportColumn } from "@/lib/export-data";
import { usePermissions } from "@/hooks/use-permissions";
import { cn } from "@/lib/utils";
import {
  aed, ASSET_CATEGORIES, BILL_PAYMENT_METHODS, BILL_STATUS_BADGE, billBalance, billDisplayStatus,
  CLASSIFICATION_BADGE, CLASSIFICATIONS, contractLabel, daysPastDue, db, errorMessage, EXPENSE_CATEGORIES,
  PAYMENT_METHODS, PO_STATUS_BADGE, purposeLabel, todayISO, useBills, useContractOptions, usePemoCards,
  usePurchaseOrders, useVendorPayments, useVendors,
  type Bill, type BillPaymentMethod, type Classification, type LineItem, type PaymentMethod, type PurchaseOrder,
} from "@/lib/purchase";

export const Route = createFileRoute("/_authenticated/purchases")({
  component: PurchasesPage,
});

type View = "orders" | "bills" | "unpaid" | "overdue" | "paid" | "payments" | "aging";

const VIEWS: { key: View; label: string; dot: string }[] = [
  { key: "orders", label: "Purchase Orders", dot: "bg-slate-400" },
  { key: "bills", label: "All Bills", dot: "bg-indigo-400" },
  { key: "unpaid", label: "Unpaid / Due", dot: "bg-yellow-400" },
  { key: "overdue", label: "Overdue", dot: "bg-red-500" },
  { key: "paid", label: "Paid Bills", dot: "bg-green-500" },
  { key: "payments", label: "Payments Made", dot: "bg-teal-500" },
  { key: "aging", label: "Payables Aging", dot: "bg-orange-400" },
];

type DocKind = "order" | "bill";

type DocForm = {
  vendor_id: string;
  doc_date: string;
  second_date: string; // expected date (PO) / due date (bill, Credit only)
  vendor_bill_ref: string;
  classification: Classification | "";
  project_type: "FM" | "AMC" | "";
  contract_id: string;
  asset_name: string;
  asset_category: string;
  expense_category: string;
  payment_method: BillPaymentMethod | "";
  pemo_card_id: string;
  notes: string;
  items: LineItem[];
};

const blankItem = (): LineItem => ({ description: "", quantity: 1, unit_price: 0, vat_rate: 5 });

const emptyDoc = (): DocForm => ({
  vendor_id: "",
  doc_date: todayISO(),
  second_date: "",
  vendor_bill_ref: "",
  classification: "",
  project_type: "",
  contract_id: "",
  asset_name: "",
  asset_category: "",
  expense_category: "",
  payment_method: "",
  pemo_card_id: "",
  notes: "",
  items: [blankItem()],
});

type PayForm = { bill: Bill | null; amount: string; payment_date: string; payment_method: PaymentMethod | ""; pemo_card_id: string; reference: string; notes: string };

function lineTotals(items: LineItem[]) {
  let subtotal = 0;
  let vat = 0;
  for (const it of items) {
    const amount = Math.round(Number(it.quantity || 0) * Number(it.unit_price || 0) * 100) / 100;
    subtotal += amount;
    vat += Math.round(amount * Number(it.vat_rate || 0)) / 100;
  }
  return { subtotal, vat, total: subtotal + vat };
}

function PurchasesPage() {
  const qc = useQueryClient();
  const { can } = usePermissions();
  const { data: vendors = [] } = useVendors();
  const { data: bills = [], isLoading: billsLoading } = useBills();
  const { data: orders = [], isLoading: ordersLoading } = usePurchaseOrders();
  const { data: payments = [] } = useVendorPayments();
  const { data: contracts } = useContractOptions();
  const { data: pemoCards = [] } = usePemoCards();

  const [view, setView] = useState<View>("bills");
  const [classFilter, setClassFilter] = useState<Classification | "all">("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const [docOpen, setDocOpen] = useState(false);
  const [docKind, setDocKind] = useState<DocKind>("bill");
  const [docEditId, setDocEditId] = useState<string | null>(null);
  const [docFromPo, setDocFromPo] = useState<PurchaseOrder | null>(null);
  const [lockedMethod, setLockedMethod] = useState(false);
  const [doc, setDoc] = useState<DocForm>(emptyDoc());
  const [saving, setSaving] = useState(false);

  const [viewBill, setViewBill] = useState<Bill | null>(null);
  const [viewBillItems, setViewBillItems] = useState<LineItem[]>([]);
  const [pay, setPay] = useState<PayForm | null>(null);

  const vendorById = useMemo(() => new Map(vendors.map((v) => [v.id, v])), [vendors]);
  const billById = useMemo(() => new Map(bills.map((b) => [b.id, b])), [bills]);
  const cardById = useMemo(() => new Map(pemoCards.map((c) => [c.id, c.label])), [pemoCards]);

  const refresh = () => {
    for (const k of ["purchase_bills", "purchase_orders", "vendor_payments", "accounts_transactions"]) {
      qc.invalidateQueries({ queryKey: [k] });
    }
  };

  // ---- filtering ----------------------------------------------------------
  const q = search.trim().toLowerCase();
  const matchesText = (parts: (string | null | undefined)[]) => !q || parts.some((p) => (p ?? "").toLowerCase().includes(q));
  const classOk = (c: Classification) => classFilter === "all" || classFilter === c;

  const liveBills = bills.filter((b) => classOk(b.classification));
  const billsByView = {
    bills: liveBills,
    unpaid: liveBills.filter((b) => b.status === "Unpaid" || b.status === "Partially Paid"),
    overdue: liveBills.filter((b) => billDisplayStatus(b) === "Overdue"),
    paid: liveBills.filter((b) => b.status === "Paid"),
  };
  const openOrders = orders.filter((o) => classOk(o.classification));

  const cardStats: Record<View, { count: number; amount: number }> = {
    orders: { count: openOrders.filter((o) => o.status === "Issued" || o.status === "Draft").length, amount: openOrders.filter((o) => o.status === "Issued" || o.status === "Draft").reduce((s, o) => s + Number(o.total), 0) },
    bills: { count: billsByView.bills.filter((b) => b.status !== "Void").length, amount: billsByView.bills.filter((b) => b.status !== "Void").reduce((s, b) => s + Number(b.total), 0) },
    unpaid: { count: billsByView.unpaid.length, amount: billsByView.unpaid.reduce((s, b) => s + billBalance(b), 0) },
    overdue: { count: billsByView.overdue.length, amount: billsByView.overdue.reduce((s, b) => s + billBalance(b), 0) },
    paid: { count: billsByView.paid.length, amount: billsByView.paid.reduce((s, b) => s + Number(b.total), 0) },
    payments: { count: payments.length, amount: payments.reduce((s, p) => s + Number(p.amount), 0) },
    aging: { count: 0, amount: 0 },
  };

  const billRows = (view === "bills" || view === "unpaid" || view === "overdue" || view === "paid" ? billsByView[view] : [])
    .filter((b) => matchesText([b.bill_number, b.vendor_bill_ref, vendorById.get(b.vendor_id)?.name, purposeLabel(b, contracts)]));
  const orderRows = openOrders.filter((o) => matchesText([o.po_number, vendorById.get(o.vendor_id)?.name, purposeLabel(o, contracts)]));
  const paymentRows = payments.filter((p) => {
    const b = billById.get(p.bill_id);
    if (b && !classOk(b.classification)) return false;
    return matchesText([p.payment_number, p.reference, b?.bill_number, vendorById.get(p.vendor_id)?.name]);
  });

  // Aging by due date, per vendor, for open balances (Zoho "AP Aging Summary").
  const agingRows = useMemo(() => {
    const m = new Map<string, { vendor: string; current: number; d30: number; d60: number; d90: number; d90p: number; total: number }>();
    for (const b of bills) {
      if (!classOk(b.classification)) continue;
      const bal = billBalance(b);
      if (bal <= 0) continue;
      const name = vendorById.get(b.vendor_id)?.name ?? "—";
      const r = m.get(b.vendor_id) ?? { vendor: name, current: 0, d30: 0, d60: 0, d90: 0, d90p: 0, total: 0 };
      const days = daysPastDue(b.due_date);
      if (days <= 0) r.current += bal;
      else if (days <= 30) r.d30 += bal;
      else if (days <= 60) r.d60 += bal;
      else if (days <= 90) r.d90 += bal;
      else r.d90p += bal;
      r.total += bal;
      m.set(b.vendor_id, r);
    }
    return [...m.values()].filter((r) => matchesText([r.vendor])).sort((a, b) => b.total - a.total);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bills, vendorById, classFilter, q]);

  const listLength =
    view === "orders" ? orderRows.length : view === "payments" ? paymentRows.length : view === "aging" ? agingRows.length : billRows.length;

  // ---- document form ------------------------------------------------------
  async function loadItems(column: "purchase_order_id" | "bill_id", id: string): Promise<LineItem[]> {
    const { data, error } = await db
      .from("purchase_line_items")
      .select("id, description, quantity, unit_price, vat_rate")
      .eq(column, id)
      .order("position");
    if (error) {
      toast.error(error.message);
      return [];
    }
    return (data ?? []).map((r: any) => ({
      id: r.id,
      description: r.description,
      quantity: Number(r.quantity),
      unit_price: Number(r.unit_price),
      vat_rate: Number(r.vat_rate),
    }));
  }

  function openNewDoc(kind: DocKind) {
    setDocKind(kind);
    setDocEditId(null);
    setDocFromPo(null);
    setLockedMethod(false);
    setDoc(emptyDoc());
    setDocOpen(true);
  }

  function classificationFields(r: PurchaseOrder | Bill): Partial<DocForm> {
    return {
      vendor_id: r.vendor_id,
      classification: r.classification,
      project_type: r.project_type ?? "",
      contract_id: r.contract_id ?? "",
      asset_name: r.asset_name ?? "",
      asset_category: r.asset_category ?? "",
      expense_category: r.expense_category ?? "",
      notes: r.notes ?? "",
    };
  }

  async function openEditOrder(o: PurchaseOrder) {
    const items = await loadItems("purchase_order_id", o.id);
    setDocKind("order");
    setDocEditId(o.id);
    setDocFromPo(null);
    setLockedMethod(false);
    setDoc({ ...emptyDoc(), ...classificationFields(o), doc_date: o.order_date, second_date: o.expected_date ?? "", items: items.length ? items : [blankItem()] });
    setDocOpen(true);
  }

  async function openBillFromOrder(o: PurchaseOrder) {
    const items = await loadItems("purchase_order_id", o.id);
    setDocKind("bill");
    setDocEditId(null);
    setDocFromPo(o);
    setLockedMethod(false);
    setDoc({ ...emptyDoc(), ...classificationFields(o), items: items.map(({ id: _id, ...rest }) => rest) });
    setDocOpen(true);
  }

  async function openEditBill(b: Bill) {
    const items = await loadItems("bill_id", b.id);
    setDocKind("bill");
    setDocEditId(b.id);
    setDocFromPo(null);
    setLockedMethod(true);
    setDoc({
      ...emptyDoc(),
      ...classificationFields(b),
      doc_date: b.bill_date,
      second_date: b.payment_method === "Credit" ? b.due_date : "",
      vendor_bill_ref: b.vendor_bill_ref ?? "",
      payment_method: b.payment_method,
      pemo_card_id: b.pemo_card_id ?? "",
      items: items.length ? items : [blankItem()],
    });
    setViewBill(null);
    setDocOpen(true);
  }

  function setItem(i: number, patch: Partial<LineItem>) {
    setDoc((d) => ({ ...d, items: d.items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)) }));
  }

  async function saveDoc(e: React.FormEvent) {
    e.preventDefault();
    if (!doc.vendor_id) return toast.error("Pick a vendor");
    if (!doc.classification) return toast.error("Pick what this purchase is for: Project, Asset or Opex");
    if (docKind === "bill" && !doc.payment_method) return toast.error("Pick a payment method");
    const items = doc.items.filter((it) => it.description.trim());
    if (items.length === 0) return toast.error("Add at least one line item");

    const common = {
      p_vendor: doc.vendor_id,
      p_classification: doc.classification,
      p_items: items.map(({ description, quantity, unit_price, vat_rate }) => ({ description, quantity, unit_price, vat_rate })),
      p_project_type: doc.classification === "project" ? doc.project_type || null : null,
      p_contract: doc.classification === "project" ? doc.contract_id || null : null,
      p_asset_name: doc.classification === "capex" ? doc.asset_name : null,
      p_asset_category: doc.classification === "capex" ? doc.asset_category || null : null,
      p_expense_category: doc.classification === "opex" ? doc.expense_category || null : null,
      p_notes: doc.notes,
    };
    setSaving(true);
    try {
      if (docKind === "order") {
        const { data, error } = await db.rpc("save_purchase_order", {
          ...common,
          p_order_date: doc.doc_date || null,
          p_expected_date: doc.second_date || null,
          p_purchase_order_id: docEditId,
        });
        if (error) throw error;
        toast.success(`${data?.po_number ?? "Purchase order"} saved`);
      } else {
        const { data, error } = await db.rpc("save_purchase_bill", {
          ...common,
          p_payment_method: doc.payment_method,
          p_pemo_card: doc.payment_method === "PEMO" ? doc.pemo_card_id || null : null,
          p_bill_date: doc.doc_date || null,
          p_due_date: doc.payment_method === "Credit" ? doc.second_date || null : null,
          p_vendor_bill_ref: doc.vendor_bill_ref,
          p_purchase_order_id: docFromPo?.id ?? null,
          p_bill_id: docEditId,
        });
        if (error) throw error;
        toast.success(`${data?.bill_number ?? "Bill"} saved and posted to the Ledger`);
      }
      setDocOpen(false);
      refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  // ---- other actions ------------------------------------------------------
  async function cancelOrder(o: PurchaseOrder) {
    const { error } = await db.from("purchase_orders").update({ status: "Cancelled" }).eq("id", o.id);
    if (error) return toast.error(error.message);
    toast.success(`${o.po_number} cancelled`);
    refresh();
  }

  async function voidBill(b: Bill) {
    const { error } = await db.rpc("void_purchase_bill", { p_bill_id: b.id, p_reason: null });
    if (error) return toast.error(error.message);
    toast.success(`${b.bill_number} voided and removed from the Ledger`);
    setViewBill(null);
    refresh();
  }

  async function deletePayment(id: string) {
    const { error } = await db.rpc("delete_vendor_payment", { p_payment_id: id });
    if (error) return toast.error(error.message);
    toast.success("Payment deleted");
    refresh();
  }

  async function openBill(b: Bill) {
    setViewBill(b);
    setViewBillItems(await loadItems("bill_id", b.id));
  }

  function openPay(b: Bill) {
    setPay({ bill: b, amount: billBalance(b).toFixed(2), payment_date: todayISO(), payment_method: "", pemo_card_id: "", reference: "", notes: "" });
  }

  async function savePayment(e: React.FormEvent) {
    e.preventDefault();
    if (!pay?.bill) return;
    if (!pay.payment_method) return toast.error("Pick a payment method");
    setSaving(true);
    try {
      const { data, error } = await db.rpc("record_vendor_payment", {
        p_bill: pay.bill.id,
        p_amount: Number(pay.amount),
        p_payment_method: pay.payment_method,
        p_payment_date: pay.payment_date || null,
        p_pemo_card: pay.payment_method === "PEMO" ? pay.pemo_card_id || null : null,
        p_reference: pay.reference,
        p_notes: pay.notes,
      });
      if (error) throw error;
      toast.success(`${data?.payment_number ?? "Payment"} recorded - ${data?.bill_status ?? ""}`);
      setPay(null);
      setViewBill(null);
      refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  // ---- export -------------------------------------------------------------
  const vendorName = (_: any, r: any) => vendorById.get(r.vendor_id)?.name ?? "";
  const purpose = (_: any, r: any) => purposeLabel(r, contracts);
  const classLabel = (v: any) => CLASSIFICATIONS.find((c) => c.value === v)?.label ?? v;
  const exportConfig: { rows: any[]; columns: ExportColumn[]; name: string } =
    view === "orders"
      ? {
          name: "purchase-orders",
          rows: orderRows,
          columns: [
            { key: "po_number", label: "PO #" },
            { key: "order_date", label: "Date" },
            { key: "vendor_id", label: "Vendor", format: vendorName },
            { key: "classification", label: "Type", format: classLabel },
            { key: "contract_id", label: "For", format: purpose },
            { key: "subtotal", label: "Subtotal" },
            { key: "vat_amount", label: "VAT" },
            { key: "total", label: "Total" },
            { key: "status", label: "Status" },
          ],
        }
      : view === "payments"
        ? {
            name: "payments-made",
            rows: paymentRows,
            columns: [
              { key: "payment_number", label: "Payment #" },
              { key: "payment_date", label: "Date" },
              { key: "vendor_id", label: "Vendor", format: vendorName },
              { key: "bill_id", label: "Bill", format: (v) => billById.get(v)?.bill_number ?? "" },
              { key: "payment_method", label: "Method" },
              { key: "reference", label: "Reference" },
              { key: "amount", label: "Amount" },
            ],
          }
        : view === "aging"
          ? {
              name: "payables-aging",
              rows: agingRows,
              columns: [
                { key: "vendor", label: "Vendor" },
                { key: "current", label: "Current" },
                { key: "d30", label: "1-30 days" },
                { key: "d60", label: "31-60 days" },
                { key: "d90", label: "61-90 days" },
                { key: "d90p", label: "90+ days" },
                { key: "total", label: "Total" },
              ],
            }
          : {
              name: "bills",
              rows: billRows,
              columns: [
                { key: "bill_number", label: "Bill #" },
                { key: "vendor_bill_ref", label: "Vendor Invoice #" },
                { key: "bill_date", label: "Date" },
                { key: "due_date", label: "Due" },
                { key: "vendor_id", label: "Vendor", format: vendorName },
                { key: "classification", label: "Type", format: classLabel },
                { key: "contract_id", label: "For", format: purpose },
                { key: "payment_method", label: "Payment Method" },
                { key: "subtotal", label: "Subtotal" },
                { key: "vat_amount", label: "VAT" },
                { key: "total", label: "Total" },
                { key: "amount_paid", label: "Paid" },
                { key: "status", label: "Status", format: (_, r) => billDisplayStatus(r) },
              ],
            };

  const totals = lineTotals(doc.items);
  const contractOptions = doc.project_type && contracts ? contracts[doc.project_type] : [];
  const classBadge = (c: Classification) => (
    <Badge variant="outline" className={cn("font-medium", CLASSIFICATION_BADGE[c])}>
      {CLASSIFICATIONS.find((x) => x.value === c)?.short}
    </Badge>
  );
  const loading = billsLoading || ordersLoading;
  const emptyRow = (cols: number, text: string) => (
    <TableRow><TableCell colSpan={cols} className="text-center py-8 text-muted-foreground">{loading ? "Loading..." : text}</TableCell></TableRow>
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Purchase Management</h1>
          <p className="text-muted-foreground">Purchase orders, vendor bills and payments - every purchase tagged to a project, asset or opex.</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportMenu filename={exportConfig.name} rows={exportConfig.rows} columns={exportConfig.columns} sheetName="Purchases" />
          {can("purchase", "add") && (
            <>
              <Button variant="outline" onClick={() => openNewDoc("order")}><Plus className="h-4 w-4 mr-2" /> Purchase Order</Button>
              <Button onClick={() => openNewDoc("bill")}><Plus className="h-4 w-4 mr-2" /> Record Bill</Button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2">
        {VIEWS.map((v) => {
          const active = view === v.key;
          return (
            <button
              key={v.key}
              type="button"
              onClick={() => { setView(v.key); setPage(1); }}
              className={`text-left rounded-lg border p-3 transition hover:shadow-sm ${
                active ? "border-primary ring-2 ring-primary/30 bg-background" : "bg-background hover:border-primary/50"
              }`}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${v.dot}`} />
                <div className="text-[11px] font-medium text-muted-foreground truncate">{v.label}</div>
              </div>
              {v.key === "aging" ? (
                <>
                  <div className="mt-1.5 text-2xl font-bold leading-none">{agingRows.length}</div>
                  <div className="mt-1 text-[11px] text-muted-foreground">vendors owed</div>
                </>
              ) : (
                <>
                  <div className="mt-1.5 text-2xl font-bold leading-none">{cardStats[v.key].count}</div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    AED {cardStats[v.key].amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </div>
                </>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative w-full max-w-sm">
          <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search number, vendor, project…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <Select value={classFilter} onValueChange={(v) => { setClassFilter(v as any); setPage(1); }}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All purchase types</SelectItem>
            {CLASSIFICATIONS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card>
        {view === "orders" ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PO #</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>For</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-32 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orderRows.length === 0 ? emptyRow(7, "No purchase orders.") : paginate(orderRows, page).map((o) => {
                const open = o.status === "Issued" || o.status === "Draft";
                return (
                  <TableRow key={o.id}>
                    <TableCell className="font-mono text-xs">{o.po_number}</TableCell>
                    <TableCell>{o.order_date}</TableCell>
                    <TableCell>{vendorById.get(o.vendor_id)?.name ?? "—"}</TableCell>
                    <TableCell><div className="flex items-center gap-2">{classBadge(o.classification)}<span className="text-xs">{purposeLabel(o, contracts)}</span></div></TableCell>
                    <TableCell className="text-right">{aed(o.total)}</TableCell>
                    <TableCell><Badge variant="outline" className={PO_STATUS_BADGE[o.status]}>{o.status}</Badge></TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {open && can("purchase", "add") && (
                          <Button size="icon" variant="ghost" title="Convert to bill" onClick={() => openBillFromOrder(o)}><FileInput className="h-4 w-4" /></Button>
                        )}
                        {open && can("purchase", "edit") && (
                          <Button size="icon" variant="ghost" title="Edit" onClick={() => openEditOrder(o)}><Pencil className="h-4 w-4" /></Button>
                        )}
                        {open && can("purchase", "edit") && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="icon" variant="ghost" title="Cancel order"><Ban className="h-4 w-4 text-destructive" /></Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Cancel {o.po_number}?</AlertDialogTitle>
                                <AlertDialogDescription>The order stays on record as Cancelled and can no longer be billed.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Keep</AlertDialogCancel>
                                <AlertDialogAction onClick={() => cancelOrder(o)}>Cancel Order</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : view === "payments" ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Payment #</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Bill</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="w-16 text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {paymentRows.length === 0 ? emptyRow(8, "No payments made yet.") : paginate(paymentRows, page).map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs">{p.payment_number}</TableCell>
                  <TableCell>{p.payment_date}</TableCell>
                  <TableCell>{vendorById.get(p.vendor_id)?.name ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{billById.get(p.bill_id)?.bill_number ?? "—"}</TableCell>
                  <TableCell>
                    {p.payment_method}
                    {p.pemo_card_id && <span className="text-xs text-muted-foreground"> · {cardById.get(p.pemo_card_id) ?? "card"}</span>}
                    {p.is_auto && <span className="text-xs text-muted-foreground"> · with bill</span>}
                  </TableCell>
                  <TableCell>{p.reference ?? "—"}</TableCell>
                  <TableCell className="text-right">{aed(p.amount)}</TableCell>
                  <TableCell className="text-right">
                    {!p.is_auto && can("purchase", "delete") && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="icon" variant="ghost"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete {p.payment_number}?</AlertDialogTitle>
                            <AlertDialogDescription>The bill's balance goes back up by {aed(p.amount)}.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deletePayment(p.id)}>Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : view === "aging" ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vendor</TableHead>
                <TableHead className="text-right">Current</TableHead>
                <TableHead className="text-right">1-30 days</TableHead>
                <TableHead className="text-right">31-60 days</TableHead>
                <TableHead className="text-right">61-90 days</TableHead>
                <TableHead className="text-right">90+ days</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {agingRows.length === 0 ? emptyRow(7, "Nothing owed to vendors.") : (
                <>
                  {paginate(agingRows, page).map((r) => (
                    <TableRow key={r.vendor}>
                      <TableCell className="font-medium">{r.vendor}</TableCell>
                      <TableCell className="text-right">{aed(r.current)}</TableCell>
                      <TableCell className="text-right">{aed(r.d30)}</TableCell>
                      <TableCell className="text-right">{aed(r.d60)}</TableCell>
                      <TableCell className="text-right">{aed(r.d90)}</TableCell>
                      <TableCell className={cn("text-right", r.d90p > 0 && "text-destructive font-medium")}>{aed(r.d90p)}</TableCell>
                      <TableCell className="text-right font-semibold">{aed(r.total)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/40 font-semibold">
                    <TableCell>Total</TableCell>
                    {(["current", "d30", "d60", "d90", "d90p", "total"] as const).map((k) => (
                      <TableCell key={k} className="text-right">{aed(agingRows.reduce((s, r) => s + r[k], 0))}</TableCell>
                    ))}
                  </TableRow>
                </>
              )}
            </TableBody>
          </Table>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bill #</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>For</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead>Due</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {billRows.length === 0 ? emptyRow(10, "No bills here.") : paginate(billRows, page).map((b) => {
                const st = billDisplayStatus(b);
                const bal = billBalance(b);
                return (
                  <TableRow key={b.id} className={cn(b.status === "Void" && "opacity-60")}>
                    <TableCell>
                      <div className="font-mono text-xs">{b.bill_number}</div>
                      {b.vendor_bill_ref && <div className="text-xs text-muted-foreground">{b.vendor_bill_ref}</div>}
                    </TableCell>
                    <TableCell>{b.bill_date}</TableCell>
                    <TableCell>{vendorById.get(b.vendor_id)?.name ?? "—"}</TableCell>
                    <TableCell><div className="flex items-center gap-2">{classBadge(b.classification)}<span className="text-xs">{purposeLabel(b, contracts)}</span></div></TableCell>
                    <TableCell>
                      {b.payment_method}
                      {b.pemo_card_id && <div className="text-xs text-muted-foreground">{cardById.get(b.pemo_card_id) ?? ""}</div>}
                    </TableCell>
                    <TableCell>{b.payment_method === "Credit" ? b.due_date : "—"}</TableCell>
                    <TableCell className="text-right">{aed(b.total)}</TableCell>
                    <TableCell className="text-right">{aed(bal)}</TableCell>
                    <TableCell><Badge variant="outline" className={BILL_STATUS_BADGE[st]}>{st}</Badge></TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" title="View" onClick={() => openBill(b)}><Eye className="h-4 w-4" /></Button>
                        {bal > 0 && b.payment_method === "Credit" && can("purchase", "add") && (
                          <Button size="icon" variant="ghost" title="Record payment" onClick={() => openPay(b)}><Banknote className="h-4 w-4" /></Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
        <PaginationBar page={page} total={listLength} onPageChange={setPage} />
      </Card>

      {/* ---- Purchase order / bill form ---- */}
      <Dialog open={docOpen} onOpenChange={setDocOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {docKind === "order"
                ? docEditId ? "Edit Purchase Order" : "New Purchase Order"
                : docEditId ? "Edit Bill" : docFromPo ? `Bill for ${docFromPo.po_number}` : "Record Bill"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={saveDoc} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1 sm:col-span-1">
                <Label>Vendor *</Label>
                <Select value={doc.vendor_id} onValueChange={(v) => setDoc({ ...doc, vendor_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select a vendor..." /></SelectTrigger>
                  <SelectContent>
                    {vendors.filter((v) => v.is_active || v.id === doc.vendor_id).map((v) => (
                      <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {vendors.length === 0 && <p className="text-xs text-muted-foreground">Add vendors in Vendor Management first.</p>}
              </div>
              <div className="space-y-1">
                <Label>{docKind === "order" ? "Order Date *" : "Bill Date *"}</Label>
                <Input type="date" required value={doc.doc_date} onChange={(e) => setDoc({ ...doc, doc_date: e.target.value })} />
              </div>
              {docKind === "order" ? (
                <div className="space-y-1">
                  <Label>Expected Delivery</Label>
                  <Input type="date" value={doc.second_date} onChange={(e) => setDoc({ ...doc, second_date: e.target.value })} />
                </div>
              ) : (
                <div className="space-y-1">
                  <Label>Vendor Invoice #</Label>
                  <Input value={doc.vendor_bill_ref} onChange={(e) => setDoc({ ...doc, vendor_bill_ref: e.target.value })} />
                </div>
              )}
            </div>

            <div className="rounded-lg border p-3 space-y-3">
              <div className="text-sm font-medium">What is this purchase for? *</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {CLASSIFICATIONS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setDoc({ ...doc, classification: c.value })}
                    className={cn(
                      "rounded-md border px-3 py-2 text-left text-sm transition",
                      doc.classification === c.value ? "border-primary ring-2 ring-primary/30" : "hover:border-primary/50",
                    )}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              {doc.classification === "project" && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label>Project Type *</Label>
                    <Select value={doc.project_type} onValueChange={(v) => setDoc({ ...doc, project_type: v as "FM" | "AMC", contract_id: "" })}>
                      <SelectTrigger><SelectValue placeholder="FM or AMC" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="FM">FM</SelectItem>
                        <SelectItem value="AMC">AMC</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {doc.project_type && (
                    <div className="space-y-1 sm:col-span-2">
                      <Label>Project *</Label>
                      <Select value={doc.contract_id} onValueChange={(v) => setDoc({ ...doc, contract_id: v })}>
                        <SelectTrigger><SelectValue placeholder="Select a project..." /></SelectTrigger>
                        <SelectContent>
                          {contractOptions.map((c) => <SelectItem key={c.id} value={c.id}>{contractLabel(c)}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              )}
              {doc.classification === "capex" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Asset Name *</Label>
                    <Input placeholder="e.g. Toyota Hiace van, Bosch drill set" value={doc.asset_name} onChange={(e) => setDoc({ ...doc, asset_name: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Asset Category</Label>
                    <Select value={doc.asset_category} onValueChange={(v) => setDoc({ ...doc, asset_category: v })}>
                      <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>
                        {ASSET_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
              {doc.classification === "opex" && (
                <div className="space-y-1 sm:w-1/2">
                  <Label>Expense Category *</Label>
                  <Select value={doc.expense_category} onValueChange={(v) => setDoc({ ...doc, expense_category: v })}>
                    <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>
                      {EXPENSE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {docKind === "bill" && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label>Payment Method *</Label>
                  <Select
                    value={doc.payment_method}
                    disabled={lockedMethod}
                    onValueChange={(v) => setDoc({ ...doc, payment_method: v as BillPaymentMethod })}
                  >
                    <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>
                      {BILL_PAYMENT_METHODS.map((m) => (
                        <SelectItem key={m} value={m}>{m === "Credit" ? "Credit (pay later)" : m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {lockedMethod && <p className="text-xs text-muted-foreground">Fixed once recorded - void and re-record to change.</p>}
                </div>
                {doc.payment_method === "PEMO" && (
                  <div className="space-y-1">
                    <Label>PEMO Card *</Label>
                    <Select value={doc.pemo_card_id} onValueChange={(v) => setDoc({ ...doc, pemo_card_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Select a card..." /></SelectTrigger>
                      <SelectContent>
                        {pemoCards.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {doc.payment_method === "Credit" && (
                  <div className="space-y-1">
                    <Label>Due Date</Label>
                    <Input type="date" value={doc.second_date} onChange={(e) => setDoc({ ...doc, second_date: e.target.value })} />
                    <p className="text-xs text-muted-foreground">
                      Blank = bill date + Net {vendorById.get(doc.vendor_id)?.payment_terms_days ?? 30}
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              <div className="text-sm font-medium">Items</div>
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Description</TableHead>
                      <TableHead className="w-24">Qty</TableHead>
                      <TableHead className="w-32">Rate (AED)</TableHead>
                      <TableHead className="w-24">VAT %</TableHead>
                      <TableHead className="w-32 text-right">Amount</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {doc.items.map((it, i) => (
                      <TableRow key={i}>
                        <TableCell><Input value={it.description} placeholder="Item or service" onChange={(e) => setItem(i, { description: e.target.value })} /></TableCell>
                        <TableCell><Input type="number" min="0" step="any" value={it.quantity} onChange={(e) => setItem(i, { quantity: Number(e.target.value) })} /></TableCell>
                        <TableCell><Input type="number" min="0" step="0.01" value={it.unit_price} onChange={(e) => setItem(i, { unit_price: Number(e.target.value) })} /></TableCell>
                        <TableCell><Input type="number" min="0" step="0.01" value={it.vat_rate} onChange={(e) => setItem(i, { vat_rate: Number(e.target.value) })} /></TableCell>
                        <TableCell className="text-right">{aed(Number(it.quantity || 0) * Number(it.unit_price || 0))}</TableCell>
                        <TableCell>
                          {doc.items.length > 1 && (
                            <Button type="button" size="icon" variant="ghost" onClick={() => setDoc({ ...doc, items: doc.items.filter((_, idx) => idx !== i) })}>
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex items-start justify-between gap-4">
                <Button type="button" size="sm" variant="outline" onClick={() => setDoc({ ...doc, items: [...doc.items, blankItem()] })}>
                  <Plus className="h-4 w-4 mr-1" /> Add line
                </Button>
                <div className="text-sm space-y-0.5 text-right min-w-48">
                  <div className="flex justify-between gap-6"><span className="text-muted-foreground">Subtotal</span><span>{aed(totals.subtotal)}</span></div>
                  <div className="flex justify-between gap-6"><span className="text-muted-foreground">VAT</span><span>{aed(totals.vat)}</span></div>
                  <div className="flex justify-between gap-6 font-semibold"><span>Total</span><span>{aed(totals.total)}</span></div>
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <Label>Notes</Label>
              <Textarea rows={2} value={doc.notes} onChange={(e) => setDoc({ ...doc, notes: e.target.value })} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDocOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{docKind === "order" ? "Save Order" : "Save Bill"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ---- Bill detail ---- */}
      <Dialog open={!!viewBill} onOpenChange={(o) => !o && setViewBill(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          {viewBill && (() => {
            const st = billDisplayStatus(viewBill);
            const bal = billBalance(viewBill);
            const billPayments = payments.filter((p) => p.bill_id === viewBill.id);
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    {viewBill.bill_number}
                    <Badge variant="outline" className={BILL_STATUS_BADGE[st]}>{st}</Badge>
                  </DialogTitle>
                </DialogHeader>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
                  <div><span className="text-muted-foreground">Vendor:</span> {vendorById.get(viewBill.vendor_id)?.name ?? "—"}</div>
                  <div><span className="text-muted-foreground">Vendor invoice #:</span> {viewBill.vendor_bill_ref ?? "—"}</div>
                  <div><span className="text-muted-foreground">Bill date:</span> {viewBill.bill_date}</div>
                  <div><span className="text-muted-foreground">Due date:</span> {viewBill.due_date}</div>
                  <div className="flex items-center gap-2"><span className="text-muted-foreground">For:</span> {classBadge(viewBill.classification)} {purposeLabel(viewBill, contracts)}</div>
                  <div>
                    <span className="text-muted-foreground">Payment:</span> {viewBill.payment_method}
                    {viewBill.pemo_card_id && ` · ${cardById.get(viewBill.pemo_card_id) ?? ""}`}
                  </div>
                  {viewBill.purchase_order_id && (
                    <div><span className="text-muted-foreground">From PO:</span> {orders.find((o) => o.id === viewBill.purchase_order_id)?.po_number ?? "—"}</div>
                  )}
                  {viewBill.notes && <div className="sm:col-span-2 whitespace-pre-wrap"><span className="text-muted-foreground">Notes:</span> {viewBill.notes}</div>}
                </div>
                <div className="rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Rate</TableHead>
                        <TableHead className="text-right">VAT %</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {viewBillItems.map((it, i) => (
                        <TableRow key={it.id ?? i}>
                          <TableCell>{it.description}</TableCell>
                          <TableCell className="text-right">{it.quantity}</TableCell>
                          <TableCell className="text-right">{aed(it.unit_price)}</TableCell>
                          <TableCell className="text-right">{it.vat_rate}</TableCell>
                          <TableCell className="text-right">{aed(it.quantity * it.unit_price)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="text-sm space-y-0.5 ml-auto w-64">
                  <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{aed(viewBill.subtotal)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">VAT</span><span>{aed(viewBill.vat_amount)}</span></div>
                  <div className="flex justify-between font-semibold"><span>Total</span><span>{aed(viewBill.total)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Paid</span><span>{aed(viewBill.amount_paid)}</span></div>
                  <div className="flex justify-between font-semibold"><span>Balance due</span><span>{aed(bal)}</span></div>
                </div>
                {billPayments.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-sm mb-2">Payments</h3>
                    <div className="space-y-1 text-sm">
                      {billPayments.map((p) => (
                        <div key={p.id} className="flex justify-between rounded border px-3 py-1.5">
                          <span>{p.payment_number} · {p.payment_date} · {p.payment_method}{p.reference ? ` · ${p.reference}` : ""}</span>
                          <span>{aed(p.amount)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {viewBill.status !== "Void" && (
                  <DialogFooter className="gap-2">
                    {can("purchase", "delete") && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" className="text-destructive"><Ban className="h-4 w-4 mr-2" /> Void</Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Void {viewBill.bill_number}?</AlertDialogTitle>
                            <AlertDialogDescription>
                              The bill stays on record as Void and its Ledger (and PEMO) entry is removed. Bills with recorded payments need those payments deleted first.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => voidBill(viewBill)}>Void Bill</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                    {can("purchase", "edit") && (
                      <Button variant="outline" onClick={() => openEditBill(viewBill)}><Pencil className="h-4 w-4 mr-2" /> Edit</Button>
                    )}
                    {bal > 0 && viewBill.payment_method === "Credit" && can("purchase", "add") && (
                      <Button onClick={() => openPay(viewBill)}><Banknote className="h-4 w-4 mr-2" /> Record Payment</Button>
                    )}
                  </DialogFooter>
                )}
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ---- Record payment ---- */}
      <Dialog open={!!pay} onOpenChange={(o) => !o && setPay(null)}>
        <DialogContent className="max-w-md">
          {pay?.bill && (
            <>
              <DialogHeader>
                <DialogTitle>Pay {pay.bill.bill_number}</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                {vendorById.get(pay.bill.vendor_id)?.name} · balance due {aed(billBalance(pay.bill))}
              </p>
              <form onSubmit={savePayment} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Amount *</Label>
                    <Input type="number" min="0.01" step="0.01" required value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Date *</Label>
                    <Input type="date" required value={pay.payment_date} onChange={(e) => setPay({ ...pay, payment_date: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Payment Method *</Label>
                  <Select value={pay.payment_method} onValueChange={(v) => setPay({ ...pay, payment_method: v as PaymentMethod })}>
                    <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {pay.payment_method === "PEMO" && (
                  <div className="space-y-1">
                    <Label>PEMO Card *</Label>
                    <Select value={pay.pemo_card_id} onValueChange={(v) => setPay({ ...pay, pemo_card_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Select a card..." /></SelectTrigger>
                      <SelectContent>
                        {pemoCards.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-1">
                  <Label>Reference</Label>
                  <Input placeholder="Transfer ref / cheque no." value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Notes</Label>
                  <Textarea rows={2} value={pay.notes} onChange={(e) => setPay({ ...pay, notes: e.target.value })} />
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setPay(null)}>Cancel</Button>
                  <Button type="submit" disabled={saving}>Record Payment</Button>
                </DialogFooter>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
