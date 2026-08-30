import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { usePermissions } from "@/hooks/use-permissions";
import {
  fetchCleaningTowers,
  regenerateAreaNfcToken,
  type CleaningArea,
  type CleaningFloor,
  type CleaningTower,
} from "@/features/fm-cleaning-areas/fm-cleaning-areas-api";
import {
  WEEKDAYS,
  deleteCleaningSchedule,
  fetchEmployeeOptions,
  fetchSchedulesForTowers,
  fetchTodaysCompletionByArea,
  fetchVisitsForTowers,
  saveCleaningSchedule,
  type CleaningSchedule,
  type FrequencyType,
  type TodaysCompletion,
} from "./fm-cleaning-scheduler-api";

function scheduleSummary(s: CleaningSchedule): string {
  const freq =
    s.frequency_type === "daily"
      ? "Daily"
      : s.frequency_type === "weekly"
        ? "Weekly"
        : (s.days_of_week ?? []).map((d) => WEEKDAYS[d]?.label ?? d).join(", ") || "Custom days";
  const time = s.time_window_start && s.time_window_end ? ` ${s.time_window_start.slice(0, 5)}-${s.time_window_end.slice(0, 5)}` : "";
  return `${freq}${time}`;
}

export function FmCleaningSchedulerWorkspacePage() {
  const qc = useQueryClient();
  const { can } = usePermissions();
  const canEdit = can("projects", "edit");
  const canAdd = can("projects", "add");
  const canDelete = can("projects", "delete");

  const [contractId, setContractId] = useState<string>("");

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
    enabled: !!contractId,
  });

  const towers = towersQuery.data ?? [];
  const towerIds = useMemo(() => towers.map((t) => t.id), [towers]);

  const schedulesQuery = useQuery({
    queryKey: ["fm-cleaning-schedules", towerIds],
    queryFn: () => fetchSchedulesForTowers(towerIds),
    enabled: towerIds.length > 0,
  });

  const visitsQuery = useQuery({
    queryKey: ["fm-cleaning-visits", towerIds],
    queryFn: () => fetchVisitsForTowers(towerIds),
    enabled: towerIds.length > 0,
  });

  const completionQuery = useQuery({
    queryKey: ["fm-cleaning-todays-completion", towerIds],
    queryFn: () => fetchTodaysCompletionByArea(towerIds),
    enabled: towerIds.length > 0,
    refetchInterval: 60_000,
  });

  const employeesQuery = useQuery({ queryKey: ["fm-cleaning-employees"], queryFn: fetchEmployeeOptions });

  const refreshSchedules = () => qc.invalidateQueries({ queryKey: ["fm-cleaning-schedules", towerIds] });
  const refreshVisits = () => qc.invalidateQueries({ queryKey: ["fm-cleaning-visits", towerIds] });
  const refreshTowers = () => qc.invalidateQueries({ queryKey: ["fm-cleaning-towers", contractId] });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Cleaning Scheduler</h1>
        <p className="text-muted-foreground text-sm">
          Set recurring cleaning plans per floor and review the visit history logged by the cleaner app's NFC scans.
        </p>
      </div>

      <Card className="p-4 space-y-1 max-w-sm">
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
      </Card>

      {!contractId ? (
        <Card className="p-10 text-center text-muted-foreground">Select a project to manage its cleaning schedules.</Card>
      ) : towers.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">
          No towers/floors defined yet for this project - set those up under Cleaning Area first.
        </Card>
      ) : (
        <Tabs defaultValue="schedules">
          <TabsList>
            <TabsTrigger value="schedules">Schedules</TabsTrigger>
            <TabsTrigger value="visits">Visit History</TabsTrigger>
          </TabsList>
          <TabsContent value="schedules" className="space-y-2 pt-2">
            <Accordion type="multiple" className="space-y-2">
              {towers.map((tower) => (
                <TowerScheduleCard
                  key={tower.id}
                  tower={tower}
                  schedulesByFloor={schedulesQuery.data ?? {}}
                  completionByArea={completionQuery.data ?? {}}
                  employees={employeesQuery.data ?? []}
                  canEdit={canEdit}
                  canAdd={canAdd}
                  canDelete={canDelete}
                  onScheduleChanged={refreshSchedules}
                  onTokenChanged={refreshTowers}
                />
              ))}
            </Accordion>
          </TabsContent>
          <TabsContent value="visits" className="pt-2 space-y-2">
            <div className="flex justify-end">
              <Button size="sm" variant="outline" onClick={refreshVisits}>
                <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
              </Button>
            </div>
            <Card className="p-0 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Scanned At</TableHead>
                    <TableHead>Tower</TableHead>
                    <TableHead>Floor</TableHead>
                    <TableHead>Cleaner</TableHead>
                    <TableHead>Checklist</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(visitsQuery.data ?? []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        No visits logged yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    (visitsQuery.data ?? []).map((v) => (
                      <TableRow key={v.id}>
                        <TableCell>{new Date(v.scanned_at).toLocaleString()}</TableCell>
                        <TableCell>{v.tower_name}</TableCell>
                        <TableCell>{v.floor_label}</TableCell>
                        <TableCell>{v.employee_name ?? "-"}</TableCell>
                        <TableCell>
                          {v.item_count === 0 ? (
                            <span className="text-muted-foreground">-</span>
                          ) : (
                            <span className="flex items-center gap-1">
                              {v.done_count}/{v.item_count} done
                              {v.issue_count > 0 && <Badge variant="destructive">{v.issue_count} issue</Badge>}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="max-w-xs truncate">{v.notes ?? "-"}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function TowerScheduleCard({
  tower,
  schedulesByFloor,
  completionByArea,
  employees,
  canEdit,
  canAdd,
  canDelete,
  onScheduleChanged,
  onTokenChanged,
}: {
  tower: CleaningTower;
  schedulesByFloor: Record<string, CleaningSchedule[]>;
  completionByArea: Record<string, TodaysCompletion>;
  employees: { id: string; name: string }[];
  canEdit: boolean;
  canAdd: boolean;
  canDelete: boolean;
  onScheduleChanged: () => void;
  onTokenChanged: () => void;
}) {
  return (
    <Card key={tower.id} className="px-4">
      <AccordionItem value={tower.id} className="border-b-0">
        <AccordionTrigger>
          <span className="font-medium">{tower.name}</span>
        </AccordionTrigger>
        <AccordionContent>
          <div className="space-y-2">
            {tower.floors.length === 0 ? (
              <p className="text-sm text-muted-foreground">No floors defined for this tower.</p>
            ) : (
              <Accordion type="multiple" className="space-y-1">
                {tower.floors.map((floor) => (
                  <FloorScheduleRow
                    key={floor.id}
                    floor={floor}
                    schedules={schedulesByFloor[floor.id] ?? []}
                    completionByArea={completionByArea}
                    employees={employees}
                    canEdit={canEdit}
                    canAdd={canAdd}
                    canDelete={canDelete}
                    onScheduleChanged={onScheduleChanged}
                    onTokenChanged={onTokenChanged}
                  />
                ))}
              </Accordion>
            )}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Card>
  );
}

const emptyScheduleForm = {
  area_id: "",
  frequency_type: "daily" as FrequencyType,
  days_of_week: [] as number[],
  time_window_start: "",
  time_window_end: "",
  assigned_employee_id: "none",
  active: true,
};

function FloorScheduleRow({
  floor,
  schedules,
  completionByArea,
  employees,
  canEdit,
  canAdd,
  canDelete,
  onScheduleChanged,
  onTokenChanged,
}: {
  floor: CleaningFloor;
  schedules: CleaningSchedule[];
  completionByArea: Record<string, TodaysCompletion>;
  employees: { id: string; name: string }[];
  canEdit: boolean;
  canAdd: boolean;
  canDelete: boolean;
  onScheduleChanged: () => void;
  onTokenChanged: () => void;
}) {
  const sections = floor.areas.filter((a) => a.area_type === "section");

  return (
    <AccordionItem value={floor.id} className="border rounded-md px-3">
      <AccordionTrigger>
        <span className="flex items-center gap-2">
          {floor.label}
          <Badge variant="outline">{schedules.length} schedule{schedules.length === 1 ? "" : "s"}</Badge>
        </span>
      </AccordionTrigger>
      <AccordionContent className="space-y-2">
        {sections.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No sections defined for this floor yet - add them under Cleaning Area first.
          </p>
        ) : (
          <Accordion type="multiple" className="space-y-1">
            {sections.map((section) => (
              <SectionScheduleCard
                key={section.id}
                section={section}
                utilityRooms={floor.areas.filter((a) => a.area_type === "utility_room" && a.section_id === section.id)}
                schedules={schedules.filter((s) => floor.areas.some((a) => a.id === s.area_id && a.section_id === section.id))}
                completionByArea={completionByArea}
                employees={employees}
                canEdit={canEdit}
                canAdd={canAdd}
                canDelete={canDelete}
                onScheduleChanged={onScheduleChanged}
                onTokenChanged={onTokenChanged}
              />
            ))}
          </Accordion>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}

function SectionScheduleCard({
  section,
  utilityRooms,
  schedules,
  completionByArea,
  employees,
  canEdit,
  canAdd,
  canDelete,
  onScheduleChanged,
  onTokenChanged,
}: {
  section: CleaningArea;
  utilityRooms: CleaningArea[];
  schedules: CleaningSchedule[];
  completionByArea: Record<string, TodaysCompletion>;
  employees: { id: string; name: string }[];
  canEdit: boolean;
  canAdd: boolean;
  canDelete: boolean;
  onScheduleChanged: () => void;
  onTokenChanged: () => void;
}) {
  const [dialog, setDialog] = useState<{ open: boolean; editing: CleaningSchedule | null; form: typeof emptyScheduleForm }>({
    open: false,
    editing: null,
    form: emptyScheduleForm,
  });
  const [regenerating, setRegenerating] = useState(false);

  const checkinPath = `/clean-checkin/${section.nfc_token}`;

  const copyToken = async () => {
    try {
      await navigator.clipboard.writeText(section.nfc_token);
      toast.success("NFC token copied");
    } catch {
      toast.error("Could not copy - copy it manually");
    }
  };

  const regenerateToken = async () => {
    setRegenerating(true);
    try {
      await regenerateAreaNfcToken(section.id);
      toast.success("NFC token regenerated - reprint this section's tag");
      onTokenChanged();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to regenerate token");
    } finally {
      setRegenerating(false);
    }
  };

  const openAdd = () =>
    setDialog({ open: true, editing: null, form: { ...emptyScheduleForm, area_id: utilityRooms[0]?.id ?? "" } });
  const openEdit = (s: CleaningSchedule) =>
    setDialog({
      open: true,
      editing: s,
      form: {
        area_id: s.area_id,
        frequency_type: s.frequency_type,
        days_of_week: s.days_of_week ?? [],
        time_window_start: s.time_window_start?.slice(0, 5) ?? "",
        time_window_end: s.time_window_end?.slice(0, 5) ?? "",
        assigned_employee_id: s.assigned_employee_id ?? "none",
        active: s.active,
      },
    });

  const saveSchedule = async () => {
    if (!dialog.form.area_id) {
      toast.error("Select a utility room");
      return;
    }
    if (dialog.form.frequency_type === "custom_days" && dialog.form.days_of_week.length === 0) {
      toast.error("Select at least one day");
      return;
    }
    try {
      await saveCleaningSchedule(
        {
          floor_id: section.floor_id!,
          area_id: dialog.form.area_id,
          frequency_type: dialog.form.frequency_type,
          days_of_week: dialog.form.days_of_week,
          time_window_start: dialog.form.time_window_start,
          time_window_end: dialog.form.time_window_end,
          assigned_employee_id: dialog.form.assigned_employee_id === "none" ? null : dialog.form.assigned_employee_id,
          active: dialog.form.active,
        },
        dialog.editing?.id,
      );
      toast.success(dialog.editing ? "Schedule updated" : "Schedule added");
      setDialog({ open: false, editing: null, form: emptyScheduleForm });
      onScheduleChanged();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to save schedule");
    }
  };

  const removeSchedule = async (id: string) => {
    try {
      await deleteCleaningSchedule(id);
      toast.success("Schedule deleted");
      onScheduleChanged();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to delete schedule");
    }
  };

  const toggleDay = (d: number) =>
    setDialog((s) => ({
      ...s,
      form: {
        ...s.form,
        days_of_week: s.form.days_of_week.includes(d) ? s.form.days_of_week.filter((x) => x !== d) : [...s.form.days_of_week, d],
      },
    }));

  return (
    <AccordionItem value={section.id} className="border rounded-md px-3">
      <AccordionTrigger>
        <span className="flex items-center gap-2">
          {section.name}
          <Badge variant="outline">{schedules.length} schedule{schedules.length === 1 ? "" : "s"}</Badge>
        </span>
      </AccordionTrigger>
      <AccordionContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 rounded border px-2 py-1.5 text-xs">
          <span className="text-muted-foreground">NFC token:</span>
          <code className="text-xs">{section.nfc_token}</code>
          <Button size="icon" variant="ghost" className="h-6 w-6" title="Copy token" onClick={copyToken}>
            <Copy className="h-3.5 w-3.5" />
          </Button>
          {canEdit && (
            <Button size="icon" variant="ghost" className="h-6 w-6" title="Regenerate token" disabled={regenerating} onClick={regenerateToken}>
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          )}
          <span className="text-muted-foreground ml-2">Suggested check-in path: {checkinPath}</span>
        </div>

        {canAdd && utilityRooms.length > 0 && (
          <Button size="sm" variant="outline" onClick={openAdd}>
            <Plus className="h-3 w-3 mr-1" /> Add schedule
          </Button>
        )}
        {utilityRooms.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No utility rooms under this section yet - add them under Cleaning Area first.
          </p>
        )}

        {schedules.length === 0 ? (
          utilityRooms.length > 0 && <p className="text-sm text-muted-foreground">No schedules yet for this section.</p>
        ) : (
          <div className="space-y-1">
            {schedules.map((s) => {
              const completion = completionByArea[s.area_id];
              return (
              <div key={s.id} className="flex items-center justify-between gap-2 rounded border px-2 py-1.5 text-sm">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="secondary">{s.area_name}</Badge>
                  <span>{scheduleSummary(s)}</span>
                  {s.assigned_employee_name && <span className="text-muted-foreground">- {s.assigned_employee_name}</span>}
                  {!s.active && <Badge variant="outline">inactive</Badge>}
                  {completion ? (
                    <Badge
                      variant={completion.status === "issue" ? "destructive" : completion.status === "skipped" ? "outline" : "default"}
                      title={`${new Date(completion.scannedAt).toLocaleTimeString()}${completion.employeeName ? ` - ${completion.employeeName}` : ""}`}
                    >
                      {completion.status === "done" ? "Done today" : completion.status === "issue" ? "Issue reported" : "Skipped today"}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">
                      Not done today
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {canEdit && (
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(s)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {canDelete && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-7 w-7">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete this schedule?</AlertDialogTitle>
                          <AlertDialogDescription>This does not delete past visit history, only the recurring plan.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => removeSchedule(s.id)}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </div>
              );
            })}
          </div>
        )}
      </AccordionContent>

      <Dialog open={dialog.open} onOpenChange={(open) => setDialog((s) => ({ ...s, open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog.editing ? "Edit Schedule" : `Add Schedule - ${section.name}`}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Utility room</Label>
              <Select value={dialog.form.area_id} onValueChange={(v) => setDialog((s) => ({ ...s, form: { ...s.form, area_id: v } }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a utility room" />
                </SelectTrigger>
                <SelectContent>
                  {utilityRooms.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Frequency</Label>
              <Select
                value={dialog.form.frequency_type}
                onValueChange={(v) => setDialog((s) => ({ ...s, form: { ...s.form, frequency_type: v as FrequencyType } }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="custom_days">Specific days</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {dialog.form.frequency_type === "custom_days" && (
              <div className="space-y-1">
                <Label>Days</Label>
                <div className="flex flex-wrap gap-2">
                  {WEEKDAYS.map((d) => (
                    <Button
                      key={d.value}
                      type="button"
                      size="sm"
                      variant={dialog.form.days_of_week.includes(d.value) ? "default" : "outline"}
                      onClick={() => toggleDay(d.value)}
                    >
                      {d.label}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Window start</Label>
                <Input
                  type="time"
                  value={dialog.form.time_window_start}
                  onChange={(e) => setDialog((s) => ({ ...s, form: { ...s.form, time_window_start: e.target.value } }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Window end</Label>
                <Input
                  type="time"
                  value={dialog.form.time_window_end}
                  onChange={(e) => setDialog((s) => ({ ...s, form: { ...s.form, time_window_end: e.target.value } }))}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Assigned cleaner</Label>
              <Select
                value={dialog.form.assigned_employee_id}
                onValueChange={(v) => setDialog((s) => ({ ...s, form: { ...s.form, assigned_employee_id: v } }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <Label>Active</Label>
              <Switch
                checked={dialog.form.active}
                onCheckedChange={(checked) => setDialog((s) => ({ ...s, form: { ...s.form, active: checked } }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog((s) => ({ ...s, open: false }))}>
              Cancel
            </Button>
            <Button onClick={saveSchedule}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AccordionItem>
  );
}
