import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fetchCleaningTowers } from "@/features/fm-cleaning-areas/fm-cleaning-areas-api";
import {
  fetchCleaningOccurrences,
  fetchMepOccurrences,
  periodRange,
  type CleaningOccurrence,
  type MepOccurrence,
  type OccurrenceStatus,
  type PeriodType,
} from "./fm-reports-api";

function statusBadge(status: OccurrenceStatus, windowEnd: string | null) {
  switch (status) {
    case "done":
      return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">Done</Badge>;
    case "issue":
      return <Badge variant="destructive">Issue</Badge>;
    case "skipped":
      return <Badge variant="outline">Skipped</Badge>;
    case "missed":
      return <Badge variant="destructive">Missed</Badge>;
    case "upcoming":
      return (
        <Badge variant="outline" className="text-muted-foreground">
          Upcoming
        </Badge>
      );
    case "pending":
    default:
      return (
        <Badge className="bg-amber-100 text-amber-800 border-amber-200">
          Pending{windowEnd ? ` till ${windowEnd.slice(0, 5)}` : ""}
        </Badge>
      );
  }
}

function periodLabel(type: PeriodType, start: Date, end: Date): string {
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  if (type === "day") return fmt(start);
  if (type === "month") return start.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  return `${fmt(start)} - ${fmt(end)}`;
}

