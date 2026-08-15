import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/work-orders")({
  beforeLoad: () => {
    throw redirect({ to: "/amc-work-orders", replace: true });
  },
});
