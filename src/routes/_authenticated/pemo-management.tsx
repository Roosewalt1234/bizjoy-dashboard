import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Settings, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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

export const Route = createFileRoute("/_authenticated/pemo-management")({
  component: PemoManagementPage,
});

type EmployeeOption = { id: string; full_name: string | null; first_name: string | null; last_name: string | null };

type PemoCard = {
  id: string;
  label: string;
  employee_id: string | null;
  active: boolean;
};

type PemoDeposit = {
  id: string;
  deposited_on: string;
  amount: number;
  note: string | null;
};

type PemoTransaction = {
  id: string;
  occurred_on: string;
  amount: number;
  description: string | null;
  category: string | null;
  card_id: string | null;
  source: "manual" | "ledger" | "openclaw";
  invoice_ref: string | null;
};

type StatementRow = {
  id: string;
  kind: "deposit" | "transaction";
  date: string;
  description: string;
  cardLabel: string | null;
  credit: number;
  debit: number;
  invoiceRef: string | null;
  balance: number;
  raw: PemoDeposit | PemoTransaction;
};

function employeeName(e: EmployeeOption | undefined | null): string {
  if (!e) return "Unassigned";
  return e.full_name ?? ([e.first_name, e.last_name].filter(Boolean).join(" ") || "Unassigned");
}

function fmtAED(n: number) {
  return new Intl.NumberFormat("en-AE", { style: "currency", currency: "AED", maximumFractionDigits: 0 }).format(n);
}

