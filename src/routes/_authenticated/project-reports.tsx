import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/project-reports")({
  component: ProjectReportsPage,
});

function ProjectReportsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Project Reports</h1>
        <p className="text-muted-foreground text-sm">View and export project performance reports.</p>
      </div>
      <Card className="p-10 text-center text-muted-foreground">
        Project reports coming soon.
      </Card>
    </div>
  );
}
