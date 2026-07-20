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
  subject: string | null;
  salesperson: string | null;
  project_name: string | null;
  notes: string | null;
  terms: string | null;
  purchase_order: string | null;
  quote_type: string | null;
}

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
    </>
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
        },
      );
      (supabase.from as any)("customers")
        .select("id, display_name, company_name, email, mobile, phone")
        .order("display_name", { ascending: true })
        .then(({ data }: any) => setCustomers(data ?? []));
    }
  }, [open, lead, defaultStage]);

  const query = (form.lead_name ?? "").toLowerCase();
  const suggestions = query
    ? customers
        .filter((c) => (c.display_name ?? "").toLowerCase().includes(query))
        .slice(0, 8)
    : customers.slice(0, 8);

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
              placeholder="Type to search customers…"
              autoComplete="off"
            />
            {showSuggest && suggestions.length > 0 && (
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
          <div className="grid grid-cols-2 gap-3">
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

  async function load() {
    setLoading(true);
    const { data, error } = await (supabase.from as any)("quotes")
      .select(
        "id, quote_number, quote_date, expiry_date, customer_name, status, currency, total, subject, salesperson, project_name, subtotal, notes, terms, purchase_order",
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
      q.project_name?.toLowerCase().includes(s)
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
            setQuoteDialogOpen(true);
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
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="w-28 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  Loading…
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
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

      <QuoteDialog
        open={quoteDialogOpen}
        onOpenChange={setQuoteDialogOpen}
        quote={viewQuote ?? editingQuote}
        viewOnly={!!viewQuote}
        onSaved={() => {
          setQuoteDialogOpen(false);
          setEditingQuote(null);
          setViewQuote(null);
          load();
        }}
      />
    </div>
  );
}

function QuoteDialog({
  open,
  onOpenChange,
  quote,
  viewOnly,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  quote: Quote | null;
  viewOnly: boolean;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<Partial<Quote>>({});
  const [saving, setSaving] = useState(false);
  const [customers, setCustomers] = useState<
    { id: string; display_name: string | null; company_name: string | null }[]
  >([]);
  const [showSuggest, setShowSuggest] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(
        quote ?? {
          quote_number: "",
          quote_date: new Date().toISOString().split("T")[0],
          expiry_date: "",
          customer_name: "",
          status: "draft",
          currency: "AED",
          total: null as any,
          subtotal: null as any,
          subject: "",
          salesperson: "",
          project_name: "",
          notes: "",
          terms: "",
          purchase_order: "",
        },
      );
      (supabase.from as any)("customers")
        .select("id, display_name, company_name")
        .order("display_name", { ascending: true })
        .then(({ data }: any) => setCustomers(data ?? []));
    }
  }, [open, quote]);

  const query = (form.customer_name ?? "").toLowerCase();
  const suggestions = query
    ? customers
        .filter((c) => (c.display_name ?? "").toLowerCase().includes(query))
        .slice(0, 8)
    : customers.slice(0, 8);

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
      total: form.total != null && form.total !== ("" as any) ? Number(form.total) : null,
      subtotal: form.subtotal != null && form.subtotal !== ("" as any) ? Number(form.subtotal) : null,
      subject: form.subject || null,
      salesperson: form.salesperson || null,
      project_name: form.project_name || null,
      notes: form.notes || null,
      terms: form.terms || null,
      purchase_order: form.purchase_order || null,
    };
    const { error } = quote
      ? await (supabase.from as any)("quotes").update(payload).eq("id", quote.id)
      : await (supabase.from as any)("quotes").insert(payload);
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success(quote ? "Updated" : "Created");
      onSaved();
    }
  }

  const title = viewOnly ? "View Quote" : quote ? "Edit Quote" : "Create Quote";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-4">
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

          <div className="grid grid-cols-3 gap-4">
            <div className="grid gap-1.5">
              <Label>Subtotal</Label>
              <Input
                type="number"
                readOnly={viewOnly}
                value={(form.subtotal as any) ?? ""}
                onChange={(e) => setForm({ ...form, subtotal: e.target.value as any })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Total</Label>
              <Input
                type="number"
                readOnly={viewOnly}
                value={(form.total as any) ?? ""}
                onChange={(e) => setForm({ ...form, total: e.target.value as any })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Currency</Label>
              <Select
                disabled={viewOnly}
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

          <div className="grid gap-1.5">
            <Label>Terms</Label>
            <Textarea
              readOnly={viewOnly}
              rows={2}
              value={form.terms ?? ""}
              onChange={(e) => setForm({ ...form, terms: e.target.value })}
            />
          </div>

          <div className="grid gap-1.5">
            <Label>Notes</Label>
            <Textarea
              readOnly={viewOnly}
              rows={2}
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