function PemoManagementPage() {
  const qc = useQueryClient();

  const { data: employees = [] } = useQuery({
    queryKey: ["pemo-employees"],
    queryFn: async () => {
      const { data, error } = await supabase.from("employees").select("id, full_name, first_name, last_name").order("first_name");
      if (error) throw error;
      return (data ?? []) as EmployeeOption[];
    },
  });

  const { data: cards = [] } = useQuery({
    queryKey: ["pemo_cards"],
    queryFn: async () => {
      const { data, error } = await supabase.from("pemo_cards").select("*").order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PemoCard[];
    },
  });

  const { data: deposits = [] } = useQuery({
    queryKey: ["pemo_deposits"],
    queryFn: async () => {
      const { data, error } = await supabase.from("pemo_deposits").select("*").order("deposited_on", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PemoDeposit[];
    },
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ["pemo_transactions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("pemo_transactions").select("*").order("occurred_on", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PemoTransaction[];
    },
  });

  const employeesById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const cardsById = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);

  const totalDeposited = useMemo(() => deposits.reduce((sum, d) => sum + Number(d.amount), 0), [deposits]);
  const totalSpent = useMemo(() => transactions.reduce((sum, t) => sum + Number(t.amount), 0), [transactions]);
  const balance = totalDeposited - totalSpent;

  const statementRows = useMemo<StatementRow[]>(() => {
    const depositRows: StatementRow[] = deposits.map((d) => ({
      id: `deposit-${d.id}`,
      kind: "deposit",
      date: d.deposited_on,
      description: d.note ?? "Deposit",
      cardLabel: null,
      credit: Number(d.amount),
      debit: 0,
      invoiceRef: null,
      balance: 0,
      raw: d,
    }));
    const txRows: StatementRow[] = transactions.map((t) => ({
      id: `tx-${t.id}`,
      kind: "transaction",
      date: t.occurred_on,
      description: t.description ?? "-",
      cardLabel: t.card_id ? cardsById.get(t.card_id)?.label ?? null : null,
      credit: 0,
      debit: Number(t.amount),
      invoiceRef: t.invoice_ref,
      balance: 0,
      raw: t,
    }));
    const merged = [...depositRows, ...txRows].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    let running = 0;
    for (const row of merged) {
      running += row.credit - row.debit;
      row.balance = running;
    }
    return merged.reverse();
  }, [deposits, transactions, cardsById]);

  const [cardFilter, setCardFilter] = useState("all");
  const filteredStatementRows = useMemo(
    () =>
      cardFilter === "all"
        ? statementRows
        : statementRows.filter((r) => r.kind === "transaction" && (r.raw as PemoTransaction).card_id === cardFilter),
    [statementRows, cardFilter],
  );

  const [cardsManagerOpen, setCardsManagerOpen] = useState(false);

  const [cardOpen, setCardOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<PemoCard | null>(null);
  const [cardForm, setCardForm] = useState({ label: "", employee_id: "", active: true });

  function openNewCard() {
    setEditingCard(null);
    setCardForm({ label: "", employee_id: "", active: true });
    setCardOpen(true);
  }
  function openEditCard(c: PemoCard) {
    setEditingCard(c);
    setCardForm({ label: c.label, employee_id: c.employee_id ?? "", active: c.active });
    setCardOpen(true);
  }
  async function saveCard(e: React.FormEvent) {
    e.preventDefault();
    const payload = { label: cardForm.label, employee_id: cardForm.employee_id || null, active: cardForm.active };
    try {
      if (editingCard) {
        const { error } = await supabase.from("pemo_cards").update(payload).eq("id", editingCard.id);
        if (error) throw error;
        toast.success("Card updated");
      } else {
        const { error } = await supabase.from("pemo_cards").insert(payload);
        if (error) throw error;
        toast.success("Card added");
      }
      setCardOpen(false);
      qc.invalidateQueries({ queryKey: ["pemo_cards"] });
    } catch (err: any) {
      toast.error(err.message ?? "Save failed");
    }
  }
  async function removeCard(id: string) {
    const { error } = await supabase.from("pemo_cards").delete().eq("id", id);
    if (error) {
      if (error.code === "23503") {
        toast.error("Cannot delete a card with transaction history - mark it Inactive instead.");
      } else {
        toast.error(error.message);
      }
      return;
    }
    toast.success("Deleted");
    qc.invalidateQueries({ queryKey: ["pemo_cards"] });
  }

  const [depositOpen, setDepositOpen] = useState(false);
  const [editingDeposit, setEditingDeposit] = useState<PemoDeposit | null>(null);
  const [depositForm, setDepositForm] = useState({ deposited_on: "", amount: "", note: "" });

  function openNewDeposit() {
    setEditingDeposit(null);
    setDepositForm({ deposited_on: "", amount: "", note: "" });
    setDepositOpen(true);
  }
  function openEditDeposit(d: PemoDeposit) {
    setEditingDeposit(d);
    setDepositForm({ deposited_on: d.deposited_on, amount: String(d.amount), note: d.note ?? "" });
    setDepositOpen(true);
  }
  async function saveDeposit(e: React.FormEvent) {
    e.preventDefault();
    const payload: any = {
      deposited_on: depositForm.deposited_on || null,
      amount: depositForm.amount === "" ? null : Number(depositForm.amount),
      note: depositForm.note || null,
    };
    try {
      if (editingDeposit) {
        const { error } = await supabase.from("pemo_deposits").update(payload).eq("id", editingDeposit.id);
        if (error) throw error;
        toast.success("Deposit updated");
      } else {
        const { error } = await supabase.from("pemo_deposits").insert(payload);
        if (error) throw error;
        toast.success("Deposit added");
      }
      setDepositOpen(false);
      qc.invalidateQueries({ queryKey: ["pemo_deposits"] });
    } catch (err: any) {
      toast.error(err.message ?? "Save failed");
    }
  }
  async function removeDeposit(id: string) {
    const { error } = await supabase.from("pemo_deposits").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Deleted");
    qc.invalidateQueries({ queryKey: ["pemo_deposits"] });
  }

  const [txOpen, setTxOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<PemoTransaction | null>(null);
  const [txForm, setTxForm] = useState({ occurred_on: "", amount: "", description: "", category: "", card_id: "", invoice_ref: "" });

  function openEditTx(t: PemoTransaction) {
    setEditingTx(t);
    setTxForm({
      occurred_on: t.occurred_on,
      amount: String(t.amount),
      description: t.description ?? "",
      category: t.category ?? "",
      card_id: t.card_id ?? "",
      invoice_ref: t.invoice_ref ?? "",
    });
    setTxOpen(true);
  }
  async function saveTx(e: React.FormEvent) {
    e.preventDefault();
    if (!editingTx) return;
    const payload: any = {
      occurred_on: txForm.occurred_on || null,
      amount: txForm.amount === "" ? null : Number(txForm.amount),
      description: txForm.description || null,
      category: txForm.category || null,
      card_id: txForm.card_id || null,
      invoice_ref: txForm.invoice_ref || null,
    };
    try {
      const { error } = await supabase.from("pemo_transactions").update(payload).eq("id", editingTx.id);
      if (error) throw error;
      toast.success("Transaction updated");
      setTxOpen(false);
      qc.invalidateQueries({ queryKey: ["pemo_transactions"] });
    } catch (err: any) {
      toast.error(err.message ?? "Save failed");
    }
  }
  async function removeTx(id: string) {
    const { error } = await supabase.from("pemo_transactions").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Deleted");
    qc.invalidateQueries({ queryKey: ["pemo_transactions"] });
  }

  function editStatementRow(row: StatementRow) {
    if (row.kind === "deposit") openEditDeposit(row.raw as PemoDeposit);
    else openEditTx(row.raw as PemoTransaction);
  }
  function removeStatementRow(row: StatementRow) {
    if (row.kind === "deposit") removeDeposit(row.raw.id);
    else removeTx(row.raw.id);
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">PEMO Management</h1>
        <p className="text-muted-foreground">Track PEMO card spend, deposits, and account balance.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Total Deposited</p>
          <p className="text-2xl font-bold">{fmtAED(totalDeposited)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Total Spent</p>
          <p className="text-2xl font-bold">{fmtAED(totalSpent)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Balance</p>
          <p className="text-2xl font-bold">{fmtAED(balance)}</p>
        </Card>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setCardsManagerOpen(true)}>
            <Settings className="h-4 w-4 mr-2" /> Manage Addon Cards
          </Button>
          <Button onClick={openNewDeposit}><Plus className="h-4 w-4 mr-2" /> Add Deposit</Button>
        </div>
        <Select value={cardFilter} onValueChange={setCardFilter}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Cards</SelectItem>
            {cards.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Card</TableHead>
              <TableHead className="text-right">Credit</TableHead>
              <TableHead className="text-right">Debit</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead>Invoice Ref</TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredStatementRows.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-6 text-muted-foreground">No activity yet.</TableCell></TableRow>
            ) : filteredStatementRows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.date}</TableCell>
                <TableCell>{row.description}</TableCell>
                <TableCell>{row.cardLabel ?? "—"}</TableCell>
                <TableCell className="text-right">{row.credit > 0 ? fmtAED(row.credit) : "—"}</TableCell>
                <TableCell className="text-right">{row.debit > 0 ? fmtAED(row.debit) : "—"}</TableCell>
                <TableCell className="text-right">{fmtAED(row.balance)}</TableCell>
                <TableCell>{row.invoiceRef ?? "—"}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="icon" variant="ghost" onClick={() => editStatementRow(row)}><Pencil className="h-4 w-4" /></Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="icon" variant="ghost"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete this {row.kind === "deposit" ? "deposit" : "transaction"}?</AlertDialogTitle>
                          <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => removeStatementRow(row)}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={cardsManagerOpen} onOpenChange={setCardsManagerOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Manage Addon Cards</DialogTitle>
          </DialogHeader>
          <div className="flex justify-end">
            <Button size="sm" onClick={openNewCard}><Plus className="h-4 w-4 mr-2" /> Add Card</Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Label</TableHead>
                <TableHead>Employee</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="w-24 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cards.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">No cards yet.</TableCell></TableRow>
              ) : cards.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{c.label}</TableCell>
                  <TableCell>{employeeName(c.employee_id ? employeesById.get(c.employee_id) : null)}</TableCell>
                  <TableCell>{c.active ? "Active" : "Inactive"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEditCard(c)}><Pencil className="h-4 w-4" /></Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="icon" variant="ghost"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete this card?</AlertDialogTitle>
                            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => removeCard(c.id)}>Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCardsManagerOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cardOpen} onOpenChange={setCardOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editingCard ? "Edit Card" : "Add Card"}</DialogTitle></DialogHeader>
          <form onSubmit={saveCard} className="space-y-3">
            <div className="space-y-1">
              <Label>Label *</Label>
              <Input required value={cardForm.label} onChange={(e) => setCardForm({ ...cardForm, label: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Employee</Label>
              <Select
                value={cardForm.employee_id || "none"}
                onValueChange={(v) => setCardForm({ ...cardForm, employee_id: v === "none" ? "" : v })}
              >
                <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {employees.map((e) => <SelectItem key={e.id} value={e.id}>{employeeName(e)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Checkbox checked={cardForm.active} onCheckedChange={(v) => setCardForm({ ...cardForm, active: Boolean(v) })} />
              <Label>Active</Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCardOpen(false)}>Cancel</Button>
              <Button type="submit">{editingCard ? "Update" : "Create"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={depositOpen} onOpenChange={setDepositOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editingDeposit ? "Edit Deposit" : "Add Deposit"}</DialogTitle></DialogHeader>
          <form onSubmit={saveDeposit} className="space-y-3">
            <div className="space-y-1">
              <Label>Date *</Label>
              <Input type="date" required value={depositForm.deposited_on} onChange={(e) => setDepositForm({ ...depositForm, deposited_on: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Amount</Label>
              <Input type="number" step="0.01" min="0.01" required value={depositForm.amount} onChange={(e) => setDepositForm({ ...depositForm, amount: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Note</Label>
              <Textarea rows={2} value={depositForm.note} onChange={(e) => setDepositForm({ ...depositForm, note: e.target.value })} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDepositOpen(false)}>Cancel</Button>
              <Button type="submit">{editingDeposit ? "Update" : "Create"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={txOpen} onOpenChange={setTxOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edit Transaction</DialogTitle></DialogHeader>
          <form onSubmit={saveTx} className="space-y-3">
            <div className="space-y-1">
              <Label>Date *</Label>
              <Input type="date" required value={txForm.occurred_on} onChange={(e) => setTxForm({ ...txForm, occurred_on: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Card</Label>
              <Select
                value={txForm.card_id || "none"}
                onValueChange={(v) => setTxForm({ ...txForm, card_id: v === "none" ? "" : v })}
              >
                <SelectTrigger><SelectValue placeholder="Select a card..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {cards.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <Textarea rows={2} value={txForm.description} onChange={(e) => setTxForm({ ...txForm, description: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Category</Label>
              <Input value={txForm.category} onChange={(e) => setTxForm({ ...txForm, category: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Invoice Ref</Label>
              <Input value={txForm.invoice_ref} onChange={(e) => setTxForm({ ...txForm, invoice_ref: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Amount</Label>
              <Input type="number" step="0.01" min="0.01" required value={txForm.amount} onChange={(e) => setTxForm({ ...txForm, amount: e.target.value })} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setTxOpen(false)}>Cancel</Button>
              <Button type="submit">Update</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
