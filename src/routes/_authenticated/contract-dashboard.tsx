import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/contract-dashboard")({
  beforeLoad: () => {
    throw redirect({ to: "/fm-dashboard", replace: true });
  },
});
