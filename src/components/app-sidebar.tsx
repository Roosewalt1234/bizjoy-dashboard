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
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import logoAsset from "@/assets/fizfix-logo.jpeg.asset.json";

const items = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Customers", url: "/customers", icon: Users },
  { title: "Sales", url: "/sales", icon: ShoppingCart },
  { title: "HR", url: "/hr", icon: UserCog },
  { title: "Accounts", url: "/accounts", icon: Wallet },
  { title: "Contracts", url: "/contracts", icon: FileText },
  { title: "Projects", url: "/projects", icon: FolderKanban },
];

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  const isActive = (url: string) =>
    url === "/" ? pathname === "/" : pathname.startsWith(url);

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
          <img src={logoAsset.url} alt="Fiz Fix ERP" className="h-8 w-8 rounded-md object-contain bg-white" />
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
              {items.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)}>
                    <Link to={item.url} className="flex items-center gap-2">
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
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
