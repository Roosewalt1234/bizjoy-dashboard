import { createFileRoute } from "@tanstack/react-router";
import { ContractWorkspace } from "@/components/contract-workspace";

export const Route = createFileRoute("/_authenticated/amc-contracts/$id")({
  component: AmcContractWorkspaceRoute,
});

function AmcContractWorkspaceRoute() {
  const { id } = Route.useParams();
  return <ContractWorkspace id={id} moduleType="AMC" />;
}
