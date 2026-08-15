import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/fm-cleaning-areas")({
  component: CleaningAreasPage,
});

function CleaningAreasPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Cleaning Areas</h1>
        <p className="text-muted-foreground text-sm">Define and manage FM cleaning areas.</p>
      </div>
      <Card className="p-10 text-center text-muted-foreground">
        Cleaning Areas module coming soon.
      </Card>
    </div>
  );
}
