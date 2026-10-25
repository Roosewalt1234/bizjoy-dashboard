# Snag WhatsApp Alerts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every snag reported from the mobile app after go-live is posted as photo + caption, with duplicate posts prevented and any send whose delivery can't be confirmed held as `uncertain` for human review (a crash between WhatsApp accepting a message and Anna saving its id cannot be resolved automatically), to the `Schedule- Fizfix` WhatsApp group by Anna, with every attempt recorded in the CRM.

**Architecture:** The mobile app uploads the snag photo to private storage before inserting the work order. A database trigger queues a `snag_notifications` row. A secret-protected Edge Function (`snag-bot`) lets Anna's WhatsApp program on the Dell claim queued rows, fetch a short-lived signed photo URL, and report the outcome. The sender runs inside Anna's existing `monitor.mjs` (one WhatsApp session), hard-wired to the schedule group.

**Tech Stack:** Supabase Postgres + Edge Functions (Deno), React/Vite mobile web app with `@supabase/supabase-js`, Node 26 ESM + `node:sqlite` + Baileys (Anna, WSL `Ubuntu-24.04`, user `anna`).

**Spec:** `docs/superpowers/specs/2026-10-25-snag-whatsapp-alerts-design.md`

## Global Constraints

- Destination is **only** `SCHEDULE_GROUP = '120363430732649327@g.us'` (imported from `schedule.mjs`); never configurable.
- No service-role key, sign-in user or `anna-crm-mcp` credential on the Dell. The Dell holds only the `snag-bot` URL + `SNAG_BOT_SECRET`, in `config/snag-bot.env`, mode 0600, owner `anna`.
- Photos stay private: bucket `work-order-photos`; path `{employeeId}/snags/{snagId}.jpg`; signed URLs expire in **300 s**. Upload with `upsert: false` (the bucket has INSERT + SELECT policies but no UPDATE policy — verified 2026-10-25); an "already exists" upload error counts as success because the path is unique per snag and uploads are atomic.
- Uncertain sends are **never** auto-retried. Clear pre-send failures back off **1, 5, 15, 60 min**; after **5** attempts → `failed`. A row in `sending` > **10 min** → `uncertain`.
- Statuses: `pending | sending | sent | failed | uncertain | skipped`. Allowed report transitions (anything else is a no-op that returns the current status): `sending → sent | pending(retry) | failed | uncertain`; `uncertain → sent` (late confirmed result). `sent`, `failed`, `skipped` are terminal; a `retry` or `uncertain` report never overwrites `sent`.
- Every claim issues a fresh `claim_token uuid`; `snag_bot_report` requires the row's current token, so a stale attempt can't change a newer attempt's outcome.
- Snags created before `posting_enabled_at` are `skipped`; while it is null, nothing is claimed.
- Anna logs: event names only (`snag_alert_*`), never captions, JIDs, URLs or secrets. Errors in the snag module must never stop `monitor.mjs`.
- No new npm dependencies in Anna's program. WhatsApp send timeout **30 s**. Claim batch **5**, poll **60 s**.
- Anna's folder is not under git: back it up before editing. Restarting `anna-whatsapp-trial.service` and the first real post each need the user's go-ahead at that moment.
- Dashboard repo is Lovable-connected: commit to `main`, no history rewrites. Mobile app is a separate repo on the Desktop; pushing it does not deploy it (the user uploads builds).
- Anna's node: `/home/anna/.hermes/tools/node-26.12.1-linux-x64/bin/node`. Run WSL commands as `wsl.exe -d Ubuntu-24.04 -u anna -- bash -c '…'`.

## Review Focus

1. **Phone retries an insert that actually succeeded** → no second work order and no second post (Task 3 test `isDuplicateSnagInsert`; Task 1 test duplicate-path insert).
2. **CRM report call fails after a successful WhatsApp send** → next tick re-reports `sent` with the stored message id; no resend (Task 4 test "report failure then recovery").
3. **The same notification is claimed twice** (CRM lost the outcome, stale claim) → Anna's ledger refuses to send again (Task 4 test "already in ledger").
4. **Photo download fails / signed URL expired** → `retry`, nothing reserved, nothing sent (Task 4 test "download failure").
5. **Snag fields missing or very long** (no `wo_no`, no contract, 500-char names/locations, 2,000-char description) → caption omits empty lines, keeps its line structure, and stays ≤ 1,024 chars (Task 4 caption tests).

