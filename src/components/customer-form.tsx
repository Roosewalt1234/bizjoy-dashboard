import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, Upload, FileText, Copy } from "lucide-react";

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
    address_city: "",
    address_country: "",
    address_lat: "",
    address_lng: "",
    address_telephone: "",
    address_mobile: "",
    billing_address_line: "",
    billing_city: "",
    billing_country: "",
    billing_lat: "",
    billing_lng: "",
    billing_telephone: "",
    billing_mobile: "",
    special_instructions: "",
  });
  const [contacts, setContacts] = useState<ContactPerson[]>([]);
  const [documents, setDocuments] = useState<DocItem[]>([]);

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

  function copyAddressToBilling() {
    setForm((f: any) => ({
      ...f,
      billing_address_line: f.address_line,
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

      // Save contacts: replace all
      await supabase.from("customer_contacts").delete().eq("customer_id", id!);
      if (contacts.length) {
        const rows = contacts.map((c) => ({ ...c, customer_id: id!, id: undefined }));
        const { error } = await supabase.from("customer_contacts").insert(rows);
        if (error) throw error;
      }

      // Upload new documents
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
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/customers" })}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <h1 className="text-2xl font-bold">{customerId ? "Edit Customer" : "New Customer"}</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Card>
          <CardHeader><CardTitle>Basic Information</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Customer Type</Label>
              <RadioGroup value={form.customer_type} onValueChange={(v) => update("customer_type", v)} className="flex gap-6">
                <div className="flex items-center gap-2"><RadioGroupItem value="Business" id="t-b" /><Label htmlFor="t-b">Business</Label></div>
                <div className="flex items-center gap-2"><RadioGroupItem value="Individual" id="t-i" /><Label htmlFor="t-i">Individual</Label></div>
              </RadioGroup>
            </div>

            <div>
              <Label>Primary Contact</Label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2">
                <Select value={form.salutation} onValueChange={(v) => update("salutation", v)}>
                  <SelectTrigger><SelectValue placeholder="Salutation" /></SelectTrigger>
                  <SelectContent>
                    {["Mr.", "Mrs.", "Ms.", "Dr.", "Miss"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input placeholder="First Name" value={form.first_name} onChange={(e) => update("first_name", e.target.value)} />
                <Input placeholder="Last Name" value={form.last_name} onChange={(e) => update("last_name", e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div><Label>Company Name</Label><Input value={form.company_name} onChange={(e) => update("company_name", e.target.value)} /></div>
              <div><Label>Display Name *</Label><Input required value={form.display_name} onChange={(e) => update("display_name", e.target.value)} /></div>
              <div><Label>Email Address</Label><Input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} /></div>
              <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => update("phone", e.target.value)} /></div>
              <div><Label>Work Phone</Label><Input value={form.work_phone} onChange={(e) => update("work_phone", e.target.value)} /></div>
              <div><Label>Mobile</Label><Input value={form.mobile} onChange={(e) => update("mobile", e.target.value)} /></div>
              <div>
                <Label>Customer Language</Label>
                <Select value={form.language} onValueChange={(v) => update("language", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["English", "Arabic", "French", "Spanish", "German", "Hindi"].map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Financial</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <Label>Currency</Label>
                <Select value={form.currency} onValueChange={(v) => update("currency", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AED">AED</SelectItem>
                    <SelectItem value="Euro">Euro</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Opening Balance</Label><Input type="number" step="0.01" value={form.opening_balance} onChange={(e) => update("opening_balance", e.target.value)} /></div>
              <div>
                <Label>Payment Terms</Label>
                <Select value={form.payment_terms} onValueChange={(v) => update("payment_terms", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_TERMS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <Switch id="portal" checked={form.portal_enabled} onCheckedChange={(v) => update("portal_enabled", v)} />
              <Label htmlFor="portal">Allow portal access for this customer</Label>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Customer Address</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div><Label>Address</Label><Textarea rows={2} value={form.address_line} onChange={(e) => update("address_line", e.target.value)} /></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div><Label>City</Label><Input value={form.address_city} onChange={(e) => update("address_city", e.target.value)} /></div>
              <div><Label>Country</Label><Input value={form.address_country} onChange={(e) => update("address_country", e.target.value)} /></div>
              <div><Label>Latitude</Label><Input value={form.address_lat} onChange={(e) => update("address_lat", e.target.value)} /></div>
              <div><Label>Longitude</Label><Input value={form.address_lng} onChange={(e) => update("address_lng", e.target.value)} /></div>
              <div>
                <Label>Telephone</Label>
                <Input value={form.address_telephone} onChange={(e) => update("address_telephone", e.target.value)}
                  onFocus={(e) => { if (!e.currentTarget.value && form.phone) update("address_telephone", form.phone); }} />
              </div>
              <div>
                <Label>Mobile</Label>
                <Input value={form.address_mobile} onChange={(e) => update("address_mobile", e.target.value)}
                  onFocus={(e) => { if (!e.currentTarget.value && form.mobile) update("address_mobile", form.mobile); }} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Billing Address</CardTitle>
            <Button type="button" variant="outline" size="sm" onClick={copyAddressToBilling}>
              <Copy className="h-4 w-4 mr-1" /> Same as address
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            <div><Label>Address</Label><Textarea rows={2} value={form.billing_address_line} onChange={(e) => update("billing_address_line", e.target.value)} /></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div><Label>City</Label><Input value={form.billing_city} onChange={(e) => update("billing_city", e.target.value)} /></div>
              <div><Label>Country</Label><Input value={form.billing_country} onChange={(e) => update("billing_country", e.target.value)} /></div>
              <div><Label>Latitude</Label><Input value={form.billing_lat} onChange={(e) => update("billing_lat", e.target.value)} /></div>
              <div><Label>Longitude</Label><Input value={form.billing_lng} onChange={(e) => update("billing_lng", e.target.value)} /></div>
              <div><Label>Telephone</Label><Input value={form.billing_telephone} onChange={(e) => update("billing_telephone", e.target.value)} /></div>
              <div><Label>Mobile</Label><Input value={form.billing_mobile} onChange={(e) => update("billing_mobile", e.target.value)} /></div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Contact Persons</CardTitle>
            <Button type="button" size="sm" variant="outline" onClick={addContact}><Plus className="h-4 w-4 mr-1" /> Add</Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {contacts.length === 0 && <p className="text-sm text-muted-foreground">No additional contact persons.</p>}
            {contacts.map((c, i) => (
              <div key={i}>
                {i > 0 && <Separator className="mb-4" />}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Input placeholder="First name" value={c.first_name} onChange={(e) => updateContact(i, "first_name", e.target.value)} />
                  <Input placeholder="Second name" value={c.second_name} onChange={(e) => updateContact(i, "second_name", e.target.value)} />
                  <Input placeholder="Last name" value={c.last_name} onChange={(e) => updateContact(i, "last_name", e.target.value)} />
                  <Input type="email" placeholder="Email" value={c.email} onChange={(e) => updateContact(i, "email", e.target.value)} />
                  <Input placeholder="Work phone" value={c.work_phone} onChange={(e) => updateContact(i, "work_phone", e.target.value)} />
                  <Input placeholder="Mobile" value={c.mobile} onChange={(e) => updateContact(i, "mobile", e.target.value)} />
                </div>
                <div className="mt-2 flex justify-end">
                  <Button type="button" size="sm" variant="ghost" onClick={() => removeContact(i)}>
                    <Trash2 className="h-4 w-4 text-destructive" /> Remove
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Documents</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label htmlFor="file-input" className="cursor-pointer inline-flex items-center gap-2 px-3 py-2 border rounded-md hover:bg-accent">
                <Upload className="h-4 w-4" /> Upload documents
              </Label>
              <input id="file-input" type="file" multiple className="hidden" onChange={onFilePick} />
            </div>
            {documents.map((d, i) => (
              <div key={i} className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <Input value={d.name} onChange={(e) => updateDocName(i, e.target.value)} placeholder="Document name" />
                {d.file_path && (
                  <Button type="button" size="sm" variant="outline" onClick={() => downloadDoc(d.file_path)}>View</Button>
                )}
                <Button type="button" size="icon" variant="ghost" onClick={() => removeDocument(i)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Special Instructions</CardTitle></CardHeader>
          <CardContent>
            <Textarea rows={3} value={form.special_instructions} onChange={(e) => update("special_instructions", e.target.value)} />
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => navigate({ to: "/customers" })}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? "Saving..." : (customerId ? "Update Customer" : "Create Customer")}</Button>
        </div>
      </form>
    </div>
  );
}
