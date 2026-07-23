import { createFileRoute } from "@tanstack/react-router";
import { CrudModule } from "@/components/crud-module";

export const Route = createFileRoute("/_authenticated/hr")({
  component: () => (
    <CrudModule
      title="Human Resources"
      description="Manage employees and staff."
      table="employees"
      fields={[
        { key: "first_name", label: "First Name", type: "text", required: true },
        { key: "last_name", label: "Last Name", type: "text" },
        { key: "email", label: "Email", type: "text" },
        { key: "phone", label: "Phone", type: "text" },
        { key: "position", label: "Position", type: "text" },
        { key: "department", label: "Department", type: "text" },
        { key: "salary", label: "Salary", type: "number" },
        { key: "hire_date", label: "Hire Date", type: "date" },
        { key: "status", label: "Status", type: "select", options: ["Active", "On Leave", "Terminated"] },
      ]}
      listColumns={["first_name", "last_name", "position", "department", "status"]}
    />
  ),
});
