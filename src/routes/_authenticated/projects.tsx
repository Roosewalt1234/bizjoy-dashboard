import { createFileRoute } from "@tanstack/react-router";
import { CrudModule } from "@/components/crud-module";

export const Route = createFileRoute("/_authenticated/projects")({
  component: () => (
    <CrudModule
      title="Projects"
      description="Track ongoing projects."
      table="projects"
      fields={[
        { key: "name", label: "Name", type: "text", required: true },
        { key: "customer_name", label: "Customer", type: "text" },
        { key: "start_date", label: "Start Date", type: "date" },
        { key: "end_date", label: "End Date", type: "date" },
        { key: "budget", label: "Budget", type: "number" },
        { key: "status", label: "Status", type: "select", options: ["Planning", "In Progress", "On Hold", "Completed"] },
        { key: "description", label: "Description", type: "textarea" },
      ]}
      listColumns={["name", "customer_name", "start_date", "status", "budget"]}
    />
  ),
});
