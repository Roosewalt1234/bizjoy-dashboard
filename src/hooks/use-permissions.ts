import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const MODULES = [
  { key: "customers", label: "Customers", url: "/customers" },
  { key: "sales", label: "Sales", url: "/sales" },
  { key: "hr", label: "HR", url: "/hr" },
  { key: "accounts", label: "Accounts", url: "/accounts" },
  { key: "contracts", label: "Contracts", url: "/contracts" },
  { key: "projects", label: "Projects", url: "/projects" },
  { key: "service", label: "Work Orders & Completion Reports", url: "/service" },
] as const;

export type ModuleKey = (typeof MODULES)[number]["key"];
export type Action = "view" | "add" | "edit" | "delete";

export function usePermissions() {
  const query = useQuery({
    queryKey: ["my-permissions"],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) return { isAdmin: false, perms: [] as any[] };
      const [{ data: roles }, { data: perms }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", uid),
        supabase.from("user_permissions").select("*").eq("user_id", uid),
      ]);
      return {
        isAdmin: (roles ?? []).some((r: any) => r.role === "admin"),
        perms: perms ?? [],
      };
    },
    staleTime: 60_000,
  });

  const isAdmin = query.data?.isAdmin ?? false;

  const can = (module: string, action: Action) => {
    if (isAdmin) return true;
    const row: any = (query.data?.perms ?? []).find((p: any) => p.module === module);
    if (!row) return false;
    return Boolean(row[`can_${action}`]);
  };

  return { isAdmin, can, isLoading: query.isLoading };
}
