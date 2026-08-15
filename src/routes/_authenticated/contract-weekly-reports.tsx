import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/contract-weekly-reports")({
  beforeLoad: () => {
    throw redirect({ to: "/fm-weekly-reports", replace: true });
  },
});
