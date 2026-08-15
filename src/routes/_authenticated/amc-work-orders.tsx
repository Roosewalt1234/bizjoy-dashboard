import { createFileRoute } from "@tanstack/react-router";
import { WorkOrdersPage } from "@/components/work-orders-page";

export const Route = createFileRoute("/_authenticated/amc-work-orders")({
  component: () => <WorkOrdersPage moduleType="AMC" />,
});
