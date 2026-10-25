// Queue bridge between the CRM and Anna (WhatsApp bot on the Dell) for snag alerts.
//
// Auth: NOT a Supabase JWT (verify_jwt is false). Anna calls this with a shared secret in the
// `x-snag-bot-secret` header, compared against the SNAG_BOT_SECRET function secret. Fail closed:
// if SNAG_BOT_SECRET is unset/empty, EVERY request is rejected with 401. The secret check runs
// before anything else (method, body), so unauthenticated callers learn nothing.
//
// POST {"action":"claim","limit":5}
//   -> 200 {"items":[{notification_id, claim_token, work_order_id, wo_no, technician_name,
//        site_name, location, service_type, priority, problem_reported, reported_at,
//        photo_url, attempts}]}
//   photo_url is a 300 s signed URL (bucket work-order-photos). If signing fails the claim is
//   reported back as 'retry' ('sign_failed') and the item is dropped from the response.
// POST {"action":"report","id":"<uuid>","claim_token":"<uuid>","outcome":"sent|retry|uncertain",
//        "wa_message_id"?:string,"error"?:string}
//   -> 200 {"status":"<resulting status>"}; stale claim_token -> 409.
// Errors: 401 bad/missing secret, 405 non-POST, 400 bad body.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SNAG_BOT_SECRET = Deno.env.get("SNAG_BOT_SECRET") ?? "";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const BUCKET = "work-order-photos";
const SIGNED_URL_TTL_SECONDS = 300;
const OUTCOMES = ["sent", "retry", "uncertain"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function sha256(s: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
}

// Constant time: compare fixed-length digests byte by byte without early exit.
async function secretMatches(provided: string): Promise<boolean> {
  const [a, b] = await Promise.all([sha256(provided), sha256(SNAG_BOT_SECRET)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

Deno.serve(async (req) => {
  // 1. Fail closed, before anything else.
  if (!SNAG_BOT_SECRET) return json({ error: "Unauthorized" }, 401);
  const provided = req.headers.get("x-snag-bot-secret") ?? "";
  if (!provided || !(await secretMatches(provided))) return json({ error: "Unauthorized" }, 401);

  // 2. Method.
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // 3. Body.
  let payload: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("bad");
    payload = parsed as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  if (payload.action === "claim") {
    let limit = Number(payload.limit ?? 5);
    if (!Number.isFinite(limit)) limit = 5;
    limit = Math.min(10, Math.max(1, Math.floor(limit)));

    const { data, error } = await supabase.rpc("snag_bot_claim", { p_limit: limit });
    if (error) {
      console.error("snag_bot_claim failed");
      return json({ error: "Claim failed" }, 500);
    }

    const items: Record<string, unknown>[] = [];
    for (const row of data ?? []) {
      let photoUrl: string | null = null;
      if (row.photo_path) {
        const { data: signed, error: signErr } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(row.photo_path, SIGNED_URL_TTL_SECONDS);
        photoUrl = signed?.signedUrl ?? null;
        if (signErr) photoUrl = null;
      }
      if (!photoUrl) {
        const { error: repErr } = await supabase.rpc("snag_bot_report", {
          p_id: row.notification_id,
          p_claim_token: row.claim_token,
          p_outcome: "retry",
          p_wa_message_id: null,
          p_error: "sign_failed",
        });
        if (repErr) console.error("snag_bot_report (sign_failed) failed");
        continue;
      }
      const { photo_path: _omit, ...rest } = row;
      items.push({ ...rest, photo_url: photoUrl });
    }
    return json({ items });
  }

  if (payload.action === "report") {
    const { id, claim_token, outcome, wa_message_id, error: errText } = payload;
    if (
      typeof id !== "string" || !UUID_RE.test(id) ||
      typeof claim_token !== "string" || !UUID_RE.test(claim_token) ||
      typeof outcome !== "string" || !OUTCOMES.includes(outcome) ||
      (wa_message_id !== undefined && wa_message_id !== null && typeof wa_message_id !== "string") ||
      (errText !== undefined && errText !== null && typeof errText !== "string")
    ) {
      return json({ error: "Invalid report body" }, 400);
    }

    const { data, error } = await supabase.rpc("snag_bot_report", {
      p_id: id,
      p_claim_token: claim_token,
      p_outcome: outcome,
      p_wa_message_id: (wa_message_id as string | null | undefined) ?? null,
      p_error: typeof errText === "string" ? errText.slice(0, 500) : null,
    });
    if (error) {
      const msg = error.message ?? "";
      if (msg.includes("claim_token_mismatch")) return json({ error: "claim_token_mismatch" }, 409);
      if (msg.includes("invalid_outcome")) return json({ error: "Invalid report body" }, 400);
      if (msg.includes("notification_not_found")) return json({ error: "notification_not_found" }, 404);
      console.error("snag_bot_report failed");
      return json({ error: "Report failed" }, 500);
    }
    return json({ status: data });
  }

  return json({ error: "Unknown action" }, 400);
});
