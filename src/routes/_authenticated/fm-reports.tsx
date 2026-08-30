import { createFileRoute } from "@tanstack/react-router";
import { FmReportsPage } from "@/features/fm-reports/fm-reports-page";

export const Route = createFileRoute("/_authenticated/fm-reports")({
  component: FmReportsPage,
});
