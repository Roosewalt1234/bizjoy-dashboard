import { createFileRoute } from "@tanstack/react-router";
import { OperationsUniverse } from "@/features/operations-universe/OperationsUniverse";
import { usePermissions } from "@/hooks/use-permissions";

export const Route = createFileRoute("/_authenticated/universe")({
  component: UniversePage,
  head: () => ({
    meta: [
      { title: "Operations Universe | Fiz Fix ERP" },
      {
        name: "description",
        content:
          "Explore contracts, work orders, and payments as a connected map instead of separate tables.",
      },
      { property: "og:title", content: "Operations Universe | Fiz Fix ERP" },
      { property: "og:description", content: "An interactive graph view of Fiz Fix operations." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function UniversePage() {
  const { can, isLoading } = usePermissions();

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (!can("contracts", "view")) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            You don't have access to this page
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Contact your administrator if you believe this is a mistake.
          </p>
        </div>
      </div>
    );
  }

  return <OperationsUniverse />;
}
