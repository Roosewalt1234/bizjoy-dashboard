import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/customers/")({
  component: CustomersList,
});

function CustomersList() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "Individual" | "Business">("all");

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const filtered = customers.filter((c: any) => {
    const matchesSearch =
      (c.display_name ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (c.email ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (c.company_name ?? "").toLowerCase().includes(search.toLowerCase());
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && c.is_active !== false) ||
      (statusFilter === "inactive" && c.is_active === false);
    const matchesType = typeFilter === "all" || c.customer_type === typeFilter;
    return matchesSearch && matchesStatus && matchesType;
  });

  async function handleDelete(id: string) {
    const { error } = await supabase.from("customers").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Customer deleted");
    qc.invalidateQueries({ queryKey: ["customers"] });
  }

  async function toggleActive(id: string, current: boolean) {
    const { error } = await (supabase.from("customers") as any).update({ is_active: !current }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(!current ? "Marked active" : "Marked inactive");
    qc.invalidateQueries({ queryKey: ["customers"] });
  }

  const counts = {
    active: customers.filter((c: any) => c.is_active !== false).length,
    inactive: customers.filter((c: any) => c.is_active === false).length,
    individual: customers.filter((c: any) => c.customer_type === "Individual").length,
    business: customers.filter((c: any) => c.customer_type === "Business").length,
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Customers</h1>
          <p className="text-muted-foreground">Manage your customer database.</p>
        </div>
        <Button onClick={() => navigate({ to: "/customers/new" })}>
          <Plus className="h-4 w-4 mr-2" /> Add Customer
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-md border p-1 bg-muted/30">
          <Button size="sm" variant={statusFilter === "all" ? "default" : "ghost"} onClick={() => setStatusFilter("all")}>All ({customers.length})</Button>
          <Button size="sm" variant={statusFilter === "active" ? "default" : "ghost"} onClick={() => setStatusFilter("active")}>Active ({counts.active})</Button>
          <Button size="sm" variant={statusFilter === "inactive" ? "default" : "ghost"} onClick={() => setStatusFilter("inactive")}>Inactive ({counts.inactive})</Button>
        </div>
        <div className="flex gap-1 rounded-md border p-1 bg-muted/30">
          <Button size="sm" variant={typeFilter === "all" ? "default" : "ghost"} onClick={() => setTypeFilter("all")}>All Types</Button>
          <Button size="sm" variant={typeFilter === "Individual" ? "default" : "ghost"} onClick={() => setTypeFilter("Individual")}>Individual ({counts.individual})</Button>
          <Button size="sm" variant={typeFilter === "Business" ? "default" : "ghost"} onClick={() => setTypeFilter("Business")}>Business ({counts.business})</Button>
        </div>
        <div className="relative ml-auto max-w-sm w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search customers..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Display Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Currency</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-32 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No customers match the current filters.</TableCell></TableRow>
            ) : filtered.map((c: any) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">
                  <Link to="/customers/$id" params={{ id: c.id }} className="hover:underline">
                    {c.display_name}
                  </Link>
                </TableCell>
                <TableCell><Badge variant="secondary">{c.customer_type}</Badge></TableCell>
                <TableCell>{c.company_name ?? "—"}</TableCell>
                <TableCell>{c.email ?? "—"}</TableCell>
                <TableCell>{c.phone ?? c.mobile ?? "—"}</TableCell>
                <TableCell>{c.currency ?? "—"}</TableCell>
                <TableCell>
                  <button onClick={() => toggleActive(c.id, c.is_active !== false)} className="cursor-pointer">
                    <Badge variant={c.is_active !== false ? "default" : "outline"}>
                      {c.is_active !== false ? "Active" : "Inactive"}
                    </Badge>
                  </button>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="icon" variant="ghost" onClick={() => navigate({ to: "/customers/$id", params: { id: c.id } })}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="icon" variant="ghost"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete customer?</AlertDialogTitle>
                          <AlertDialogDescription>This will permanently delete {c.display_name} and related contacts/documents.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(c.id)}>Delete</AlertDialogAction>
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
    </div>
  );
}

