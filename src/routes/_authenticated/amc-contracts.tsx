import { createFileRoute } from "@tanstack/react-router";
import { ContractsPage } from "@/components/contracts-page";

export const Route = createFileRoute("/_authenticated/amc-contracts")({
  validateSearch: (search: Record<string, unknown>): { edit?: string } =>
    typeof search.edit === "string" ? { edit: search.edit } : {},
  component: AmcContractsRoute,
});

function AmcContractsRoute() {
  const { edit } = Route.useSearch();
  return <ContractsPage moduleType="AMC" focusContractId={edit} />;
}
