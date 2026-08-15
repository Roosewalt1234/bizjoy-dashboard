import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ExportMenu } from "@/components/export-menu";
import { PAGE_SIZE, paginate, PaginationBar } from "@/components/pagination-bar";

export const Route = createFileRoute("/_authenticated/fm-contract-line-items")({
  component: ContractLineItemsPage,
});

type ContractLookup = {
  id: string;
  title: string;
  contract_no: string | null;
  customer_name: string | null;
};

type ServiceCategory = {
  id: string;
  name: string;
  code: string | null;
};

type SlaPolicy = {
  id: string;
  name: string;
};

type LineItemRow = {
  id: string;
  contract_id: string;
  service_category_id: string | null;
  sla_policy_id: string | null;
  description: string;
  scope_notes: string | null;
  uom: string | null;
  quantity: number | null;
  frequency: string | null;
  unit_rate: number | null;
  monthly_amount: number | null;
  annual_amount: number | null;
  active: boolean;
  contracts?: ContractLookup | null;
  service_categories?: ServiceCategory | null;
  sla_policies?: SlaPolicy | null;
};

type LineItemForm = {
  contract_id: string;
  service_category_id: string;
  description: string;
  uom: string;
  quantity: string;
  frequency: string;
  unit_rate: string;
  monthly_amount: string;
  annual_amount: string;
  sla_policy_id: string;
  scope_notes: string;
};

type LooseQuery = PromiseLike<{ data: unknown; error: { message?: string } | null }> & {
  select: (columns?: string) => LooseQuery;
  order: (column: string, options?: unknown) => LooseQuery;
  eq: (column: string, value: unknown) => LooseQuery;
  insert: (payload: unknown) => LooseQuery;
  update: (payload: unknown) => LooseQuery;
  delete: () => LooseQuery;
};

type LooseSupabase = {
  from: (table: string) => LooseQuery;
};

const emptyForm: LineItemForm = {
  contract_id: "",
  service_category_id: "none",
  description: "",
  uom: "",
  quantity: "",
  frequency: "",
  unit_rate: "",
  monthly_amount: "",
  annual_amount: "",
  sla_policy_id: "none",
  scope_notes: "",
};

const parksideItems = [
  ["Cleaning", "Team Leader", "Monthly", 1, 4100],
  ["Cleaning", "Male Cleaner", "Monthly", 3, 10800],
  ["Cleaning", "Female Cleaner", "Monthly", 1, 4100],
  ["Cleaning", "Cleaning Chemicals, Tools, Machinery & Equipment", "Monthly", 1, 4000],
  ["Cleaning", "Consumables including Air Fresheners & Water in Gym", "Monthly", 1, 1550],
  ["MEP", "Supervisor", "Monthly", 1, 8000],
  ["HVAC", "HVAC Tech", "Monthly", 1, 5500],
  ["Electrical", "Electrician", "Monthly", 1, 5500],
  ["Plumbing", "Plumber", "Monthly", 1, 5500],
  ["MEP", "Multi Technician", "Monthly", 1, 6000],
  ["MEP", "Threshold MEP & HVAC", "Monthly", 1, 1000],
  ["MEP", "Tools & Equipment", "Monthly", 1, 1000],
  ["MEP", "Consumables", "Monthly", 1, 167],
  ["MEP", "MEP & HVAC Spares", "Monthly", 1, 12500],
  ["HVAC", "HVAC System Maintenance", "4 times PA", 1, 12500],
  ["Swimming Pool", "Swimming Pool Maintenance, 2 Pools, Weekly 3 Visits", "Monthly", 1, 6000],
  ["Lift", "Lift Maintenance", "Monthly", 4, 2880],
] as const;

const fmDb = supabase as unknown as LooseSupabase;

function errorMessage(error: unknown, fallback: string) {
  return (error as { message?: string })?.message ?? fallback;
}

function formatAED(value: number) {
  return new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency: "AED",
    maximumFractionDigits: 0,
  }).format(value);
}

