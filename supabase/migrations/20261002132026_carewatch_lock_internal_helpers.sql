/*
# Remove browser reachability from internal helper functions

1. Purpose
- The security advisor flagged two internal helper functions as callable through the Data API.
  Neither is part of the application's API surface, so both should be unreachable from the browser.
- `handle_new_user()` is a trigger function for `auth.users`. In normal operation it is only
  invoked by the trigger, never by a client.
- `log_system_event(...)` is an internal audit helper. It is called only by the workflow functions
  below it, which run as the same owner. Leaving it executable would let a signed-in user insert
  arbitrary audit records, weakening the integrity of the audit trail.

2. Modified Functions
- `public.handle_new_user()`: EXECUTE revoked from PUBLIC, anon and authenticated.
- `public.log_system_event(...)`: EXECUTE revoked from authenticated as well as PUBLIC and anon.

3. Security
- Both functions remain SECURITY DEFINER with a pinned search_path.
- The trigger on `auth.users` continues to work because trigger invocation does not require the
  invoking role to hold EXECUTE on the trigger function.
- The workflow functions continue to work because they are owned by the same role and call
  `log_system_event` as that owner.

4. Important notes
- No behaviour visible to the dashboard changes. This only removes an unreachable-in-practice but
  still-accessible API endpoint on two internal helpers.
*/

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_system_event(text, text, text, uuid, uuid, uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated;
