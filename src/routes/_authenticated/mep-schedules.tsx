import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/mep-schedules")({
  component: MepSchedulesPage,
});

function MepSchedulesPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">MEP Schedules</h1>
        <p className="text-muted-foreground text-sm">Plan mechanical, electrical and plumbing schedules.</p>
      </div>
      <Card className="p-10 text-center text-muted-foreground">
        MEP schedules coming soon.
      </Card>
    </div>
  );
}
