import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { ChevronsUpDown, Cloud, X } from "lucide-react";
import { toast } from "sonner";

const POSITIONS = [
  "Manager","Asst Manager","Estimator","Customer Care Exec","Accounts Head","Accounts Assistant",
  "Purchase Exec","CAFM Exec","MEP Supervisor","Cleaning Supervisor","MEP Team Lead","Cleaning Team Lead",
  "Helper","Plumber","Electrician","AC Technician","Multy Technician","Mason","Tile Mason","Painter",
  "Gypsum Mason","Carpenter","Gypsum & Carpenter","Driver","Cleaner Male","Cleaner Female","Maid",
  "Handyman","Swimming Pool Technician","Life Guard","Office Boy",
];
const EMPLOYMENT_TYPES = ["Full-time","Part-time","Contract","Intern","Commission Basis","Others"];
const VISA_STATUSES = ["Visit Visa","Company Visa","NOC from other Company"];
const NATIONALITIES = ["Africa","Australia","Bangladesh","Canada","Egypt","France","Germany","India","Indonesia","Iran","Jordan","Lebanon","Malaysia","Nepal","Netherlands","Pakistan","Philippines","Russia","Sri Lanka","Syria","Thailand","United Arab Emirates","United Kingdom","United States"];

type Props = {
  initial?: any | null;
  onSaved: () => void;
  onCancel: () => void;
};

function Field({ label, children, required }: any) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}{required && " *"}</Label>
      {children}
    </div>
  );
}

const empty: any = {
  profile_photo: "", full_name: "", employee_id: "", email: "", phone: "",
  nationality: "", date_of_birth: "", current_visa_status: "", current_visa_expiry_date: "",
  notes: "", visa_issued_by: "", referred_by: "", employment_type: "", hire_date: "",
  salary: "", food_allowance: "", ot_amount: "", accommodation: "", transport: "",
  commission_rate: "", position: "", assigned_branch: "", status: "Active",
  visa_expiry_date: "", passport_number: "", passport_expiry_date: "",
  emirates_id_number: "", emirates_id_expiry_date: "", ohc_number: "", ohc_expiry_date: "",
  iloe_insurance_number: "", iloe_insurance_expiry_date: "",
  labor_card_number: "", labor_card_expiry_date: "",
  medical_insurance_number: "", medical_insurance_expiry_date: "",
  part_time_card_number: "", part_time_card_expiry_date: "",
};

