import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/contract-assets")({
  beforeLoad: () => {
    throw redirect({ to: "/fm-assets", replace: true });
  },
});
