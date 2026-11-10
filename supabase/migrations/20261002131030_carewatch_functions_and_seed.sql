/*
# CareWatch workflow functions and seed data

1. Purpose
- Adds the server-side, authorization-checked functions that the browser is NOT allowed to run
  directly: alert acknowledgment, resolution, note-adding, patient/device reassignment,
  threshold updates and settings updates.
- Seeds the demonstration thresholds, operational settings, starter devices and starter nurses.
- Adds the signup trigger that creates a profile row for every new auth user.

2. New Functions
- `handle_new_user()` trigger        : creates a profiles row when a user signs up. First user becomes admin.
- `current_actor()`                  : returns the calling user's id, display name and role from profiles.
- `open_assignment(...)`             : closes any active assignment for the device/patient, records end time,
                                       opens the new assignment, and writes an audit event. Used when a new
                                       patient is registered or the device is reassigned.
- `close_assignment(...)`            : ends the active assignment for a patient.
- `acknowledge_alert(...)`           : sets ACKNOWLEDGED + NOTIFIED, records who and when, writes an audit trail row.
- `resolve_alert(...)`               : sets RESOLVED with notes, records who and when. Does NOT require acknowledgment.
- `add_alert_note(...)`              : appends a note to the acknowledgment history without changing status.
- `update_threshold(...)`            : ADMIN ONLY. Updates one parameter's warning/critical limits.
- `update_setting(...)`              : ADMIN ONLY. Updates one key/value operational setting.
- `log_system_event(...)`            : internal helper for the audit log.

3. New Trigger
- `on_auth_user_created` on `auth.users` -> `handle_new_user()`.

4. Seed Data
- 4 threshold configurations (heart rate, SpO2, temperature, respiratory rate) flagged as demonstration values.
- 8 system settings (alert cooldown, stale windows, device offline window, simulation interval,
  escalation window, notification channel, remote notification toggle, device offline alerting).
- 2 devices: ESP32-001 (primary) and ESP32-002 (spare, initially unassigned to demonstrate warnings).
- 2 nurses for assignment.

5. Security
- Every function is SECURITY DEFINER with a pinned search_path and derives the actor from auth.uid().
- EXECUTE is revoked from PUBLIC and anon; clinical functions are granted to authenticated.
- Threshold and settings functions additionally require role = 'admin'.

6. Important notes
- Seeded thresholds are ILLUSTRATIVE demonstration values and require clinical review before any real use.
- Seed inserts are idempotent (ON CONFLICT DO NOTHING) so this migration is safe to re-run.
*/

