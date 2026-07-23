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
import { Plus, Search, Pencil, Trash2, Eye, MoreHorizontal, MessageSquare, ArrowRightCircle, BarChart3, Percent } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { PaginationBar, PAGE_SIZE, paginate } from "@/components/pagination-bar";

export const Route = createFileRoute("/_authenticated/sales")({
  component: SalesPage,
});

const STAGES = [
  "New Lead / Inquiry",
  "Contacted / Pitching",
  "Site Survey Scheduled",
  "Survey Report Ready",
  "Pending Quotation",
  "Proposal / Quote Sent",
  "Negotiation",
  "Pending Decision",
  "Validity Expired",
  "Won & Activated",
  "Invoiced",
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
  "Pending Quotation": "bg-yellow-100 text-yellow-700 border-yellow-300",
  "Proposal / Quote Sent": "bg-indigo-100 text-indigo-700 border-indigo-300",
  Negotiation: "bg-amber-100 text-amber-700 border-amber-300",
  "Pending Decision": "bg-orange-100 text-orange-700 border-orange-300",
  "Validity Expired": "bg-red-100 text-red-700 border-red-300",
  Invoiced: "bg-green-100 text-green-700 border-green-300",
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
  probability: string | null;
}

const PROBABILITY_LEVELS = ["Low", "Medium", "High", "Very High", "Assured"] as const;
type Probability = (typeof PROBABILITY_LEVELS)[number];

const PROBABILITY_COLORS: Record<Probability, string> = {
  Low: "bg-slate-100 text-slate-700 border-slate-300",
  Medium: "bg-blue-100 text-blue-700 border-blue-300",
  High: "bg-amber-100 text-amber-700 border-amber-300",
  "Very High": "bg-orange-100 text-orange-700 border-orange-300",
  Assured: "bg-emerald-100 text-emerald-700 border-emerald-300",
};

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

const QUOTE_STATUS_TO_STAGE: Record<string, Stage> = {
  draft: "Pending Quotation",
  sent: "Proposal / Quote Sent",
  expired: "Validity Expired",
  invoiced: "Invoiced",
  rejected: "Closed Lost",
  accepted: "Won & Activated",
};

const PERIOD_OPTIONS = [
  { value: "all", label: "All Time" },
  { value: "this-month", label: "This Month" },
  { value: "last-month", label: "Last Month" },
  { value: "last-3-months", label: "Last 3 Months" },
  { value: "last-6-months", label: "Last 6 Months" },
  { value: "this-year", label: "This Year" },
  { value: "last-year", label: "Last Year" },
] as const;

function getPeriodBounds(period: string): { start: Date; end: Date } | null {
  if (period === "all") return null;
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  if (period === "this-month") return { start: new Date(y, m, 1), end: new Date(y, m + 1, 1) };
  if (period === "last-month") return { start: new Date(y, m - 1, 1), end: new Date(y, m, 1) };
  if (period === "last-3-months") return { start: new Date(y, m - 2, 1), end: new Date(y, m + 1, 1) };
  if (period === "last-6-months") return { start: new Date(y, m - 5, 1), end: new Date(y, m + 1, 1) };
  if (period === "this-year") return { start: new Date(y, 0, 1), end: new Date(y + 1, 0, 1) };
  if (period === "last-year") return { start: new Date(y - 1, 0, 1), end: new Date(y, 0, 1) };
  return null;
}

