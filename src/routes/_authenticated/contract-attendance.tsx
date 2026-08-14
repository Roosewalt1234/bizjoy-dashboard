import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/contract-attendance")({
  component: ContractAttendancePage,
});

function ContractAttendancePage() {
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Attendance</h1>
        <p className="text-muted-foreground">Module coming next</p>
      </div>
      <Card className="p-6 text-sm text-muted-foreground">Module coming next</Card>
    </div>
  );
}
