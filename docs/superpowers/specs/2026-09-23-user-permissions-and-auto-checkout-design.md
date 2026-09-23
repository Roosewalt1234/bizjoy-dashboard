# User permissions password UX + 12-hour auto-checkout — design spec

Date: 2026-09-23
Status: Approved by user, ready for implementation planning
Repo: `bizjoy-dashboard` only

## Problem

Three independent gaps raised together:

1. On the User Permissions page's "Add New User" dialog, the temporary
   password field is a plain `type="password"` input with no way to check
   what was typed before submitting — a typo means the new user can't log in
   and support has to reset it.
2. There's no way for a user to change their own password after an admin
   creates their account — only admins can set/reset passwords, via the
   temporary password at creation time.
3. Attendance records have no safety net: if a technician forgets to tap
   "check out" on the mobile app, their `attendance_logs` row stays open
   (`check_out` null) indefinitely, with no automatic correction.

These are unrelated features bundled into one spec because they're all
small, independent changes to the same two areas (user permissions page,
attendance system) requested together.

## Design

### 1. View-password toggle (Add New User dialog)

`src/routes/_authenticated/permissions.tsx`'s "Temporary Password" field
gets a standard show/hide toggle: an eye/eye-off icon button inside the
input that flips it between `type="password"` and `type="text"`. Purely
client-side UI state, no backend change, no new dependency (icons come from
the `lucide-react` set already used throughout this file).

### 2. Self-service "Change Password"

A new "Change Password" item is added to the sidebar footer
(`src/components/app-sidebar.tsx`), next to the existing "Sign out" button,
available to every logged-in user (not just admins). Clicking it opens a
modal with three fields:

- **Current password**
- **New password**
- **Confirm new password**

Client-side validation before submit: new password is at least 6
characters (matching the minimum already enforced server-side for
admin-created accounts in `createAppUser`), and new/confirm match.

On submit, entirely client-side (no new server function needed — this
mirrors how `app-sidebar.tsx` already calls `supabase.auth.signOut()`
directly):

1. Re-authenticate with `supabase.auth.signInWithPassword({ email: <current
   user's email>, password: <current password entered> })`. If this fails,
   show "Current password is incorrect" and stop — this is the check that
   stops someone at an unlocked/shared computer from silently changing
   another person's password.
2. On success, call `supabase.auth.updateUser({ password: <new password>
   })`.
3. Show a success toast and close the modal. No sign-out is forced — the
   existing session stays valid after a Supabase password change.

### 3. 12-hour/8-hour auto-checkout

**Schema (`attendance_logs`):**
- New column `auto_checked_out boolean not null default false` — true when
  the row's `check_out` was filled in by the system rather than a real
  tap-out or manual edit.

**Scheduled job:**
- Enable the `pg_cron` extension (available on this project, not yet
  enabled) and schedule a job every 5 minutes that runs a new
  `fn_auto_checkout_overdue_attendance()` function.
- The function closes out any row where `check_in is not null`,
  `check_out is null`, and the deadline has passed:
  - **FM rows** (`coalesce(site_type, 'FM') = 'FM'`): deadline is
    `check_in + interval '12 hours'`.
  - **AMC rows** (`site_type = 'AMC'`): deadline is `check_in + interval '8
    hours'`.
- The row's `check_out` is set to the **deadline instant itself**
  (`check_in + 12h` or `check_in + 8h`), not whatever wall-clock time the
  job happens to run at — so if the job is delayed (e.g. runs at 12:30
  instead of exactly 12:00), the recorded check-out time is still exactly
  on the 12-hour/8-hour mark. `auto_checked_out` is set `true`, and a note
  is appended to `remarks` (e.g. "Auto checked-out — no tap-out recorded").
- Running every 5 minutes means a row can sit overdue for at most ~5
  minutes of real time before the job closes it, but the *recorded* time
  is always exact regardless of that delay.

**Bypassing geofence enforcement for auto-checkouts:**
- The existing `trg_attendance_logs_geofence` trigger currently rejects any
  check-out on a `source = 'mobile_app_geo'` row that lacks
  `check_out_lat`/`check_out_lng` — which every auto-checkout will lack, by
  definition (no one tapped out with a real GPS reading). The trigger gets
  a new early-exit: if this update is setting `auto_checked_out` from false
  to true, skip all geofence validation and allow it through unconditionally.
  This only affects the automated path — real check-outs from the mobile
  app are validated exactly as before.

**Dashboard visibility (`src/routes/_authenticated/fm-attendance.tsx`):**
- Rows where `auto_checked_out` is true show a small "Auto" badge next to
  the check-out time, so office staff can tell it wasn't a real tap-out and
  follow up if needed.
- If office staff manually edit that row's check-out time via the existing
  Add/Edit dialog, the save clears `auto_checked_out` back to `false` — the
  badge disappears once a human has confirmed/corrected the real time.

### What does NOT change

- The 150m geofence enforcement for real (non-automatic) check-ins and
  check-outs — untouched.
- Admin-driven password creation/reset flow (`createAppUser`) — untouched.
- Attendance status (`status` column) — an auto-checkout doesn't change it;
  the row stays whatever it already was (typically "Present").
- Manpower summary / "Generate Today's Sheet" logic on the Attendance
  page — auto-checked-out rows are still complete, valid attendance
  records and are counted exactly like any other checked-out row.

## Verification plan

- `npx tsc --noEmit` after each dashboard change.
- Live DB: verify `pg_cron` job registration
  (`select * from cron.job;`), then directly test
  `fn_auto_checkout_overdue_attendance()` against a manually-inserted
  overdue test row for both an FM and an AMC case, confirming the
  computed `check_out` timestamp and `auto_checked_out` flag are correct,
  then clean up the test rows.
- Live DB: confirm the geofence trigger's new bypass doesn't weaken real
  enforcement — re-run the existing forged-checkout rejection tests (FM and
  AMC) from the original geofencing feature to confirm they still fail as
  expected.
- Manual, in-browser: confirm the password-visibility toggle works, confirm
  the Change Password modal's wrong-current-password rejection and
  successful-change paths render correctly (can't fully verify a live
  Supabase auth round trip without real credentials, so this will be
  disclosed as a limitation same as prior features), confirm the "Auto"
  badge renders on a manually-flagged test row in the Attendance page.
