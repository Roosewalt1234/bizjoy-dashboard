import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/contract-line-items")({
  beforeLoad: () => {
    throw redirect({ to: "/fm-contract-line-items", replace: true });
  },
});
