import { createFileRoute } from "@tanstack/react-router";
import { CustomerForm } from "@/components/customer-form";

export const Route = createFileRoute("/_authenticated/customers/$id")({
  component: CustomerEdit,
});

function CustomerEdit() {
  const { id } = Route.useParams();
  return <CustomerForm customerId={id} />;
}
