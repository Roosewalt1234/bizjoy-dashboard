import { createFileRoute } from "@tanstack/react-router";
import { WorkOrdersPage } from "@/components/work-orders-page";

export const Route = createFileRoute("/_authenticated/fm-work-orders")({
  validateSearch: (search: Record<string, unknown>): { wo?: string; wo_id?: string } => {
    const out: { wo?: string; wo_id?: string } = {};
    if (typeof search.wo === "string") out.wo = search.wo;
    if (typeof search.wo_id === "string") out.wo_id = search.wo_id;
    return out;
  },
  component: FmWorkOrdersRoute,
});

function FmWorkOrdersRoute() {
  const { wo, wo_id } = Route.useSearch();
  return <WorkOrdersPage moduleType="FM" focusWo={wo} focusWoId={wo_id} />;
}
