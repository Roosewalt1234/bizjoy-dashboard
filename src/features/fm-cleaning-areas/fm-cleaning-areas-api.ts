import { supabase } from "@/integrations/supabase/client";

export type AreaType = "section" | "utility_room";

export type CleaningAreaCatalogItem = {
  id: string;
  name: string;
  area_type: AreaType;
  sort_order: number;
};

export type CleaningArea = {
  id: string;
  tower_id: string;
  floor_id: string | null;
  section_id: string | null;
  catalog_id: string | null;
  area_type: AreaType;
  name: string;
  quantity: number;
  notes: string | null;
  sort_order: number;
  nfc_token: string;
};

export type CleaningFloor = {
  id: string;
  tower_id: string;
  label: string;
  floor_number: number | null;
  sort_order: number;
  areas: CleaningArea[];
};

export type CleaningTower = {
  id: string;
  contract_id: string;
  name: string;
  floor_count: number;
  sort_order: number;
  floors: CleaningFloor[];
  towerAreas: CleaningArea[]; // area rows with floor_id = null (span the whole tower)
};

export async function fetchCleaningCatalog(): Promise<CleaningAreaCatalogItem[]> {
  const { data, error } = await supabase
    .from("fm_cleaning_area_catalog")
    .select("id, name, area_type, sort_order")
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as CleaningAreaCatalogItem[];
}

export async function fetchCleaningTowers(contractId: string): Promise<CleaningTower[]> {
  const [{ data: towers, error: tErr }, { data: floors, error: fErr }, { data: areas, error: aErr }] =
    await Promise.all([
      supabase.from("fm_cleaning_towers").select("*").eq("contract_id", contractId).order("sort_order", { ascending: true }),
      supabase
        .from("fm_cleaning_floors")
        .select("*, fm_cleaning_towers!inner(contract_id)")
        .eq("fm_cleaning_towers.contract_id", contractId)
        .order("sort_order", { ascending: true }),
      supabase
        .from("fm_cleaning_areas")
        .select("*, fm_cleaning_towers!inner(contract_id)")
        .eq("fm_cleaning_towers.contract_id", contractId)
        .order("sort_order", { ascending: true }),
    ]);
  if (tErr) throw tErr;
  if (fErr) throw fErr;
  if (aErr) throw aErr;

  const toArea = (a: any): CleaningArea => ({
    id: a.id,
    tower_id: a.tower_id,
    floor_id: a.floor_id,
    section_id: a.section_id,
    catalog_id: a.catalog_id,
    area_type: a.area_type as AreaType,
    name: a.name,
    quantity: a.quantity,
    notes: a.notes,
    sort_order: a.sort_order,
    nfc_token: a.nfc_token,
  });

  return (towers ?? []).map((t: any) => {
    const towerFloors = (floors ?? []).filter((f: any) => f.tower_id === t.id);
    const towerAreaRows = ((areas ?? []) as any[]).filter((a) => a.tower_id === t.id).map(toArea);
    return {
      id: t.id,
      contract_id: t.contract_id,
      name: t.name,
      floor_count: t.floor_count,
      sort_order: t.sort_order,
      towerAreas: towerAreaRows.filter((a) => !a.floor_id),
      floors: towerFloors.map((f: any) => ({
        id: f.id,
        tower_id: f.tower_id,
        label: f.label,
        floor_number: f.floor_number,
        sort_order: f.sort_order,
        areas: towerAreaRows.filter((a) => a.floor_id === f.id),
      })),
    };
  });
}

/**
 * Creates one or more towers (namePrefix as-is when count is 1, else "namePrefix 1", "namePrefix 2"...)
 * and auto-generates each tower's floor rows (Floor 1..N). Single write path for tower creation -
 * covers both the single-tower case and bulk setup for multi-tower sites.
 */
export async function createTowersWithFloors(
  contractId: string,
  namePrefix: string,
  count: number,
  floorCount: number,
): Promise<void> {
  const towerRows = Array.from({ length: count }, (_, i) => ({
    contract_id: contractId,
    name: count > 1 ? `${namePrefix} ${i + 1}` : namePrefix,
    floor_count: floorCount,
    sort_order: i + 1,
  }));
  const { data: towers, error: tErr } = await supabase.from("fm_cleaning_towers").insert(towerRows).select("id");
  if (tErr) throw tErr;

  if (floorCount > 0 && towers) {
    const floorRows = (towers as { id: string }[]).flatMap((t) =>
      Array.from({ length: floorCount }, (_, i) => ({
        tower_id: t.id,
        label: `Floor ${i + 1}`,
        floor_number: i + 1,
        sort_order: i + 1,
      })),
    );
    const { error: fErr } = await supabase.from("fm_cleaning_floors").insert(floorRows);
    if (fErr) throw fErr;
  }
}

export async function updateTower(id: string, name: string, floorCount: number): Promise<void> {
  const { error } = await supabase.from("fm_cleaning_towers").update({ name, floor_count: floorCount }).eq("id", id);
  if (error) throw error;
}

export async function deleteTower(id: string): Promise<void> {
  const { error } = await supabase.from("fm_cleaning_towers").delete().eq("id", id);
  if (error) throw error;
}

