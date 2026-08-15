import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/contracts/$id")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/amc-contracts/$id", params: { id: params.id }, replace: true });
  },
});
