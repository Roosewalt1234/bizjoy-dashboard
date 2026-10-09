import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Shield,
  UserPlus,
  Trash2,
  Loader2,
  Eye,
  EyeOff,
  Search,
  User as UserIcon,
  ChevronDown,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  PERMISSION_NAV_ITEMS,
  PERM_ACTIONS,
  buildPermissionRows,
  navFlags,
  permissionNodes,
  type NavItem,
  type PermAction,
  type PermFlags,
} from "@/lib/nav-items";
import {
  listAppUsers,
  listEmployeesWithoutAccount,
  createAppUser,
  setUserAdmin,
  savePermissions,
  deleteAppUser,
} from "@/lib/users.functions";

export const Route = createFileRoute("/_authenticated/permissions")({
  component: PermissionsPage,
  head: () => ({
    meta: [
      { title: "User Permissions | Fiz Fix ERP" },
      { name: "description", content: "Manage users and control who can view, add, edit or delete data in each module." },
      { property: "og:title", content: "User Permissions | Fiz Fix ERP" },
      { property: "og:description", content: "Manage users and module-level access rights in Fiz Fix ERP." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const ACTION_LABELS: Record<PermAction, string> = { view: "View", add: "Add", edit: "Edit", delete: "Delete" };
const NONE: PermFlags = { view: false, add: false, edit: false, delete: false };
const ALL: PermFlags = { view: true, add: true, edit: true, delete: true };

/** Permission-carrying nodes of one parent nav item: its own "main" row (if it has a module) + its children. */
const nodesOf = (item: NavItem) => [
  ...(item.module ? [{ key: item.key, module: item.module }] : []),
  ...(item.children ?? []).map((c) => ({ key: c.key, module: c.module })),
];

function PermissionsPage() {
  const qc = useQueryClient();
  const fetchUsers = useServerFn(listAppUsers);
  const fetchEmployees = useServerFn(listEmployeesWithoutAccount);
  const addUser = useServerFn(createAppUser);
  const toggleAdmin = useServerFn(setUserAdmin);
  const savePerms = useServerFn(savePermissions);
  const removeUser = useServerFn(deleteAppUser);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ employeeId: "", password: "", admin: false });
  const [showPassword, setShowPassword] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  // Unsaved edits for the selected user, keyed by nav-item permission key.
  const [draft, setDraft] = useState<Record<string, PermFlags>>({});

  const { data, isLoading, error } = useQuery({
    queryKey: ["app-users"],
    queryFn: () => fetchUsers({}),
  });

  const { data: employeesData } = useQuery({
    queryKey: ["employees-without-account"],
    queryFn: () => fetchEmployees({}),
    enabled: open,
  });
  const availableEmployees = employeesData?.employees ?? [];
  const selectedEmployee = availableEmployees.find((e: any) => e.id === form.employeeId);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["app-users"] });
    qc.invalidateQueries({ queryKey: ["employees-without-account"] });
  };

  const createMut = useMutation({
    mutationFn: () => addUser({ data: form }),
    onSuccess: () => {
      toast.success("User created");
      setOpen(false);
      setForm({ employeeId: "", password: "", admin: false });
      setShowPassword(false);
      invalidate();
    },
    onError: (e: any) => toast.error(e.message ?? "Could not create user"),
  });

  const adminMut = useMutation({
    mutationFn: (v: { userId: string; admin: boolean }) => toggleAdmin({ data: v }),
    onSuccess: () => { toast.success("Role updated"); invalidate(); },
    onError: (e: any) => toast.error(e.message ?? "Could not update role"),
  });

  const saveMut = useMutation({
    mutationFn: (v: { userId: string; permissions: any[] }) => savePerms({ data: v }),
    onSuccess: () => { toast.success("Permissions saved"); setDraft({}); invalidate(); },
    onError: (e: any) => toast.error(e.message ?? "Could not save permissions"),
  });

  const deleteMut = useMutation({
    mutationFn: (userId: string) => removeUser({ data: { userId } }),
    onSuccess: () => { toast.success("User deleted"); setSelectedUserId(null); setDraft({}); invalidate(); },
    onError: (e: any) => toast.error(e.message ?? "Could not delete user"),
  });

  const users: any[] = data?.users ?? [];
  const selectedUser = users.find((u) => u.id === selectedUserId) ?? null;
  const selectedIsAdmin = Boolean(selectedUser?.roles.includes("admin"));
  const hasUnsavedChanges = Object.keys(draft).length > 0;

  const filteredUsers = users.filter((u) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return `${u.display_name ?? ""} ${u.email ?? ""}`.toLowerCase().includes(q);
  });

  const selectUser = (userId: string) => {
    if (userId === selectedUserId) return;
    if (hasUnsavedChanges && !confirm("Discard unsaved permission changes?")) return;
    setDraft({});
    setSelectedUserId(userId);
  };

  const flagsFor = (key: string, module: string): PermFlags =>
    draft[key] ?? (selectedUser ? navFlags(selectedUser.permissions, key, module) : NONE);

  const toggleAction = (key: string, module: string, action: PermAction, val: boolean) => {
    const cur = flagsFor(key, module);
    // Removing view removes every other action; granting add/edit/delete implies view.
    const next =
      action === "view"
        ? val ? { ...cur, view: true } : NONE
        : { ...cur, [action]: val, view: val ? true : cur.view };
    setDraft((prev) => ({ ...prev, [key]: next }));
  };

  const parentState = (item: NavItem): boolean | "indeterminate" => {
    const all = nodesOf(item).flatMap((n) => PERM_ACTIONS.map((a) => flagsFor(n.key, n.module)[a]));
    if (all.every(Boolean)) return true;
    if (all.some(Boolean)) return "indeterminate";
    return false;
  };

  const toggleParent = (item: NavItem, val: boolean) => {
    setDraft((prev) => {
      const next = { ...prev };
      for (const n of nodesOf(item)) next[n.key] = val ? ALL : NONE;
      return next;
    });
  };

  const handleSave = () => {
    if (!selectedUser) return;
    const values: Record<string, PermFlags> = {};
    for (const n of permissionNodes()) values[n.key] = flagsFor(n.key, n.module);
    saveMut.mutate({ userId: selectedUser.id, permissions: buildPermissionRows(values) });
  };

  const renderActionRow = (key: string, module: string, label: string, isMain = false) => {
    const flags = flagsFor(key, module);
    return (
      <div
        key={key}
        className={cn(
          "flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2",
          isMain && "bg-muted/50",
        )}
      >
        <span className={cn("text-sm", isMain && "font-medium")}>{label}</span>
        <div className="flex flex-wrap gap-4">
          {PERM_ACTIONS.map((a) => (
            <label key={a} className="flex items-center gap-1.5 text-sm cursor-pointer">
              <Checkbox
                checked={flags[a]}
                onCheckedChange={(v) => toggleAction(key, module, a, Boolean(v))}
              />
              {ACTION_LABELS[a]}
            </label>
          ))}
        </div>
      </div>
    );
  };

  if (error) {
    const message = (error as any)?.message ?? "";
    return (
      <div className="p-6">
        <Card className="p-6 text-sm text-muted-foreground">
          {message.includes("Forbidden")
            ? "You need administrator access to manage user permissions."
            : `Could not load users: ${message || "unknown error"}`}
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Shield className="h-6 w-6" /> User Permissions
          </h1>
          <p className="text-sm text-muted-foreground">
            Add users and control who can view, add, edit or delete data in each module.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><UserPlus className="h-4 w-4 mr-2" /> Add User</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add New User</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Employee</Label>
                <Select value={form.employeeId} onValueChange={(v) => setForm({ ...form, employeeId: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder={availableEmployees.length === 0 ? "No employees available" : "Select an employee"} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableEmployees.map((emp: any) => (
                      <SelectItem key={emp.id} value={emp.id}>
                        {emp.full_name || `${emp.first_name} ${emp.last_name ?? ""}`.trim()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Only active employees without an existing login are shown.
                </p>
              </div>
              <div>
                <Label>Email</Label>
                <Input value={selectedEmployee?.email ?? ""} disabled placeholder="Select an employee to populate email" />
              </div>
              <div>
                <Label>Temporary Password</Label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.admin} onCheckedChange={(v) => setForm({ ...form, admin: v })} />
                <Label>Administrator (full access)</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button
                onClick={() => createMut.mutate()}
                disabled={createMut.isPending || !form.employeeId || !selectedEmployee?.email}
              >
                {createMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Create User
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <Card className="p-6 text-sm text-muted-foreground">Loading users…</Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
          {/* Permissions (left) */}
          <Card className="order-2 p-4 lg:order-1 lg:col-span-3">
            {!selectedUser ? (
              <div className="flex min-h-[300px] flex-col items-center justify-center text-center text-muted-foreground">
                <Shield className="mb-3 h-12 w-12 opacity-40" />
                <p className="font-medium">Select a user</p>
                <p className="text-sm">Choose a user from the list to manage their permissions.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
                  <div>
                    <div className="flex items-center gap-2 text-lg font-semibold">
                      Permissions for {selectedUser.display_name || selectedUser.email}
                      {selectedIsAdmin && <Badge className="bg-primary/10 text-primary">Admin</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground">{selectedUser.email}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    {hasUnsavedChanges && (
                      <Badge variant="secondary" className="bg-orange-100 text-orange-800">Unsaved Changes</Badge>
                    )}
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={selectedIsAdmin}
                        onCheckedChange={(v) => adminMut.mutate({ userId: selectedUser.id, admin: v })}
                      />
                      <span className="text-sm">Administrator</span>
                    </div>
                    <Button
                      size="sm"
                      onClick={handleSave}
                      disabled={selectedIsAdmin || !hasUnsavedChanges || saveMut.isPending}
                    >
                      {saveMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save Changes
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        if (confirm(`Delete user ${selectedUser.email}?`)) deleteMut.mutate(selectedUser.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>

                {selectedIsAdmin ? (
                  <p className="text-sm text-muted-foreground">
                    Administrators have full access to every navigation item and action.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {PERMISSION_NAV_ITEMS.map((item) => {
                      const state = parentState(item);
                      const isCollapsed = collapsed[item.key] ?? false;
                      const childCount = item.children?.length ?? 0;
                      return (
                        <div key={item.key} className="rounded-lg border">
                          <div className="flex items-center justify-between gap-3 p-3">
                            <button
                              type="button"
                              className="flex items-center gap-2 text-left"
                              onClick={() => setCollapsed((p) => ({ ...p, [item.key]: !isCollapsed }))}
                            >
                              <ChevronDown
                                className={cn("h-4 w-4 transition-transform", isCollapsed && "-rotate-90")}
                              />
                              <item.icon className="h-4 w-4 text-muted-foreground" />
                              <span className="font-semibold">{item.title}</span>
                              {childCount > 0 && (
                                <span className="text-xs text-muted-foreground">
                                  ({childCount} {childCount === 1 ? "page" : "pages"})
                                </span>
                              )}
                            </button>
                            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                              <Checkbox checked={state} onCheckedChange={() => toggleParent(item, state !== true)} />
                              Enable All
                            </label>
                          </div>
                          {!isCollapsed && (
                            <div className="space-y-2 border-t p-3 pl-6">
                              {item.module &&
                                renderActionRow(
                                  item.key,
                                  item.module,
                                  childCount > 0 ? `${item.title} (Main)` : item.title,
                                  true,
                                )}
                              {(item.children ?? []).map((c) => renderActionRow(c.key, c.module, c.title))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* User selection (right) */}
          <Card className="order-1 space-y-3 self-start p-4 lg:sticky lg:top-4 lg:order-2">
            <div>
              <div className="flex items-center gap-2 font-semibold">
                <UserIcon className="h-4 w-4" /> Select User
              </div>
              <p className="text-xs text-muted-foreground">Choose a user to manage permissions</p>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search users…"
                className="pl-8"
              />
            </div>
            <div className="max-h-[60vh] space-y-1 overflow-y-auto">
              {filteredUsers.map((user) => {
                const isAdmin = user.roles.includes("admin");
                const active = user.id === selectedUserId;
                return (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => selectUser(user.id)}
                    className={cn(
                      "w-full rounded-md border px-3 py-2 text-left transition-colors",
                      active ? "border-primary bg-primary/10" : "border-transparent hover:bg-muted",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{user.display_name || user.email}</span>
                      {isAdmin && <Badge className="shrink-0 bg-primary/10 text-primary">Admin</Badge>}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{user.email}</div>
                  </button>
                );
              })}
              {filteredUsers.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">No users found</p>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