export function FmReportsPage() {
  const [contractId, setContractId] = useState("");
  const [source, setSource] = useState<"cleaning" | "mep">("cleaning");
  const [periodType, setPeriodType] = useState<PeriodType>("day");
  const [reference, setReference] = useState(() => new Date());

  const { start, end } = useMemo(() => periodRange(periodType, reference), [periodType, reference]);

  const contractsQuery = useQuery({
    queryKey: ["fm-contracts-picker"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fm_contracts")
        .select("id, title, contract_no, customer_name")
        .order("created_at", { ascending: false })
        .limit(10000);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const towersQuery = useQuery({
    queryKey: ["fm-cleaning-towers", contractId],
    queryFn: () => fetchCleaningTowers(contractId),
    enabled: !!contractId && source === "cleaning",
  });
  const towerIds = useMemo(() => (towersQuery.data ?? []).map((t) => t.id), [towersQuery.data]);

  const cleaningQuery = useQuery({
    queryKey: ["fm-reports-cleaning", towerIds, start.toISOString(), end.toISOString()],
    queryFn: () => fetchCleaningOccurrences(towerIds, start, end),
    enabled: source === "cleaning" && towerIds.length > 0,
  });

  const mepQuery = useQuery({
    queryKey: ["fm-reports-mep", contractId, start.toISOString(), end.toISOString()],
    queryFn: () => fetchMepOccurrences(contractId, start, end),
    enabled: source === "mep" && !!contractId,
  });

  const rows: (CleaningOccurrence | MepOccurrence)[] = source === "cleaning" ? cleaningQuery.data ?? [] : mepQuery.data ?? [];
  const counts = useMemo(() => {
    const c = { done: 0, pending: 0, missed: 0, upcoming: 0, issue: 0, skipped: 0 };
    for (const r of rows) {
      if (r.status === "done") c.done++;
      else if (r.status === "pending") c.pending++;
      else if (r.status === "missed") c.missed++;
      else if (r.status === "upcoming") c.upcoming++;
      else if (r.status === "issue") c.issue++;
      else if (r.status === "skipped") c.skipped++;
    }
    return c;
  }, [rows]);

  function shiftPeriod(dir: 1 | -1) {
    const next = new Date(reference);
    if (periodType === "day") next.setDate(next.getDate() + dir);
    else if (periodType === "week") next.setDate(next.getDate() + dir * 7);
    else next.setMonth(next.getMonth() + dir);
    setReference(next);
  }

  const isLoading = source === "cleaning" ? towersQuery.isLoading || cleaningQuery.isLoading : mepQuery.isLoading;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Reports</h1>
        <p className="text-muted-foreground text-sm">
          Every scheduled cleaning job or MEP/PPM visit for the selected period, tagged done, pending or missed.
        </p>
      </div>

      <Card className="p-4 flex flex-wrap items-end gap-4">
        <div className="w-full max-w-sm space-y-1">
          <Label>Project / Contract</Label>
          <Select value={contractId} onValueChange={setContractId}>
            <SelectTrigger>
              <SelectValue placeholder="Select a contract" />
            </SelectTrigger>
            <SelectContent>
              {(contractsQuery.data ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.contract_no ? `${c.contract_no} - ` : ""}
                  {c.title || c.customer_name || "Untitled"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Tabs value={source} onValueChange={(v) => setSource(v as "cleaning" | "mep")}>
          <TabsList>
            <TabsTrigger value="cleaning">Cleaning</TabsTrigger>
            <TabsTrigger value="mep">MEP</TabsTrigger>
          </TabsList>
        </Tabs>

        <Tabs value={periodType} onValueChange={(v) => setPeriodType(v as PeriodType)}>
          <TabsList>
            <TabsTrigger value="day">Day</TabsTrigger>
            <TabsTrigger value="week">Week</TabsTrigger>
            <TabsTrigger value="month">Month</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-1">
          <Button size="icon" variant="outline" onClick={() => shiftPeriod(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium min-w-40 text-center">{periodLabel(periodType, start, end)}</span>
          <Button size="icon" variant="outline" onClick={() => shiftPeriod(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setReference(new Date())}>
            Today
          </Button>
        </div>
      </Card>

      {!contractId ? (
        <Card className="p-10 text-center text-muted-foreground">Select a project to view its reports.</Card>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card className="p-3">
              <p className="text-xs text-muted-foreground">Done</p>
              <p className="text-2xl font-bold text-emerald-700">{counts.done}</p>
            </Card>
            <Card className="p-3">
              <p className="text-xs text-muted-foreground">Pending</p>
              <p className="text-2xl font-bold text-amber-700">{counts.pending}</p>
            </Card>
            <Card className="p-3">
              <p className="text-xs text-muted-foreground">Missed</p>
              <p className="text-2xl font-bold text-red-700">{counts.missed}</p>
            </Card>
            <Card className="p-3">
              <p className="text-xs text-muted-foreground">Upcoming</p>
              <p className="text-2xl font-bold text-muted-foreground">{counts.upcoming}</p>
            </Card>
          </div>

          <Card className="p-0 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Due Date</TableHead>
                  {source === "cleaning" ? (
                    <>
                      <TableHead>Area</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Assigned To</TableHead>
                    </>
                  ) : (
                    <>
                      <TableHead>Asset</TableHead>
                      <TableHead>Schedule</TableHead>
                      <TableHead>Contract</TableHead>
                    </>
                  )}
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      {source === "cleaning"
                        ? "No active cleaning schedules due in this period."
                        : "No PPM visits due in this period."}
                    </TableCell>
                  </TableRow>
                ) : source === "cleaning" ? (
                  (rows as CleaningOccurrence[]).map((r) => (
                    <TableRow key={r.key}>
                      <TableCell>{new Date(r.dueDate).toLocaleDateString()}</TableCell>
                      <TableCell>
                        {r.areaName}
                        {r.sectionName && <span className="text-muted-foreground"> · {r.sectionName}</span>}
                      </TableCell>
                      <TableCell>
                        {r.towerName} · {r.floorLabel}
                      </TableCell>
                      <TableCell>{r.assignedEmployeeName ?? "-"}</TableCell>
                      <TableCell>{statusBadge(r.status, r.windowEnd)}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  (rows as MepOccurrence[]).map((r) => (
                    <TableRow key={r.key}>
                      <TableCell>{new Date(r.dueDate).toLocaleDateString()}</TableCell>
                      <TableCell>
                        {r.assetTag ?? "-"}
                        {r.assetType && <span className="text-muted-foreground"> · {r.assetType}</span>}
                      </TableCell>
                      <TableCell>{r.scheduleName}</TableCell>
                      <TableCell>{r.contractName ?? "-"}</TableCell>
                      <TableCell>{statusBadge(r.status, null)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </>
      )}
    </div>
  );
}
