import { createFileRoute } from "@tanstack/react-router";
import { CrudModule } from "@/components/crud-module";

export const Route = createFileRoute("/sales")({
  component: () => (
    <CrudModule
      title="Sales Orders"
      description="Manage sales orders and revenue."
      table="sales_orders"
      fields={[
        { key: "order_number", label: "Order #", type: "text", required: true },
        { key: "customer_name", label: "Customer", type: "text" },
        { key: "amount", label: "Amount", type: "number" },
        { key: "status", label: "Status", type: "select", options: ["Draft", "Confirmed", "Shipped", "Completed", "Cancelled"] },
        { key: "order_date", label: "Date", type: "date" },
        { key: "notes", label: "Notes", type: "textarea" },
      ]}
      listColumns={["order_number", "customer_name", "amount", "status", "order_date"]}
    />
  ),
});
