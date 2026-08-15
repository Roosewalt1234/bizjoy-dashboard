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
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/fm-assets")({
  component: ContractAssetsPage,
});

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

type ContractLookup = {
  id: string;
  title: string;
  contract_no: string | null;
  customer_name: string | null;
};

type ServiceCategory = {
  id: string;
  name: string;
};

type AssetRow = {
  id: string;
  contract_id: string;
  service_category_id: string | null;
  asset_tag: string | null;
  asset_type: string | null;
  description: string | null;
  make: string | null;
  model: string | null;
  serial_no: string | null;
  location: string | null;
  floor: string | null;
  zone: string | null;
  criticality: string | null;
  warranty_expiry: string | null;
  status: string;
  contracts?: ContractLookup | null;
  service_categories?: ServiceCategory | null;
};

type AssetForm = {
  contract_id: string;
  service_category_id: string;
  asset_tag: string;
  asset_type: string;
  description: string;
  make: string;
  model: string;
  serial_no: string;
  location: string;
  floor: string;
  zone: string;
  criticality: string;
  warranty_expiry: string;
  status: string;
};

const emptyForm: AssetForm = {
  contract_id: "",
  service_category_id: "none",
  asset_tag: "",
  asset_type: "",
  description: "",
  make: "",
  model: "",
  serial_no: "",
  location: "",
  floor: "",
  zone: "",
  criticality: "",
  warranty_expiry: "",
  status: "Active",
};

const ASSET_STATUSES = ["Active", "Inactive", "Under Maintenance", "Retired"];
const CRITICALITIES = ["Low", "Medium", "High", "Critical"];
const fmDb = supabase as unknown as LooseSupabase;

function errorMessage(error: unknown, fallback: string) {
  return (error as { message?: string })?.message ?? fallback;
}

