// Upserts quotations (Zoho Books calls them "Estimates") into this
// dashboard's quotes/quote_items tables. One-directional (Zoho -> dashboard):
// never writes back to Zoho, never deletes a quote/quote_items row here even
// if it disappears from Zoho's results, and never touches the two
// dashboard-only columns (probability, quote_type) - the upsert below lists
// every column it writes explicitly.
//
// This function does NOT call Zoho itself. Supabase's outbound requests to
// Zoho's accounts.zoho.com token endpoint were consistently rejected
// ("invalid_code") even with verified-correct credentials, while the exact
// same request succeeded every time from an ordinary residential/office
// network - strongly indicating Zoho blocks/flags requests from Supabase's
// shared cloud IP ranges. Rather than fight that, an n8n workflow (running
// on different infrastructure) does the Zoho OAuth token refresh and
// estimate fetching/pagination, then POSTs the raw estimate objects here for
// just the database upsert - reusing all the mapping/upsert logic that was
// already built and verified, without re-implementing it inside n8n.
//
// Auth: not user-facing - checks a shared secret header, same pattern as
// convert-ppm-visit. Deploy with verify_jwt=false and set this Edge
// Function secret via the Supabase Dashboard before calling it:
//   ZOHO_SYNC_AUTOMATION_SECRET
//
// POST body: { "estimates": [ <Zoho Books estimate objects - the "estimate"
//   field from GET /books/v3/estimates/{id}, one per array entry> ] }

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const AUTOMATION_SECRET = Deno.env.get("ZOHO_SYNC_AUTOMATION_SECRET");

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function mapStatus(zohoStatus: string | null | undefined): string | null {
  if (!zohoStatus) return null;
  return zohoStatus.toLowerCase();
}

async function syncOneEstimate(est: any) {
  if (!est?.estimate_id) throw new Error("Estimate object is missing estimate_id");

  // Every column this sync ever writes is listed explicitly here - notably
  // absent: probability, quote_type. Those are set by sales staff in this
  // dashboard and this upsert must never overwrite them.
  const quotePayload = {
    zoho_quote_id: est.estimate_id,
    zoho_customer_id: est.customer_id ?? null,
    quote_number: est.estimate_number ?? null,
    quote_date: est.date ?? null,
    expiry_date: est.expiry_date ?? null,
    customer_name: est.customer_name ?? null,
    status: mapStatus(est.status),
    subtotal: est.sub_total ?? null,
    total: est.total ?? null,
    vat_amount: est.tax_total ?? null,
    currency: est.currency_code ?? null,
    terms: est.terms ?? null,
    purchase_order: est.reference_number ?? null,
    notes: est.notes ?? null,
  };

  const { data: quoteRow, error: upsertError } = await supabase
    .from("quotes")
    .upsert(quotePayload, { onConflict: "zoho_quote_id" })
    .select("id")
    .single();
  if (upsertError) throw new Error(`Upsert failed for ${est.estimate_id}: ${upsertError.message}`);

  const quoteId = quoteRow.id as string;

  // No stable per-line-item ID from Zoho to diff against, so replace the
  // whole set on every sync - simplest way to stay correct when items are
  // added/removed/edited in Zoho between runs.
  const { error: deleteError } = await supabase.from("quote_items").delete().eq("quote_id", quoteId);
  if (deleteError) throw new Error(`Line item cleanup failed for ${est.estimate_id}: ${deleteError.message}`);

  const lineItems = (est.line_items ?? []).map((item: any, index: number) => ({
    quote_id: quoteId,
    description: [item.name, item.description].filter(Boolean).join(" - ") || item.name || "Item",
    quantity: item.quantity ?? 1,
    unit_price: item.rate ?? 0,
    amount: item.item_total ?? 0,
    sort_order: index,
  }));

  if (lineItems.length > 0) {
    const { error: insertError } = await supabase.from("quote_items").insert(lineItems);
    if (insertError) throw new Error(`Line item insert failed for ${est.estimate_id}: ${insertError.message}`);
  }

  return quoteId;
}

Deno.serve(async (req: Request) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type, x-automation-secret",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  if (!AUTOMATION_SECRET || req.headers.get("x-automation-secret") !== AUTOMATION_SECRET) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const startedAt = new Date().toISOString();
  let synced = 0;
  const failures: { estimate_id: string; error: string }[] = [];

  try {
    const body = await req.json().catch(() => ({}));
    const estimates: any[] = Array.isArray(body?.estimates) ? body.estimates : [];

    for (const est of estimates) {
      try {
        await syncOneEstimate(est);
        synced += 1;
      } catch (err) {
        failures.push({ estimate_id: est?.estimate_id ?? "unknown", error: (err as Error).message });
      }
    }

    await supabase.from("zoho_sync_log").insert({
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      quotes_found: estimates.length,
      quotes_synced: synced,
      quotes_failed: failures.length,
      error_summary: failures.length > 0 ? JSON.stringify(failures).slice(0, 4000) : null,
    });

    return new Response(
      JSON.stringify({ found: estimates.length, synced, failed: failures.length, failures }),
      { headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (err) {
    await supabase.from("zoho_sync_log").insert({
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      quotes_found: 0,
      quotes_synced: synced,
      quotes_failed: failures.length,
      error_summary: (err as Error).message.slice(0, 4000),
    });
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
