import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/cleaning-schedules")({
  component: CleaningSchedulesPage,
});

function CleaningSchedulesPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Cleaning Schedules</h1>
        <p className="text-muted-foreground text-sm">Plan and track cleaning schedules.</p>
      </div>
      <Card className="p-10 text-center text-muted-foreground">
        Cleaning schedules coming soon.
      </Card>
    </div>
  );
}