---

### Task 1: CRM notification queue (migration)

**Files:**
- Create: `supabase/migrations/20261025120000_snag_whatsapp_notifications.sql`
- Test: `supabase/tests/snag_notifications_test.sql` (DO-block that ends in `RAISE EXCEPTION 'snag_tests_passed'` so everything rolls back)

**Interfaces:**
- Produces (all executable by `service_role` only; `REVOKE ALL … FROM PUBLIC, anon, authenticated`):
  - Table `public.snag_notifications(id uuid pk default gen_random_uuid(), work_order_id uuid not null unique references fm_work_orders(id) on delete cascade, status text not null default 'pending' check (status in ('pending','sending','sent','failed','uncertain','skipped')), attempts int not null default 0, next_attempt_at timestamptz, claimed_at timestamptz, claim_token uuid, sent_at timestamptz, wa_message_id text, last_error text, destination text not null default 'Schedule- Fizfix', created_at timestamptz not null default now(), updated_at timestamptz not null default now())`. RLS on; SELECT policy `app_private.can(auth.uid(),'service','view')`; no write policies.
  - Table `public.snag_notification_settings(id boolean primary key default true check (id), posting_enabled_at timestamptz)` seeded with one row, `posting_enabled_at = null`. RLS on, same SELECT policy.
  - Unique partial index `fm_work_orders_before_photo_path_key ON fm_work_orders(before_photo_path) WHERE before_photo_path IS NOT NULL` (verified 2026-10-25: zero rows have a path, so it builds cleanly).
  - Trigger `trg_queue_snag_notification` AFTER INSERT ON `fm_work_orders`, SECURITY DEFINER function `app_private.queue_snag_notification()`: if `NEW.notes LIKE '[SNAG REPORT]%' AND NEW.before_photo_path IS NOT NULL` → insert pending row `ON CONFLICT (work_order_id) DO NOTHING`.
  - `public.snag_bot_claim(p_limit int default 5) RETURNS TABLE(notification_id uuid, claim_token uuid, work_order_id uuid, wo_no text, technician_name text, site_name text, location text, service_type text, priority text, problem_reported text, reported_at timestamptz, photo_path text, attempts int)`.
  - `public.snag_bot_report(p_id uuid, p_claim_token uuid, p_outcome text, p_wa_message_id text default null, p_error text default null) RETURNS text` (the resulting status). `p_outcome in ('sent','retry','uncertain')`, else raise. Token mismatch → raise `claim_token_mismatch`. Disallowed transition (see Global Constraints) → no change, returns current status.

- [ ] **Step 1: Write the failing test** `supabase/tests/snag_notifications_test.sql` — one `DO $$ … $$` block that:
  - inserts a work order (`notes='[SNAG REPORT] test'`, `before_photo_path='t/snags/a.jpg'`, `status='Open'`) and asserts one `pending` row exists for it;
  - asserts a second insert with the same `before_photo_path` raises `unique_violation`;
  - asserts a work order without `before_photo_path` or without the `[SNAG REPORT]` prefix queues nothing;
  - with `posting_enabled_at` null: `snag_bot_claim(5)` returns 0 rows;
  - sets `posting_enabled_at = now()`, backdates the first work order's `created_at` by 1 hour, inserts a fresh snag WO; claim returns exactly the fresh one with `site_name` from `fm_contracts.site_name` (or null), and the old one is now `skipped`;
  - claimed row is `sending`, `attempts = 1`, `claim_token` not null; `snag_bot_report(id,token,'retry',null,'x')` → `pending`, `next_attempt_at ≈ now()+1 min`; immediate claim returns 0 rows;
  - after a re-claim (new token), reporting with the **old** token raises `claim_token_mismatch`;
  - forcing `attempts = 5` then `retry` → `failed`;
  - `report(id,tok,'sent','WAID')` → `sent`, `sent_at` set, `wa_message_id='WAID'`; then `report(id,tok,'retry')` and `report(id,tok,'uncertain')` both return `sent` and change nothing;
  - `report(id,tok,'uncertain')` on another → `uncertain`; then `report(id,tok,'sent','WAID2')` → `sent` (late confirmation); `report(id,tok,'bogus')` raises;
  - a row with `status='sending', claimed_at = now()-11 min` becomes `uncertain` on the next claim, keeping its `claim_token` (so a late `sent` with that token still resolves it);
  - ends with `RAISE EXCEPTION 'snag_tests_passed';`.

