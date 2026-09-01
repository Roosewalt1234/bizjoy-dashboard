import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(context: any) {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error || !data) throw new Error("Forbidden: admin role required");
}

export const listAppUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profiles, error } = await supabaseAdmin
      .from("profiles")
      .select("id, email, display_name, created_at")
      .order("created_at", { ascending: true });
    if (error) throw error;
    const { data: roles } = await supabaseAdmin.from("user_roles").select("user_id, role");
    const { data: perms } = await supabaseAdmin.from("user_permissions").select("*");
    return {
      users: (profiles ?? []).map((p) => ({
        ...p,
        roles: (roles ?? []).filter((r) => r.user_id === p.id).map((r) => r.role),
        permissions: (perms ?? []).filter((x: any) => x.user_id === p.id),
      })),
    };
  });

/** Active employees who don't already have a login account - candidates for "Add New User". */
export const listEmployeesWithoutAccount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("employees")
      .select("id, full_name, first_name, last_name, email")
      .is("auth_user_id", null)
      .neq("status", "Terminated")
      .order("full_name", { ascending: true });
    if (error) throw error;
    return { employees: data ?? [] };
  });

export const createAppUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { employeeId: string; password: string; admin?: boolean }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (!data.employeeId || !data.password || data.password.length < 6) {
      throw new Error("An employee and a password of at least 6 characters are required");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: employee, error: empErr } = await supabaseAdmin
      .from("employees")
      .select("id, full_name, first_name, last_name, email, auth_user_id")
      .eq("id", data.employeeId)
      .maybeSingle();
    if (empErr) throw empErr;
    if (!employee) throw new Error("Employee not found");
    if (employee.auth_user_id) throw new Error("This employee already has a login account");
    if (!employee.email) throw new Error("This employee has no email on file - add one before creating a login");

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: employee.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: employee.full_name || `${employee.first_name} ${employee.last_name ?? ""}`.trim() },
    });
    if (error) throw new Error(error.message);
    const uid = created.user!.id;

    await supabaseAdmin.from("employees").update({ auth_user_id: uid }).eq("id", employee.id);
    if (data.admin) {
      await supabaseAdmin.from("user_roles").upsert({ user_id: uid, role: "admin" }, { onConflict: "user_id,role" });
    }
    return { id: uid };
  });

export const setUserAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; admin: boolean }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.admin) {
      await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: data.userId, role: "admin" }, { onConflict: "user_id,role" });
    } else {
      if (data.userId === context.userId) throw new Error("You cannot remove your own admin role");
      await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId).eq("role", "admin");
    }
    return { ok: true };
  });

export const savePermissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      userId: string;
      permissions: { module: string; can_view: boolean; can_add: boolean; can_edit: boolean; can_delete: boolean }[];
    }) => input,
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const rows = data.permissions.map((p) => ({ ...p, user_id: data.userId }));
    const { error } = await supabaseAdmin.from("user_permissions").upsert(rows, { onConflict: "user_id,module" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteAppUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.userId === context.userId) throw new Error("You cannot delete your own account");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
