import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Shield, UserPlus, Trash2, Loader2 } from "lucide-react";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MODULES } from "@/hooks/use-permissions";
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

const ACTIONS = ["view", "add", "edit", "delete"] as const;

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
  const [draft, setDraft] = useState<Record<string, Record<string, Record<string, boolean>>>>({});

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
    onSuccess: () => { toast.success("Permissions saved"); invalidate(); },
    onError: (e: any) => toast.error(e.message ?? "Could not save permissions"),
  });

  const deleteMut = useMutation({
    mutationFn: (userId: string) => removeUser({ data: { userId } }),
    onSuccess: () => { toast.success("User deleted"); invalidate(); },
    onError: (e: any) => toast.error(e.message ?? "Could not delete user"),
  });

  const valueFor = (user: any, moduleKey: string, action: string) => {
    const d = draft[user.id]?.[moduleKey]?.[action];
    if (d !== undefined) return d;
    const row = user.permissions.find((p: any) => p.module === moduleKey);
    return Boolean(row?.[`can_${action}`]);
  };

  const setValue = (userId: string, moduleKey: string, action: string, val: boolean) => {
    setDraft((prev) => ({
      ...prev,
      [userId]: {
        ...(prev[userId] ?? {}),
        [moduleKey]: { ...(prev[userId]?.[moduleKey] ?? {}), [action]: val },
      },
    }));
  };

  const handleSave = (user: any) => {
    const permissions = MODULES.map((m) => ({
      module: m.key,
      can_view: valueFor(user, m.key, "view"),
      can_add: valueFor(user, m.key, "add"),
      can_edit: valueFor(user, m.key, "edit"),
      can_delete: valueFor(user, m.key, "delete"),
    }));
    saveMut.mutate({ userId: user.id, permissions });
    setDraft((prev) => ({ ...prev, [user.id]: {} }));
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
                <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
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
        <div className="space-y-4">
          {(data?.users ?? []).map((user: any) => {
            const isAdmin = user.roles.includes("admin");
            return (
              <Card key={user.id} className="p-4 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-medium flex items-center gap-2">
                      {user.display_name || user.email}
                      {isAdmin && <Badge className="bg-primary/10 text-primary">Admin</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground">{user.email}</div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={isAdmin}
                        onCheckedChange={(v) => adminMut.mutate({ userId: user.id, admin: v })}
                      />
                      <span className="text-sm">Administrator</span>
                    </div>
                    <Button size="sm" onClick={() => handleSave(user)} disabled={isAdmin || saveMut.isPending}>
                      Save Permissions
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        if (confirm(`Delete user ${user.email}?`)) deleteMut.mutate(user.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>

                {isAdmin ? (
                  <p className="text-xs text-muted-foreground">
                    Administrators have full access to every module.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Module</TableHead>
                        {ACTIONS.map((a) => (
                          <TableHead key={a} className="capitalize text-center w-24">{a}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {MODULES.map((m) => (
                        <TableRow key={m.key}>
                          <TableCell className="font-medium">{m.label}</TableCell>
                          {ACTIONS.map((a) => (
                            <TableCell key={a} className="text-center">
                              <Checkbox
                                checked={valueFor(user, m.key, a)}
                                onCheckedChange={(v) => setValue(user.id, m.key, a, Boolean(v))}
                              />
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
