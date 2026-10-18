import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Eye, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PaginationBar, paginate } from "@/components/pagination-bar";
import { ExportMenu } from "@/components/export-menu";
import { usePermissions } from "@/hooks/use-permissions";
import { cn } from "@/lib/utils";
import {
  aed, billBalance, billDisplayStatus, BILL_STATUS_BADGE, CLASSIFICATION_BADGE, CLASSIFICATIONS,
  db, errorMessage, purposeLabel, useBills, useContractOptions, useVendorPayments, useVendors,
  type Vendor,
} from "@/lib/purchase";

export const Route = createFileRoute("/_authenticated/vendors")({
  component: VendorsPage,
});

type VendorForm = {
  name: string;
  company_name: string;
  contact_person: string;
  email: string;
  phone: string;
  trn: string;
  address: string;
  payment_terms_days: string;
  bank_name: string;
  bank_account_name: string;
  bank_iban: string;
  opening_balance: string;
  notes: string;
  is_active: boolean;
};

const emptyForm: VendorForm = {
  name: "",
  company_name: "",
  contact_person: "",
  email: "",
  phone: "",
  trn: "",
  address: "",
  payment_terms_days: "30",
  bank_name: "",
  bank_account_name: "",
  bank_iban: "",
  opening_balance: "0",
  notes: "",
  is_active: true,
};

