import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { EmployeeRow } from "@/types/database";

type AuthState = {
  loading: boolean;
  session: Session | null;
  employee: EmployeeRow | null;
};

/** Session + the employee row it maps to (ownership for attendance/visits comes from this link). */
export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({ loading: true, session: null, employee: null });

  useEffect(() => {
    let mounted = true;

    async function loadEmployee(session: Session | null) {
      if (!session) {
        if (mounted) setState({ loading: false, session: null, employee: null });
        return;
      }
      const { data, error } = await supabase
        .from("employees")
        .select("id, auth_user_id, first_name, last_name, full_name, status")
        .eq("auth_user_id", session.user.id)
        .maybeSingle();
      if (!mounted) return;
      if (error) {
        console.error("Failed to load employee for session", error);
        setState({ loading: false, session, employee: null });
        return;
      }
      setState({ loading: false, session, employee: (data as EmployeeRow | null) ?? null });
    }

    supabase.auth.getSession().then(({ data }) => loadEmployee(data.session));

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setState((s) => ({ ...s, loading: true }));
      loadEmployee(session);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return state;
}
