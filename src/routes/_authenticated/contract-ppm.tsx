import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/contract-ppm")({
  beforeLoad: () => {
    throw redirect({ to: "/fm-ppm", replace: true });
  },
});