-- ---------------------------------------------------------------------------
-- Signup trigger: create a profile for every new auth user
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_name text;
BEGIN
  -- The very first account becomes the administrator; everyone after is a nurse.
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE role = 'admin') THEN
    v_role := 'admin';
  ELSE
    v_role := 'nurse';
  END IF;

  v_name := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
    split_part(NEW.email, '@', 1)
  );

  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (NEW.id, NEW.email, v_name, v_role)
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------------
-- current_actor : who is calling?
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_actor()
RETURNS TABLE (actor_id uuid, actor_name text, actor_role text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.full_name, p.role
  FROM public.profiles p
  WHERE p.id = auth.uid();
$$;

REVOKE EXECUTE ON FUNCTION public.current_actor() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_actor() TO authenticated;

-- ---------------------------------------------------------------------------
-- log_system_event : internal audit helper
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_system_event(
  p_event_type text,
  p_message text,
  p_severity text DEFAULT 'INFO',
  p_patient_id uuid DEFAULT NULL,
  p_device_id uuid DEFAULT NULL,
  p_actor_id uuid DEFAULT NULL,
  p_actor_name text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.system_events
    (event_type, message, severity, patient_id, device_id, actor_id, actor_name, metadata)
  VALUES
    (p_event_type, p_message, p_severity, p_patient_id, p_device_id, p_actor_id, p_actor_name, COALESCE(p_metadata, '{}'::jsonb));
$$;

REVOKE EXECUTE ON FUNCTION public.log_system_event(text, text, text, uuid, uuid, uuid, text, jsonb) FROM PUBLIC, anon;

-- ---------------------------------------------------------------------------
-- open_assignment : register/reassign the active patient <-> device link
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.open_assignment(
  p_patient_id uuid,
  p_device_id uuid,
  p_nurse_id uuid DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor record;
  v_nurse_name text;
  v_assignment_id uuid;
  v_old record;
BEGIN
  SELECT * INTO v_actor FROM public.current_actor();
  IF v_actor.actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.patients WHERE id = p_patient_id) THEN
    RAISE EXCEPTION 'Patient not found';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.devices WHERE id = p_device_id) THEN
    RAISE EXCEPTION 'Device not found';
  END IF;

  SELECT full_name INTO v_nurse_name FROM public.nurses WHERE id = p_nurse_id;

  -- Close whatever was active on this device (this is the "device is moved to a new patient" case).
  FOR v_old IN
    SELECT da.id, da.patient_id, da.device_id
    FROM public.device_assignments da
    WHERE da.is_active AND (da.device_id = p_device_id OR da.patient_id = p_patient_id)
  LOOP
    UPDATE public.device_assignments
    SET is_active = false,
        ended_at = now(),
        ended_reason = COALESCE(p_reason, 'Reassigned')
    WHERE id = v_old.id;

    IF v_old.patient_id IS DISTINCT FROM p_patient_id THEN
      UPDATE public.patients
      SET monitoring_status = 'ENDED', is_active = false
      WHERE id = v_old.patient_id;
    END IF;
  END LOOP;

  INSERT INTO public.device_assignments
    (patient_id, device_id, nurse_id, nurse_name, created_by, created_by_name, is_active, started_at)
  VALUES
    (p_patient_id, p_device_id, p_nurse_id, v_nurse_name, v_actor.actor_id, v_actor.actor_name, true, now())
  RETURNING id INTO v_assignment_id;

  UPDATE public.patients
  SET is_active = false
  WHERE id <> p_patient_id AND is_active;

  UPDATE public.patients
  SET monitoring_status = 'MONITORING',
      is_active = true,
      assigned_nurse_name = COALESCE(v_nurse_name, assigned_nurse_name)
  WHERE id = p_patient_id;

  UPDATE public.devices d
  SET sensor_availability = d.sensor_availability,
      connection_status = CASE WHEN d.last_heartbeat IS NULL THEN 'DISCONNECTED' ELSE d.connection_status END
  WHERE d.id = p_device_id;

  PERFORM public.log_system_event(
    'ASSIGNMENT_OPENED',
    format('Device %s assigned to patient %s by %s',
      (SELECT device_id FROM public.devices WHERE id = p_device_id),
      (SELECT public_id FROM public.patients WHERE id = p_patient_id),
      v_actor.actor_name),
    'INFO',
    p_patient_id,
    p_device_id,
    v_actor.actor_id,
    v_actor.actor_name,
    jsonb_build_object('assignment_id', v_assignment_id, 'nurse_name', v_nurse_name, 'reason', p_reason)
  );

  RETURN v_assignment_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.open_assignment(uuid, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_assignment(uuid, uuid, uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- close_assignment : stop monitoring for a patient
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.close_assignment(
  p_patient_id uuid,
  p_reason text DEFAULT 'Monitoring ended'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor record;
BEGIN
  SELECT * INTO v_actor FROM public.current_actor();
  IF v_actor.actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.device_assignments
  SET is_active = false, ended_at = now(), ended_reason = p_reason
  WHERE patient_id = p_patient_id AND is_active;

  UPDATE public.patients
  SET monitoring_status = 'ENDED', is_active = false
  WHERE id = p_patient_id;

  PERFORM public.log_system_event(
    'ASSIGNMENT_CLOSED',
    format('Monitoring ended for patient %s: %s',
      (SELECT public_id FROM public.patients WHERE id = p_patient_id), p_reason),
    'INFO',
    p_patient_id,
    NULL,
    v_actor.actor_id,
    v_actor.actor_name,
    jsonb_build_object('reason', p_reason)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.close_assignment(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_assignment(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- acknowledge_alert
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.acknowledge_alert(
  p_alert_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS public.alerts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor record;
  v_alert public.alerts;
BEGIN
  SELECT * INTO v_actor FROM public.current_actor();
  IF v_actor.actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_alert FROM public.alerts WHERE id = p_alert_id FOR UPDATE;
  IF v_alert.id IS NULL THEN
    RAISE EXCEPTION 'Alert not found';
  END IF;
  IF v_alert.status = 'RESOLVED' THEN
    RAISE EXCEPTION 'Alert is already resolved';
  END IF;

  UPDATE public.alerts
  SET status = 'ACKNOWLEDGED',
      acknowledged_by = v_actor.actor_id,
      acknowledged_by_name = v_actor.actor_name,
      acknowledged_at = now(),
      assigned_nurse_name = COALESCE(assigned_nurse_name, v_actor.actor_name),
      notification_status = CASE
        WHEN notification_status IN ('CREATED','FAILED') THEN 'DISPATCHED'
        ELSE notification_status
      END,
      notified_at = COALESCE(notified_at, now())
  WHERE id = p_alert_id
  RETURNING * INTO v_alert;

  INSERT INTO public.alert_acknowledgments (alert_id, action, actor_id, actor_name, notes)
  VALUES (p_alert_id, 'ACKNOWLEDGED', v_actor.actor_id, v_actor.actor_name, p_notes);

  PERFORM public.log_system_event(
    'ALERT_ACKNOWLEDGED',
    format('%s acknowledged alert %s', v_actor.actor_name, v_alert.alert_code),
    'INFO',
    v_alert.patient_id,
    v_alert.device_id,
    v_actor.actor_id,
    v_actor.actor_name,
    jsonb_build_object('alert_id', p_alert_id, 'parameter', v_alert.parameter, 'severity', v_alert.severity)
  );

  RETURN v_alert;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.acknowledge_alert(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.acknowledge_alert(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- resolve_alert : closing an alert does NOT require prior acknowledgment
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_alert(
  p_alert_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS public.alerts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor record;
  v_alert public.alerts;
BEGIN
  SELECT * INTO v_actor FROM public.current_actor();
  IF v_actor.actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_alert FROM public.alerts WHERE id = p_alert_id FOR UPDATE;
  IF v_alert.id IS NULL THEN
    RAISE EXCEPTION 'Alert not found';
  END IF;
  IF v_alert.resolved_at IS NOT NULL THEN
    RAISE EXCEPTION 'Alert is already resolved';
  END IF;

  UPDATE public.alerts
  SET status = 'RESOLVED',
      resolved_by = v_actor.actor_id,
      resolved_by_name = v_actor.actor_name,
      resolved_at = now(),
      resolution_notes = p_notes,
      assigned_nurse_name = COALESCE(assigned_nurse_name, v_actor.actor_name)
  WHERE id = p_alert_id
  RETURNING * INTO v_alert;

  INSERT INTO public.alert_acknowledgments (alert_id, action, actor_id, actor_name, notes)
  VALUES (p_alert_id, 'RESOLVED', v_actor.actor_id, v_actor.actor_name, p_notes);

  PERFORM public.log_system_event(
    'ALERT_RESOLVED',
    format('%s resolved alert %s', v_actor.actor_name, v_alert.alert_code),
    'INFO',
    v_alert.patient_id,
    v_alert.device_id,
    v_actor.actor_id,
    v_actor.actor_name,
    jsonb_build_object('alert_id', p_alert_id, 'notes', p_notes)
  );

  RETURN v_alert;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.resolve_alert(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_alert(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- add_alert_note
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_alert_note(
  p_alert_id uuid,
  p_notes text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor record;
BEGIN
  SELECT * INTO v_actor FROM public.current_actor();
  IF v_actor.actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_notes IS NULL OR length(btrim(p_notes)) = 0 THEN
    RAISE EXCEPTION 'Note cannot be empty';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.alerts WHERE id = p_alert_id) THEN
    RAISE EXCEPTION 'Alert not found';
  END IF;

  INSERT INTO public.alert_acknowledgments (alert_id, action, actor_id, actor_name, notes)
  VALUES (p_alert_id, 'NOTE', v_actor.actor_id, v_actor.actor_name, btrim(p_notes));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.add_alert_note(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_alert_note(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- update_threshold : ADMIN ONLY
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_threshold(
  p_parameter text,
  p_warning_low numeric,
  p_warning_high numeric,
  p_critical_low numeric,
  p_critical_high numeric,
  p_enabled boolean DEFAULT true,
  p_persistence_samples int DEFAULT 1
)
RETURNS public.threshold_configurations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor record;
  v_row public.threshold_configurations;
BEGIN
  SELECT * INTO v_actor FROM public.current_actor();
  IF v_actor.actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF v_actor.actor_role <> 'admin' THEN
    RAISE EXCEPTION 'Administrator role required';
  END IF;

  IF p_critical_low IS NOT NULL AND p_warning_low IS NOT NULL AND p_critical_low > p_warning_low THEN
    RAISE EXCEPTION 'Critical low limit must not exceed the warning low limit';
  END IF;
  IF p_critical_high IS NOT NULL AND p_warning_high IS NOT NULL AND p_critical_high < p_warning_high THEN
    RAISE EXCEPTION 'Critical high limit must not be below the warning high limit';
  END IF;
  IF p_persistence_samples IS NULL OR p_persistence_samples < 1 OR p_persistence_samples > 30 THEN
    RAISE EXCEPTION 'Persistence must be between 1 and 30 samples';
  END IF;

  UPDATE public.threshold_configurations
  SET warning_low = p_warning_low,
      warning_high = p_warning_high,
      critical_low = p_critical_low,
      critical_high = p_critical_high,
      enabled = COALESCE(p_enabled, true),
      persistence_samples = p_persistence_samples,
      updated_by = v_actor.actor_id,
      updated_by_name = v_actor.actor_name,
      updated_at = now()
  WHERE parameter = p_parameter
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Unknown parameter';
  END IF;

  PERFORM public.log_system_event(
    'THRESHOLD_UPDATED',
    format('%s changed %s thresholds', v_actor.actor_name, p_parameter),
    'WARNING',
    NULL, NULL,
    v_actor.actor_id,
    v_actor.actor_name,
    jsonb_build_object(
      'parameter', p_parameter,
      'warning_low', p_warning_low, 'warning_high', p_warning_high,
      'critical_low', p_critical_low, 'critical_high', p_critical_high
    )
  );

  RETURN v_row;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_threshold(text, numeric, numeric, numeric, numeric, boolean, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_threshold(text, numeric, numeric, numeric, numeric, boolean, int) TO authenticated;

-- ---------------------------------------------------------------------------
-- update_setting : ADMIN ONLY
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_setting(
  p_key text,
  p_value jsonb
)
RETURNS public.system_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor record;
  v_row public.system_settings;
BEGIN
  SELECT * INTO v_actor FROM public.current_actor();
  IF v_actor.actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF v_actor.actor_role <> 'admin' THEN
    RAISE EXCEPTION 'Administrator role required';
  END IF;
  IF p_value IS NULL THEN
    RAISE EXCEPTION 'Setting value is required';
  END IF;

  UPDATE public.system_settings
  SET value = p_value, updated_by = v_actor.actor_id, updated_at = now()
  WHERE key = p_key
  RETURNING * INTO v_row;

  IF v_row.key IS NULL THEN
    RAISE EXCEPTION 'Unknown setting';
  END IF;

  PERFORM public.log_system_event(
    'SETTING_UPDATED',
    format('%s updated setting %s', v_actor.actor_name, p_key),
    'INFO',
    NULL, NULL,
    v_actor.actor_id,
    v_actor.actor_name,
    jsonb_build_object('key', p_key, 'value', p_value)
  );

  RETURN v_row;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_setting(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_setting(text, jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- Seed: threshold configurations (DEMONSTRATION VALUES - require clinical review)
-- ---------------------------------------------------------------------------
INSERT INTO public.threshold_configurations (parameter, display_name, unit, warning_low, warning_high, critical_low, critical_high, enabled, persistence_samples)
VALUES
  ('heart_rate',       'Heart Rate',        'BPM',             50, 110,  40, 140, true, 3),
  ('spo2',             'Blood Oxygen (SpO2)','%',               94, 100,  90, 100, true, 2),
  ('temperature',      'Body Temperature',  '°C',            36.0, 38.0, 35.0, 39.0, true, 2),
  ('respiratory_rate', 'Respiratory Rate',  'breaths/min',    10, 24,    8, 30, true, 3)
ON CONFLICT (parameter) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Seed: system settings
-- ---------------------------------------------------------------------------
INSERT INTO public.system_settings (key, value, description) VALUES
  ('alert_cooldown_seconds',      '300'::jsonb,  'Minimum seconds before the same parameter can raise another alert for the same patient.'),
  ('stale_reading_seconds',       '30'::jsonb,   'Readings older than this are shown as stale / outdated.'),
  ('device_offline_seconds',      '45'::jsonb,   'No heartbeat or reading for this long marks the device DISCONNECTED.'),
  ('simulation_interval_seconds', '3'::jsonb,    'How often the demonstration generator produces a new sample.'),
  ('escalation_seconds',          '120'::jsonb,  'An unacknowledged CRITICAL alert escalates after this many seconds.'),
  ('notification_channel',        '"in_dashboard"'::jsonb, 'Primary nurse notification channel.'),
  ('remote_notifications_enabled','false'::jsonb,'Whether an external notification provider is attempted in addition to the dashboard.'),
  ('device_alerting_enabled',     'true'::jsonb, 'Whether device disconnection raises a connectivity warning.')
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Seed: devices and nurses (names are demonstration placeholders)
-- ---------------------------------------------------------------------------
INSERT INTO public.devices (device_id, label, mqtt_topic, firmware_version)
VALUES
  ('ESP32-001', 'Primary bedside unit', 'carewatch/devices/ESP32-001/vitals', 'carewatch-1.0.0'),
  ('ESP32-002', 'Spare unit',           'carewatch/devices/ESP32-002/vitals', 'carewatch-1.0.0')
ON CONFLICT (device_id) DO NOTHING;

INSERT INTO public.nurses (full_name, employee_code, shift) VALUES
  ('Nurse A. Mensah', 'NUR-101', 'Day'),
  ('Nurse J. Okafor', 'NUR-102', 'Night')
ON CONFLICT (employee_code) DO NOTHING;
