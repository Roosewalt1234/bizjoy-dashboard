/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
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
import { summarizeBillingLines } from "@/lib/fm-invoice";

const fmDb = supabase as any;

function formatAED(value: unknown) {
  return new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency: "AED",
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

const emptyConsumable = {
  category: "",
  item_name: "",
  monthly_amount: "",
  annual_amount: "",
  included: true,
  notes: "",
};

export function ConsumablesSection({ contractId }: { contractId: string }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [dialog, setDialog] = useState<{ mode: "add" | "edit"; row?: any } | null>(null);
  const [form, setForm] = useState<any>(emptyConsumable);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["contract_consumables", contractId],
    queryFn: async () => {
      const { data, error } = await fmDb
        .from("contract_consumables")
        .select("*")
        .eq("contract_id", contractId)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const categories = useMemo(
    () => Array.from(new Set(rows.map((row: any) => row.category).filter(Boolean))) as string[],
    [rows],
  );

  const filtered = useMemo(
    () =>
      rows.filter((row: any) => {
        const matchesCategory = categoryFilter === "all" || row.category === categoryFilter;
        const term = search.trim().toLowerCase();
        const matchesSearch =
          !term ||
          [row.category, row.item_name, row.notes]
            .filter(Boolean)
            .some((value: string) => value.toLowerCase().includes(term));
        return matchesCategory && matchesSearch;
      }),
    [rows, categoryFilter, search],
  );

  function startAdd() {
    setForm({ ...emptyConsumable });
    setDialog({ mode: "add" });
  }

  function startEdit(row: any) {
    setForm({
      category: row.category ?? "",
      item_name: row.item_name ?? "",
      monthly_amount: row.monthly_amount ?? "",
      annual_amount: row.annual_amount ?? "",
      included: row.included !== false,
      notes: row.notes ?? "",
    });
    setDialog({ mode: "edit", row });
  }

  async function save() {
    if (!form.item_name.trim()) {
      toast.error("Item name is required");
      return;
    }
    const payload: any = {
      category: form.category || null,
      item_name: form.item_name,
      monthly_amount: form.monthly_amount === "" ? null : Number(form.monthly_amount),
      annual_amount: form.annual_amount === "" ? null : Number(form.annual_amount),
      included: Boolean(form.included),
      notes: form.notes || null,
    };
    const { error } =
      dialog?.mode === "edit"
        ? await fmDb.from("contract_consumables").update(payload).eq("id", dialog.row.id)
        : await fmDb.from("contract_consumables").insert({
            ...payload,
            contract_id: contractId,
            sort_order: rows.length + 1,
          });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(dialog?.mode === "edit" ? "Item updated" : "Item added");
    setDialog(null);
    qc.invalidateQueries({ queryKey: ["contract_consumables", contractId] });
  }

  async function remove(row: any) {
    const { error } = await fmDb.from("contract_consumables").delete().eq("id", row.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Item deleted");
    qc.invalidateQueries({ queryKey: ["contract_consumables", contractId] });
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search item, category or notes"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="max-w-xs"
        />
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((category) => (
              <SelectItem key={category} value={category}>
                {category}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="text-sm text-muted-foreground">
          {filtered.length} of {rows.length} items
        </div>
        <Button size="sm" className="ml-auto" onClick={startAdd}>
          <Plus className="h-4 w-4 mr-2" /> Add Item
        </Button>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Category</TableHead>
              <TableHead>Item / Description</TableHead>
              <TableHead>Included</TableHead>
              <TableHead className="text-right">Monthly</TableHead>
              <TableHead className="text-right">Annual</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  Loading consumables...
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  No consumables or equipment for this contract.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((row: any) => (
                <TableRow key={row.id}>
                  <TableCell>{row.category ?? "—"}</TableCell>
                  <TableCell className="font-medium">{row.item_name}</TableCell>
                  <TableCell>
                    <Badge variant={row.included !== false ? "default" : "outline"}>
                      {row.included !== false ? "Included" : "Excluded"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {row.monthly_amount == null ? "—" : formatAED(row.monthly_amount)}
                  </TableCell>
                  <TableCell className="text-right">
                    {row.annual_amount == null ? "—" : formatAED(row.annual_amount)}
                  </TableCell>
                  <TableCell className="max-w-xs text-sm text-muted-foreground">
                    {row.notes ?? "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" onClick={() => startEdit(row)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => remove(row)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={Boolean(dialog)} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog?.mode === "edit" ? "Edit Consumable / Equipment" : "Add Consumable / Equipment"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Category</Label>
              <Input
                value={form.category}
                onChange={(event) => setForm({ ...form, category: event.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Item name / description</Label>
              <Input
                value={form.item_name}
                onChange={(event) => setForm({ ...form, item_name: event.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Monthly amount</Label>
                <Input
                  type="number"
                  value={form.monthly_amount}
                  onChange={(event) => setForm({ ...form, monthly_amount: event.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Annual amount</Label>
                <Input
                  type="number"
                  value={form.annual_amount}
                  onChange={(event) => setForm({ ...form, annual_amount: event.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Included in contract</Label>
              <Select
                value={form.included ? "yes" : "no"}
                onValueChange={(value) => setForm({ ...form, included: value === "yes" })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">Included</SelectItem>
                  <SelectItem value="no">Excluded</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Notes / source reference</Label>
              <Textarea
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button onClick={save}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function BillingTemplateSection({
  contractId,
  vatPercent = 5,
}: {
  contractId: string;
  vatPercent?: number;
}) {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["contract_billing_lines", contractId],
    queryFn: async () => {
      const { data, error } = await fmDb
        .from("contract_billing_lines")
        .select("*, service_categories:service_category_id(name)")
        .eq("contract_id", contractId)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const summary = useMemo(
    () => summarizeBillingLines(rows as any[], vatPercent),
    [rows, vatPercent],
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Billable Lines</p>
          <p className="text-2xl font-bold">{summary.billableCount}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Subtotal (monthly)</p>
          <p className="text-2xl font-bold">{formatAED(summary.subtotal)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">VAT {vatPercent}%</p>
          <p className="text-2xl font-bold">{formatAED(summary.vatAmount)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Gross</p>
          <p className="text-2xl font-bold">{formatAED(summary.grossAmount)}</p>
        </Card>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Service Category</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Monthly</TableHead>
              <TableHead className="text-right">Annual</TableHead>
              <TableHead>VAT</TableHead>
              <TableHead>Row Type</TableHead>
              <TableHead>Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  Loading billing template...
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  No billing template lines for this contract.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row: any) => (
                <TableRow key={row.id} className={row.is_total_row ? "bg-muted/60 font-semibold" : ""}>
                  <TableCell>{row.service_categories?.name ?? "—"}</TableCell>
                  <TableCell>{row.billing_line}</TableCell>
                  <TableCell className="text-right">{formatAED(row.monthly_amount)}</TableCell>
                  <TableCell className="text-right">{formatAED(row.annual_amount)}</TableCell>
                  <TableCell>{row.vat_status ?? "—"}</TableCell>
                  <TableCell>
                    {row.is_total_row ? (
                      <Badge variant="outline">Display only (TOTAL)</Badge>
                    ) : (
                      <Badge>Billable</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {row.notes ?? "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <Card className="p-4 text-sm text-muted-foreground">
        Rows flagged as TOTAL are summary/display-only and are excluded from subtotal, VAT, gross and
        all invoice pack generation.
      </Card>
    </div>
  );
}
