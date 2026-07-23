import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Search, Pencil, Trash2, GripVertical, Eye } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/sales")({
  component: SalesPage,
});

const STAGES = [
  "New Lead / Inquiry",
  "Contacted / Pitching",
  "Site Survey Scheduled",
  "Survey Report Ready",
  "Proposal / Quote Sent",
  "Negotiation",
  "Pending Decision",
  "Won & Activated",
  "Closed Lost",
  "Cancelled",
] as const;

type Stage = (typeof STAGES)[number];

const LEAD_TYPES = [
  "Villa AMC",
  "Apartment AMC",
  "FM Contract",
  "Variation Job FM",
  "Variation Job AMC",
  "One time Job",
  "Rectification work",
  "Plumbing Work",
  "AC Works",
  "Civil Works",
  "Move in Move out",
  "Snag Inspection",
] as const;

type LeadType = (typeof LEAD_TYPES)[number];

const DEFAULT_NOTES_TEXT = `Refer to the signed Service agreement for the following:
1. Scope of Work,
2. Contract Duration
3. Response time & Service availability
4. Termination clause & Suspension
5. Governing Law & Dispute Resolution
6. Exclusions:
The following are not covered under this AMC unless specified otherwise:
6.1 Damage due to mishandling, accidents, natural calamities, or unauthorized modifications.
6.2 Replacement of parts/components unless covered under the contract.`;

const DEFAULT_TERMS_TEXT = `Terms and Conditions
1. General terms:
1.1 All services shall be performed professionally and in accordance with industry standards.
1.2 Any modifications to the AMC terms must be agreed upon in writing.
2. Payment Terms:
Advance for every quarter, within 7 days from the date of invoice.
3. This quotation does not include:
3.1 Approvals or permits from regulatory authorities (if applicable).
3.2 Any items not explicitly mentioned in the scope of work.
4. Contact Information:
For Technical clarification or assistance, please contact Texan- 0554254818 or Email: info@fizfix.com`;

const STAGE_COLORS: Record<Stage, string> = {
  "New Lead / Inquiry": "bg-slate-100 text-slate-700 border-slate-300",
  "Contacted / Pitching": "bg-blue-100 text-blue-700 border-blue-300",
  "Site Survey Scheduled": "bg-cyan-100 text-cyan-700 border-cyan-300",
  "Survey Report Ready": "bg-teal-100 text-teal-700 border-teal-300",
  "Proposal / Quote Sent": "bg-indigo-100 text-indigo-700 border-indigo-300",
  Negotiation: "bg-amber-100 text-amber-700 border-amber-300",
  "Pending Decision": "bg-orange-100 text-orange-700 border-orange-300",
  "Won & Activated": "bg-emerald-100 text-emerald-700 border-emerald-300",
  "Closed Lost": "bg-rose-100 text-rose-700 border-rose-300",
  Cancelled: "bg-gray-100 text-gray-600 border-gray-300",
};

const LEAD_TYPE_COLORS: Record<LeadType, string> = {
  "Villa AMC": "bg-violet-100 text-violet-700",
  "Apartment AMC": "bg-fuchsia-100 text-fuchsia-700",
  "FM Contract": "bg-sky-100 text-sky-700",
  "Variation Job FM": "bg-lime-100 text-lime-700",
  "Variation Job AMC": "bg-pink-100 text-pink-700",
  "One time Job": "bg-amber-100 text-amber-700",
  "Rectification work": "bg-orange-100 text-orange-700",
  "Plumbing Work": "bg-cyan-100 text-cyan-700",
  "AC Works": "bg-emerald-100 text-emerald-700",
  "Civil Works": "bg-stone-100 text-stone-700",
  "Move in Move out": "bg-indigo-100 text-indigo-700",
  "Snag Inspection": "bg-rose-100 text-rose-700",
};

interface Lead {
  id: string;
  lead_name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  stage: string;
  source: string | null;
  estimated_value: number | null;
  currency: string | null;
  expected_close_date: string | null;
  salesperson: string | null;
  notes: string | null;
  lead_type: string | null;
}

interface Quote {
  id: string;
  quote_number: string | null;
  quote_date: string | null;
  expiry_date: string | null;
  customer_name: string | null;
  status: string | null;
  currency: string | null;
  total: number | null;
  subtotal: number | null;
  vat_amount: number | null;
  subject: string | null;
  salesperson: string | null;
  project_name: string | null;
  notes: string | null;
  terms: string | null;
  purchase_order: string | null;
  quote_type: string | null;
}

interface QuoteItem {
  id?: string;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
}

