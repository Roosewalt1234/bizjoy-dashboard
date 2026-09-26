// src/lib/gm-assistant/action-tokens.ts
//
// Signs and verifies short-lived "pending action" tokens for the GM Assistant's two controlled
// write actions. There is no database table for pending actions - the token itself is the sole
// record, since Cloudflare Workers cannot reliably share in-process memory across requests (the
// same constraint universe-bridge.ts already documents for a different reason). The signature
// makes the token's contents tamper-evident; expiresAt and userId are re-checked at confirm time
// from the token's own signed contents, never trusted from a second source.

import { createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_TTL_MS = 120_000;
// A real token is a small, fixed-shape JSON payload - generously over-sized to allow for future
// fields, but still small enough to reject a wildly oversized string cheaply, before spending a
// decode/HMAC/parse cycle on it.
const MAX_TOKEN_LENGTH = 2048;

export interface PendingActionPayload {
  action: "assign_technician" | "update_work_order_status";
  domain: "AMC" | "FM";
  workOrderId: string;
  /** The work order's technician_id (assign) or status (status update) at preview time. */
  expectedCurrentValue: string | null;
  /** The technician_id (assign) or status (status update) to write on confirm. */
  proposedNewValue: string;
  userId: string;
  issuedAt: number;
  expiresAt: number;
}

function getSecret(): string {
  // Read lazily (inside a function, not at module scope) - this file has no .server.ts suffix
  // and is imported (transitively, via gm-assistant.functions.ts) into GmAssistant.tsx, which
  // ships to the client bundle. Same lazy-read convention already established in
  // ai-provider.ts/transcription-provider.ts for exactly this reason.
  const secret = process.env.GM_ASSISTANT_ACTION_SECRET;
  if (!secret) throw new Error("GM_ASSISTANT_ACTION_SECRET is not configured");
  return secret;
}

function sign(payloadJson: string): string {
  return createHmac("sha256", getSecret()).update(payloadJson).digest("base64url");
}

export function createActionToken(
  payload: Omit<PendingActionPayload, "issuedAt" | "expiresAt">,
): string {
  const issuedAt = Date.now();
  const full: PendingActionPayload = { ...payload, issuedAt, expiresAt: issuedAt + TOKEN_TTL_MS };
  const payloadJson = JSON.stringify(full);
  const payloadBase64 = Buffer.from(payloadJson, "utf8").toString("base64url");
  return `${payloadBase64}.${sign(payloadJson)}`;
}

export type VerifyResult =
  | { valid: true; payload: PendingActionPayload }
  | { valid: false; reason: "malformed" | "signature-mismatch" | "expired" | "wrong-user" };

export function verifyActionToken(token: string, expectedUserId: string): VerifyResult {
  // Guards against a non-string/missing token reaching .split() below (a plausible shape at a
  // server-fn boundary whose input isn't schema-validated) and against spending a decode/HMAC/
  // parse cycle on a pathologically oversized string - both handled here rather than left to an
  // uncaught exception, since this function's entire purpose is to safely absorb hostile input.
  if (typeof token !== "string" || token.length === 0 || token.length > MAX_TOKEN_LENGTH) {
    return { valid: false, reason: "malformed" };
  }

  const parts = token.split(".");
  if (parts.length !== 2) return { valid: false, reason: "malformed" };
  const [payloadBase64, signature] = parts;

  let payloadJson: string;
  try {
    payloadJson = Buffer.from(payloadBase64, "base64url").toString("utf8");
  } catch {
    return { valid: false, reason: "malformed" };
  }

  const expectedSignature = sign(payloadJson);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return { valid: false, reason: "signature-mismatch" };
  }

  let payload: PendingActionPayload;
  try {
    payload = JSON.parse(payloadJson);
  } catch {
    return { valid: false, reason: "malformed" };
  }

  if (Date.now() > payload.expiresAt) return { valid: false, reason: "expired" };
  if (payload.userId !== expectedUserId) return { valid: false, reason: "wrong-user" };

  return { valid: true, payload };
}
