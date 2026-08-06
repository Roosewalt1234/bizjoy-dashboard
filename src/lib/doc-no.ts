import { supabase } from "@/integrations/supabase/client";

/** Fetch the next sequential document number (e.g. WO-0001 / SR-0024). */
export async function nextDocNo(kind: "work_order" | "service_report"): Promise<string> {
  const { data, error } = await supabase.rpc("next_doc_no", { kind });
  if (error) throw error;
  return data as string;
}
