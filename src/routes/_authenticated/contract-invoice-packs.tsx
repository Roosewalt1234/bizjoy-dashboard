import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/contract-invoice-packs")({
  beforeLoad: () => {
    throw redirect({ to: "/fm-invoice-packs", replace: true });
  },
});
