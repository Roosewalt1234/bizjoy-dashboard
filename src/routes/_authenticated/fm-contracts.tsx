import { createFileRoute } from "@tanstack/react-router";
import { ContractsPage } from "@/components/contracts-page";

export const Route = createFileRoute("/_authenticated/fm-contracts")({
  component: () => <ContractsPage moduleType="FM" />,
});
