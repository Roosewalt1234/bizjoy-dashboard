import { createFileRoute } from "@tanstack/react-router";
import { ContractWorkspace } from "@/components/contract-workspace";

export const Route = createFileRoute("/_authenticated/fm-contracts/$id")({
  component: FmContractWorkspaceRoute,
});

function FmContractWorkspaceRoute() {
  const { id } = Route.useParams();
  return <ContractWorkspace id={id} moduleType="FM" />;
}