function VendorsPage() {
  const qc = useQueryClient();
  const { can } = usePermissions();
  const { data: vendors = [], isLoading } = useVendors();
  const { data: bills = [] } = useBills();
  const { data: payments = [] } = useVendorPayments();
  const { data: contracts } = useContractOptions();

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Vendor | null>(null);
  const [form, setForm] = useState<VendorForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [viewing, setViewing] = useState<Vendor | null>(null);

  // Payables per vendor: opening balance + live bills - payments on those bills.
  const payablesByVendor = useMemo(() => {
    const m = new Map<string, { billed: number; paid: number; balance: number; overdue: number }>();
    for (const v of vendors) m.set(v.id, { billed: 0, paid: 0, balance: Number(v.opening_balance) || 0, overdue: 0 });
    for (const b of bills) {
      if (b.status === "Void") continue;
      const e = m.get(b.vendor_id);
      if (!e) continue;
      e.billed += Number(b.total);
      e.paid += Number(b.amount_paid);
      e.balance += billBalance(b);
      if (billDisplayStatus(b) === "Overdue") e.overdue += billBalance(b);
    }
    return m;
  }, [vendors, bills]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return vendors;
    return vendors.filter((v) =>
      [v.vendor_code, v.name, v.company_name, v.contact_person, v.email, v.phone, v.trn]
        .some((x) => (x ?? "").toLowerCase().includes(q)),
    );
  }, [vendors, search]);

  const pageRows = paginate(filtered, page);
  const totals = useMemo(() => {
    let payable = 0;
    let overdue = 0;
    for (const e of payablesByVendor.values()) {
      payable += e.balance;
      overdue += e.overdue;
    }
    return { active: vendors.filter((v) => v.is_active).length, payable, overdue };
  }, [vendors, payablesByVendor]);

  function openNew() {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  }

  function openEdit(v: Vendor) {
    setEditing(v);
    setForm({
      name: v.name,
      company_name: v.company_name ?? "",
      contact_person: v.contact_person ?? "",
      email: v.email ?? "",
      phone: v.phone ?? "",
      trn: v.trn ?? "",
      address: v.address ?? "",
      payment_terms_days: String(v.payment_terms_days ?? 30),
      bank_name: v.bank_name ?? "",
      bank_account_name: v.bank_account_name ?? "",
      bank_iban: v.bank_iban ?? "",
      opening_balance: String(v.opening_balance ?? 0),
      notes: v.notes ?? "",
      is_active: v.is_active,
    });
    setOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Vendor name is required");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        const { error } = await db
          .from("vendors")
          .update({
            name: form.name.trim(),
            company_name: form.company_name.trim() || null,
            contact_person: form.contact_person.trim() || null,
            email: form.email.trim() || null,
            phone: form.phone.trim() || null,
            trn: form.trn.trim() || null,
            address: form.address.trim() || null,
            payment_terms_days: Number(form.payment_terms_days) || 0,
            bank_name: form.bank_name.trim() || null,
            bank_account_name: form.bank_account_name.trim() || null,
            bank_iban: form.bank_iban.trim() || null,
            opening_balance: Number(form.opening_balance) || 0,
            notes: form.notes.trim() || null,
            is_active: form.is_active,
          })
          .eq("id", editing.id);
        if (error) throw error;
        toast.success("Vendor updated");
      } else {
        const { data, error } = await db.rpc("create_vendor", {
          p_name: form.name,
          p_company_name: form.company_name,
          p_contact_person: form.contact_person,
          p_email: form.email,
          p_phone: form.phone,
          p_trn: form.trn,
          p_address: form.address,
          p_payment_terms_days: Number(form.payment_terms_days) || 0,
          p_bank_name: form.bank_name,
          p_bank_account_name: form.bank_account_name,
          p_bank_iban: form.bank_iban,
          p_opening_balance: Number(form.opening_balance) || 0,
          p_notes: form.notes,
        });
        if (error) throw error;
        toast.success(`Vendor ${data?.vendor_code ?? ""} created`);
      }
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["vendors"] });
    } catch (err) {
      const msg = errorMessage(err);
      toast.error(msg.includes("vendors_name_unique") ? "A vendor with this name already exists" : msg);
    } finally {
      setSaving(false);
    }
  }

  async function remove(v: Vendor) {
    const { error } = await db.from("vendors").delete().eq("id", v.id);
    if (error) {
      toast.error(
        error.code === "23503"
          ? "This vendor has purchase orders or bills. Mark it inactive instead."
          : error.message,
      );
      return;
    }
    toast.success("Vendor deleted");
    qc.invalidateQueries({ queryKey: ["vendors"] });
  }

  const exportRows = filtered.map((v) => {
    const p = payablesByVendor.get(v.id);
    return { ...v, payable: p?.balance ?? 0, overdue: p?.overdue ?? 0 };
  });

  const viewBills = viewing ? bills.filter((b) => b.vendor_id === viewing.id) : [];
  const viewPayments = viewing ? payments.filter((p) => p.vendor_id === viewing.id) : [];
  const viewSummary = viewing ? payablesByVendor.get(viewing.id) : undefined;
  const billNo = new Map(bills.map((b) => [b.id, b.bill_number]));

  const field = (key: keyof VendorForm, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input
        value={form[key] as string}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        {...props}
      />
    </div>
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Vendor Management</h1>
          <p className="text-muted-foreground">Suppliers and subcontractors, their terms and what you owe them.</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportMenu
            filename="vendors"
            rows={exportRows}
            columns={[
              { key: "vendor_code", label: "Code" },
              { key: "name", label: "Name" },
              { key: "company_name", label: "Company" },
              { key: "contact_person", label: "Contact Person" },
              { key: "email", label: "Email" },
              { key: "phone", label: "Phone" },
              { key: "trn", label: "TRN" },
              { key: "payment_terms_days", label: "Payment Terms (days)" },
              { key: "bank_name", label: "Bank" },
              { key: "bank_iban", label: "IBAN" },
              { key: "payable", label: "Payable (AED)" },
              { key: "overdue", label: "Overdue (AED)" },
              { key: "is_active", label: "Active", format: (v) => (v ? "Yes" : "No") },
            ]}
            sheetName="Vendors"
          />
          {can("purchase", "add") && (
            <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" /> New Vendor</Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div className="rounded-lg border bg-background p-3">
          <div className="text-[11px] font-medium text-muted-foreground">Active vendors</div>
          <div className="mt-1.5 text-2xl font-bold leading-none">{totals.active}</div>
        </div>
        <div className="rounded-lg border bg-background p-3">
          <div className="text-[11px] font-medium text-muted-foreground">Total payables</div>
          <div className="mt-1.5 text-2xl font-bold leading-none">{aed(totals.payable)}</div>
        </div>
        <div className="rounded-lg border bg-background p-3">
          <div className="text-[11px] font-medium text-muted-foreground">Overdue</div>
          <div className={cn("mt-1.5 text-2xl font-bold leading-none", totals.overdue > 0 && "text-destructive")}>
            {aed(totals.overdue)}
          </div>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder="Search name, code, TRN, phone…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>TRN</TableHead>
              <TableHead>Terms</TableHead>
              <TableHead className="text-right">Payable</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-32 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
            ) : pageRows.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No vendors yet.</TableCell></TableRow>
            ) : pageRows.map((v) => {
              const p = payablesByVendor.get(v.id);
              return (
                <TableRow key={v.id}>
                  <TableCell className="font-mono text-xs">{v.vendor_code}</TableCell>
                  <TableCell>
                    <div className="font-medium">{v.name}</div>
                    {v.company_name && <div className="text-xs text-muted-foreground">{v.company_name}</div>}
                  </TableCell>
                  <TableCell>
                    <div>{v.contact_person ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{[v.phone, v.email].filter(Boolean).join(" · ")}</div>
                  </TableCell>
                  <TableCell>{v.trn ?? "—"}</TableCell>
                  <TableCell>{v.payment_terms_days === 0 ? "Due on receipt" : `Net ${v.payment_terms_days}`}</TableCell>
                  <TableCell className="text-right">
                    <div>{aed(p?.balance)}</div>
                    {(p?.overdue ?? 0) > 0 && <div className="text-xs text-destructive">{aed(p?.overdue)} overdue</div>}
                  </TableCell>
                  <TableCell>
                    <Badge variant={v.is_active ? "secondary" : "outline"}>{v.is_active ? "Active" : "Inactive"}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" onClick={() => setViewing(v)}><Eye className="h-4 w-4" /></Button>
                      {can("purchase", "edit") && (
                        <Button size="icon" variant="ghost" onClick={() => openEdit(v)}><Pencil className="h-4 w-4" /></Button>
                      )}
                      {can("purchase", "delete") && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="icon" variant="ghost"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete {v.name}?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Vendors with purchase orders or bills cannot be deleted - mark them inactive instead.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => remove(v)}>Delete</AlertDialogAction>
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
        <PaginationBar page={page} total={filtered.length} onPageChange={setPage} />
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${editing.vendor_code}` : "New Vendor"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {field("name", "Vendor Name *", { required: true })}
              {field("company_name", "Legal / Company Name")}
              {field("contact_person", "Contact Person")}
              {field("phone", "Phone")}
              {field("email", "Email", { type: "email" })}
              {field("trn", "TRN (VAT No.)")}
            </div>
            <div className="space-y-1">
              <Label>Address</Label>
              <Textarea rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {field("payment_terms_days", "Payment Terms (days)", { type: "number", min: 0 })}
              {field("opening_balance", "Opening Balance Owed (AED)", { type: "number", step: "0.01" })}
            </div>
            <div className="text-sm font-medium pt-1">Bank Details</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {field("bank_name", "Bank")}
              {field("bank_account_name", "Account Name")}
              {field("bank_iban", "IBAN")}
            </div>
            <div className="space-y-1">
              <Label>Notes</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            {editing && (
              <div className="flex items-center gap-2">
                <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
                <Label>Active</Label>
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{editing ? "Update" : "Create"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          {viewing && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {viewing.name} <span className="font-mono text-sm text-muted-foreground">{viewing.vendor_code}</span>
                </DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  ["Opening balance", aed(viewing.opening_balance)],
                  ["Billed", aed(viewSummary?.billed)],
                  ["Paid", aed(viewSummary?.paid)],
                  ["Balance owed", aed(viewSummary?.balance)],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border p-3">
                    <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
                    <div className="mt-1 text-lg font-bold">{value}</div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
                <div><span className="text-muted-foreground">Contact:</span> {viewing.contact_person ?? "—"}</div>
                <div><span className="text-muted-foreground">Phone:</span> {viewing.phone ?? "—"}</div>
                <div><span className="text-muted-foreground">Email:</span> {viewing.email ?? "—"}</div>
                <div><span className="text-muted-foreground">TRN:</span> {viewing.trn ?? "—"}</div>
                <div><span className="text-muted-foreground">Terms:</span> Net {viewing.payment_terms_days}</div>
                <div><span className="text-muted-foreground">Bank:</span> {[viewing.bank_name, viewing.bank_iban].filter(Boolean).join(" · ") || "—"}</div>
                {viewing.address && <div className="sm:col-span-2"><span className="text-muted-foreground">Address:</span> {viewing.address}</div>}
              </div>

              <div>
                <h3 className="font-semibold text-sm mb-2">Bills ({viewBills.length})</h3>
                <div className="rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Bill #</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>For</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {viewBills.length === 0 ? (
                        <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">No bills.</TableCell></TableRow>
                      ) : viewBills.map((b) => {
                        const st = billDisplayStatus(b);
                        return (
                          <TableRow key={b.id}>
                            <TableCell className="font-mono text-xs">{b.bill_number}</TableCell>
                            <TableCell>{b.bill_date}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={cn("mr-1", CLASSIFICATION_BADGE[b.classification])}>
                                {CLASSIFICATIONS.find((c) => c.value === b.classification)?.short}
                              </Badge>
                              <span className="text-xs">{purposeLabel(b, contracts)}</span>
                            </TableCell>
                            <TableCell>{b.payment_method}</TableCell>
                            <TableCell className="text-right">{aed(b.total)}</TableCell>
                            <TableCell className="text-right">{aed(billBalance(b))}</TableCell>
                            <TableCell><Badge variant="outline" className={BILL_STATUS_BADGE[st]}>{st}</Badge></TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-sm mb-2">Payments Made ({viewPayments.length})</h3>
                <div className="rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Payment #</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Bill</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead>Reference</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {viewPayments.length === 0 ? (
                        <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">No payments.</TableCell></TableRow>
                      ) : viewPayments.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="font-mono text-xs">{p.payment_number}</TableCell>
                          <TableCell>{p.payment_date}</TableCell>
                          <TableCell className="font-mono text-xs">{billNo.get(p.bill_id) ?? "—"}</TableCell>
                          <TableCell>{p.payment_method}</TableCell>
                          <TableCell>{p.reference ?? "—"}</TableCell>
                          <TableCell className="text-right">{aed(p.amount)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
