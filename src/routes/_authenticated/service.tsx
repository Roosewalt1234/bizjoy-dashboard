import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Eye, Wrench } from "lucide-react";
import { toast } from "sonner";
import { PaginationBar, PAGE_SIZE, paginate } from "@/components/pagination-bar";
import { ExportMenu } from "@/components/export-menu";
import { ServiceReportDialog } from "@/components/service-report-dialog";
import { SERVICE_TYPES, REPORT_STATUS, statusClasses } from "@/lib/service-reports";
import { usePermissions } from "@/hooks/use-permissions";

export const Route = createFileRoute("/_authenticated/service")({
  component: ServicePage,
});

function ServicePage() {
  const qc = useQueryClient();
  const { can } = usePermissions();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [viewing, setViewing] = useState<any | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: reports = [], isLoading } = useQuery({
    queryKey: ["service_reports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_reports")
        .select("*")
        .order("service_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (reports as any[]).filter((r) => {
      if (typeFilter !== "all" && r.service_type !== typeFilter) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!q) return true;
      return [r.report_no, r.customer_name, r.technician_name, r.location]
        .some((v) => (v ?? "").toString().toLowerCase().includes(q));
    });
  }, [reports, search, typeFilter, statusFilter]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
  const pageRows = paginate(filtered, page);

  const completed = (reports as any[]).filter((r) => r.status === "Completed").length;
  const thisMonth = (reports as any[]).filter((r) => (r.service_date ?? "").slice(0, 7) === new Date().toISOString().slice(0, 7)).length;

  async function remove(id: string) {
    const { error } = await supabase.from("service_reports").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Report deleted");
    qc.invalidateQueries({ queryKey: ["service_reports"] });
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Service Reports</h1>
          <p className="text-muted-foreground">Technician visit reports with before &amp; after photos</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportMenu
            filename="service-reports"
            rows={filtered}
            sheetName="Service Reports"
            columns={[
              { key: "report_no", label: "Report No" },
              { key: "service_date", label: "Date" },
              { key: "customer_name", label: "Customer" },
              { key: "service_type", label: "Service Type" },
              { key: "technician_name", label: "Technician" },
              { key: "location", label: "Location" },
              { key: "hours_spent", label: "Hours" },
              { key: "next_service_date", label: "Next Service" },
              { key: "status", label: "Status" },
            ]}
          />
          {can("service", "add") && (
            <Button onClick={() => { setEditing(null); setOpen(true); }}>
              <Plus className="h-4 w-4 mr-2" /> New Report
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Total Reports</div>
          <div className="text-2xl font-bold">{reports.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Completed</div>
          <div className="text-2xl font-bold text-emerald-600">{completed}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">This Month</div>
          <div className="text-2xl font-bold">{thisMonth}</div>
        </Card>
      </div>

      <Card className="p-3 flex flex-col md:flex-row gap-2">
        <Input
          placeholder="Search report no, customer, technician, location..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="md:max-w-sm"
        />
        <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1); }}>
          <SelectTrigger className="md:w-56"><SelectValue placeholder="Service type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All service types</SelectItem>
            {SERVICE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="md:w-44"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {REPORT_STATUS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Report No</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Service Type</TableHead>
              <TableHead>Technician</TableHead>
              <TableHead>Next Service</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-32 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
            ) : pageRows.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No service reports yet.</TableCell></TableRow>
            ) : pageRows.map((r: any) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.report_no ?? "—"}</TableCell>
                <TableCell>{r.service_date ?? "—"}</TableCell>
                <TableCell>{r.customer_name ?? "—"}</TableCell>
                <TableCell>
                  {r.service_type ? <Badge variant="secondary" className="gap-1"><Wrench className="h-3 w-3" />{r.service_type}</Badge> : "—"}
                </TableCell>
                <TableCell>{r.technician_name ?? "—"}</TableCell>
                <TableCell>{r.next_service_date ?? "—"}</TableCell>
                <TableCell><Badge variant="outline" className={statusClasses(r.status)}>{r.status}</Badge></TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="icon" variant="ghost" onClick={() => setViewing(r)}><Eye className="h-4 w-4" /></Button>
                    {can("service", "edit") && (
                      <Button size="icon" variant="ghost" onClick={() => { setEditing(r); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                    )}
                    {can("service", "delete") && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="icon" variant="ghost"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete this service report?</AlertDialogTitle>
                            <AlertDialogDescription>Photos attached to it will also be removed. This cannot be undone.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => remove(r.id)}>Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <PaginationBar page={page} total={total} onPageChange={setPage} />
      </Card>

      <ServiceReportDialog open={open} onOpenChange={setOpen} editing={editing} />
      <ViewReportDialog report={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}

function ViewReportDialog({ report, onClose }: { report: any | null; onClose: () => void }) {
  const [photos, setPhotos] = useState<any[]>([]);

  useEffect(() => {
    if (!report) { setPhotos([]); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("service_report_photos")
        .select("*")
        .eq("report_id", report.id)
        .order("sort_order");
      const rows = data ?? [];
      const paths = rows.flatMap((p: any) => [p.before_path, p.after_path]).filter(Boolean) as string[];
      const urlMap: Record<string, string> = {};
      if (paths.length) {
        const { data: signed } = await supabase.storage.from("service-photos").createSignedUrls(paths, 3600);
        (signed ?? []).forEach((s: any) => { if (s.path && s.signedUrl) urlMap[s.path] = s.signedUrl; });
      }
      if (!cancelled) {
        setPhotos(rows.map((p: any) => ({
          ...p,
          beforeUrl: p.before_path ? urlMap[p.before_path] : null,
          afterUrl: p.after_path ? urlMap[p.after_path] : null,
        })));
      }
    })();
    return () => { cancelled = true; };
  }, [report]);

  if (!report) return null;

  const Field = ({ label, value }: { label: string; value: any }) => (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm whitespace-pre-wrap">{value || "—"}</div>
    </div>
  );

  return (
    <Dialog open={Boolean(report)} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Service Report {report.report_no ? `#${report.report_no}` : ""}</DialogTitle>
        </DialogHeader>
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Field label="Date" value={report.service_date} />
            <Field label="Customer" value={report.customer_name} />
            <Field label="Technician" value={report.technician_name} />
            <Field label="Service Type" value={report.service_type} />
            <Field label="Location / Unit" value={report.location} />
            <Field label="Hours Spent" value={report.hours_spent} />
            <Field label="Next Service" value={report.next_service_date} />
            <Field label="Status" value={report.status} />
          </div>
          {(() => {
            const SEP = "\n---\n";
            const p = (report.problem_reported ?? "").split(SEP);
            const w = (report.work_done ?? "").split(SEP);
            const pa = (report.parts_used ?? "").split(SEP);
            const n = Math.max(p.length, w.length, pa.length, 1);
            return Array.from({ length: n }).map((_, i) => (
              <Card key={i} className="p-3 space-y-2">
                {n > 1 && <div className="text-xs font-medium text-muted-foreground">Item {i + 1}</div>}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Field label="Problem Reported" value={p[i]} />
                  <Field label="Work Done" value={w[i]} />
                  <Field label="Parts Used" value={pa[i]} />
                </div>
              </Card>
            ));
          })()}
          <Field label="Recommendations" value={report.recommendations} />


          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Before / After</h3>
            {photos.length === 0 ? (
              <p className="text-sm text-muted-foreground">No photos attached.</p>
            ) : photos.map((p) => (
              <Card key={p.id} className="p-3 space-y-2">
                {p.caption && <div className="text-sm font-medium">{p.caption}</div>}
                <div className="grid grid-cols-2 gap-3">
                  {(["before", "after"] as const).map((side) => {
                    const url = side === "before" ? p.beforeUrl : p.afterUrl;
                    return (
                      <div key={side} className="space-y-1">
                        <div className="text-xs uppercase text-muted-foreground">{side}</div>
                        {url ? (
                          <a href={url} target="_blank" rel="noreferrer">
                            <img src={url} alt={`${side} photo`} className="w-full h-48 object-cover rounded-md border" />
                          </a>
                        ) : (
                          <div className="h-48 rounded-md border border-dashed grid place-items-center text-xs text-muted-foreground">No image</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Card>
            ))}
          </div>

          {report.signature_data && (
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Signed by {report.signed_by || "customer"}</div>
              <img src={report.signature_data} alt="Customer signature" className="h-24 border rounded-md bg-background" />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
