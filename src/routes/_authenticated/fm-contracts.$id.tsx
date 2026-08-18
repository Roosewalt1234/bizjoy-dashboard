import { createFileRoute } from "@tanstack/react-router";
import { FmContractWorkspace } from "@/features/fm-contracts/fm-contract-workspace";

export const Route = createFileRoute("/_authenticated/fm-contracts/$id")({
  component: FmContractWorkspaceRoute,
});

function FmContractWorkspaceRoute() {
  const { id } = Route.useParams();
  return <FmContractWorkspace id={id} />;
}
