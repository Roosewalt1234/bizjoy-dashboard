import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/contract-sla")({
  beforeLoad: () => {
    throw redirect({ to: "/fm-sla", replace: true });
  },
});
