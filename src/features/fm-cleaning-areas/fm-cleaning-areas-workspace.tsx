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
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Checkbox } from "@/components/ui/checkbox";
import { usePermissions } from "@/hooks/use-permissions";
import {
  addCustomArea,
  addFloors,
  applyCatalogToAreas,
  createTowersWithFloors,
  deleteArea,
  deleteFloor,
  deleteTower,
  fetchCleaningCatalog,
  fetchCleaningTowers,
  regenerateAreaNfcToken,
  renameFloor,
  updateAreaName,
  updateAreaQuantity,
  updateAreaSection,
  updateTower,
  type AreaType,
  type CleaningArea,
  type CleaningFloor,
  type CleaningTower,
} from "./fm-cleaning-areas-api";

export function FmCleaningAreasWorkspacePage() {
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

  const catalogQuery = useQuery({
    queryKey: ["fm-cleaning-catalog"],
    queryFn: fetchCleaningCatalog,
  });

  const towers = towersQuery.data ?? [];
  const catalog = catalogQuery.data ?? [];

  const refresh = () => qc.invalidateQueries({ queryKey: ["fm-cleaning-towers", contractId] });

  const [towerDialog, setTowerDialog] = useState<{
    open: boolean;
    editing: CleaningTower | null;
    name: string;
    count: string;
    floorCount: string;
  }>({ open: false, editing: null, name: "", count: "1", floorCount: "1" });

  const openAddTower = () => setTowerDialog({ open: true, editing: null, name: "", count: "1", floorCount: "1" });
  const openEditTower = (t: CleaningTower) =>
    setTowerDialog({ open: true, editing: t, name: t.name, count: "1", floorCount: String(t.floor_count) });

  const saveTower = async () => {
    if (!towerDialog.name.trim()) {
      toast.error(towerDialog.editing || towerDialog.count === "1" ? "Tower name is required" : "Name prefix is required");
      return;
    }
    const floorCount = Math.max(0, Number(towerDialog.floorCount) || 0);
    const count = Math.max(1, Number(towerDialog.count) || 1);
    try {
      if (towerDialog.editing) {
        await updateTower(towerDialog.editing.id, towerDialog.name.trim(), floorCount);
      } else {
        await createTowersWithFloors(contractId, towerDialog.name.trim(), count, floorCount);
      }
      toast.success(towerDialog.editing ? "Tower updated" : count > 1 ? `${count} towers added` : "Tower added");
      setTowerDialog({ open: false, editing: null, name: "", count: "1", floorCount: "1" });
      refresh();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to save tower");
    }
  };

  const removeTower = async (id: string) => {
    try {
      await deleteTower(id);
      toast.success("Tower deleted");
      refresh();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to delete tower");
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Cleaning Areas</h1>
        <p className="text-muted-foreground text-sm">
          Define towers, sections and utility rooms per project - the building blocks used by the Cleaning Scheduler.
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
        {contractId && canAdd && (
          <Button onClick={openAddTower}>
            <Plus className="h-4 w-4 mr-1" /> Add Tower
          </Button>
        )}
      </Card>

      {!contractId ? (
        <Card className="p-10 text-center text-muted-foreground">Select a project to define its cleaning areas.</Card>
      ) : towersQuery.isLoading ? (
        <Card className="p-10 text-center text-muted-foreground">Loading...</Card>
      ) : towers.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">
          No towers defined yet for this project. Click "Add Tower" to start.
        </Card>
      ) : (
        <Accordion type="multiple" className="space-y-2">
          {towers.map((tower) => (
            <Card key={tower.id} className="px-4">
              <AccordionItem value={tower.id} className="border-b-0">
                <div className="flex items-center gap-2">
                  <AccordionTrigger className="flex-1">
                    <span className="flex items-center gap-2">
                      <span className="font-medium">{tower.name}</span>
                      <Badge variant="outline">{tower.floor_count} floors</Badge>
                    </span>
                  </AccordionTrigger>
                  <div className="flex items-center gap-1 pb-4">
                    {canEdit && (
                      <Button size="icon" variant="ghost" title="Edit tower" onClick={() => openEditTower(tower)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                    {canDelete && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="icon" variant="ghost" title="Delete tower">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete tower "{tower.name}"?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This removes all its floors and areas too. This cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => removeTower(tower.id)}>Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </div>
                <AccordionContent>
                  <TowerBody
                    tower={tower}
                    catalog={catalog}
                    canEdit={canEdit}
                    canAdd={canAdd}
                    canDelete={canDelete}
                    onChanged={refresh}
                  />
                </AccordionContent>
              </AccordionItem>
            </Card>
          ))}
        </Accordion>
      )}

      <Dialog open={towerDialog.open} onOpenChange={(open) => setTowerDialog((s) => ({ ...s, open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{towerDialog.editing ? "Edit Tower" : "Add Tower"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {!towerDialog.editing && (
              <div className="space-y-1">
                <Label>Number of towers</Label>
                <Input
                  type="number"
                  min={1}
                  value={towerDialog.count}
                  onChange={(e) => setTowerDialog((s) => ({ ...s, count: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">Most sites have a single tower - leave this as 1 unless the site has more.</p>
              </div>
            )}
            <div className="space-y-1">
              <Label>{!towerDialog.editing && Number(towerDialog.count) > 1 ? "Name prefix" : "Tower name"}</Label>
              <Input
                value={towerDialog.name}
                onChange={(e) => setTowerDialog((s) => ({ ...s, name: e.target.value }))}
                placeholder={!towerDialog.editing && Number(towerDialog.count) > 1 ? "Tower" : "Tower A"}
              />
              {!towerDialog.editing && Number(towerDialog.count) > 1 && (
                <p className="text-xs text-muted-foreground">
                  Creates "{towerDialog.name.trim() || "Tower"} 1", "{towerDialog.name.trim() || "Tower"} 2"... up to {Math.max(1, Number(towerDialog.count) || 1)}. Rename any of them after.
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label>Number of floors {!towerDialog.editing && Number(towerDialog.count) > 1 ? "(applies to all)" : ""}</Label>
              <Input
                type="number"
                min={0}
                value={towerDialog.floorCount}
                onChange={(e) => setTowerDialog((s) => ({ ...s, floorCount: e.target.value }))}
              />
              {!towerDialog.editing && (
                <p className="text-xs text-muted-foreground">
                  Floor rows (Floor 1..N) are created automatically - you can rename or add/remove individual floors after.
                </p>
              )}
              {towerDialog.editing && (
                <p className="text-xs text-muted-foreground">
                  Changing this only updates the floor count label; use "Add floor" inside the tower to add more floor rows.
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTowerDialog((s) => ({ ...s, open: false }))}>
              Cancel
            </Button>
            <Button onClick={saveTower}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TowerBody({
  tower,
  catalog,
  canEdit,
  canAdd,
  canDelete,
  onChanged,
}: {
  tower: CleaningTower;
  catalog: ReturnType<typeof fetchCleaningCatalog> extends Promise<infer T> ? T : never;
  canEdit: boolean;
  canAdd: boolean;
  canDelete: boolean;
  onChanged: () => void;
}) {
  const [floorDialog, setFloorDialog] = useState<{ open: boolean; labels: string[] }>({ open: false, labels: [""] });
  const [areaDialog, setAreaDialog] = useState<{
    open: boolean;
    floorId: string | null;
    sectionId: string | null;
    name: string;
    areaType: AreaType;
    quantity: string;
  }>(
    { open: false, floorId: null, sectionId: null, name: "", areaType: "section", quantity: "1" },
  );

  const setFloorLabel = (i: number, value: string) =>
    setFloorDialog((s) => ({ ...s, labels: s.labels.map((l, idx) => (idx === i ? value : l)) }));
  const addFloorRow = () => setFloorDialog((s) => ({ ...s, labels: [...s.labels, ""] }));
  const removeFloorRow = (i: number) => setFloorDialog((s) => ({ ...s, labels: s.labels.filter((_, idx) => idx !== i) }));

  // "Typical" floors (auto-generated, numbered) default to selected; custom-named floors like
  // Podium or Recreation - which don't follow the standard per-floor layout - default to off.
  const [checklistDialog, setChecklistDialog] = useState<{ open: boolean; selected: Set<string> }>({
    open: false,
    selected: new Set(),
  });

  const openChecklistDialog = () =>
    setChecklistDialog({
      open: true,
      selected: new Set(tower.floors.filter((f) => f.floor_number != null).map((f) => f.id)),
    });

  const toggleChecklistFloor = (id: string, checked: boolean) =>
    setChecklistDialog((s) => {
      const next = new Set(s.selected);
      if (checked) next.add(id);
      else next.delete(id);
      return { ...s, selected: next };
    });

  const applyChecklistToSelected = async () => {
    const targetFloors = tower.floors.filter((f) => checklistDialog.selected.has(f.id));
    if (targetFloors.length === 0) {
      toast.error("Select at least one floor");
      return;
    }
    try {
      // Only the sections themselves - utility rooms are added per-section afterward,
      // since each one needs to be assigned to a specific section (and its own NFC tag).
      await applyCatalogToAreas(
        tower.id,
        targetFloors.map((f) => ({ floorId: f.id, sectionId: null, existing: f.areas.filter((a) => a.area_type === "section") })),
        catalog.filter((c) => c.area_type === "section"),
      );
      toast.success(`Standard sections applied to ${targetFloors.length} floor${targetFloors.length > 1 ? "s" : ""}`);
      setChecklistDialog({ open: false, selected: new Set() });
      onChanged();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to apply sections");
    }
  };

  const addNewFloors = async () => {
    const labels = floorDialog.labels.map((l) => l.trim()).filter(Boolean);
    if (labels.length === 0) {
      toast.error("Enter at least one floor label");
      return;
    }
    try {
      await addFloors(tower.id, labels, tower.floors.length + 1);
      toast.success(labels.length > 1 ? `${labels.length} floors added` : "Floor added");
      setFloorDialog({ open: false, labels: [""] });
      onChanged();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to add floor(s)");
    }
  };

  const saveCustomArea = async () => {
    if (!areaDialog.name.trim()) {
      toast.error("Area name is required");
      return;
    }
    try {
      await addCustomArea(
        tower.id,
        areaDialog.floorId,
        areaDialog.sectionId,
        areaDialog.name.trim(),
        areaDialog.areaType,
        Math.max(1, Number(areaDialog.quantity) || 1),
      );
      toast.success("Area added");
      setAreaDialog({ open: false, floorId: null, sectionId: null, name: "", areaType: "section", quantity: "1" });
      onChanged();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to add area");
    }
  };

  return (
    <div className="space-y-4">
      <AreaBlock
        title="Tower-wide areas"
        hint="Items that span the whole tower rather than a single floor (e.g. one staircase serving every floor)."
        areas={tower.towerAreas}
        catalog={catalog}
        canEdit={canEdit}
        canAdd={canAdd}
        canDelete={canDelete}
        onApplyCatalog={async () => {
          await applyCatalogToAreas(tower.id, [{ floorId: null, sectionId: null, existing: tower.towerAreas }], catalog);
          onChanged();
        }}
        onAddCustom={() => setAreaDialog({ open: true, floorId: null, sectionId: null, name: "", areaType: "utility_room", quantity: "1" })}
        onChanged={onChanged}
      />

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium">Floors</h4>
          <div className="flex gap-2">
            {canAdd && tower.floors.length > 0 && (
              <Button size="sm" variant="outline" onClick={openChecklistDialog}>
                Apply standard sections to floors...
              </Button>
            )}
            {canAdd && (
              <Button size="sm" variant="outline" onClick={() => setFloorDialog({ open: true, labels: [""] })}>
                <Plus className="h-3 w-3 mr-1" /> Add floor
              </Button>
            )}
          </div>
        </div>
        {tower.floors.length === 0 ? (
          <p className="text-sm text-muted-foreground">No floors yet.</p>
        ) : (
          <Accordion type="multiple" className="space-y-1">
            {tower.floors.map((floor) => (
              <FloorRow
                key={floor.id}
                floor={floor}
                towerId={tower.id}
                catalog={catalog}
                canEdit={canEdit}
                canAdd={canAdd}
                canDelete={canDelete}
                onChanged={onChanged}
                onAddCustomSection={() =>
                  setAreaDialog({ open: true, floorId: floor.id, sectionId: null, name: "", areaType: "section", quantity: "1" })
                }
                onAddCustomUtility={(sectionId) =>
                  setAreaDialog({ open: true, floorId: floor.id, sectionId, name: "", areaType: "utility_room", quantity: "1" })
                }
              />
            ))}
          </Accordion>
        )}
      </div>

      <Dialog open={floorDialog.open} onOpenChange={(open) => setFloorDialog((s) => ({ ...s, open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Floors</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Floor labels</Label>
            {floorDialog.labels.map((label, i) => (
              <div key={i} className="flex items-center gap-1">
                <Input
                  autoFocus={i === floorDialog.labels.length - 1 && floorDialog.labels.length > 1}
                  value={label}
                  onChange={(e) => setFloorLabel(i, e.target.value)}
                  placeholder="Ground, Basement 1, Terrace..."
                />
                {floorDialog.labels.length > 1 && (
                  <Button size="icon" variant="ghost" title="Remove" onClick={() => removeFloorRow(i)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={addFloorRow}>
              <Plus className="h-3 w-3 mr-1" /> Add another floor
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFloorDialog({ open: false, labels: [""] })}>
              Cancel
            </Button>
            <Button onClick={addNewFloors}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={checklistDialog.open} onOpenChange={(open) => setChecklistDialog((s) => ({ ...s, open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply Standard Sections</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Adds the Left/Right/Center sections to each selected floor. Typical numbered floors are selected by
              default. Special floors like Podium or Recreation are left optional. Add utility rooms afterward,
              per section, from inside each section.
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setChecklistDialog((s) => ({ ...s, selected: new Set(tower.floors.map((f) => f.id)) }))}
              >
                Select all
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setChecklistDialog((s) => ({ ...s, selected: new Set() }))}>
                Select none
              </Button>
            </div>
            <div className="max-h-64 overflow-y-auto space-y-1 border rounded-md p-2">
              {tower.floors.map((floor) => (
                <label key={floor.id} className="flex items-center gap-2 py-1 text-sm cursor-pointer">
                  <Checkbox
                    checked={checklistDialog.selected.has(floor.id)}
                    onCheckedChange={(checked) => toggleChecklistFloor(floor.id, checked === true)}
                  />
                  {floor.label}
                  {floor.floor_number == null && <Badge variant="outline">optional</Badge>}
                </label>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChecklistDialog({ open: false, selected: new Set() })}>
              Cancel
            </Button>
            <Button onClick={applyChecklistToSelected}>Apply to {checklistDialog.selected.size} floor(s)</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={areaDialog.open} onOpenChange={(open) => setAreaDialog((s) => ({ ...s, open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {areaDialog.floorId === null ? "Add Custom Area" : areaDialog.sectionId === null ? "Add Custom Section" : "Add Custom Utility Room"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input
                value={areaDialog.name}
                onChange={(e) => setAreaDialog((s) => ({ ...s, name: e.target.value }))}
                placeholder={areaDialog.sectionId !== null ? "e.g. Generator Room" : "e.g. Left Wing"}
              />
            </div>
            {areaDialog.floorId === null && (
              <div className="space-y-1">
                <Label>Type</Label>
                <Select value={areaDialog.areaType} onValueChange={(v) => setAreaDialog((s) => ({ ...s, areaType: v as AreaType }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="section">Section</SelectItem>
                    <SelectItem value="utility_room">Utility Room</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1">
              <Label>Quantity</Label>
              <Input
                type="number"
                min={1}
                value={areaDialog.quantity}
                onChange={(e) => setAreaDialog((s) => ({ ...s, quantity: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAreaDialog((s) => ({ ...s, open: false }))}>
              Cancel
            </Button>
            <Button onClick={saveCustomArea}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FloorRow({
  floor,
  towerId,
  catalog,
  canEdit,
  canAdd,
  canDelete,
  onChanged,
  onAddCustomSection,
  onAddCustomUtility,
}: {
  floor: CleaningFloor;
  towerId: string;
  catalog: ReturnType<typeof fetchCleaningCatalog> extends Promise<infer T> ? T : never;
  canEdit: boolean;
  canAdd: boolean;
  canDelete: boolean;
  onChanged: () => void;
  onAddCustomSection: () => void;
  onAddCustomUtility: (sectionId: string | null) => void;
}) {
  const [label, setLabel] = useState(floor.label);
  const [editingLabel, setEditingLabel] = useState(false);

  const saveLabel = async () => {
    if (!label.trim()) {
      setLabel(floor.label);
      setEditingLabel(false);
      return;
    }
    try {
      await renameFloor(floor.id, label.trim());
      setEditingLabel(false);
      onChanged();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to rename floor");
    }
  };

  const removeFloor = async () => {
    try {
      await deleteFloor(floor.id);
      toast.success("Floor deleted");
      onChanged();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to delete floor");
    }
  };

  const utilityCatalog = useMemo(() => catalog.filter((c) => c.area_type === "utility_room"), [catalog]);

  const applyFloorUtilityChecklist = async () => {
    try {
      const existing = floor.areas.filter((a) => a.area_type === "utility_room" && !a.section_id);
      await applyCatalogToAreas(towerId, [{ floorId: floor.id, sectionId: null, existing }], utilityCatalog);
      onChanged();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to apply checklist");
    }
  };

  return (
    <AccordionItem value={floor.id} className="border rounded-md px-3">
      <div className="flex items-center gap-2">
        <AccordionTrigger className="flex-1">
          {editingLabel ? (
            <Input
              autoFocus
              value={label}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setLabel(e.target.value)}
              onBlur={saveLabel}
              onKeyDown={(e) => e.key === "Enter" && saveLabel()}
              className="h-7 w-40"
            />
          ) : (
            <span className="flex items-center gap-2">
              {floor.label}
              <Badge variant="outline">{floor.areas.length} areas</Badge>
            </span>
          )}
        </AccordionTrigger>
        <div className="flex items-center gap-1 pb-4">
          {canEdit && !editingLabel && (
            <Button
              size="icon"
              variant="ghost"
              title="Rename floor"
              onClick={(e) => {
                e.stopPropagation();
                setEditingLabel(true);
              }}
            >
              <Pencil className="h-4 w-4" />
            </Button>
          )}
          {canDelete && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="icon" variant="ghost" title="Delete floor" onClick={(e) => e.stopPropagation()}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete floor "{floor.label}"?</AlertDialogTitle>
                  <AlertDialogDescription>This removes all areas defined on this floor.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={removeFloor}>Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>
      <AccordionContent className="space-y-3">
        {(() => {
          const sections = floor.areas.filter((a) => a.area_type === "section");
          const unassignedUtility = floor.areas.filter((a) => a.area_type === "utility_room" && !a.section_id);
          return (
            <>
              <div className="flex items-center justify-between">
                <h5 className="text-xs font-medium text-muted-foreground uppercase">Sections</h5>
                {canAdd && (
                  <Button size="sm" variant="outline" onClick={onAddCustomSection}>
                    <Plus className="h-3 w-3 mr-1" /> Add custom section
                  </Button>
                )}
              </div>
              {sections.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No sections yet - use "Apply standard sections to floors..." above, or add a custom one.
                </p>
              ) : (
                <Accordion type="multiple" className="space-y-1">
                  {sections.map((section) => (
                    <SectionCard
                      key={section.id}
                      section={section}
                      towerId={towerId}
                      utilityRooms={floor.areas.filter((a) => a.area_type === "utility_room" && a.section_id === section.id)}
                      catalog={catalog}
                      canEdit={canEdit}
                      canAdd={canAdd}
                      canDelete={canDelete}
                      onChanged={onChanged}
                      onAddCustom={() => onAddCustomUtility(section.id)}
                    />
                  ))}
                </Accordion>
              )}

              <div className="space-y-1 pt-2">
                <div className="flex items-center justify-between">
                  <h5 className="text-xs font-medium text-muted-foreground uppercase">Floor-wide utility rooms</h5>
                  <div className="flex gap-2">
                    {canAdd && (
                      <Button size="sm" variant="outline" onClick={applyFloorUtilityChecklist}>
                        Apply standard checklist ({utilityCatalog.length})
                      </Button>
                    )}
                    {canAdd && (
                      <Button size="sm" variant="outline" onClick={() => onAddCustomUtility(null)}>
                        <Plus className="h-3 w-3 mr-1" /> Add custom
                      </Button>
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Not tied to one section - use this for a floor with no sections, or a room shared across sections
                  (e.g. one electrical room serving the whole floor). Each still gets its own NFC tag and schedule.
                  {sections.length > 0 && " You can also move one of these into a specific section below."}
                </p>
                {unassignedUtility.length === 0 ? (
                  <p className="text-sm text-muted-foreground">None yet.</p>
                ) : (
                  unassignedUtility.map((a) => (
                    <UnassignedUtilityRow
                      key={a.id}
                      area={a}
                      sections={sections}
                      canEdit={canEdit}
                      canDelete={canDelete}
                      onChanged={onChanged}
                    />
                  ))
                )}
              </div>
            </>
          );
        })()}
      </AccordionContent>
    </AccordionItem>
  );
}

function UnassignedUtilityRow({
  area,
  sections,
  canEdit,
  canDelete,
  onChanged,
}: {
  area: CleaningArea;
  sections: CleaningArea[];
  canEdit: boolean;
  canDelete: boolean;
  onChanged: () => void;
}) {
  const [name, setName] = useState(area.name);
  const [editing, setEditing] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const saveName = async () => {
    if (!name.trim()) {
      setName(area.name);
      setEditing(false);
      return;
    }
    setEditing(false);
    if (name.trim() === area.name) return;
    try {
      await updateAreaName(area.id, name.trim());
      onChanged();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to rename area");
    }
  };

  const copyToken = async () => {
    try {
      await navigator.clipboard.writeText(area.nfc_token);
      toast.success("NFC token copied");
    } catch {
      toast.error("Could not copy - copy it manually");
    }
  };

  const regenerateToken = async () => {
    setRegenerating(true);
    try {
      await regenerateAreaNfcToken(area.id);
      toast.success("NFC token regenerated - reprint this room's tag");
      onChanged();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to regenerate token");
    } finally {
      setRegenerating(false);
    }
  };

  const setQty = async (qty: number) => {
    try {
      await updateAreaQuantity(area.id, Math.max(1, qty));
      onChanged();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to update quantity");
    }
  };

  const assign = async (sectionId: string) => {
    try {
      await updateAreaSection(area.id, sectionId);
      onChanged();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to assign section");
    }
  };

  const remove = async () => {
    try {
      await deleteArea(area.id);
      onChanged();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to delete area");
    }
  };

  return (
    <div className="flex items-center justify-between gap-2 rounded border px-2 py-1">
      {editing ? (
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
          onKeyDown={(e) => e.key === "Enter" && saveName()}
          className="h-7"
        />
      ) : (
        <button
          type="button"
          disabled={!canEdit}
          className="text-sm text-left flex-1 hover:underline disabled:no-underline disabled:cursor-default"
          title={canEdit ? "Click to rename" : undefined}
          onClick={() => canEdit && setEditing(true)}
        >
          {area.name}
        </button>
      )}
      <div className="flex items-center gap-1">
        <Input
          type="number"
          min={1}
          disabled={!canEdit}
          value={area.quantity}
          onChange={(e) => setQty(Number(e.target.value) || 1)}
          className="h-7 w-16"
        />
        <Button size="icon" variant="ghost" className="h-7 w-7" title={`Copy NFC token (${area.nfc_token})`} onClick={copyToken}>
          <Copy className="h-3.5 w-3.5" />
        </Button>
        {canEdit && (
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            title="Regenerate NFC token"
            disabled={regenerating}
            onClick={regenerateToken}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        )}
        {canEdit && sections.length > 0 && (
          <Select onValueChange={assign}>
            <SelectTrigger className="h-7 w-40">
              <SelectValue placeholder="Assign to a section" />
            </SelectTrigger>
            <SelectContent>
              {sections.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {canDelete && (
          <Button size="icon" variant="ghost" className="h-7 w-7" title="Remove" onClick={remove}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

function SectionCard({
  section,
  towerId,
  utilityRooms,
  catalog,
  canEdit,
  canAdd,
  canDelete,
  onChanged,
  onAddCustom,
}: {
  section: CleaningArea;
  towerId: string;
  utilityRooms: CleaningArea[];
  catalog: ReturnType<typeof fetchCleaningCatalog> extends Promise<infer T> ? T : never;
  canEdit: boolean;
  canAdd: boolean;
  canDelete: boolean;
  onChanged: () => void;
  onAddCustom: () => void;
}) {
  const [regenerating, setRegenerating] = useState(false);
  const utilityCatalog = useMemo(() => catalog.filter((c) => c.area_type === "utility_room"), [catalog]);

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
      onChanged();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to regenerate token");
    } finally {
      setRegenerating(false);
    }
  };

  const applyUtilityChecklist = async () => {
    try {
      await applyCatalogToAreas(towerId, [{ floorId: section.floor_id, sectionId: section.id, existing: utilityRooms }], utilityCatalog);
      onChanged();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to apply checklist");
    }
  };

  const setQty = async (id: string, qty: number) => {
    try {
      await updateAreaQuantity(id, Math.max(1, qty));
      onChanged();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to update quantity");
    }
  };

  const remove = async (id: string) => {
    try {
      await deleteArea(id);
      onChanged();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to delete area");
    }
  };

  const rename = async (id: string, name: string) => {
    try {
      await updateAreaName(id, name);
      onChanged();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to rename area");
    }
  };

  const removeSection = async () => {
    try {
      await deleteArea(section.id);
      toast.success("Section deleted");
      onChanged();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to delete section");
    }
  };

  return (
    <AccordionItem value={section.id} className="border rounded-md px-3">
      <div className="flex items-center gap-2">
        <AccordionTrigger className="flex-1">
          <span className="flex items-center gap-2">
            {section.name}
            <Badge variant="outline">{utilityRooms.length} utility room{utilityRooms.length === 1 ? "" : "s"}</Badge>
          </span>
        </AccordionTrigger>
        {canDelete && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="icon" variant="ghost" className="mb-4" title="Delete section" onClick={(e) => e.stopPropagation()}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete section "{section.name}"?</AlertDialogTitle>
                <AlertDialogDescription>
                  This removes its NFC tag and unassigns (does not delete) its utility rooms.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={removeSection}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
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
        </div>

        <div className="flex flex-wrap gap-2">
          {canAdd && (
            <Button size="sm" variant="outline" onClick={applyUtilityChecklist}>
              Apply standard checklist ({utilityCatalog.length})
            </Button>
          )}
          {canAdd && (
            <Button size="sm" variant="outline" onClick={onAddCustom}>
              <Plus className="h-3 w-3 mr-1" /> Add custom
            </Button>
          )}
        </div>

        {utilityRooms.length === 0 ? (
          <p className="text-sm text-muted-foreground">No utility rooms under this section yet.</p>
        ) : (
          <div className="space-y-1">
            {utilityRooms.map((a) => (
              <AreaRow key={a.id} area={a} canEdit={canEdit} canDelete={canDelete} onQty={setQty} onRename={rename} onDelete={remove} onChanged={onChanged} />
            ))}
          </div>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}

function AreaBlock({
  title,
  hint,
  areas,
  catalog,
  canEdit,
  canAdd,
  canDelete,
  onApplyCatalog,
  onAddCustom,
  onChanged,
}: {
  title: string;
  hint?: string;
  areas: CleaningArea[];
  catalog: ReturnType<typeof fetchCleaningCatalog> extends Promise<infer T> ? T : never;
  canEdit: boolean;
  canAdd: boolean;
  canDelete: boolean;
  onApplyCatalog?: () => void;
  onAddCustom: () => void;
  onChanged: () => void;
}) {
  const sections = useMemo(() => areas.filter((a) => a.area_type === "section"), [areas]);
  const utilityRooms = useMemo(() => areas.filter((a) => a.area_type === "utility_room"), [areas]);

  const setQty = async (id: string, qty: number) => {
    try {
      await updateAreaQuantity(id, Math.max(1, qty));
      onChanged();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to update quantity");
    }
  };

  const remove = async (id: string) => {
    try {
      await deleteArea(id);
      onChanged();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to delete area");
    }
  };

  const rename = async (id: string, name: string) => {
    try {
      await updateAreaName(id, name);
      onChanged();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to rename area");
    }
  };

  return (
    <div className="space-y-3">
      {title && <h4 className="text-sm font-medium">{title}</h4>}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <div className="flex flex-wrap gap-2">
        {canAdd && onApplyCatalog && (
          <Button size="sm" variant="outline" onClick={onApplyCatalog}>
            Apply standard checklist ({catalog.length})
          </Button>
        )}
        {canAdd && (
          <Button size="sm" variant="outline" onClick={onAddCustom}>
            <Plus className="h-3 w-3 mr-1" /> Add custom
          </Button>
        )}
      </div>

      {areas.length === 0 ? (
        <p className="text-sm text-muted-foreground">No areas defined yet.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase">Sections</p>
            {sections.length === 0 && <p className="text-sm text-muted-foreground">None</p>}
            {sections.map((a) => (
              <AreaRow key={a.id} area={a} canEdit={canEdit} canDelete={canDelete} onQty={setQty} onRename={rename} onDelete={remove} onChanged={onChanged} />
            ))}
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase">Utility rooms</p>
            {utilityRooms.length === 0 && <p className="text-sm text-muted-foreground">None</p>}
            {utilityRooms.map((a) => (
              <AreaRow key={a.id} area={a} canEdit={canEdit} canDelete={canDelete} onQty={setQty} onRename={rename} onDelete={remove} onChanged={onChanged} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AreaRow({
  area,
  canEdit,
  canDelete,
  onQty,
  onRename,
  onDelete,
  onChanged,
}: {
  area: CleaningArea;
  canEdit: boolean;
  canDelete: boolean;
  onQty: (id: string, qty: number) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onChanged: () => void;
}) {
  const [name, setName] = useState(area.name);
  const [editing, setEditing] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const saveName = () => {
    if (!name.trim()) {
      setName(area.name);
      setEditing(false);
      return;
    }
    if (name.trim() !== area.name) onRename(area.id, name.trim());
    setEditing(false);
  };

  const copyToken = async () => {
    try {
      await navigator.clipboard.writeText(area.nfc_token);
      toast.success("NFC token copied");
    } catch {
      toast.error("Could not copy - copy it manually");
    }
  };

  const regenerateToken = async () => {
    setRegenerating(true);
    try {
      await regenerateAreaNfcToken(area.id);
      toast.success("NFC token regenerated - reprint this room's tag");
      onChanged();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to regenerate token");
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <div className="flex items-center justify-between gap-2 rounded border px-2 py-1">
      {editing ? (
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
          onKeyDown={(e) => e.key === "Enter" && saveName()}
          className="h-7"
        />
      ) : (
        <button
          type="button"
          disabled={!canEdit}
          className="text-sm text-left flex-1 hover:underline disabled:no-underline disabled:cursor-default"
          title={canEdit ? "Click to rename" : undefined}
          onClick={() => canEdit && setEditing(true)}
        >
          {area.name}
        </button>
      )}
      <div className="flex items-center gap-1">
        <Input
          type="number"
          min={1}
          disabled={!canEdit}
          value={area.quantity}
          onChange={(e) => onQty(area.id, Number(e.target.value) || 1)}
          className="h-7 w-16"
        />
        <Button size="icon" variant="ghost" className="h-7 w-7" title={`Copy NFC token (${area.nfc_token})`} onClick={copyToken}>
          <Copy className="h-3.5 w-3.5" />
        </Button>
        {canEdit && (
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            title="Regenerate NFC token"
            disabled={regenerating}
            onClick={regenerateToken}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        )}
        {canDelete && (
          <Button size="icon" variant="ghost" className="h-7 w-7" title="Remove" onClick={() => onDelete(area.id)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
