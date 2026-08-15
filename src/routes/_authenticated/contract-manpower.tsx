import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/contract-manpower")({
  beforeLoad: () => {
    throw redirect({ to: "/fm-manpower", replace: true });
  },
});
