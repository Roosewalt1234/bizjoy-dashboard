// Sends a push notification to one employee's mobile device via Expo's push API.
// Generic/reusable on purpose - currently called when a reactive work order gets assigned
// (from the web app's FM Work Orders save flow), but any future "you were assigned X" flow
// (cleaning schedule, PPM schedule, etc.) can call this same function instead of duplicating
// the Expo push call.
//
// Auth: user-facing, called from the authenticated web app - standard Supabase JWT auth
// (verify_jwt defaults to true), no shared secret needed.
//
// POST body: { "employeeId": "<uuid>", "title": "...", "body": "...", "data"?: {...} }
// If the employee has no registered push token yet, this is a no-op success (not an error) -
// not everyone will have opened the mobile app and granted notification permission yet.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  let payload: { employeeId?: string; title?: string; body?: string; data?: Record<string, unknown> };
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
  }

  const { employeeId, title, body, data } = payload;
  if (!employeeId || !title || !body) {
    return new Response(JSON.stringify({ error: "employeeId, title and body are required" }), { status: 400 });
  }

  const { data: employee, error } = await supabase
    .from("employees")
    .select("expo_push_token")
    .eq("id", employeeId)
    .maybeSingle();

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const token = employee?.expo_push_token;
  if (!token) {
    return new Response(JSON.stringify({ sent: false, reason: "No registered device for this employee" }), { status: 200 });
  }

  const expoResponse = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ to: token, title, body, data: data ?? {}, sound: "default", priority: "high" }),
  });

  const expoResult = await expoResponse.json().catch(() => null);
  if (!expoResponse.ok) {
    return new Response(JSON.stringify({ sent: false, error: expoResult ?? "Expo push request failed" }), { status: 502 });
  }

  return new Response(JSON.stringify({ sent: true, result: expoResult }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
