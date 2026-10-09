import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LogOut, ChevronRight, KeyRound, Loader2 } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import logoAsset from "@/assets/fizfix-logo.jpeg.asset.json";
import { usePermissions } from "@/hooks/use-permissions";
import { NAV_ITEMS as items } from "@/lib/nav-items";

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState<string | null>(null);
  const { isAdmin, canNav } = usePermissions();

  const visibleKids = (item: (typeof items)[number]) =>
    (item.children ?? []).filter((c) => canNav(c.key, c.module));

  const visibleItems = items.filter((item) => {
    if (item.hiddenInSidebar) return false;
    if (item.adminOnly) return isAdmin;
    if (!item.module && !item.children?.length) return true;
    return (item.module && canNav(item.key, item.module)) || visibleKids(item).length > 0;
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

  const [pwOpen, setPwOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  const closePasswordDialog = () => {
    setPwOpen(false);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 6) {
      toast.error("New password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match");
      return;
    }
    if (!email) {
      toast.error("Could not determine your account email");
      return;
    }
    setChangingPassword(true);
    try {
      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      });
      if (reauthError) {
        toast.error("Current password is incorrect");
        return;
      }
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw updateError;
      toast.success("Password changed");
      closePasswordDialog();
    } catch (error: any) {
      toast.error(error.message ?? "Could not change password");
    } finally {
      setChangingPassword(false);
    }
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
                const kids = visibleKids(item);

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
                                isActive={pathname === child.url || pathname.startsWith(child.url + "/")}
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
            <Dialog
              open={pwOpen}
              onOpenChange={(nextOpen) => {
                if (nextOpen) setPwOpen(true);
                else closePasswordDialog();
              }}
            >
              <DialogTrigger asChild>
                <SidebarMenuButton>
                  <KeyRound className="h-4 w-4" />
                  <span>Change Password</span>
                </SidebarMenuButton>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Change Password</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Current Password</Label>
                    <Input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>New Password</Label>
                    <Input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Confirm New Password</Label>
                    <Input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={closePasswordDialog}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleChangePassword}
                    disabled={changingPassword || !currentPassword || !newPassword || !confirmPassword}
                  >
                    {changingPassword && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Change Password
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </SidebarMenuItem>
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
