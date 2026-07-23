import { createFileRoute } from "@tanstack/react-router";
import { CrudModule } from "@/components/crud-module";

export const Route = createFileRoute("/_authenticated/contracts")({
  component: () => (
    <CrudModule
      title="Contracts"
      description="Manage customer contracts."
      table="contracts"
      fields={[
        { key: "title", label: "Title", type: "text", required: true },
        { key: "customer_name", label: "Customer", type: "text" },
        { key: "start_date", label: "Start Date", type: "date" },
        { key: "end_date", label: "End Date", type: "date" },
        { key: "value", label: "Value", type: "number" },
        { key: "status", label: "Status", type: "select", options: ["Draft", "Active", "Expired", "Terminated"] },
        { key: "notes", label: "Notes", type: "textarea" },
      ]}
      listColumns={["title", "customer_name", "start_date", "end_date", "status"]}
    />
  ),
});