/** Adds one or more floors to a tower in a single insert - labels are taken one per line from the modal. */
export async function addFloors(towerId: string, labels: string[], startSortOrder: number): Promise<void> {
  if (labels.length === 0) return;
  const rows = labels.map((label, i) => ({ tower_id: towerId, label, sort_order: startSortOrder + i }));
  const { error } = await supabase.from("fm_cleaning_floors").insert(rows);
  if (error) throw error;
}

export async function renameFloor(id: string, label: string): Promise<void> {
  const { error } = await supabase.from("fm_cleaning_floors").update({ label }).eq("id", id);
  if (error) throw error;
}

export async function deleteFloor(id: string): Promise<void> {
  const { error } = await supabase.from("fm_cleaning_floors").delete().eq("id", id);
  if (error) throw error;
}

/** Every section automatically gets its own Corridor utility room, with its own NFC tag. */
async function attachCorridorsToSections(sections: { id: string; floorId: string }[], towerId: string): Promise<void> {
  if (sections.length === 0) return;
  const { data: corridorCatalog, error: cErr } = await supabase
    .from("fm_cleaning_area_catalog")
    .select("id")
    .eq("name", "Corridor")
    .maybeSingle();
  if (cErr) throw cErr;
  const rows = sections.map((s) => ({
    tower_id: towerId,
    floor_id: s.floorId,
    section_id: s.id,
    catalog_id: corridorCatalog?.id ?? null,
    area_type: "utility_room" as const,
    name: "Corridor",
    quantity: 1,
  }));
  const { error } = await supabase.from("fm_cleaning_areas").insert(rows);
  if (error) throw error;
}

/**
 * Applies catalog items to one or more targets in a single insert. A target is a floor
 * (sectionId null - used for the section catalog items, or tower-wide when floorId is also
 * null), or a section (sectionId set - used for the utility-room catalog items that belong
 * under that section). Skips catalog items a target already has. Single write path for the
 * tower-wide apply, the per-section apply, and the multi-floor bulk apply dialog.
 * Any newly created section automatically gets its own Corridor utility room underneath it.
 */
export async function applyCatalogToAreas(
  towerId: string,
  targets: { floorId: string | null; sectionId: string | null; existing: CleaningArea[] }[],
  catalog: CleaningAreaCatalogItem[],
): Promise<void> {
  const rows = targets.flatMap(({ floorId, sectionId, existing }) => {
    const existingCatalogIds = new Set(existing.map((a) => a.catalog_id).filter(Boolean));
    return catalog
      .filter((c) => !existingCatalogIds.has(c.id))
      .map((c, idx) => ({
        tower_id: towerId,
        floor_id: floorId,
        section_id: sectionId,
        catalog_id: c.id,
        area_type: c.area_type,
        name: c.name,
        quantity: 1,
        sort_order: c.sort_order ?? idx,
      }));
  });
  if (rows.length === 0) return;
  const { data: inserted, error } = await supabase.from("fm_cleaning_areas").insert(rows).select("id, floor_id, area_type");
  if (error) throw error;

  const newSections = ((inserted ?? []) as { id: string; floor_id: string | null; area_type: string }[]).filter(
    (r) => r.area_type === "section" && r.floor_id,
  );
  if (newSections.length > 0) {
    await attachCorridorsToSections(newSections.map((s) => ({ id: s.id, floorId: s.floor_id as string })), towerId);
  }
}

export async function addCustomArea(
  towerId: string,
  floorId: string | null,
  sectionId: string | null,
  name: string,
  areaType: AreaType,
  quantity: number,
): Promise<void> {
  const { data, error } = await supabase
    .from("fm_cleaning_areas")
    .insert({ tower_id: towerId, floor_id: floorId, section_id: sectionId, catalog_id: null, area_type: areaType, name, quantity })
    .select("id")
    .single();
  if (error) throw error;

  if (areaType === "section" && floorId) {
    await attachCorridorsToSections([{ id: (data as { id: string }).id, floorId }], towerId);
  }
}

export async function updateAreaQuantity(id: string, quantity: number): Promise<void> {
  const { error } = await supabase.from("fm_cleaning_areas").update({ quantity }).eq("id", id);
  if (error) throw error;
}

/** Renames an area - lets each utility room get a distinct name even when several were added from the same catalog item. */
export async function updateAreaName(id: string, name: string): Promise<void> {
  const { error } = await supabase.from("fm_cleaning_areas").update({ name }).eq("id", id);
  if (error) throw error;
}

/** Assigns (or reassigns) which section a utility room belongs to. */
export async function updateAreaSection(id: string, sectionId: string | null): Promise<void> {
  const { error } = await supabase.from("fm_cleaning_areas").update({ section_id: sectionId }).eq("id", id);
  if (error) throw error;
}

export async function regenerateAreaNfcToken(id: string): Promise<string> {
  const { data, error } = await supabase
    .from("fm_cleaning_areas")
    .update({ nfc_token: crypto.randomUUID() })
    .eq("id", id)
    .select("nfc_token")
    .single();
  if (error) throw error;
  return (data as any).nfc_token as string;
}

export async function deleteArea(id: string): Promise<void> {
  const { error } = await supabase.from("fm_cleaning_areas").delete().eq("id", id);
  if (error) throw error;
}
