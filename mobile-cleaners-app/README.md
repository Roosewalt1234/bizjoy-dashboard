# Fiz Fix Cleaner (mobile-cleaners-app)

React Native (Expo, SDK 57) app for cleaning staff. Talks directly to the same Supabase
project as the web dashboard (`../src`), RLS-scoped per employee via `employees.auth_user_id`.

## What's here (Phase 1)

- Supabase Auth login (email/password - accounts are created by the office in the Supabase
  Dashboard, then linked to an `employees` row via `auth_user_id`)
- Today's Tasks home screen - lists this employee's assigned, active cleaning schedules due
  today, pulled from `fm_cleaning_schedules`
- Attendance - one shared office NFC tag toggles clock-in/clock-out (`attendance_logs`,
  `source = 'nfc_app'`)
- Check-in flow at `/checkin/:token` - resolves an `fm_cleaning_areas.nfc_token`:
  - **Section** tag → checklist of that section's utility rooms/corridors
  - **Utility room/corridor** tag → job completion screen: status (done/skipped/issue),
    optional note, optional before/after photos (uploaded to the `cleaning-photos` bucket)

## Not yet built (later phases)

- **Offline queue + background sync** - you asked for offline support; right now every
  action (attendance tap, job completion) writes straight to Supabase and just shows an
  error if it fails. The local SQLite queue + sync engine is the next real chunk of work.
- **Real NFC tag reading** - screens assume they were opened via the `/checkin/:token` deep
  link (or manual navigation from the task list, useful for testing without a physical tag).
  `react-native-nfc-manager` is installed but not wired up yet for foreground scanning.
- **Android App Links verification** - the intent filter in `app.json` points at
  `fizfixapp.ansearly.io`, but nothing serves `https://fizfixapp.ansearly.io/.well-known/assetlinks.json`
  yet. That file needs the app's SHA256 signing fingerprint, which only exists after a real
  build (`eas credentials -p android`). Until it's hosted, tapping a tag will show Android's
  "choose an app" dialog instead of opening this app directly.
- MEP technician app (separate project, starts after this one is in good shape)

## Running it

This app uses native modules (NFC, image picker with native config) that aren't available in
Expo Go, so you need a **development build**, not the Expo Go app:

```bash
cd mobile-cleaners-app
npm install
npx expo run:android   # requires Android Studio / SDK locally, or...
# ...or build in the cloud instead (no local Android SDK needed):
npx eas build --profile development --platform android
```

Environment variables live in `.env` (already filled in with this project's Supabase URL and
publishable key - safe to commit, it's RLS-protected, same as the web dashboard's own `.env`).
