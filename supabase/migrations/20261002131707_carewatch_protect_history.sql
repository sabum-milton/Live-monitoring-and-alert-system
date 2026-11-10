/*
# Protect patient history from deletion

1. Purpose
- CareWatch must preserve historical readings, alerts and events even when the active patient
  changes. Deleting a patient row cascades to device_assignments and nulls the patient_id on
  vital_readings and alerts, which would orphan monitoring history.
- Removes the client-facing DELETE policy on `patients` so the dashboard cannot destroy records,
  and revokes the underlying DELETE grant to match.

2. Modified Tables
- `patients`: drops the `patients_delete_staff` policy and revokes DELETE from authenticated.

3. Security
- RLS remains ENABLED on `patients`. SELECT, INSERT and UPDATE continue to work for signed-in
  clinical staff; DELETE is no longer available to the browser.
- Clinical records are now append-mostly: patients can be registered and updated, and monitoring
  is ended by closing the assignment rather than deleting the patient.

4. Important notes
- No data is removed by this migration; it only narrows what the browser may do.
- Idempotent: the policy drop and revoke are safe to re-run.
*/

DROP POLICY IF EXISTS "patients_delete_staff" ON public.patients;
REVOKE DELETE ON public.patients FROM authenticated;
REVOKE DELETE ON public.patients FROM anon;

-- Audit trail tables are read-only to clients; revoke the unused write grants explicitly so the
-- intent is visible in the catalog rather than implied by the absence of a policy.
REVOKE INSERT, UPDATE, DELETE ON public.vital_readings FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.alerts FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.alert_acknowledgments FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.system_events FROM authenticated, anon;

-- Thresholds and settings are changed only through the admin-only SECURITY DEFINER functions.
REVOKE INSERT, UPDATE, DELETE ON public.threshold_configurations FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.system_settings FROM authenticated, anon;
