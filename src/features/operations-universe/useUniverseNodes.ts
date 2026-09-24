import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { layoutAround } from "./layout";
import type { CenterEntity, UniverseNodeData } from "./types";
import { centerEntityKey } from "./types";

async function fetchContractCategoryCounts(): Promise<{ id: string; data: UniverseNodeData }[]> {
  const [amc, fm] = await Promise.all([
    supabase.from("contracts").select("status"),
    supabase.from("fm_contracts").select("status"),
  ]);
  if (amc.error) throw amc.error;
  if (fm.error) throw fm.error;

  const counts = new Map<string, { domain: "AMC" | "FM"; status: string; count: number }>();
  for (const row of amc.data ?? []) {
    const status = row.status ?? "Unknown";
    const key = `AMC:${status}`;
    counts.set(key, { domain: "AMC", status, count: (counts.get(key)?.count ?? 0) + 1 });
  }
  for (const row of fm.data ?? []) {
    const status = row.status ?? "Unknown";
    const key = `FM:${status}`;
    counts.set(key, { domain: "FM", status, count: (counts.get(key)?.count ?? 0) + 1 });
  }

  return [...counts.values()].map(({ domain, status, count }) => ({
    id: `category:${domain}:${status}`,
    data: {
      kind: "category" as const,
      label: `${domain} · ${status}`,
      sublabel: `${count} contract${count === 1 ? "" : "s"}`,
      clickable: true,
      center: { kind: "contract-category", domain, status } as CenterEntity,
      groupKey: domain,
    },
  }));
}

async function fetchContractsInCategory(
  domain: "AMC" | "FM",
  status: string,
): Promise<{ id: string; data: UniverseNodeData }[]> {
  const table = domain === "AMC" ? "contracts" : "fm_contracts";
  const { data, error } = await supabase
    .from(table)
    .select("id, title, customer_name, value, end_date")
    .eq("status", status)
    .order("title");
  if (error) throw error;

  const soon = new Date();
  soon.setDate(soon.getDate() + 30);

  return (data ?? []).map((row) => ({
    id: `contract:${domain}:${row.id}`,
    data: {
      kind: "contract" as const,
      label: row.title ?? row.customer_name ?? "Untitled contract",
      sublabel: row.customer_name ?? undefined,
      exception: row.end_date ? new Date(row.end_date) <= soon : false,
      clickable: true,
      center: { kind: "contract", domain, id: row.id } as CenterEntity,
      groupKey: "contract",
    },
  }));
}

export function useUniverseGraph(centerEntity: CenterEntity, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["universe-graph", centerEntityKey(centerEntity)],
    enabled: options?.enabled ?? true,
    queryFn: async () => {
      if (centerEntity.kind === "contract-category" && centerEntity.status === "__root__") {
        const ringOne = await fetchContractCategoryCounts();
        const centerData: UniverseNodeData = {
          kind: "contracts-hub",
          label: "CONTRACTS",
          clickable: false,
        };
        return layoutAround({ centerId: "contracts-hub", centerData, ringOne });
      }

      if (centerEntity.kind === "contract-category") {
        const ringOne = await fetchContractsInCategory(centerEntity.domain, centerEntity.status);
        const centerData: UniverseNodeData = {
          kind: "category",
          label: `${centerEntity.domain} · ${centerEntity.status}`,
          clickable: false,
        };
        return layoutAround({
          centerId: `category:${centerEntity.domain}:${centerEntity.status}`,
          centerData,
          ringOne,
        });
      }

      // Later tasks add the remaining CenterEntity cases here.
      throw new Error(`No handler yet for center entity kind: ${centerEntity.kind}`);
    },
  });
}
