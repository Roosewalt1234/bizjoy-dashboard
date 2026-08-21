import { createFileRoute } from "@tanstack/react-router";
import { FmCleaningAreasWorkspacePage } from "@/features/fm-cleaning-areas/fm-cleaning-areas-workspace";

export const Route = createFileRoute("/_authenticated/fm-cleaning-areas")({
  component: FmCleaningAreasWorkspacePage,
});
