import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/contract-attendance")({
  beforeLoad: () => {
    throw redirect({ to: "/fm-attendance", replace: true });
  },
});
