import { createFileRoute } from "@tanstack/react-router";
import { WorkOrdersPage } from "./work-orders";

export const Route = createFileRoute("/_authenticated/fm-work-orders")({
  component: () => <WorkOrdersPage moduleType="FM" />,
});