- [ ] **Step 2: Run it to verify it fails** — run the file's contents with the Supabase MCP `execute_sql` (project `evcaehadjzoxtdlnmehk`). Expected: error mentioning `snag_notifications` does not exist.

- [ ] **Step 3: Write the migration** with the objects above. Claim order of operations inside `snag_bot_claim`: (a) stale `sending` > 10 min → `uncertain`; (b) return empty if `posting_enabled_at` is null; (c) pending rows whose work order `created_at < posting_enabled_at` → `skipped`; (d) `SELECT … WHERE status='pending' AND coalesce(next_attempt_at, '-infinity') <= now() ORDER BY created_at LIMIT p_limit FOR UPDATE SKIP LOCKED`, update to `sending`, `claimed_at=now()`, `claim_token=gen_random_uuid()`, `attempts=attempts+1`, return the joined fields. Backoff in `snag_bot_report` for `retry`: attempts 1→1 min, 2→5 min, 3→15 min, 4→60 min; attempts ≥ 5 → `failed` with `last_error`. All functions `SET search_path = public, pg_temp`.

- [ ] **Step 4: Apply and re-run the test** — apply with MCP `apply_migration` (name `snag_whatsapp_notifications`), then run the test file again. Expected: error text exactly `snag_tests_passed`. Also run MCP `get_advisors` (security) and confirm no new warnings on these objects.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261025120000_snag_whatsapp_notifications.sql supabase/tests/snag_notifications_test.sql
git commit -m "feat: snag notification queue for Anna WhatsApp alerts"
```

---

### Task 2: `snag-bot` Edge Function

**Files:**
- Create: `supabase/functions/snag-bot/index.ts`

**Interfaces:**
- Consumes: `snag_bot_claim`, `snag_bot_report` (Task 1).
- Produces: `POST {SUPABASE_URL}/functions/v1/snag-bot`, header `x-snag-bot-secret: <SNAG_BOT_SECRET>`, JSON body:
  - `{"action":"claim","limit":5}` → `200 {"items":[{notification_id, claim_token, work_order_id, wo_no, technician_name, site_name, location, service_type, priority, problem_reported, reported_at, photo_url, attempts}]}` where `photo_url` is a 300 s signed URL from bucket `work-order-photos` for `photo_path` (if signing fails, call `snag_bot_report(id,claim_token,'retry',null,'sign_failed')` and drop that item).
  - `{"action":"report","id":"<uuid>","claim_token":"<uuid>","outcome":"sent|retry|uncertain","wa_message_id"?:string,"error"?:string}` → `200 {"status":"<resulting status>"}`; `claim_token_mismatch` → `409`.
  - Wrong/missing secret → `401`; bad body → `400`; non-POST → `405`. `limit` clamped to 1–10; `error` truncated to 500 chars.

- [ ] **Step 1: Write `index.ts`** following `supabase/functions/send-push-notification/index.ts` style (header comment explaining auth, `createClient(SUPABASE_URL, SERVICE_ROLE_KEY)`). Secret compared in constant time (compare SHA-256 digests of both strings byte-by-byte). Never echo the secret or photo path in errors.

- [ ] **Step 2: Deploy and set the secret** — generate a 32-byte random hex secret on the Dell; the user sets it as function secret `SNAG_BOT_SECRET` (Supabase dashboard → Edge Functions → Secrets) — do not paste it into chat. Deploy with MCP `deploy_edge_function` (name `snag-bot`, `verify_jwt: false`).

- [ ] **Step 3: Verify** with curl from WSL:
  - no header → `401`;
  - correct header, `{"action":"claim"}` → `200 {"items":[]}` (posting still disabled);
  - `{"action":"report","id":"00000000-0000-0000-0000-000000000000","claim_token":"00000000-0000-0000-0000-000000000000","outcome":"bogus"}` → `400`.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/snag-bot/index.ts
git commit -m "feat: snag-bot edge function for Anna claim/report"
```