const VAT_RATE = 0.05;


function SalesPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Sales</h1>
        <p className="text-sm text-muted-foreground">
          Manage your sales funnel and quotations.
        </p>
      </div>
      <Tabs defaultValue="funnel" className="w-full">
        <TabsList>
          <TabsTrigger value="funnel">Sales Funnel</TabsTrigger>
          <TabsTrigger value="quotes">Quotes</TabsTrigger>
        </TabsList>
        <TabsContent value="funnel" className="mt-4">
          <FunnelBoard />
        </TabsContent>
        <TabsContent value="quotes" className="mt-4">
          <QuotesList />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ---------------- Funnel ---------------- */

function FunnelBoard() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [defaultStage, setDefaultStage] = useState<Stage>("New Lead / Inquiry");
  const [dragId, setDragId] = useState<string | null>(null);
  const [advanceOpen, setAdvanceOpen] = useState(false);
  const [advanceTarget, setAdvanceTarget] = useState<Stage>("Contacted / Pitching");

  async function load() {
    setLoading(true);
    const { data, error } = await (supabase.from as any)("sales_leads")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setLeads((data as Lead[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function moveLead(id: string, stage: Stage) {
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, stage } : l)));
    const { error } = await (supabase.from as any)("sales_leads")
      .update({ stage })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      load();
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this lead?")) return;
    const { error } = await (supabase.from as any)("sales_leads")
      .delete()
      .eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Deleted");
      load();
    }
  }

  function openNew(stage: Stage) {
    const idx = STAGES.indexOf(stage);
    if (idx > 0) {
      setAdvanceTarget(stage);
      setAdvanceOpen(true);
      return;
    }
    setEditing(null);
    setDefaultStage(stage);
    setDialogOpen(true);
  }

  function openEdit(lead: Lead) {
    setEditing(lead);
    setDialogOpen(true);
  }

  const totalsByStage = STAGES.reduce<Record<string, number>>((acc, s) => {
    acc[s] = leads
      .filter((l) => l.stage === s)
      .reduce((sum, l) => sum + (l.estimated_value ?? 0), 0);
    return acc;
  }, {});

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm text-muted-foreground">
          {leads.length} lead{leads.length === 1 ? "" : "s"} in pipeline
        </div>
        <Button onClick={() => openNew("New Lead / Inquiry")} size="sm">
          <Plus className="h-4 w-4 mr-1" /> New Lead
        </Button>
      </div>

      {loading ? (
        <div className="text-muted-foreground">Loading…</div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {STAGES.map((stage) => {
            const stageLeads = leads.filter((l) => l.stage === stage);
            return (
              <div
                key={stage}
                className="min-w-[280px] w-[280px] flex-shrink-0 bg-muted/40 rounded-lg border"
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragId) {
                    moveLead(dragId, stage);
                    setDragId(null);
                  }
                }}
              >
                <div className="p-3 border-b bg-background rounded-t-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-block w-2 h-2 rounded-full ${
                          STAGE_COLORS[stage].split(" ")[0]
                        }`}
                      />
                      <div className="font-medium text-sm">{stage}</div>
                    </div>
                    <Badge variant="secondary">{stageLeads.length}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {totalsByStage[stage].toLocaleString(undefined, {
                      maximumFractionDigits: 0,
                    })}{" "}
                    AED
                  </div>
                </div>
                <div className="p-2 space-y-2 min-h-[100px]">
                  {stageLeads.map((lead) => (
                    <div
                      key={lead.id}
                      draggable
                      onDragStart={() => setDragId(lead.id)}
                      onDragEnd={() => setDragId(null)}
                      className="bg-background border rounded-md p-3 shadow-sm hover:shadow cursor-grab active:cursor-grabbing group"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-sm truncate">
                            {lead.lead_name}
                          </div>
                          {lead.company && (
                            <div className="text-xs text-muted-foreground truncate">
                              {lead.company}
                            </div>
                          )}
                          {lead.lead_type && (
                            <span
                              className={`inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                LEAD_TYPE_COLORS[lead.lead_type as LeadType] ??
                                "bg-muted text-muted-foreground"
                              }`}
                            >
                              {lead.lead_type}
                            </span>
                          )}
                        </div>
                        <GripVertical className="h-4 w-4 text-muted-foreground/50 opacity-0 group-hover:opacity-100 flex-shrink-0" />
                      </div>
                      {lead.estimated_value != null && (
                        <div className="mt-2 text-sm font-semibold text-primary">
                          {(lead.currency ?? "AED")}{" "}
                          {Number(lead.estimated_value).toLocaleString()}
                        </div>
                      )}
                      {lead.expected_close_date && (
                        <div className="text-xs text-muted-foreground mt-1">
                          Close: {lead.expected_close_date}
                        </div>
                      )}
                      <div className="flex items-center gap-1 mt-2 pt-2 border-t opacity-0 group-hover:opacity-100 transition">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2"
                          onClick={() => openEdit(lead)}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-destructive"
                          onClick={() => remove(lead.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  <button
                    onClick={() => openNew(stage)}
                    className="w-full text-xs text-muted-foreground hover:text-foreground hover:bg-background/60 rounded-md py-2 border border-dashed"
                  >
                    + Add lead
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <LeadDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        lead={editing}
        defaultStage={defaultStage}
        onSaved={() => {
          setDialogOpen(false);
          load();
        }}
      />
      <AdvanceLeadDialog
        open={advanceOpen}
        onOpenChange={setAdvanceOpen}
        targetStage={advanceTarget}
        sourceLeads={leads.filter(
          (l) => l.stage === STAGES[STAGES.indexOf(advanceTarget) - 1],
        )}
        onAdvanced={async (id) => {
          await moveLead(id, advanceTarget);
          setAdvanceOpen(false);
        }}
      />

    </>
  );
}

function AdvanceLeadDialog({
  open,
  onOpenChange,
  targetStage,
  sourceLeads,
  onAdvanced,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  targetStage: Stage;
  sourceLeads: Lead[];
  onAdvanced: (id: string) => void | Promise<void>;
}) {
  const prevStage = STAGES[STAGES.indexOf(targetStage) - 1];
  const [q, setQ] = useState("");
  useEffect(() => {
    if (open) setQ("");
  }, [open]);
  const filtered = q
    ? sourceLeads.filter((l) =>
        [l.lead_name, l.company, l.email]
          .filter(Boolean)
          .some((v) => (v as string).toLowerCase().includes(q.toLowerCase())),
      )
    : sourceLeads;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Move lead to “{targetStage}”</DialogTitle>
        </DialogHeader>
        <div className="text-xs text-muted-foreground -mt-2">
          Showing leads currently in “{prevStage}”.
        </div>
        <Input
          placeholder="Search leads…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="max-h-80 overflow-auto rounded-md border divide-y">
          {filtered.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground text-center">
              No leads in “{prevStage}”.
            </div>
          ) : (
            filtered.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => onAdvanced(l.id)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-accent"
              >
                <div className="font-medium truncate">{l.lead_name}</div>
                {(l.company || l.lead_type) && (
                  <div className="text-xs text-muted-foreground truncate">
                    {[l.company, l.lead_type].filter(Boolean).join(" · ")}
                  </div>
                )}
              </button>
            ))
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}



function LeadDialog({
  open,
  onOpenChange,
  lead,
  defaultStage,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  lead: Lead | null;
  defaultStage: Stage;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<Partial<Lead>>({});
  const [saving, setSaving] = useState(false);
  const [customers, setCustomers] = useState<
    { id: string; display_name: string | null; company_name: string | null; email: string | null; mobile: string | null; phone: string | null }[]
  >([]);
  const [showSuggest, setShowSuggest] = useState(false);
  const [customerMode, setCustomerMode] = useState<"existing" | "new">("existing");

  useEffect(() => {
    if (open) {
      setForm(
        lead ?? {
          lead_name: "",
          company: "",
          email: "",
          phone: "",
          stage: defaultStage,
          source: "",
          currency: "AED",
          salesperson: "",
          notes: "",
          lead_type: "",
        },
      );
      (supabase.from as any)("customers")
        .select("id, display_name, company_name, email, mobile, phone")
        .order("display_name", { ascending: true })
        .range(0, 9999)
        .then(({ data }: any) => setCustomers(data ?? []));
    }
  }, [open, lead, defaultStage]);

  const query = (form.lead_name ?? "").toLowerCase();
  const suggestions = query
    ? customers.filter((c) =>
        (c.display_name ?? "").toLowerCase().includes(query) ||
        (c.company_name ?? "").toLowerCase().includes(query),
      )
    : customers;

  async function save() {
    if (!form.lead_name?.trim()) {
      toast.error("Lead name is required");
      return;
    }
    setSaving(true);
    const payload = {
      lead_name: form.lead_name,
      company: form.company || null,
      email: form.email || null,
      phone: form.phone || null,
      stage: form.stage || defaultStage,
      source: form.source || null,
      estimated_value:
        form.estimated_value != null && form.estimated_value !== ("" as any)
          ? Number(form.estimated_value)
          : null,
      currency: form.currency || "AED",
      expected_close_date: form.expected_close_date || null,
      salesperson: form.salesperson || null,
      notes: form.notes || null,
      lead_type: form.lead_type || null,
    };
    const { error } = lead
      ? await (supabase.from as any)("sales_leads")
          .update(payload)
          .eq("id", lead.id)
      : await (supabase.from as any)("sales_leads").insert(payload);
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success(lead ? "Updated" : "Created");
      onSaved();
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{lead ? "Edit Lead" : "New Lead"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Customer</Label>
            <div className="flex gap-2 items-center">
              <div className="inline-flex rounded-md border p-0.5">
                <button
                  type="button"
                  onClick={() => setCustomerMode("existing")}
                  className={`px-3 py-1 text-xs rounded-sm ${customerMode === "existing" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                >
                  Existing customer
                </button>
                <button
                  type="button"
                  onClick={() => setCustomerMode("new")}
                  className={`px-3 py-1 text-xs rounded-sm ${customerMode === "new" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                >
                  New customer
                </button>
              </div>
              {customerMode === "new" && (
                <a
                  href="/customers/new"
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-primary underline underline-offset-2"
                >
                  Register in Customers →
                </a>
              )}
            </div>
          </div>
          <div className="grid gap-1.5 relative">
            <Label>Lead name *</Label>
            <Input
              value={form.lead_name ?? ""}
              onChange={(e) => {
                setForm({ ...form, lead_name: e.target.value });
                setShowSuggest(true);
              }}
              onFocus={() => setShowSuggest(true)}
              onBlur={() => setTimeout(() => setShowSuggest(false), 150)}
              placeholder={customerMode === "existing" ? "Type to search customers…" : "Enter new customer / lead name"}
              autoComplete="off"
            />
            {customerMode === "existing" && showSuggest && suggestions.length > 0 && (
              <div className="absolute z-50 top-full left-0 right-0 mt-1 max-h-64 overflow-auto rounded-md border bg-popover shadow-md">
                {suggestions.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-accent border-b last:border-b-0"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setForm({
                        ...form,
                        lead_name: c.display_name ?? "",
                        company: c.company_name ?? form.company ?? "",
                        email: c.email ?? form.email ?? "",
                        phone: c.mobile ?? c.phone ?? form.phone ?? "",
                      });
                      setShowSuggest(false);
                    }}
                  >
                    <div className="font-medium truncate">{c.display_name}</div>
                    {c.company_name && (
                      <div className="text-xs text-muted-foreground truncate">
                        {c.company_name}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1.5">
              <Label>Company</Label>
              <Input
                value={form.company ?? ""}
                onChange={(e) => setForm({ ...form, company: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Stage</Label>
              <Select
                value={form.stage ?? defaultStage}
                onValueChange={(v) => setForm({ ...form, stage: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAGES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Type of Lead</Label>
              <Select
                value={form.lead_type ?? ""}
                onValueChange={(v) => setForm({ ...form, lead_type: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {LEAD_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Email</Label>
              <Input
                type="email"
                value={form.email ?? ""}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Phone</Label>
              <Input
                value={form.phone ?? ""}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1.5 col-span-2">
              <Label>Estimated value</Label>
              <Input
                type="number"
                value={(form.estimated_value as any) ?? ""}
                onChange={(e) =>
                  setForm({ ...form, estimated_value: e.target.value as any })
                }
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Currency</Label>
              <Select
                value={form.currency ?? "AED"}
                onValueChange={(v) => setForm({ ...form, currency: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AED">AED</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Expected close date</Label>
              <Input
                type="date"
                value={form.expected_close_date ?? ""}
                onChange={(e) =>
                  setForm({ ...form, expected_close_date: e.target.value })
                }
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Source</Label>
              <Input
                value={form.source ?? ""}
                onChange={(e) => setForm({ ...form, source: e.target.value })}
                placeholder="Referral, Website…"
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Salesperson</Label>
            <Input
              value={form.salesperson ?? ""}
              onChange={(e) =>
                setForm({ ...form, salesperson: e.target.value })
              }
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Notes</Label>
            <Textarea
              rows={3}
              value={form.notes ?? ""}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Quotes ---------------- */

const QUOTE_STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  sent: "bg-blue-100 text-blue-700",
  accepted: "bg-emerald-100 text-emerald-700",
  invoiced: "bg-indigo-100 text-indigo-700",
  rejected: "bg-rose-100 text-rose-700",
  expired: "bg-amber-100 text-amber-700",
};

function QuotesList() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [quoteDialogOpen, setQuoteDialogOpen] = useState(false);
  const [editingQuote, setEditingQuote] = useState<Quote | null>(null);
  const [viewQuote, setViewQuote] = useState<Quote | null>(null);
  const [prefill, setPrefill] = useState<Partial<Quote> | null>(null);
  const [prefillLeadId, setPrefillLeadId] = useState<string | null>(null);
  const [pickLeadOpen, setPickLeadOpen] = useState(false);


  async function load() {
    setLoading(true);
    const { data, error } = await (supabase.from as any)("quotes")
      .select(
        "id, quote_number, quote_date, expiry_date, customer_name, status, currency, total, subject, salesperson, project_name, subtotal, vat_amount, notes, terms, purchase_order, quote_type",
      )
      .order("quote_date", { ascending: false })
      .limit(1000);
    if (error) toast.error(error.message);
    else setQuotes((data as Quote[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function removeQuote(id: string) {
    if (!confirm("Delete this quote?")) return;
    const { error } = await (supabase.from as any)("quotes")
      .delete()
      .eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Deleted");
      load();
    }
  }

  const filtered = quotes.filter((q) => {
    if (status !== "all" && q.status !== status) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      q.quote_number?.toLowerCase().includes(s) ||
      q.customer_name?.toLowerCase().includes(s) ||
      q.subject?.toLowerCase().includes(s) ||
      q.project_name?.toLowerCase().includes(s) ||
      q.quote_type?.toLowerCase().includes(s)
    );
  });

  const totalValue = filtered.reduce((sum, q) => sum + (q.total ?? 0), 0);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search quote #, customer, subject…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {["draft", "sent", "accepted", "invoiced", "rejected", "expired"].map(
              (s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ),
            )}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          onClick={() => {
            setEditingQuote(null);
            setViewQuote(null);
            setPrefill(null);
            setPickLeadOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-1" /> Create Quote
        </Button>

        <div className="ml-auto text-sm text-muted-foreground">
          {filtered.length} quotes · Total{" "}
          <span className="font-semibold text-foreground">
            {totalValue.toLocaleString(undefined, {
              maximumFractionDigits: 2,
            })}
          </span>
        </div>
      </div>

      <div className="border rounded-lg bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Quote #</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="w-28 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8">
                  Loading…
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="text-center py-8 text-muted-foreground"
                >
                  No quotes found.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((q) => (
                <TableRow key={q.id}>
                  <TableCell className="font-medium">
                    {q.quote_number}
                  </TableCell>
                  <TableCell>{q.quote_date}</TableCell>
                  <TableCell>{q.customer_name}</TableCell>
                  <TableCell className="max-w-[280px] truncate">
                    {q.subject}
                  </TableCell>
                  <TableCell>
                    {q.quote_type && (
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                          LEAD_TYPE_COLORS[q.quote_type as LeadType] ??
                          "bg-muted text-muted-foreground"
                        }`}
                      >
                        {q.quote_type}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {q.status && (
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs capitalize ${
                          QUOTE_STATUS_COLORS[q.status] ??
                          "bg-muted text-muted-foreground"
                        }`}
                      >
                        {q.status}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {q.currency} {Number(q.total ?? 0).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => {
                          setEditingQuote(null);
                          setViewQuote(q);
                          setQuoteDialogOpen(true);
                        }}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => {
                          setViewQuote(null);
                          setEditingQuote(q);
                          setQuoteDialogOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive"
                        onClick={() => removeQuote(q.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <PickLeadForQuoteDialog
        open={pickLeadOpen}
        onOpenChange={setPickLeadOpen}
        onPicked={(lead) => {
          setPickLeadOpen(false);
          setPrefillLeadId(lead?.id ?? null);
          setPrefill(
            lead
              ? {
                  customer_name: lead.lead_name,
                  project_name: lead.company ?? "",
                  quote_type: lead.lead_type ?? "",
                  currency: lead.currency ?? "AED",
                  total: lead.estimated_value ?? null,
                  subtotal: lead.estimated_value ?? null,
                  salesperson: lead.salesperson ?? "",
                  subject: lead.lead_type ? `${lead.lead_type} - ${lead.lead_name}` : lead.lead_name,
                }
              : {},
          );
          setQuoteDialogOpen(true);
        }}
      />

      <QuoteDialog
        open={quoteDialogOpen}
        onOpenChange={setQuoteDialogOpen}
        quote={viewQuote ?? editingQuote}
        prefill={prefill}
        leadId={prefillLeadId}
        viewOnly={!!viewQuote}
        onSaved={() => {
          setQuoteDialogOpen(false);
          setEditingQuote(null);
          setViewQuote(null);
          setPrefill(null);
          setPrefillLeadId(null);
          load();
        }}
      />
    </div>
  );
}

function PickLeadForQuoteDialog({
  open,
  onOpenChange,
  onPicked,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  onPicked: (lead: Lead | null) => void;
}) {
  const ELIGIBLE: Stage[] = [
    "New Lead / Inquiry",
    "Contacted / Pitching",
    "Site Survey Scheduled",
    "Survey Report Ready",
  ];
  const [leads, setLeads] = useState<Lead[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQ("");
    setLoading(true);
    (supabase.from as any)("sales_leads")
      .select("*")
      .in("stage", ELIGIBLE)
      .order("created_at", { ascending: false })
      .then(({ data, error }: any) => {
        if (error) toast.error(error.message);
        else setLeads((data as Lead[]) ?? []);
        setLoading(false);
      });
  }, [open]);

  const filtered = q
    ? leads.filter((l) =>
        [l.lead_name, l.company, l.email, l.lead_type, l.stage]
          .filter(Boolean)
          .some((v) => (v as string).toLowerCase().includes(q.toLowerCase())),
      )
    : leads;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Select a lead to quote</DialogTitle>
        </DialogHeader>
        <div className="text-xs text-muted-foreground -mt-2">
          Showing leads in New Lead, Contacted, Site Survey Scheduled and Survey Report Ready.
        </div>
        <Input
          placeholder="Search leads…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="max-h-80 overflow-auto rounded-md border divide-y">
          {loading ? (
            <div className="p-4 text-sm text-muted-foreground text-center">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground text-center">
              No eligible leads found.
            </div>
          ) : (
            filtered.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => onPicked(l)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-accent"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium truncate">{l.lead_name}</div>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded border ${
                      STAGE_COLORS[l.stage as Stage] ?? ""
                    }`}
                  >
                    {l.stage}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {[l.company, l.lead_type, l.estimated_value ? `${l.currency ?? "AED"} ${Number(l.estimated_value).toLocaleString()}` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </button>
            ))
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onPicked(null)}>
            Skip — blank quote
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


function QuoteDialog({
  open,
  onOpenChange,
  quote,
  prefill,
  leadId,
  viewOnly,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  quote: Quote | null;
  prefill?: Partial<Quote> | null;
  leadId?: string | null;
  viewOnly: boolean;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<Partial<Quote>>({});
  const [saving, setSaving] = useState(false);
  const [customers, setCustomers] = useState<
    { id: string; display_name: string | null; company_name: string | null }[]
  >([]);
  const [showSuggest, setShowSuggest] = useState(false);
  const [items, setItems] = useState<QuoteItem[]>([]);

  useEffect(() => {
    if (open) {
      const base = {
        quote_number: "",
        quote_date: new Date().toISOString().split("T")[0],
        expiry_date: "",
        customer_name: "",
        status: "draft",
        currency: "AED",
        total: null as any,
        subtotal: null as any,
        vat_amount: null as any,
        subject: "",
        salesperson: "",
        project_name: "",
        notes: DEFAULT_NOTES_TEXT,
        terms: DEFAULT_TERMS_TEXT,
        purchase_order: "",
        quote_type: "",
      };
      setForm(
        quote ?? {
          ...base,
          ...(prefill ?? {}),
          notes: base.notes,
          terms: base.terms,
        },
      );
      (supabase.from as any)("customers")
        .select("id, display_name, company_name")
        .order("display_name", { ascending: true })
        .range(0, 9999)
        .then(({ data }: any) => setCustomers(data ?? []));

      if (quote?.id) {
        (supabase.from as any)("quote_items")
          .select("id, description, quantity, unit_price, amount")
          .eq("quote_id", quote.id)
          .order("sort_order", { ascending: true })
          .then(({ data }: any) =>
            setItems(
              (data ?? []).map((r: any) => ({
                id: r.id,
                description: r.description ?? "",
                quantity: Number(r.quantity ?? 0),
                unit_price: Number(r.unit_price ?? 0),
                amount: Number(r.amount ?? 0),
              })),
            ),
          );
      } else {
        setItems([{ description: "", quantity: 1, unit_price: 0, amount: 0 }]);
      }
    }

  }, [open, quote]);

  const query = (form.customer_name ?? "").toLowerCase();
  const suggestions = query
    ? customers.filter((c) =>
        (c.display_name ?? "").toLowerCase().includes(query) ||
        (c.company_name ?? "").toLowerCase().includes(query),
      )
    : customers;

  const subtotal = items.reduce((s, it) => s + (Number(it.amount) || 0), 0);
  const vat = +(subtotal * VAT_RATE).toFixed(2);
  const grandTotal = +(subtotal + vat).toFixed(2);

  function updateItem(idx: number, patch: Partial<QuoteItem>) {
    setItems((prev) => {
      const next = [...prev];
      const merged = { ...next[idx], ...patch };
      merged.amount = +(Number(merged.quantity || 0) * Number(merged.unit_price || 0)).toFixed(2);
      next[idx] = merged;
      return next;
    });
  }

  function addItem() {
    setItems((prev) => [...prev, { description: "", quantity: 1, unit_price: 0, amount: 0 }]);
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  async function save() {
    if (!form.quote_number?.trim() || !form.customer_name?.trim()) {
      toast.error("Quote number and customer name are required");
      return;
    }
    setSaving(true);
    const payload = {
      quote_number: form.quote_number,
      quote_date: form.quote_date || null,
      expiry_date: form.expiry_date || null,
      customer_name: form.customer_name,
      status: form.status || "draft",
      currency: form.currency || "AED",
      subtotal,
      vat_amount: vat,
      total: grandTotal,
      subject: form.subject || null,
      salesperson: form.salesperson || null,
      project_name: form.project_name || null,
      notes: form.notes || null,
      terms: form.terms || null,
      purchase_order: form.purchase_order || null,
      quote_type: form.quote_type || null,
    };
    let quoteId = quote?.id;
    if (quote) {
      const { error } = await (supabase.from as any)("quotes").update(payload).eq("id", quote.id);
      if (error) {
        setSaving(false);
        toast.error(error.message);
        return;
      }
    } else {
      const { data, error } = await (supabase.from as any)("quotes").insert(payload).select("id").single();
      if (error) {
        setSaving(false);
        toast.error(error.message);
        return;
      }
      quoteId = data?.id;
    }

    if (quoteId) {
      await (supabase.from as any)("quote_items").delete().eq("quote_id", quoteId);
      const rows = items
        .filter((it) => it.description.trim() || Number(it.amount) > 0)
        .map((it, i) => ({
          quote_id: quoteId,
          description: it.description,
          quantity: Number(it.quantity) || 0,
          unit_price: Number(it.unit_price) || 0,
          amount: Number(it.amount) || 0,
          sort_order: i,
        }));
      if (rows.length) {
        const { error: itemsError } = await (supabase.from as any)("quote_items").insert(rows);
        if (itemsError) {
          setSaving(false);
          toast.error(itemsError.message);
          return;
        }
      }
    }

    // When a new quote is created from a lead, advance that lead to "Proposal / Quote Sent"
    if (!quote && leadId) {
      const { error: leadErr } = await (supabase.from as any)("sales_leads")
        .update({ stage: "Proposal / Quote Sent" })
        .eq("id", leadId);
      if (leadErr) toast.error(`Quote saved, but lead update failed: ${leadErr.message}`);
      else toast.success("Lead moved to Proposal / Quote Sent");
    }

    setSaving(false);
    toast.success(quote ? "Updated" : "Created");
    onSaved();
  }


  const title = viewOnly ? "View Quote" : quote ? "Edit Quote" : "Create Quote";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="grid gap-1.5">
              <Label>Quote number *</Label>
              <Input
                readOnly={viewOnly}
                value={form.quote_number ?? ""}
                onChange={(e) => setForm({ ...form, quote_number: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Status</Label>
              <Select
                disabled={viewOnly}
                value={form.status ?? "draft"}
                onValueChange={(v) => setForm({ ...form, status: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["draft", "sent", "accepted", "invoiced", "rejected", "expired"].map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Type of Lead</Label>
              <Select
                disabled={viewOnly}
                value={form.quote_type ?? ""}
                onValueChange={(v) => setForm({ ...form, quote_type: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {LEAD_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-1.5 relative">
            <Label>Customer name *</Label>
            <Input
              readOnly={viewOnly}
              value={form.customer_name ?? ""}
              onChange={(e) => {
                setForm({ ...form, customer_name: e.target.value });
                setShowSuggest(true);
              }}
              onFocus={() => setShowSuggest(true)}
              onBlur={() => setTimeout(() => setShowSuggest(false), 150)}
              placeholder="Type to search customers…"
              autoComplete="off"
            />
            {!viewOnly && showSuggest && suggestions.length > 0 && (
              <div className="absolute z-50 top-full left-0 right-0 mt-1 max-h-64 overflow-auto rounded-md border bg-popover shadow-md">
                {suggestions.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-accent border-b last:border-b-0"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setForm({ ...form, customer_name: c.display_name ?? "" });
                      setShowSuggest(false);
                    }}
                  >
                    <div className="font-medium truncate">{c.display_name}</div>
                    {c.company_name && (
                      <div className="text-xs text-muted-foreground truncate">{c.company_name}</div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label>Quote date</Label>
              <Input
                type="date"
                readOnly={viewOnly}
                value={form.quote_date ?? ""}
                onChange={(e) => setForm({ ...form, quote_date: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Expiry date</Label>
              <Input
                type="date"
                readOnly={viewOnly}
                value={form.expiry_date ?? ""}
                onChange={(e) => setForm({ ...form, expiry_date: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label>Project name</Label>
              <Input
                readOnly={viewOnly}
                value={form.project_name ?? ""}
                onChange={(e) => setForm({ ...form, project_name: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Salesperson</Label>
              <Input
                readOnly={viewOnly}
                value={form.salesperson ?? ""}
                onChange={(e) => setForm({ ...form, salesperson: e.target.value })}
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label>Subject</Label>
            <Input
              readOnly={viewOnly}
              value={form.subject ?? ""}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
            />
          </div>

          <div className="grid gap-1.5">
            <Label>Currency</Label>
            <Select
              disabled={viewOnly}
              value={form.currency ?? "AED"}
              onValueChange={(v) => setForm({ ...form, currency: v })}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="AED">AED</SelectItem>
                <SelectItem value="USD">USD</SelectItem>
                <SelectItem value="EUR">EUR</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Items</Label>
              {!viewOnly && (
                <Button type="button" size="sm" variant="outline" onClick={addItem}>
                  + Add Item
                </Button>
              )}
            </div>
            <div className="rounded-md border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Description</th>
                    <th className="text-right px-3 py-2 font-medium w-20">Qty</th>
                    <th className="text-right px-3 py-2 font-medium w-28">Unit Price</th>
                    <th className="text-right px-3 py-2 font-medium w-28">Amount</th>
                    {!viewOnly && <th className="w-10"></th>}
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={viewOnly ? 4 : 5} className="px-3 py-4 text-center text-muted-foreground">
                        No items
                      </td>
                    </tr>
                  )}
                  {items.map((it, idx) => (
                    <tr key={idx} className="border-t">
                      <td className="px-2 py-1">
                        <Input
                          readOnly={viewOnly}
                          value={it.description}
                          onChange={(e) => updateItem(idx, { description: e.target.value })}
                          placeholder="Item description"
                          className="border-0 shadow-none focus-visible:ring-0"
                        />
                      </td>
                      <td className="px-2 py-1">
                        <Input
                          type="number"
                          readOnly={viewOnly}
                          value={it.quantity}
                          onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })}
                          className="border-0 shadow-none focus-visible:ring-0 text-right"
                        />
                      </td>
                      <td className="px-2 py-1">
                        <Input
                          type="number"
                          readOnly={viewOnly}
                          value={it.unit_price}
                          onChange={(e) => updateItem(idx, { unit_price: Number(e.target.value) })}
                          className="border-0 shadow-none focus-visible:ring-0 text-right"
                        />
                      </td>
                      <td className="px-3 py-1 text-right tabular-nums">
                        {(Number(it.amount) || 0).toFixed(2)}
                      </td>
                      {!viewOnly && (
                        <td className="px-1 py-1 text-right">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => removeItem(idx)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end">
              <div className="w-64 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="tabular-nums">{subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">VAT (5%)</span>
                  <span className="tabular-nums">{vat.toFixed(2)}</span>
                </div>
                <div className="flex justify-between border-t pt-1 font-semibold">
                  <span>Total ({form.currency ?? "AED"})</span>
                  <span className="tabular-nums">{grandTotal.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>


          <div className="grid gap-1.5">
            <Label>Terms</Label>
            <Textarea
              readOnly={viewOnly}
              rows={8}
              value={form.terms ?? ""}
              onChange={(e) => setForm({ ...form, terms: e.target.value })}
            />
          </div>

          <div className="grid gap-1.5">
            <Label>Notes</Label>
            <Textarea
              readOnly={viewOnly}
              rows={8}
              value={form.notes ?? ""}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {viewOnly ? "Close" : "Cancel"}
          </Button>
          {!viewOnly && (
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving…" : quote ? "Update" : "Create"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
