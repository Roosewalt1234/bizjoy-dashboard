import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/fm-cleaning-scheduler")({
  component: CleaningSchedulerPage,
});

function CleaningSchedulerPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Cleaning Scheduler</h1>
        <p className="text-muted-foreground text-sm">Schedule and assign FM cleaning tasks.</p>
      </div>
      <Card className="p-10 text-center text-muted-foreground">
        Cleaning Scheduler module coming soon.
      </Card>
    </div>
  );
}
