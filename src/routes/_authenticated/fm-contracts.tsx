import { createFileRoute } from "@tanstack/react-router";
import { ContractsPage } from "./contracts";

export const Route = createFileRoute("/_authenticated/fm-contracts")({
  component: () => <ContractsPage moduleType="FM" />,
});
