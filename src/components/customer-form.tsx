import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, Upload, FileText, Copy, User, Building2, Wallet, MapPin, Users, Paperclip, StickyNote } from "lucide-react";
import { cn } from "@/lib/utils";

const PAYMENT_TERMS = [
  "Immediate on Invoicing", "In 7 Days", "In 15 Days", "In 30 Days",
  "In 45 Days", "In 60 Days", "In 90 Days", "Others",
];

type ContactPerson = {
  id?: string;
  first_name: string;
  second_name: string;
  last_name: string;
  email: string;
  work_phone: string;
  mobile: string;
};

type DocItem = { id?: string; name: string; file_path: string; file?: File };

/* ---------- Zoho-style row primitives ---------- */
function Row({ label, required, children, hint, align = "center" }: { label?: string; required?: boolean; children: React.ReactNode; hint?: string; align?: "center" | "start" }) {
  return (
    <div className={cn("grid grid-cols-12 gap-4 py-2.5", align === "start" ? "items-start" : "items-center")}>
      <div className={cn("col-span-12 md:col-span-3 text-sm text-muted-foreground", align === "start" && "pt-2")}>
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </div>
      <div className="col-span-12 md:col-span-9 max-w-xl">
        {children}
        {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
      </div>
    </div>
  );
}

function Section({ icon: Icon, title, children, action }: { icon: any; title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="border-b border-border">
      <div className="flex items-center justify-between px-6 py-3 bg-muted/30">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold tracking-wide uppercase text-foreground/80">{title}</h3>
        </div>
        {action}
      </div>
      <div className="px-6 py-4 divide-y divide-border/60">{children}</div>
    </section>
  );
}

export function CustomerForm({ customerId }: { customerId?: string }) {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({
    customer_type: "Business",
    salutation: "",
    first_name: "",
    last_name: "",
    company_name: "",
    display_name: "",
    email: "",
    phone: "",
    work_phone: "",
    mobile: "",
    language: "English",
    currency: "USD",
    opening_balance: 0,
    payment_terms: "Immediate on Invoicing",
    portal_enabled: false,
    address_line: "",
    address_community: "",
    address_city: "Dubai",
    address_country: "United Arab Emirates",
    address_lat: "",
    address_lng: "",
    address_telephone: "",
    address_mobile: "",
    billing_address_line: "",
    billing_community: "",
    billing_city: "Dubai",
    billing_country: "United Arab Emirates",
    billing_lat: "",
    billing_lng: "",
    billing_telephone: "",
    billing_mobile: "",
    special_instructions: "",
  });
  const [contacts, setContacts] = useState<ContactPerson[]>([]);
  const [documents, setDocuments] = useState<DocItem[]>([]);
  const [communityOptions, setCommunityOptions] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("customers")
        .select("address_community, billing_community")
        .limit(10000);
      if (!data) return;
      const set = new Set<string>();
      for (const r of data as any[]) {
        if (r.address_community?.trim()) set.add(r.address_community.trim());
        if (r.billing_community?.trim()) set.add(r.billing_community.trim());
      }
      setCommunityOptions(Array.from(set).sort((a, b) => a.localeCompare(b)));
    })();
  }, []);

  useEffect(() => {
    if (!customerId) return;
    (async () => {
      const { data: c } = await supabase.from("customers").select("*").eq("id", customerId).maybeSingle();
      if (c) setForm({ ...c, address_lat: c.address_lat ?? "", address_lng: c.address_lng ?? "", billing_lat: c.billing_lat ?? "", billing_lng: c.billing_lng ?? "" });
      const { data: cts } = await supabase.from("customer_contacts").select("*").eq("customer_id", customerId);
      if (cts) setContacts(cts as any);
      const { data: docs } = await supabase.from("customer_documents").select("*").eq("customer_id", customerId);
      if (docs) setDocuments(docs as any);
    })();
  }, [customerId]);

  function update(k: string, v: any) { setForm((f: any) => ({ ...f, [k]: v })); }

  function updateCommunity(v: string) {
    setForm((f: any) => {
      const mirror = !f.billing_community || f.billing_community === f.address_community;
      return { ...f, address_community: v, ...(mirror ? { billing_community: v } : {}) };
    });
  }

  function copyAddressToBilling() {
    setForm((f: any) => ({
      ...f,
      billing_address_line: f.address_line,
      billing_community: f.address_community,
      billing_city: f.address_city,
      billing_country: f.address_country,
      billing_lat: f.address_lat,
      billing_lng: f.address_lng,
      billing_telephone: f.address_telephone,
      billing_mobile: f.address_mobile,
    }));
    toast.success("Address copied to billing");
  }

  function addContact() {
    setContacts([...contacts, { first_name: "", second_name: "", last_name: "", email: "", work_phone: "", mobile: "" }]);
  }
  function updateContact(i: number, k: keyof ContactPerson, v: string) {
    const next = [...contacts]; (next[i] as any)[k] = v; setContacts(next);
  }
  function removeContact(i: number) { setContacts(contacts.filter((_, idx) => idx !== i)); }

  function onFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    setDocuments((d) => [...d, ...files.map((f) => ({ name: f.name, file_path: "", file: f }))]);
    e.target.value = "";
  }
  function updateDocName(i: number, name: string) {
    const next = [...documents]; next[i] = { ...next[i], name }; setDocuments(next);
  }
  async function removeDocument(i: number) {
    const doc = documents[i];
    if (doc.id) {
      await supabase.from("customer_documents").delete().eq("id", doc.id);
      if (doc.file_path) await supabase.storage.from("customer-documents").remove([doc.file_path]);
    }
    setDocuments(documents.filter((_, idx) => idx !== i));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.display_name) { toast.error("Display Name is required"); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        opening_balance: Number(form.opening_balance) || 0,
        address_lat: form.address_lat === "" ? null : Number(form.address_lat),
        address_lng: form.address_lng === "" ? null : Number(form.address_lng),
        billing_lat: form.billing_lat === "" ? null : Number(form.billing_lat),
        billing_lng: form.billing_lng === "" ? null : Number(form.billing_lng),
      };
      let id = customerId;
      if (customerId) {
        const { error } = await supabase.from("customers").update(payload).eq("id", customerId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("customers").insert(payload).select("id").single();
        if (error) throw error;
        id = data.id;
      }

      await supabase.from("customer_contacts").delete().eq("customer_id", id!);
      if (contacts.length) {
        const rows = contacts.map((c) => {
          const { id: _omit, ...rest } = c as any;
          return { ...rest, customer_id: id! };
        });
        const { error } = await supabase.from("customer_contacts").insert(rows);
        if (error) throw error;
      }

      for (const doc of documents) {
        if (doc.file) {
          const path = `${id}/${Date.now()}-${doc.file.name}`;
          const { error: upErr } = await supabase.storage.from("customer-documents").upload(path, doc.file);
          if (upErr) throw upErr;
          const { error: insErr } = await supabase.from("customer_documents").insert({ customer_id: id!, name: doc.name, file_path: path });
          if (insErr) throw insErr;
        } else if (doc.id) {
          await supabase.from("customer_documents").update({ name: doc.name }).eq("id", doc.id);
        }
      }

      toast.success(customerId ? "Customer updated" : "Customer created");
      navigate({ to: "/customers" });
    } catch (err: any) {
      toast.error(err.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function downloadDoc(path: string) {
    const { data } = await supabase.storage.from("customer-documents").createSignedUrl(path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  }

  return (
    <div className="min-h-screen bg-muted/20">
      {/* Sticky header bar */}
      <div className="sticky top-0 z-10 bg-background border-b border-border">
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/customers" })}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-lg font-semibold">{customerId ? "Edit Customer" : "New Customer"}</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={() => navigate({ to: "/customers" })}>Cancel</Button>
            <Button form="customer-form" type="submit" disabled={saving}>
              {saving ? "Saving..." : (customerId ? "Update" : "Save")}
            </Button>
          </div>
        </div>
      </div>

      <form id="customer-form" onSubmit={handleSubmit} className="max-w-5xl mx-auto my-6 bg-background border border-border rounded-md shadow-sm">
        <Section icon={User} title="Primary Contact">
          <Row label="Customer Type">
            <RadioGroup value={form.customer_type} onValueChange={(v) => update("customer_type", v)} className="flex gap-6">
              <div className="flex items-center gap-2"><RadioGroupItem value="Business" id="t-b" /><Label htmlFor="t-b" className="font-normal">Business</Label></div>
              <div className="flex items-center gap-2"><RadioGroupItem value="Individual" id="t-i" /><Label htmlFor="t-i" className="font-normal">Individual</Label></div>
            </RadioGroup>
          </Row>
          <Row label="Primary Contact">
            <div className="grid grid-cols-3 gap-2">
              <Select value={form.salutation} onValueChange={(v) => update("salutation", v)}>
                <SelectTrigger><SelectValue placeholder="Salutation" /></SelectTrigger>
                <SelectContent>
                  {["Mr.", "Mrs.", "Ms.", "Dr.", "Miss"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input placeholder="First Name" value={form.first_name} onChange={(e) => update("first_name", e.target.value)} />
              <Input placeholder="Last Name" value={form.last_name} onChange={(e) => update("last_name", e.target.value)} />
            </div>
          </Row>
          <Row label="Company Name">
            <Input value={form.company_name} onChange={(e) => update("company_name", e.target.value)} />
          </Row>
          <Row label="Display Name" required>
            <Input required value={form.display_name} onChange={(e) => update("display_name", e.target.value)} />
          </Row>
          <Row label="Email Address">
            <Input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} />
          </Row>
          <Row label="Phone">
            <div className="grid grid-cols-3 gap-2">
              <Input placeholder="Phone" value={form.phone} onChange={(e) => update("phone", e.target.value)} />
              <Input placeholder="Work Phone" value={form.work_phone} onChange={(e) => update("work_phone", e.target.value)} />
              <Input placeholder="Mobile" value={form.mobile} onChange={(e) => update("mobile", e.target.value)} />
            </div>
          </Row>
          <Row label="Customer Language">
            <Select value={form.language} onValueChange={(v) => update("language", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["English", "Arabic", "French", "Spanish", "German", "Hindi"].map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </Row>
        </Section>

        <Section icon={Wallet} title="Other Details">
          <Row label="Currency">
            <Select value={form.currency} onValueChange={(v) => update("currency", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="AED">AED - UAE Dirham</SelectItem>
                <SelectItem value="Euro">EUR - Euro</SelectItem>
                <SelectItem value="USD">USD - US Dollar</SelectItem>
              </SelectContent>
            </Select>
          </Row>
          <Row label="Opening Balance">
            <div className="flex">
              <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-input bg-muted text-sm text-muted-foreground">{form.currency}</span>
              <Input className="rounded-l-none" type="number" step="0.01" value={form.opening_balance} onChange={(e) => update("opening_balance", e.target.value)} />
            </div>
          </Row>
          <Row label="Payment Terms">
            <Select value={form.payment_terms} onValueChange={(v) => update("payment_terms", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAYMENT_TERMS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </Row>
          <Row label="Enable Portal?">
            <div className="flex items-center gap-3">
              <Switch id="portal" checked={form.portal_enabled} onCheckedChange={(v) => update("portal_enabled", v)} />
              <Label htmlFor="portal" className="font-normal text-sm text-muted-foreground">Allow portal access for this customer</Label>
            </div>
          </Row>
        </Section>

        <Section icon={MapPin} title="Customer Address">
          <Row label="Address" align="start">
            <Textarea rows={2} value={form.address_line} onChange={(e) => update("address_line", e.target.value)} />
          </Row>
          <Row label="Community / Building">
            <Input placeholder="Community / Building" value={form.address_community} onChange={(e) => update("address_community", e.target.value)} />
          </Row>
          <Row label="City / Country">
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="City" value={form.address_city} onChange={(e) => update("address_city", e.target.value)} />
              <Input placeholder="Country" value={form.address_country} onChange={(e) => update("address_country", e.target.value)} />
            </div>
          </Row>
          <Row label="Latitude / Longitude">
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Latitude" value={form.address_lat} onChange={(e) => update("address_lat", e.target.value)} />
              <Input placeholder="Longitude" value={form.address_lng} onChange={(e) => update("address_lng", e.target.value)} />
            </div>
          </Row>
          <Row label="Telephone / Mobile">
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Telephone" value={form.address_telephone} onChange={(e) => update("address_telephone", e.target.value)}
                onFocus={(e) => { if (!e.currentTarget.value && form.phone) update("address_telephone", form.phone); }} />
              <Input placeholder="Mobile" value={form.address_mobile} onChange={(e) => update("address_mobile", e.target.value)}
                onFocus={(e) => { if (!e.currentTarget.value && form.mobile) update("address_mobile", form.mobile); }} />
            </div>
          </Row>
        </Section>

        <Section icon={Building2} title="Billing Address" action={
          <Button type="button" variant="ghost" size="sm" onClick={copyAddressToBilling}>
            <Copy className="h-3.5 w-3.5 mr-1" /> Same as customer address
          </Button>
        }>
          <Row label="Address" align="start">
            <Textarea rows={2} value={form.billing_address_line} onChange={(e) => update("billing_address_line", e.target.value)} />
          </Row>
          <Row label="Community / Building">
            <Input placeholder="Community / Building" value={form.billing_community} onChange={(e) => update("billing_community", e.target.value)} />
          </Row>
          <Row label="City / Country">
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="City" value={form.billing_city} onChange={(e) => update("billing_city", e.target.value)} />
              <Input placeholder="Country" value={form.billing_country} onChange={(e) => update("billing_country", e.target.value)} />
            </div>
          </Row>
          <Row label="Latitude / Longitude">
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Latitude" value={form.billing_lat} onChange={(e) => update("billing_lat", e.target.value)} />
              <Input placeholder="Longitude" value={form.billing_lng} onChange={(e) => update("billing_lng", e.target.value)} />
            </div>
          </Row>
          <Row label="Telephone / Mobile">
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Telephone" value={form.billing_telephone} onChange={(e) => update("billing_telephone", e.target.value)} />
              <Input placeholder="Mobile" value={form.billing_mobile} onChange={(e) => update("billing_mobile", e.target.value)} />
            </div>
          </Row>
        </Section>

        <Section icon={Users} title="Contact Persons" action={
          <Button type="button" size="sm" variant="ghost" onClick={addContact}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add Contact Person
          </Button>
        }>
          {contacts.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">No contact persons added.</div>
          ) : (
            <div className="overflow-x-auto -mx-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-y border-border bg-muted/20">
                    <th className="px-3 py-2 font-medium">First Name</th>
                    <th className="px-3 py-2 font-medium">Second Name</th>
                    <th className="px-3 py-2 font-medium">Last Name</th>
                    <th className="px-3 py-2 font-medium">Email</th>
                    <th className="px-3 py-2 font-medium">Work Phone</th>
                    <th className="px-3 py-2 font-medium">Mobile</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((c, i) => (
                    <tr key={i} className="border-b border-border/60">
                      <td className="p-1"><Input className="border-transparent shadow-none focus-visible:border-input" value={c.first_name} onChange={(e) => updateContact(i, "first_name", e.target.value)} /></td>
                      <td className="p-1"><Input className="border-transparent shadow-none focus-visible:border-input" value={c.second_name} onChange={(e) => updateContact(i, "second_name", e.target.value)} /></td>
                      <td className="p-1"><Input className="border-transparent shadow-none focus-visible:border-input" value={c.last_name} onChange={(e) => updateContact(i, "last_name", e.target.value)} /></td>
                      <td className="p-1"><Input className="border-transparent shadow-none focus-visible:border-input" type="email" value={c.email} onChange={(e) => updateContact(i, "email", e.target.value)} /></td>
                      <td className="p-1"><Input className="border-transparent shadow-none focus-visible:border-input" value={c.work_phone} onChange={(e) => updateContact(i, "work_phone", e.target.value)} /></td>
                      <td className="p-1"><Input className="border-transparent shadow-none focus-visible:border-input" value={c.mobile} onChange={(e) => updateContact(i, "mobile", e.target.value)} /></td>
                      <td className="p-1 text-right">
                        <Button type="button" size="icon" variant="ghost" onClick={() => removeContact(i)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        <Section icon={Paperclip} title="Documents">
          <Row label="Attachments" align="start">
            <div className="space-y-3">
              <Label htmlFor="file-input" className="cursor-pointer inline-flex items-center gap-2 px-3 py-2 border border-dashed rounded-md hover:bg-accent text-sm">
                <Upload className="h-4 w-4" /> Upload files
              </Label>
              <input id="file-input" type="file" multiple className="hidden" onChange={onFilePick} />
              {documents.length > 0 && (
                <div className="space-y-2">
                  {documents.map((d, i) => (
                    <div key={i} className="flex items-center gap-2 p-2 border border-border rounded-md bg-muted/20">
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <Input className="border-transparent shadow-none focus-visible:border-input bg-transparent" value={d.name} onChange={(e) => updateDocName(i, e.target.value)} placeholder="Document name" />
                      {d.file_path && (
                        <Button type="button" size="sm" variant="ghost" onClick={() => downloadDoc(d.file_path)}>View</Button>
                      )}
                      <Button type="button" size="icon" variant="ghost" onClick={() => removeDocument(i)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Row>
        </Section>

        <Section icon={StickyNote} title="Special Instructions">
          <Row label="Notes" align="start">
            <Textarea rows={3} placeholder="Any special instructions for this customer..." value={form.special_instructions} onChange={(e) => update("special_instructions", e.target.value)} />
          </Row>
        </Section>

        <div className="flex justify-end gap-2 px-6 py-4 bg-muted/20 rounded-b-md">
          <Button type="button" variant="outline" onClick={() => navigate({ to: "/customers" })}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? "Saving..." : (customerId ? "Update Customer" : "Save Customer")}</Button>
        </div>
      </form>
    </div>
  );
}
