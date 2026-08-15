import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/contract-monthly-reports")({
  beforeLoad: () => {
    throw redirect({ to: "/fm-monthly-reports", replace: true });
  },
});
