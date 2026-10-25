# Snag → WhatsApp alerts via Anna — design

Date: 2026-10-25 · Status: draft for approval

## Intent

When a field employee reports a snag in the Fiz Fix mobile app, Anna (the
Hermes agent on the Dell) automatically posts it in a WhatsApp group so the
team sees the problem — with the photo — straight away, without anyone
re-typing it. Every post attempt is recorded in the CRM, so "did it go out?"
can be answered from the database, not from Anna's logs.

This is a **test phase**: posts go only to the `Schedule- Fizfix` group.
Moving to a different group later is a deliberate, separate change.

## Decided by the user

- Destination for testing: **`Schedule- Fizfix`** only.
- Each post carries the **image**, the **work order number**, and the
  **person who reported it**.
- Architecture: **photo upload → pending notification row in the CRM → Dell
  sends image + caption → result saved back in the CRM.**
- **No n8n** for this. The Dell pulls from the CRM over an outbound connection;
  nothing on the Dell is exposed to the internet.
- Photos stay **private** (path stored in the CRM, downloaded with
  authentication by the sender).

## Goals

1. Every snag reported from the mobile app (after go-live) is posted once to
   `Schedule- Fizfix` as an image with a caption.
2. A permanent CRM record per snag notification: pending / sending / sent /
   failed / uncertain, attempts, send time, last error, WhatsApp message id.
3. Safe retries for clear failures; never a duplicate post.

## Non-goals

- No other groups, no per-site routing, no notifications for work orders
  created from the dashboard.
- No dashboard UI for the notification log in this phase (queryable in
  Supabase; a UI can come later).
- No back-posting of the ~83 snags that already exist.
- No changes to Anna's Hermes gateway, Telegram, morning brief, Sheets sync,
  collector, acknowledgment or 4 PM report paths.

## Anti-goals (failure even if it "works")

- The same snag posted twice.
- Anna gaining a general "send anything to any group" ability.
- A public URL for photos, or the Supabase service-role key (or any login
  with broad CRM access) placed on the Dell.
- The Dell's WhatsApp program crashing or losing its session because of this
  feature (it also runs the schedule acknowledgments and reports).

## Current state (verified 2026-10-25)

- Mobile app (`Desktop/Fiz-fix-mobile-app`), `src/lib/snagStorageService.ts`
  `syncPendingSnagsToCloud()`: snags are saved offline first (IndexedDB, photo
  as a data URL), then synced by inserting into `fm_work_orders` with
  `wo_no` (from `next_doc_no('work_order')`), `technician_id`,
  `technician_name`, `location`, `service_type`, `priority`,
  `problem_reported`, `reported_at`, and `notes` beginning `[SNAG REPORT]`.
  **The photo is not uploaded** — it stays on the phone.
- `fm_work_orders` already has a `before_photo_path text` column.
- Private storage bucket `work-order-photos` exists. INSERT policy allows an
  employee to write when the first folder of the path is their own
  `employees.id`; SELECT likewise, or for users with `service:view`.
- Anna's WhatsApp program: `anna-whatsapp-trial.service`, root
  `/home/anna/.local/share/dell-ai-support/whatsapp-donor` (WSL
  `Ubuntu-24.04`, user `anna`). Not a git repo. One Baileys session, owned by
  `monitor.mjs` (protected by flock), so **any new sender must run inside
  `monitor.mjs`** — a second process cannot share the WhatsApp session.
  Existing send paths are hard-wired to `SCHEDULE_GROUP`
  (`120363430732649327@g.us`, in `schedule.mjs`) and gated by config flags.
  Local state uses `node:sqlite`. Tests live in `tests/*.test.mjs`.
  The vendored Node runtime is the one the service unit uses (no `node` on
  PATH).

## Design

### 1. Mobile app: upload the photo before creating the work order

In `syncPendingSnagsToCloud()`, before the `fm_work_orders` insert:

