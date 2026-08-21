import { createFileRoute } from "@tanstack/react-router";
import { FmCleaningSchedulerWorkspacePage } from "@/features/fm-cleaning-scheduler/fm-cleaning-scheduler-workspace";

export const Route = createFileRoute("/_authenticated/fm-cleaning-scheduler")({
  component: FmCleaningSchedulerWorkspacePage,
});
