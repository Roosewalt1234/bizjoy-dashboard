import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/contract-service-categories")({
  beforeLoad: () => {
    throw redirect({ to: "/fm-service-categories", replace: true });
  },
});