- Upload `snag.photoData` (decode data URL → JPEG blob) to
  `work-order-photos/{reportedByEmployeeId}/snags/{snag.id}.jpg` with
  `upsert: true` (same path on retry, so no orphan duplicates).
- Only if the upload succeeds, insert the work order with
  `before_photo_path` set to that path. If the upload fails, the snag is
  marked failed locally and retried by the existing sync loop — the work
  order is not created without its photo.
- If `reportedByEmployeeId` is missing the storage policy will refuse the
  upload; treat that like any other upload failure (it already can't insert
  the work order under the self-insert policy).
- **Duplicate work orders on retry** (existing gap, fixed here — *my call*):
  today, if the insert succeeds but the phone never gets the reply, the retry
  creates a second work order with a new `wo_no`, which would mean a second
  post. Fix: a unique index on `fm_work_orders.before_photo_path` (partial,
  where not null). The path contains the phone's own `snag.id`, so it is a
  stable per-snag key. The phone treats a unique-violation (`23505`) on that
  index as "already synced" and marks the snag synced. Note the `wo_no`
  consumed by the failed retry is simply skipped.

Needs a new mobile build, uploaded manually by the user as usual.

### 2. CRM: notification table, trigger, and narrow RPCs

New migration in this repo (`supabase/migrations/`):

**Table `snag_notifications`**
`id uuid pk`, `work_order_id uuid unique not null → fm_work_orders(id)`,
`status text` (`pending | sending | sent | failed | uncertain | skipped`),
`attempts int default 0`, `next_attempt_at timestamptz`,
`claimed_at timestamptz`, `sent_at timestamptz`, `wa_message_id text`,
`last_error text`, `destination text default 'Schedule- Fizfix'`,
`created_at`, `updated_at`.
The `unique(work_order_id)` constraint is the CRM-side duplicate guard.

**Trigger** `AFTER INSERT ON fm_work_orders`: when `notes LIKE '[SNAG REPORT]%'`
and `before_photo_path IS NOT NULL`, insert a `pending` row
(`ON CONFLICT DO NOTHING`). Snags from old app builds (no photo) produce no
notification — *my call*: the user asked for posts with the image.

**RLS**: enabled; SELECT for users with `service:view`; no direct writes from
any client. Writes only through the RPCs below.

**Bot access** — *my call*: a Supabase **Edge Function `snag-bot`**, called
by the Dell with a dedicated shared secret (`SNAG_BOT_SECRET`, stored as a
function secret). Not a sign-in user — the reviewer found that any signed-in
user in this database gets the default `user` role and several tables still
allow broad access to any authenticated user, so a bot login would not be
narrow. Not the service-role key, and not the existing write-capable
`anna-crm-mcp` credential. The secret can do exactly three things, and
nothing else: claim, report, and get a short-lived (5 min) signed URL for a
claimed snag's photo. The function uses the service role internally and
compares the secret in constant time. `verify_jwt` off; secret checked
instead. The two SQL functions below are executable only by `service_role`.

- `snag_bot_claim(p_limit int)` — called by the Edge Function. Selects `pending` rows with
  `next_attempt_at <= now()` (or null), `FOR UPDATE SKIP LOCKED`, sets
  `status='sending'`, `claimed_at=now()`, `attempts+1`, and returns per row:
  notification id, `wo_no`, `technician_name`, site/contract name (via
  `contract_id`, if present), `location`, `service_type`, `priority`,
  `problem_reported`, `reported_at`, `before_photo_path`.
- `snag_bot_report(p_id uuid, p_outcome text, p_wa_message_id text, p_error text)`
  — called by the Edge Function. Outcomes:
  - `sent` → `status='sent'`, `sent_at`, `wa_message_id`.
  - `retry` (clear failure before anything reached WhatsApp: not connected,
    photo download failed) → back to `pending` with backoff
    (1, 5, 15, 60 min); after 5 attempts → `failed`.
  - `uncertain` (send started but timed out / no confirmation) →
    `status='uncertain'`, **never auto-retried** (matches Anna's existing
    rule that uncertain sends are not retried, to avoid duplicates).
