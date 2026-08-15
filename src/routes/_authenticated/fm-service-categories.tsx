import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

export const Route = createFileRoute("/_authenticated/fm-service-categories")({
  component: ContractServiceCategoriesPage,
});

type CategoryRow = {
  id: string;
  name: string;
  code: string | null;
  discipline: string | null;
  is_ppm_enabled: boolean;
  is_reactive_enabled: boolean;
  default_response_hours: number | null;
  active: boolean;
  sort_order: number;
};

type CategoryForm = {
  name: string;
  code: string;
  discipline: string;
  is_ppm_enabled: boolean;
  is_reactive_enabled: boolean;
  default_sla_hours: string;
  active: boolean;
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

const DEFAULT_CATEGORIES = [
  "MEP",
  "HVAC",
  "Electrical",
  "Plumbing",
  "Civil",
  "Cleaning",
  "Swimming Pool",
  "Lift",
  "Fire Alarm",
  "Fire Fighting",
  "ELV",
  "Pest Control",
  "Landscaping",
  "Other",
];

const emptyForm: CategoryForm = {
  name: "",
  code: "",
  discipline: "",
  is_ppm_enabled: true,
  is_reactive_enabled: true,
  default_sla_hours: "",
  active: true,
};

const fmDb = supabase as unknown as LooseSupabase;

function errorMessage(error: unknown, fallback: string) {
  return (error as { message?: string })?.message ?? fallback;
}

function ContractServiceCategoriesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CategoryRow | null>(null);
  const [form, setForm] = useState<CategoryForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["service_categories"],
    queryFn: async () => {
      const { data, error } = await fmDb
        .from("service_categories")
        .select(
          "id, name, code, discipline, is_ppm_enabled, is_reactive_enabled, default_response_hours, active, sort_order",
        )
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CategoryRow[];
    },
  });

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) =>
      [row.name, row.code, row.discipline].some((value) =>
        (value ?? "").toLowerCase().includes(term),
      ),
    );
  }, [rows, search]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pageRows = paginate(filteredRows, page);

  function startCreate(name?: string) {
    const normalizedName = name ?? "";
    setEditing(null);
    setForm({
      ...emptyForm,
      name: normalizedName,
      code: normalizedName ? normalizedName.toUpperCase().replace(/[^A-Z0-9]+/g, "_") : "",
      discipline: normalizedName,
    });
    setOpen(true);
  }

  function startEdit(row: CategoryRow) {
    setEditing(row);
    setForm({
      name: row.name ?? "",
      code: row.code ?? "",
      discipline: row.discipline ?? "",
      is_ppm_enabled: row.is_ppm_enabled,
      is_reactive_enabled: row.is_reactive_enabled,
      default_sla_hours:
        row.default_response_hours != null ? String(row.default_response_hours) : "",
      active: row.active,
    });
    setOpen(true);
  }

  async function save() {
    if (!form.name.trim()) {
      toast.error("Enter a category name");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        code: form.code.trim() || null,
        discipline: form.discipline.trim() || null,
        is_ppm_enabled: form.is_ppm_enabled,
        is_reactive_enabled: form.is_reactive_enabled,
        default_response_hours: form.default_sla_hours ? Number(form.default_sla_hours) : null,
        active: form.active,
      };

      const query = editing
        ? fmDb.from("service_categories").update(payload).eq("id", editing.id)
        : fmDb.from("service_categories").insert(payload);
      const { error } = await query;
      if (error) throw error;

      toast.success(editing ? "Service category updated" : "Service category added");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["service_categories"] });
    } catch (error: unknown) {
      toast.error(errorMessage(error, "Save failed"));
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: CategoryRow) {
    const { error } = await fmDb.from("service_categories").delete().eq("id", row.id);
    if (error) {
      const message = String(error.message ?? "");
      toast.error(
        message.toLowerCase().includes("foreign key")
          ? "This category is used by contract line items or assets. Mark it inactive instead."
          : message || "Delete failed",
      );
      return;
    }

    toast.success("Service category deleted");
    qc.invalidateQueries({ queryKey: ["service_categories"] });
  }

  async function addMissingDefaults() {
    const existing = new Set(rows.map((row) => row.name.toLowerCase()));
    const missing = DEFAULT_CATEGORIES.filter((name) => !existing.has(name.toLowerCase()));
    if (missing.length === 0) {
      toast.info("Default categories already exist");
      return;
    }

    const { error } = await fmDb.from("service_categories").insert(
      missing.map((name, index) => ({
        name,
        code: name.toUpperCase().replace(/[^A-Z0-9]+/g, "_"),
        discipline: name,
        is_ppm_enabled: true,
        is_reactive_enabled: true,
        active: true,
        sort_order: rows.length + index,
      })),
    );
    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(`Added ${missing.length} default categories`);
    qc.invalidateQueries({ queryKey: ["service_categories"] });
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Service Categories</h1>
          <p className="text-muted-foreground">
            Manage FM service disciplines used by contracts, assets, PPM, and work orders.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportMenu
            filename="service-categories"
            sheetName="Service Categories"
            rows={filteredRows}
            columns={[
              { key: "code", label: "Code" },
              { key: "name", label: "Name" },
              { key: "discipline", label: "Discipline" },
              { key: "default_response_hours", label: "Default SLA Hours" },
              { key: "is_ppm_enabled", label: "PPM" },
              { key: "is_reactive_enabled", label: "Reactive" },
              { key: "active", label: "Active" },
            ]}
          />
          <Button variant="outline" onClick={addMissingDefaults}>
            Add Defaults
          </Button>
          <Button onClick={() => startCreate()}>
            <Plus className="h-4 w-4 mr-2" /> Add Category
          </Button>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex flex-col gap-3">
          <div className="max-w-sm">
            <Label htmlFor="service-category-search" className="text-xs">
              Search
            </Label>
            <Input
              id="service-category-search"
              placeholder="Search name, code, or discipline"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {DEFAULT_CATEGORIES.map((name) => (
              <Button
                key={name}
                type="button"
                size="sm"
                variant="outline"
                onClick={() => startCreate(name)}
              >
                {name}
              </Button>
            ))}
          </div>
        </div>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Discipline</TableHead>
              <TableHead>SLA Hours</TableHead>
              <TableHead>Usage</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : pageRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  No service categories found.
                </TableCell>
              </TableRow>
            ) : (
              pageRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.code ?? "—"}</TableCell>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell>{row.discipline ?? "—"}</TableCell>
                  <TableCell>{row.default_response_hours ?? "—"}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {row.is_ppm_enabled && <Badge variant="secondary">PPM</Badge>}
                      {row.is_reactive_enabled && <Badge variant="secondary">Reactive</Badge>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={row.active ? "default" : "outline"}>
                      {row.active ? "Active" : "Inactive"}
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
                            <AlertDialogTitle>Delete this service category?</AlertDialogTitle>
                            <AlertDialogDescription>
                              If this category is already referenced, deletion will be blocked and
                              you can mark it inactive instead.
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
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Service Category" : "Add Service Category"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Name *</Label>
              <Input
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Code</Label>
              <Input
                value={form.code}
                onChange={(event) => setForm((prev) => ({ ...prev, code: event.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Discipline</Label>
              <Input
                value={form.discipline}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, discipline: event.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label>Default SLA Hours</Label>
              <Input
                type="number"
                min="0"
                step="0.25"
                value={form.default_sla_hours}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, default_sla_hours: event.target.value }))
                }
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={form.is_ppm_enabled}
                onCheckedChange={(checked) =>
                  setForm((prev) => ({ ...prev, is_ppm_enabled: checked === true }))
                }
              />
              PPM enabled
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={form.is_reactive_enabled}
                onCheckedChange={(checked) =>
                  setForm((prev) => ({ ...prev, is_reactive_enabled: checked === true }))
                }
              />
              Reactive enabled
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={form.active}
                onCheckedChange={(checked) =>
                  setForm((prev) => ({ ...prev, active: checked === true }))
                }
              />
              Active
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving..." : "Save Category"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
