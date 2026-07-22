import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, ShoppingCart, UserCog, Wallet, FileText, FolderKanban, Calendar } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, LabelList } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";

export const Route = createFileRoute("/")({
  component: Dashboard,
  head: () => ({
    meta: [
      { title: "Dashboard | FizFix Business Suite" },
      { name: "description", content: "Overview of customers, sales funnel, HR, accounts, contracts and projects." },
      { property: "og:title", content: "Dashboard | FizFix Business Suite" },
      { property: "og:description", content: "Overview of customers, sales funnel, HR, accounts, contracts and projects." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const FUNNEL_STAGES = [
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
];

const STAGE_COLORS: Record<string, string> = {
  "New Lead / Inquiry": "#3b82f6",
  "Contacted / Pitching": "#6366f1",
  "Site Survey Scheduled": "#8b5cf6",
  "Survey Report Ready": "#a855f7",
  "Proposal / Quote Sent": "#0ea5e9",
  "Negotiation": "#f59e0b",
  "Pending Decision": "#eab308",
  "Won & Activated": "#10b981",
  "Closed Lost": "#ef4444",
  "Cancelled": "#6b7280",
};

function useCount(table: string) {
  return useQuery({
    queryKey: ["count", table],
    queryFn: async () => {
      const { count } = await (supabase.from as any)(table).select("*", { count: "exact", head: true });
      return count ?? 0;
    },
  });
}

function StatCard({ title, count, icon: Icon, to, color }: { title: string; count: number | undefined; icon: any; to: string; color: string }) {
  return (
    <Link to={to}>
      <Card className="hover:shadow-md transition-shadow cursor-pointer">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
          <div className={`h-9 w-9 rounded-md flex items-center justify-center ${color}`}>
            <Icon className="h-5 w-5 text-white" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold">{count ?? "—"}</div>
        </CardContent>
      </Card>
    </Link>
  );
}

const PERIOD_OPTIONS = [
  { value: "all", label: "All Time" },
  { value: "this-month", label: "This Month" },
  { value: "last-month", label: "Last Month" },
  { value: "this-year", label: "This Year" },
  { value: "last-year", label: "Last Year" },
];

const MONTHS = [
  { value: "01", label: "January" },
  { value: "02", label: "February" },
  { value: "03", label: "March" },
  { value: "04", label: "April" },
  { value: "05", label: "May" },
  { value: "06", label: "June" },
  { value: "07", label: "July" },
  { value: "08", label: "August" },
  { value: "09", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

function getYearOptions() {
  const current = new Date().getFullYear();
  return Array.from({ length: 7 }, (_, i) => String(current - 3 + i));
}

function getPeriodBounds(period: string, customMonth: string, customYear: string) {
  if (period === "all") return null;

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  if (period === "this-month") {
    return {
      start: new Date(year, month, 1).toISOString(),
      end: new Date(year, month + 1, 1).toISOString(),
    };
  }

  if (period === "last-month") {
    return {
      start: new Date(year, month - 1, 1).toISOString(),
      end: new Date(year, month, 1).toISOString(),
    };
  }

  if (period === "this-year") {
    return {
      start: new Date(year, 0, 1).toISOString(),
      end: new Date(year + 1, 0, 1).toISOString(),
    };
  }

  if (period === "last-year") {
    return {
      start: new Date(year - 1, 0, 1).toISOString(),
      end: new Date(year, 0, 1).toISOString(),
    };
  }

  if (period === "custom") {
    const m = parseInt(customMonth, 10) - 1;
    const y = parseInt(customYear, 10);
    return {
      start: new Date(y, m, 1).toISOString(),
      end: new Date(y, m + 1, 1).toISOString(),
    };
  }

  return null;
}

function SalesFunnelChart() {
  const [period, setPeriod] = useState("this-month");
  const [customMonth, setCustomMonth] = useState(() => {
    const m = new Date().getMonth() + 1;
    return m.toString().padStart(2, "0");
  });
  const [customYear, setCustomYear] = useState(() => String(new Date().getFullYear()));

  const bounds = getPeriodBounds(period, customMonth, customYear);

  const { data, isLoading } = useQuery({
    queryKey: ["sales-funnel-summary", period, customMonth, customYear],
    queryFn: async () => {
      let query = (supabase.from as any)("sales_leads").select("stage, estimated_value, created_at");
      if (bounds) {
        query = query.gte("created_at", bounds.start).lt("created_at", bounds.end);
      }
      const { data } = await query;
      const rows = (data ?? []) as { stage: string; estimated_value: number | null; created_at: string }[];
      return FUNNEL_STAGES.map((stage) => {
        const items = rows.filter((r) => r.stage === stage);
        const value = items.reduce((s, r) => s + (Number(r.estimated_value) || 0), 0);
        return { stage, shortStage: stage.replace(" / ", " /\n"), count: items.length, value };
      });
    },
  });

  const totalLeads = data?.reduce((s, d) => s + d.count, 0) ?? 0;
  const totalValue = data?.reduce((s, d) => s + d.value, 0) ?? 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <CardTitle>Sales Funnel</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">Leads and pipeline value by stage</p>
          </div>
          <div className="flex items-center flex-wrap gap-3">
            <div className="flex items-center gap-2 bg-muted/40 rounded-lg px-3 py-1.5">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger className="w-[150px] border-0 bg-transparent shadow-none h-8 px-0 focus:ring-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERIOD_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                  <SelectItem value="custom">Custom Month</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {period === "custom" && (
              <>
                <Select value={customMonth} onValueChange={setCustomMonth}>
                  <SelectTrigger className="w-[130px] h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={customYear} onValueChange={setCustomYear}>
                  <SelectTrigger className="w-[100px] h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {getYearOptions().map((y) => (
                      <SelectItem key={y} value={y}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}
            <div className="flex gap-6 text-sm border-l pl-3">
              <div>
                <div className="text-muted-foreground">Total leads</div>
                <div className="text-xl font-semibold">{totalLeads}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Pipeline value</div>
                <div className="text-xl font-semibold">AED {totalValue.toLocaleString()}</div>
              </div>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-[420px] flex items-center justify-center text-muted-foreground">Loading…</div>
        ) : (
          <div className="w-full h-[420px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} layout="vertical" margin={{ top: 8, right: 60, left: 20, bottom: 8 }} barCategoryGap={6}>
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="stage"
                  width={170}
                  tick={{ fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(val: any, name: any, props: any) => {
                    if (name === "count") return [`${val} leads · AED ${props.payload.value.toLocaleString()}`, props.payload.stage];
                    return [val, name];
                  }}
                  cursor={{ fill: "hsl(var(--muted))" }}
                />
                <Bar dataKey="count" radius={[4, 4, 4, 4]}>
                  {data?.map((entry) => (
                    <Cell key={entry.stage} fill={STAGE_COLORS[entry.stage]} />
                  ))}
                  <LabelList
                    dataKey="count"
                    position="right"
                    formatter={(v: any) => (v > 0 ? v : "")}
                    style={{ fill: "hsl(var(--foreground))", fontSize: 12, fontWeight: 600 }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Dashboard() {
  const customers = useCount("customers");
  const sales = useCount("sales_orders");
  const hr = useCount("employees");
  const accounts = useCount("accounts_transactions");
  const contracts = useCount("contracts");
  const projects = useCount("projects");

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Overview of your business modules.</p>
      </div>
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard title="Customers" count={customers.data} icon={Users} to="/customers" color="bg-blue-600" />
        <StatCard title="Sales Orders" count={sales.data} icon={ShoppingCart} to="/sales" color="bg-emerald-600" />
        <StatCard title="Employees" count={hr.data} icon={UserCog} to="/hr" color="bg-purple-600" />
        <StatCard title="Transactions" count={accounts.data} icon={Wallet} to="/accounts" color="bg-amber-600" />
        <StatCard title="Contracts" count={contracts.data} icon={FileText} to="/contracts" color="bg-rose-600" />
        <StatCard title="Projects" count={projects.data} icon={FolderKanban} to="/projects" color="bg-cyan-600" />
      </div>
      <SalesFunnelChart />
    </div>
  );
}
