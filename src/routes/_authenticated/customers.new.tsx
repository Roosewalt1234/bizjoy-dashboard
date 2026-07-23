import { createFileRoute } from "@tanstack/react-router";
import { CustomerForm } from "@/components/customer-form";

export const Route = createFileRoute("/_authenticated/customers/new")({
  component: () => <CustomerForm />,
});