function ContractLineItemsPage() {
  const qc = useQueryClient();
  const [selectedContractId, setSelectedContractId] = useState("all");
  const [selectedCategoryId, setSelectedCategoryId] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<LineItemRow | null>(null);
  const [form, setForm] = useState<LineItemForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [addingSample, setAddingSample] = useState(false);

  const { data: contracts = [] } = useQuery({
    queryKey: ["contracts-lookup-line-items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contracts")
        .select("id, title, contract_no, customer_name")
        .order("created_at", { ascending: false })
        .limit(10000);
      if (error) throw error;
      return (data ?? []) as ContractLookup[];
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["service_categories_lookup"],
    queryFn: async () => {
      const { data, error } = await fmDb
        .from("service_categories")
        .select("id, name, code")
        .eq("active", true)
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ServiceCategory[];
    },
  });

  const { data: slaPolicies = [] } = useQuery({
    queryKey: ["sla_policies_lookup"],
    queryFn: async () => {
      const { data, error } = await fmDb
        .from("sla_policies")
        .select("id, name")
        .eq("active", true)
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as SlaPolicy[];
    },
  });

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["contract_line_items"],
    queryFn: async () => {
      const { data, error } = await fmDb
        .from("contract_line_items")
        .select(
          `
          *,
          contracts:contract_id(id, title, contract_no, customer_name),
          service_categories:service_category_id(id, name, code),
          sla_policies:sla_policy_id(id, name)
        `,
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as LineItemRow[];
    },
  });

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      const contractMatch = selectedContractId === "all" || row.contract_id === selectedContractId;
      const categoryMatch =
        selectedCategoryId === "all" || row.service_category_id === selectedCategoryId;
      const textMatch =
        !term ||
        [
          row.description,
          row.uom,
          row.frequency,
          row.contracts?.customer_name,
          row.service_categories?.name,
        ].some((value) => (value ?? "").toLowerCase().includes(term));
      return contractMatch && categoryMatch && textMatch;
    });
  }, [rows, search, selectedContractId, selectedCategoryId]);

  const totalMonthly = filteredRows.reduce(
    (sum, row) => sum + (Number(row.monthly_amount) || 0),
    0,
  );
  const totalAnnual = filteredRows.reduce((sum, row) => sum + (Number(row.annual_amount) || 0), 0);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pageRows = paginate(filteredRows, page);

  function updateForm(patch: Partial<LineItemForm>) {
    setForm((prev) => {
      const next = { ...prev, ...patch };
      if (("quantity" in patch || "unit_rate" in patch) && !("monthly_amount" in patch)) {
        const quantity = Number(next.quantity);
        const unitRate = Number(next.unit_rate);
        if (
          Number.isFinite(quantity) &&
          Number.isFinite(unitRate) &&
          next.quantity !== "" &&
          next.unit_rate !== ""
        ) {
          next.monthly_amount = String(+(quantity * unitRate).toFixed(2));
        }
      }
      if (
        ("monthly_amount" in patch || "quantity" in patch || "unit_rate" in patch) &&
        !("annual_amount" in patch)
      ) {
        const monthly = Number(next.monthly_amount);
        if (Number.isFinite(monthly) && next.monthly_amount !== "") {
          next.annual_amount = String(+(monthly * 12).toFixed(2));
        }
      }
      return next;
    });
  }

  function startCreate() {
    setEditing(null);
    setForm({ ...emptyForm, contract_id: selectedContractId === "all" ? "" : selectedContractId });
    setOpen(true);
  }

  function startEdit(row: LineItemRow) {
    setEditing(row);
    setForm({
      contract_id: row.contract_id,
      service_category_id: row.service_category_id ?? "none",
      description: row.description ?? "",
      uom: row.uom ?? "",
      quantity: row.quantity != null ? String(row.quantity) : "",
      frequency: row.frequency ?? "",
      unit_rate: row.unit_rate != null ? String(row.unit_rate) : "",
      monthly_amount: row.monthly_amount != null ? String(row.monthly_amount) : "",
      annual_amount: row.annual_amount != null ? String(row.annual_amount) : "",
      sla_policy_id: row.sla_policy_id ?? "none",
      scope_notes: row.scope_notes ?? "",
    });
    setOpen(true);
  }

  async function save() {
    if (!form.contract_id) {
      toast.error("Select a contract");
      return;
    }
    if (!form.description.trim()) {
      toast.error("Enter a description");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        contract_id: form.contract_id,
        service_category_id: form.service_category_id === "none" ? null : form.service_category_id,
        sla_policy_id: form.sla_policy_id === "none" ? null : form.sla_policy_id,
        description: form.description.trim(),
        scope_notes: form.scope_notes.trim() || null,
        uom: form.uom.trim() || null,
        quantity: form.quantity ? Number(form.quantity) : null,
        frequency: form.frequency.trim() || null,
        unit_rate: form.unit_rate ? Number(form.unit_rate) : null,
        monthly_amount: form.monthly_amount ? Number(form.monthly_amount) : null,
        annual_amount: form.annual_amount ? Number(form.annual_amount) : null,
      };

      const query = editing
        ? fmDb.from("contract_line_items").update(payload).eq("id", editing.id)
        : fmDb.from("contract_line_items").insert(payload);
      const { error } = await query;
      if (error) throw error;

      toast.success(editing ? "Line item updated" : "Line item added");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["contract_line_items"] });
    } catch (error: unknown) {
      toast.error(errorMessage(error, "Save failed"));
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: LineItemRow) {
    const { error } = await fmDb.from("contract_line_items").delete().eq("id", row.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Line item deleted");
    qc.invalidateQueries({ queryKey: ["contract_line_items"] });
  }

  async function addParksideSampleItems() {
    if (selectedContractId === "all") {
      toast.error("Select a contract first");
      return;
    }

    const byName = new Map(categories.map((category) => [category.name.toLowerCase(), category]));
    const missing = Array.from(new Set(parksideItems.map(([categoryName]) => categoryName))).filter(
      (categoryName) => !byName.has(categoryName.toLowerCase()),
    );
    if (missing.length > 0) {
      toast.error(`Create these service categories first: ${missing.join(", ")}`);
      return;
    }

    setAddingSample(true);
    try {
      const { error } = await fmDb.from("contract_line_items").insert(
        parksideItems.map(
          ([categoryName, description, frequency, quantity, monthlyAmount], index) => {
            const category = byName.get(categoryName.toLowerCase());
            return {
              contract_id: selectedContractId,
              service_category_id: category?.id ?? null,
              description,
              uom: "Month",
              quantity,
              frequency,
              unit_rate: monthlyAmount,
              monthly_amount: monthlyAmount,
              annual_amount: monthlyAmount * 12,
              line_no: index + 1,
            };
          },
        ),
      );
      if (error) throw error;

      toast.success("48 Parkside sample line items added");
      qc.invalidateQueries({ queryKey: ["contract_line_items"] });
    } catch (error: unknown) {
      toast.error(errorMessage(error, "Failed to add sample items"));
    } finally {
      setAddingSample(false);
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Contract Line Items</h1>
          <p className="text-muted-foreground">
            Build each contract scope, price basis, and service-category coverage.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportMenu
            filename="contract-line-items"
            sheetName="Contract Line Items"
            rows={filteredRows}
            columns={[
              { key: "description", label: "Description" },
              { key: "uom", label: "UOM" },
              { key: "quantity", label: "Quantity" },
              { key: "frequency", label: "Frequency" },
              { key: "unit_rate", label: "Unit Rate" },
              { key: "monthly_amount", label: "Monthly Amount" },
              { key: "annual_amount", label: "Annual Amount" },
            ]}
          />
          <Button onClick={startCreate}>
            <Plus className="h-4 w-4 mr-2" /> Add Line Item
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Monthly Total</p>
          <p className="text-2xl font-bold">{formatAED(totalMonthly)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Annual Total</p>
          <p className="text-2xl font-bold">{formatAED(totalAnnual)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Line Items</p>
          <p className="text-2xl font-bold">{filteredRows.length}</p>
        </Card>
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs">Contract</Label>
            <Select
              value={selectedContractId}
              onValueChange={(value) => {
                setSelectedContractId(value);
                setPage(1);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Contracts</SelectItem>
                {contracts.map((contract) => (
                  <SelectItem key={contract.id} value={contract.id}>
                    {(contract.contract_no ? `${contract.contract_no} - ` : "") +
                      (contract.customer_name ?? contract.title)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Service Category</Label>
            <Select
              value={selectedCategoryId}
              onValueChange={(value) => {
                setSelectedCategoryId(value);
                setPage(1);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="line-item-search" className="text-xs">
              Search
            </Label>
            <Input
              id="line-item-search"
              placeholder="Search line items"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="flex items-end">
            <Button
              className="w-full"
              variant="outline"
              onClick={addParksideSampleItems}
              disabled={selectedContractId === "all" || addingSample}
            >
              {addingSample ? "Adding..." : "Add 48 Parkside Sample Line Items"}
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Contract</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Qty</TableHead>
              <TableHead>Frequency</TableHead>
              <TableHead className="text-right">Monthly</TableHead>
              <TableHead className="text-right">Annual</TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : pageRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  No line items found.
                </TableCell>
              </TableRow>
            ) : (
              pageRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    {row.contracts?.contract_no ?? row.contracts?.customer_name ?? "—"}
                  </TableCell>
                  <TableCell>{row.service_categories?.name ?? "—"}</TableCell>
                  <TableCell className="font-medium">{row.description}</TableCell>
                  <TableCell>
                    {row.quantity ?? "—"} {row.uom ?? ""}
                  </TableCell>
                  <TableCell>{row.frequency ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    {row.monthly_amount != null ? formatAED(Number(row.monthly_amount)) : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {row.annual_amount != null ? formatAED(Number(row.annual_amount)) : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" onClick={() => startEdit(row)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="icon" variant="ghost">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete this line item?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => remove(row)}>
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
        <PaginationBar page={page} total={filteredRows.length} onPageChange={setPage} />
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit Contract Line Item" : "Add Contract Line Item"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Contract *</Label>
              <Select
                value={form.contract_id || undefined}
                onValueChange={(value) => updateForm({ contract_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select contract..." />
                </SelectTrigger>
                <SelectContent>
                  {contracts.map((contract) => (
                    <SelectItem key={contract.id} value={contract.id}>
                      {(contract.contract_no ? `${contract.contract_no} - ` : "") +
                        (contract.customer_name ?? contract.title)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Service Category</Label>
              <Select
                value={form.service_category_id}
                onValueChange={(value) => updateForm({ service_category_id: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label>Description *</Label>
              <Input
                value={form.description}
                onChange={(event) => updateForm({ description: event.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>UOM</Label>
              <Input
                value={form.uom}
                onChange={(event) => updateForm({ uom: event.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Frequency</Label>
              <Input
                value={form.frequency}
                onChange={(event) => updateForm({ frequency: event.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Quantity</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.quantity}
                onChange={(event) => updateForm({ quantity: event.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Unit Rate</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.unit_rate}
                onChange={(event) => updateForm({ unit_rate: event.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Monthly Amount</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.monthly_amount}
                onChange={(event) => updateForm({ monthly_amount: event.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Annual Amount</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.annual_amount}
                onChange={(event) => updateForm({ annual_amount: event.target.value })}
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label>SLA Policy</Label>
              <Select
                value={form.sla_policy_id}
                onValueChange={(value) => updateForm({ sla_policy_id: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {slaPolicies.map((policy) => (
                    <SelectItem key={policy.id} value={policy.id}>
                      {policy.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label>Scope Notes</Label>
              <Textarea
                rows={3}
                value={form.scope_notes}
                onChange={(event) => updateForm({ scope_notes: event.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving..." : "Save Line Item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