function statusClasses(status: string) {
  switch (status) {
    case "Active":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "Under Maintenance":
      return "bg-amber-100 text-amber-800 border-amber-200";
    case "Retired":
      return "bg-red-100 text-red-800 border-red-200";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

function ContractAssetsPage() {
  const qc = useQueryClient();
  const [selectedContractId, setSelectedContractId] = useState("all");
  const [selectedCategoryId, setSelectedCategoryId] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AssetRow | null>(null);
  const [form, setForm] = useState<AssetForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const { data: contracts = [] } = useQuery({
    queryKey: ["contracts-lookup-assets"],
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
    queryKey: ["service-categories-lookup-assets"],
    queryFn: async () => {
      const { data, error } = await fmDb
        .from("service_categories")
        .select("id, name")
        .eq("active", true)
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ServiceCategory[];
    },
  });

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["contract_assets"],
    queryFn: async () => {
      const { data, error } = await fmDb
        .from("contract_assets")
        .select(
          `
          *,
          contracts:contract_id(id, title, contract_no, customer_name),
          service_categories:service_category_id(id, name)
        `,
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AssetRow[];
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
          row.asset_tag,
          row.asset_type,
          row.description,
          row.make,
          row.model,
          row.serial_no,
          row.location,
          row.floor,
          row.zone,
          row.contracts?.customer_name,
          row.service_categories?.name,
        ].some((value) => (value ?? "").toLowerCase().includes(term));
      return contractMatch && categoryMatch && textMatch;
    });
  }, [rows, search, selectedContractId, selectedCategoryId]);

  const activeCount = filteredRows.filter((row) => row.status === "Active").length;
  const criticalCount = filteredRows.filter((row) => row.criticality === "Critical").length;
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pageRows = paginate(filteredRows, page);

  function updateForm(patch: Partial<AssetForm>) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  function startCreate() {
    setEditing(null);
    setForm({
      ...emptyForm,
      contract_id: selectedContractId === "all" ? "" : selectedContractId,
      service_category_id: selectedCategoryId === "all" ? "none" : selectedCategoryId,
    });
    setOpen(true);
  }

  function startEdit(row: AssetRow) {
    setEditing(row);
    setForm({
      contract_id: row.contract_id,
      service_category_id: row.service_category_id ?? "none",
      asset_tag: row.asset_tag ?? "",
      asset_type: row.asset_type ?? "",
      description: row.description ?? "",
      make: row.make ?? "",
      model: row.model ?? "",
      serial_no: row.serial_no ?? "",
      location: row.location ?? "",
      floor: row.floor ?? "",
      zone: row.zone ?? "",
      criticality: row.criticality ?? "",
      warranty_expiry: row.warranty_expiry ?? "",
      status: row.status ?? "Active",
    });
    setOpen(true);
  }

  async function save() {
    if (!form.contract_id) {
      toast.error("Select a contract");
      return;
    }
    if (!form.asset_tag.trim() && !form.description.trim()) {
      toast.error("Enter an asset tag or description");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        contract_id: form.contract_id,
        service_category_id: form.service_category_id === "none" ? null : form.service_category_id,
        asset_tag: form.asset_tag.trim() || null,
        asset_type: form.asset_type.trim() || null,
        description: form.description.trim() || null,
        make: form.make.trim() || null,
        model: form.model.trim() || null,
        serial_no: form.serial_no.trim() || null,
        location: form.location.trim() || null,
        floor: form.floor.trim() || null,
        zone: form.zone.trim() || null,
        criticality: form.criticality || null,
        warranty_expiry: form.warranty_expiry || null,
        status: form.status || "Active",
      };

      const query = editing
        ? fmDb.from("contract_assets").update(payload).eq("id", editing.id)
        : fmDb.from("contract_assets").insert(payload);
      const { error } = await query;
      if (error) throw error;

      toast.success(editing ? "Asset updated" : "Asset added");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["contract_assets"] });
    } catch (error: unknown) {
      toast.error(errorMessage(error, "Save failed"));
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: AssetRow) {
    const { error } = await fmDb.from("contract_assets").delete().eq("id", row.id);
    if (error) {
      toast.error(error.message || "Delete failed");
      return;
    }
    toast.success("Asset deleted");
    qc.invalidateQueries({ queryKey: ["contract_assets"] });
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">FM Asset Register</h1>
          <p className="text-muted-foreground">
            Maintain contract assets for PPM planning, reactive work orders, and service reporting.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportMenu
            filename="contract-assets"
            sheetName="Contract Assets"
            rows={filteredRows}
            columns={[
              { key: "asset_tag", label: "Asset Tag" },
              { key: "asset_type", label: "Asset Type" },
              { key: "description", label: "Description" },
              { key: "make", label: "Make" },
              { key: "model", label: "Model" },
              { key: "serial_no", label: "Serial No" },
              { key: "location", label: "Location" },
              { key: "floor", label: "Floor" },
              { key: "zone", label: "Zone" },
              { key: "criticality", label: "Criticality" },
              { key: "warranty_expiry", label: "Warranty Expiry" },
              { key: "status", label: "Status" },
            ]}
          />
          <Button onClick={startCreate}>
            <Plus className="h-4 w-4 mr-2" /> Add Asset
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Total Assets</p>
          <p className="text-2xl font-bold">{filteredRows.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Active Assets</p>
          <p className="text-2xl font-bold">{activeCount}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Critical Assets</p>
          <p className="text-2xl font-bold">{criticalCount}</p>
        </Card>
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
            <Label htmlFor="asset-search" className="text-xs">
              Search
            </Label>
            <Input
              id="asset-search"
              placeholder="Search assets"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Asset</TableHead>
              <TableHead>Contract</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Make / Model</TableHead>
              <TableHead>Criticality</TableHead>
              <TableHead>Status</TableHead>
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
                  No assets found.
                </TableCell>
              </TableRow>
            ) : (
              pageRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <div className="font-medium">
                      {row.asset_tag ?? row.description ?? "Untitled"}
                    </div>
                    <div className="text-xs text-muted-foreground">{row.asset_type ?? "—"}</div>
                  </TableCell>
                  <TableCell>
                    {row.contracts?.contract_no ?? row.contracts?.customer_name ?? "—"}
                  </TableCell>
                  <TableCell>{row.service_categories?.name ?? "—"}</TableCell>
                  <TableCell>
                    {[row.location, row.floor, row.zone].filter(Boolean).join(" / ") || "—"}
                  </TableCell>
                  <TableCell>{[row.make, row.model].filter(Boolean).join(" / ") || "—"}</TableCell>
                  <TableCell>{row.criticality ?? "—"}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn("font-medium", statusClasses(row.status))}
                    >
                      {row.status}
                    </Badge>
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
                            <AlertDialogTitle>Delete this asset?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This can affect linked PPM schedules or work orders.
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
            <DialogTitle>{editing ? "Edit Asset" : "Add Asset"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1 md:col-span-2">
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
            <div className="space-y-1">
              <Label>Asset Tag</Label>
              <Input
                value={form.asset_tag}
                onChange={(e) => updateForm({ asset_tag: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Asset Type</Label>
              <Input
                value={form.asset_type}
                onChange={(e) => updateForm({ asset_type: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Serial No</Label>
              <Input
                value={form.serial_no}
                onChange={(e) => updateForm({ serial_no: e.target.value })}
              />
            </div>
            <div className="space-y-1 md:col-span-3">
              <Label>Description</Label>
              <Textarea
                rows={2}
                value={form.description}
                onChange={(e) => updateForm({ description: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Make</Label>
              <Input value={form.make} onChange={(e) => updateForm({ make: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Model</Label>
              <Input value={form.model} onChange={(e) => updateForm({ model: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Warranty Expiry</Label>
              <Input
                type="date"
                value={form.warranty_expiry}
                onChange={(e) => updateForm({ warranty_expiry: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Location</Label>
              <Input
                value={form.location}
                onChange={(e) => updateForm({ location: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Floor</Label>
              <Input value={form.floor} onChange={(e) => updateForm({ floor: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Zone</Label>
              <Input value={form.zone} onChange={(e) => updateForm({ zone: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Criticality</Label>
              <Select
                value={form.criticality || undefined}
                onValueChange={(value) => updateForm({ criticality: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  {CRITICALITIES.map((criticality) => (
                    <SelectItem key={criticality} value={criticality}>
                      {criticality}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(value) => updateForm({ status: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASSET_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving..." : "Save Asset"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
