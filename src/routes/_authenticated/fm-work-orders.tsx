import { createFileRoute } from "@tanstack/react-router";
import { WorkOrdersPage } from "@/components/work-orders-page";

export const Route = createFileRoute("/_authenticated/fm-work-orders")({
  component: () => <WorkOrdersPage moduleType="FM" />,
});