- Stale claims: a row left in `sending` for > 10 min (e.g. Dell crashed
  mid-send) moves to `uncertain` on the next claim call, not back to
  pending.
- No new storage policy: photos are fetched through the signed URL the
  Edge Function returns with each claimed row.
- **Backlog cutoff** — *my call*: a setting `posting_enabled_at`
  (timestamptz, null = off) in a one-row `snag_notification_settings` table.
  `snag_bot_claim` returns nothing while it is null, and any pending row whose
  work order `created_at` is earlier than it is marked `skipped` (new status
  value) instead of posted. Turning posting on therefore never floods the
  group with snags reported before that moment.

### 3. Dell: a snag sender inside Anna's WhatsApp program

New module `snag-alerts.mjs` in the `whatsapp-donor` folder, wired into
`monitor.mjs` alongside the owner outbox and report timers.

- **Config** `config/snag-alerts.json`: `{ "enabled": false, "poll_seconds": 60 }`.
  Destination is **not configurable** — the send function is hard-wired to
  `SCHEDULE_GROUP`, mirroring `scheduleOnlySend` / `reportOnlySend`.
- **Credentials**: the `snag-bot` function URL and `SNAG_BOT_SECRET` in a
  separate file (e.g. `config/snag-bot.env`), owned by `anna`, mode 0600.
  Never logged.
- **CRM access** via plain `fetch` to the `snag-bot` Edge Function (claim,
  report). Photo downloaded from the signed URL returned with each claimed
  row. No new npm dependencies.
- **Loop** (every `poll_seconds`, only when `enabled` and WhatsApp
  connected): claim up to 5 → for each, download the photo → build caption →
  `snagOnlySend(sock, buffer, caption)` which calls
  `sock.sendMessage(SCHEDULE_GROUP, { image, caption })` with a 30 s timeout
  → report outcome.
- **Local ledger** (`state/snag-alerts.sqlite`): reserve the work order id
  *before* sending; if a reservation already exists, never send again —
  report `uncertain` instead. This guards against duplicates even if the CRM
  report call fails after a successful send. If the CRM report fails, keep the
  outcome locally and re-report it next tick.
- **Isolation**: every error in this module is caught and logged as an event
  name only (`snag_alert_*`), never as message content; it must not call
  `fail()`/stop the monitor. Logs follow the existing rule: no message
  bodies, JIDs or keys.
- Back up the folder before editing (it is not under git), and add
  `tests/snag-alerts.test.mjs` in the existing test style.

### Caption (my call on wording/order)

```
🛠️ New snag — WO-00123
Reported by: <technician_name>
Site: <contract/site name> — <location>
Category: <service_type> · Priority: <priority>
Issue: <problem_reported>
Reported: 25 Oct 2026, 14:05 (Dubai)
```

Missing fields are omitted, not shown as blank. `wo_no` missing → "New snag"
with no number. Caption trimmed to WhatsApp's limit.

## Rollout

1. Apply the CRM migration; deploy the `snag-bot` Edge Function and set
   its secret. `posting_enabled_at` stays null.
2. Install `snag-alerts.mjs` with `enabled: false`; restart
   `anna-whatsapp-trial.service`; confirm schedule acks/reports still work.
3. Ship the mobile build with photo upload (snags now save photos; nothing
   is posted yet).
4. Set `posting_enabled_at = now()` and `enabled: true`; the user reports
   one test snag; confirm the post in `Schedule- Fizfix` and `status='sent'`
   in `snag_notifications`. Snags from before step 4 become `skipped`.

Each restart of Anna's WhatsApp service and each real post needs the user's
go-ahead at the time.

## Left to the builder

Exact function/file names, the backoff numbers, how the site name is joined,
image compression on the phone, test structure, and the Edge Function's
request/response shape.
