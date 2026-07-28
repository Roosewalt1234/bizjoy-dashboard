import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PaginationBar, PAGE_SIZE, paginate } from "@/components/pagination-bar";
import { Eye } from "lucide-react";

export const Route = createFileRoute("/_authenticated/audit")({
  component: AuditPage,
});

const TABLES = [
  "customers","contracts","contract_payments","quotes","quote_items",
  "sales_leads","sales_orders","employees","accounts_transactions",
  "customer_contacts","customer_documents","projects",
];

function actionColor(a: string) {
  if (a === "INSERT") return "bg-emerald-100 text-emerald-700";
  if (a === "UPDATE") return "bg-amber-100 text-amber-700";
  if (a === "DELETE") return "bg-red-100 text-red-700";
  return "bg-slate-100 text-slate-700";
}

function AuditPage() {
  const [tableFilter, setTableFilter] = useState<string>("all");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [viewing, setViewing] = useState<any | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["audit_log", tableFilter, actionFilter],
    queryFn: async () => {
      let q = (supabase.from as any)("audit_log").select("*").order("changed_at", { ascending: false }).limit(2000);
      if (tableFilter !== "all") q = q.eq("table_name", tableFilter);
      if (actionFilter !== "all") q = q.eq("action", actionFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const filtered = search
    ? rows.filter((r) =>
        [r.user_name, r.user_email, r.record_id].filter(Boolean).some((v: string) =>
          String(v).toLowerCase().includes(search.toLowerCase())
        )
      )
    : rows;

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
  const pageRows = paginate(filtered, page);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Audit Log</h1>
        <p className="text-muted-foreground">Every add, edit and delete across your business data.</p>
      </div>

      <Card className="p-4 flex flex-wrap gap-3 items-end">
        <div className="min-w-48">
          <label className="text-xs text-muted-foreground">Table</label>
          <Select value={tableFilter} onValueChange={setTableFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All tables</SelectItem>
              {TABLES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-40">
          <label className="text-xs text-muted-foreground">Action</label>
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              <SelectItem value="INSERT">Insert</SelectItem>
              <SelectItem value="UPDATE">Update</SelectItem>
              <SelectItem value="DELETE">Delete</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 min-w-60">
          <label className="text-xs text-muted-foreground">Search user or record id</label>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, email, record id..." />
        </div>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Table</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Record ID</TableHead>
              <TableHead className="w-16 text-right">Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
            ) : pageRows.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No audit entries.</TableCell></TableRow>
            ) : pageRows.map((r: any) => (
              <TableRow key={r.id}>
                <TableCell className="whitespace-nowrap">{new Date(r.changed_at).toLocaleString()}</TableCell>
                <TableCell>{r.table_name}</TableCell>
                <TableCell><Badge className={actionColor(r.action)}>{r.action}</Badge></TableCell>
                <TableCell>
                  <div className="text-sm">{r.user_name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">{r.user_email ?? r.user_id ?? ""}</div>
                </TableCell>
                <TableCell className="font-mono text-xs">{r.record_id ?? "—"}</TableCell>
                <TableCell className="text-right">
                  <Button size="icon" variant="ghost" onClick={() => setViewing(r)}><Eye className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <PaginationBar page={page} total={total} onPageChange={setPage} />
      </Card>

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Change details</DialogTitle>
          </DialogHeader>
          {viewing && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-muted-foreground">When:</span> {new Date(viewing.changed_at).toLocaleString()}</div>
                <div><span className="text-muted-foreground">Action:</span> {viewing.action}</div>
                <div><span className="text-muted-foreground">Table:</span> {viewing.table_name}</div>
                <div><span className="text-muted-foreground">Record:</span> <span className="font-mono text-xs">{viewing.record_id}</span></div>
                <div><span className="text-muted-foreground">User:</span> {viewing.user_name ?? "—"}</div>
                <div><span className="text-muted-foreground">Email:</span> {viewing.user_email ?? "—"}</div>
              </div>
              {viewing.old_data && (
                <div>
                  <div className="font-semibold mb-1">Before</div>
                  <pre className="bg-muted p-2 rounded text-xs overflow-x-auto max-h-64">{JSON.stringify(viewing.old_data, null, 2)}</pre>
                </div>
              )}
              {viewing.new_data && (
                <div>
                  <div className="font-semibold mb-1">After</div>
                  <pre className="bg-muted p-2 rounded text-xs overflow-x-auto max-h-64">{JSON.stringify(viewing.new_data, null, 2)}</pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
