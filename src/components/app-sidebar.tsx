import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Users,
  ShoppingCart,
  UserCog,
  Wallet,
  FileText,
  FolderKanban,
  LogOut,
  History,
  Shield,
  ChevronRight,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import logoAsset from "@/assets/fizfix-logo.jpeg.asset.json";
import { usePermissions } from "@/hooks/use-permissions";

type NavItem = {
  title: string;
  url: string;
  icon: LucideIcon;
  module?: string;
  adminOnly?: boolean;
  children?: { title: string; url: string; module?: string }[];
};

const items: NavItem[] = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Customers", url: "/customers", icon: Users, module: "customers" },
  { title: "Sales", url: "/sales", icon: ShoppingCart, module: "sales" },
  { title: "HR", url: "/hr", icon: UserCog, module: "hr" },
  { title: "Accounts", url: "/accounts", icon: Wallet, module: "accounts" },
  {
    title: "AMC Contracts",
    url: "/amc-contracts",
    icon: FileText,
    module: "contracts",
    children: [
      { title: "AMC Contracts", url: "/amc-contracts", module: "contracts" },
      { title: "AMC Work Orders", url: "/amc-work-orders", module: "service" },
      { title: "AMC Work Completion Reports", url: "/amc-service-reports", module: "service" },
    ],
  },
  {
    title: "FM Projects",
    url: "/fm-daily-operations",
    icon: FolderKanban,
    module: "contracts",
    children: [
      { title: "FM Contracts", url: "/fm-contracts", module: "contracts" },
      { title: "Service Categories", url: "/fm-service-categories", module: "contracts" },
      { title: "Contract Line Items", url: "/fm-contract-line-items", module: "contracts" },
      { title: "FM Asset Register", url: "/fm-assets", module: "contracts" },
      { title: "PPM Planner", url: "/fm-ppm", module: "contracts" },
      { title: "FM Work Orders", url: "/fm-work-orders", module: "service" },
      { title: "SLA & KPI Tracker", url: "/fm-sla", module: "contracts" },
      { title: "Manpower Planning", url: "/fm-manpower", module: "contracts" },
      { title: "Attendance", url: "/fm-attendance", module: "contracts" },
      { title: "Weekly Reports", url: "/fm-weekly-reports", module: "contracts" },
      { title: "Monthly Reports", url: "/fm-monthly-reports", module: "contracts" },
      { title: "Invoice Packs", url: "/fm-invoice-packs", module: "contracts" },
      { title: "Project Assets", url: "/assets", module: "projects" },

      { title: "MEP Schedules", url: "/mep-schedules", module: "projects" },
      { title: "Cleaning Schedules", url: "/cleaning-schedules", module: "projects" },
      { title: "Project Reports", url: "/project-reports", module: "projects" },
    ],
  },

  { title: "Audit Log", url: "/audit", icon: History, adminOnly: true },
  { title: "User Permissions", url: "/permissions", icon: Shield, adminOnly: true },
];

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState<string | null>(null);
  const { isAdmin, can } = usePermissions();

  const visibleItems = items.filter((item) => {
    if (item.adminOnly) return isAdmin;
    if (item.module) return can(item.module, "view");
    return true;
  });

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const item of items) {
      if (item.children?.some((child) => pathname.startsWith(child.url))) {
        initial[item.url] = true;
      }
    }
    return initial;
  });

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  const isActive = (url: string) => (url === "/" ? pathname === "/" : pathname.startsWith(url));

  const handleSignOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    toast.success("Signed out");
    navigate({ to: "/auth", replace: true });
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-4 py-4">
        <div className="flex items-center gap-2">
          <img
            src={logoAsset.url}
            alt="Fiz Fix ERP"
            className="h-16 w-16 rounded-md object-contain bg-white"
          />
          <span className="text-sidebar-foreground font-semibold text-lg group-data-[collapsible=icon]:hidden">
            Fiz Fix ERP
          </span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Modules</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleItems.map((item) => {
                const kids = (item.children ?? []).filter(
                  (c) => !c.module || can(c.module, "view"),
                );

                if (kids.length === 0) {
                  return (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton asChild isActive={isActive(item.url)}>
                        <Link to={item.url} className="flex items-center gap-2">
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                }

                const isOpen = openGroups[item.url] ?? false;

                return (
                  <Collapsible
                    key={item.url}
                    asChild
                    open={isOpen}
                    onOpenChange={(open) =>
                      setOpenGroups((prev) => ({ ...prev, [item.url]: open }))
                    }
                    className="group/collapsible"
                  >
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild isActive={isActive(item.url)}>
                        <Link to={item.url} className="flex items-center gap-2">
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuAction className="transition-transform group-data-[state=open]/collapsible:rotate-90">
                          <ChevronRight />
                          <span className="sr-only">Toggle {item.title}</span>
                        </SidebarMenuAction>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub>
                          {kids.map((child) => (
                            <SidebarMenuSubItem key={child.url}>
                              <SidebarMenuSubButton
                                asChild
                                isActive={pathname.startsWith(child.url)}
                              >
                                <Link to={child.url}>{child.title}</Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </Collapsible>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t">
        {email && (
          <div className="px-2 py-1 text-xs text-sidebar-foreground/70 truncate group-data-[collapsible=icon]:hidden">
            {email}
          </div>
        )}
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleSignOut}>
              <LogOut className="h-4 w-4" />
              <span>Sign out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