function FunnelBoard() {
  const [leads, setLeads] = useState<(Lead & { created_at?: string })[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [defaultStage, setDefaultStage] = useState<Stage>("New Lead / Inquiry");
  const [advanceOpen, setAdvanceOpen] = useState(false);
  const [advanceTarget, setAdvanceTarget] = useState<Stage>("Contacted / Pitching");
  const [selectedStage, setSelectedStage] = useState<Stage>("New Lead / Inquiry");
  const [period, setPeriod] = useState<string>("this-month");
  const [stagePage, setStagePage] = useState(1);
  useEffect(() => { setStagePage(1); }, [selectedStage, period]);

  async function load() {
    setLoading(true);
    const [leadsRes, quotesRes] = await Promise.all([
      (supabase.from as any)("sales_leads").select("*").order("created_at", { ascending: false }),
      (supabase.from as any)("quotes").select("*").order("quote_date", { ascending: false }),
    ]);
    if (leadsRes.error) toast.error(leadsRes.error.message);
    else setLeads((leadsRes.data as any[]) ?? []);
    if (quotesRes.error) toast.error(quotesRes.error.message);
    else setQuotes((quotesRes.data as Quote[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function moveLead(id: string, stage: Stage) {
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, stage } : l)));
    const { error } = await (supabase.from as any)("sales_leads").update({ stage }).eq("id", id);
    if (error) {
      toast.error(error.message);
      load();
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this lead?")) return;
    const { error } = await (supabase.from as any)("sales_leads").delete().eq("id", id);
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

  const bounds = getPeriodBounds(period);
  const inRange = (dateStr: string | null | undefined) => {
    if (!bounds) return true;
    if (!dateStr) return false;
    const d = new Date(dateStr);
    return d >= bounds.start && d < bounds.end;
  };

  const filteredLeads = leads.filter((l) => inRange((l as any).created_at));
  const filteredQuotes = quotes.filter((q) => inRange(q.quote_date));

  const leadsByStage = STAGES.reduce<Record<string, Lead[]>>((acc, s) => {
    acc[s] = filteredLeads.filter((l) => l.stage === s);
    return acc;
  }, {});
  const quotesByStage = STAGES.reduce<Record<string, Quote[]>>((acc, s) => {
    acc[s] = filteredQuotes.filter((q) => {
      const raw = (q.status ?? "").toLowerCase();
      const mapped = QUOTE_STATUS_TO_STAGE[raw] ?? q.status;
      return mapped === s;
    });
    return acc;
  }, {});

  const totalsByStage = STAGES.reduce<Record<string, number>>((acc, s) => {
    const leadTotal = leadsByStage[s].reduce((sum, l) => sum + (l.estimated_value ?? 0), 0);
    const quoteTotal = quotesByStage[s].reduce((sum, q) => sum + (Number(q.total) || 0), 0);
    acc[s] = leadTotal + quoteTotal;
    return acc;
  }, {});
  const countsByStage = STAGES.reduce<Record<string, number>>((acc, s) => {
    acc[s] = leadsByStage[s].length + quotesByStage[s].length;
    return acc;
  }, {});

  const selectedLeads = leadsByStage[selectedStage] ?? [];
  const selectedQuotes = quotesByStage[selectedStage] ?? [];
  const stageTotal = selectedLeads.length + selectedQuotes.length;
  const stageStart = (stagePage - 1) * PAGE_SIZE;
  const stageEnd = stageStart + PAGE_SIZE;
  const leadSlice = selectedLeads.slice(Math.min(stageStart, selectedLeads.length), Math.min(stageEnd, selectedLeads.length));
  const qOffset = Math.max(0, stageStart - selectedLeads.length);
  const qEnd = Math.max(0, stageEnd - selectedLeads.length);
  const quoteSlice = selectedQuotes.slice(qOffset, qEnd);

  return (
    <>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Label className="text-sm">Period</Label>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[180px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIOD_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="text-sm text-muted-foreground">
            {filteredLeads.length} lead{filteredLeads.length === 1 ? "" : "s"} ·{" "}
            {filteredQuotes.length} quote{filteredQuotes.length === 1 ? "" : "s"}
          </div>
        </div>
        <Button onClick={() => openNew("New Lead / Inquiry")} size="sm">
          <Plus className="h-4 w-4 mr-1" /> New Lead
        </Button>
      </div>

      {loading ? (
        <div className="text-muted-foreground">Loading…</div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7 gap-2 mb-6">
            {STAGES.map((stage) => {
              const active = selectedStage === stage;
              const dotColor = STAGE_COLORS[stage].split(" ")[0];
              return (
                <button
                  key={stage}
                  type="button"
                  onClick={() => setSelectedStage(stage)}
                  className={`text-left rounded-lg border p-3 transition hover:shadow-sm ${
                    active
                      ? "border-primary ring-2 ring-primary/30 bg-background"
                      : "bg-background hover:border-primary/50"
                  }`}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${dotColor}`} />
                    <div className="text-[11px] font-medium text-muted-foreground truncate">
                      {stage}
                    </div>
                  </div>
                  <div className="mt-1.5 text-2xl font-bold leading-none">
                    {countsByStage[stage]}
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    AED {totalsByStage[stage].toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="rounded-lg border bg-background">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div className="flex items-center gap-2">
                <span className={`inline-block w-2.5 h-2.5 rounded-full ${STAGE_COLORS[selectedStage].split(" ")[0]}`} />
                <h3 className="font-semibold text-sm">{selectedStage}</h3>
                <Badge variant="secondary">{countsByStage[selectedStage]}</Badge>
              </div>
              <div className="text-sm text-muted-foreground">
                Total: AED {totalsByStage[selectedStage].toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </div>
            </div>
            {selectedLeads.length === 0 && selectedQuotes.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                No records in this stage for the selected period.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[90px]">Type</TableHead>
                    <TableHead>Name / Quote #</TableHead>
                    <TableHead>Company / Customer</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead className="w-[110px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedLeads.map((lead) => (
                    <TableRow key={`l-${lead.id}`}>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">LEAD</Badge>
                      </TableCell>
                      <TableCell className="font-medium">{lead.lead_name}</TableCell>
                      <TableCell className="text-muted-foreground">{lead.company ?? "—"}</TableCell>
                      <TableCell>
                        {lead.lead_type ? (
                          <span
                            className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              LEAD_TYPE_COLORS[lead.lead_type as LeadType] ??
                              "bg-muted text-muted-foreground"
                            }`}
                          >
                            {lead.lead_type}
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {(lead as any).created_at
                          ? new Date((lead as any).created_at).toLocaleDateString()
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {lead.estimated_value != null
                          ? `${lead.currency ?? "AED"} ${Number(lead.estimated_value).toLocaleString()}`
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => openEdit(lead)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-destructive"
                          onClick={() => remove(lead.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {selectedQuotes.map((q) => (
                    <TableRow key={`q-${q.id}`}>
                      <TableCell>
                        <Badge className="text-[10px] bg-indigo-100 text-indigo-700 hover:bg-indigo-100">
                          QUOTE
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">{q.quote_number ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{q.customer_name ?? "—"}</TableCell>
                      <TableCell>
                        {q.quote_type ? (
                          <span
                            className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              LEAD_TYPE_COLORS[q.quote_type as LeadType] ??
                              "bg-muted text-muted-foreground"
                            }`}
                          >
                            {q.quote_type}
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {q.quote_date ? new Date(q.quote_date).toLocaleDateString() : "—"}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {q.total != null
                          ? `${q.currency ?? "AED"} ${Number(q.total).toLocaleString()}`
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        —
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </>
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
      setCustomerMode("existing");
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
  const [followupQuote, setFollowupQuote] = useState<Quote | null>(null);
  const [followupText, setFollowupText] = useState("");
  const [followupList, setFollowupList] = useState<Array<{ id: string; remark: string; user_name: string | null; created_at: string }>>([]);
  const [followupLoading, setFollowupLoading] = useState(false);
  const [statusQuote, setStatusQuote] = useState<Quote | null>(null);
  const [statusValue, setStatusValue] = useState<string>("Pending Quotation");
  const [statusRemarks, setStatusRemarks] = useState<string>("");
  const [analyseQuote, setAnalyseQuote] = useState<Quote | null>(null);
  const [probabilityQuote, setProbabilityQuote] = useState<Quote | null>(null);
  const [probabilityValue, setProbabilityValue] = useState<string>("Medium");

  useEffect(() => {
    if (probabilityQuote) {
      setProbabilityValue((probabilityQuote.probability as string) ?? "Medium");
    }
  }, [probabilityQuote]);

  async function saveProbability() {
    if (!probabilityQuote) return;
    const { error } = await (supabase.from as any)("quotes")
      .update({ probability: probabilityValue })
      .eq("id", probabilityQuote.id);
    if (error) return toast.error(error.message);
    toast.success("Probability updated");
    setProbabilityQuote(null);
    load();
  }

  useEffect(() => {
    if (followupQuote) {
      setFollowupText("");
      loadFollowups(followupQuote.id);
    } else {
      setFollowupList([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [followupQuote]);
  useEffect(() => {
    if (statusQuote) {
      const raw = statusQuote.status ?? "";
      setStatusValue(QUOTE_STATUS_TO_STAGE[raw.toLowerCase()] ?? raw ?? "Pending Quotation");

      setStatusRemarks("");
    }
  }, [statusQuote]);

  async function loadFollowups(quoteId: string) {
    setFollowupLoading(true);
    const { data, error } = await (supabase.from as any)("followup_remarks")
      .select("id, remark, user_name, created_at")
      .eq("entity_type", "quote")
      .eq("entity_id", quoteId)
      .order("created_at", { ascending: false });
    setFollowupLoading(false);
    if (error) return toast.error(error.message);
    setFollowupList(data ?? []);
  }

  async function saveFollowup() {
    if (!followupQuote) return;
    const text = followupText.trim();
    if (!text) return toast.error("Enter a remark");
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) return toast.error("Not signed in");
    const name =
      (user.user_metadata as any)?.full_name ||
      (user.user_metadata as any)?.name ||
      user.email ||
      "Unknown";
    const { error } = await (supabase.from as any)("followup_remarks").insert({
      entity_type: "quote",
      entity_id: followupQuote.id,
      remark: text,
      user_id: user.id,
      user_name: name,
    });
    if (error) return toast.error(error.message);
    toast.success("Remark added");
    setFollowupText("");
    loadFollowups(followupQuote.id);
  }


  async function saveStatus() {
    if (!statusQuote) return;
    const { error: statusError } = await (supabase.from as any)("quotes")
      .update({ status: statusValue })
      .eq("id", statusQuote.id);
    if (statusError) return toast.error(statusError.message);

    const remarkText = statusRemarks.trim();
    if (remarkText) {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) {
        toast.error("Status updated, but remark was not saved (not signed in)");
      } else {
        const name =
          (user.user_metadata as any)?.full_name ||
          (user.user_metadata as any)?.name ||
          user.email ||
          "Unknown";
        const { error: remarkError } = await (supabase.from as any)("followup_remarks").insert({
          entity_type: "quote",
          entity_id: statusQuote.id,
          remark: `Status changed to "${statusValue}" — ${remarkText}`,
          user_id: user.id,
          user_name: name,
        });
        if (remarkError) return toast.error(remarkError.message);
      }
    }

    toast.success("Status updated");
    setStatusQuote(null);
    load();
  }


  async function load() {
    setLoading(true);
    const { data, error } = await (supabase.from as any)("quotes")
      .select(
        "id, quote_number, quote_date, expiry_date, customer_name, status, currency, total, subject, salesperson, project_name, subtotal, vat_amount, notes, terms, purchase_order, quote_type, probability",
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
    const qStage = QUOTE_STATUS_TO_STAGE[(q.status ?? "").toLowerCase()] ?? q.status;
    if (status !== "all" && qStage !== status) return false;

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
          <SelectTrigger className="w-56">

            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STAGES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}

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
              <TableHead>Probability</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="w-28 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8">
                  Loading…
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={9}
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
                    {q.status && (() => {
                      const stage = QUOTE_STATUS_TO_STAGE[(q.status ?? "").toLowerCase()];
                      const cls = stage ? STAGE_COLORS[stage] : "bg-muted text-muted-foreground border-transparent";
                      return (
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium border ${cls}`}>
                          {stage ?? q.status}
                        </span>
                      );
                    })()}
                  </TableCell>
                  <TableCell>
                    {q.probability ? (
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-medium border ${
                          PROBABILITY_COLORS[q.probability as Probability] ??
                          "bg-muted text-muted-foreground border-transparent"
                        }`}
                      >
                        {q.probability}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {q.currency} {Number(q.total ?? 0).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem
                          className="hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground cursor-pointer"
                          onClick={() => {
                            setViewQuote(null);
                            setEditingQuote(q);
                            setQuoteDialogOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4 mr-2" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground cursor-pointer"
                          onClick={() => {
                            setEditingQuote(null);
                            setViewQuote(q);
                            setQuoteDialogOpen(true);
                          }}
                        >
                          <Eye className="h-4 w-4 mr-2" /> View
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground cursor-pointer"
                          onClick={() => setFollowupQuote(q)}
                        >
                          <MessageSquare className="h-4 w-4 mr-2" /> Followup remarks
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground cursor-pointer"
                          onClick={() => setStatusQuote(q)}
                        >
                          <ArrowRightCircle className="h-4 w-4 mr-2" /> Change Status
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground cursor-pointer"
                          onClick={() => setAnalyseQuote(q)}
                        >
                          <BarChart3 className="h-4 w-4 mr-2" /> Analyse
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground cursor-pointer"
                          onClick={() => setProbabilityQuote(q)}
                        >
                          <Percent className="h-4 w-4 mr-2" /> Edit Probability
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive focus:bg-destructive/10 focus:text-destructive cursor-pointer"
                          onClick={() => removeQuote(q.id)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
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

      {/* Followup remarks */}
      <Dialog open={!!followupQuote} onOpenChange={(o) => !o && setFollowupQuote(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Followup remarks — {followupQuote?.quote_number}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label className="text-sm">Add new remark</Label>
              <Textarea
                rows={3}
                value={followupText}
                onChange={(e) => setFollowupText(e.target.value)}
                placeholder="Enter remark, next steps, call outcomes…"
              />
              <div className="flex justify-end">
                <Button size="sm" onClick={saveFollowup}>Add remark</Button>
              </div>
            </div>
            <div className="border-t pt-3">
              <Label className="text-sm mb-2 block">History</Label>
              <div className="max-h-80 overflow-y-auto border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-40">Date & Time</TableHead>
                      <TableHead className="w-40">User</TableHead>
                      <TableHead>Remark</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {followupLoading ? (
                      <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>
                    ) : followupList.length === 0 ? (
                      <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">No remarks yet</TableCell></TableRow>
                    ) : (
                      followupList.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="text-xs whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</TableCell>
                          <TableCell className="text-xs whitespace-nowrap">{r.user_name ?? "—"}</TableCell>
                          <TableCell className="text-sm whitespace-pre-wrap">{r.remark}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFollowupQuote(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {/* Change status */}
      <Dialog open={!!statusQuote} onOpenChange={(o) => !o && setStatusQuote(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Change status — {statusQuote?.quote_number}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm">Status</Label>
              <Select value={statusValue} onValueChange={setStatusValue}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STAGES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

            </div>
            <div className="space-y-2">
              <Label className="text-sm">Remarks</Label>
              <Textarea
                rows={5}
                value={statusRemarks}
                onChange={(e) => setStatusRemarks(e.target.value)}
                placeholder="Enter remarks for this status change. This will be logged in the followup remarks with date, time and user."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusQuote(null)}>Cancel</Button>
            <Button onClick={saveStatus}>Update</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Probability */}
      <Dialog open={!!probabilityQuote} onOpenChange={(o) => !o && setProbabilityQuote(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Probability — {probabilityQuote?.quote_number}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-sm">Probability</Label>
            <Select value={probabilityValue} onValueChange={setProbabilityValue}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PROBABILITY_LEVELS.map((p) => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProbabilityQuote(null)}>Cancel</Button>
            <Button onClick={saveProbability}>Update</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Analyse */}
      <Dialog open={!!analyseQuote} onOpenChange={(o) => !o && setAnalyseQuote(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Analyse — {analyseQuote?.quote_number}</DialogTitle>
          </DialogHeader>
          {analyseQuote && (() => {
            const subtotal = Number(analyseQuote.subtotal ?? 0);
            const vat = Number(analyseQuote.vat_amount ?? 0);
            const total = Number(analyseQuote.total ?? 0);
            const stage = QUOTE_STATUS_TO_STAGE[(analyseQuote.status ?? "").toLowerCase()] ?? analyseQuote.status;
            const daysOpen = analyseQuote.quote_date
              ? Math.max(0, Math.floor((Date.now() - new Date(analyseQuote.quote_date).getTime()) / 86400000))
              : null;
            const daysToExpiry = analyseQuote.expiry_date
              ? Math.floor((new Date(analyseQuote.expiry_date).getTime() - Date.now()) / 86400000)
              : null;
            return (
              <div className="text-sm space-y-2">
                <div className="flex justify-between"><span className="text-muted-foreground">Customer</span><span>{analyseQuote.customer_name ?? "—"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Type</span><span>{analyseQuote.quote_type ?? "—"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Funnel stage</span><span>{stage ?? "—"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Quote date</span><span>{analyseQuote.quote_date ?? "—"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Expiry</span><span>{analyseQuote.expiry_date ?? "—"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Days open</span><span>{daysOpen ?? "—"}</span></div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Days to expiry</span>
                  <span className={daysToExpiry != null && daysToExpiry < 0 ? "text-destructive" : ""}>
                    {daysToExpiry ?? "—"}
                  </span>
                </div>
                <div className="border-t pt-2 flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{analyseQuote.currency} {subtotal.toLocaleString()}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">VAT (5%)</span><span>{analyseQuote.currency} {vat.toLocaleString()}</span></div>
                <div className="flex justify-between font-semibold"><span>Total</span><span>{analyseQuote.currency} {total.toLocaleString()}</span></div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAnalyseQuote(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
        status: "Pending Quotation",
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
      const normalizedQuote = quote
        ? {
            ...quote,
            status:
              QUOTE_STATUS_TO_STAGE[(quote.status ?? "").toLowerCase()] ??
              quote.status ??
              "Pending Quotation",
          }
        : null;
      setForm(
        normalizedQuote ?? {
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
      status: form.status || "Pending Quotation",
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
                value={form.status ?? "Pending Quotation"}
                onValueChange={(v) => setForm({ ...form, status: v })}
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
