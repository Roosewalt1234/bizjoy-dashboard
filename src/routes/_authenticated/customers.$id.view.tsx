import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Pencil } from "lucide-react";

export const Route = createFileRoute("/_authenticated/customers/$id/view")({
  component: CustomerView,
});

function Field({ label, value }: { label: string; value: any }) {
  return (
    <div className="grid grid-cols-12 gap-2 py-2 border-b last:border-b-0">
      <div className="col-span-4 text-sm text-muted-foreground">{label}</div>
      <div className="col-span-8 text-sm">{value ?? "—"}</div>
    </div>
  );
}

function CustomerView() {
  const { id } = Route.useParams();
  const navigate = useNavigate();

  const { data: customer, isLoading } = useQuery({
    queryKey: ["customer", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("*").eq("id", id).single();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: contacts = [] } = useQuery({
    queryKey: ["customer-contacts", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("customer_contacts").select("*").eq("customer_id", id);
      if (error) throw error;
      return data as any[];
    },
  });

  if (isLoading || !customer) {
    return <div className="p-6 text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/customers"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{customer.display_name}</h1>
            <div className="flex gap-2 mt-1">
              <Badge variant="secondary">{customer.customer_type}</Badge>
              <Badge variant={customer.is_active !== false ? "default" : "outline"}>
                {customer.is_active !== false ? "Active" : "Inactive"}
              </Badge>
            </div>
          </div>
        </div>
        <Button onClick={() => navigate({ to: "/customers/$id", params: { id } })}>
          <Pencil className="h-4 w-4 mr-2" /> Edit
        </Button>
      </div>

      <Card className="p-4">
        <h2 className="font-semibold mb-2 text-sm uppercase tracking-wide text-muted-foreground">Primary Contact</h2>
        <Field label="Name" value={[customer.salutation, customer.first_name, customer.last_name].filter(Boolean).join(" ")} />
        <Field label="Company" value={customer.company_name} />
        <Field label="Email" value={customer.email} />
        <Field label="Phone" value={customer.phone} />
        <Field label="Work Phone" value={customer.work_phone} />
        <Field label="Mobile" value={customer.mobile} />
        <Field label="Language" value={customer.customer_language} />
      </Card>

      <Card className="p-4">
        <h2 className="font-semibold mb-2 text-sm uppercase tracking-wide text-muted-foreground">Financial</h2>
        <Field label="Currency" value={customer.currency} />
        <Field label="Opening Balance" value={customer.opening_balance} />
        <Field label="Payment Terms" value={customer.payment_terms} />
        <Field label="Portal Access" value={customer.enable_portal ? "Enabled" : "Disabled"} />
      </Card>

      <Card className="p-4">
        <h2 className="font-semibold mb-2 text-sm uppercase tracking-wide text-muted-foreground">Address</h2>
        <Field label="Street" value={customer.address_street} />
        <Field label="City" value={customer.address_city} />
        <Field label="State" value={customer.address_state} />
        <Field label="Country" value={customer.address_country} />
        <Field label="Postal Code" value={customer.address_postal_code} />
        <Field label="Latitude / Longitude" value={customer.address_lat && customer.address_lng ? `${customer.address_lat}, ${customer.address_lng}` : null} />
        <Field label="Telephone" value={customer.address_telephone} />
        <Field label="Mobile" value={customer.address_mobile} />
      </Card>

      <Card className="p-4">
        <h2 className="font-semibold mb-2 text-sm uppercase tracking-wide text-muted-foreground">Billing Address</h2>
        <Field label="Street" value={customer.billing_street} />
        <Field label="City" value={customer.billing_city} />
        <Field label="State" value={customer.billing_state} />
        <Field label="Country" value={customer.billing_country} />
        <Field label="Postal Code" value={customer.billing_postal_code} />
      </Card>

      {contacts.length > 0 && (
        <Card className="p-4">
          <h2 className="font-semibold mb-2 text-sm uppercase tracking-wide text-muted-foreground">Contact Persons</h2>
          <div className="space-y-2">
            {contacts.map((p) => (
              <div key={p.id} className="grid grid-cols-4 gap-2 text-sm border-b py-2 last:border-b-0">
                <div>{[p.first_name, p.last_name].filter(Boolean).join(" ") || "—"}</div>
                <div>{p.email ?? "—"}</div>
                <div>{p.work_phone ?? "—"}</div>
                <div>{p.mobile ?? "—"}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {customer.special_instructions && (
        <Card className="p-4">
          <h2 className="font-semibold mb-2 text-sm uppercase tracking-wide text-muted-foreground">Special Instructions</h2>
          <p className="text-sm whitespace-pre-wrap">{customer.special_instructions}</p>
        </Card>
      )}
    </div>
  );
}
