# Restore the original Supabase connection

## Confirmed state

- The project is currently bound at platform/runtime level to a Lovable-managed backend.
- The repository still identifies the intended original project in `supabase/config.toml`.
- Historical commits through `86071fe` show the app environment pointing to the original project; later commits show the unintended managed-backend values.
- This workspace currently has no active Supabase account authorization available for reconnecting to the original project.

## Recovery plan

1. **Restore account authorization**
   - Re-authorize the Supabase account that owns the original project through this project's connector/settings flow.
   - Select the existing original project—not a new project and not a migration destination.

2. **Rebind this project in place**
   - Reconnect the Lovable project runtime to the original Supabase project.
   - Rebind the generated runtime secrets so browser and server requests use the original URL and keys.
   - Do not create, copy, migrate, delete, or modify database data.

3. **Verify the rollback**
   - Confirm project metadata reports the original project as active and not Lovable-managed.
   - Confirm generated environment bindings match the original project.
   - Run the app and validate authentication plus a read-only database request.
   - Verify `/permissions` loads against the original backend with the upgraded client library.

4. **Production safety**
   - Do not publish while the backend binding is wrong.
   - After verification, publish only if production still needs the corrected binding deployed.

## Escalation boundary

If the connector UI does not offer the original project, or the platform refuses to replace the managed binding, this requires Lovable support intervention. The escalation should include the confirmed current binding, the intended original project reference, the repository evidence above, and a request to restore the prior project binding without migrating or deleting data.
