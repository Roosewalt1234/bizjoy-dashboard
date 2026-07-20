import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, ShoppingCart, UserCog, Wallet, FileText, FolderKanban } from "lucide-react";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

function useCount(table: string) {
  return useQuery({
    queryKey: ["count", table],
    queryFn: async () => {
      const { count } = await supabase.from(table as never).select("*", { count: "exact", head: true });
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
    </div>
  );
}
