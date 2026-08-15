import { createFileRoute } from "@tanstack/react-router";
import { ContractsPage } from "./contracts";

export const Route = createFileRoute("/_authenticated/amc-contracts")({
  component: () => <ContractsPage moduleType="AMC" />,
});
