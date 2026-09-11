import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
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
import { PaginationBar, PAGE_SIZE, paginate } from "@/components/pagination-bar";
import { ExportMenu } from "@/components/export-menu";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/accounts")({
  component: LedgerPage,
});

type ProjectType = "FM" | "AMC";

type ContractOption = {
  id: string;
  title: string | null;
  contract_no: string | null;
  customer_name: string | null;
};

type LedgerForm = {
  transaction_date: string;
  description: string;
  amount: string;
  project_type: ProjectType | "none";
  contract_id: string;
};

const emptyForm: LedgerForm = {
  transaction_date: "",
  description: "",
  amount: "",
  project_type: "none",
  contract_id: "",
};

function projectBadgeClasses(type: ProjectType): string {
  return type === "FM"
    ? "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/40 dark:text-blue-200"
    : "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/40 dark:text-purple-200";
}

function contractLabel(c: ContractOption): string {
  return (c.contract_no ? `${c.contract_no} - ` : "") + (c.customer_name ?? c.title ?? "Untitled");
}

function LedgerPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<LedgerForm>(emptyForm);
  const [activeType, setActiveType] = useState<"Income" | "Expense">("Expense");
  const [page, setPage] = useState(1);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["accounts_transactions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounts_transactions")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: fmContracts = [] } = useQuery({
    queryKey: ["ledger-fm-contracts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("fm_contracts").select("id, title, contract_no, customer_name");
      if (error) throw error;
      return (data ?? []) as ContractOption[];
    },
  });

  const { data: amcContracts = [] } = useQuery({
    queryKey: ["ledger-amc-contracts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("contracts").select("id, title, contract_no, customer_name");
      if (error) throw error;
      return (data ?? []) as ContractOption[];
    },
  });

  const contractsById = useMemo(() => {
    const map = new Map<string, ContractOption>();
    for (const c of fmContracts) map.set(c.id, c);
    for (const c of amcContracts) map.set(c.id, c);
    return map;
  }, [fmContracts, amcContracts]);

  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
  const pageRows = paginate(rows as any[], page);

  function openNew(type: "Income" | "Expense") {
    setEditing(null);
    setActiveType(type);
    setForm(emptyForm);
    setOpen(true);
  }

  function openEdit(row: any) {
    setEditing(row);
    setActiveType(row.type === "Income" ? "Income" : "Expense");
    setForm({
      transaction_date: row.transaction_date ?? "",
      description: row.description ?? "",
      amount: row.amount != null ? String(row.amount) : "",
      project_type: (row.project_type as ProjectType) ?? "none",
      contract_id: row.contract_id ?? "",
    });
    setOpen(true);
  }

  function setProjectType(v: string) {
    setForm((f) => ({ ...f, project_type: v as ProjectType | "none", contract_id: "" }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const payload: any = {
      transaction_date: form.transaction_date || null,
      description: form.description || null,
      amount: form.amount === "" ? null : Number(form.amount),
      project_type: form.project_type === "none" ? null : form.project_type,
      contract_id: form.project_type === "none" ? null : form.contract_id || null,
    };
    // Type/currency are only set on create - editing an existing entry never changes what
    // button originally created it or its currency, both of which are fixed at creation time.
    if (!editing) {
      payload.type = activeType;
      payload.currency = "AED";
    }
    try {
      if (editing) {
        const { error } = await supabase.from("accounts_transactions").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Updated");
      } else {
        const { error } = await supabase.from("accounts_transactions").insert(payload);
        if (error) throw error;
        toast.success("Created");
      }
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["accounts_transactions"] });
    } catch (err: any) {
      toast.error(err.message ?? "Save failed");
    }
  }

  async function remove(id: string) {
    const { error } = await supabase.from("accounts_transactions").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Deleted");
    qc.invalidateQueries({ queryKey: ["accounts_transactions"] });
  }

  const projectOptions: ContractOption[] =
    form.project_type === "FM" ? fmContracts : form.project_type === "AMC" ? amcContracts : [];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Accounts</h1>
          <p className="text-muted-foreground">Track income and expenses.</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportMenu
            filename="accounts"
            rows={rows as any[]}
            columns={[
              { key: "transaction_date", label: "Date" },
              { key: "type", label: "Type" },
              { key: "description", label: "Description" },
              { key: "amount", label: "Amount" },
              { key: "currency", label: "Currency" },
              { key: "project_type", label: "Project Type" },
            ]}
            sheetName="Accounts"
          />
          <Button onClick={() => openNew("Expense")}><Plus className="h-4 w-4 mr-2" /> Add Expense</Button>
          <Button onClick={() => openNew("Income")}><Plus className="h-4 w-4 mr-2" /> Add Invoice</Button>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit Transaction" : activeType === "Income" ? "New Invoice" : "New Expense"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={save} className="space-y-3">
            <div className="space-y-1">
              <Label>Date *</Label>
              <Input
                type="date"
                required
                value={form.transaction_date}
                onChange={(e) => setForm({ ...form, transaction_date: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Project Type</Label>
              <Select value={form.project_type} onValueChange={setProjectType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="FM">FM</SelectItem>
                  <SelectItem value="AMC">AMC</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.project_type !== "none" && (
              <div className="space-y-1">
                <Label>Project</Label>
                <Select value={form.contract_id} onValueChange={(v) => setForm({ ...form, contract_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select a project..." /></SelectTrigger>
                  <SelectContent>
                    {projectOptions.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{contractLabel(c)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1">
              <Label>Description</Label>
              <Textarea
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Amount</Label>
              <Input
                type="number"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit">{editing ? "Update" : "Create"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Project</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
            ) : pageRows.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No records yet.</TableCell></TableRow>
            ) : pageRows.map((r: any) => {
              const contract = r.contract_id ? contractsById.get(r.contract_id) : null;
              return (
                <TableRow key={r.id}>
                  <TableCell>{r.transaction_date ?? "—"}</TableCell>
                  <TableCell>{r.type ?? "—"}</TableCell>
                  <TableCell>
                    {r.project_type && contract ? (
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={cn("font-medium", projectBadgeClasses(r.project_type))}>
                          {r.project_type}
                        </Badge>
                        <span>{contractLabel(contract)}</span>
                      </div>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>{r.description ?? "—"}</TableCell>
                  <TableCell>{r.amount != null ? `AED ${Number(r.amount).toLocaleString()}` : "—"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="icon" variant="ghost"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete this record?</AlertDialogTitle>
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
              );
            })}
          </TableBody>
        </Table>
        <PaginationBar page={page} total={total} onPageChange={setPage} />
      </Card>
    </div>
  );
}
