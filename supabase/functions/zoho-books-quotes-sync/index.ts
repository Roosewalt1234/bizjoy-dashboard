// Syncs quotations (Zoho Books calls them "Estimates") from Zoho Books into
// this dashboard's quotes/quote_items tables, three times a day via pg_cron.
// One-directional (Zoho -> dashboard): never writes back to Zoho, never
// deletes a quote/quote_items row here even if it disappears from Zoho's
// results, and never touches the two dashboard-only columns (probability,
// quote_type) - the upsert below lists every column it writes explicitly.
//
// Auth: not user-facing - checks a shared secret header, same pattern as
// convert-ppm-visit. Uses its OWN secret name (ZOHO_SYNC_AUTOMATION_SECRET)
// rather than convert-ppm-visit's AUTOMATION_SHARED_SECRET, since that one
// is already in use by n8n for PPM-visit conversion and must not be
// rotated/shared here. Deploy with verify_jwt=false and set these Edge
// Function secrets via the Supabase Dashboard before calling it:
//   ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN,
//   ZOHO_ORGANIZATION_ID, ZOHO_SYNC_AUTOMATION_SECRET
//
// POST body: {} (no parameters - always does a full sync of every estimate)

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const AUTOMATION_SECRET = Deno.env.get("ZOHO_SYNC_AUTOMATION_SECRET");

const ZOHO_CLIENT_ID = Deno.env.get("ZOHO_CLIENT_ID")!;
const ZOHO_CLIENT_SECRET = Deno.env.get("ZOHO_CLIENT_SECRET")!;
const ZOHO_REFRESH_TOKEN = Deno.env.get("ZOHO_REFRESH_TOKEN")!;
const ZOHO_ORG_ID = Deno.env.get("ZOHO_ORGANIZATION_ID")!;

const ZOHO_ACCOUNTS_BASE = "https://accounts.zoho.com";
const ZOHO_BOOKS_BASE = "https://www.zohoapis.com/books/v3";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function getAccessToken(): Promise<string> {
  const resp = await fetch(`${ZOHO_ACCOUNTS_BASE}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: ZOHO_CLIENT_ID,
      client_secret: ZOHO_CLIENT_SECRET,
      refresh_token: ZOHO_REFRESH_TOKEN,
    }),
  });
  const json = await resp.json();
  if (!resp.ok || !json.access_token) {
    throw new Error(`Zoho token refresh failed: ${JSON.stringify(json)}`);
  }
  return json.access_token as string;
}

async function zohoFetch(accessToken: string, path: string) {
  const separator = path.includes("?") ? "&" : "?";
  const url = `${ZOHO_BOOKS_BASE}${path}${separator}organization_id=${ZOHO_ORG_ID}`;
  const resp = await fetch(url, {
    headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
  });
  const json = await resp.json();
  if (!resp.ok || json.code !== 0) {
    throw new Error(`Zoho Books API error (${path}): ${JSON.stringify(json)}`);
  }
  return json;
}

async function listAllEstimateIds(accessToken: string): Promise<string[]> {
  const ids: string[] = [];
  let page = 1;
  for (;;) {
    const json = await zohoFetch(accessToken, `/estimates?page=${page}&per_page=200`);
    for (const est of json.estimates ?? []) ids.push(est.estimate_id);
    if (!json.page_context?.has_more_page) break;
    page += 1;
  }
  return ids;
}

function mapStatus(zohoStatus: string | null | undefined): string | null {
  if (!zohoStatus) return null;
  return zohoStatus.toLowerCase();
}

async function syncOneEstimate(accessToken: string, estimateId: string) {
  const detail = await zohoFetch(accessToken, `/estimates/${estimateId}`);
  const est = detail.estimate;

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
  if (upsertError) throw new Error(`Upsert failed for ${estimateId}: ${upsertError.message}`);

  const quoteId = quoteRow.id as string;

  // No stable per-line-item ID from Zoho to diff against, so replace the
  // whole set on every sync - simplest way to stay correct when items are
  // added/removed/edited in Zoho between runs.
  const { error: deleteError } = await supabase.from("quote_items").delete().eq("quote_id", quoteId);
  if (deleteError) throw new Error(`Line item cleanup failed for ${estimateId}: ${deleteError.message}`);

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
    if (insertError) throw new Error(`Line item insert failed for ${estimateId}: ${insertError.message}`);
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
    const accessToken = await getAccessToken();
    const ids = await listAllEstimateIds(accessToken);

    for (const id of ids) {
      try {
        await syncOneEstimate(accessToken, id);
        synced += 1;
      } catch (err) {
        failures.push({ estimate_id: id, error: (err as Error).message });
      }
      // Small courtesy delay between per-estimate detail calls.
      await new Promise((resolve) => setTimeout(resolve, 150));
    }

    await supabase.from("zoho_sync_log").insert({
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      quotes_found: ids.length,
      quotes_synced: synced,
      quotes_failed: failures.length,
      error_summary: failures.length > 0 ? JSON.stringify(failures).slice(0, 4000) : null,
    });

    return new Response(
      JSON.stringify({ found: ids.length, synced, failed: failures.length, failures }),
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
