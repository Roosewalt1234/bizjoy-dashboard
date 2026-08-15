import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/service")({
  beforeLoad: () => {
    throw redirect({ to: "/amc-service-reports", search: { wo: undefined }, replace: true });
  },
});