---

### Task 3: Mobile app uploads the snag photo before the work order

Repo: `C:\Users\dell\OneDrive\Desktop\Fiz-fix-mobile-app`.

**Files:**
- Create: `src/lib/snagPhoto.ts`
- Create: `src/lib/snagPhoto.test.ts`
- Create: `src/lib/snagCloudSync.ts`, `src/lib/snagCloudSync.test.ts`
- Modify: `src/lib/snagStorageService.ts` (`syncPendingSnagsToCloud`, around the `fm_work_orders` insert at ~line 375)
- Modify: `package.json` (add `vitest` devDependency, script `"test": "vitest run"`)

**Interfaces:**
- Consumes: unique index `fm_work_orders_before_photo_path_key` (Task 1); storage INSERT policy (first folder = own `employees.id`).
- Produces:
  - `snagPhotoPath(employeeId: string, snagId: string): string` → `` `${employeeId}/snags/${snagId}.jpg` ``
  - `dataUrlToBlob(dataUrl: string): Blob` — throws `Error('invalid_photo_data')` on a non-`data:image/…;base64,` input.
  - `isDuplicateSnagInsert(error: { code?: string; message?: string } | null): boolean` — true when `code === '23505'` and message mentions `fm_work_orders_before_photo_path_key`.
  - `isAlreadyUploaded(error: { statusCode?: string | number; message?: string } | null): boolean` — true for storage "already exists" (`statusCode` `'409'`/`409`, or message matching `/already exists/i`).
  - `syncSnagToCloud(supabase: SupabaseClient, snag: SnagRecord): Promise<{ ok: boolean; message: string }>` in `snagCloudSync.ts` — the per-snag upload → `next_doc_no` → insert sequence, extracted from `syncPendingSnagsToCloud` so it can be tested with a fake client. `syncPendingSnagsToCloud` keeps its loop and local mark-synced/failed handling and calls this.

