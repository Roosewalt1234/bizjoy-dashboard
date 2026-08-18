import { createFileRoute } from "@tanstack/react-router";
import { FmServiceReportsListPage } from "@/features/fm-service-reports/fm-service-reports-list";

export const Route = createFileRoute("/_authenticated/fm-service-reports")({
  validateSearch: (search: Record<string, unknown>): { wo?: string } => ({
    wo: typeof search.wo === "string" ? search.wo : undefined,
  }),
  component: FmServiceReportsRoute,
});

function FmServiceReportsRoute() {
  const { wo } = Route.useSearch();
  return <FmServiceReportsListPage prefillWo={wo} />;
}
