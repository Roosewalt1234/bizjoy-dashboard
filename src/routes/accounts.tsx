import { createFileRoute } from "@tanstack/react-router";
import { CrudModule } from "@/components/crud-module";

export const Route = createFileRoute("/accounts")({
  component: () => (
    <CrudModule
      title="Accounts"
      description="Track income and expenses."
      table="accounts_transactions"
      fields={[
        { key: "transaction_date", label: "Date", type: "date", required: true },
        { key: "type", label: "Type", type: "select", options: ["Income", "Expense"] },
        { key: "category", label: "Category", type: "text" },
        { key: "description", label: "Description", type: "textarea" },
        { key: "amount", label: "Amount", type: "number" },
        { key: "currency", label: "Currency", type: "select", options: ["AED", "Euro", "USD"] },
      ]}
      listColumns={["transaction_date", "type", "category", "amount", "currency"]}
    />
  ),
});
