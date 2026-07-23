import { createFileRoute } from "@tanstack/react-router";
import { CrudModule } from "@/components/crud-module";

export const Route = createFileRoute("/_authenticated/hr")({
  component: () => (
    <CrudModule
      title="Human Resources"
      createTitle="Add New Employee"
      description="Manage employees and staff."
      table="employees"
      fields={[
        { key: "first_name", label: "First Name", type: "text", required: true },
        { key: "last_name", label: "Last Name", type: "text" },
        { key: "email", label: "Email", type: "text" },
        { key: "phone", label: "Phone", type: "text" },
        { key: "position", label: "Position", type: "select", options: ["Manager", "Asst Manager", "Estimator", "Customer Care Exec", "Accounts Head", "Accounts Assistant", "Purchase Exec", "CAFM Exec", "MEP Supervisor", "Cleaning Supervisor", "MEP Team Lead", "Cleaning Team Lead", "Helper", "Plumber", "Electrician", "AC Technician", "Multy Technician", "Mason", "Tile Mason", "Painter", "Gypsum Mason", "Carpenter", "Gypsum & Carpenter", "Driver", "Cleaner Male", "Cleaner Female", "Maid", "Handyman", "Swimming Pool Technician", "Life Guard", "Office Boy"] },
        { key: "department", label: "Department", type: "text" },
        { key: "salary", label: "Salary", type: "number" },
        { key: "hire_date", label: "Hire Date", type: "date" },
        { key: "status", label: "Status", type: "select", options: ["Active", "On Leave", "Terminated"] },
      ]}
      listColumns={["first_name", "last_name", "position", "department", "status"]}
    />
  ),
});
