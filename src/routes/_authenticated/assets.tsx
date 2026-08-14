import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/assets")({
  component: AssetsPage,
});

function AssetsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Assets</h1>
        <p className="text-muted-foreground text-sm">Register and track project assets.</p>
      </div>
      <Card className="p-10 text-center text-muted-foreground">
        Asset register coming soon.
      </Card>
    </div>
  );
}
