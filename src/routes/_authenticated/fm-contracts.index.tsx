import { createFileRoute } from "@tanstack/react-router";
import { FmContractsListPage } from "@/features/fm-contracts/fm-contracts-list";

export const Route = createFileRoute("/_authenticated/fm-contracts/")({
  component: FmContractsListPage,
});