- [ ] **Step 1: Write failing tests** in `src/lib/snagPhoto.test.ts`:
  - `snagPhotoPath('emp-1','snag-9') === 'emp-1/snags/snag-9.jpg'`
  - `dataUrlToBlob('data:image/jpeg;base64,/9j/')` → Blob with `type === 'image/jpeg'`, `size === 3`; `dataUrlToBlob('hello')` throws `invalid_photo_data`
  - `isDuplicateSnagInsert({code:'23505', message:'duplicate key value violates unique constraint "fm_work_orders_before_photo_path_key"'}) === true`; same code with a different constraint → false; `null` → false
  - `isAlreadyUploaded({statusCode:'409', message:'The resource already exists'}) === true`; `{statusCode:'403'}` → false
  - **Integration (`snagCloudSync.test.ts`)** with an in-memory fake Supabase client (storage map with no-overwrite semantics; `fm_work_orders` array enforcing unique `before_photo_path` with a `23505` error naming `fm_work_orders_before_photo_path_key`; `next_doc_no` counter): first `syncSnagToCloud` call — upload succeeds, the insert is recorded but the fake then throws a network error (response lost) → returns `ok:false`; second call for the same snag → returns `ok:true`; assert exactly **one** work order and **one** stored photo exist, with `before_photo_path === 'emp-1/snags/snag-9.jpg'`. Also: upload fails with 403 → `ok:false`, zero work orders; missing `reportedByEmployeeId` → `ok:false`, no upload attempted. (The "one notification" half is pinned by Task 1's duplicate-path test.)

- [ ] **Step 2: Run** `npm install -D vitest && npm test` — Expected: FAIL, module `./snagPhoto` not found.

- [ ] **Step 3: Implement `src/lib/snagPhoto.ts`.**

- [ ] **Step 4: Run** `npm test` — Expected: all `snagPhoto` tests PASS; `snagCloudSync` tests still FAIL (not implemented).

- [ ] **Step 5: Implement `syncSnagToCloud` and call it from `syncPendingSnagsToCloud`**: if `!snag.reportedByEmployeeId` → `{ok:false, message:'Missing employee id — cannot upload photo'}` with no upload. Otherwise upload `dataUrlToBlob(snag.photoData)` to `work-order-photos` at `snagPhotoPath(...)` with `{ upsert: false, contentType: 'image/jpeg' }`; an error `isAlreadyUploaded` accepts counts as success; any other → `{ok:false, message:'Photo upload failed: ' + message}`, no insert. Then `next_doc_no` and the existing insert payload plus `before_photo_path: path`; `isDuplicateSnagInsert(woError)` → `ok:true`. Order matters: upload → `next_doc_no` → insert. Run `npm test` → all PASS.

- [ ] **Step 6: Verify** `npm run lint` (tsc) passes and `npm run build` succeeds.

- [ ] **Step 7: Commit** (mobile repo)

```bash
git add src/lib/snagPhoto.ts src/lib/snagPhoto.test.ts src/lib/snagCloudSync.ts src/lib/snagCloudSync.test.ts src/lib/snagStorageService.ts package.json package-lock.json
git commit -m "feat: upload snag photo and dedupe snag work orders"
```

---

### Task 4: Anna snag sender module

Folder: `/home/anna/.local/share/dell-ai-support/whatsapp-donor` (WSL, user `anna`; not git).

**Files:**
- Create: `snag-alerts.mjs`
- Create: `tests/snag-alerts.test.mjs` (same style as `tests/owner-send.test.mjs`: plain `node:assert/strict`, temp sqlite file, fake socket)

**Interfaces:**
- Consumes: `SCHEDULE_GROUP` from `./schedule.mjs`; the `snag-bot` HTTP API (Task 2).
- Produces:
  - `buildSnagCaption(item): string` — each field is first trimmed and capped (`wo_no` 30, `technician_name` 80, `site_name` 120, `location` 120, `service_type` 60, `priority` 20 chars, ending `…` when cut); lines in this order, each omitted when its value is empty:
    ```
    🛠️ New snag — {wo_no}          (or "🛠️ New snag" when wo_no empty)
    Reported by: {technician_name}
    Site: {site_name} — {location}  (either part alone if the other is empty)
    Category: {service_type} · Priority: {priority}  (either part alone)
    Issue: {problem_reported}
    Reported: {d Mon yyyy, HH:mm} (Dubai)   (Intl, timeZone 'Asia/Dubai', en-GB, 24h)
    ```
    With those caps the non-Issue lines total < 500 chars; the Issue text is then truncated (ending `…`) to keep the total ≤ 1024.
  - `snagOnlySend(socket, destination, image: Buffer, caption: string)` — throws `Error('outbound_destination_denied')` unless `destination === SCHEDULE_GROUP`; returns `socket.sendMessage(SCHEDULE_GROUP, { image, caption })`.
  - `createSnagApi({ url, secret, fetchImpl = fetch })` → `{ claim(limit): Promise<Item[]>, report(id, claimToken, outcome, waId?, error?): Promise<string>, fetchImage(url): Promise<Buffer> }`; each request has a 20 s `AbortSignal.timeout`; non-2xx → throws `Error('snag_api_<status>')`.
  - `loadSnagSettings(root)` → `{ enabled: boolean, pollSeconds: number, url?: string, secret?: string }` from `config/snag-alerts.json` and `config/snag-bot.env` (`SNAG_BOT_URL=`, `SNAG_BOT_SECRET=` lines). Missing files → `enabled:false`.
  - `class SnagAlerts { constructor({ file, api, log, sendTimeoutMs = 30000 }); async tick(socket, connected): Promise<void> }`. Ledger table `alerts(work_order_id TEXT PRIMARY KEY, notification_id TEXT NOT NULL, claim_token TEXT NOT NULL, status TEXT NOT NULL /* RESERVED|SENT|UNCERTAIN */, wa_id TEXT, reported INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL)`, WAL + `synchronous=FULL` like `OwnerOutbox`.

`tick` algorithm (the part tests pin):
1. If busy or `!connected` → return. Set busy (reentrancy guard).
2. Re-report (with the ledger's stored `claim_token`) every ledger row with `reported=0` and status `SENT`/`UNCERTAIN` (`sent` with `wa_id` / `uncertain`); on success set `reported=1`. A `RESERVED` row at tick start (crash mid-send) becomes `UNCERTAIN` first.
3. `claim(5)`. For each item:
   - ledger already has `work_order_id` → update the ledger's `claim_token` to the new one, then report its stored outcome (`SENT`→`sent`+`wa_id`, else `uncertain`); **never send**.
   - `fetchImage(photo_url)` fails → `report(id,token,'retry',null,'photo_download_failed')`; no ledger row.
   - insert `RESERVED` row (commit), then `snagOnlySend` raced with `sendTimeoutMs` → `SENT` + `result.key.id`, or any throw/timeout → `UNCERTAIN`; then report and mark `reported=1` on success.
4. A `snag_api_409` (token mismatch) on a re-report marks the row `reported=1` and logs `snag_alert_stale_report`. Every API/send error is caught and logged as `snag_alert_<reason>`; `tick` never rejects.

- [ ] **Step 1: Write failing tests** `tests/snag-alerts.test.mjs`, with a fake `api` (records calls; `claim` returns queued items) and fake socket:
  - caption: full item → exact expected 6-line string (use `reported_at: '2026-10-25T10:05:00Z'` → `Reported: 25 Oct 2026, 14:05 (Dubai)`); item with only `technician_name` and `problem_reported` → 3 lines, header `🛠️ New snag`; 2,000-char `problem_reported` → length ≤ 1024 and ends with `…`; **every** field 500 chars → length ≤ 1024, still 6 lines, each starting with its label.
  - `snagOnlySend(sock,'other@g.us',…)` throws `outbound_destination_denied`; with `SCHEDULE_GROUP` calls `sendMessage` once with `{image, caption}`.
  - happy path: one item → one send to `SCHEDULE_GROUP`, `report(id,token,'sent','WA1')`.
  - not connected → no `claim` call.
  - two concurrent `tick`s → one send.
  - already in ledger (same `work_order_id` claimed again with new token `T2`) → zero sends, `report(id,'T2','sent','WA1')`.
  - download failure → zero sends, `report(id,token,'retry',null,'photo_download_failed')`, no ledger row.
  - send throws / exceeds `sendTimeoutMs` (use 50 ms in test) → `report(id,token,'uncertain')`; next claim of same item → no send.
  - report failure then recovery: `report` throws on first call after a successful send → ledger `reported=0`; next tick re-reports `sent`, `'WA1'` with zero new sends.
  - crash mid-send: ledger row left `RESERVED`, reopen `SnagAlerts` → next tick reports `uncertain`, no send.
  - `api.claim` throws → `tick` resolves, a `snag_alert_claim_failed` log event recorded.

- [ ] **Step 2: Back up and run** — `mkdir -p -m 700 /home/anna/backups && tar -C /home/anna/.local/share/dell-ai-support -czf /home/anna/backups/whatsapp-donor-pre-snag-$(date +%Y%m%d%H%M).tar.gz --exclude='whatsapp-donor/backups' --exclude='whatsapp-donor/vendor/node_modules' whatsapp-donor && chmod 600 /home/anna/backups/*.tar.gz` (outside the source folder so nothing copies itself; it contains the WhatsApp session, so keep it 0600); confirm with `tar -tzf <file> | head`; then run `/home/anna/.hermes/tools/node-26.12.1-linux-x64/bin/node tests/snag-alerts.test.mjs`. Expected: fails, cannot find `../snag-alerts.mjs`.

- [ ] **Step 3: Implement `snag-alerts.mjs`** with the interfaces above.

- [ ] **Step 4: Run tests** — the new test file exits 0; also re-run every existing `tests/*.test.mjs` and confirm each still exits 0.

- [ ] **Step 5: Record the change** — append a dated entry to a new `SNAG-ALERTS.md` in the folder (what the module does, files, how to disable: set `enabled:false` and restart). No git here.

---

### Task 5: Wire the sender into `monitor.mjs` (disabled)

**Files:**
- Modify: `monitor.mjs`
- Create: `config/snag-alerts.json` → `{ "enabled": false, "poll_seconds": 60 }`
- Create: `config/snag-bot.env` (mode 0600) → `SNAG_BOT_URL=https://evcaehadjzoxtdlnmehk.supabase.co/functions/v1/snag-bot` and `SNAG_BOT_SECRET=<from Task 2>`

**Interfaces:**
- Consumes: `SnagAlerts`, `createSnagApi`, `loadSnagSettings` (Task 4).

- [ ] **Step 1: Edit `monitor.mjs`**: import from `./snag-alerts.mjs`; after `ownerOutbox`, build `snagSettings = loadSnagSettings(root)` and, only if `enabled && url && secret`, `snagAlerts = new SnagAlerts({ file: path.join(root,'state/snag-alerts.sqlite'), api: createSnagApi(snagSettings), log })` plus `snagTimer = setInterval(() => { if (!stopping) snagAlerts.tick(socket, connected).catch(() => log('snag_alert_error')); }, snagSettings.pollSeconds * 1000)`. Wrap construction in try/catch logging `snag_alert_init_failed` (must not reach `fail()`). Add `clearInterval(snagTimer)` in `stop()`. Log `snag_alerts_enabled` / `snag_alerts_disabled` once at start.

- [ ] **Step 2: Syntax check** — `node --check monitor.mjs` and all tests from Task 4 Step 4 exit 0.

- [ ] **Step 3: Restart — ask the user first.** With approval: `systemctl --user restart anna-whatsapp-trial.service`; then `journalctl --user -u anna-whatsapp-trial.service --since "-2 min" -o cat` shows `monitor_started`, `snag_alerts_disabled`, `whatsapp_connected`, and no `monitor_error_stopping`. Confirm `systemctl --user is-active` → `active` after 2 minutes.

- [ ] **Step 4: Update `SNAG-ALERTS.md`** with the restart time and result.

---

### Task 6: Go-live test (user-driven)

- [ ] **Step 1: Mobile build** — push the mobile repo commit; the user builds and uploads the app as usual and confirms it is installed on a test phone.
- [ ] **Step 2: Photo check** — the user reports one snag; verify via `execute_sql` that the newest `[SNAG REPORT]` work order has `before_photo_path` set and a `snag_notifications` row with `status='pending'`.
- [ ] **Step 3: Enable — ask the user first.** With approval: `UPDATE snag_notification_settings SET posting_enabled_at = now();` (this makes the Step 2 snag `skipped`, by design), set `config/snag-alerts.json` `enabled: true`, restart the service (same checks as Task 5 Step 3, expecting `snag_alerts_enabled`).
- [ ] **Step 4: Live test** — the user reports one more snag. Within ~2 minutes: the post appears in `Schedule- Fizfix` with photo and caption (the user confirms), and its `snag_notifications` row is `sent` with `wa_message_id`. Check logs show `snag_alert_*` events only, no content.
- [ ] **Step 5: Uncertain review** — show the user the query for held rows: `select n.status, w.wo_no, n.claimed_at, n.last_error from snag_notifications n join fm_work_orders w on w.id = n.work_order_id where n.status in ('uncertain','failed') order by n.created_at desc;` — these need a human glance at the group, by design.
- [ ] **Step 6: Wrap up** — update `SNAG-ALERTS.md` and the design doc status line to "live (test group)", commit the doc change in the dashboard repo.
