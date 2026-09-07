# Mobile app redesign — Phase 2: device-bound login and provisioning

## Context

This is Phase 2 of a five-phase mobile app UI overhaul aimed at low-literacy
field staff (many cleaners/technicians cannot read or write). The full
sequence, agreed with the user:

1. Staff-to-project assignment — **already built** (`/fm-manpower` web page,
   `contract_manpower_assignments` table). No work needed.
2. **This phase**: device-bound login + admin-gated provisioning.
3. 3-button icon hub (Attendance / Assigned Jobs / Create Work Order) +
   icon-only Attendance screen.
4. Icon-based Assigned Jobs screen.
5. Camera-first Work Order creation flow.

Each phase gets its own spec → plan → implementation cycle. This document
covers Phase 2 only.

## Problem

Today, the mobile app's login screen expects an employee to type their own
email and password. Session persistence already works (Supabase client is
configured with `persistSession: true` via AsyncStorage - once someone logs
in, the app stays logged in as them indefinitely across restarts). But there
is no concept of a device having a fixed identity, no notion of a device's
"default project," and no low-literacy-friendly way to select which employee
a device belongs to.

In practice, one phone is handed to one field worker and stays theirs. Only
managers/admins move between projects. The redesign should reflect that: most
staff never see a login or picker screen at all after initial setup; only
flagged managers/admins see a project picker on every launch.

## Goals

- A device, once set up for a regular employee, opens straight to their home
  screen on every subsequent launch - no login, no picker, no typing.
- Setting up (or reassigning) a device is an admin-only action, visually
  unobtrusive so regular staff never stumble into it by accident.
- Managers/admins (a small, explicitly flagged set of employees) get a
  project picker on every launch, since they legitimately work across sites,
  while their own identity still stays logged in via the existing persisted
  session.
- The employee-selection step during provisioning uses photos, not typed
  names, matching the project's low-literacy design goal.

## Non-goals (this phase)

- The 3-button hub screen itself, icon-only Attendance, Assigned Jobs, and
  Work Order creation are separate phases (3-5) and not designed here. This
  phase only replaces the login/entry flow and introduces the concept of a
  device's default project; it routes to the *existing* home screen
  (`(app)/index.tsx`) unchanged for now.
- Uploading employee photos is a data-entry task for the user, not something
  this phase builds (the web upload feature already exists in the Employee
  form).
- Fine-grained permission levels beyond a single "can switch projects" flag.
  Whoever has that flag can both (a) see a project picker on their own daily
  launches and (b) access the device-provisioning screen for any employee.
  No separate "can reprovision devices" permission - YAGNI until a real need
  for the distinction shows up.

## Data model changes

One new column, one migration, isolated to FM-side tables only:

```sql
alter table employees add column if not exists can_switch_projects boolean not null default false;
```

No RLS changes needed - `employees` already has an `employees_self_select`
policy mobile staff use to read their own row, and this new column is just
another field on it. Setting the flag happens through the web Employee form
(a new checkbox, alongside existing fields like status/position).

## Flows

### A. Regular employee, device already provisioned (the common case)

Unchanged from a session-persistence standpoint - `useAuth()` already finds
the stored session and skips the login redirect. The only change: after
confirming the session belongs to a non-flagged employee, the app reads a
locally-stored `defaultProjectId` (AsyncStorage, not a database value - it is
purely this device's own setting) and makes it available to whatever screen
needs project context (Attendance in Phase 3, Work Order creation in Phase
5). If `defaultProjectId` is missing (a session exists but the device was
never fully provisioned - e.g. an interrupted setup), fall back to the
admin-gated provisioning screen rather than guessing.

### B. Manager/admin (flagged `can_switch_projects`), any launch

Session is still persisted and found automatically - no re-login. But before
reaching the home screen, the app shows a plain text list of projects
(queried from `fm_contracts`, ordered by name) for them to pick from for this
session. Their pick is held in memory for the session (not persisted to
AsyncStorage as a "default" - it's meant to change often) and used the same
way `defaultProjectId` is for regular staff.

Text list is fine here (not photos/icons) - this screen is only ever seen by
managers/admins, not the low-literacy field staff the photo-picker is
designed for.

### C. Provisioning / reprovisioning a device (admin-gated)

Entry point: a small, low-visibility icon (gear/settings) on the login
screen - visible before anyone is logged in, so it doubles as the entry point
for a factory-fresh device. Once a regular employee is logged in, this same
entry point should still exist but tucked away (e.g. a long-press on the app
logo, or a small icon in a corner of the hub) - deliberately not a prominent
button, since accidentally triggering it should not be easy for someone who
can't read a confirmation dialog.

Steps:
1. Tap the settings entry point. Prompted for **admin credentials** (email +
   password) - this is a real Supabase sign-in, temporarily replacing
   whatever session was active (if any).
2. After sign-in, check the now-active session's employee row for
   `can_switch_projects = true`. If false, show an error and sign back out of
   this temporary session, returning to the plain login screen regardless of
   what was active before (including a previously-logged-in regular
   employee). This is a deliberate simplification: attempting to silently
   restore the prior session would rely on undocumented SDK behavior for
   resuming a session without re-entering a password. Requiring the original
   employee (or an admin) to log back in is safer and simpler, at the cost of
   one extra login if someone triggers the settings gate by mistake on an
   already-provisioned device.
3. Show a plain text list of projects (same list as flow B) to pick which
   project this device should be provisioned for.
4. Show a photo grid of that project's staff, sourced from
   `contract_manpower_assignments` (`active = true`) joined to
   `employees.profile_photo` / `full_name`. Employees with no photo uploaded
   yet show a placeholder (initials avatar), not a broken image.
5. Admin taps the target employee's photo, then enters that employee's email
   and password directly (per the earlier decision - the admin enters it on
   the employee's behalf, same as how the admin already sets initial
   passwords via the web dashboard).
6. App signs in as that employee (replacing the admin's temporary session)
   and stores `defaultProjectId` = the project picked in step 3, locally via
   AsyncStorage.
7. Lands on the employee's home screen.

## Decisions explicitly out of scope

- **Multiple devices per employee**: no limit or warning if the same
  employee ends up as the default identity on more than one device (e.g. a
  lost-and-replaced phone leaves the old one still "provisioned"). Not worth
  tracking for this phase - can revisit if it causes a real problem.