export function EmployeeForm({ initial, onSaved, onCancel }: Props) {
  const [tab, setTab] = useState<"employee" | "employment" | "documents">("employee");
  const [form, setForm] = useState<any>({ ...empty, ...(initial ?? {}) });
  const [nationalityOpen, setNationalityOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  // auto-mirror current visa expiry -> visa_expiry_date if empty
  useEffect(() => {
    if (form.current_visa_expiry_date && !form.visa_expiry_date) {
      set("visa_expiry_date", form.current_visa_expiry_date);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.current_visa_expiry_date]);

  async function uploadPhoto(file: File) {
    if (!file.type.startsWith("image/")) { toast.error("Please select an image file"); return; }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("employee-images").upload(path, file);
      if (error) throw error;
      const { data } = supabase.storage.from("employee-images").getPublicUrl(path);
      set("profile_photo", data.publicUrl);
      toast.success("Photo uploaded");
    } catch (e: any) {
      toast.error(e.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function validate(which: "employee" | "employment"): boolean {
    if (which === "employee") {
      if (!form.full_name?.trim()) { toast.error("Full name is required"); setTab("employee"); return false; }
      if (!form.nationality) { toast.error("Nationality is required"); setTab("employee"); return false; }
    }
    if (which === "employment") {
      if (!form.employment_type) { toast.error("Employment type is required"); setTab("employment"); return false; }
      if (!form.position) { toast.error("Position is required"); setTab("employment"); return false; }
    }
    return true;
  }

  async function save() {
    if (!validate("employee") || !validate("employment")) return;
    setSaving(true);
    try {
      const parts = String(form.full_name).trim().split(/\s+/);
      const first_name = parts.shift() || "";
      const last_name = parts.join(" ");
      const employee_id = form.employee_id?.trim() || `EMP${Date.now().toString().slice(-6)}`;
      const num = (v: any) => (v === "" || v == null ? null : Number(v));
      const txt = (v: any) => (v === "" || v == null ? null : v);

      const payload: any = {
        employee_id,
        full_name: form.full_name.trim(),
        first_name,
        last_name,
        profile_photo: txt(form.profile_photo),
        email: txt(form.email),
        phone: txt(form.phone),
        nationality: txt(form.nationality),
        date_of_birth: txt(form.date_of_birth),
        current_visa_status: txt(form.current_visa_status),
        current_visa_expiry_date: txt(form.current_visa_expiry_date),
        notes: txt(form.notes),
        visa_issued_by: txt(form.visa_issued_by),
        referred_by: txt(form.referred_by),
        position: txt(form.position),
        department: txt(form.assigned_branch),
        assigned_branch: txt(form.assigned_branch),
        employment_type: txt(form.employment_type),
        hire_date: txt(form.hire_date),
        salary: num(form.salary),
        food_allowance: num(form.food_allowance),
        ot_amount: num(form.ot_amount),
        accommodation: num(form.accommodation),
        transport: num(form.transport),
        commission_rate: num(form.commission_rate),
        status: form.status || "Active",
        visa_expiry_date: txt(form.visa_expiry_date),
        passport_number: txt(form.passport_number),
        passport_expiry_date: txt(form.passport_expiry_date),
        emirates_id_number: txt(form.emirates_id_number),
        emirates_id_expiry_date: txt(form.emirates_id_expiry_date),
        ohc_number: txt(form.ohc_number),
        ohc_expiry_date: txt(form.ohc_expiry_date),
        iloe_insurance_number: txt(form.iloe_insurance_number),
        iloe_insurance_expiry_date: txt(form.iloe_insurance_expiry_date),
        labor_card_number: txt(form.labor_card_number),
        labor_card_expiry_date: txt(form.labor_card_expiry_date),
        medical_insurance_number: txt(form.medical_insurance_number),
        medical_insurance_expiry_date: txt(form.medical_insurance_expiry_date),
        part_time_card_number: txt(form.part_time_card_number),
        part_time_card_expiry_date: txt(form.part_time_card_expiry_date),
      };

      if (initial?.id) {
        const { error } = await supabase.from("employees").update(payload).eq("id", initial.id);
        if (error) throw error;
        toast.success("Employee updated");
      } else {
        const { error } = await supabase.from("employees").insert(payload);
        if (error) throw error;
        toast.success("Employee added");
      }
      onSaved();
    } catch (e: any) {
      toast.error(e.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="employee">Employee Details</TabsTrigger>
          <TabsTrigger value="employment">Employment Details</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>

        {/* EMPLOYEE */}
        <TabsContent value="employee" className="space-y-4 pt-4">
          <Field label="Full Name" required>
            <Input value={form.full_name} onChange={(e) => set("full_name", e.target.value)} placeholder="Enter full name" />
          </Field>

          <Field label="Profile Photo">
            <div className="flex items-center gap-4">
              {form.profile_photo ? (
                <div className="relative">
                  <img src={form.profile_photo} alt="Profile" className="h-20 w-20 rounded-full object-cover border" />
                  <button type="button" onClick={() => set("profile_photo", "")} className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-0.5">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <div
                  className="flex-1 border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition"
                  onClick={() => {
                    const inp = document.createElement("input");
                    inp.type = "file"; inp.accept = "image/*";
                    inp.onchange = (e: any) => { const f = e.target.files?.[0]; if (f) uploadPhoto(f); };
                    inp.click();
                  }}
                  onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("border-primary","bg-accent"); }}
                  onDragLeave={(e) => { e.preventDefault(); e.currentTarget.classList.remove("border-primary","bg-accent"); }}
                  onDrop={(e) => {
                    e.preventDefault(); e.currentTarget.classList.remove("border-primary","bg-accent");
                    const f = e.dataTransfer.files?.[0]; if (f) uploadPhoto(f);
                  }}
                >
                  <Cloud className="h-10 w-10 text-primary mx-auto mb-2" />
                  <div className="text-sm"><span className="font-medium text-primary">Choose files to Upload</span></div>
                  <p className="text-xs text-muted-foreground">or drag and drop them here</p>
                </div>
              )}
              {uploading && <span className="text-sm text-muted-foreground">Uploading...</span>}
            </div>
          </Field>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Employee ID (optional)">
              <Input value={form.employee_id} onChange={(e) => set("employee_id", e.target.value)} placeholder="Auto-generated if empty" />
            </Field>
            <Field label="Email">
              <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="name@example.com" />
            </Field>
            <Field label="Phone">
              <Input inputMode="numeric" maxLength={10} value={form.phone}
                onChange={(e) => set("phone", e.target.value.replace(/\D/g, "").slice(0, 10))}
                placeholder="10 digits" />
            </Field>
            <Field label="Nationality" required>
              <Popover open={nationalityOpen} onOpenChange={setNationalityOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                    {form.nationality || "Select nationality..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search nationality..." onValueChange={(s) => { if (s && !NATIONALITIES.includes(s)) set("nationality", s); }} />
                    <CommandList>
                      <CommandEmpty>No match. Type to use a custom value.</CommandEmpty>
                      <CommandGroup>
                        {NATIONALITIES.map((n) => (
                          <CommandItem key={n} onSelect={() => { set("nationality", n); setNationalityOpen(false); }}>{n}</CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </Field>
            <Field label="Date of Birth">
              <Input type="date" value={form.date_of_birth} onChange={(e) => set("date_of_birth", e.target.value)} />
            </Field>
            <Field label="Current Visa Status">
              <Select value={form.current_visa_status || undefined} onValueChange={(v) => set("current_visa_status", v)}>
                <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>{VISA_STATUSES.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Current Visa Expiry Date">
              <Input type="date" value={form.current_visa_expiry_date} onChange={(e) => set("current_visa_expiry_date", e.target.value)} />
            </Field>
            <Field label="Status">
              <Select value={form.status || "Active"} onValueChange={(v) => set("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="On Leave">On Leave</SelectItem>
                  <SelectItem value="Terminated">Terminated</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field label="Notes">
            <Textarea rows={3} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </Field>
        </TabsContent>

        {/* EMPLOYMENT */}
        <TabsContent value="employment" className="space-y-4 pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Referred By">
              <Input value={form.referred_by} onChange={(e) => set("referred_by", e.target.value)} />
            </Field>
            <Field label="Employment Type" required>
              <Select value={form.employment_type || undefined} onValueChange={(v) => set("employment_type", v)}>
                <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>{EMPLOYMENT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Hire Date">
              <Input type="date" value={form.hire_date} onChange={(e) => set("hire_date", e.target.value)} />
            </Field>
            <Field label="Position" required>
              <Select value={form.position || undefined} onValueChange={(v) => set("position", v)}>
                <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent className="max-h-72">{POSITIONS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Assigned Branch / Department">
              <Input value={form.assigned_branch} onChange={(e) => set("assigned_branch", e.target.value)} />
            </Field>
            <Field label="Salary">
              <Input type="number" step="0.01" value={form.salary} onChange={(e) => set("salary", e.target.value)} />
            </Field>
            <Field label="Food Allowance">
              <Input type="number" step="0.01" value={form.food_allowance} onChange={(e) => set("food_allowance", e.target.value)} />
            </Field>
            <Field label="OT Amount">
              <Input type="number" step="0.01" value={form.ot_amount} onChange={(e) => set("ot_amount", e.target.value)} />
            </Field>
            <Field label="Accommodation">
              <Input type="number" step="0.01" value={form.accommodation} onChange={(e) => set("accommodation", e.target.value)} />
            </Field>
            <Field label="Transport">
              <Input type="number" step="0.01" value={form.transport} onChange={(e) => set("transport", e.target.value)} />
            </Field>
            <Field label="Commission Rate (%)">
              <Input type="number" step="0.01" value={form.commission_rate} onChange={(e) => set("commission_rate", e.target.value)} />
            </Field>
          </div>
        </TabsContent>

        {/* DOCUMENTS */}
        <TabsContent value="documents" className="space-y-4 pt-4">
          <Field label="Visa Issued By">
            <Input value={form.visa_issued_by} onChange={(e) => set("visa_issued_by", e.target.value)} />
          </Field>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              ["visa_expiry_date", "Visa Expiry Date", "date"],
              ["passport_number", "Passport Number", "text"],
              ["passport_expiry_date", "Passport Expiry Date", "date"],
              ["emirates_id_number", "Emirates ID Number", "text"],
              ["emirates_id_expiry_date", "Emirates ID Expiry Date", "date"],
              ["ohc_number", "OHC Number", "text"],
              ["ohc_expiry_date", "OHC Expiry Date", "date"],
              ["iloe_insurance_number", "ILOE Insurance Number", "text"],
              ["iloe_insurance_expiry_date", "ILOE Insurance Expiry Date", "date"],
              ["labor_card_number", "Labor Card Number", "text"],
              ["labor_card_expiry_date", "Labor Card Expiry Date", "date"],
              ["medical_insurance_number", "Medical Insurance Number", "text"],
              ["medical_insurance_expiry_date", "Medical Insurance Expiry Date", "date"],
              ["part_time_card_number", "Part-time Card Number", "text"],
              ["part_time_card_expiry_date", "Part-time Card Expiry Date", "date"],
            ].map(([key, label, type]) => (
              <Field key={key} label={label}>
                <Input type={type} value={form[key] ?? ""} onChange={(e) => set(key, e.target.value)} />
              </Field>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <div className="flex items-center justify-between pt-4 border-t">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <div className="flex gap-2">
          {tab !== "employee" && (
            <Button type="button" variant="outline" onClick={() => setTab(tab === "documents" ? "employment" : "employee")}>Previous</Button>
          )}
          {tab !== "documents" ? (
            <Button type="button" onClick={() => {
              if (tab === "employee" && !validate("employee")) return;
              if (tab === "employment" && !validate("employment")) return;
              setTab(tab === "employee" ? "employment" : "documents");
            }}>Next</Button>
          ) : (
            <Button type="button" onClick={save} disabled={saving}>{saving ? "Saving..." : (initial?.id ? "Update Employee" : "Save Employee")}</Button>
          )}
        </div>
      </div>
    </div>
  );
}
