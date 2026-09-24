import { createFileRoute } from "@tanstack/react-router";
import { OperationsUniverse } from "@/features/operations-universe/OperationsUniverse";

export const Route = createFileRoute("/_authenticated/universe")({
  component: UniversePage,
  head: () => ({
    meta: [
      { title: "Operations Universe | Fiz Fix ERP" },
      { name: "description", content: "Explore contracts, work orders, and payments as a connected map instead of separate tables." },
      { property: "og:title", content: "Operations Universe | Fiz Fix ERP" },
      { property: "og:description", content: "An interactive graph view of Fiz Fix operations." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function UniversePage() {
  return <OperationsUniverse />;
}
