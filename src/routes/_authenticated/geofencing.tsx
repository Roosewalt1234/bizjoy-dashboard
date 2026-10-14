/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, LocateFixed, MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import { usePermissions } from "@/hooks/use-permissions";

export const Route = createFileRoute("/_authenticated/geofencing")({
  component: GeofencingPage,
});

const db = supabase as any;

const LOCATION_TYPES = ["Office", "Warehouse", "Shop", "Bank", "Other"] as const;
const DEFAULT_RADIUS_M = 150;

const emptyForm = {
  name: "",
  location_type: "Office" as string,
  description: "",
  latitude: "",
  longitude: "",
  radius_m: String(DEFAULT_RADIUS_M),
  active: true,
};

function GeofencingPage() {
  const qc = useQueryClient();
  const { isAdmin, isLoading: permsLoading } = usePermissions();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);

  const { data: locations = [], isLoading } = useQuery({
    queryKey: ["geofence_locations"],
    queryFn: async () => {
      const { data, error } = await db
        .from("geofence_locations")
        .select("*")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  function start(row?: any) {
    setEditing(row ?? null);
    setForm(
      row
        ? {
            name: row.name ?? "",
            location_type: row.location_type ?? "Office",
            description: row.description ?? "",
            latitude: String(row.latitude ?? ""),
            longitude: String(row.longitude ?? ""),
            radius_m: String(row.radius_m ?? DEFAULT_RADIUS_M),
            active: row.active !== false,
          }
        : emptyForm,
    );
    setOpen(true);
  }

  // Lets people paste "25.2048, 55.2708" (as copied from Google Maps) into either box.
  function onCoordinateChange(field: "latitude" | "longitude", value: string) {
    const pair = value.match(/^\s*(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (pair) {
      setForm((prev) => ({ ...prev, latitude: pair[1], longitude: pair[2] }));
      return;
    }
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      toast.error("This browser can't provide your location");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((prev) => ({
          ...prev,
          latitude: pos.coords.latitude.toFixed(6),
          longitude: pos.coords.longitude.toFixed(6),
        }));
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        toast.error(err.code === err.PERMISSION_DENIED ? "Location permission was denied" : "Could not get your location");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function save() {
    const name = form.name.trim();
    const latitude = Number(form.latitude);
    const longitude = Number(form.longitude);
    const radius = Number(form.radius_m);
    if (!name) return toast.error("Enter a location name");
    if (form.latitude.trim() === "" || !Number.isFinite(latitude) || latitude < -90 || latitude > 90)
      return toast.error("Latitude must be a number between -90 and 90");
    if (form.longitude.trim() === "" || !Number.isFinite(longitude) || longitude < -180 || longitude > 180)
      return toast.error("Longitude must be a number between -180 and 180");
    if (!Number.isInteger(radius) || radius < 20 || radius > 2000)
      return toast.error("Radius must be a whole number between 20 and 2000 metres");

    setSaving(true);
    try {
      const payload = {
        name,
        location_type: form.location_type,
        description: form.description.trim() || null,
        latitude,
        longitude,
        radius_m: radius,
        active: form.active,
      };
      const { error } = editing
        ? await db.from("geofence_locations").update(payload).eq("id", editing.id)
        : await db.from("geofence_locations").insert(payload);
      if (error) throw error;
      toast.success(editing ? "Location updated" : "Location added");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["geofence_locations"] });
    } catch (error: any) {
      toast.error(error.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(row: any, active: boolean) {
    const { error } = await db.from("geofence_locations").update({ active }).eq("id", row.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["geofence_locations"] });
  }

  async function remove(row: any) {
    const { error } = await db.from("geofence_locations").delete().eq("id", row.id);
    if (error) return toast.error(error.message);
    toast.success("Location deleted");
    qc.invalidateQueries({ queryKey: ["geofence_locations"] });
  }

  if (!permsLoading && !isAdmin) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <Card className="p-6 text-sm text-muted-foreground">Only administrators can manage geofencing.</Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Geofencing</h1>
          <p className="text-muted-foreground max-w-2xl">
            Places staff can mark attendance from without a contract, such as the office, warehouse,
            a shop or a bank. In the mobile app, staff can check in and out when they are within the
            radius of an active location.
          </p>
        </div>
        <Button onClick={() => start()}>
          <Plus className="h-4 w-4 mr-2" /> Add Location
        </Button>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Location</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Latitude</TableHead>
              <TableHead>Longitude</TableHead>
              <TableHead>Radius</TableHead>
              <TableHead>Active</TableHead>
              <TableHead className="w-28 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : locations.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  No locations yet. Add your office to let office staff mark attendance.
                </TableCell>
              </TableRow>
            ) : (
              locations.map((row: any) => (
                <TableRow key={row.id} className={row.active === false ? "opacity-60" : undefined}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-1.5">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      {row.name}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{row.location_type}</Badge>
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-muted-foreground" title={row.description ?? ""}>
                    {row.description ?? "-"}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{Number(row.latitude).toFixed(6)}</TableCell>
                  <TableCell className="font-mono text-xs">{Number(row.longitude).toFixed(6)}</TableCell>
                  <TableCell>{row.radius_m} m</TableCell>
                  <TableCell>
                    <Switch checked={row.active !== false} onCheckedChange={(v) => toggleActive(row, v)} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" asChild title="Open in Google Maps">
                        <a
                          href={`https://www.google.com/maps?q=${row.latitude},${row.longitude}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => start(row)} title="Edit">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="icon" variant="ghost" title="Delete">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete {row.name}?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Past attendance recorded here is kept, but staff will no longer be able to check in at
                              this location. To pause it instead, switch it off.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => remove(row)}>Delete</AlertDialogAction>
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
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Location" : "Add Location"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1 md:col-span-2">
              <Label>Location Name *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="e.g. Head Office, Al Quoz Warehouse"
              />
            </div>
            <div className="space-y-1">
              <Label>Type</Label>
              <Select
                value={form.location_type}
                onValueChange={(v) => setForm((prev) => ({ ...prev, location_type: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LOCATION_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Allowed radius (metres)</Label>
              <Input
                type="number"
                min={20}
                max={2000}
                value={form.radius_m}
                onChange={(e) => setForm((prev) => ({ ...prev, radius_m: e.target.value }))}
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label>Description</Label>
              <Textarea
                rows={2}
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="What is this place? e.g. Our office, supplier shop where staff collect material"
              />
            </div>
            <div className="space-y-1">
              <Label>Latitude *</Label>
              <Input
                inputMode="decimal"
                value={form.latitude}
                onChange={(e) => onCoordinateChange("latitude", e.target.value)}
                placeholder="25.204800"
              />
            </div>
            <div className="space-y-1">
              <Label>Longitude *</Label>
              <Input
                inputMode="decimal"
                value={form.longitude}
                onChange={(e) => onCoordinateChange("longitude", e.target.value)}
                placeholder="55.270800"
              />
            </div>
            <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                Tip: in Google Maps, right-click the spot and click the coordinates to copy them, then paste
                into either box.
              </p>
              <Button type="button" variant="outline" size="sm" onClick={useMyLocation} disabled={locating}>
                <LocateFixed className="h-4 w-4 mr-1.5" />
                {locating ? "Locating..." : "Use my current location"}
              </Button>
            </div>
            <div className="md:col-span-2 flex items-center gap-2">
              <Switch checked={form.active} onCheckedChange={(v) => setForm((prev) => ({ ...prev, active: v }))} />
              <Label>Active (staff can check in here)</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving..." : "Save Location"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
